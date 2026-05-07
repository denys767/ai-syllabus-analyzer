const DiffMatchPatch = require('diff-match-patch');
const {
  REV_DEL_OPEN,
  REV_DEL_CLOSE,
  REV_ADD_OPEN,
  REV_ADD_CLOSE,
} = require('./constants');

const dmp = new DiffMatchPatch();

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markerAt(markup, index) {
  for (const marker of [REV_DEL_OPEN, REV_DEL_CLOSE, REV_ADD_OPEN, REV_ADD_CLOSE]) {
    if (markup.startsWith(marker, index)) return marker;
  }
  return null;
}

function revisionDiffToMarkup(before, after) {
  const oldText = String(before || '');
  const newText = String(after || '');

  if (!oldText) return newText ? `${REV_ADD_OPEN}${newText}${REV_ADD_CLOSE}` : '';
  if (!newText) return oldText ? `${REV_DEL_OPEN}${oldText}${REV_DEL_CLOSE}` : '';

  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, value]) => {
    if (!value) return '';
    if (op === -1) return `${REV_DEL_OPEN}${value}${REV_DEL_CLOSE}`;
    if (op === 1) return `${REV_ADD_OPEN}${value}${REV_ADD_CLOSE}`;
    return value;
  }).join('');
}

function refineRevisionMarkup(markup) {
  const source = String(markup || '');
  if (!source) return source;

  const replacementPair = new RegExp(
    `${escapeRegExp(REV_DEL_OPEN)}([\\s\\S]*?)${escapeRegExp(REV_DEL_CLOSE)}` +
    `\\s*` +
    `${escapeRegExp(REV_ADD_OPEN)}([\\s\\S]*?)${escapeRegExp(REV_ADD_CLOSE)}`,
    'g'
  );

  return source.replace(replacementPair, (_match, before, after) => revisionDiffToMarkup(before, after));
}

function revisionMarkupToHtml(markup) {
  const source = String(markup || '');
  let html = '';
  let i = 0;

  while (i < source.length) {
    const marker = markerAt(source, i);
    if (marker) {
      if (marker === REV_DEL_OPEN) html += '<span class="rev-del">';
      else if (marker === REV_DEL_CLOSE) html += '</span>';
      else if (marker === REV_ADD_OPEN) html += '<span class="rev-add">';
      else if (marker === REV_ADD_CLOSE) html += '</span>';
      i += marker.length;
      continue;
    }
    html += escapeHtml(source[i]);
    i += 1;
  }

  return html;
}

function stripMarkup(markup) {
  return String(markup || '')
    .replace(new RegExp(`${escapeRegExp(REV_DEL_OPEN)}[\\s\\S]*?${escapeRegExp(REV_DEL_CLOSE)}`, 'g'), '')
    .replace(new RegExp(escapeRegExp(REV_ADD_OPEN), 'g'), '')
    .replace(new RegExp(escapeRegExp(REV_ADD_CLOSE), 'g'), '');
}

module.exports = {
  escapeRegExp,
  escapeHtml,
  markerAt,
  revisionDiffToMarkup,
  refineRevisionMarkup,
  revisionMarkupToHtml,
  stripMarkup,
};
