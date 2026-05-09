const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const aiRequestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 130000);

const envModel = (process.env.LLM_MODEL || '').trim();
const llmModel = envModel && envModel.startsWith('gpt-') ? envModel : 'gpt-5.4-mini';
const reasoningEffort = (process.env.LLM_REASONING_EFFORT || 'medium').trim();
const maxOutputTokens = Number(process.env.LLM_MAX_OUTPUT_TOKENS || 0);

function supportsReasoning(model) {
  const value = String(model || '');
  return value.startsWith('gpt-5') || /^o\d/.test(value);
}

async function createResponse(params) {
  const request = { ...params };
  if (!request.reasoning && supportsReasoning(request.model || llmModel)) {
    request.reasoning = { effort: reasoningEffort };
  }
  if (!request.max_output_tokens && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
    request.max_output_tokens = maxOutputTokens;
  }
  return openai.responses.create(request, { timeout: aiRequestTimeoutMs });
}

function safeParseJSON(text) {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function clipText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? '),
    clipped.lastIndexOf('\n')
  );
  if (sentenceEnd > Math.floor(maxChars * 0.55)) {
    return clipped.slice(0, sentenceEnd + 1).trim();
  }
  return clipped.trim();
}

module.exports = {
  openai,
  createResponse,
  safeParseJSON,
  clipText,
  llmModel,
  reasoningEffort,
  maxOutputTokens,
  aiRequestTimeoutMs,
};
