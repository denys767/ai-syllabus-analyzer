// Контракт майбутнього адаптера Lecturers CRM. URL зарезервовано, мережевих запитів поки немає.
async function getProfile({ userId, email }) {
  return null;
}

async function writeBack(profile) {
  return { ok: false, reason: 'CRM_NOT_CONFIGURED' };
}

module.exports = { getProfile, writeBack };
