// Регресія входу: PPTX не підтримується; решту тестів submit/PDF-виходів прибрано у v5.
const helpers = require('./helpers');
const request = require('supertest');
const JSZip = require('jszip');
const app = require('../server');
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
