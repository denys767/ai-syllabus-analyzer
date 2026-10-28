#!/usr/bin/env node
/**
 * Міграція v4 → v5 (Syllabus.state як джерело правди; submit і формати виходу прибрано).
 *
 *   - Syllabus програми з `editions` (MBA) без `programCode` → `--default-edition` (за замовчуванням MBA28).
 *   - `status: 'submitted'` → `in_progress`; `submittedAt` переноситься в `legacySubmittedAt`.
 *   - $unset полів submit (`submitting`, `submissionEmailStatus`, `submittedPdfPath`, `submittedAt`)
 *     і кешу outputs старих форматів (clean, tracked, trackedPdf, annotated, edited, previewPdf);
 *     файли цих outputs і `submittedPdfPath` видаляються з диска.
 *   - Suggestion з непорожніми `ops` (v4; також у варіантах choice) видаляються.
 *   - Message.kind `submission-cta` → `text`.
 *   - Syllabus з `document`, але без `state` (не в аналізі) → `needsRebuild: true`
 *     («Rebuild in the new format» = `POST /api/syllabus/:id/analyze`).
 *   - Pre-v4 legacy (`legacy: true`) лишаються як є, окрім `programCode`.
 *
 * Idempotent: повторний запуск дає 0 змін. `--dry-run` лише рахує.
 *
 * Usage (з кореня репозиторію):
 *   node scripts/migrate-v5-state.js [--dry-run] [--default-edition=MBA28]
 */

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', 'backend');
const fromBackend = (name) => require(require.resolve(name, { paths: [BACKEND] }));

const OLD_OUTPUT_KEYS = ['clean', 'tracked', 'trackedPdf', 'annotated', 'edited', 'previewPdf'];
const SUBMIT_FIELDS = ['submitting', 'submissionEmailStatus', 'submittedPdfPath', 'submittedAt'];
const NOT_LEGACY = { legacy: { $ne: true } };

const oldFilePaths = (doc) => [
  ...OLD_OUTPUT_KEYS.map((k) => doc.outputs?.[k]?.path),
  doc.submittedPdfPath,
].filter(Boolean);

/**
 * @param {import('mongodb').Db} db
 * @param {{dryRun?: boolean, defaultEdition?: string}} opts
 */
async function migrate(db, { dryRun = false, defaultEdition = 'MBA28' } = {}) {
  const syllabi = db.collection('syllabi');
  const programs = db.collection('programs');
  const suggestions = db.collection('suggestions');
  const messages = db.collection('messages');
  const stats = {};
  const edition = String(defaultEdition).toUpperCase();

  // 1. programCode для програм із редакціями
  const editionPrograms = await programs.find({ 'editions.0': { $exists: true } }).project({ _id: 1, editions: 1 }).toArray();
  stats.programCodeSet = 0;
  for (const program of editionPrograms) {
    if (!program.editions.some((e) => e.code === edition)) continue;
    const filter = { programId: program._id, $or: [{ programCode: { $exists: false } }, { programCode: null }, { programCode: '' }] };
    stats.programCodeSet += await syllabi.countDocuments(filter);
    if (!dryRun) await syllabi.updateMany(filter, { $set: { programCode: edition } });
  }

  // 2. submitted → in_progress, поля submit, outputs старих форматів (legacy не чіпаємо)
  const submitFilter = {
    ...NOT_LEGACY,
    $or: [
      { status: 'submitted' },
      ...SUBMIT_FIELDS.map((f) => ({ [f]: { $exists: true } })),
      ...OLD_OUTPUT_KEYS.map((k) => ({ [`outputs.${k}`]: { $exists: true } })),
    ],
  };
  stats.statusReset = await syllabi.countDocuments({ ...NOT_LEGACY, status: 'submitted' });
  stats.submitFieldsUnset = await syllabi.countDocuments({
    ...NOT_LEGACY, $or: SUBMIT_FIELDS.map((f) => ({ [f]: { $exists: true } })),
  });
  stats.outputsUnset = await syllabi.countDocuments({
    ...NOT_LEGACY, $or: OLD_OUTPUT_KEYS.map((k) => ({ [`outputs.${k}`]: { $exists: true } })),
  });

  stats.outputFilesDeleted = 0;
  const docs = await syllabi.find(submitFilter).project({ outputs: 1, submittedPdfPath: 1 }).toArray();
  for (const doc of docs) {
    for (const file of new Set(oldFilePaths(doc))) {
      if (!fs.existsSync(file)) continue;
      stats.outputFilesDeleted += 1;
      if (!dryRun) await fs.promises.unlink(file).catch(() => {});
    }
  }

  if (!dryRun && docs.length) {
    await syllabi.updateMany(submitFilter, [
      {
        $set: {
          status: { $cond: [{ $eq: ['$status', 'submitted'] }, 'in_progress', '$status'] },
          legacySubmittedAt: { $ifNull: ['$legacySubmittedAt', { $ifNull: ['$submittedAt', { $cond: [{ $eq: ['$status', 'submitted'] }, '$updatedAt', '$$REMOVE'] }] }] },
        },
      },
      { $unset: [...SUBMIT_FIELDS, ...OLD_OUTPUT_KEYS.map((k) => `outputs.${k}`)] },
    ]);
  }

  // 3. Suggestion v4 (з ops)
  const v4Suggestions = { $or: [{ 'ops.0': { $exists: true } }, { 'options.ops.0': { $exists: true } }] };
  stats.suggestionsDeleted = await suggestions.countDocuments(v4Suggestions);
  if (!dryRun && stats.suggestionsDeleted) await suggestions.deleteMany(v4Suggestions);

  // 4. submission-cta → text
  const ctaFilter = { kind: 'submission-cta' };
  stats.messagesRemapped = await messages.countDocuments(ctaFilter);
  if (!dryRun && stats.messagesRemapped) await messages.updateMany(ctaFilter, { $set: { kind: 'text' } });

  // 5. v4 без state → needsRebuild
  const rebuildFilter = {
    ...NOT_LEGACY,
    'document.docVersion': { $exists: true },
    $and: [{ $or: [{ state: { $exists: false } }, { state: null }] }],
    status: { $ne: 'analyzing' }, // v5-аналіз ще йде: state з'явиться після парсингу
    needsRebuild: { $ne: true },
  };
  stats.needsRebuildSet = await syllabi.countDocuments(rebuildFilter);
  if (!dryRun && stats.needsRebuildSet) await syllabi.updateMany(rebuildFilter, { $set: { needsRebuild: true } });

  return stats;
}

function parseEdition(argv) {
  const eq = argv.find((a) => a.startsWith('--default-edition='));
  if (eq) return eq.split('=')[1];
  const i = argv.indexOf('--default-edition');
  return i >= 0 ? argv[i + 1] : undefined;
}

async function run() {
  fromBackend('dotenv').config({ path: path.join(BACKEND, '.env') });
  const mongoose = fromBackend('mongoose');
  const dryRun = process.argv.includes('--dry-run');
  const defaultEdition = parseEdition(process.argv) || 'MBA28';
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-syllabus-analyzer';
  console.log(`[migrate-v5-state] connecting to ${uri}${dryRun ? ' (DRY RUN)' : ''}`);
  await mongoose.connect(uri);
  const stats = await migrate(mongoose.connection.db, { dryRun, defaultEdition });
  console.log('[migrate-v5-state] summary:', stats);
  await mongoose.disconnect();
  console.log('[migrate-v5-state] done.');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[migrate-v5-state] failed:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
