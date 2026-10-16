const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Сирий токен іде на пошту, у БД зберігається лише SHA-256 хеш.
function generateToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

module.exports = { hashToken, generateToken };
