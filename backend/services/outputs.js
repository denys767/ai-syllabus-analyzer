// Фінальні файли силабусу (перелік за форматом — outputFormats.js):
// docx/doc — tracked.docx, clean.docx, tracked.pdf; pdf — ще annotated.pdf (примітки на оригіналі);
// pptx — edited.pptx, preview.pdf.
// Кеш у Syllabus.outputs за ключем (docVersion, acceptedHash); після кожного рішення інвалідовується.

const fs = require('fs').promises;
const path = require('path');
const Syllabus = require('../models/Syllabus');
const {
  writeDocx, writePptx, annotatePdf, toPdf, DEFAULT_AUTHOR,
} = require('./document');
const { mapPdfSuggestions, sourcePdfDoc } = require('./document/pdfMapping');
const { httpError } = require('../utils/httpError');
const { loadSyllabus, docOf, loadAcceptedDocs, acceptedHash } = require('./chat/state');
const { OUTPUTS, outputNames } = require('./outputFormats');

const OUTPUTS_DIR = path.join(__dirname, '../uploads/outputs');
const FILE_NAMES = Object.fromEntries(Object.entries(OUTPUTS).map(([name, spec]) => [spec.key, name]));

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

async function readOriginalFile(syllabus) {
  try {
    return await fs.readFile(syllabus.originalFile?.path);
  } catch {
    throw httpError(404, 'Оригінальний файл силабусу не знайдено на сервері. Завантажте силабус ще раз.');
  }
}

/**
 * Рендер одного файлу. `ctx` спільний для всіх ключів одного виклику: проміжні результати
 * (tracked.docx для tracked.pdf, edited.pptx для preview.pdf) будуються один раз.
 */
async function render(key, ctx) {
  const { syllabus, working, doc, accepted } = ctx;
  const tracked = async () => {
    ctx.tracked ||= await writeDocx(working, doc, accepted, { mode: 'tracked', author: DEFAULT_AUTHOR, comments: true });
    return ctx.tracked;
  };
  const edited = async () => {
    ctx.edited ||= await writePptx(working, doc, accepted);
    return ctx.edited;
  };
  switch (key) {
    case 'clean': return writeDocx(working, doc, accepted, { mode: 'clean', author: DEFAULT_AUTHOR });
    case 'tracked': return tracked();
    case 'trackedPdf': return toPdf(await tracked(), 'docx', { exportComments: true });
    case 'edited': return edited();
    case 'previewPdf': return toPdf(await edited(), 'pptx');
    case 'annotated':
      // Прийняті пропозиції адресують блоки синтезованого DOCX → переводимо на блоки PDF
      return annotatePdf(await readOriginalFile(syllabus), sourcePdfDoc(doc), mapPdfSuggestions(doc, accepted), { author: DEFAULT_AUTHOR });
    default: throw httpError(404, 'Невідомий файл');
  }
}

/**
 * Повертає готові файли (з кешу, якщо ключ збігається, інакше рендерить).
 * @param {string[]} keys   ключі OUTPUTS: 'clean' | 'tracked' | 'trackedPdf' | 'annotated' | 'edited' | 'previewPdf'
 * @param {{fresh?: boolean}} opts  fresh — ігнорувати кеш (submit)
 * @returns {Promise<Record<string, {path: string, buffer?: Buffer}>>}
 */
async function ensureOutputs(syllabusId, keys, { fresh = false } = {}) {
  const syllabus = await loadSyllabus(syllabusId);
  const doc = docOf(syllabus);
  const allowed = outputNames(syllabus).map((name) => OUTPUTS[name].key);
  if (keys.some((key) => !allowed.includes(key))) throw httpError(404, 'Цей файл недоступний для цього силабусу.', { code: 'OUTPUT_NOT_AVAILABLE' });
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

  const ctx = { syllabus, working: await readWorkingFile(syllabus), doc, accepted };
  const set = {};
  for (const key of toRender) {
    const buffer = await render(key, ctx);
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
  const syllabus = await loadSyllabus(syllabusId);
  docOf(syllabus); // legacy → 409 LEGACY_SYLLABUS
  const spec = outputNames(syllabus).includes(name) ? OUTPUTS[name] : null;
  if (!spec) {
    throw httpError(404, `Файл «${name}» недоступний для цього силабусу. Доступні: ${outputNames(syllabus).join(', ')}.`, { code: 'OUTPUT_NOT_AVAILABLE' });
  }
  const files = await ensureOutputs(syllabusId, [spec.key]);
  return { path: files[spec.key].path, filename: downloadName(syllabus, name), contentType: spec.contentType };
}

async function removeOutputDir(syllabusId) {
  await fs.rm(outputDir(syllabusId), { recursive: true, force: true }).catch(() => {});
}

module.exports = { OUTPUTS, OUTPUTS_DIR, ensureOutputs, getOutputFile, downloadName, outputDir, removeOutputDir };
