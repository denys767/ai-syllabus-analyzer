// Канонічна модель документа: блоки зі стабільними ID і прив'язкою до оригіналу.

const crypto = require('crypto');

/**
 * @typedef {'heading'|'paragraph'|'list-item'|'table-cell'} BlockKind
 *
 * @typedef {Object} DocxLocator
 * @property {number} paraIndex  індекс серед усіх w:p тіла в порядку документа (pre-order)
 * @property {string} [paraId]   w14:paraId, якщо є в оригіналі
 *
 * @typedef {Object} Block
 * @property {string} id               "b0001"…, за порядком обходу; ніколи не перенумеровується
 * @property {BlockKind} kind
 * @property {string} text             сплющений текст абзацу (\t для табуляції, \n для розриву рядка)
 * @property {number} [level]          рівень заголовка (0 = Title, 1..9) або списку (1..9)
 * @property {string} [listFormat]     numFmt списку: 'bullet', 'decimal', …
 * @property {string} [style]          styleId абзацу
 * @property {string} [sectionId]      id найближчого заголовка (для заголовка — він сам)
 * @property {boolean} [readOnly]
 * @property {string} [readOnlyReason] 'toc'|'field'|'tracked-change'|'locked-content-control'|'complex-content'
 * @property {{table: number, row: number, col: number}} [cell]  для блоків у таблицях
 * @property {{docx: DocxLocator}} locator
 *
 * @typedef {Object} DocModel
 * @property {'docx'} format
 * @property {string} docVersion       sha1 байтів оригінального файлу
 * @property {Block[]} blocks
 * @property {{paragraphCount: number, hasTrackedChanges: boolean}} meta
 *
 * @typedef {Object} NewBlock
 * @property {'paragraph'|'heading'|'list-item'} kind
 * @property {string} text
 * @property {number} [level]
 *
 * @typedef {{op: 'replaceBlock', blockId: string, newText: string}
 *   | {op: 'insertAfter', blockId: string, newBlocks: NewBlock[]}
 *   | {op: 'deleteBlock', blockId: string}} Op
 *
 * @typedef {Object} Suggestion
 * @property {string} id
 * @property {Op[]} ops
 * @property {string[]} [supersedes]   id прийнятих пропозицій, зміни яких уже включено в цю
 * @property {string} [rationale]      пояснення (йде в коментар Word)
 */

function computeDocVersion(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function formatBlockId(n) {
  return `b${String(n).padStart(4, '0')}`;
}

function blockMap(doc) {
  return new Map(doc.blocks.map((b) => [b.id, b]));
}

/** Плоский текст документа (похідне поле для пошуку і звітів). */
function toPlainText(blocks) {
  return blocks.map((b) => b.text).join('\n');
}

/** Подання документа для LLM: `[b0042] текст`, з позначками типу і readOnly. */
function renderForPrompt(doc) {
  return doc.blocks.map((b) => {
    let tag = '';
    if (b.kind === 'heading') tag = b.level === 0 ? 'title ' : `h${b.level} `;
    else if (b.kind === 'list-item') tag = b.listFormat === 'bullet' ? '• ' : '1. ';
    else if (b.kind === 'table-cell' && b.cell) tag = `cell t${b.cell.table}r${b.cell.row}c${b.cell.col} `;
    const ro = b.readOnly ? ' (read-only)' : '';
    return `[${b.id}]${ro} ${tag}${b.text.replace(/\n/g, ' ⏎ ')}`;
  }).join('\n');
}

module.exports = { computeDocVersion, formatBlockId, blockMap, toPlainText, renderForPrompt };
