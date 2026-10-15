const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const api = require('../../services/document');
const { P, A, parse, all, children, child } = require('../../services/document/pptxXml');
const { partXml, byText } = require('./helpers');
const lo = api.isConverterAvailable() ? test : test.skip;
const original = fs.readFileSync(path.join(__dirname, '../fixtures/pptx/syllabus.pptx'));
const suggestion = (id, op, block, extra = {}) => ({ id, ops: [{ op, blockId: block.id, ...extra }] });
let doc;
beforeAll(async () => { doc = await api.extractPptx(original); });

test('PPTX: порядок презентації, title перед текстом, ID, таблиці, групи та нотатки', async () => {
  expect(doc).toMatchObject({ format: 'pptx', docVersion: api.computeDocVersion(original), meta: { slideCount: 4 } });
  expect(await api.extractPptx(original)).toEqual(doc);
  expect(doc.blocks.map((b) => b.id)).toEqual(doc.blocks.map((b, i) => `b${String(i + 1).padStart(4, '0')}`));
  expect(doc.blocks[0]).toMatchObject({ kind: 'slide-title', locator: { slide: 1, slidePart: 'ppt/slides/slide3.xml', shapeId: '2', paraIndex: 0 } });
  const agenda = byText(doc, 'План курсу');
  const bullet = byText(doc, 'Командна робота');
  expect(bullet).toMatchObject({ kind: 'slide-text', listFormat: 'bullet', sectionId: agenda.id, locator: { slide: 2, paraIndex: 1 } });
  expect(byText(doc, 'Monobank')).toMatchObject({ kind: 'table-cell', locator: { slide: 3, cell: { table: 0, row: 2, col: 2 } } });
  expect(byText(doc, 'Academic integrity: плагіат заборонено.')).toMatchObject({ locator: { shapeId: '5', slide: 4 } });
  expect(doc.blocks.at(-1)).toMatchObject({ kind: 'notes', readOnly: true, readOnlyReason: 'notes', locator: { notesPart: 'ppt/notesSlides/notesSlide1.xml' } });
  const loaded = await api.loadDocument(original, '.PPTX');
  expect(loaded).toEqual({ buffer: original, doc, convertedFrom: null });
});

test('no-op: оригінал і всі частини байт-ідентичні', async () => {
  const out = await api.writePptx(original, doc, []);
  expect(out.equals(original)).toBe(true);
  expect(await api.extractPptx(out)).toEqual(doc);
});

test('replace: незмінні run-и, rPr першого run-а, pPr і endParaRPr збережені', async () => {
  const block = byText(doc, 'Курс триває 10 тижнів і має іспит.');
  const newText = 'Курс триває 12 тижнів і має іспит.';
  const out = await api.writePptx(original, doc, [suggestion('r', 'replaceBlock', block, { newText })]);
  expect(byText(await api.extractPptx(out), newText)).toBeDefined();
  const xml = await partXml(out, block.locator.slidePart);
  const dom = parse(xml);
  const run = all(dom, A, 'r').find((r) => child(r, A, 't').textContent === '12');
  expect(child(run, A, 'rPr').getAttribute('b')).toBe('1');
  expect(xml).toContain('<a:rPr lang="uk-UA" sz="2200" i="1"><a:latin typeface="DejaVu Sans"/></a:rPr><a:t> тижнів</a:t>');
  expect(xml).toContain('<a:endParaRPr lang="uk-UA"/>');
  const beforeZip = await JSZip.loadAsync(original);
  const afterZip = await JSZip.loadAsync(out);
  for (const name of Object.keys(beforeZip.files).filter((n) => !beforeZip.files[n].dir && n !== block.locator.slidePart)) {
    expect((await beforeZip.file(name).async('nodebuffer')).equals(await afterZip.file(name).async('nodebuffer'))).toBe(true);
  }
});

test('insertAfter зберігає bullets і порядок вставок, включно з таблицею', async () => {
  const block = byText(doc, 'Командна робота');
  const cell = byText(doc, 'Monobank');
  const out = await api.writePptx(original, doc, [
    suggestion('i1', 'insertAfter', block, { newBlocks: [{ kind: 'list-item', text: 'Лідерство' }, { kind: 'list-item', text: 'Переговори' }] }),
    suggestion('i2', 'insertAfter', block, { newBlocks: [{ kind: 'paragraph', text: 'Етика' }] }),
    suggestion('c', 'insertAfter', cell, { newBlocks: [{ kind: 'paragraph', text: 'Читання: HBR' }] }),
  ]);
  const after = await api.extractPptx(out);
  const idx = after.blocks.findIndex((b) => b.text === block.text);
  expect(after.blocks.slice(idx + 1, idx + 4).map((b) => b.text)).toEqual(['Лідерство', 'Переговори', 'Етика']);
  expect(byText(after, 'Лідерство')).toMatchObject({ listFormat: 'bullet' });
  expect(byText(after, 'Читання: HBR')).toMatchObject({ cell: cell.cell, kind: 'table-cell' });
});

test('delete усіх абзаців shape і клітинки лишає обов’язковий a:p', async () => {
  const targets = [byText(doc, 'Командна робота'), byText(doc, 'Мета та результати навчання'), byText(doc, 'Оцінювання та політики'), byText(doc, 'Monobank')];
  const out = await api.writePptx(original, doc, targets.map((b, i) => suggestion(`d${i}`, 'deleteBlock', b)));
  const after = await api.extractPptx(out);
  expect(after.blocks.some((b) => targets.some((t) => t.text === b.text))).toBe(false);
  for (const part of ['ppt/slides/slide1.xml', 'ppt/slides/slide4.xml']) {
    const dom = parse(await partXml(out, part));
    for (const body of [...all(dom, P, 'txBody'), ...all(dom, A, 'txBody')]) expect(children(body, A, 'p').length).toBeGreaterThanOrEqual(1);
  }
});

test('захист stale, readOnly і конфліктів', async () => {
  await expect(api.writePptx(Buffer.from('x'), doc, [])).rejects.toMatchObject({ code: 'STALE_DOC_VERSION' });
  await expect(api.writePptx(original, doc, [suggestion('n', 'deleteBlock', doc.blocks.at(-1))])).rejects.toMatchObject({ code: 'INVALID_OPS' });
  const block = byText(doc, 'Командна робота');
  await expect(api.writePptx(original, doc, [suggestion('a', 'replaceBlock', block, { newText: 'Новий пункт' }), suggestion('b', 'deleteBlock', block)])).rejects.toMatchObject({ code: 'SUGGESTION_CONFLICT' });
  await expect(api.extractPptx(Buffer.from('x'))).rejects.toMatchObject({ code: 'INVALID_PPTX', statusCode: 422 });
});

test('бюджет довжини позначено в метаданих прев’ю', () => {
  const block = byText(doc, 'Командна робота');
  const accepted = [suggestion('l', 'replaceBlock', block, { newText: 'Командна робота та практичне оцінювання всіх результатів навчання' })];
  expect(api.overflowRisk('12345678901234567890', '12345678901234567890123')).toBe(false);
  expect(api.overflowRisk('12345678901234567890', '123456789012345678901234')).toBe(true);
  expect(api.previewPptxChanges(doc, accepted).entries[0].meta).toEqual({ slide: 2, overflowRisk: true });
});

lo('LibreOffice відкриває edited PPTX; PNG лише змінених слайдів', async () => {
  const block = byText(doc, 'Командна робота');
  const accepted = [suggestion('p', 'replaceBlock', block, { newText: 'Командна робота та лідерство' })];
  const { edited, previewPdf } = await api.buildOutputsFor('pptx', original, doc, accepted);
  expect(previewPdf.subarray(0, 5).toString()).toBe('%PDF-');
  const preview = await api.renderPptxPreview(original, edited, [2, 2]);
  expect(preview.slides.map((s) => s.slide)).toEqual([2]);
  for (const png of [preview.slides[0].before, preview.slides[0].after]) expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(preview.slides[0].before.equals(preview.slides[0].after)).toBe(false);
  expect(await api.renderPptxPreview(original, edited, [])).toEqual({ slides: [] });
}, 120000);

test('insertAfter після заголовка слайда відхиляється, після тексту слайда — дозволено', () => {
  const title = doc.blocks.find((b) => b.kind === 'slide-title');
  const text = doc.blocks.find((b) => b.kind === 'slide-text' && !b.readOnly);
  const newBlocks = [{ kind: 'paragraph', text: 'Новий абзац' }];
  expect(api.validateOps(doc, [{ op: 'insertAfter', blockId: title.id, newBlocks }]))
    .toEqual([expect.objectContaining({ code: 'INSERT_AFTER_SLIDE_TITLE' })]);
  expect(api.validateOps(doc, [{ op: 'insertAfter', blockId: text.id, newBlocks }])).toEqual([]);
});
