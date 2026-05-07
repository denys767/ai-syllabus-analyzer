const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const aiRequestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 130000);

const envModel = (process.env.LLM_MODEL || '').trim();
const llmModel = envModel && envModel.startsWith('gpt-') ? envModel : 'gpt-5-nano';

async function createResponse(params) {
  return openai.responses.create(params, { timeout: aiRequestTimeoutMs });
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
  aiRequestTimeoutMs,
};
