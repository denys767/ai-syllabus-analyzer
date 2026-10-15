// Спільний обхід PresentationML для extractor і writer.
const JSZip = require('jszip');
const path = require('path').posix;
const { parseXml, elementChildren, readPart, docError } = require('./ooxml');

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const child = (n, ns, name) => elementChildren(n || {}).find((c) => c.namespaceURI === ns && c.localName === name);
const children = (n, ns, name) => elementChildren(n).filter((c) => c.namespaceURI === ns && c.localName === name);
const all = (n, ns, name) => Array.from(n.getElementsByTagNameNS(ns, name));
function parse(xml, part) {
  try { return parseXml(xml, part); } catch (e) { throw docError(e.message, 422, 'INVALID_PPTX'); }
}
async function relationships(zip, part) {
  const xml = await readPart(zip, path.join(path.dirname(part), '_rels', `${path.basename(part)}.rels`));
  if (!xml) return new Map();
  return new Map(all(parse(xml, part), 'http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship')
    .filter((r) => r.getAttribute('TargetMode') !== 'External')
    .map((r) => [r.getAttribute('Id'), {
      type: r.getAttribute('Type'),
      part: path.normalize(r.getAttribute('Target').startsWith('/') ? r.getAttribute('Target').slice(1)
        : path.join(path.dirname(part), r.getAttribute('Target'))),
    }]));
}
async function loadPptx(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch (_) { throw docError('Файл не є коректним PPTX-архівом', 422, 'INVALID_PPTX'); }
  const part = 'ppt/presentation.xml';
  const xml = await readPart(zip, part);
  if (!xml) throw docError('У PPTX немає presentation.xml', 422, 'INVALID_PPTX');
  const rels = await relationships(zip, part);
  const slides = all(parse(xml, part), P, 'sldId').map((s) => {
    const rel = rels.get(s.getAttributeNS(R, 'id'));
    if (!rel || !rel.type.endsWith('/slide') || !zip.file(rel.part)) throw docError('Пошкоджений список слайдів PPTX', 422, 'INVALID_PPTX');
    return rel.part;
  });
  return { zip, slides };
}
function paragraphText(p) {
  return elementChildren(p).map((c) => {
    if (c.namespaceURI !== A) return '';
    if (c.localName === 'br') return '\n';
    if (c.localName === 'r' || c.localName === 'fld') return all(c, A, 't').map((t) => t.textContent).join('');
    return '';
  }).join('');
}
function slideParagraphs(dom) {
  const entries = [];
  const walk = (tree) => {
    for (const shape of elementChildren(tree)) {
      if (shape.namespaceURI !== P) continue;
      if (shape.localName === 'grpSp') { walk(shape); continue; }
      if (!['sp', 'graphicFrame'].includes(shape.localName)) continue;
      const shapeId = all(shape, P, 'cNvPr')[0]?.getAttribute('id');
      const ph = all(shape, P, 'ph')[0];
      const placeholder = ph?.getAttribute('type');
      const title = ['title', 'ctrTitle'].includes(placeholder);
      if (shape.localName === 'sp') {
        const body = child(shape, P, 'txBody');
        if (body) children(body, A, 'p').forEach((p, paraIndex) => entries.push({ p, shapeId, paraIndex, title, placeholder }));
      } else {
        all(shape, A, 'tbl').forEach((tbl, table) => children(tbl, A, 'tr').forEach((tr, row) => children(tr, A, 'tc').forEach((tc, col) => {
          const body = child(tc, A, 'txBody');
          if (body) children(body, A, 'p').forEach((p, paraIndex) => entries.push({ p, shapeId, paraIndex, cell: { table, row, col } }));
        })));
      }
    }
  };
  const tree = all(dom, P, 'spTree')[0];
  if (tree) walk(tree);
  return entries;
}
module.exports = { P, A, child, children, all, parse, relationships, loadPptx, paragraphText, slideParagraphs };
