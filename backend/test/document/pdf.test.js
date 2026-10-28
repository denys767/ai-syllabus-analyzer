const fs = require('fs');
const path = require('path');
const api = require('../../services/document');
const original = fs.readFileSync(path.join(__dirname, '../fixtures/pdf/syllabus.pdf'));
let doc;
beforeAll(async () => { doc = await api.extractPdf(original); });
const byPrefix = (text) => doc.blocks.find((b) => b.text.startsWith(text));

test('PDF: абзаци, заголовки, bullets, англійська/кирилиця, стабільні ID та bbox', async () => {
  expect(doc).toMatchObject({ format: 'pdf', docVersion: api.computeDocVersion(original), meta: { pageCount: 3 } });
  expect(doc.blocks[0]).toMatchObject({ kind: 'heading', text: 'Силабус MBA: Стратегія' });
  expect(byPrefix('1. Загальна інформація')).toMatchObject({ kind: 'heading' });
  expect(doc.blocks.some((b) => b.kind === 'list-item' && b.text.includes('Командна робота'))).toBe(true);
  expect(byPrefix('Курс триває').locator.lineBoxes.length).toBeGreaterThan(1);
  expect(doc.blocks.some((b) => b.text.includes('Nova Poshta'))).toBe(true);
  for (const block of doc.blocks) {
    const { bbox, lineBoxes, page } = block.locator;
    expect(page).toBeGreaterThanOrEqual(1);
    expect(bbox[2]).toBeGreaterThan(bbox[0]); expect(bbox[3]).toBeGreaterThan(bbox[1]);
    for (const line of lineBoxes) expect(block.text.slice(line.start, line.end)).toBe(line.text);
  }
  expect(await api.extractPdf(original)).toEqual(doc);
});

test('loadDocument(pdf): ті самі блоки без робочого .docx; з локатора лишається лише сторінка', async () => {
  const loaded = await api.loadDocument(original, 'pdf');
  expect(loaded.convertedFrom).toBeNull();
  expect(loaded.buffer).toBeUndefined();
  expect(loaded.doc).toMatchObject({ format: 'pdf', docVersion: doc.docVersion, meta: { pageCount: 3 } });
  expect(loaded.doc.blocks.map(({ locator, ...b }) => b)).toEqual(doc.blocks.map(({ locator, ...b }) => b));
  expect(loaded.doc.blocks.every((b, i) => JSON.stringify(b.locator) === JSON.stringify({ page: doc.blocks[i].locator.page }))).toBe(true);
});

test('PDF з текстовим шаром і порожній PDF', async () => {
  const text = fs.readFileSync(path.join(__dirname, '../fixtures/pdf/syllabus-text.pdf'));
  const loaded = await api.loadDocument(text, 'pdf');
  expect(loaded.doc.blocks.length).toBeGreaterThan(0);
  expect(loaded.doc.blocks.every((b) => b.text.trim() && Object.keys(b.locator).join() === 'page')).toBe(true);
  const empty = fs.readFileSync(path.join(__dirname, '../fixtures/pdf/empty.pdf'));
  await expect(api.loadDocument(empty, 'pdf')).rejects.toMatchObject({ statusCode: 422, code: 'PDF_NO_TEXT' });
});

test('PDF: image-only та пошкоджений PDF дають 422', async () => {
  const scanned = fs.readFileSync(path.join(__dirname, '../fixtures/pdf/scanned.pdf'));
  await expect(api.extractPdf(scanned)).rejects.toMatchObject({ statusCode: 422, code: 'PDF_NO_TEXT', message: expect.stringContaining('OCR') });
  await expect(api.extractPdf(Buffer.from('x'))).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_PDF' });
});
