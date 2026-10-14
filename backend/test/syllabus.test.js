const helpers = require('./helpers');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Syllabus = require('../models/Syllabus');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const aiService = require('../services/ai');
const workspaceService = require('../services/workspaceService');

let owner;
let auth;

beforeAll(async () => {
  await helpers.connectDb();
  owner = await helpers.createUser();
  auth = { Authorization: `Bearer ${helpers.tokenFor(owner)}` };
});
afterAll(helpers.disconnectDb);

const fields = (r) => r
  .field('courseName', 'Course')
  .field('programId', new mongoose.Types.ObjectId().toString());

describe('upload', () => {
  test('перейменований .txt як .pdf відхиляється за magic bytes', async () => {
    const res = await fields(request(app).post('/api/syllabus/upload').set(auth))
      .attach('syllabus', Buffer.from('просто текст'), 'fake.pdf');
    expect(res.status).toBe(400);
    expect(await Syllabus.countDocuments()).toBe(0);
  });

  test('.doc → 415', async () => {
    const res = await fields(request(app).post('/api/syllabus/upload').set(auth))
      .attach('syllabus', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), 'old.doc');
    expect(res.status).toBe(415);
    expect(res.body.message).toMatch(/\.doc/);
  });

  test('невідоме розширення → 400', async () => {
    const res = await fields(request(app).post('/api/syllabus/upload').set(auth))
      .attach('syllabus', Buffer.from('x'), 'a.exe');
    expect(res.status).toBe(400);
  });

  test('завеликий файл → 413', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5000, 'a')]);
    const res = await fields(request(app).post('/api/syllabus/upload').set(auth))
      .attach('syllabus', big, 'big.pdf');
    expect(res.status).toBe(413);
  });

  test('некоректний JSON → 400', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
  });
});

describe('analyze guard', () => {
  test.each(['analyzing', 'submitted'])('статус %s → 409', async (status) => {
    const s = await helpers.createSyllabus(owner, { status });
    const res = await request(app).post(`/api/syllabus/${s._id}/analyze`).set(auth);
    expect(res.status).toBe(409);
  });

  test('не власник (навіть адмін) → 403', async () => {
    const admin = await helpers.createUser({ role: 'admin' });
    const s = await helpers.createSyllabus(owner);
    const res = await request(app).post(`/api/syllabus/${s._id}/analyze`)
      .set('Authorization', `Bearer ${helpers.tokenFor(admin)}`);
    expect(res.status).toBe(403);
  });

  test('re-analyze скидає розмову і похідний стан', async () => {
    const spy = jest.spyOn(aiService, 'analyzeSyllabus').mockResolvedValue(true);
    const s = await helpers.createSyllabus(owner, { editedText: 'x', revisionMarkup: 'y' });
    const conv = await Conversation.create({ syllabusId: s._id, instructorId: owner._id });
    await Message.create({ conversationId: conv._id, role: 'ai', content: 'hi' });

    const res = await request(app).post(`/api/syllabus/${s._id}/analyze`).set(auth);
    expect(res.status).toBe(200);
    const fresh = await Syllabus.findById(s._id);
    expect(fresh.editedText).toBeUndefined();
    expect(fresh.revisionMarkup).toBeUndefined();
    expect(fresh.analysisStartedAt).toBeDefined();
    expect(await Conversation.countDocuments({ syllabusId: s._id })).toBe(0);
    expect(await Message.countDocuments({ conversationId: conv._id })).toBe(0);
    spy.mockRestore();
  });

  test('некоректний id → 400', async () => {
    const res = await request(app).post('/api/syllabus/not-an-id/analyze').set(auth);
    expect(res.status).toBe(400);
  });
});

describe('чат', () => {
  test('getConversationView повертає найновіші повідомлення за зростанням', async () => {
    const s = await helpers.createSyllabus(owner);
    const conv = await Conversation.create({ syllabusId: s._id, instructorId: owner._id });
    const base = Date.now();
    await Message.insertMany(Array.from({ length: 250 }, (_, i) => ({
      conversationId: conv._id, role: 'ai', content: `m${i + 1}`, createdAt: new Date(base + i * 1000),
    })));
    const view = await workspaceService.getConversationView(s._id);
    expect(view.messages).toHaveLength(200);
    expect(view.messages[0].content).toBe('m51');
    expect(view.messages[199].content).toBe('m250');
  });

  test('подвійний submit: другий отримує 409', async () => {
    const Program = require('../models/Program');
    const program = await Program.create({ name: 'P', code: 'PX' });
    const s = await helpers.createSyllabus(owner, { programId: program._id });
    await Conversation.create({ syllabusId: s._id, instructorId: owner._id });
    const render = jest.spyOn(aiService, 'renderFinalSyllabusPdf').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return '/tmp/none.pdf';
    });
    jest.spyOn(aiService, 'generateSubmissionReport').mockReturnValue('report');

    const send = () => request(app).post(`/api/chat/${s._id}/submit`).set(auth);
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(render).toHaveBeenCalledTimes(1);
    expect((await Syllabus.findById(s._id)).status).toBe('submitted');

    const third = await send();
    expect(third.status).toBe(409);
    jest.restoreAllMocks();
  });
});

describe('кабінет', () => {
  test('/syllabi: проєкція без текстів, limit обмежений, поганий id → 400', async () => {
    await helpers.createSyllabus(owner, {
      recommendations: [{ id: 'r1', category: 'other', title: 't', priority: 'high' }],
    });
    const res = await request(app).get('/api/cabinet/syllabi?limit=100000').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.syllabi.length).toBeGreaterThan(0);
    const item = res.body.syllabi[0];
    expect(item.extractedText).toBeUndefined();
    expect(item.recommendations).toBeUndefined();
    expect(item.issueCounts.open).toBe(1);

    const bad = await request(app).get('/api/cabinet/syllabi?program=zzz').set(auth);
    expect(bad.status).toBe(400);
  });

  test('видалення програми з силабусами → 409', async () => {
    const admin = await helpers.createUser({ role: 'admin' });
    const Program = require('../models/Program');
    const program = await Program.create({ name: 'Used', code: 'USED' });
    await helpers.createSyllabus(owner, { programId: program._id });
    const res = await request(app).delete(`/api/cabinet/programs/${program._id}`)
      .set('Authorization', `Bearer ${helpers.tokenFor(admin)}`);
    expect(res.status).toBe(409);
  });
});
