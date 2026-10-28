// Регресії входу: PPTX більше не підтримується; старі тести submit/PDF-виходів прибрано у v5.
const helpers = require('./helpers');
const request = require('supertest');
const JSZip = require('jszip');
const app = require('../server');
const { mapPdfSuggestions } = require('../services/document/pdfMapping');
let auth;
beforeAll(async () => {
  await helpers.connectDb();
  const owner = await helpers.createUser();
  auth = { Authorization: `Bearer ${helpers.tokenFor(owner)}` };
});
afterAll(() => helpers.disconnectDb());

test('PPTX magic bytes reject DOCX zip and corrupt PK archive as 400 (і навпаки для .docx)', async () => {
  const docxZip = await new JSZip().file('word/document.xml', '<doc/>').generateAsync({ type: 'nodebuffer' });
  const pptxZip = await new JSZip().file('ppt/presentation.xml', '<p/>').generateAsync({ type: 'nodebuffer' });
  const cases = [[docxZip, 'fake.pptx'], [Buffer.from('PKinvalid'), 'fake.pptx'], [pptxZip, 'fake.docx']];
  for (const [buffer, name] of cases) {
    const res = await request(app).post('/api/syllabus/upload').set(auth)
      .field('courseName', 'Course').attach('syllabus', buffer, name);
    expect(res.status).toBe(400);
  }
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
