// Спільний виклик LLM зі strict json_schema: повтори тимчасових збоїв і невалідних відповідей, семантична корекція.
// Єдина обгортка над services/ai/client для промптів v5 (parse, interviewer, formulator, reviewer, loMapping, readings).
const { validateSchema } = require('../../../utils/jsonSchema');

function isTransient(error) {
  const status = Number(error.status ?? error.statusCode);
  if (Number.isFinite(status) && status > 0) return status === 408 || status === 429 || (status >= 500 && status < 600);
  return /APIConnection|Timeout|AbortError/.test(error.name || '')
    || /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_)/.test(error.code || error.cause?.code || '')
    || /network|timed?\s*out|timeout|fetch failed|socket hang up/i.test(error.message || '');
}
async function requestJSON(name, schema, system, document, { effort = 'medium', stats, validate } = {}) {
  // Ліниве завантаження: модуль можна підключати без API-ключа (клієнт створюється при першому виклику).
  const { createResponse, llmModel } = require('../client');
  let retries = 0;
  let semanticRetries = 0;
  const feedback = [];
  while (true) {
    let parsed;
    let responseError;
    try {
      if (stats) stats.llmCalls += 1;
      const response = await createResponse({
        model: llmModel, reasoning: { effort },
        input: [{ role: 'system', content: system }, { role: 'user', content: `${document}${feedback.length ? `\nPrevious response validation errors; correct them:\n${feedback.join('\n')}` : ''}` }],
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      });
      if (response?.status === 'incomplete') responseError = 'incomplete response';
      else {
        try { parsed = JSON.parse(response?.output_text); } catch { responseError = 'invalid JSON or refusal'; }
        if (!responseError) {
          const errors = validateSchema(schema, parsed);
          if (errors.length) responseError = errors.join('; ');
        }
      }
      if (responseError) throw new Error(`${name}: ${responseError}`);
    } catch (error) {
      if ((!responseError && !isTransient(error)) || retries >= 2) throw error;
      retries += 1;
      if (responseError) feedback.push(error.message);
      else await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** (retries - 1))));
      continue;
    }
    const errors = validate ? validate(parsed) : [];
    if (!errors.length) return parsed;
    const error = new Error(`${name}: ${errors.join('; ')}`);
    if (semanticRetries >= 1) throw error;
    semanticRetries += 1;
    feedback.push(error.message);
  }
}
module.exports = { requestJSON };
