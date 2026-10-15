// Додає лише анотації; оригінальні content streams сторінок не редагуються.
const { PDFDocument, PDFName, PDFHexString } = require('@cantoo/pdf-lib');
const { diffBlock } = require('../apply');
const { writerInputs } = require('../writerInputs');
const { DEFAULT_AUTHOR } = require('./docx');
const { docError } = require('../ooxml');

function changedBoxes(block, text) {
  const ranges = [];
  let offset = 0;
  for (const part of diffBlock(block.text, text)) {
    if (part.type === 'delete') ranges.push([offset, offset + part.text.length]);
    if (part.type !== 'insert') offset += part.text.length;
  }
  const lines = block.locator.lineBoxes || [];
  if (!ranges.length || !lines.length || lines.some((l) => !l.bbox || !Number.isFinite(l.start))) return [block.locator.bbox];
  const boxes = [];
  for (const line of lines) {
    const overlapping = ranges.filter(([start, end]) => line.end > start && line.start < end);
    if (!overlapping.length) continue;
    const spans = (line.spans || []).filter((s) => overlapping.some(([start, end]) => s.end > start && s.start < end));
    // Точний bbox слова доступний лише тоді, коли pdf.js повернув його окремим item.
    if (spans.length && spans.every((s) => /^\S+$/u.test(s.text))) boxes.push(...spans.map((s) => s.bbox));
    else boxes.push(line.bbox);
  }
  return boxes.length ? boxes : [block.locator.bbox];
}
async function annotatePdf(originalBuffer, doc, acceptedSuggestions = [], { author = DEFAULT_AUTHOR } = {}) {
  const result = writerInputs(originalBuffer, doc, acceptedSuggestions, 'pdf');
  if (!result.changes.length) return Buffer.from(originalBuffer);
  const pdf = await PDFDocument.load(originalBuffer, { updateMetadata: false });
  const pages = pdf.getPages();
  const suggestions = new Map(acceptedSuggestions.map((s) => [s.id, s]));
  const add = (page, subtype, rect, contents, extra = {}) => {
    const annot = pdf.context.obj({ Type: 'Annot', Subtype: subtype, Rect: rect, P: page.ref,
      T: PDFHexString.fromText(author), Contents: PDFHexString.fromText(contents), C: [0.85, 0.15, 0.15], F: 4, ...extra });
    // Наявні /Annots зберігаються. Не викликаємо drawText чи flatten.
    const key = PDFName.of('Annots');
    let annots = page.node.Annots();
    if (!annots) { annots = pdf.context.obj([]); page.node.set(key, annots); }
    annots.push(pdf.context.register(annot));
  };
  const reason = (ids) => [...new Set(ids.map((id) => suggestions.get(id)?.rationale).filter(Boolean))].join('\n');
  for (const change of result.changes) {
    const block = doc.blocks.find((b) => b.id === change.blockId);
    const { page: pageNumber, bbox, lineBoxes = [] } = block.locator;
    const page = pages[pageNumber - 1];
    if (!page || !bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw docError('Некоректний локатор PDF', 409, 'DOC_MISMATCH');
    if (change.type) {
      const boxes = change.type === 'replace' ? changedBoxes(block, change.text) : lineBoxes.map((l) => l.bbox || l);
      for (const box of boxes.length ? boxes : [bbox]) {
        const [x0, y0, x1, y1] = box;
        add(page, 'StrikeOut', box, '', { QuadPoints: [x0, y1, x1, y1, x0, y0, x1, y0] });
      }
      const text = change.type === 'delete' ? 'Видалити' : change.text;
      add(page, 'Text', [bbox[2], bbox[3] - 18, bbox[2] + 18, bbox[3]], [text, reason(change.suggestionIds)].filter(Boolean).join('\n\n'), { Name: 'Comment' });
    }
    for (const ins of change.inserts) {
      const last = lineBoxes[lineBoxes.length - 1];
      const endBox = last?.bbox || last || bbox;
      const rect = [endBox[2] - 2, endBox[1], endBox[2] + 8, endBox[1] + 12];
      const text = [ins.newBlocks.map((b) => b.text).join('\n'), reason([ins.sid])].filter(Boolean).join('\n\n');
      add(page, 'Caret', rect, text, { Sy: PDFName.of('P') });
      add(page, 'Text', [rect[2], rect[1], rect[2] + 18, rect[1] + 18], text, { Name: 'Insert' });
    }
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
module.exports = { annotatePdf };
