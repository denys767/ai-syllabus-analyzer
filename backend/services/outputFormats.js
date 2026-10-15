// Єдиний перелік фінальних файлів за форматом силабусу: GET-view, кабінет, завантаження і відправка.
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OUTPUTS = {
  'tracked.docx': { key: 'tracked', label: 'DOCX з правками (tracked changes)', suffix: '_tracked.docx', contentType: DOCX_TYPE },
  'clean.docx': { key: 'clean', label: 'Чистий DOCX', suffix: '_clean.docx', contentType: DOCX_TYPE },
  'tracked.pdf': { key: 'trackedPdf', label: 'PDF з правками', suffix: '_tracked.pdf', contentType: 'application/pdf' },
  'annotated.pdf': { key: 'annotated', label: 'Оригінальний PDF з примітками', suffix: '_annotated.pdf', contentType: 'application/pdf' },
  'edited.pptx': { key: 'edited', label: 'Презентація з правками', suffix: '_edited.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  'preview.pdf': { key: 'previewPdf', label: 'PDF презентації з правками', suffix: '_preview.pdf', contentType: 'application/pdf' },
};
const WORD = ['tracked.docx', 'clean.docx', 'tracked.pdf'];
const BY_FORMAT = {
  docx: WORD,
  doc: WORD,
  pdf: ['annotated.pdf', ...WORD],
  pptx: ['edited.pptx', 'preview.pdf'],
};
// Вкладення листа AD: головні файли формату (обов'язкові) і PDF (необов'язковий без LibreOffice)
const SUBMISSION = {
  docx: { required: ['tracked.docx'], optional: ['tracked.pdf'] },
  doc: { required: ['tracked.docx'], optional: ['tracked.pdf'] },
  pdf: { required: ['annotated.pdf', 'tracked.docx'], optional: ['tracked.pdf'] },
  pptx: { required: ['edited.pptx'], optional: ['preview.pdf'] },
};

/**
 * Імена файлів, доступних для силабусу. Без document (legacy або ще не розібраний) файлів немає.
 * PDF, розібраний до хвилі 5 (без document.sourceDocVersion), не має annotated.pdf до повторного аналізу.
 * @param {{ sourceFormat?: string, legacy?: boolean, document?: { docVersion?: string, sourceDocVersion?: string } }} syllabus
 */
function outputNames(syllabus) {
  if (!syllabus || syllabus.legacy || !syllabus.document?.docVersion) return [];
  const names = BY_FORMAT[syllabus.sourceFormat] || WORD;
  if (syllabus.sourceFormat === 'pdf' && !syllabus.document.sourceDocVersion) return names.filter((n) => n !== 'annotated.pdf');
  return names;
}

/** [{ name, label }] для GET-view і кабінету. */
function outputList(syllabus) {
  return outputNames(syllabus).map((name) => ({ name, label: OUTPUTS[name].label }));
}

function submissionFiles(format) {
  return SUBMISSION[format] || SUBMISSION.docx;
}

module.exports = { OUTPUTS, outputNames, outputList, submissionFiles };
