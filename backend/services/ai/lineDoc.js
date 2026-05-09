const crypto = require('crypto');

function toLineDoc(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const sha1 = crypto.createHash('sha1').update(normalized).digest('hex');
  return { lines, totalLines: lines.length, sha1 };
}

function renderLineNumbered(doc) {
  const width = String(doc.totalLines).length;
  return doc.lines.map((line, idx) => {
    const num = String(idx + 1).padStart(width, '0');
    return `${num}| ${line}`;
  }).join('\n');
}

function sliceLines(doc, fromLine, toLine) {
  const from = Math.max(1, Number(fromLine) || 1);
  const to = Math.min(doc.totalLines, Number(toLine) || from);
  if (from > to) return '';
  return doc.lines.slice(from - 1, to).join('\n');
}

const VALID_ACTIONS = new Set(['replace', 'delete', 'insertAfter', 'insertBefore', 'appendDoc']);

function normalizeEdit(rawEdit) {
  if (!rawEdit || typeof rawEdit !== 'object') return null;
  const action = String(rawEdit.action || '').trim();
  if (!VALID_ACTIONS.has(action)) return null;

  const edit = { action };
  if (action === 'replace' || action === 'delete') {
    edit.fromLine = Number(rawEdit.fromLine);
    edit.toLine = Number(rawEdit.toLine);
  }
  if (action === 'insertAfter') edit.afterLine = Number(rawEdit.afterLine);
  if (action === 'insertBefore') edit.beforeLine = Number(rawEdit.beforeLine);
  if (action !== 'delete') {
    const newText = rawEdit.newText != null ? String(rawEdit.newText) : '';
    edit.newText = newText;
  }
  return edit;
}

function primaryAnchor(edit) {
  if (edit.action === 'replace' || edit.action === 'delete') return edit.fromLine;
  if (edit.action === 'insertAfter') return edit.afterLine + 0.5;
  if (edit.action === 'insertBefore') return edit.beforeLine - 0.5;
  if (edit.action === 'appendDoc') return Number.POSITIVE_INFINITY;
  return 0;
}

function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return a.from <= b.to && b.from <= a.to;
}

function editRange(edit) {
  if (edit.action === 'replace' || edit.action === 'delete') {
    return { from: edit.fromLine, to: edit.toLine };
  }
  return null;
}

function validateEdits(edits, doc) {
  if (!Array.isArray(edits) || !edits.length) {
    return { ok: false, reason: 'no edits' };
  }
  const ranges = [];
  for (const edit of edits) {
    if (!edit || !VALID_ACTIONS.has(edit.action)) {
      return { ok: false, reason: `unknown action ${edit && edit.action}` };
    }
    if (edit.action === 'replace' || edit.action === 'delete') {
      if (!Number.isFinite(edit.fromLine) || !Number.isFinite(edit.toLine)) {
        return { ok: false, reason: 'fromLine/toLine must be numbers' };
      }
      if (edit.fromLine < 1 || edit.toLine > doc.totalLines) {
        return { ok: false, reason: `lines out of range (${edit.fromLine}-${edit.toLine}, doc has ${doc.totalLines})` };
      }
      if (edit.fromLine > edit.toLine) {
        return { ok: false, reason: `fromLine > toLine (${edit.fromLine}>${edit.toLine})` };
      }
      ranges.push({ from: edit.fromLine, to: edit.toLine });
    }
    if (edit.action === 'insertAfter') {
      if (!Number.isFinite(edit.afterLine) || edit.afterLine < 0 || edit.afterLine > doc.totalLines) {
        return { ok: false, reason: `afterLine out of range (${edit.afterLine}, doc has ${doc.totalLines})` };
      }
    }
    if (edit.action === 'insertBefore') {
      if (!Number.isFinite(edit.beforeLine) || edit.beforeLine < 1 || edit.beforeLine > doc.totalLines + 1) {
        return { ok: false, reason: `beforeLine out of range (${edit.beforeLine}, doc has ${doc.totalLines})` };
      }
    }
    if (edit.action === 'replace' || edit.action === 'insertAfter' || edit.action === 'insertBefore' || edit.action === 'appendDoc') {
      if (!String(edit.newText || '').trim()) {
        return { ok: false, reason: `${edit.action} requires non-empty newText` };
      }
    }
    if (edit.action === 'delete' && String(edit.newText || '').trim()) {
      return { ok: false, reason: 'delete must not carry newText' };
    }
  }
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      if (rangesOverlap(ranges[i], ranges[j])) {
        return { ok: false, reason: `overlapping ranges ${ranges[i].from}-${ranges[i].to} vs ${ranges[j].from}-${ranges[j].to}` };
      }
    }
  }
  return { ok: true };
}

function applyEdits(doc, edits) {
  // Sort descending so earlier line numbers stay valid as we mutate.
  const sorted = edits.slice().sort((a, b) => primaryAnchor(b) - primaryAnchor(a));
  const lines = doc.lines.slice();
  for (const edit of sorted) {
    if (edit.action === 'replace') {
      const newLines = String(edit.newText).split('\n');
      lines.splice(edit.fromLine - 1, edit.toLine - edit.fromLine + 1, ...newLines);
    } else if (edit.action === 'delete') {
      lines.splice(edit.fromLine - 1, edit.toLine - edit.fromLine + 1);
    } else if (edit.action === 'insertAfter') {
      const newLines = String(edit.newText).split('\n');
      lines.splice(edit.afterLine, 0, ...newLines);
    } else if (edit.action === 'insertBefore') {
      const newLines = String(edit.newText).split('\n');
      lines.splice(edit.beforeLine - 1, 0, ...newLines);
    } else if (edit.action === 'appendDoc') {
      const newLines = String(edit.newText).split('\n');
      lines.push(...newLines);
    }
  }
  return lines.join('\n');
}

function joinBeforeText(doc, edits) {
  const parts = [];
  for (const edit of edits) {
    if (edit.action === 'replace' || edit.action === 'delete') {
      parts.push(sliceLines(doc, edit.fromLine, edit.toLine));
    }
  }
  return parts.join('\n\n');
}

function joinAfterText(edits) {
  return edits
    .filter((e) => e.action !== 'delete')
    .map((e) => String(e.newText || ''))
    .filter(Boolean)
    .join('\n\n');
}

module.exports = {
  toLineDoc,
  renderLineNumbered,
  sliceLines,
  normalizeEdit,
  validateEdits,
  applyEdits,
  joinBeforeText,
  joinAfterText,
  primaryAnchor,
  editRange,
};
