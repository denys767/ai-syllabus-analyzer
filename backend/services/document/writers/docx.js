// DocModel + прийняті пропозиції → той самий .docx з правками (clean) або з tracked changes.
// Оригінальний document.xml патчиться на місці: серіалізуються лише змінені абзаци,
// решта XML лишається байт-у-байт.

const { applyAccepted, diffBlock, validateOps } = require('../apply');
const { computeDocVersion } = require('../model');
const {
  W_NS, W14_NS, XML_NS, docError, parseXml, serializeFragment, rootNamespaces,
  isW, elementChildren, wChild, textOf, loadPackage, readPart, bodyParagraphs, scanParagraphRanges,
  wPrefix, readStyles, readNumbering, classifyParagraph, flattenParagraph, DOCUMENT_PART,
} = require('../ooxml');

const DEFAULT_AUTHOR = 'KSE Syllabus Analyzer';
const TEXT_KINDS = new Set(['text', 'tab', 'br', 'text-like']);
const REVISION_MARKS = ['ins', 'del', 'moveFrom', 'moveTo', 'rPrChange'];
const BLOCK_LEVEL = new Set(['p', 'tbl', 'sdt', 'customXml']);
const COMMENTS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const COMMENTS_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';

function isoDate(value) {
  return new Date(value || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- DOM helpers ----------

function createContext(dom, opts) {
  return {
    dom,
    prefix: wPrefix(dom),
    tracked: opts.mode === 'tracked',
    author: opts.author || DEFAULT_AUTHOR,
    date: isoDate(opts.date),
    nextId: opts.firstId,
  };
}

function el(ctx, local) {
  return ctx.dom.createElementNS(W_NS, `${ctx.prefix}:${local}`);
}

function setW(ctx, node, name, value) {
  node.setAttributeNS(W_NS, `${ctx.prefix}:${name}`, String(value));
}

function revision(ctx, local) {
  const node = el(ctx, local);
  setW(ctx, node, 'id', ctx.nextId++);
  setW(ctx, node, 'author', ctx.author);
  setW(ctx, node, 'date', ctx.date);
  return node;
}

function insertAfterNode(ref, node) {
  ref.parentNode.insertBefore(node, ref.nextSibling);
}

function textElement(ctx, local, text) {
  const t = el(ctx, local);
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  t.appendChild(ctx.dom.createTextNode(text));
  return t;
}

/** Копія rPr без позначок ревізій; null, якщо rPr немає. */
function cleanRPr(rPr) {
  if (!rPr) return null;
  const copy = rPr.cloneNode(true);
  for (const c of elementChildren(copy)) if (isW(c) && REVISION_MARKS.includes(c.localName)) copy.removeChild(c);
  return copy;
}

function makeRun(ctx, rPr, text) {
  const r = el(ctx, 'r');
  const props = cleanRPr(rPr);
  if (props) r.appendChild(props);
  for (const piece of String(text).split(/(\t|\n)/)) {
    if (piece === '\t') r.appendChild(el(ctx, 'tab'));
    else if (piece === '\n') r.appendChild(el(ctx, 'br'));
    else if (piece) r.appendChild(textElement(ctx, 't', piece));
  }
  return r;
}

function ensurePPr(ctx, p) {
  let pPr = wChild(p, 'pPr');
  if (!pPr) {
    pPr = el(ctx, 'pPr');
    p.insertBefore(pPr, p.firstChild);
  }
  return pPr;
}

/** Позначає знак абзацу як вставлений/видалений: w:pPr/w:rPr/(w:ins|w:del) першим елементом rPr. */
function markParagraphMark(ctx, p, local) {
  const pPr = ensurePPr(ctx, p);
  let rPr = wChild(pPr, 'rPr');
  if (!rPr) {
    rPr = el(ctx, 'rPr');
    const before = wChild(pPr, 'sectPr') || wChild(pPr, 'pPrChange');
    pPr.insertBefore(rPr, before);
  }
  rPr.insertBefore(revision(ctx, local), rPr.firstChild);
}

/** Чи можна прибрати абзац (або видалити його знак): після нього є інший блочний елемент. */
function hasFollowingBlock(p) {
  for (let n = p.nextSibling; n; n = n.nextSibling) if (isW(n) && BLOCK_LEVEL.has(n.localName)) return true;
  return false;
}

function itemLength(node) {
  if (isW(node, 't')) return textOf(node).length;
  if (isW(node) && ['tab', 'br', 'cr', 'noBreakHyphen'].includes(node.localName)) return 1;
  return 0;
}

/**
 * Розбиває run на окремі run-и по одному елементу вмісту, а w:t — ще й у точках `points`
 * (абсолютні офсети абзацу). rPr копіюється в кожен новий run.
 */
function explodeRun(ctx, run, runStart, points) {
  const rPr = wChild(run, 'rPr');
  const fresh = () => {
    const r = run.cloneNode(false);
    if (rPr) r.appendChild(rPr.cloneNode(true));
    return r;
  };
  const out = [];
  let pos = runStart;
  for (const c of elementChildren(run)) {
    if (isW(c, 'rPr')) continue;
    const len = itemLength(c);
    if (isW(c, 't')) {
      const text = textOf(c);
      const cuts = [0, ...points.filter((x) => x > pos && x < pos + len).map((x) => x - pos), len];
      for (let i = 0; i < cuts.length - 1; i += 1) {
        const piece = text.slice(cuts[i], cuts[i + 1]);
        if (!piece) continue;
        const r = fresh();
        r.appendChild(textElement(ctx, 't', piece));
        out.push(r);
      }
    } else {
      const r = fresh();
      r.appendChild(c);
      out.push(r);
    }
    pos += len;
  }
  for (const r of out) run.parentNode.insertBefore(r, run);
  run.parentNode.removeChild(run);
}

/** Інформація про run-и абзацу: офсети і чи містить run лише текстові елементи. */
function runInfo(p) {
  const flat = flattenParagraph(p);
  const info = new Map();
  for (const it of flat.items) {
    const cur = info.get(it.run) || { run: it.run, start: it.start, end: it.end, textual: true };
    cur.start = Math.min(cur.start, it.start);
    cur.end = Math.max(cur.end, it.end);
    if (!TEXT_KINDS.has(it.kind)) cur.textual = false;
    info.set(it.run, cur);
  }
  for (const r of flat.runs) if (!info.has(r)) info.set(r, { run: r, start: -1, end: -1, textual: false });
  return { flat, runs: [...info.values()].filter((x) => x.start >= 0) };
}

function toDelText(ctx, run) {
  for (const c of elementChildren(run)) {
    if (isW(c, 't')) run.replaceChild(textElement(ctx, 'delText', textOf(c)), c);
    else if (isW(c, 'instrText')) run.replaceChild(textElement(ctx, 'delInstrText', textOf(c)), c);
  }
}

/** Видаляє run-и: у tracked — обгортає суміжні в w:del, у clean — прибирає. */
function deleteRuns(ctx, runs) {
  const groups = [];
  for (const r of runs) {
    const last = groups[groups.length - 1];
    let prev = r.previousSibling;
    while (prev && prev.nodeType !== 1) prev = prev.previousSibling;
    if (last && prev === last[last.length - 1]) last.push(r);
    else groups.push([r]);
  }
  const anchors = [];
  for (const g of groups) {
    if (ctx.tracked) {
      const del = revision(ctx, 'del');
      g[0].parentNode.insertBefore(del, g[0]);
      for (const r of g) {
        toDelText(ctx, r);
        del.appendChild(r);
      }
      anchors.push({ after: del });
    } else {
      const parent = g[0].parentNode;
      const next = g[g.length - 1].nextSibling;
      for (const r of g) parent.removeChild(r);
      anchors.push({ parent, before: next });
    }
  }
  return anchors;
}

function placeInsertion(ctx, node, anchor) {
  if (anchor.after) insertAfterNode(anchor.after, node);
  else anchor.parent.insertBefore(node, anchor.before || null);
}

function wrapInserted(ctx, run) {
  if (!ctx.tracked) return run;
  const ins = revision(ctx, 'ins');
  ins.appendChild(run);
  return ins;
}

function markRPr(p) {
  return wChild(wChild(p, 'pPr'), 'rPr');
}

/** Хунки diff-у в координатах старого тексту: {start, end, insert}. */
function toHunks(oldText, newText) {
  const hunks = [];
  let pos = 0;
  let cur = null;
  for (const part of diffBlock(oldText, newText)) {
    if (part.type === 'equal') {
      if (cur) hunks.push(cur);
      cur = null;
      pos += part.text.length;
    } else {
      if (!cur) cur = { start: pos, end: pos, insert: '' };
      if (part.type === 'delete') {
        cur.end += part.text.length;
        pos += part.text.length;
      } else cur.insert += part.text;
    }
  }
  if (cur) hunks.push(cur);
  return hunks;
}

/** replaceBlock: мінімальні w:del/w:ins (або пряма заміна) на рівні слів. */
function replaceParagraphText(ctx, p, oldText, newText) {
  const hunks = toHunks(oldText, newText);
  if (!hunks.length) return;
  const points = [...new Set(hunks.flatMap((h) => [h.start, h.end]))];

  // 1) розбити run-и, що зачіпають хунки, щоб межі змін збігалися з межами run-ів
  for (const info of runInfo(p).runs) {
    const touched = hunks.some((h) => info.start <= h.end && info.end >= h.start && info.end > info.start);
    if (touched) explodeRun(ctx, info.run, info.start, points);
  }
  const { runs } = runInfo(p);

  for (const h of hunks) {
    const inRange = runs.filter((r) => r.end > r.start && r.start < h.end && r.end > h.start);
    if (inRange.some((r) => r.start < h.start || r.end > h.end || !r.textual)) {
      throw docError('Внутрішня помилка: межа зміни потрапила всередину атомарного елемента', 500, 'WRITER_SPLIT_FAILED');
    }
    let anchor = null;
    let refRPr = null;
    if (inRange.length) {
      refRPr = wChild(inRange[0].run, 'rPr');
      const anchors = deleteRuns(ctx, inRange.map((r) => r.run));
      anchor = anchors[anchors.length - 1];
    }
    if (!h.insert) continue;
    if (!anchor) {
      const textual = runs.filter((r) => r.end > r.start);
      const prev = [...textual].reverse().find((r) => r.end === h.start);
      const next = textual.find((r) => r.start === h.start);
      const pick = (prev && prev.run.parentNode === p && prev)
        || (next && next.run.parentNode === p && next) || prev || next;
      if (pick === prev && prev) anchor = { after: prev.run };
      else if (pick) anchor = { parent: pick.run.parentNode, before: pick.run };
      else {
        const before = [...runs].reverse().find((r) => r.end <= h.start);
        anchor = before ? { after: before.run } : { parent: p, before: null };
      }
      refRPr = pick ? wChild(pick.run, 'rPr') : markRPr(p);
    }
    placeInsertion(ctx, wrapInserted(ctx, makeRun(ctx, refRPr, h.insert)), anchor);
  }
}

/** deleteBlock. @returns {boolean} true, якщо абзац треба прибрати з XML повністю (clean). */
function deleteParagraph(ctx, p, removable) {
  if (!ctx.tracked) {
    if (removable) return true;
    for (const c of elementChildren(p)) if (!isW(c, 'pPr')) p.removeChild(c);
    return false;
  }
  deleteRuns(ctx, flattenParagraph(p).runs);
  if (removable) markParagraphMark(ctx, p, 'del');
  return false;
}

// ---------- insertAfter ----------

function dominantRPr(p) {
  const { flat } = runInfo(p);
  const weight = new Map();
  for (const it of flat.items) {
    if (it.run.parentNode !== p || !TEXT_KINDS.has(it.kind)) continue;
    weight.set(it.run, (weight.get(it.run) || 0) + it.text.length);
  }
  let best = null;
  let max = 0;
  for (const [run, w] of weight) if (w > max) { max = w; best = run; }
  return best ? wChild(best, 'rPr') : markRPr(p);
}

function headingStyleId(styles, level) {
  for (const s of styles.values()) if (new RegExp(`^heading\\s*${level}$`, 'i').test(s.name)) return s.id;
  return `Heading${level}`;
}

/** Шаблон для нового абзацу: якір того ж типу, інакше найближчий блок того ж типу. */
function pickTemplate(env, anchorBlock, nb) {
  const matches = (p) => {
    const cls = classifyParagraph(p, env.styles, env.numbering);
    return !cls.isToc && cls.kind === nb.kind && (nb.kind !== 'heading' || nb.level == null || cls.level === nb.level);
  };
  const anchorEl = env.paragraphs[anchorBlock.locator.docx.paraIndex];
  if (matches(anchorEl)) return anchorEl;
  if (anchorBlock.kind === 'table-cell') return null;
  const idx = env.doc.blocks.indexOf(anchorBlock);
  const blocks = env.doc.blocks;
  for (let d = 1; d < blocks.length; d += 1) {
    for (const b of [blocks[idx + d], blocks[idx - d]]) {
      if (!b || b.readOnly || b.kind === 'table-cell') continue;
      const candidate = env.paragraphs[b.locator.docx.paraIndex];
      if (matches(candidate)) return candidate;
    }
  }
  return null;
}

function buildParagraph(ctx, env, template, nb) {
  const p = el(ctx, 'p');
  let pPr = null;
  if (template && wChild(template, 'pPr')) {
    pPr = wChild(template, 'pPr').cloneNode(true);
    for (const c of elementChildren(pPr)) if (isW(c, 'sectPr') || isW(c, 'pPrChange')) pPr.removeChild(c);
    const mark = wChild(pPr, 'rPr');
    if (mark) pPr.replaceChild(cleanRPr(mark), mark);
    const ilvl = wChild(wChild(pPr, 'numPr'), 'ilvl');
    if (nb.kind === 'list-item' && nb.level && ilvl) setW(ctx, ilvl, 'val', nb.level - 1);
  } else if (nb.kind === 'heading') {
    pPr = el(ctx, 'pPr');
    const style = el(ctx, 'pStyle');
    setW(ctx, style, 'val', nb.level === 0 ? 'Title' : headingStyleId(env.styles, nb.level || 1));
    pPr.appendChild(style);
  }
  if (pPr) p.appendChild(pPr);
  if (ctx.tracked) markParagraphMark(ctx, p, 'ins');
  p.appendChild(wrapInserted(ctx, makeRun(ctx, template ? dominantRPr(template) : null, nb.text)));
  return p;
}

// ---------- comments ----------

function addCommentMarkers(ctx, p, id) {
  const start = el(ctx, 'commentRangeStart');
  setW(ctx, start, 'id', id);
  const pPr = wChild(p, 'pPr');
  p.insertBefore(start, pPr ? pPr.nextSibling : p.firstChild);
  const end = el(ctx, 'commentRangeEnd');
  setW(ctx, end, 'id', id);
  p.appendChild(end);
  const r = el(ctx, 'r');
  const ref = el(ctx, 'commentReference');
  setW(ctx, ref, 'id', id);
  r.appendChild(ref);
  p.appendChild(r);
}

async function writeComments(zip, ctx, comments) {
  const prefix = 'w';
  const items = comments.map((c) => `<${prefix}:comment ${prefix}:id="${c.id}" ${prefix}:author="${escapeXml(ctx.author)}" ${prefix}:date="${ctx.date}" ${prefix}:initials="KSE"><${prefix}:p><${prefix}:r><${prefix}:t xml:space="preserve">${escapeXml(c.text)}</${prefix}:t></${prefix}:r></${prefix}:p></${prefix}:comment>`).join('');
  const existing = await readPart(zip, 'word/comments.xml');
  if (existing) {
    const closeTag = existing.lastIndexOf('</');
    zip.file('word/comments.xml', existing.slice(0, closeTag) + items + existing.slice(closeTag));
    return;
  }
  zip.file('word/comments.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="${W_NS}">${items}</w:comments>`);

  const relsName = 'word/_rels/document.xml.rels';
  let rels = await readPart(zip, relsName);
  if (rels && !rels.includes(COMMENTS_REL)) {
    const used = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
    let n = used.size + 1;
    while (used.has(`rId${n}`)) n += 1;
    rels = rels.replace('</Relationships>', `<Relationship Id="rId${n}" Type="${COMMENTS_REL}" Target="comments.xml"/></Relationships>`);
    zip.file(relsName, rels);
  }
  let types = await readPart(zip, '[Content_Types].xml');
  if (types && !types.includes('/word/comments.xml')) {
    types = types.replace('</Types>', `<Override PartName="/word/comments.xml" ContentType="${COMMENTS_CT}"/></Types>`);
    zip.file('[Content_Types].xml', types);
  }
}

// ---------- main ----------

/**
 * Якщо в settings.xml вимкнено показ правок (w:revisionView, режим «Без виправлень» у Word),
 * LibreOffice експортує PDF без них. Для tracked-версії прибираємо таке налаштування.
 */
async function ensureRevisionsVisible(zip) {
  const name = 'word/settings.xml';
  const xml = await readPart(zip, name);
  if (!xml) return;
  const next = xml.replace(/<w:revisionView\b[^>]*\/>/g, (tag) => (
    /w:(insDel|markup)="(0|false|off)"/.test(tag) ? '' : tag
  ));
  if (next !== xml) zip.file(name, next);
}

async function maxNumericId(zip) {
  let max = 0;
  const names = Object.keys(zip.files).filter((n) => /^word\/.*\.xml$/.test(n));
  for (const name of names) {
    const xml = await zip.file(name).async('string');
    for (const m of xml.matchAll(/\s[\w-]+:id="(\d+)"/g)) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function checkInputs(originalBuffer, doc, accepted) {
  if (doc.format !== 'docx') throw docError('Модель документа не належить до DOCX', 400, 'BAD_FORMAT');
  if (doc.docVersion && doc.docVersion !== computeDocVersion(originalBuffer)) {
    throw docError('Файл змінився після аналізу. Потрібен повторний аналіз.', 409, 'STALE_DOC_VERSION');
  }
  const errors = (accepted || []).flatMap((s) => validateOps(doc, s.ops, { strict: false }).map((e) => ({ suggestionId: s.id, ...e })));
  if (errors.length) throw docError('Некоректні операції в прийнятих пропозиціях', 422, 'INVALID_OPS', { errors });
}

/**
 * Записує .docx з прийнятими пропозиціями.
 * @param {Buffer} originalBuffer  оригінальний файл (той самий, з якого зроблено doc)
 * @param {import('../model').DocModel} doc
 * @param {import('../model').Suggestion[]} acceptedSuggestions  у порядку прийняття
 * @param {{mode?: 'clean'|'tracked', author?: string, date?: Date|string, comments?: boolean}} [opts]
 *   comments: у tracked-режимі додає w:comment із suggestion.rationale до першого зміненого абзацу пропозиції
 * @returns {Promise<Buffer>}
 */
async function writeDocx(originalBuffer, doc, acceptedSuggestions, opts = {}) {
  const accepted = acceptedSuggestions || [];
  checkInputs(originalBuffer, doc, accepted);
  const result = applyAccepted(doc, accepted);
  if (result.conflicts.length) {
    throw docError('Прийняті пропозиції конфліктують між собою', 409, 'SUGGESTION_CONFLICT', { conflicts: result.conflicts });
  }
  if (!result.changes.length) return Buffer.from(originalBuffer);

  const { zip, xml } = await loadPackage(originalBuffer);
  const dom = parseXml(xml, 'document.xml');
  const ctx = createContext(dom, { ...opts, firstId: (await maxNumericId(zip)) + 1 });
  const paragraphs = bodyParagraphs(dom);
  const ranges = scanParagraphRanges(xml, ctx.prefix);
  if (ranges.length !== paragraphs.length || ranges.some((r) => r.end < 0)) {
    throw docError('Не вдалося зіставити абзаци document.xml', 422, 'INVALID_DOCX');
  }
  const env = {
    doc,
    paragraphs,
    styles: readStyles(await readPart(zip, 'word/styles.xml')),
    numbering: readNumbering(await readPart(zip, 'word/numbering.xml')),
  };
  const blocks = new Map(doc.blocks.map((b) => [b.id, b]));

  const edits = [];
  const firstParagraphOf = new Map(); // suggestionId -> w:p (для коментаря)
  const remember = (ids, p) => ids.forEach((id) => { if (!firstParagraphOf.has(id)) firstParagraphOf.set(id, p); });

  for (const change of result.changes) {
    const block = blocks.get(change.blockId);
    const { paraIndex, paraId } = block.locator.docx;
    const p = paragraphs[paraIndex];
    const actualId = p && p.getAttributeNS(W14_NS, 'paraId');
    if (!p || (paraId && actualId !== paraId) || flattenParagraph(p).text !== block.text) {
      throw docError('Документ не відповідає моделі (абзац змінився)', 409, 'DOC_MISMATCH', { blockId: block.id });
    }

    let removeOriginal = false;
    if (change.type === 'replace') {
      replaceParagraphText(ctx, p, block.text, change.text);
      remember(change.suggestionIds, p);
    } else if (change.type === 'delete') {
      removeOriginal = deleteParagraph(ctx, p, change.inserts.length > 0 || hasFollowingBlock(p));
      if (!removeOriginal) remember(change.suggestionIds, p);
    }
    const inserted = [];
    for (const ins of change.inserts) {
      for (const nb of ins.newBlocks) {
        const np = buildParagraph(ctx, env, pickTemplate(env, block, nb), nb);
        inserted.push(np);
        remember([ins.sid], np);
      }
    }
    edits.push({ range: ranges[paraIndex], p: removeOriginal ? null : p, inserted });
  }

  if (ctx.tracked) await ensureRevisionsVisible(zip);
  if (ctx.tracked && opts.comments) {
    const comments = [];
    for (const s of accepted) {
      const p = firstParagraphOf.get(s.id);
      if (!p || !s.rationale || !String(s.rationale).trim()) continue;
      const id = ctx.nextId++;
      addCommentMarkers(ctx, p, id);
      comments.push({ id, text: String(s.rationale).trim() });
    }
    if (comments.length) await writeComments(zip, ctx, comments);
  }

  const ns = rootNamespaces(dom);
  let out = xml;
  for (const e of edits.sort((a, b) => b.range.start - a.range.start)) {
    const nodes = (e.p ? [e.p] : []).concat(e.inserted);
    out = out.slice(0, e.range.start) + nodes.map((n) => serializeFragment(n, ns)).join('') + out.slice(e.range.end);
  }
  zip.file(DOCUMENT_PART, out);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { writeDocx, DEFAULT_AUTHOR, toHunks };
