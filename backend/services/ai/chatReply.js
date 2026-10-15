const { createResponse, llmModel, clipText } = require('./client');

const MAX_SNIPPET = 600;

function describeChanges(changes) {
  return (changes || []).slice(0, 6).map((c) => {
    if (c.op === 'deleteBlock') return `  - delete [${c.blockId}]: "${clipText(c.before, MAX_SNIPPET)}"`;
    if (c.op === 'insertAfter') return `  - insert after [${c.blockId}]: "${clipText(c.after, MAX_SNIPPET)}"`;
    return `  - replace [${c.blockId}]\n    before: "${clipText(c.before, MAX_SNIPPET)}"\n    after:  "${clipText(c.after, MAX_SNIPPET)}"`;
  }).join('\n');
}

/** Контекст поточної картки (SuggestionView) для промпту. */
function serializeSuggestionContext(view) {
  if (!view) return 'No suggestion card is active right now.';
  const lines = [
    `Current suggestion (${view.group} / ${view.severity}, ${view.kind}, status ${view.status}): ${view.title}`,
    `Description: ${view.description || '-'}`,
  ];
  if (view.rationale) lines.push(`Rationale: ${view.rationale}`);
  if (view.kind === 'question') lines.push(`The AI asked the instructor: ${view.question}`);
  if (view.kind === 'edit') {
    lines.push(view.changes.length ? `Proposed changes:\n${describeChanges(view.changes)}` : 'This is advice without a ready-made edit.');
  }
  if (view.kind === 'choice') {
    lines.push('The instructor must choose one of these options:');
    for (const o of view.options || []) {
      lines.push(`  Option "${o.label}"${o.rationale ? ` (${o.rationale})` : ''}${o.changes.length ? `:\n${describeChanges(o.changes)}` : ' (needs more details)'}`);
    }
  }
  if ((view.conflictsWith || []).length) {
    lines.push(`Conflicts with already accepted suggestions: ${view.conflictsWith.map((c) => c.title).join('; ')}`);
  }
  return lines.join('\n');
}

/**
 * Відповідь на вільне питання викладача з контекстом поточної картки і фрагментами документа.
 * @param {object} syllabus
 * @param {object[]} recentMessages  останні повідомлення (за зростанням часу)
 * @param {string} userText
 * @param {object|null} suggestionView  SuggestionView поточної картки
 * @param {string} [evidence]  текст блоків-доказів поточної пропозиції
 */
async function chatReply(syllabus, recentMessages, userText, suggestionView, evidence = '') {
  const transcript = (recentMessages || []).slice(-8).map((m) => {
    const speaker = m.role === 'ai' ? 'AI' : m.role === 'user' ? 'Instructor' : 'System';
    return `${speaker}: ${clipText(m.content || '', 800)}`;
  }).join('\n');

  const prompt = `You are Professor's Tutor, helping an MBA instructor at KSE Business School improve the syllabus "${syllabus.title}".
Reply in Ukrainian, concisely (2-4 sentences), specifically, referring to the suggestion details below when relevant.
You cannot change the document from this reply: if the instructor wants the suggestion changed, tell them to describe the change and you will update the card.

${serializeSuggestionContext(suggestionView)}
${evidence ? `\nRelevant syllabus paragraphs:\n${evidence}\n` : ''}
Recent conversation:
${transcript}

Instructor just said: ${userText}`;

  const resp = await createResponse({
    model: llmModel,
    input: [
      { role: 'system', content: 'You are a focused, encouraging syllabus coach. Be brief and concrete. Always answer in Ukrainian.' },
      { role: 'user', content: prompt },
    ],
  });
  return (resp.output_text || '').trim();
}

const INTENT_SCHEMA = {
  type: 'object',
  properties: { intent: { type: 'string', enum: ['question', 'refine'] } },
  required: ['intent'],
  additionalProperties: false,
};

/**
 * Намір повідомлення викладача: питання (відповідь текстом) чи прохання змінити поточну
 * пропозицію («коротше», «без дат», «додай український кейс»).
 * @returns {Promise<'question'|'refine'>}
 */
async function classifyIntent(userText, suggestionView) {
  const { supportsReasoning, safeParseJSON } = require('./client');
  const request = {
    model: llmModel,
    input: [
      {
        role: 'system',
        content: 'Classify the instructor message about a syllabus suggestion card. '
          + 'Return "refine" if the instructor asks to change, shorten, extend, rephrase or otherwise modify the proposed edit, '
          + 'or supplies facts to put into it. Return "question" for questions, comments or anything else.',
      },
      { role: 'user', content: `Card: ${suggestionView ? `${suggestionView.title} (${suggestionView.kind})` : 'none'}\nMessage: ${userText}` },
    ],
    text: { format: { type: 'json_schema', name: 'chat_intent', strict: true, schema: INTENT_SCHEMA } },
  };
  if (supportsReasoning(llmModel)) request.reasoning = { effort: 'low' };
  const resp = await createResponse(request);
  const parsed = safeParseJSON(resp.output_text);
  return parsed && parsed.intent === 'refine' ? 'refine' : 'question';
}

module.exports = { chatReply, classifyIntent, serializeSuggestionContext };
