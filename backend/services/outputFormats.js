// Єдиний перелік фінальних файлів: у v5 — один .docx за шаблоном KSE (GET-view, кабінет, завантаження).
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OUTPUTS = {
  'syllabus.docx': { key: 'syllabusDocx', label: 'Syllabus (.docx)', suffix: '_syllabus.docx', contentType: DOCX_TYPE },
};

/**
 * Імена файлів, доступних для силабусу. Силабус v4 без стану (legacy, needsRebuild) файлів не має.
 * Проєкція кабінету не містить `state`, тому наявність стану тут не перевіряється — це робить getOutputFile.
 * @param {{ legacy?: boolean, needsRebuild?: boolean }} syllabus
 */
function outputNames(syllabus) {
  if (!syllabus || syllabus.legacy || syllabus.needsRebuild) return [];
  return Object.keys(OUTPUTS);
}

/** [{ name, label }] для GET-view і кабінету. */
function outputList(syllabus) {
  return outputNames(syllabus).map((name) => ({ name, label: OUTPUTS[name].label }));
}

module.exports = { OUTPUTS, outputNames, outputList };
