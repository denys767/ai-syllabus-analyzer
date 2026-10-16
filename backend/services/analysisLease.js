// Аналіз як відновлюваний job: власник тримає lease (analysisLeaseToken + analysisLeaseUntil) і
// продовжує його, поки працює. Прострочений lease (рестарт, падіння процесу) підхоплює sweeper:
// перезапуск до MAX_ATTEMPTS спроб, далі status=error з RECOVERY_ERROR.

const Syllabus = require('../models/Syllabus');

const LEASE_MS = Math.max(3000, Number(process.env.ANALYSIS_LEASE_MS) || 60000);
const MAX_ATTEMPTS = 2;
const RECOVERY_ERROR = 'Аналіз двічі переривався (перезапуск сервера або збій). Запустіть аналіз повторно.';

/** Фільтр: lease немає або він прострочений. */
function expiredLease(now = new Date()) {
  return { $or: [{ analysisLeaseUntil: { $lte: now } }, { analysisLeaseUntil: null }] };
}

/** Фільтр записів, якими володіє цей запуск (без token — лише status=analyzing, для прямих викликів). */
function ownedAnalysis(syllabusId, token) {
  const filter = { _id: syllabusId, status: 'analyzing' };
  if (token) Object.assign(filter, { analysisLeaseToken: token, analysisLeaseUntil: { $gt: new Date() } });
  return filter;
}

/** Кидає ANALYSIS_LEASE_LOST, якщо job перехопив інший запуск або аналіз скасовано. */
async function assertLease(syllabusId, token) {
  if (token && !await Syllabus.exists(ownedAnalysis(syllabusId, token))) {
    throw Object.assign(new Error('Аналіз продовжує інший процес.'), { code: 'ANALYSIS_LEASE_LOST' });
  }
}

module.exports = { LEASE_MS, MAX_ATTEMPTS, RECOVERY_ERROR, expiredLease, ownedAnalysis, assertLease };
