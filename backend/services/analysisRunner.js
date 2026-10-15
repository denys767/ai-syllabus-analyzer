const fs = require('fs').promises;
const path = require('path');
const Syllabus = require('../models/Syllabus');
const { loadDocument, toPlainText } = require('./document');
const { analyzeSyllabus } = require('./ai/orchestrator');

const GENERIC_ERROR = 'Не вдалося проаналізувати силабус. Спробуйте повторити аналіз.';

function formatOf(syllabus) {
  if (syllabus.sourceFormat) return syllabus.sourceFormat;
  const ext = path.extname(syllabus.originalFile?.originalName || syllabus.originalFile?.path || '').toLowerCase();
  return ext.replace(/^\./, '') || null;
}

/**
 * Етап extract: оригінал → робочий .docx (для doc/pdf — сконвертований/синтезований) → blocks.
 * Пропускається, якщо document уже є (re-analyze).
 */
async function extractDocument(syllabusId) {
  const syllabus = await Syllabus.findById(syllabusId);
  if (!syllabus) throw new Error('Силабус не знайдено');
  if (syllabus.document?.docVersion && syllabus.document?.blocks?.length && syllabus.workingFile?.path) return;

  await Syllabus.updateOne({ _id: syllabusId }, { $set: { analysisStage: 'extract' } });
  const format = formatOf(syllabus);
  const originalPath = syllabus.originalFile?.path;
  let original;
  try {
    original = await fs.readFile(originalPath);
  } catch {
    throw Object.assign(new Error('Файл силабусу не знайдено на сервері. Завантажте його ще раз.'), { statusCode: 404 });
  }

  const { buffer, doc, convertedFrom } = await loadDocument(original, format, { title: syllabus.title });
  if (!doc.blocks.some((b) => b.text.trim())) {
    throw Object.assign(new Error('У файлі не знайдено тексту. Перевірте файл і завантажте його ще раз.'), { statusCode: 422 });
  }

  let workingPath = originalPath;
  if (convertedFrom) {
    workingPath = `${originalPath}.working.docx`;
    await fs.writeFile(workingPath, buffer);
  }

  await Syllabus.updateOne({ _id: syllabusId }, {
    $set: {
      sourceFormat: format,
      workingFile: { path: workingPath, size: buffer.length },
      document: { docVersion: doc.docVersion, convertedFrom, blocks: doc.blocks },
      extractedText: toPlainText(doc.blocks),
      legacy: false,
    },
  });
}

async function runAnalysis(syllabusId) {
  try {
    await extractDocument(syllabusId);
    await analyzeSyllabus(syllabusId);
  } catch (error) {
    console.error('AI analysis error for syllabus', String(syllabusId), ':', error);
    // Повідомлення з statusCode < 500 (модуль документів, наші перевірки) — українською і для користувача
    const message = error.statusCode && error.statusCode < 500 ? error.message
      : error.code === 'SOFFICE_MISSING' || error.code === 'CONVERSION_TIMEOUT' ? error.message
        : GENERIC_ERROR;
    await Syllabus.updateOne({ _id: syllabusId }, {
      $set: { status: 'error', analysisError: message },
    }).catch(() => {});
  }
}

// Запускає аналіз у фоні; помилку зберігає у analysisError, статус → error
function runAnalysisInBackground(syllabusId) {
  setImmediate(() => { runAnalysis(syllabusId); });
}

module.exports = { runAnalysisInBackground, runAnalysis, extractDocument };
