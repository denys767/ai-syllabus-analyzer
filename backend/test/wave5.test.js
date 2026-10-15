jest.mock('../services/ai/review', () => ({ runReview: jest.fn(async () => ({ findings: [], rubricSummary: {} })), generateSuggestion: jest.fn() }));
jest.mock('../services/emailService', () => ({ sendSubmissionToAdEmail: jest.fn(async () => ({ messageId: 'test' })) }));
jest.mock('../services/document', () => {
  const actual = jest.requireActual('../services/document');
  return { ...actual, renderPptxPreview: jest.fn(actual.renderPptxPreview) };
});
const helpers = require('./helpers');
process.env.MAX_FILE_SIZE = String(10 * 1024 * 1024);
const fs = require('fs').promises;
const path = require('path');
const request = require('supertest');
const JSZip = require('jszip');
const { PDFDocument } = require('@cantoo/pdf-lib');
const app = require('../server');
const Syllabus = require('../models/Syllabus');
const Program = require('../models/Program');
const Suggestion = require('../models/Suggestion');
const runner = require('../services/analysisRunner');
const documents = require('../services/document');
const { mapPdfSuggestions } = require('../services/document/pdfMapping');
const { deleteSyllabiCascade } = require('../services/syllabusCleanup');
const { sendSubmissionToAdEmail } = require('../services/emailService');
let owner; let auth; let program;
const ids = [];
jest.setTimeout(120000);
beforeAll(async () => {
  await helpers.connectDb(); owner = await helpers.createUser();
  auth = { Authorization: `Bearer ${helpers.tokenFor(owner)}` };
  program = await Program.create({ name: 'MBA', code: 'W5', academicDirectorEmail: 'ad@example.com' });
});
afterAll(async () => { await deleteSyllabiCascade({ _id: { $in: ids } }); await helpers.disconnectDb(); });
async function upload(format, fixture = 'syllabus') {
  const spy = jest.spyOn(runner, 'runAnalysisInBackground').mockImplementation(() => {});
  try {
    const buffer = await fs.readFile(path.join(__dirname, `fixtures/${format}/${fixture}.${format}`));
    const res = await request(app).post('/api/syllabus/upload').set(auth)
      .field('courseName', 'Курс').field('programId', String(program._id)).attach('syllabus', buffer, `course.${format}`);
    expect(res.status).toBe(201); ids.push(res.body.syllabusId);
    await runner.runAnalysis(res.body.syllabusId);
    const s = await Syllabus.findById(res.body.syllabusId);
    expect(s.status).toBe('in_progress'); return s;
  } finally { spy.mockRestore(); }
}
const api = (s) => `/api/chat/${s._id}`;
const get = (s, suffix) => request(app).get(`${api(s)}${suffix}`).set(auth);
const post = (s, suffix, body = {}) => request(app).post(`${api(s)}${suffix}`).set(auth).send(body);
function binary(req) { return req.buffer(true).parse((res, cb) => {
  const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
}); }

test('PPTX upload → accept → previews, cached slides, outputs, submit', async () => {
  const s = await upload('pptx');
  const view = await get(s, '');
  expect(view.body.syllabus.outputs).toEqual([
    { name: 'edited.pptx', label: 'Презентація з правками' }, { name: 'preview.pdf', label: 'PDF презентації з правками' },
  ]);
  const block = s.document.blocks.find((b) => !b.readOnly && b.kind === 'slide-text');
  const newText = `${block.text} Additional practical case discussion and assessment.`;
  const suggestion = await helpers.createSuggestion(s, { ops: [helpers.replaceOp(block.id, newText)] });
  expect((await post(s, '/start')).status).toBe(200);
  const slides = await get(s, `/suggestions/${suggestion._id}/slides`);
  expect(slides.status).toBe(200);
  expect(slides.body.slides).toHaveLength(1);
  expect(slides.body.slides[0]).toMatchObject({ slide: block.locator.slide, overflowRisk: true,
    before: expect.stringMatching(/^data:image\/png;base64,iVBOR/), after: expect.stringMatching(/^data:image\/png;base64,iVBOR/) });
  await get(s, `/suggestions/${suggestion._id}/slides`);
  expect(documents.renderPptxPreview).toHaveBeenCalledTimes(1);
  // Refine без зміни docVersion не повертає попередній кеш.
  await Suggestion.updateOne({ _id: suggestion._id }, { $set: { 'ops.0.newText': `${newText} Updated.` } });
  expect((await get(s, `/suggestions/${suggestion._id}/slides`)).status).toBe(200);
  expect(documents.renderPptxPreview).toHaveBeenCalledTimes(2);
  expect((await post(s, `/suggestions/${suggestion._id}/accept`)).status).toBe(200);
  const preview = await get(s, '/document/preview');
  expect(preview.body.blocks.find((b) => b.blockId === block.id).parts.some((p) => p.type === 'ins')).toBe(true);
  expect((await get(s, '/outputs/tracked.docx')).status).toBe(404);
  const edited = await binary(get(s, '/outputs/edited.pptx'));
  expect(edited.status).toBe(200);
  expect((await documents.extractPptx(edited.body)).blocks.find((b) => b.id === block.id).text).toBe(`${newText} Updated.`);
  const pdf = await binary(get(s, '/outputs/preview.pdf'));
  expect(pdf.status).toBe(200); expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  expect((await post(s, '/submit')).status).toBe(200);
  expect(sendSubmissionToAdEmail.mock.calls.at(-1)[0].attachments.map((a) => a.filename)).toEqual(['course_edited.pptx', 'course_preview.pdf']);
});

test('PPTX magic bytes reject DOCX zip and corrupt PK archive as 400', async () => {
  const zip = await new JSZip().file('word/document.xml', '<doc/>').generateAsync({ type: 'nodebuffer' });
  for (const buffer of [zip, Buffer.from('PKinvalid')]) {
    const res = await request(app).post('/api/syllabus/upload').set(auth)
      .field('courseName', 'Курс').field('programId', String(program._id)).attach('syllabus', buffer, 'fake.pptx');
    expect(res.status).toBe(400);
  }
});

test('PDF blocks persist 1:1, accepted replacements/inserts/deletes annotate original, submit includes tracked files', async () => {
  const s = await upload('pdf');
  const doc = s.document;
  expect(doc.sourceBlocks).toHaveLength(doc.blocks.length);
  expect(Object.keys(doc.pdfBlockMap)).toHaveLength(doc.blocks.length);
  const suggestion = await helpers.createSuggestion(s, { ops: [helpers.replaceOp(doc.blocks[0].id, 'Updated course'),
    { op: 'insertAfter', blockId: doc.blocks[1].id, newBlocks: [{ kind: 'paragraph', text: 'Published case discussion.' }] },
    { op: 'deleteBlock', blockId: doc.blocks[2].id }] });
  await post(s, '/start');
  expect((await post(s, `/suggestions/${suggestion._id}/accept`)).status).toBe(200);
  const view = await get(s, '');
  expect(view.body.syllabus.outputs.map((o) => o.name)).toEqual(['annotated.pdf', 'tracked.docx', 'clean.docx', 'tracked.pdf']);
  expect((await get(s, '/outputs/edited.pptx')).status).toBe(404);
  expect((await get(s, `/suggestions/${suggestion._id}/slides`)).status).toBe(404);
  const annotated = await binary(get(s, '/outputs/annotated.pdf'));
  expect(annotated.status).toBe(200);
  const pdf = await PDFDocument.load(annotated.body);
  expect(pdf.getPages().reduce((n, p) => n + (p.node.Annots()?.size() || 0), 0)).toBeGreaterThanOrEqual(6);
  const clean = await binary(get(s, '/outputs/clean.docx'));
  expect((await documents.extractDocx(clean.body)).blocks.some((b) => b.text === 'Published case discussion.')).toBe(true);
  expect((await post(s, '/submit')).status).toBe(200);
  expect(sendSubmissionToAdEmail.mock.calls.at(-1)[0].attachments.map((a) => a.filename)).toEqual(['course_annotated.pdf', 'course_tracked.docx', 'course_tracked.pdf']);
  expect((await Syllabus.findById(s._id)).outputs.annotated.path).toBeTruthy();
});

test('PDF mapping remaps operation anchors and synthetic inserted ids independently of numbering', () => {
  const accepted = [{ id: 's', supersedes: ['old'], ops: [
    { op: 'insertAfter', blockId: 'b0010', newBlocks: [{ kind: 'paragraph', text: 'x' }] },
    { op: 'replaceBlock', blockId: 'b0010+s.1', newText: 'y' },
  ] }];
  const mapped = mapPdfSuggestions({ pdfBlockMap: { b0010: 'b0002' } }, accepted);
  expect(mapped[0].ops.map((op) => op.blockId)).toEqual(['b0002', 'b0002+s.1']);
  expect(mapped[0].supersedes).toEqual(['old']);
  expect(accepted[0].ops[0].blockId).toBe('b0010');
});
