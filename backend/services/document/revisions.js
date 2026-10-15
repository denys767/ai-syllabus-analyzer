// Прийняти або відхилити всі tracked changes у .docx (аналог «Accept All» / «Reject All» у Word).
// Використовується в тестах (accept(tracked) == clean) і може знадобитися застосунку.

const JSZip = require('jszip');
const {
  W_NS, isW, elementChildren, wChild, wChildren, textOf, parseXml, serializeDocument, flattenParagraph, docError,
} = require('./ooxml');

const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;
const PROPERTY_CHANGES = ['rPrChange', 'pPrChange', 'sectPrChange', 'tblPrChange', 'tblPrExChange', 'trPrChange',
  'tcPrChange', 'tblGridChange', 'numberingChange'];
const MOVE_RANGES = ['moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd'];

const all = (dom, local) => Array.from(dom.getElementsByTagNameNS(W_NS, local));
const attached = (node) => {
  for (let n = node; n; n = n.parentNode) if (n.nodeType === 9) return true;
  return false;
};
const remove = (node) => { if (node.parentNode) node.parentNode.removeChild(node); };
const isPropertyMarker = (node) => ['rPr', 'trPr', 'tcPr'].some((p) => isW(node.parentNode, p));

function unwrap(node) {
  const parent = node.parentNode;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
}

function rename(dom, node, local) {
  const fresh = dom.createElementNS(W_NS, `${node.prefix || 'w'}:${local}`);
  for (let i = 0; i < node.attributes.length; i += 1) {
    const a = node.attributes[i];
    fresh.setAttributeNS(a.namespaceURI, a.name, a.value);
  }
  fresh.appendChild(dom.createTextNode(textOf(node)));
  node.parentNode.replaceChild(fresh, node);
}

function paragraphMarkRevision(p, local) {
  return wChild(wChild(wChild(p, 'pPr'), 'rPr'), local);
}

function nextParagraph(p) {
  for (let n = p.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    return isW(n, 'p') ? n : null;
  }
  return null;
}

/** Знак абзацу прибрано: вміст переходить на початок наступного абзацу (властивості — від наступного). */
function mergeWithNext(p) {
  const hasContent = flattenParagraph(p).items.length > 0;
  const tc = isW(p.parentNode, 'tc') ? p.parentNode : null;
  if (!hasContent) {
    if (!tc || wChildren(tc, 'p').length > 1) remove(p);
    return;
  }
  const next = nextParagraph(p);
  if (!next) return;
  const anchor = wChild(next, 'pPr') ? wChild(next, 'pPr').nextSibling : next.firstChild;
  for (const c of [...p.childNodes]) if (!isW(c, 'pPr')) next.insertBefore(c, anchor);
  remove(p);
}

function rejectPropertyChange(change) {
  const parent = change.parentNode;
  const old = elementChildren(change)[0];
  if (isW(change, 'rPrChange')) {
    for (const c of elementChildren(parent)) if (c !== change && !['ins', 'del', 'moveFrom', 'moveTo'].includes(c.localName)) remove(c);
    if (old) for (const c of elementChildren(old)) parent.insertBefore(c, change);
  } else if (isW(change, 'pPrChange')) {
    for (const c of elementChildren(parent)) if (c !== change && !['rPr', 'sectPr'].includes(c.localName)) remove(c);
    if (old) for (const c of elementChildren(old).reverse()) parent.insertBefore(c, parent.firstChild);
  }
  remove(change);
}

function resolveDom(dom, action) {
  const accept = action === 'accept';
  const drop = accept ? ['del', 'moveFrom'] : ['ins', 'moveTo'];
  const keep = accept ? ['ins', 'moveTo'] : ['del', 'moveFrom'];

  // Абзаци, чий знак прибирається, — запам'ятати до зміни вмісту.
  const merging = all(dom, 'p').filter((p) => drop.some((l) => paragraphMarkRevision(p, l)));

  for (const local of drop) {
    for (const node of all(dom, local)) {
      if (!attached(node)) continue;
      // рядок таблиці з позначкою видалення/вставки зникає цілком; решта — маркер або вміст
      remove(isW(node.parentNode, 'trPr') ? node.parentNode.parentNode : node);
    }
  }
  for (const local of keep) {
    for (const node of all(dom, local)) {
      if (!attached(node)) continue;
      if (isPropertyMarker(node)) { remove(node); continue; }
      if (!accept) {
        for (const t of all(node, 'delText')) rename(dom, t, 't');
        for (const t of all(node, 'delInstrText')) rename(dom, t, 'instrText');
      }
      unwrap(node);
    }
  }
  for (const p of merging) if (attached(p)) mergeWithNext(p);

  for (const local of PROPERTY_CHANGES) {
    for (const node of all(dom, local)) {
      if (!attached(node)) continue;
      if (accept) remove(node);
      else rejectPropertyChange(node);
    }
  }
  for (const local of [...MOVE_RANGES, 'cellIns', 'cellDel', 'cellMerge']) all(dom, local).forEach(remove);
}

async function resolveAll(buffer, action) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw docError('Файл не є коректним DOCX-архівом', 422, 'INVALID_DOCX');
  }
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    const dom = parseXml(await zip.file(name).async('string'), name);
    resolveDom(dom, action);
    zip.file(name, serializeDocument(dom));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Прийняти всі зміни: w:ins розгортається, w:del зникає, абзаци з видаленим знаком зливаються. */
const acceptAllRevisions = (buffer) => resolveAll(buffer, 'accept');
/** Відхилити всі зміни: протилежне до acceptAllRevisions. */
const rejectAllRevisions = (buffer) => resolveAll(buffer, 'reject');

module.exports = { acceptAllRevisions, rejectAllRevisions };
