// Чат v4: пропозиції, рішення, outputs, submit. Пайплайн review, OpenAI і пошта замокані.
process.env.GMAIL_USER = 'robot@example.com';
process.env.GMAIL_PASS = 'secret';

const mockSendMail = jest.fn(async () => ({ messageId: 'test-message' }));
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: mockSendMail })) }));
jest.mock('../services/ai/review', () => ({
  runReview: jest.fn(),
  generateSuggestion: jest.fn(),
  PROMPT_VERSION: 'test-v1',
}));
jest.mock('../services/ai/client', () => {
  const actual = jest.requireActual('../services/ai/client');
  return { ...actual, createResponse: jest.fn() };
});

const helpers = require('./helpers');

process.env.MAX_FILE_SIZE = String(10 * 1024 * 1024);
const request = require('supertest');
const JSZip = require('jszip');
const app = require('../server');
const review = require('../services/ai/review');
const client = require('../services/ai/client');
const Syllabus = require('../models/Syllabus');
const Suggestion = require('../models/Suggestion');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Program = require('../models/Program');
const { extractDocx, isConverterAvailable } = require('../services/document');
const { computeReadiness } = require('../services/chat/readiness');
const { deleteSyllabiCascade } = require('../services/syllabusCleanup');

const { replaceOp } = helpers;
const B4 = 'Курс триває 10 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.';

let owner;
let admin;
let stranger;
let program;
const created = [];

const authOf = (user) => ({ Authorization: `Bearer ${helpers.tokenFor(user)}` });
const api = (s) => `/api/chat/${s._id}`;

async function docSyllabus(extra = {}) {
  const s = await helpers.createDocSyllabus(owner, { programId: program._id, ...extra });
  created.push(s._id);
  return s;
}

/** Відповідь binary-запиту supertest як Buffer. */
function binary(req) {
  return req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
}

async function documentXml(buffer) {
  return (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string');
}

async function blockText(buffer, blockId) {
  return (await extractDocx(buffer)).blocks.find((b) => b.id === blockId)?.text;
}

async function start(s, user = owner) {
  const res = await request(app).post(`${api(s)}/start`).set(authOf(user));
  if (res.status !== 200) console.log(res.body);
  expect(res.status).toBe(200);
  return res.body;
}

const post = (s, path, body = {}, user = owner) => request(app).post(`${api(s)}${path}`).set(authOf(user)).send(body);

beforeAll(async () => {
  await helpers.connectDb();
  owner = await helpers.createUser();
  admin = await helpers.createUser({ role: 'admin' });
  stranger = await helpers.createUser();
  program = await Program.create({ name: 'MBA test', code: 'MBAT', academicDirectorEmail: 'ad@example.com' });
});

afterAll(async () => {
  await deleteSyllabiCascade({ _id: { $in: created } });
  await helpers.disconnectDb();
});

beforeEach(() => {
  review.runReview.mockReset();
  review.generateSuggestion.mockReset();
  client.createResponse.mockReset();
  mockSendMail.mockClear();
});

// ---------------------------------------------------------------------------

describe('readiness', () => {
  test('resolved = accepted + rejected, ваги груп, порожня група = 100', () => {
    const r = computeReadiness([
      { group: 'template', status: 'accepted' },
      { group: 'template', status: 'pending' },
      { group: 'outcomes', status: 'rejected' },
      { group: 'policy', status: 'pending' },
    ]);
    expect(r.breakdown).toEqual({ template: 50, outcomes: 100, assessment: 100, practice: 100, policy: 0 });
    expect(r.score).toBe(Math.round(0.3 * 50 + 0.25 * 100 + 0.2 * 100 + 0.1 * 100));
    expect(r.counts).toEqual({ pending: 2, accepted: 1, rejected: 1, total: 4 });
    expect(computeReadiness([]).score).toBe(100);
  });
});

describe('upload і аналіз', () => {
  const fields = (r) => r.field('courseName', 'Стратегічний менеджмент').field('programId', String(program._id));

  async function waitAnalysis(id) {
    for (let i = 0; i < 200; i += 1) {
      const res = await request(app).get(`/api/syllabus/${id}/status`).set(authOf(owner));
      if (res.body.status !== 'analyzing') return res.body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('analysis did not finish');
  }

  test('docx: документ збережено, пропозиції створено і впорядковано, збій generateSuggestion → порада', async () => {
    review.runReview.mockImplementation(async ({ blocks }) => {
      expect(blocks.length).toBe(30);
      return {
        findings: [
          { id: 'f-low', criterionId: 'PO-1', group: 'policy', severity: 'critical', confidence: 0.5, claim: 'Немає AI-політики', rationale: 'r', evidenceBlockIds: ['b0030'], promptVersion: 'test-v1' },
          { id: 'f-top', criterionId: 'T-2', group: 'template', severity: 'high', confidence: 0.9, claim: 'Немає пререквізитів', rationale: 'r', evidenceBlockIds: ['b0004'], promptVersion: 'test-v1' },
        ],
        rubricSummary: { counts: { ok: 20, issue: 2, not_applicable: 1 }, verdicts: [] },
        stats: { llmCalls: 7 },
      };
    });
    review.generateSuggestion.mockImplementation(async ({ finding, validateOps }) => {
      if (finding.id === 'f-low') throw new Error('LLM down');
      expect(validateOps([{ id: 'b0004', text: 'x' }], [replaceOp('b9999', 'y')])[0]).toMatch(/UNKNOWN_BLOCK/);
      return { findingId: finding.id, kind: 'edit', title: 'Додати пререквізити', description: 'Опис', rationale: 'Пояснення', ops: [replaceOp('b0004', `${B4} Пререквізити: немає.`)] };
    });

    const res = await fields(request(app).post('/api/syllabus/upload').set(authOf(owner)))
      .attach('syllabus', helpers.FIXTURE_DOCX);
    expect(res.status).toBe(201);
    created.push(res.body.syllabusId);
    const status = await waitAnalysis(res.body.syllabusId);
    expect(status).toEqual({ status: 'in_progress', stage: 'done', error: null });

    const s = await Syllabus.findById(res.body.syllabusId).lean();
    expect(s.sourceFormat).toBe('docx');
    expect(s.document.blocks).toHaveLength(30);
    expect(s.document.convertedFrom).toBeNull();
    expect(s.workingFile.path).toBe(s.originalFile.path);
    expect(s.rubricSummary.counts.ok).toBe(20);
    const suggestions = await Suggestion.find({ syllabusId: s._id }).sort({ order: 1 }).lean();
    expect(suggestions.map((x) => [x.findingId, x.order, x.applicable])).toEqual([['f-top', 0, true], ['f-low', 1, false]]);
    expect(suggestions[1].ops).toEqual([]);
    expect(suggestions[1].title).toBe('Немає AI-політики');
    expect(suggestions[0].docVersion).toBe(s.document.docVersion);

    const get = await request(app).get(`/api/syllabus/${s._id}`).set(authOf(owner));
    expect(get.body.outputs).toBeUndefined();
    expect(get.body.originalFile.path).toBeUndefined();
  });

  test('pdf: синтезований DOCX, convertedFrom=pdf', async () => {
    review.runReview.mockResolvedValue({ findings: [], rubricSummary: {}, stats: {} });
    const res = await fields(request(app).post('/api/syllabus/upload').set(authOf(owner)))
      .attach('syllabus', `${__dirname}/fixtures/pdf/syllabus-text.pdf`);
    expect(res.status).toBe(201);
    created.push(res.body.syllabusId);
    expect((await waitAnalysis(res.body.syllabusId)).status).toBe('in_progress');
    const s = await Syllabus.findById(res.body.syllabusId).lean();
    expect(s.sourceFormat).toBe('pdf');
    expect(s.document.convertedFrom).toBe('pdf');
    expect(s.workingFile.path).toMatch(/\.working\.docx$/);
    // pdf.js-екстрактор зливає абзац за геометрією, тож B4 — початок блоку
    expect(s.document.blocks.some((b) => b.text.startsWith(B4))).toBe(true);
    expect(s.document.sourceBlocks).toHaveLength(s.document.blocks.length);
  });

  const withSoffice = isConverterAvailable() ? test : test.skip;
  withSoffice('doc: конвертація LibreOffice, convertedFrom=doc', async () => {
    review.runReview.mockResolvedValue({ findings: [], rubricSummary: {}, stats: {} });
    const res = await fields(request(app).post('/api/syllabus/upload').set(authOf(owner)))
      .attach('syllabus', `${__dirname}/fixtures/docx/legacy.doc`);
    expect(res.status).toBe(201);
    created.push(res.body.syllabusId);
    expect((await waitAnalysis(res.body.syllabusId)).status).toBe('in_progress');
    const s = await Syllabus.findById(res.body.syllabusId).lean();
    expect(s.sourceFormat).toBe('doc');
    expect(s.document.convertedFrom).toBe('doc');
    expect(s.document.blocks.length).toBeGreaterThan(0);
  }, 60000);

  test('збій runReview → status error з українським повідомленням', async () => {
    review.runReview.mockRejectedValue(new Error('boom'));
    const res = await fields(request(app).post('/api/syllabus/upload').set(authOf(owner)))
      .attach('syllabus', helpers.FIXTURE_DOCX);
    created.push(res.body.syllabusId);
    const status = await waitAnalysis(res.body.syllabusId);
    expect(status.status).toBe('error');
    expect(status.error).toMatch(/Не вдалося проаналізувати/);
  });
});

describe('start, доступи, next-card', () => {
  test('до start: conversation і readiness null; start → привітання з лічильниками і перша картка', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { severity: 'critical', title: 'A', ops: [replaceOp('b0004', `${B4} A.`)] });
    await helpers.createSuggestion(s, { severity: 'low', title: 'B', ops: [replaceOp('b0030', 'Академічна доброчесність: плагіат заборонено.')] });

    const before = await request(app).get(api(s)).set(authOf(owner));
    expect(before.status).toBe(200);
    expect(before.body.conversation).toBeNull();
    expect(before.body.readiness).toBeNull();
    expect(before.body.suggestions).toHaveLength(2);
    const { getCriterion } = require('../services/ai/rubric');
    expect(before.body.suggestions[0].criterionTitle).toBe(getCriterion('T-1').titleUk);
    expect(before.body.syllabus).toMatchObject({ sourceFormat: 'docx', convertedFrom: null, legacy: false, canMutate: true });

    const view = await start(s);
    expect(view.messages[0].content).toMatch(/Пропозицій: 2 \(критичних: 1, незначних: 1\)/);
    const card = view.messages[1];
    expect(card.kind).toBe('suggestion');
    expect(card.relatedSuggestionId).toBe(String(a._id));
    expect(view.readiness.counts).toEqual({ pending: 2, accepted: 0, rejected: 0, total: 2 });

    // повторний start не дублює картку
    const again = await start(s);
    expect(again.messages).toHaveLength(2);
  });

  test('admin читає (canMutate=false), але не змінює; чужий викладач — 403', async () => {
    const s = await docSyllabus();
    const sug = await helpers.createSuggestion(s, { ops: [replaceOp('b0004', `${B4} X.`)] });
    const adminView = await request(app).get(api(s)).set(authOf(admin));
    expect(adminView.status).toBe(200);
    expect(adminView.body.syllabus.canMutate).toBe(false);
    expect((await post(s, `/suggestions/${sug._id}/accept`, {}, admin)).status).toBe(403);
    expect((await post(s, '/start', {}, admin)).status).toBe(403);
    expect((await request(app).get(api(s)).set(authOf(stranger))).status).toBe(403);
    expect((await request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(stranger))).status).toBe(403);
    expect((await request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(admin))).status).toBe(200);
  });

  test('після рішень — наступна картка, у кінці submission-cta; reopen повертає картку без видалення повідомлень', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'A', ops: [replaceOp('b0004', `${B4} A.`)] });
    const b = await helpers.createSuggestion(s, { title: 'B', ops: [replaceOp('b0030', 'Академічна доброчесність: плагіат заборонено.')] });
    await start(s);

    let res = await post(s, `/suggestions/${a._id}/accept`);
    expect(res.status).toBe(200);
    let last = res.body.messages[res.body.messages.length - 1];
    expect(last).toMatchObject({ kind: 'suggestion', relatedSuggestionId: String(b._id) });
    expect(res.body.conversation.currentSuggestionId).toBe(String(b._id));

    res = await post(s, `/suggestions/${b._id}/reject`, { rejectTag: 'too_generic' });
    expect(res.status).toBe(200);
    last = res.body.messages[res.body.messages.length - 1];
    expect(last.kind).toBe('submission-cta');
    expect(res.body.readiness.counts).toEqual({ pending: 0, accepted: 1, rejected: 1, total: 2 });
    expect(res.body.readiness.score).toBe(100);
    const count = res.body.messages.length;

    res = await post(s, `/suggestions/${a._id}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBeGreaterThan(count);
    last = res.body.messages[res.body.messages.length - 1];
    expect(last).toMatchObject({ kind: 'suggestion', relatedSuggestionId: String(a._id) });
    const views = Object.fromEntries(res.body.suggestions.map((v) => [v.title, v]));
    expect(views.A.status).toBe('pending');
    expect(views.B.status).toBe('rejected'); // без каскаду
    expect(views.B.rejectTag).toBe('too_generic');
  });
});

describe('accept, outputs, конфлікти', () => {
  test('accept → tracked.docx з w:ins, clean.docx зі зміненим текстом; кеш до наступного рішення', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'A', ops: [replaceOp('b0004', 'Курс триває 12 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    await helpers.createSuggestion(s, { title: 'B', ops: [replaceOp('b0030', 'Академічна доброчесність: плагіат заборонено.')] });
    await start(s);

    const pre = await request(app).get(`${api(s)}/suggestions/${a._id}/preview`).set(authOf(owner));
    expect(pre.status).toBe(200);
    expect(pre.body.changes).toEqual([expect.objectContaining({
      blockId: 'b0004', op: 'replaceBlock', kind: 'paragraph', before: B4,
      parts: expect.arrayContaining([{ type: 'del', text: '10' }, { type: 'ins', text: '12' }]),
    })]);

    expect((await post(s, `/suggestions/${a._id}/accept`)).status).toBe(200);

    const tracked = await binary(request(app).get(`${api(s)}/outputs/tracked.docx`).set(authOf(owner)));
    expect(tracked.status).toBe(200);
    expect(tracked.headers['content-disposition']).toMatch(/syllabus_tracked\.docx/);
    const xml = await documentXml(tracked.body);
    expect(xml).toMatch(/<w:ins /);
    expect(xml).toMatch(/KSE Syllabus Analyzer/);

    const clean = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect(clean.status).toBe(200);
    expect(await blockText(clean.body, 'b0004')).toMatch(/^Курс триває 12 тижнів/);

    const cached = (await Syllabus.findById(s._id).lean()).outputs.clean;
    await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect((await Syllabus.findById(s._id).lean()).outputs.clean.generatedAt).toEqual(cached.generatedAt);

    // будь-яке рішення інвалідовує кеш
    await post(s, `/suggestions/${a._id}/reopen`);
    expect((await Syllabus.findById(s._id).lean()).outputs).toBeUndefined();
    const reverted = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect(await blockText(reverted.body, 'b0004')).toBe(B4);

    expect((await request(app).get(`${api(s)}/outputs/other.txt`).set(authOf(owner))).status).toBe(404);
  });

  test('конфлікт → 409 SUGGESTION_CONFLICT; replacePrevious відхиляє попередню', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'A', ops: [replaceOp('b0004', 'Курс триває 12 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    const b = await helpers.createSuggestion(s, { title: 'B', ops: [replaceOp('b0004', 'Курс триває 8 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    await start(s);
    let res = await post(s, `/suggestions/${a._id}/accept`);
    const viewB = res.body.suggestions.find((v) => v.id === String(b._id));
    expect(viewB.conflictsWith).toEqual([{ suggestionId: String(a._id), title: 'A' }]);

    res = await post(s, `/suggestions/${b._id}/accept`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'SUGGESTION_CONFLICT', conflicts: [{ suggestionId: String(a._id), title: 'A' }] });
    expect((await Suggestion.findById(b._id)).status).toBe('pending');

    res = await post(s, `/suggestions/${b._id}/accept`, { conflictResolution: 'replacePrevious' });
    expect(res.status).toBe(200);
    const fa = await Suggestion.findById(a._id);
    expect(fa.status).toBe('rejected');
    expect(fa.rejectTag).toBe('other');
    expect(fa.decisionReason).toBe('Замінено пропозицією «B»');
    expect((await Suggestion.findById(b._id)).status).toBe('accepted');

    const clean = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect(await blockText(clean.body, 'b0004')).toMatch(/^Курс триває 8 тижнів/);
  });

  test('неперетинні правки одного блоку зливаються без конфлікту', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { ops: [replaceOp('b0004', 'Курс триває 12 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    const b = await helpers.createSuggestion(s, { ops: [replaceOp('b0004', 'Курс триває 10 тижнів і завершується усним іспитом. Викладач: доц. Іваненко.')] });
    await start(s);
    expect((await post(s, `/suggestions/${a._id}/accept`)).status).toBe(200);
    expect((await post(s, `/suggestions/${b._id}/accept`)).status).toBe(200);
    const clean = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect(await blockText(clean.body, 'b0004')).toBe('Курс триває 12 тижнів і завершується усним іспитом. Викладач: доц. Іваненко.');
  });

  test('choice: потрібен optionId, варіант без ops → 409, прийнятий варіант іде у файл', async () => {
    const s = await docSyllabus();
    const c = await helpers.createSuggestion(s, {
      kind: 'choice',
      group: 'policy',
      title: 'AI-політика',
      options: [
        { id: 'strict', label: 'Сувора', rationale: 'r1', ops: [{ op: 'insertAfter', blockId: 'b0030', newBlocks: [{ kind: 'paragraph', text: 'Use of AI tools is not allowed.' }] }] },
        { id: 'custom', label: 'Своя', rationale: 'потрібні деталі', ops: [] },
      ],
    });
    await start(s);
    const pre = await request(app).get(`${api(s)}/suggestions/${c._id}/preview?optionId=strict`).set(authOf(owner));
    expect(pre.body.changes).toEqual([expect.objectContaining({ blockId: 'b0030', op: 'insertAfter', before: '', after: 'Use of AI tools is not allowed.' })]);

    expect((await post(s, `/suggestions/${c._id}/accept`)).status).toBe(400);
    expect((await post(s, `/suggestions/${c._id}/accept`, { optionId: 'nope' })).status).toBe(400);
    expect((await post(s, `/suggestions/${c._id}/accept`, { optionId: 'custom' })).body.code).toBe('NOT_APPLICABLE');
    const res = await post(s, `/suggestions/${c._id}/accept`, { optionId: 'strict' });
    expect(res.status).toBe(200);
    const v = res.body.suggestions[0];
    expect(v.selectedOptionId).toBe('strict');
    expect(v.options.map((o) => o.applicable)).toEqual([true, false]);

    const clean = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    const texts = (await extractDocx(clean.body)).blocks.map((b) => b.text);
    expect(texts[texts.length - 1]).toBe('Use of AI tools is not allowed.');
  });

  test('порада (applicable:false): accept → accepted без змін документа', async () => {
    const s = await docSyllabus();
    const adv = await helpers.createSuggestion(s, { applicable: false, ops: [] });
    await start(s);
    const res = await post(s, `/suggestions/${adv._id}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0].status).toBe('accepted');
    const clean = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect(clean.status).toBe(200);
    expect(await blockText(clean.body, 'b0004')).toBe(B4);
  });

  test('document/preview: зміни, видалення, вставки на своїх місцях', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, {
      ops: [
        replaceOp('b0004', 'Курс триває 12 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.'),
        { op: 'deleteBlock', blockId: 'b0005' },
        { op: 'insertAfter', blockId: 'b0005', newBlocks: [{ kind: 'paragraph', text: 'Нові матеріали.' }] },
      ],
    });
    await start(s);
    await post(s, `/suggestions/${a._id}/accept`);
    const res = await request(app).get(`${api(s)}/document/preview`).set(authOf(owner));
    expect(res.status).toBe(200);
    const blocks = res.body.blocks;
    expect(blocks.slice(3, 6).map((b) => [b.blockId, b.status])).toEqual([['b0004', 'changed'], ['b0005', 'deleted'], [expect.stringMatching(/^b0005\+/), 'inserted']]);
    expect(blocks[3].parts).toEqual(expect.arrayContaining([{ type: 'del', text: '10' }, { type: 'ins', text: '12' }]));
    expect(blocks.filter((b) => b.status === 'unchanged')).toHaveLength(28);
  });

  test('застаріла docVersion → 409 STALE_DOC_VERSION; некоректні ops → 422', async () => {
    const s = await docSyllabus();
    const stale = await helpers.createSuggestion(s, { docVersion: 'other', ops: [replaceOp('b0004', 'x')] });
    const bad = await helpers.createSuggestion(s, { ops: [replaceOp('b0029', 'read only')] });
    await start(s);
    expect((await post(s, `/suggestions/${stale._id}/accept`)).body.code).toBe('STALE_DOC_VERSION');
    const res = await post(s, `/suggestions/${bad._id}/accept`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_OPS');
  });
});

describe('reject і reopen', () => {
  test('critical/high без причини → 400; з причиною і тегом — rejected; low без причини — ок', async () => {
    const s = await docSyllabus();
    const high = await helpers.createSuggestion(s, { severity: 'high', ops: [replaceOp('b0004', 'x')] });
    const low = await helpers.createSuggestion(s, { severity: 'low', ops: [replaceOp('b0030', 'y')] });
    await start(s);
    let res = await post(s, `/suggestions/${high._id}/reject`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
    expect((await post(s, `/suggestions/${high._id}/reject`, { reason: 'x', rejectTag: 'bad' })).status).toBe(400);
    res = await post(s, `/suggestions/${high._id}/reject`, { reason: 'Вже описано в розділі 4', rejectTag: 'already_present' });
    expect(res.status).toBe(200);
    const v = res.body.suggestions.find((x) => x.id === String(high._id));
    expect(v).toMatchObject({ status: 'rejected', decisionReason: 'Вже описано в розділі 4', rejectTag: 'already_present', requiresReason: true });
    expect((await post(s, `/suggestions/${low._id}/reject`)).status).toBe(200);
    // повторне рішення над розглянутою → 409
    expect((await post(s, `/suggestions/${low._id}/reject`)).status).toBe(409);
    const history = (await Suggestion.findById(high._id)).decisionHistory;
    expect(history.map((h) => h.action)).toEqual(['rejected']);
  });

  test('reopen pending → 409; після submit → 409', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { ops: [replaceOp('b0004', 'x')] });
    await start(s);
    expect((await post(s, `/suggestions/${a._id}/reopen`)).status).toBe(409);
    await post(s, `/suggestions/${a._id}/accept`);
    await Syllabus.updateOne({ _id: s._id }, { status: 'submitted' });
    const res = await post(s, `/suggestions/${a._id}/reopen`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SUBMITTED');
  });
});

describe('refine, answer, вільний чат', () => {
  test('refine: новий варіант, попередній у versions', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'A', ops: [replaceOp('b0004', `${B4} Довгий текст.`)] });
    await start(s);
    review.generateSuggestion.mockResolvedValue({ kind: 'edit', title: 'A коротше', description: 'd', rationale: 'r', ops: [replaceOp('b0004', `${B4} Коротко.`)] });
    expect((await post(s, `/suggestions/${a._id}/refine`)).status).toBe(400);
    const res = await post(s, `/suggestions/${a._id}/refine`, { feedback: 'коротше' });
    expect(res.status).toBe(200);
    const args = review.generateSuggestion.mock.calls[0][0];
    expect(args.feedback).toMatch(/коротше/);
    expect(args.finding.id).toBeDefined();
    const fresh = await Suggestion.findById(a._id);
    expect(fresh.title).toBe('A коротше');
    expect(fresh.versions).toHaveLength(1);
    expect(fresh.versions[0].ops[0].newText).toMatch(/Довгий текст/);
    expect(res.body.suggestions[0].versionsCount).toBe(1);
    expect(res.body.messages[res.body.messages.length - 1]).toMatchObject({ kind: 'suggestion', relatedSuggestionId: String(a._id) });
  });

  test('refine mergeWithAccepted: поточний текст прийнятої правки в контексті, supersedes, accept без конфлікту', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'A', ops: [replaceOp('b0004', 'Курс триває 12 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    const b = await helpers.createSuggestion(s, { title: 'B', ops: [replaceOp('b0004', 'Курс триває 8 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    await start(s);
    await post(s, `/suggestions/${a._id}/accept`);
    const merged = 'Курс триває 12 тижнів (8 аудиторних) і завершується письмовим іспитом. Викладач: доц. Іваненко.';
    review.generateSuggestion.mockImplementation(async ({ blocks, feedback }) => {
      expect(blocks.find((x) => x.id === 'b0004').text).toMatch(/12 тижнів/);
      expect(feedback).toMatch(/current accepted text/);
      return { kind: 'edit', title: 'B (обʼєднано)', description: 'd', rationale: 'r', ops: [replaceOp('b0004', merged)] };
    });
    let res = await post(s, `/suggestions/${b._id}/refine`, { mergeWithAccepted: true });
    expect(res.status).toBe(200);
    const vb = res.body.suggestions.find((v) => v.id === String(b._id));
    expect(vb.supersedes).toEqual([String(a._id)]);
    expect(vb.conflictsWith).toEqual([]);
    res = await post(s, `/suggestions/${b._id}/accept`);
    expect(res.status).toBe(200);
    expect((await Suggestion.findById(a._id)).status).toBe('accepted');
    const clean = await binary(request(app).get(`${api(s)}/outputs/clean.docx`).set(authOf(owner)));
    expect(await blockText(clean.body, 'b0004')).toBe(merged);
  });

  test('question: accept → 409, answer → та сама Suggestion стає edit, питання і відповідь у versions', async () => {
    const s = await docSyllabus();
    const q = await helpers.createSuggestion(s, { kind: 'question', question: 'Які ваги компонентів оцінювання?', ops: [] });
    await start(s);
    expect((await post(s, `/suggestions/${q._id}/accept`)).body.code).toBe('ANSWER_REQUIRED');
    review.generateSuggestion.mockResolvedValue({ kind: 'edit', title: 'Ваги', description: 'd', rationale: 'r', ops: [{ op: 'insertAfter', blockId: 'b0028', newBlocks: [{ kind: 'paragraph', text: 'Exam 40%, project 60%.' }] }] });
    const res = await post(s, `/suggestions/${q._id}/answer`, { answer: 'Іспит 40%, проєкт 60%' });
    expect(res.status).toBe(200);
    expect(review.generateSuggestion.mock.calls[0][0].feedback).toMatch(/Іспит 40%/);
    const v = res.body.suggestions[0];
    expect(v.kind).toBe('edit');
    expect(v.changes[0]).toMatchObject({ op: 'insertAfter', blockId: 'b0028', after: 'Exam 40%, project 60%.' });
    const fresh = await Suggestion.findById(q._id);
    expect(fresh.versions[0]).toMatchObject({ kind: 'question', question: 'Які ваги компонентів оцінювання?', answer: 'Іспит 40%, проєкт 60%' });
    expect((await post(s, `/suggestions/${q._id}/accept`)).status).toBe(200);
  });

  test('збій LLM у refine → 503 retryable і лічильник збоїв', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { ops: [replaceOp('b0004', 'x')] });
    await start(s);
    review.generateSuggestion.mockRejectedValue(new Error('timeout'));
    const res = await post(s, `/suggestions/${a._id}/refine`, { feedback: 'інакше' });
    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);
    expect((await Conversation.findOne({ syllabusId: s._id })).consecutiveAiFailures).toBe(1);
    expect((await Suggestion.findById(a._id)).versions).toHaveLength(0);
  });

  test('message: питання → відповідь AI з контекстом картки; прохання змінити → refine', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'Пререквізити', ops: [replaceOp('b0004', `${B4} Пререквізити: немає.`)] });
    await start(s);

    client.createResponse
      .mockResolvedValueOnce({ output_text: '{"intent":"question"}' })
      .mockResolvedValueOnce({ output_text: 'Пререквізити допомагають студентам підготуватися.' });
    let res = await post(s, '/message', { text: 'Навіщо це?' });
    expect(res.status).toBe(200);
    const classifyReq = client.createResponse.mock.calls[0][0];
    expect(classifyReq.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(client.createResponse.mock.calls[1][0].input[1].content).toMatch(/Пререквізити: немає/);
    const msgs = res.body.messages;
    expect(msgs[msgs.length - 1]).toMatchObject({ role: 'ai', kind: 'text', content: 'Пререквізити допомагають студентам підготуватися.' });

    client.createResponse.mockResolvedValueOnce({ output_text: '{"intent":"refine"}' });
    review.generateSuggestion.mockResolvedValue({ kind: 'edit', title: 'Пререквізити (коротко)', description: 'd', rationale: 'r', ops: [replaceOp('b0004', `${B4} Без пререквізитів.`)] });
    res = await post(s, '/message', { text: 'зроби коротше' });
    expect(res.status).toBe(200);
    expect(review.generateSuggestion.mock.calls[0][0].feedback).toMatch(/зроби коротше/);
    expect((await Suggestion.findById(a._id)).versions).toHaveLength(1);
    expect(res.body.messages.filter((m) => m.content === 'зроби коротше')).toHaveLength(1);
  });
});

describe('submit', () => {
  test('gate pending → 409 зі списком; лист з tracked.docx і tracked.pdf; повторний submit → 409', async () => {
    const s = await docSyllabus();
    const a = await helpers.createSuggestion(s, { title: 'Тижні', severity: 'high', ops: [replaceOp('b0004', 'Курс триває 12 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.')] });
    const b = await helpers.createSuggestion(s, { title: 'Доброчесність', group: 'policy', ops: [replaceOp('b0030', 'Академічна доброчесність: плагіат заборонено.')] });
    await start(s);
    let res = await post(s, '/submit');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PENDING_SUGGESTIONS');
    expect(res.body.pending.map((p) => p.title)).toEqual(['Тижні', 'Доброчесність']);
    expect((await Syllabus.findById(s._id)).submitting).toBe(false);

    await post(s, `/suggestions/${a._id}/accept`);
    await post(s, `/suggestions/${b._id}/reject`, { rejectTag: 'not_relevant', reason: 'Не для цього курсу' });

    const send = () => post(s, '/submit');
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const ok = results.find((r) => r.status === 200).body;
    expect(ok.submitted).toBe(true);
    expect(ok.syllabus).toMatchObject({ status: 'submitted', submissionEmailStatus: 'sent', canMutate: false });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('ad@example.com');
    const names = mail.attachments.map((x) => x.filename);
    expect(names[0]).toBe('syllabus_tracked.docx');
    if (isConverterAvailable()) expect(names).toEqual(['syllabus_tracked.docx', 'syllabus_tracked.pdf']);
    expect(await documentXml(mail.attachments[0].content)).toMatch(/<w:ins /);
    expect(mail.html).toMatch(/Прийняті пропозиції/);
    expect(mail.html).toMatch(/не стосується курсу/);
    expect(mail.html).toMatch(/Не для цього курсу/);

    expect((await send()).status).toBe(409);
    // outputs доступні й після submit
    expect((await request(app).get(`${api(s)}/outputs/tracked.docx`).set(authOf(owner))).status).toBe(200);
    // рішення після submit заборонені
    expect((await post(s, `/suggestions/${b._id}/reopen`)).status).toBe(409);
    expect((await Conversation.findOne({ syllabusId: s._id })).status).toBe('submitted');
  }, 60000);

  test('resend-submission (admin) надсилає ті самі outputs', async () => {
    const s = await docSyllabus({ status: 'submitted' });
    const res = await request(app).post(`/api/cabinet/syllabi/${s._id}/resend-submission`).set(authOf(admin));
    expect(res.status).toBe(200);
    const names = mockSendMail.mock.calls[0][0].attachments.map((x) => x.filename);
    expect(names[0]).toBe('syllabus_tracked.docx');
  }, 60000);
});

describe('legacy', () => {
  test('читання працює, мутації → 409 LEGACY_SYLLABUS', async () => {
    const s = await helpers.createSyllabus(owner, { legacy: true, extractedText: 'old' });
    created.push(s._id);
    const conv = await Conversation.create({ syllabusId: s._id, instructorId: owner._id });
    await Message.create({ conversationId: conv._id, role: 'ai', kind: 'text', content: 'Стара картка' });
    const get = await request(app).get(api(s)).set(authOf(owner));
    expect(get.status).toBe(200);
    expect(get.body.syllabus).toMatchObject({ legacy: true, canMutate: false });
    expect(get.body.messages[0].content).toBe('Стара картка');
    for (const path of ['/start', '/message', '/submit', `/suggestions/${conv._id}/accept`]) {
      const res = await post(s, path, { text: 'x' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEGACY_SYLLABUS');
    }
    expect((await request(app).get(`${api(s)}/outputs/tracked.docx`).set(authOf(owner))).body.code).toBe('LEGACY_SYLLABUS');
  });
});
