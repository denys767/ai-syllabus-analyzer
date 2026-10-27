// Оркестратор чату з function calling (ТЗ §6 «Чат мусить змінювати документ»). Заготовка W2 — реалізує агент F.
const { httpError } = require('../../../utils/httpError');

/**
 * Один хід: вільне повідомлення викладача → tool calls (get_slot, set_slot, propose_draft, apply_edit, run_checks) → відповідь.
 * @param {{ syllabus, state, revision, refs, conversation, messages, userText: string, userId,
 *           deps: { mutate, createDraftSuggestions, runChecks, findSuggestion } }} ctx
 * @returns {Promise<{ reply: string, createdSuggestionIds: string[], stateChanged: boolean, currentSlotKey?: string|null }>}
 */
async function runOrchestratorTurn() { throw httpError(501, 'Chat orchestrator is not implemented yet', { code: 'NOT_IMPLEMENTED' }); }

module.exports = { runOrchestratorTurn };
