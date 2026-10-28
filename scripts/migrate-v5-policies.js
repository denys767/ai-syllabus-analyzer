#!/usr/bin/env node
/**
 * Міграція на v5: довідник політик силабуса (Policy type 'syllabus-policy') з
 * backend/fixtures/reference/policies.library.json.
 *
 *   - Створює відсутні блоки, оновлює блоки зі старішою `libraryVersion`.
 *   - Блоки з `libraryVersion` >= версії фікстури (адмінські правки) не чіпає.
 *
 * Idempotent: можна запускати повторно. `--dry-run` лише показує кількість змін.
 *
 * Usage (з кореня репозиторію):
 *   node scripts/migrate-v5-policies.js [--dry-run]
 */

const path = require('path');

const BACKEND = path.join(__dirname, '..', 'backend');
const fromBackend = (name) => require(require.resolve(name, { paths: [BACKEND] }));

/**
 * Потребує підключеного mongoose.
 * @param {{dryRun?: boolean}} opts
 * @returns {Promise<{created: number, updated: number, skipped: number}>}
 */
async function migrate({ dryRun = false } = {}) {
  const { seedPolicyLibrary } = require(path.join(BACKEND, 'services', 'references', 'policies'));
  const { readFixture } = require(path.join(BACKEND, 'services', 'references', 'fixtureRefs'));
  const { version, blocks } = readFixture('policies.library.json');
  return seedPolicyLibrary({ version, blocks }, { dryRun });
}

async function run() {
  fromBackend('dotenv').config({ path: path.join(BACKEND, '.env') });
  const mongoose = fromBackend('mongoose');
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-syllabus-analyzer';
  console.log(`[migrate-v5-policies] connecting to ${uri}${dryRun ? ' (DRY RUN)' : ''}`);
  await mongoose.connect(uri);
  const stats = await migrate({ dryRun });
  console.log('[migrate-v5-policies] summary:', stats);
  await mongoose.disconnect();
  console.log('[migrate-v5-policies] done.');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[migrate-v5-policies] failed:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
