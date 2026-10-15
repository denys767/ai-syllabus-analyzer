const { readPart, serializeDocument, docError, elementChildren } = require('../ooxml');
const { A, child, children, parse, loadPptx, paragraphText, slideParagraphs } = require('../pptxXml');
const { writerInputs } = require('../writerInputs');
const { diffBlock, previewChanges } = require('../apply');

function overflowRisk(oldText, newText) { return newText.length > oldText.length * 1.15; }
function previewPptxChanges(doc, accepted) {
  const preview = previewChanges(doc, accepted);
  const byId = new Map(doc.blocks.map((b) => [b.id, b]));
  preview.entries = preview.entries.map((e) => ({ ...e, meta: {
    slide: byId.get(e.anchorId || e.blockId).locator.slide,
    overflowRisk: e.status === 'inserted' || overflowRisk(e.before, e.after),
  } }));
  return preview;
}
function run(dom, prefix, text, props) {
  const r = dom.createElementNS(A, `${prefix}:r`);
  if (props) r.appendChild(props.cloneNode(true));
  const t = dom.createElementNS(A, `${prefix}:t`);
  t.appendChild(dom.createTextNode(text));
  r.appendChild(t);
  return r;
}
// Рівні фрагменти зберігають властивості своїх run-ів, вставки — першого run-а.
function replace(p, newText) {
  const dom = p.ownerDocument;
  const prefix = p.prefix || 'a';
  const runs = children(p, A, 'r');
  const firstProps = child(runs[0], A, 'rPr');
  const spans = [];
  let offset = 0;
  for (const c of elementChildren(p)) {
    if (c.namespaceURI !== A || !['r', 'br'].includes(c.localName)) continue;
    const text = c.localName === 'br' ? '\n' : child(c, A, 't')?.textContent || '';
    spans.push({ start: offset, end: offset + text.length, text, node: c });
    offset += text.length;
  }
  const output = [];
  offset = 0;
  for (const part of diffBlock(paragraphText(p), newText)) {
    if (part.type === 'insert') output.push(run(dom, prefix, part.text, firstProps));
    else {
      if (part.type === 'equal') for (const s of spans) {
        const start = Math.max(offset, s.start);
        const end = Math.min(offset + part.text.length, s.end);
        if (end <= start) continue;
        if (start === s.start && end === s.end) output.push(s.node.cloneNode(true));
        else output.push(run(dom, prefix, s.text.slice(start - s.start, end - s.start), child(s.node, A, 'rPr')));
      }
      offset += part.text.length;
    }
  }
  for (const c of elementChildren(p)) if (!(c.namespaceURI === A && ['pPr', 'endParaRPr'].includes(c.localName))) p.removeChild(c);
  const endProps = child(p, A, 'endParaRPr');
  output.forEach((r) => p.insertBefore(r, endProps || null));
}
function insertedParagraph(p, text) {
  const fresh = p.ownerDocument.createElementNS(A, `${p.prefix || 'a'}:p`);
  const props = child(p, A, 'pPr');
  if (props) fresh.appendChild(props.cloneNode(true));
  fresh.appendChild(run(p.ownerDocument, p.prefix || 'a', text, child(children(p, A, 'r')[0], A, 'rPr')));
  const endProps = child(p, A, 'endParaRPr');
  if (endProps) fresh.appendChild(endProps.cloneNode(true));
  return fresh;
}
async function writePptx(originalBuffer, doc, acceptedSuggestions = []) {
  const result = writerInputs(originalBuffer, doc, acceptedSuggestions, 'pptx');
  if (!result.changes.length) return Buffer.from(originalBuffer);
  const { zip } = await loadPptx(originalBuffer);
  const parts = new Map();
  for (const change of result.changes) {
    const block = doc.blocks.find((b) => b.id === change.blockId);
    const loc = block.locator;
    if (!parts.has(loc.slidePart)) {
      const dom = parse(await readPart(zip, loc.slidePart), loc.slidePart);
      parts.set(loc.slidePart, { dom, entries: slideParagraphs(dom) });
    }
    const { entries } = parts.get(loc.slidePart);
    const entry = entries.find((e) => e.shapeId === loc.shapeId && e.paraIndex === loc.paraIndex
      && JSON.stringify(e.cell) === JSON.stringify(loc.cell));
    const p = entry?.p;
    if (!p || paragraphText(p) !== block.text) throw docError('Слайд не відповідає моделі документа', 409, 'DOC_MISMATCH');
    const parent = p.parentNode;
    const after = p.nextSibling;
    // Шаблон з оригіналу, навіть якщо якір замінено або видалено.
    for (const ins of change.inserts) for (const nb of ins.newBlocks) parent.insertBefore(insertedParagraph(p, nb.text), after);
    if (change.type === 'replace') replace(p, change.text);
    if (change.type === 'delete') {
      if (children(parent, A, 'p').length > 1) parent.removeChild(p);
      else replace(p, '');
    }
  }
  for (const [name, { dom }] of parts) zip.file(name, serializeDocument(dom));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
module.exports = { writePptx, overflowRisk, previewPptxChanges };
