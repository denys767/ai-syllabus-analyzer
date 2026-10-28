// Спільні низькорівневі утиліти для WordprocessingML (лише читання): парсинг,
// пошук абзаців тіла, класифікація абзаців і «сплющення» тексту абзацу.

const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const DOCUMENT_PART = 'word/document.xml';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function docError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function parseXml(xml, partName = 'xml') {
  const parser = new DOMParser({
    onError(level, msg) {
      if (level !== 'warning') throw docError(`Пошкоджений XML у ${partName}: ${msg}`, 422, 'INVALID_DOCX');
    },
  });
  return parser.parseFromString(xml, 'text/xml');
}

function isW(node, localName) {
  return Boolean(node) && node.nodeType === ELEMENT_NODE && node.namespaceURI === W_NS
    && (localName === undefined || node.localName === localName);
}

function elementChildren(node) {
  const out = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.nodeType === ELEMENT_NODE) out.push(c);
  return out;
}

function wChild(node, localName) {
  for (let c = node && node.firstChild; c; c = c.nextSibling) if (isW(c, localName)) return c;
  return null;
}

function wChildren(node, localName) {
  return elementChildren(node).filter((c) => isW(c, localName));
}

function wAttr(el, name) {
  if (!el) return null;
  const v = el.getAttributeNS(W_NS, name);
  return v === '' || v == null ? (el.getAttribute(`w:${name}`) || null) : v;
}

function closestW(node, localName, stopAt) {
  for (let n = node.parentNode; n && n !== stopAt; n = n.parentNode) if (isW(n, localName)) return n;
  return null;
}

function textOf(el) {
  let s = '';
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === TEXT_NODE || c.nodeType === 4) s += c.data;
  return s;
}

async function loadPackage(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw docError('Файл не є коректним DOCX-архівом', 422, 'INVALID_DOCX');
  }
  const file = zip.file(DOCUMENT_PART);
  if (!file) throw docError('У DOCX немає word/document.xml', 422, 'INVALID_DOCX');
  const xml = await file.async('string');
  return { zip, xml };
}

async function readPart(zip, name) {
  const f = zip.file(name);
  return f ? f.async('string') : null;
}

function bodyOf(dom) {
  const body = wChild(dom.documentElement, 'body');
  if (!body) throw docError('У document.xml немає w:body', 422, 'INVALID_DOCX');
  return body;
}

/** Усі w:p тіла в порядку документа (pre-order), включно з вкладеними (написи). */
function bodyParagraphs(dom) {
  return Array.from(bodyOf(dom).getElementsByTagNameNS(W_NS, 'p'));
}

// ---------- styles / numbering ----------

function readStyles(xml) {
  const map = new Map();
  if (!xml) return map;
  const dom = parseXml(xml, 'styles.xml');
  for (const st of Array.from(dom.getElementsByTagNameNS(W_NS, 'style'))) {
    if (wAttr(st, 'type') !== 'paragraph') continue;
    const id = wAttr(st, 'styleId');
    const pPr = wChild(st, 'pPr');
    const outline = wAttr(wChild(pPr, 'outlineLvl'), 'val');
    const numPr = wChild(pPr, 'numPr');
    map.set(id, {
      id,
      name: wAttr(wChild(st, 'name'), 'val') || id,
      basedOn: wAttr(wChild(st, 'basedOn'), 'val'),
      outlineLvl: outline != null ? Number(outline) : null,
      numId: numPr ? wAttr(wChild(numPr, 'numId'), 'val') : null,
    });
  }
  return map;
}

function readNumbering(xml) {
  const formats = new Map(); // numId -> [numFmt by ilvl]
  if (!xml) return formats;
  const dom = parseXml(xml, 'numbering.xml');
  const abstract = new Map();
  for (const an of Array.from(dom.getElementsByTagNameNS(W_NS, 'abstractNum'))) {
    const lvls = [];
    for (const lvl of wChildren(an, 'lvl')) lvls[Number(wAttr(lvl, 'ilvl')) || 0] = wAttr(wChild(lvl, 'numFmt'), 'val') || 'decimal';
    abstract.set(wAttr(an, 'abstractNumId'), lvls);
  }
  for (const num of Array.from(dom.getElementsByTagNameNS(W_NS, 'num'))) {
    formats.set(wAttr(num, 'numId'), abstract.get(wAttr(wChild(num, 'abstractNumId'), 'val')) || []);
  }
  return formats;
}

function styleChain(styles, id) {
  const chain = [];
  const seen = new Set();
  for (let cur = id; cur && styles.has(cur) && !seen.has(cur); cur = styles.get(cur).basedOn) {
    seen.add(cur);
    chain.push(styles.get(cur));
  }
  return chain;
}

/**
 * Базова класифікація абзацу без урахування таблиць: heading / list-item / paragraph.
 * @returns {{kind: string, level?: number, style?: string, styleName?: string, listFormat?: string, isToc: boolean}}
 */
function classifyParagraph(p, styles, numbering) {
  const pPr = wChild(p, 'pPr');
  const styleId = wAttr(wChild(pPr, 'pStyle'), 'val');
  const chain = styleChain(styles, styleId);
  const styleName = chain[0] ? chain[0].name : styleId;
  const isToc = /^toc\b/i.test(styleName || '') || /^TOC/.test(styleId || '');

  let headingLevel = null;
  const directOutline = wAttr(wChild(pPr, 'outlineLvl'), 'val');
  const nameMatch = /^heading\s*(\d)$/i.exec(styleName || '') || /^Heading(\d)$/.exec(styleId || '');
  if (/^title$/i.test(styleName || '') || styleId === 'Title') headingLevel = 0;
  else if (nameMatch) headingLevel = Number(nameMatch[1]);
  else if (directOutline != null && Number(directOutline) < 9) headingLevel = Number(directOutline) + 1;
  else {
    const withOutline = chain.find((s) => s.outlineLvl != null);
    if (withOutline && withOutline.outlineLvl < 9) headingLevel = withOutline.outlineLvl + 1;
  }

  const base = { style: styleId || undefined, styleName: styleName || undefined, isToc };
  if (headingLevel != null) return { ...base, kind: 'heading', level: headingLevel };

  const numPr = wChild(pPr, 'numPr');
  let numId = numPr ? wAttr(wChild(numPr, 'numId'), 'val') : null;
  let ilvl = numPr ? Number(wAttr(wChild(numPr, 'ilvl'), 'val') || 0) : 0;
  if (numId == null) {
    const s = chain.find((st) => st.numId != null);
    if (s) { numId = s.numId; ilvl = 0; }
  }
  if (numId != null && numId !== '0') {
    const fmts = numbering.get(numId) || [];
    return { ...base, kind: 'list-item', level: ilvl + 1, listFormat: fmts[ilvl] || undefined };
  }
  return { ...base, kind: 'paragraph' };
}

// ---------- flattening ----------

// Контейнери, у які спускаємося за текстом.
const DESCEND = new Set(['hyperlink', 'smartTag', 'customXml', 'dir', 'bdo', 'fldSimple', 'ins', 'moveTo', 'sdtContent']);
// Вміст run-а, що не має видимого тексту і не повинен розрізатися/змінюватися.
const ATOMIC = new Set(['drawing', 'pict', 'object', 'footnoteReference', 'endnoteReference', 'commentReference',
  'sym', 'ptab', 'separator', 'continuationSeparator', 'footnoteRef', 'endnoteRef', 'annotationRef',
  'lastRenderedPageBreak', 'softHyphen', 'pgNum', 'dayShort', 'monthShort', 'yearShort', 'dayLong', 'monthLong', 'yearLong']);
const FIELD = new Set(['fldChar', 'instrText', 'delInstrText']);
// Маркери діапазонів усередині абзацу — не текст і не перешкода.
const MARKERS = new Set(['bookmarkStart', 'bookmarkEnd', 'commentRangeStart', 'commentRangeEnd', 'proofErr',
  'permStart', 'permEnd', 'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd',
  'customXmlInsRangeStart', 'customXmlInsRangeEnd', 'customXmlDelRangeStart', 'customXmlDelRangeEnd']);

/**
 * Сплющує абзац у текст і перелік елементів run-ів з офсетами.
 * Не спускається у написи (w:txbxContent), пропускає w:del/w:moveFrom.
 * @returns {{text: string, items: Array, runs: Element[], flags: Object}}
 */
function flattenParagraph(p) {
  const items = [];
  const runs = [];
  const flags = { field: false, revision: false, lockedSdt: false, complex: false, sdt: false };
  let text = '';

  const pPr = wChild(p, 'pPr');
  const markRPr = wChild(pPr, 'rPr');
  if (markRPr && (wChild(markRPr, 'ins') || wChild(markRPr, 'del') || wChild(markRPr, 'moveFrom') || wChild(markRPr, 'moveTo'))) {
    flags.revision = true;
  }

  const push = (run, node, kind, value) => {
    items.push({ run, node, kind, text: value, start: text.length, end: text.length + value.length });
    text += value;
  };

  const walkRun = (r) => {
    runs.push(r);
    for (const c of elementChildren(r)) {
      if (!isW(c)) { push(r, c, 'atomic', ''); flags.complex = flags.complex || c.localName !== 'AlternateContent'; continue; }
      const n = c.localName;
      if (n === 'rPr') continue;
      if (n === 't') push(r, c, 'text', textOf(c));
      else if (n === 'tab') push(r, c, 'tab', '\t');
      else if (n === 'br' || n === 'cr') push(r, c, 'br', '\n');
      else if (n === 'noBreakHyphen') push(r, c, 'text-like', '‑');
      else if (FIELD.has(n)) { flags.field = true; push(r, c, 'field', ''); }
      else if (n === 'delText') { /* лише в w:del, пропускаємо */ }
      else if (n === 'ruby') { flags.complex = true; push(r, c, 'atomic', ''); }
      else push(r, c, 'atomic', '');
    }
  };

  const walk = (node) => {
    for (const c of elementChildren(node)) {
      if (!isW(c)) {
        // mc:AlternateContent, m:oMath тощо на рівні абзацу — не редагуємо.
        flags.complex = true;
        continue;
      }
      const n = c.localName;
      if (n === 'pPr' || MARKERS.has(n)) continue;
      if (n === 'r') walkRun(c);
      else if (n === 'del' || n === 'moveFrom') flags.revision = true;
      else if (n === 'sdt') {
        flags.sdt = true;
        const lock = wAttr(wChild(wChild(c, 'sdtPr'), 'lock'), 'val');
        if (lock === 'contentLocked' || lock === 'sdtContentLocked') flags.lockedSdt = true;
        const content = wChild(c, 'sdtContent');
        if (content) walk(content);
      } else if (DESCEND.has(n)) {
        if (n === 'ins' || n === 'moveTo') flags.revision = true;
        if (n === 'fldSimple') flags.field = true;
        walk(c);
      } else flags.complex = true;
    }
  };
  walk(p);
  return { text, items, runs, flags };
}

module.exports = {
  W_NS, W14_NS, DOCUMENT_PART, ELEMENT_NODE, ATOMIC, MARKERS,
  docError, parseXml,
  isW, elementChildren, wChild, wChildren, wAttr, closestW, textOf,
  loadPackage, readPart, bodyOf, bodyParagraphs,
  readStyles, readNumbering, classifyParagraph, flattenParagraph,
};
