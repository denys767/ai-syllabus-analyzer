// Фінальні файли силабусу: tracked.docx, clean.docx, tracked.pdf.
// Кеш у Syllabus.outputs за ключем (docVersion, acceptedHash); після кожного рішення інвалідовується.

const fs = require('fs').promises;
const path = require('path');
const Syllabus = require('../models/Syllabus');
const { writeDocx, toPdf, DEFAULT_AUTHOR } = require('./document');
const { httpError } = require('../utils/httpError');
const { loadSyllabus, docOf, loadAcceptedDocs, acceptedHash } = require('./chat/state');

const OUTPUTS_DIR = path.join(__dirname, '../uploads/outputs');

const OUTPUTS = {
  'tracked.docx': { key: 'tracked', suffix: '_tracked.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  'clean.docx': { key: 'clean', suffix: '_clean.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  'tracked.pdf': { key: 'trackedPdf', suffix: '_tracked.pdf', contentType: 'application/pdf' },
};
const FILE_NAMES = { tracked: 'tracked.docx', clean: 'clean.docx', trackedPdf: 'tracked.pdf' };

function outputDir(syllabusId) {
  return path.join(OUTPUTS_DIR, String(syllabusId));
}

function downloadName(syllabus, name) {
  const original = syllabus.originalFile?.originalName || syllabus.title || 'syllabus';
  const base = path.parse(original).name || 'syllabus';
  return `${base}${OUTPUTS[name].suffix}`;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Атомарний запис: tmp + rename (паралельні запити не бачать напівзаписаний файл). */
async function writeAtomic(target, buffer) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, target);
}

async function readWorkingFile(syllabus) {
  try {
    return await fs.readFile(syllabus.workingFile?.path);
  } catch {
    throw httpError(404, 'Робочий файл силабусу не знайдено на сервері. Завантажте силабус ще раз.');
  }
}

function render(key, working, doc, accepted, trackedBuffer) {
  if (key === 'clean') return writeDocx(working, doc, accepted, { mode: 'clean', author: DEFAULT_AUTHOR });
  if (key === 'tracked') return writeDocx(working, doc, accepted, { mode: 'tracked', author: DEFAULT_AUTHOR, comments: true });
  return toPdf(trackedBuffer, 'docx', { exportComments: true });
}

/**
 * Повертає готові файли (з кешу, якщо ключ збігається, інакше рендерить).
 * @param {string[]} keys   'clean' | 'tracked' | 'trackedPdf'
 * @param {{fresh?: boolean}} opts  fresh — ігнорувати кеш (submit)
 * @returns {Promise<Record<string, {path: string, buffer?: Buffer}>>}
 */
async function ensureOutputs(syllabusId, keys, { fresh = false } = {}) {
  const syllabus = await loadSyllabus(syllabusId);
  const doc = docOf(syllabus);
  const accepted = await loadAcceptedDocs(syllabusId);
  const hash = acceptedHash(accepted);
  const docVersion = doc.docVersion;
  const result = {};
  const toRender = [];

  for (const key of keys) {
    const cached = syllabus.outputs?.[key];
    if (!fresh && cached?.path && cached.acceptedHash === hash && cached.docVersion === docVersion && await exists(cached.path)) {
      result[key] = { path: cached.path };
    } else {
      toRender.push(key);
    }
  }
  if (!toRender.length) return result;

  const working = await readWorkingFile(syllabus);
  const set = {};
  let trackedBuffer;
  // tracked рендеримо першим: з нього будується PDF
  const order = ['tracked', 'clean', 'trackedPdf'].filter((k) => toRender.includes(k));
  if (order.includes('trackedPdf') && !order.includes('tracked')) {
    trackedBuffer = await render('tracked', working, doc, accepted);
  }
  for (const key of order) {
    const buffer = await render(key, working, doc, accepted, trackedBuffer);
    if (key === 'tracked') trackedBuffer = buffer;
    const target = path.join(outputDir(syllabusId), FILE_NAMES[key]);
    await writeAtomic(target, buffer);
    set[`outputs.${key}`] = { path: target, generatedAt: new Date(), docVersion, acceptedHash: hash };
    result[key] = { path: target, buffer };
  }
  // Зберігаємо кеш лише якщо множина прийнятих не змінилася під час рендеру
  const current = acceptedHash(await loadAcceptedDocs(syllabusId));
  if (current === hash) await Syllabus.updateOne({ _id: syllabusId }, { $set: set });
  return result;
}

/** GET /outputs/:name → { path, filename, contentType } */
async function getOutputFile(syllabusId, name) {
  const spec = OUTPUTS[name];
  if (!spec) throw httpError(404, 'Невідомий файл. Доступні: tracked.docx, clean.docx, tracked.pdf');
  const files = await ensureOutputs(syllabusId, [spec.key]);
  const syllabus = await loadSyllabus(syllabusId, 'title originalFile.originalName');
  return { path: files[spec.key].path, filename: downloadName(syllabus, name), contentType: spec.contentType };
}

async function removeOutputDir(syllabusId) {
  await fs.rm(outputDir(syllabusId), { recursive: true, force: true }).catch(() => {});
}

module.exports = { OUTPUTS, OUTPUTS_DIR, ensureOutputs, getOutputFile, downloadName, outputDir, removeOutputDir };
