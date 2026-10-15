const Syllabus = require('../models/Syllabus');
const LEASE_MS = Math.max(3000, Number(process.env.ANALYSIS_LEASE_MS) || 60000);
const MAX_ATTEMPTS = 2;
const RECOVERY_ERROR = 'Аналіз двічі перервано після втрати з’єднання або перезапуску сервера. Запустіть аналіз повторно.';
const expiredLease = (now = new Date()) => ({ $or: [{ analysisLeaseUntil: { $lte: now } }, { analysisLeaseUntil: null }] });
function ownedAnalysis(syllabusId, token) {
  return { _id: syllabusId, status: 'analyzing', ...(token ? { analysisLeaseToken: token, analysisLeaseUntil: { $gt: new Date() } } : {}) };
}
async function assertLease(syllabusId, token) {
  if (token && !await Syllabus.exists(ownedAnalysis(syllabusId, token))) {
    throw Object.assign(new Error('Аналіз продовжує інший процес.'), { code: 'ANALYSIS_LEASE_LOST' });
  }
}
module.exports = { LEASE_MS, MAX_ATTEMPTS, RECOVERY_ERROR, expiredLease, ownedAnalysis, assertLease };
