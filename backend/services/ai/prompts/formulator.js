// Промпт «Формулювальник» (ТЗ §7): з розповіді викладача пише Description, Objectives, LO, Capstone, Criteria.
// Заготовка W2 — реалізує агент F. Сигнатури — контракт для H (decisions.refine) і оркестратора.
const { httpError } = require('../../../utils/httpError');

/**
 * Чернетки кількох слотів з однієї розповіді («одне питання → кілька чернеток»).
 * @param {{ state, refs, narrative: string, slotKeys: string[], transcript: string[] }} input
 * @returns {Promise<Array<{ slotKey, target: { path }, text?, value?, proposedValues: [{label,value}], rationale }>>}
 */
async function draftFromNarrative() { throw httpError(501, 'Formulator is not implemented yet', { code: 'NOT_IMPLEMENTED' }); }

/**
 * Reword: нова версія чернетки картки за відгуком викладача.
 * @param {{ suggestion, feedback: string, state, refs, transcript: string[] }} input
 * @returns {Promise<{ text?, value?, proposedValues: [{label,value}], rationale, title?, description? }>}
 */
async function reword() { throw httpError(501, 'Formulator is not implemented yet', { code: 'NOT_IMPLEMENTED' }); }

module.exports = { draftFromNarrative, reword };
