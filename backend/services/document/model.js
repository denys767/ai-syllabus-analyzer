// Канонічна модель документа: блоки зі стабільними ID. У v5 блоки лише читаються (extractSlots → state).

const crypto = require('crypto');

/**
 * @typedef {'heading'|'paragraph'|'list-item'|'table-cell'} BlockKind
 *
 * @typedef {Object} Block
 * @property {string} id               "b0001"…, за порядком обходу
 * @property {BlockKind} kind
 * @property {string} text             сплющений текст абзацу (\t для табуляції, \n для розриву рядка)
 * @property {number} [level]          рівень заголовка (0 = Title, 1..9) або списку (1..9)
 * @property {string} [listFormat]     numFmt списку: 'bullet', 'decimal', …
 * @property {string} [style]          styleId абзацу (docx)
 * @property {string} [sectionId]      id найближчого заголовка (для заголовка — він сам)
 * @property {boolean} [readOnly]
 * @property {string} [readOnlyReason] 'toc'|'field'|'tracked-change'|'locked-content-control'|'complex-content'
 * @property {{table: number, row: number, col: number}} [cell]  для блоків у таблицях (docx)
 * @property {object} [locator]        docx: { docx: { paraIndex, paraId? } }; pdf: { page, bbox, lineBoxes }
 *
 * @typedef {Object} DocModel
 * @property {'docx'|'pdf'} format
 * @property {string} docVersion       sha1 байтів файлу, з якого розібрано блоки (для .doc — сконвертованого .docx)
 * @property {Block[]} blocks
 * @property {object} meta             docx: { paragraphCount, hasTrackedChanges }; pdf: { pageCount }
 */

function computeDocVersion(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function formatBlockId(n) {
  return `b${String(n).padStart(4, '0')}`;
}

/** Плоский текст документа (похідне поле для пошуку і звітів). */
function toPlainText(blocks) {
  return blocks.map((b) => b.text).join('\n');
}

module.exports = { computeDocVersion, formatBlockId, toPlainText };
