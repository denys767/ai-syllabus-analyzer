// Єдиний перелік файлів для GET-view, завантаження і відправки.
const OUTPUTS = {
  'tracked.docx': { key: 'tracked', label: 'DOCX з правками (tracked changes)', suffix: '_tracked.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  'clean.docx': { key: 'clean', label: 'Чистий DOCX', suffix: '_clean.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  'tracked.pdf': { key: 'trackedPdf', label: 'PDF з правками', suffix: '_tracked.pdf', contentType: 'application/pdf' },
  'annotated.pdf': { key: 'annotated', label: 'Оригінальний PDF з примітками', suffix: '_annotated.pdf', contentType: 'application/pdf' },
  'edited.pptx': { key: 'edited', label: 'Презентація з правками', suffix: '_edited.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  'preview.pdf': { key: 'previewPdf', label: 'PDF презентації з правками', suffix: '_preview.pdf', contentType: 'application/pdf' },
};
const WORD = ['tracked.docx', 'clean.docx', 'tracked.pdf'];
function outputNames(format) {
  if (format === 'pptx') return ['edited.pptx', 'preview.pdf'];
  if (format === 'pdf') return ['annotated.pdf', ...WORD];
  return WORD;
}
function outputList(format) {
  return outputNames(format).map((name) => ({ name, label: OUTPUTS[name].label }));
}
module.exports = { OUTPUTS, outputNames, outputList };
