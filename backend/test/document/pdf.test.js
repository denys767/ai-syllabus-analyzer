const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PDFDocument, PDFName, PDFArray } = require('@cantoo/pdf-lib');
const api = require('../../services/document');
const { readPdf } = require('../../services/document/pdfRuntime');
const original = fs.readFileSync(path.join(__dirname, '../fixtures/pdf/syllabus.pdf'));
let doc;
beforeAll(async () => { doc = await api.extractPdf(original); });
const byPrefix = (text) => doc.blocks.find((b) => b.text.startsWith(text));
const suggest = (id, op, block, extra = {}) => ({ id, rationale: 'Уточнити вимоги силабусу українською.', ops: [{ op, blockId: block.id, ...extra }] });

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
  expect(await api.loadDocument(original, 'pdf')).toEqual({ buffer: original, doc, convertedFrom: null });
  const paragraphs = api.pdfBlocksToParagraphs(doc);
  expect(paragraphs).toHaveLength(doc.blocks.length);
  expect(paragraphs[0]).toMatchObject({ kind: 'heading', level: 1 });
  expect(paragraphs.every((p) => ['paragraph', 'heading', 'list-item'].includes(p.kind))).toBe(true);
});

test('PDF: no-op повертає оригінальні байти; image-only та пошкоджений PDF дають 422', async () => {
  expect((await api.annotatePdf(original, doc, [])).equals(original)).toBe(true);
  const scanned = fs.readFileSync(path.join(__dirname, '../fixtures/pdf/scanned.pdf'));
  await expect(api.extractPdf(scanned)).rejects.toMatchObject({ statusCode: 422, code: 'PDF_NO_TEXT', message: expect.stringContaining('OCR') });
  await expect(api.extractPdf(Buffer.from('x'))).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_PDF' });
});

test('PDF: анотації replace/delete/insert, UTF-16, автор і rationale; content streams незмінні', async () => {
  const block = byPrefix('Курс триває');
  const deleted = byPrefix('Академічна доброчесність');
  const accepted = [
    suggest('r', 'replaceBlock', block, { newText: block.text.replace('10', '12') }),
    suggest('d', 'deleteBlock', deleted),
    suggest('i', 'insertAfter', doc.blocks[0], { newBlocks: [{ kind: 'paragraph', text: 'Додаткові матеріали курсу.' }] }),
  ];
  const { annotated } = await api.buildOutputsFor('pdf', original, doc, accepted);
  const annotations = (await readPdf(annotated, { annotations: true })).flat();
  expect(annotations.map((a) => a.subtype)).toEqual(expect.arrayContaining(['StrikeOut', 'Text', 'Caret']));
  const notes = annotations.filter((a) => a.subtype === 'Text');
  expect(notes.some((a) => a.contentsObj.str.includes('Курс триває 12'))).toBe(true);
  expect(notes.some((a) => a.contentsObj.str.includes('Видалити'))).toBe(true);
  expect(notes.some((a) => a.contentsObj.str.includes('Додаткові матеріали курсу.'))).toBe(true);
  for (const a of notes) {
    expect(a.titleObj.str).toBe('KSE Syllabus Analyzer');
    expect(a.contentsObj.str).toContain('Уточнити вимоги силабусу українською.');
  }
  // Змінено лише перший рядок багаторядкового абзацу, не весь блок.
  const firstPage = (await readPdf(annotated, { annotations: true }))[0];
  expect(firstPage.filter((a) => a.subtype === 'StrikeOut')).toHaveLength(1);
  const before = await PDFDocument.load(original);
  const after = await PDFDocument.load(annotated);
  const streams = (pdf, page) => {
    const obj = pdf.context.lookup(page.node.get(PDFName.of('Contents')));
    return obj instanceof PDFArray ? obj.asArray().map((ref) => Buffer.from(pdf.context.lookup(ref).getContents()).toString('hex')) : [Buffer.from(obj.getContents()).toString('hex')];
  };
  for (let i = 0; i < before.getPageCount(); i += 1) expect(streams(after, after.getPage(i))).toEqual(streams(before, before.getPage(i)));
  const textBefore = spawnSync('pdftotext', ['-', '-'], { input: original });
  const textAfter = spawnSync('pdftotext', ['-', '-'], { input: annotated });
  expect(textBefore.status).toBe(0); expect(textAfter.status).toBe(0);
  expect(textAfter.stdout.equals(textBefore.stdout)).toBe(true);
  expect(annotated.toString('latin1')).toMatch(/\/Contents <FEFF/i);
  expect((await api.extractPdf(annotated)).blocks).toEqual(doc.blocks);
});

test('PDF: точні bbox окремих слів, fallback на блок, наявні анотації й author', async () => {
  const block = byPrefix('Курс триває');
  const first = block.locator.lineBoxes[0];
  const start = block.text.indexOf('10');
  const exactBox = [first.bbox[0] + 30, first.bbox[1], first.bbox[0] + 40, first.bbox[3]];
  const preciseDoc = { ...doc, blocks: doc.blocks.map((b) => b === block ? { ...b, locator: { ...b.locator, lineBoxes: [{ ...first, spans: [{ text: '10', start, end: start + 2, bbox: exactBox }] }] } } : b) };
  const out = await api.annotatePdf(original, preciseDoc, [suggest('a', 'replaceBlock', block, { newText: block.text.replace('10', '12') })], { author: 'Викладач' });
  const anns = (await readPdf(out, { annotations: true }))[0];
  anns.find((a) => a.subtype === 'StrikeOut').rect.forEach((v, i) => expect(v).toBeCloseTo(exactBox[i], 3));
  expect(anns.find((a) => a.subtype === 'Text').titleObj.str).toBe('Викладач');
  const nextDoc = await api.extractPdf(out);
  const nextBlock = nextDoc.blocks[0];
  nextBlock.locator.lineBoxes = [];
  const twice = await api.annotatePdf(out, nextDoc, [suggest('d', 'deleteBlock', nextBlock)]);
  expect((await readPdf(twice, { annotations: true }))[0]).toHaveLength(anns.length + 2);
});

test('PDF: stale і конфлікти відхиляються', async () => {
  await expect(api.annotatePdf(Buffer.from('x'), doc, [])).rejects.toMatchObject({ code: 'STALE_DOC_VERSION' });
  const b = doc.blocks[0];
  await expect(api.annotatePdf(original, doc, [suggest('d', 'deleteBlock', b), suggest('r', 'replaceBlock', b, { newText: 'Інший заголовок' })])).rejects.toMatchObject({ code: 'SUGGESTION_CONFLICT' });
});

test('pdfToPng: окремі сторінки, валідація, порожня множина', async () => {
  const pngs = await api.pdfToPng(original, [3, 1, 3]);
  expect(pngs.map((p) => p.page)).toEqual([1, 3]);
  for (const { png } of pngs) expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(await api.pdfToPng(original, [])).toEqual([]);
  await expect(api.pdfToPng(original, [0])).rejects.toMatchObject({ code: 'BAD_PAGES' });
  await expect(api.pdfToPng(original, [99])).rejects.toMatchObject({ code: 'PDF_RENDER_FAILED' });
});
