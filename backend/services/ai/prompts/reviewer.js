// Промпт «Ревізор треку 2» (ТЗ §7): оцінює якість наявних формулювань і пропонує сильніші (before/after).
// Заготовка W2 — реалізує агент G.
const { httpError } = require('../../../utils/httpError');

/**
 * @param {{ state, refs, checks: Check[], blocks?: Block[] }} input
 * @returns {Promise<Array<object>>} входи для services/chat/draftSuggestions.createDraftSuggestions (origin: 'reviewer')
 */
async function reviewState() { throw httpError(501, 'Reviewer is not implemented yet', { code: 'NOT_IMPLEMENTED' }); }

module.exports = { reviewState };
