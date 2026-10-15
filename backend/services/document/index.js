// Публічний API модуля документів. Див. README.md поруч.

const model = require('./model');
const apply = require('./apply');
const convert = require('./convert');
const { extractDocx } = require('./extractors/docx');
const { pdfToDocx } = require('./extractors/pdfToDocx');
const { writeDocx, DEFAULT_AUTHOR } = require('./writers/docx');
const { acceptAllRevisions, rejectAllRevisions } = require('./revisions');
const { docError } = require('./ooxml');
const { extractPptx } = require('./extractors/pptx');
const { writePptx, overflowRisk, previewPptxChanges } = require('./writers/pptx');
const { extractPdf, pdfBlocksToParagraphs } = require('./extractors/pdf');
const { annotatePdf } = require('./writers/pdfAnnotations');
const { pdfToPng, renderPptxPreview } = require('./preview');

/**
 * Завантаження файлу викладача: .doc конвертується в .docx (LibreOffice), з .pdf синтезується
 * простий .docx (extractors/pdfToDocx.js), далі екстракція.
 * docVersion рахується від .docx, з яким далі працює writer (для .doc/.pdf — від результату
 * конвертації), тож зберігати треба саме повернений `buffer`.
 * .pptx екстрагується як є (writer — writers/pptx.js).
 * @param {Buffer} buffer
 * @param {'docx'|'doc'|'pdf'|'pptx'} ext
 * @param {{title?: string}} [opts]
 * @returns {Promise<{buffer: Buffer, doc: import('./model').DocModel, convertedFrom: null|'doc'|'pdf'}>}
 */
async function loadDocument(buffer, ext, opts = {}) {
  const format = String(ext || '').replace(/^\./, '').toLowerCase();
  if (format === 'pptx') return { buffer, doc: await extractPptx(buffer), convertedFrom: null };
  let docx;
  let convertedFrom = null;
  if (format === 'docx') docx = buffer;
  else if (format === 'doc') { docx = await convert.docToDocx(buffer); convertedFrom = 'doc'; }
  else if (format === 'pdf') { docx = await pdfToDocx(buffer, opts); convertedFrom = 'pdf'; }
  else throw docError(`Формат .${format} поки не підтримується модулем документів`, 415, 'UNSUPPORTED_FORMAT');
  return { buffer: docx, doc: await extractDocx(docx), convertedFrom };
}

/**
 * Усі фінальні артефакти: чистий і tracked .docx, опційно PDF tracked-версії (LibreOffice
 * показує правки: закреслення/підкреслення кольором і риски на полях).
 */
async function buildOutputs(originalBuffer, doc, accepted, { author, date, comments = true, pdf = false } = {}) {
  const clean = await writeDocx(originalBuffer, doc, accepted, { mode: 'clean', author, date });
  const tracked = await writeDocx(originalBuffer, doc, accepted, { mode: 'tracked', author, date, comments });
  const out = { clean, tracked };
  if (pdf) out.trackedPdf = await convert.toPdf(tracked, 'docx', { exportComments: comments });
  return out;
}

async function buildOutputsFor(format, originalBuffer, doc, accepted, opts = {}) {
  if (format === 'docx') return buildOutputs(originalBuffer, doc, accepted, opts);
  if (format === 'pptx') {
    const edited = await writePptx(originalBuffer, doc, accepted);
    return { edited, previewPdf: await convert.toPdf(edited, 'pptx') };
  }
  if (format === 'pdf') return { annotated: await annotatePdf(originalBuffer, doc, accepted, opts) };
  throw docError(`Непідтримуваний формат: ${format}`, 415, 'UNSUPPORTED_FORMAT');
}

module.exports = {
  // модель
  computeDocVersion: model.computeDocVersion,
  renderForPrompt: model.renderForPrompt,
  toPlainText: model.toPlainText,
  // екстракція / запис
  loadDocument,
  extractDocx,
  writeDocx,
  buildOutputs,
  buildOutputsFor,
  extractPptx,
  writePptx,
  renderPptxPreview,
  overflowRisk,
  previewPptxChanges,
  extractPdf,
  annotatePdf,
  pdfBlocksToParagraphs,
  pdfToPng,
  acceptAllRevisions,
  rejectAllRevisions,
  pdfToDocx,
  DEFAULT_AUTHOR,
  // пропозиції
  validateOps: apply.validateOps,
  validateSuggestion: apply.validateSuggestion,
  applyAccepted: apply.applyAccepted,
  findConflicts: apply.findConflicts,
  previewChanges: apply.previewChanges,
  diffBlock: apply.diffBlock,
  changeRatio: apply.changeRatio,
  merge3: apply.merge3,
  // LibreOffice
  docToDocx: convert.docToDocx,
  toPdf: convert.toPdf,
  isConverterAvailable: convert.isAvailable,
};
