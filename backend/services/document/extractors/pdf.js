const { computeDocVersion, formatBlockId } = require('../model');
const { docError } = require('../ooxml');
const { readPdf } = require('../pdfRuntime');

const union = (boxes) => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
const bullet = (text) => /^(?:[•●▪◦‣–-]|\d+[.)])\s+/u.test(text);
function itemBox(item, style) {
  const [a, b, c, d, x, y] = item.transform;
  const size = Math.hypot(c, d) || item.height || 1;
  const scale = Math.hypot(a, b) || size;
  const ux = a / scale; const uy = b / scale;
  const vx = c / size; const vy = d / size;
  const descent = style?.descent ?? -0.2; const ascent = style?.ascent ?? 0.8;
  const corners = [0, item.width].flatMap((w) => [descent, ascent].map((h) => [x + ux * w + vx * size * h, y + uy * w + vy * size * h]));
  return { bbox: [Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1])),
    Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1]))], size, baseline: y };
}
function pageLines(page) {
  const items = page.items.filter((i) => typeof i.str === 'string' && i.str.trim()).map((i) => ({ ...i, ...itemBox(i, page.styles[i.fontName]) }));
  items.sort((a, b) => b.baseline - a.baseline || a.bbox[0] - b.bbox[0]);
  const rows = [];
  for (const item of items) {
    let row = rows.find((r) => Math.abs(r.baseline - item.baseline) <= Math.max(1.5, Math.min(r.size, item.size) * 0.22));
    if (!row) { row = { baseline: item.baseline, size: item.size, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  const lines = [];
  for (const row of rows) {
    const segments = [];
    for (const item of row.items.sort((a, b) => a.bbox[0] - b.bbox[0])) {
      let segment = segments[segments.length - 1];
      const prev = segment?.[segment.length - 1];
      // Великі горизонтальні проміжки: окремі клітинки/колонки, а не речення.
      if (!segment || item.bbox[0] - prev.bbox[2] > Math.max(item.size, prev.size) * 2.5) { segment = []; segments.push(segment); }
      segment.push(item);
    }
    for (const segment of segments) {
      let text = '';
      const spans = [];
      segment.forEach((item, i) => {
        const prev = segment[i - 1];
        if (prev && !/\s$/.test(text) && !/^\s/.test(item.str) && item.bbox[0] - prev.bbox[2] > item.size * 0.12) text += ' ';
        const start = text.length;
        text += item.str;
        spans.push({ start, end: text.length, text: item.str, bbox: item.bbox });
      });
      lines.push({ text, bbox: union(segment.map((i) => i.bbox)), baseline: row.baseline,
        size: Math.max(...segment.map((i) => i.size)), spans });
    }
  }
  return lines.sort((a, b) => b.baseline - a.baseline || a.bbox[0] - b.bbox[0]);
}
async function extractPdf(buffer) {
  const pages = await readPdf(buffer);
  const blocks = [];
  let sectionId;
  for (const [pageIndex, page] of pages.entries()) {
    const lines = pageLines(page);
    // Мода, зважена довжиною тексту, менше залежить від великих заголовків.
    const weights = new Map();
    lines.forEach((l) => { const s = Math.round(l.size); weights.set(s, (weights.get(s) || 0) + l.text.length); });
    const bodySize = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
    let current;
    let previous;
    for (const line of lines) {
      const heading = line.size > bodySize * 1.18;
      const kind = heading ? 'heading' : bullet(line.text) ? 'list-item' : 'paragraph';
      const gap = previous ? previous.baseline - line.baseline : Infinity;
      const continuation = current && kind === 'paragraph' && current.kind !== 'heading'
        && gap > 0 && gap <= Math.max(previous.size, line.size) * 1.5
        && Math.abs(line.size - previous.size) < line.size * 0.15
        && Math.abs(line.bbox[0] - previous.bbox[0]) <= line.size * 1.2;
      if (!continuation) {
        current = { id: formatBlockId(blocks.length + 1), kind, text: '', locator: { page: pageIndex + 1, bbox: line.bbox, lineBoxes: [] } };
        if (kind === 'heading') { current.level = line.size > bodySize * 1.6 ? 1 : 2; sectionId = current.id; }
        if (kind === 'list-item') { current.level = 1; current.listFormat = /^\d/.test(line.text) ? 'decimal' : 'bullet'; }
        if (sectionId) current.sectionId = sectionId;
        blocks.push(current);
      }
      if (current.text) current.text += ' ';
      const start = current.text.length;
      current.text += line.text;
      current.locator.lineBoxes.push({ bbox: line.bbox, text: line.text, start, end: current.text.length,
        spans: line.spans.map((s) => ({ ...s, start: start + s.start, end: start + s.end })) });
      current.locator.bbox = union(current.locator.lineBoxes.map((l) => l.bbox));
      previous = line;
    }
  }
  if (!blocks.length) throw docError('PDF не містить тексту. Розпізнавання сканованих документів (OCR) поки не підтримується.', 422, 'PDF_NO_TEXT');
  return { format: 'pdf', docVersion: computeDocVersion(buffer), blocks, meta: { pageCount: pages.length } };
}
function pdfBlocksToParagraphs(doc) {
  return doc.blocks.filter((b) => !b.readOnly).map((b) => ({ kind: ['heading', 'list-item'].includes(b.kind) ? b.kind : 'paragraph', level: b.level, text: b.text }));
}
module.exports = { extractPdf, pdfBlocksToParagraphs };
