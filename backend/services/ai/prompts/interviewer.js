// Промпт «Інтерв'юер» (ТЗ §7): обрати ОДИН незаповнений слот і поставити ОДНЕ питання. Заготовка — W3 (агент K).
// Заборонено питати про слоти A/B/E і ставити два питання підряд.
const { httpError } = require('../../../utils/httpError');

/**
 * @param {{ state, refs, transcript: string[], skipped: string[] }} input
 * @returns {Promise<{ slotKey, question, why } | null>} null — питати більше нічого
 */
async function nextQuestion() { throw httpError(501, 'Interviewer is not implemented yet', { code: 'NOT_IMPLEMENTED' }); }

module.exports = { nextQuestion };
