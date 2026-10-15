const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { LEASE_MS, MAX_ATTEMPTS, expiredLease, ownedAnalysis, assertLease } = require('./analysisLease');
const Syllabus = require('../models/Syllabus');
const { loadDocument, toPlainText } = require('./document');
const orchestrator = require('./ai/orchestrator');

const GENERIC_ERROR = 'Не вдалося проаналізувати силабус. Спробуйте повторити аналіз.';

function formatOf(syllabus) {
  if (syllabus.sourceFormat) return syllabus.sourceFormat;
  const ext = path.extname(syllabus.originalFile?.originalName || syllabus.originalFile?.path || '').toLowerCase();
  return ext.replace(/^\./, '') || null;
}

/** Чи вже є повний document для формату (тоді re-analyze не розбирає файл заново). */
function hasDocument(syllabus) {
  const d = syllabus.document;
  if (!d?.docVersion || !d?.blocks?.length || !syllabus.workingFile?.path) return false;
  // PDF, розібраний до хвилі 5, не має блоків оригіналу для annotated.pdf — розбираємо заново
  if (formatOf(syllabus) === 'pdf' && !d.sourceDocVersion) return false;
  return true;
}

/**
 * Етап extract: оригінал → робочий файл (docx — сам оригінал; doc — сконвертований .docx;
 * pdf — синтезований .docx з блоками PDF 1:1; pptx — сам оригінал) → blocks.
 * Пропускається, якщо document уже є (re-analyze).
 */
async function extractDocument(syllabusId, { leaseToken } = {}) {
  await assertLease(syllabusId, leaseToken);
  const syllabus = await Syllabus.findById(syllabusId);
  if (!syllabus) throw new Error('Силабус не знайдено');
  if (hasDocument(syllabus)) return;

  await Syllabus.updateOne(ownedAnalysis(syllabusId, leaseToken), { $set: { analysisStage: 'extract' } });
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

  await Syllabus.updateOne(ownedAnalysis(syllabusId, leaseToken), {
    $set: {
      sourceFormat: format,
      workingFile: { path: workingPath, size: buffer.length },
      document: { ...doc, convertedFrom },
      extractedText: toPlainText(doc.blocks),
      legacy: false,
    },
  });
}

async function runAnalysis(syllabusId) {
  const leaseToken = randomUUID();
  const claimed = await Syllabus.findOneAndUpdate({
    _id: syllabusId, status: 'analyzing', ...expiredLease(),
    $and: [{ $or: [{ analysisAttempts: { $lt: MAX_ATTEMPTS } }, { analysisAttempts: null }] }],
  }, { $set: { analysisLeaseToken: leaseToken, analysisLeaseUntil: new Date(Date.now() + LEASE_MS), analysisStartedAt: new Date() },
    $inc: { analysisAttempts: 1 }, $unset: { analysisError: '' } }, { new: true });
  if (!claimed) return false;
  let renewing;
  const timer = setInterval(() => {
    if (renewing) return;
    renewing = Syllabus.updateOne(ownedAnalysis(syllabusId, leaseToken), {
      $set: { analysisLeaseUntil: new Date(Date.now() + LEASE_MS) },
    }).catch((error) => console.error('analysis lease renewal:', error.message)).finally(() => { renewing = null; });
  }, Math.floor(LEASE_MS / 3));
  timer.unref();
  try {
    await module.exports.extractDocument(syllabusId, { leaseToken });
    await assertLease(syllabusId, leaseToken);
    await orchestrator.analyzeSyllabus(syllabusId, { leaseToken });
  } catch (error) {
    if (error.code !== 'ANALYSIS_LEASE_LOST') {
      console.error('AI analysis error for syllabus', String(syllabusId), ':', error);
      const message = error.statusCode && error.statusCode < 500 ? error.message
        : error.code === 'SOFFICE_MISSING' || error.code === 'CONVERSION_TIMEOUT' ? error.message : GENERIC_ERROR;
      await Syllabus.updateOne(ownedAnalysis(syllabusId, leaseToken), {
        $set: { status: 'error', analysisError: message },
      }).catch(() => {});
    }
  } finally {
    clearInterval(timer);
    if (renewing) await renewing;
    await Syllabus.updateOne({ _id: syllabusId, analysisLeaseToken: leaseToken }, {
      $unset: { analysisLeaseUntil: '', analysisLeaseToken: '' },
    }).catch(() => {});
  }
  return true;
}

// Запускає аналіз у фоні; помилку зберігає у analysisError, статус → error
function runAnalysisInBackground(syllabusId) {
  setImmediate(() => { runAnalysis(syllabusId).catch((e) => console.error('analysis job:', e.message)); });
}

module.exports = { runAnalysisInBackground, runAnalysis, extractDocument };
