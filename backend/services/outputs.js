// Фінальний файл силабусу: один syllabus.docx за шаблоном KSE (writers/templateDocx.js).
// Кеш — файл uploads/outputs/<id>/syllabus.r<stateRevision>.docx: нова ревізія стану дає нове ім'я,
// тож застарілий файл ніколи не віддається; старі ревізії видаляються при рендері.

const fs = require('fs').promises;
const path = require('path');
const Syllabus = require('../models/Syllabus');
const Program = require('../models/Program');
const { renderSyllabusDocx } = require('./document/writers/templateDocx');
const store = require('./syllabusState/store');
const references = require('./references');
const { httpError } = require('../utils/httpError');
const { OUTPUTS } = require('./outputFormats');

const OUTPUTS_DIR = path.join(__dirname, '../uploads/outputs');
const CACHE_RE = /^syllabus\.r\d+\.docx$/;
// Файли виходів v4 у тому самому каталозі
const V4_NAMES = new Set(['tracked.docx', 'clean.docx', 'tracked.pdf', 'annotated.pdf', 'edited.pptx', 'preview.pdf']);

const outputDir = (syllabusId) => path.join(OUTPUTS_DIR, String(syllabusId));
const cachePath = (syllabusId, revision) => path.join(outputDir(syllabusId), `syllabus.r${revision}.docx`);

/** `<Course_Title>_syllabus.docx`: літери й цифри будь-якої мови, решта — підкреслення. */
function downloadName(syllabus, state) {
  const title = state?.header?.courseTitle || syllabus.title || '';
  const base = String(title).normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Syllabus';
  return `${base}${OUTPUTS['syllabus.docx'].suffix}`;
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

async function pruneOutputs(syllabusId, keepPath) {
  const dir = outputDir(syllabusId);
  for (const name of await fs.readdir(dir).catch(() => [])) {
    const full = path.join(dir, name);
    if (full !== keepPath && (CACHE_RE.test(name) || V4_NAMES.has(name))) {
      await fs.unlink(full).catch(() => {});
    }
  }
}

/** Підпис програми в At a Glance: label редакції з Program.editions, інакше programCode. */
async function programLabelOf(syllabus) {
  const code = syllabus.programCode;
  if (!code) return null;
  const program = syllabus.programId ? await Program.findById(syllabus.programId).select('editions').lean() : null;
  return program?.editions?.find((e) => e.code === code)?.label || code;
}

/** Готовий файл для поточної ревізії стану: з кешу або рендер. */
async function ensureDocx(syllabusId) {
  const syllabus = await Syllabus.findById(syllabusId).select('title programCode programId needsRebuild legacy');
  if (!syllabus) throw httpError(404, 'Syllabus not found');
  if (syllabus.legacy || syllabus.needsRebuild) {
    throw httpError(409, 'This syllabus was created in an older version. Rebuild in the new format to continue.', { code: 'NEEDS_REBUILD' });
  }
  const { state, revision } = await store.getState(syllabusId);
  const target = cachePath(syllabusId, revision);
  if (!(await exists(target))) {
    const refs = await references.getRefs(syllabus.programCode);
    await writeAtomic(target, await renderSyllabusDocx(state, refs, { programLabel: await programLabelOf(syllabus) }));
    await pruneOutputs(syllabusId, target);
  }
  return { path: target, filename: downloadName(syllabus, state), revision };
}

/** GET /outputs/:name → { path, filename, contentType }; збільшує лічильник завантажень. Старі імена → 404. */
async function getOutputFile(syllabusId, name) {
  const spec = OUTPUTS[name];
  if (!spec) {
    throw httpError(404, `File "${name}" is not available. Available: ${Object.keys(OUTPUTS).join(', ')}.`, { code: 'OUTPUT_NOT_AVAILABLE' });
  }
  const file = await ensureDocx(syllabusId);
  await Syllabus.updateOne({ _id: syllabusId }, { $inc: { downloads: 1 } });
  return { path: file.path, filename: file.filename, contentType: spec.contentType };
}

async function removeOutputDir(syllabusId) {
  await fs.rm(outputDir(syllabusId), { recursive: true, force: true }).catch(() => {});
}

module.exports = { OUTPUTS, OUTPUTS_DIR, ensureDocx, getOutputFile, downloadName, outputDir, removeOutputDir };
