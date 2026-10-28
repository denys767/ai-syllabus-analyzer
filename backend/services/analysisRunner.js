const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { LEASE_MS, MAX_ATTEMPTS, expiredLease, ownedAnalysis, assertLease } = require('./analysisLease');
const Syllabus = require('../models/Syllabus');
const { loadDocument, toPlainText } = require('./document');
const orchestrator = require('./ai/orchestrator');
const { httpError } = require('../utils/httpError');

const GENERIC_ERROR = 'The syllabus could not be analysed. Please try again.';
const INPUT_FORMATS = ['docx', 'doc', 'pdf'];

// Помилки розбору файлу (services/document) мають українські тексти: викладачу показуємо англійські за кодом
const PARSE_ERRORS = {
  INVALID_DOCX: 'The file is not a valid DOCX document. Check it and upload it again.',
  INVALID_PDF: 'The PDF could not be read. Check the file or upload a DOCX version.',
  PDF_NO_TEXT: 'The PDF has no text layer (it looks like a scan). Upload a DOCX or a text PDF.',
  PDF_TIMEOUT: 'Reading the PDF took too long. Try a DOCX version of the file.',
  PDF_BLOCK_MISMATCH: 'The PDF could not be read reliably. Try a DOCX version of the file.',
  SOFFICE_MISSING: 'Converting .doc files is not available on the server right now. Upload a DOCX or PDF.',
  SOFFICE_FAILED: 'The document could not be converted. Upload a DOCX or PDF.',
  CONVERSION_TIMEOUT: 'Converting the document took too long. Please try again or upload a DOCX.',
  CONVERSION_FAILED: 'The document could not be converted. Upload a DOCX or PDF.',
  UNSUPPORTED_FORMAT: 'This file format is not supported. Upload a DOCX, DOC or PDF file.',
};

/** Текст analysisError для помилки аналізу: англійський, без внутрішніх подробиць. */
function analysisErrorMessage(error) {
  if (PARSE_ERRORS[error.code]) return PARSE_ERRORS[error.code];
  // Помилки, які сервіси v5 кидають через httpError, вже мають англійський message
  if (error.statusCode && error.statusCode < 500 && /^[\x20-\x7E–—’“”…]+$/.test(error.message || '')) return error.message;
  return GENERIC_ERROR;
}

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
  if (!INPUT_FORMATS.includes(format)) {
    throw httpError(400, 'This file format is not supported. Upload a DOCX, DOC or PDF file.', { code: 'UNSUPPORTED_FORMAT' });
  }
  const originalPath = syllabus.originalFile?.path;
  let original;
  try {
    original = await fs.readFile(originalPath);
  } catch {
    throw httpError(404, 'The syllabus file was not found on the server. Upload it again.', { code: 'FILE_NOT_FOUND' });
  }

  const { buffer, doc, convertedFrom } = await loadDocument(original, format, { title: syllabus.title });
  if (!doc.blocks.some((b) => b.text.trim())) {
    throw httpError(422, 'No text was found in the file. Check it and upload it again.', { code: 'NO_TEXT' });
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
      const message = analysisErrorMessage(error);
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

module.exports = { runAnalysisInBackground, runAnalysis, extractDocument, analysisErrorMessage };
