// Помилки сервісів: statusCode, опційні code/retryable і деталі, що йдуть у тіло відповіді.

function httpError(statusCode, message, { code, retryable, details } = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (retryable) err.retryable = true;
  if (details) err.details = details;
  return err;
}

/** Відповідь з помилкою: `{ message, code?, retryable?, ...details }`; 5xx без внутрішніх деталей. */
function sendError(res, err, fallbackMessage = 'Внутрішня помилка сервера') {
  if (res.headersSent) return;
  const status = err.statusCode || 500;
  if (status >= 500 && !err.statusCode) console.error(err);
  const body = { message: err.statusCode ? err.message : fallbackMessage };
  if (err.code && err.statusCode) body.code = err.code;
  if (err.retryable) body.retryable = true;
  if (err.details) Object.assign(body, err.details);
  res.status(status).json(body);
}

module.exports = { httpError, sendError };
