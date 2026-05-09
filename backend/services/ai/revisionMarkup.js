const DiffMatchPatch = require('diff-match-patch');
const MarkdownIt = require('markdown-it');
const {
  REV_DEL_OPEN,
  REV_DEL_CLOSE,
  REV_ADD_OPEN,
  REV_ADD_CLOSE,
} = require('./constants');

const dmp = new DiffMatchPatch();
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
});

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

function markdownToHtml(value) {
  return md.render(String(value || ''));
}

function markdownInlineToHtml(value) {
  return md.renderInline(String(value || ''));
}

function looksLikeMarkdownTable(value) {
  const lines = String(value || '').split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const header = lines[i].trim();
    const divider = lines[i + 1].trim();
    if (
      /^\|?.+\|.+\|?$/.test(header)
      && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(divider)
    ) {
      return true;
    }
  }
  return false;
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

  return source.replace(replacementPair, (_match, before, after) => {
    if (looksLikeMarkdownTable(before) || looksLikeMarkdownTable(after)) {
      return `${REV_DEL_OPEN}${before}${REV_DEL_CLOSE}${REV_ADD_OPEN}${after}${REV_ADD_CLOSE}`;
    }
    return revisionDiffToMarkup(before, after);
  });
}

function splitRevisionMarkup(markup) {
  const source = String(markup || '');
  const parts = [];
  let mode = 'same';
  let buffer = '';
  let i = 0;

  while (i < source.length) {
    const marker = markerAt(source, i);
    if (marker) {
      if (buffer) parts.push({ mode, text: buffer });
      buffer = '';
      if (marker === REV_DEL_OPEN) mode = 'del';
      else if (marker === REV_ADD_OPEN) mode = 'add';
      else if (marker === REV_DEL_CLOSE || marker === REV_ADD_CLOSE) mode = 'same';
      i += marker.length;
      continue;
    }
    buffer += source[i];
    i += 1;
  }
  if (buffer) parts.push({ mode, text: buffer });
  return parts;
}

function isBlockMarkdown(value) {
  const text = String(value || '');
  return (
    /\n\s*\n/.test(text)
    || looksLikeMarkdownTable(text)
    || /^#{1,6}\s/m.test(text)
    || /^\s*([-*+]|\d+\.)\s+/m.test(text)
  );
}

function renderRevisionPart(part) {
  const className = part.mode === 'del' ? 'rev-del' : part.mode === 'add' ? 'rev-add' : '';
  if (!className) return markdownToHtml(part.text);

  if (isBlockMarkdown(part.text)) {
    return `<div class="${className} rev-block">${markdownToHtml(part.text)}</div>`;
  }
  return `<span class="${className}">${markdownInlineToHtml(part.text)}</span>`;
}

function revisionMarkupToHtml(markup) {
  const parts = splitRevisionMarkup(markup);
  const html = parts.map(renderRevisionPart).join('');

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
  markdownToHtml,
  markerAt,
  revisionDiffToMarkup,
  refineRevisionMarkup,
  revisionMarkupToHtml,
  splitRevisionMarkup,
  stripMarkup,
  looksLikeMarkdownTable,
};
