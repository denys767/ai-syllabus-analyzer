// Публічний API модуля документів (лише вхід). Див. README.md поруч.
// Вихід силабуса — services/document/writers/templateDocx.js (генерується зі стану, а не з файлу викладача).

const model = require('./model');
const convert = require('./convert');
const { extractDocx } = require('./extractors/docx');
const { extractPdf } = require('./extractors/pdf');
const { docError } = require('./ooxml');

/**
 * Розбір файлу викладача на блоки (docx/doc/pdf). Блоки йдуть у extractSlots; сам файл далі не потрібен.
 * - docx: екстракція як є;
 * - doc: LibreOffice → .docx → екстракція (`docVersion` від сконвертованого файлу);
 * - pdf: pdf.js у worker thread (extractors/pdf.js); з локатора лишається лише номер сторінки
 *   (bbox і координати рядків у стані не потрібні й роздувають документ у БД).
 * @param {Buffer} buffer
 * @param {'docx'|'doc'|'pdf'} ext
 * @returns {Promise<{doc: import('./model').DocModel, convertedFrom: null|'doc'}>}
 */
async function loadDocument(buffer, ext) {
  const format = String(ext || '').replace(/^\./, '').toLowerCase();
  if (format === 'docx') return { doc: await extractDocx(buffer), convertedFrom: null };
  if (format === 'doc') return { doc: await extractDocx(await convert.docToDocx(buffer)), convertedFrom: 'doc' };
  if (format === 'pdf') {
    const doc = await extractPdf(buffer);
    return {
      doc: { ...doc, blocks: doc.blocks.map(({ locator, ...block }) => ({ ...block, locator: { page: locator?.page } })) },
      convertedFrom: null,
    };
  }
  throw docError(`Формат .${format} не підтримується модулем документів`, 415, 'UNSUPPORTED_FORMAT');
}

module.exports = {
  // модель
  computeDocVersion: model.computeDocVersion,
  toPlainText: model.toPlainText,
  // екстракція
  loadDocument,
  extractDocx,
  extractPdf,
  // LibreOffice (.doc → .docx)
  docToDocx: convert.docToDocx,
  isConverterAvailable: convert.isAvailable,
};
