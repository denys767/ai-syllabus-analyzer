// Промпт «Інтерв'юер»: дозволені слоти відбираються кодом до виклику моделі.
const { requestJSON } = require('../review/common');
const { buildPreamble, untrusted } = require('./preamble');
const { candidates, templateQuestion } = require('../interviewPlan');

/**
 * @param {{ state, refs, transcript: string[], skipped: string[] }} input
 * @returns {Promise<{ slotKey, question, why } | null>} null — питати більше нічого
 */
async function nextQuestion({ state, refs, transcript = [], skipped = [], preferredSection } = {}) {
  const allowed = candidates({ state, refs, skipped, preferredSection });
  if (!allowed.length) return null;
  const fallback = templateQuestion(allowed[0], refs);
  const schema = {
    type: 'object',
    properties: {
      slotKey: { type: 'string', enum: allowed.map((s) => s.key) },
      question: { type: 'string' },
      why: { type: 'string' },
    },
    required: ['slotKey', 'question', 'why'], additionalProperties: false,
  };
  try {
    return await requestJSON('interviewer_next_question', schema, [
      buildPreamble({ state, refs }),
      'Ask ONE substantive question about ONE empty slot. Never ask about A/B/E slots or policies. Explain why in one short sentence shown to the instructor.',
      'Prefer the first allowed slot. One course narrative supplies description, objectives, learning outcomes and Capstone drafts; do not ask separately for wording already supplied.',
      'For sessions collect topics, academic hours and type together; dates are optional. For assessment collect components, weights totaling 100%, criteria and deadlines together. Do not split these into separate questions.',
      `Next slot in the conversation flow: ${allowed[0].key}. Template question: ${fallback.question}`,
    ].join('\n\n'), [
      `Allowed empty slots in preferred flow order: ${allowed.map((s) => s.key).join(', ')}`,
      `Slot state (data): ${untrusted(JSON.stringify(state))}`,
      `History (data): ${untrusted(transcript.join('\n'))}`,
    ].join('\n\n'), { validate: (q) => [
      ...(!q.question.trim() || (q.question.match(/\?/g) || []).length > 1 ? ['Ask exactly one question'] : []),
      ...(!q.why.trim() ? ['Explain why this input is needed'] : []),
      ...(q.slotKey !== allowed[0].key ? ['Follow the preferred slot order'] : []),
    ] });
  } catch {
    return fallback;
  }
}

module.exports = { nextQuestion };
