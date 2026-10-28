// Word-level diff (перенесено з services/document/apply.js) і diff двох текстових подань стану (render.js).
// diffRendered — для тумблера diff у правій панелі: baselineState проти поточного стану.
const { diffArrays } = require('diff');

const TOKEN_RE = /\s+|[\p{L}\p{M}\p{N}_]+(?:['’ʼ][\p{L}\p{M}\p{N}_]+)*|[^\s\p{L}\p{M}\p{N}_]/gu;

/** Токени: слова (з апострофами всередині), пробільні послідовності, окремі знаки. */
function tokenize(text) {
  return String(text || '').match(TOKEN_RE) || [];
}

function pushPart(parts, type, text) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

/**
 * Пробіл (не табуляція і не розрив рядка) між двома замінами поглинається, щоб не було «конфеті»:
 * [-a-][+x+] [-b-][+y+] → [-a b-][+x y+].
 */
function absorbWhitespace(parts) {
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    const prevDel = out.length >= 2 && out[out.length - 2].type === 'delete' && out[out.length - 1].type === 'insert';
    const nextDel = parts[i + 1] && parts[i + 1].type === 'delete' && parts[i + 2] && parts[i + 2].type === 'insert';
    if (p.type === 'equal' && /^[  ]+$/.test(p.text) && prevDel && nextDel) {
      out[out.length - 2].text += p.text + parts[i + 1].text;
      out[out.length - 1].text += p.text + parts[i + 2].text;
      i += 3;
    } else {
      out.push({ ...p });
      i += 1;
    }
  }
  return out;
}

/**
 * Word-level diff двох текстів блоку.
 * @returns {{type: 'equal'|'delete'|'insert', text: string}[]}  (delete завжди перед insert)
 */
function diffBlock(oldText, newText) {
  const parts = [];
  for (const ch of diffArrays(tokenize(oldText), tokenize(newText))) {
    pushPart(parts, ch.added ? 'insert' : ch.removed ? 'delete' : 'equal', ch.value.join(''));
  }
  return absorbWhitespace(parts);
}

// ---------- diff відрендереного стану ----------

const PART_TYPE = { equal: 'eq', delete: 'del', insert: 'ins' };
const blockKey = (b) => `${b.kind}\u0000${b.text}`;
const whole = (type, b) => ({ kind: b.kind, text: b.text, parts: b.text ? [{ type, text: b.text }] : [] });

/**
 * Блоки секції: однакові (kind + text) — eq; підряд видалені й вставлені блоки того самого kind
 * паруються по черзі й отримують word-diff; решта — повністю del або ins.
 * Для видаленого блоку text — старий текст, для решти — поточний.
 */
function diffBlocks(before = [], after = []) {
  const out = [];
  let removed = [];
  const flush = (added) => {
    const queue = [...removed];
    for (const b of added) {
      const i = queue.findIndex((r) => r.kind === b.kind);
      if (i === -1) { out.push(whole('ins', b)); continue; }
      // Видалені блоки до пари виводимо в їхньому порядку
      for (const r of queue.splice(0, i)) out.push(whole('del', r));
      const old = queue.shift();
      out.push({ kind: b.kind, text: b.text, parts: diffBlock(old.text, b.text).map((p) => ({ type: PART_TYPE[p.type], text: p.text })) });
    }
    for (const r of queue) out.push(whole('del', r));
    removed = [];
  };
  const byKey = new Map([...before, ...after].map((b) => [blockKey(b), b]));
  for (const ch of diffArrays(before.map(blockKey), after.map(blockKey))) {
    const blocks = ch.value.map((k) => byKey.get(k));
    if (ch.removed) removed.push(...blocks);
    else if (ch.added) flush(blocks);
    else {
      flush([]);
      out.push(...blocks.map((b) => whole('eq', b)));
    }
  }
  flush([]);
  return out;
}

/**
 * diff двох результатів renderState: секції в порядку поточного подання (секції, яких більше немає, — у кінці),
 * кожен блок має parts [{ type: 'eq'|'del'|'ins', text }].
 */
function diffRendered(baselineRendered, currentRendered) {
  const baseSections = baselineRendered?.sections || [];
  const curSections = currentRendered?.sections || [];
  const baseByKey = new Map(baseSections.map((s) => [s.key, s]));
  const curKeys = new Set(curSections.map((s) => s.key));
  const sections = curSections.map((s) => ({ ...s, blocks: diffBlocks(baseByKey.get(s.key)?.blocks || [], s.blocks) }));
  for (const s of baseSections) {
    if (!curKeys.has(s.key)) sections.push({ ...s, blocks: diffBlocks(s.blocks, []) });
  }
  return { sections };
}

module.exports = { tokenize, diffBlock, diffBlocks, diffRendered };
