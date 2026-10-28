const Syllabus = require('../models/Syllabus');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Suggestion = require('../models/Suggestion');
const SlotChange = require('../models/SlotChange');
const { removeOutputDir } = require('./outputs');
const { LEASE_MS, MAX_ATTEMPTS, RECOVERY_ERROR, expiredLease } = require('./analysisLease');

async function deleteConversationsFor(syllabusIds) {
  if (!syllabusIds.length) return;
  const conversations = await Conversation.find({ syllabusId: { $in: syllabusIds } }).select('_id');
  const convIds = conversations.map((c) => c._id);
  if (convIds.length) {
    await Message.deleteMany({ conversationId: { $in: convIds } });
    await Conversation.deleteMany({ _id: { $in: convIds } });
  }
}

// Видаляє силабуси за фільтром разом з файлами (оригінал, робочий .docx, outputs), пропозиціями,
// журналом змін стану, розмовами й повідомленнями
async function deleteSyllabiCascade(filter) {
  const syllabi = await Syllabus.find(filter).select(`_id ${Syllabus.FILE_FIELDS}`);
  for (const syllabus of syllabi) {
    try { await syllabus.cleanupFiles(); } catch { /* best-effort */ }
    await removeOutputDir(syllabus._id);
  }
  const ids = syllabi.map((s) => s._id);
  await Suggestion.deleteMany({ syllabusId: { $in: ids } });
  await SlotChange.deleteMany({ syllabusId: { $in: ids } });
  await deleteConversationsFor(ids);
  await Syllabus.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

// Аналізи з простроченим lease (рестарт, падіння): ще є спроби → перезапуск (runner сам атомарно
// захоплює job, тож подвійного запуску немає); спроби вичерпано → error. Активний lease не чіпаємо.
async function sweepStuckAnalyses() {
  const runner = require('./analysisRunner'); // лінивий require: runner тягне AI-клієнт
  const filter = { status: 'analyzing', ...expiredLease() };
  const stuck = await Syllabus.find(filter).select('_id analysisAttempts').lean();
  let requeued = 0;
  let failed = 0;
  for (const s of stuck) {
    if ((s.analysisAttempts || 0) < MAX_ATTEMPTS) {
      runner.runAnalysisInBackground(s._id);
      requeued += 1;
    } else {
      const res = await Syllabus.updateOne({ _id: s._id, ...filter, analysisAttempts: { $gte: MAX_ATTEMPTS } }, {
        $set: { status: 'error', analysisError: RECOVERY_ERROR },
        $unset: { analysisLeaseUntil: '', analysisLeaseToken: '' },
      });
      failed += res.modifiedCount;
    }
  }
  if (requeued || failed) console.warn(`[sweep] аналізи з простроченим lease: перезапущено ${requeued}, у error ${failed}`);
  return { requeued, failed };
}

// Перевірка lease аналізів — частіше за добову (кілька періодів lease)
const ANALYSIS_SWEEP_INTERVAL_MS = Math.max(60000, 5 * LEASE_MS);

function startBackgroundSweepers() {
  const sweepAnalyses = () => sweepStuckAnalyses().catch((e) => console.error('[sweep] analyses error:', e.message));
  sweepAnalyses();
  const timers = [setInterval(sweepAnalyses, ANALYSIS_SWEEP_INTERVAL_MS)];
  timers.forEach((t) => t.unref());
  return timers;
}

module.exports = {
  deleteSyllabiCascade,
  deleteConversationsFor,
  sweepStuckAnalyses,
  startBackgroundSweepers,
};
