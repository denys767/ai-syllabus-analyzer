#!/usr/bin/env node
/**
 * Migration to the chat-first Professor's Tutor data shape.
 *
 *   - Drops the practicalChallenge subdocument from every syllabus
 *   - Remaps Syllabus.status: processing→analyzing, analyzed|reviewed|approved→in_progress
 *   - Renames recommendations[].status → recommendations[].decision
 *   - Renames recommendations[].suggestedText → kept as-is (consumed by Phase 2 beforeAfter generator)
 *   - Demotes any user with role 'manager' to 'instructor' (logged for audit)
 *
 * Idempotent: safe to run multiple times. Run with `--dry-run` to preview.
 *
 * Usage:
 *   node scripts/migrate-v2.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const mongoose = require('mongoose');

const DRY = process.argv.includes('--dry-run');
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-syllabus-analyzer';

async function run() {
  console.log(`[migrate-v2] connecting to ${URI}${DRY ? ' (DRY RUN)' : ''}`);
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const stats = {
    syllabiInspected: 0,
    practicalChallengeUnset: 0,
    statusRemapped: 0,
    recDecisionRenamed: 0,
    recSuggestedTextDropped: 0,
    usersDemoted: 0,
  };

  // 1. Drop practicalChallenge field
  if (DRY) {
    stats.practicalChallengeUnset = await db.collection('syllabi').countDocuments({
      practicalChallenge: { $exists: true },
    });
  } else {
    const r = await db.collection('syllabi').updateMany(
      { practicalChallenge: { $exists: true } },
      { $unset: { practicalChallenge: '' } }
    );
    stats.practicalChallengeUnset = r.modifiedCount;
  }

  // 2. Remap top-level status enum values
  const statusMap = [
    { from: 'processing', to: 'analyzing' },
    { from: 'analyzed', to: 'in_progress' },
    { from: 'reviewed', to: 'in_progress' },
    { from: 'approved', to: 'submitted' }, // approved → submitted (closest match for already-finalised work)
  ];
  for (const { from, to } of statusMap) {
    if (DRY) {
      stats.statusRemapped += await db.collection('syllabi').countDocuments({ status: from });
    } else {
      const r = await db.collection('syllabi').updateMany({ status: from }, { $set: { status: to } });
      stats.statusRemapped += r.modifiedCount;
    }
  }

  // 3. Per-recommendation: rename status → decision (and drop suggestedText since beforeAfter takes over)
  const cursor = db.collection('syllabi').find({ 'recommendations.0': { $exists: true } });
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    stats.syllabiInspected += 1;
    let dirty = false;
    const newRecs = (doc.recommendations || []).map((rec) => {
      const next = { ...rec };
      if (rec.status && !rec.decision) {
        next.decision = rec.status;
        delete next.status;
        dirty = true;
        stats.recDecisionRenamed += 1;
      }
      if (rec.suggestedText) {
        delete next.suggestedText;
        dirty = true;
        stats.recSuggestedTextDropped += 1;
      }
      return next;
    });
    if (dirty && !DRY) {
      await db.collection('syllabi').updateOne({ _id: doc._id }, { $set: { recommendations: newRecs } });
    }
  }

  // 4. Demote manager users
  const managers = await db.collection('users').find({ role: 'manager' }).project({ email: 1 }).toArray();
  if (managers.length) {
    console.log(`[migrate-v2] manager → instructor demotion (${managers.length}):`);
    for (const m of managers) console.log(`  - ${m.email} (${m._id})`);
    if (!DRY) {
      const r = await db.collection('users').updateMany({ role: 'manager' }, { $set: { role: 'instructor' } });
      stats.usersDemoted = r.modifiedCount;
    } else {
      stats.usersDemoted = managers.length;
    }
  }

  console.log('[migrate-v2] summary:', stats);
  await mongoose.disconnect();
  console.log('[migrate-v2] done.');
}

run().catch((err) => {
  console.error('[migrate-v2] failed:', err);
  process.exit(1);
});
