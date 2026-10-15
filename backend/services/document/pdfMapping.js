// Робочий DOCX і джерельний PDF мають окремі id та docVersion.
const { docError } = require('./ooxml');
function mapPdfSuggestions(document, accepted) {
  const map = document.pdfBlockMap || {};
  const mapId = (id) => {
    // Для синтетичної вставки зберігаємо суфікс, але зіставляємо її якір.
    const [anchor, ...suffix] = id.split('+');
    if (!map[anchor]) throw docError('Відповідність блоків PDF відсутня. Повторіть аналіз.', 409, 'PDF_BLOCK_MAP_MISSING');
    return [map[anchor], ...suffix].join('+');
  };
  return accepted.map((s) => ({ ...s, ops: s.ops.map((op) => ({ ...op, blockId: mapId(op.blockId) })) }));
}
function sourcePdfDoc(document) {
  if (!document.sourceDocVersion || !document.sourceBlocks?.length) {
    throw docError('Блоки оригінального PDF відсутні. Повторіть аналіз.', 409, 'PDF_BLOCK_MAP_MISSING');
  }
  return { format: 'pdf', docVersion: document.sourceDocVersion, blocks: document.sourceBlocks };
}
module.exports = { mapPdfSuggestions, sourcePdfDoc };
