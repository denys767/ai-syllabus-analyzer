// Чисті функції над DocModel: валідація операцій, застосування прийнятих пропозицій,
// word-level diff і 3-way merge, пошук конфліктів. Жодного XML тут немає.

const { diffArrays } = require('diff');
const { diff3Merge } = require('node-diff3');
const { blockMap } = require('./model');

const OPS = new Set(['replaceBlock', 'insertAfter', 'deleteBlock']);
const NEW_BLOCK_KINDS = new Set(['paragraph', 'heading', 'list-item']);
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

// ---------- diff ----------

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
 * Пробіл між двома замінами поглинається, щоб не було «конфеті»:
 * [-a-][+x+] [-b-][+y+] → [-a b-][+x y+].
 */
function absorbWhitespace(parts) {
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    const prevDel = out.length >= 2 && out[out.length - 2].type === 'delete' && out[out.length - 1].type === 'insert';
    const nextDel = parts[i + 1] && parts[i + 1].type === 'delete' && parts[i + 2] && parts[i + 2].type === 'insert';
    if (p.type === 'equal' && /^\s+$/.test(p.text) && prevDel && nextDel) {
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

/** Частка зміненого тексту в [0, 1]: (видалене + вставлене) / (старе + нове). */
function changeRatio(oldText, newText) {
  const total = String(oldText || '').length + String(newText || '').length;
  if (!total) return 0;
  const changed = diffBlock(oldText, newText)
    .filter((p) => p.type !== 'equal')
    .reduce((n, p) => n + p.text.length, 0);
  return changed / total;
}

/**
 * Word-level 3-way merge: base — оригінал блоку, a і b — дві редакції.
 * @returns {{ok: true, text: string} | {ok: false, conflicts: Array}}
 */
function merge3(base, a, b) {
  if (a === b) return { ok: true, text: a };
  if (a === base) return { ok: true, text: b };
  if (b === base) return { ok: true, text: a };
  const regions = diff3Merge(tokenize(a), tokenize(base), tokenize(b), { excludeFalseConflicts: true });
  const conflicts = regions.filter((r) => r.conflict).map((r) => ({
    base: r.conflict.o.join(''), a: r.conflict.a.join(''), b: r.conflict.b.join(''),
  }));
  if (conflicts.length) return { ok: false, conflicts };
  return { ok: true, text: regions.map((r) => r.ok.join('')).join('') };
}

// ---------- validation ----------

function opError(index, op, code, message) {
  return { index, op: op && op.op, blockId: op && op.blockId, code, message };
}

function checkText(text, index, op, field, block) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) {
    errors.push(opError(index, op, 'EMPTY_TEXT', `${field} must be a non-empty string`));
    return errors;
  }
  if (INVALID_XML_CHARS.test(text)) errors.push(opError(index, op, 'INVALID_CHARS', `${field} contains control characters`));
  if (text.includes('\n') && !(block && block.text.includes('\n'))) {
    errors.push(opError(index, op, 'MULTI_PARAGRAPH_TEXT',
      `${field} contains a line break; use insertAfter with separate newBlocks for new paragraphs`));
  }
  return errors;
}

/**
 * Перевіряє операції однієї пропозиції.
 * strict=true (за замовчуванням) додає змістові перевірки для зворотного зв'язку з LLM
 * (NO_CHANGE, переноси рядків); strict=false — лише структурні (для writer-а).
 * @returns {{index: number, op: string, blockId: string, code: string, message: string}[]}
 */
function validateOps(doc, ops, { strict = true } = {}) {
  if (!Array.isArray(ops) || ops.length === 0) return [opError(-1, null, 'NO_OPS', 'ops must be a non-empty array')];
  const blocks = blockMap(doc);
  const errors = [];
  const seen = new Map(); // blockId -> Set(op)

  ops.forEach((op, index) => {
    if (!op || !OPS.has(op.op)) {
      errors.push(opError(index, op, 'UNKNOWN_OP', `op must be one of ${[...OPS].join(', ')}`));
      return;
    }
    const block = blocks.get(op.blockId);
    if (!block) {
      errors.push(opError(index, op, 'UNKNOWN_BLOCK', `block ${op.blockId} does not exist`));
      return;
    }
    if (block.readOnly) {
      errors.push(opError(index, op, 'READ_ONLY_BLOCK', `block ${op.blockId} is read-only (${block.readOnlyReason})`));
      return;
    }

    const kinds = seen.get(op.blockId) || new Set();
    const clash = kinds.has(op.op)
      || (op.op === 'replaceBlock' && kinds.has('deleteBlock'))
      || (op.op === 'deleteBlock' && kinds.has('replaceBlock'));
    if (clash) errors.push(opError(index, op, 'DUPLICATE_BLOCK_OP', `more than one ${op.op}/replace-delete on block ${op.blockId}`));
    kinds.add(op.op);
    seen.set(op.blockId, kinds);

    if (op.op === 'replaceBlock') {
      const textErrors = checkText(op.newText, index, op, 'newText', block);
      errors.push(...(strict ? textErrors : textErrors.filter((e) => e.code !== 'MULTI_PARAGRAPH_TEXT')));
      if (strict && op.newText === block.text) errors.push(opError(index, op, 'NO_CHANGE', 'newText equals the current block text'));
    } else if (op.op === 'insertAfter') {
      if (!Array.isArray(op.newBlocks) || op.newBlocks.length === 0) {
        errors.push(opError(index, op, 'EMPTY_TEXT', 'newBlocks must be a non-empty array'));
        return;
      }
      op.newBlocks.forEach((nb, j) => {
        if (!nb || !NEW_BLOCK_KINDS.has(nb.kind)) {
          errors.push(opError(index, op, 'BAD_BLOCK_KIND', `newBlocks[${j}].kind must be one of ${[...NEW_BLOCK_KINDS].join(', ')}`));
        }
        if (nb && nb.level != null && !(Number.isInteger(nb.level) && nb.level >= 0 && nb.level <= 9)) {
          errors.push(opError(index, op, 'BAD_LEVEL', `newBlocks[${j}].level must be an integer 0..9`));
        }
        const textErrors = checkText(nb && nb.text, index, op, `newBlocks[${j}].text`, null);
        errors.push(...(strict ? textErrors : textErrors.filter((e) => e.code !== 'MULTI_PARAGRAPH_TEXT')));
      });
    }
  });
  return errors;
}

/** validateOps + перевірки самої пропозиції (id, supersedes). */
function validateSuggestion(doc, suggestion, opts) {
  const errors = [];
  if (!suggestion || typeof suggestion.id !== 'string' || !suggestion.id) {
    errors.push(opError(-1, null, 'BAD_SUGGESTION', 'suggestion.id must be a non-empty string'));
  }
  if (suggestion && suggestion.supersedes != null && !Array.isArray(suggestion.supersedes)) {
    errors.push(opError(-1, null, 'BAD_SUGGESTION', 'supersedes must be an array of suggestion ids'));
  }
  return errors.concat(validateOps(doc, suggestion && suggestion.ops, opts));
}

// ---------- apply ----------

/**
 * Збирає операції прийнятих пропозицій по блоках з урахуванням supersedes:
 * якщо S.supersedes містить T і обидві прийняті, операції T над блоками, яких
 * торкається S, ігноруються (новий текст S уже включає зміни T).
 */
function collectOps(accepted) {
  const list = (accepted || []).filter(Boolean);
  const ids = new Set(list.map((s) => s.id));
  const shadowed = new Map(); // supersededId -> Set(blockId)
  for (const s of list) {
    for (const t of s.supersedes || []) {
      if (!ids.has(t)) continue;
      const set = shadowed.get(t) || new Set();
      for (const op of s.ops || []) set.add(op.blockId);
      shadowed.set(t, set);
    }
  }
  const byBlock = new Map();
  const ignored = [];
  const slot = (blockId) => {
    if (!byBlock.has(blockId)) byBlock.set(blockId, { replaces: [], deletes: [], inserts: [] });
    return byBlock.get(blockId);
  };
  for (const s of list) {
    for (const op of s.ops || []) {
      if (shadowed.has(s.id) && shadowed.get(s.id).has(op.blockId)) {
        ignored.push({ suggestionId: s.id, blockId: op.blockId, op: op.op, reason: 'superseded' });
        continue;
      }
      if (op.op === 'replaceBlock') slot(op.blockId).replaces.push({ sid: s.id, text: op.newText });
      else if (op.op === 'deleteBlock') slot(op.blockId).deletes.push({ sid: s.id });
      else if (op.op === 'insertAfter') slot(op.blockId).inserts.push({ sid: s.id, newBlocks: op.newBlocks || [] });
    }
  }
  return { byBlock, ignored };
}

/** Зливає кілька replaceBlock одного блоку; при конфлікті лишає раніше прийняте. */
function mergeReplaces(baseText, replaces) {
  let text = baseText;
  const applied = [];
  const conflicts = [];
  for (const r of replaces) {
    const m = merge3(baseText, text, r.text);
    if (m.ok) {
      text = m.text;
      applied.push(r.sid);
    } else {
      conflicts.push({ suggestionIds: [...applied, r.sid], reason: 'overlapping-edit', details: m.conflicts });
    }
  }
  return { text, applied, conflicts };
}

/**
 * Застосовує прийняті пропозиції до оригінальних блоків. Чиста й ідемпотентна функція:
 * результат завжди будується з оригіналу. Вставки після одного блоку йдуть у порядку пропозицій.
 * @returns {{
 *   blocks: Array,      результуючі блоки (status: unchanged|changed|inserted)
 *   changes: Array,     по блоках оригіналу: {blockId, type: 'replace'|'delete'|null, text, suggestionIds, inserts}
 *   conflicts: Array,   {blockId, suggestionIds, reason}
 *   ignored: Array      операції, що перекриті supersedes
 * }}
 */
function applyAccepted(doc, accepted) {
  const { byBlock, ignored } = collectOps(accepted);
  const blocks = [];
  const changes = [];
  const conflicts = [];

  for (const block of doc.blocks) {
    const entry = byBlock.get(block.id);
    if (!entry) {
      blocks.push({ ...block, status: 'unchanged' });
      continue;
    }
    const change = { blockId: block.id, type: null, text: block.text, suggestionIds: [], inserts: entry.inserts };

    if (entry.deletes.length) {
      change.type = 'delete';
      change.text = '';
      change.suggestionIds = [...new Set(entry.deletes.map((d) => d.sid))];
      for (const r of entry.replaces) {
        conflicts.push({ blockId: block.id, suggestionIds: [entry.deletes[0].sid, r.sid], reason: 'replace-vs-delete' });
      }
    } else if (entry.replaces.length) {
      const merged = mergeReplaces(block.text, entry.replaces);
      merged.conflicts.forEach((c) => conflicts.push({ blockId: block.id, ...c }));
      if (merged.text !== block.text) {
        change.type = 'replace';
        change.text = merged.text;
      }
      change.suggestionIds = merged.applied;
      blocks.push({ ...block, text: merged.text, originalText: block.text, status: merged.text !== block.text ? 'changed' : 'unchanged' });
    } else {
      blocks.push({ ...block, status: 'unchanged' });
    }

    for (const ins of entry.inserts) {
      ins.newBlocks.forEach((nb, j) => {
        const out = { id: `${block.id}+${ins.sid}.${j + 1}`, kind: nb.kind, text: nb.text, status: 'inserted', anchorId: block.id, suggestionIds: [ins.sid] };
        if (nb.level != null) out.level = nb.level;
        if (block.sectionId) out.sectionId = block.sectionId;
        blocks.push(out);
      });
    }
    if (change.type || change.inserts.length) changes.push(change);
  }
  return { blocks, changes, conflicts, ignored };
}

/**
 * Конфлікти кандидата з уже прийнятими пропозиціями.
 * replace vs replace — конфлікт, якщо word-level хунки перетинаються; replace vs delete — завжди.
 * Пропозиції з candidate.supersedes не вважаються конфліктними на спільних блоках.
 * @returns {{suggestionId: string, blockId: string, reason: string}[]}
 */
function findConflicts(doc, accepted, candidate) {
  const blocks = blockMap(doc);
  const supersedes = new Set(candidate.supersedes || []);
  const others = (accepted || []).filter((s) => s && s.id !== candidate.id && !supersedes.has(s.id));
  const { byBlock } = collectOps(others);
  const out = [];
  const add = (suggestionId, blockId, reason) => {
    if (!out.some((c) => c.suggestionId === suggestionId && c.blockId === blockId)) out.push({ suggestionId, blockId, reason });
  };

  for (const op of candidate.ops || []) {
    const block = blocks.get(op.blockId);
    const entry = byBlock.get(op.blockId);
    if (!block || !entry) continue;
    if (op.op === 'replaceBlock') {
      entry.deletes.forEach((d) => add(d.sid, op.blockId, 'replace-vs-delete'));
      const pairwise = entry.replaces.filter((r) => !merge3(block.text, r.text, op.newText).ok);
      pairwise.forEach((r) => add(r.sid, op.blockId, 'overlapping-edit'));
      if (!pairwise.length && entry.replaces.length > 1) {
        const merged = mergeReplaces(block.text, entry.replaces);
        if (!merge3(block.text, merged.text, op.newText).ok) entry.replaces.forEach((r) => add(r.sid, op.blockId, 'overlapping-edit'));
      }
    } else if (op.op === 'deleteBlock') {
      entry.replaces.forEach((r) => add(r.sid, op.blockId, 'replace-vs-delete'));
    }
  }
  return out;
}

/**
 * Прев'ю змін: лише змінені/видалені/вставлені блоки в порядку документа з word-diff.
 * Для картки однієї пропозиції: previewChanges(doc, [suggestion]).
 */
function previewChanges(doc, accepted) {
  const result = applyAccepted(doc, accepted);
  const original = blockMap(doc);
  const entries = [];
  for (const change of result.changes) {
    const block = original.get(change.blockId);
    if (change.type === 'replace') {
      entries.push({ blockId: block.id, status: 'changed', before: block.text, after: change.text, diff: diffBlock(block.text, change.text), suggestionIds: change.suggestionIds });
    } else if (change.type === 'delete') {
      entries.push({ blockId: block.id, status: 'deleted', before: block.text, after: '', diff: [{ type: 'delete', text: block.text }], suggestionIds: change.suggestionIds });
    }
    for (const b of result.blocks.filter((x) => x.status === 'inserted' && x.anchorId === block.id)) {
      entries.push({ blockId: b.id, anchorId: block.id, status: 'inserted', kind: b.kind, before: '', after: b.text, diff: [{ type: 'insert', text: b.text }], suggestionIds: b.suggestionIds });
    }
  }
  return { entries, conflicts: result.conflicts };
}

module.exports = {
  tokenize, diffBlock, changeRatio, merge3,
  validateOps, validateSuggestion, applyAccepted, findConflicts, previewChanges,
};
