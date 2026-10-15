const { createHash } = require('crypto');
const { validateSchema } = require('./schemas');
const { getCriterion } = require('../rubric');

const PROMPT_VERSION = 'review-4a-v1';
const ABSENCE_CRITERIA = new Set(['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'PO-1', 'PO-3', 'PO-4', 'AS-5', 'AS-6']);
function renderDocument(blocks, meta = {}) {
  return `Metadata: ${JSON.stringify({ title: meta.title, courseName: meta.courseName })}\n${blocks.map((b) => `[${b.id}] ${b.kind === 'heading' || b.kind === 'slide-title' ? `${'#'.repeat(Math.max(1, Math.min(6, b.level || 2)))} ` : ''}${b.text}${b.readOnly ? ' [READ ONLY]' : ''}`).join('\n')}`;
}
function isTransient(error) {
  const status = Number(error.status ?? error.statusCode);
  if (Number.isFinite(status) && status > 0) return status === 408 || status === 429 || (status >= 500 && status < 600);
  return /APIConnection|Timeout|AbortError/.test(error.name || '')
    || /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_)/.test(error.code || error.cause?.code || '')
    || /network|timed?\s*out|timeout|fetch failed|socket hang up/i.test(error.message || '');
}
async function requestJSON(name, schema, system, document, { effort = 'medium', stats, validate } = {}) {
  // Ліниве завантаження дозволяє eval --mock працювати без API-ключа.
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
async function mapLimit(items, limit, fn) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('concurrency must be a positive integer');
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; result[i] = await fn(items[i], i); }
  }));
  return result;
}
const evidenceKey = (f) => `${f.criterionId}:${[...new Set(f.evidenceBlockIds)].sort().join(',')}`;
function makeFinding(criterionId, values) {
  const c = getCriterion(criterionId);
  const evidenceBlockIds = [...new Set(values.evidenceBlockIds)].sort();
  return {
    id: `f_${createHash('sha256').update(evidenceKey({ criterionId, evidenceBlockIds })).digest('hex').slice(0, 16)}`,
    criterionId, group: c.group, severity: c.defaultSeverity, confidence: values.confidence,
    materiality: values.materiality, claim: values.claim, rationale: values.rationale, evidenceBlockIds,
    mba27: c.mba27, fixType: c.fix, standardClauseId: c.standardClauseId,
    suggestedAction: values.suggestedAction, promptVersion: PROMPT_VERSION,
    _missingSection: Boolean(values.missingSection), _severity: values.severity, _severityReason: values.severityReason,
  };
}
function validEvidence(finding, blocks) {
  const ids = new Set(blocks.map((b) => b.id));
  if (finding._missingSection && ABSENCE_CRITERIA.has(finding.criterionId)) {
    const headings = new Set(blocks.filter((b) => b.kind === 'heading' || b.kind === 'slide-title').map((b) => b.id));
    return finding.evidenceBlockIds.length > 0 && finding.evidenceBlockIds.every((id) => id === 'document' || headings.has(id));
  }
  return finding.evidenceBlockIds.length > 0 && finding.evidenceBlockIds.every((id) => ids.has(id)
    || (id === 'document' && finding._missingSection && ABSENCE_CRITERIA.has(finding.criterionId)));
}
module.exports = { PROMPT_VERSION, ABSENCE_CRITERIA, renderDocument, requestJSON, mapLimit, makeFinding, evidenceKey, validEvidence };
