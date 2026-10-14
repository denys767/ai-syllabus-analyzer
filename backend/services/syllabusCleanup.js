const fs = require('fs');
const path = require('path');
const Syllabus = require('../models/Syllabus');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const PDF_DIR = path.join(__dirname, '../uploads/pdfs');
const PDF_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function deleteConversationsFor(syllabusIds) {
  if (!syllabusIds.length) return;
  const conversations = await Conversation.find({ syllabusId: { $in: syllabusIds } }).select('_id');
  const convIds = conversations.map((c) => c._id);
  if (convIds.length) {
    await Message.deleteMany({ conversationId: { $in: convIds } });
    await Conversation.deleteMany({ _id: { $in: convIds } });
  }
}

// Видаляє силабуси за фільтром разом з файлами, розмовами й повідомленнями
async function deleteSyllabiCascade(filter) {
  const syllabi = await Syllabus.find(filter);
  for (const syllabus of syllabi) {
    try { await syllabus.cleanupFiles(); } catch { /* best-effort */ }
  }
  const ids = syllabi.map((s) => s._id);
  await deleteConversationsFor(ids);
  await Syllabus.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

// Силабуси, що зависли в `analyzing` довше за 3×AI_REQUEST_TIMEOUT_MS (наприклад, після рестарту), → error
async function sweepStuckAnalyses() {
  const aiTimeout = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '130000', 10);
  const threshold = new Date(Date.now() - 3 * aiTimeout);
  const result = await Syllabus.updateMany(
    {
      status: 'analyzing',
      $or: [
        { analysisStartedAt: { $lt: threshold } },
        { analysisStartedAt: { $exists: false }, updatedAt: { $lt: threshold } },
      ],
    },
    { $set: { status: 'error', analysisError: 'Аналіз було перервано (перезапуск сервера або тайм-аут). Повторіть аналіз.' } }
  );
  if (result.modifiedCount) console.warn(`[sweep] завислих аналізів позначено як error: ${result.modifiedCount}`);
  return result.modifiedCount;
}

// uploads/pdfs: видаляє файли старші за 7 днів, на які не посилається жоден силабус
async function sweepOldPdfs({ maxAgeMs = PDF_MAX_AGE_MS } = {}) {
  let entries;
  try { entries = await fs.promises.readdir(PDF_DIR); } catch { return 0; }

  const docs = await Syllabus.find().select('previewPdf.path submittedPdfPath').lean();
  const referenced = new Set();
  for (const d of docs) {
    if (d.previewPdf?.path) referenced.add(path.basename(d.previewPdf.path));
    if (d.submittedPdfPath) referenced.add(path.basename(d.submittedPdfPath));
  }

  let deleted = 0;
  for (const name of entries) {
    if (referenced.has(name)) continue;
    const full = path.join(PDF_DIR, name);
    try {
      const stat = await fs.promises.stat(full);
      if (!stat.isFile() || Date.now() - stat.mtimeMs < maxAgeMs) continue;
      await fs.promises.unlink(full);
      deleted++;
    } catch { /* ignore */ }
  }
  if (deleted) console.log(`[sweep] видалено застарілих PDF: ${deleted}`);
  return deleted;
}

// Прапорець submitting міг лишитись після падіння процесу посеред відправки
async function releaseStuckSubmits() {
  const result = await Syllabus.updateMany({ submitting: true }, { $set: { submitting: false } });
  if (result.modifiedCount) console.warn(`[sweep] знято прапорець submitting: ${result.modifiedCount}`);
  return result.modifiedCount;
}

function startBackgroundSweepers() {
  const run = () => {
    sweepOldPdfs().catch((e) => console.error('[sweep] pdf error:', e.message));
  };
  sweepStuckAnalyses().catch((e) => console.error('[sweep] analyses error:', e.message));
  releaseStuckSubmits().catch((e) => console.error('[sweep] submits error:', e.message));
  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = {
  deleteSyllabiCascade,
  deleteConversationsFor,
  sweepStuckAnalyses,
  sweepOldPdfs,
  releaseStuckSubmits,
  startBackgroundSweepers,
};
