const { runChecks } = require('./checks');
const { extractStructure } = require('./structure');
const { diagnose } = require('./diagnose');
const { verify } = require('./verify');
const { generateSuggestion } = require('./rewrite');
const { PROMPT_VERSION } = require('./common');

async function runReview({ blocks, meta = {}, options = {} }) {
  if (!Array.isArray(blocks) || blocks.some((b) => !b || typeof b.id !== 'string' || !/^b\d{4,}$/.test(b.id) || typeof b.text !== 'string')
    || new Set(blocks.map((b) => b.id)).size !== blocks.length) throw new Error('blocks must have unique block ids and string text');
  if (!Number.isInteger(options.concurrency ?? 2) || (options.concurrency ?? 2) < 1) throw new Error('concurrency must be a positive integer');
  for (const key of ['maxFindings', 'maxPerGroup']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 0)) throw new Error(`${key} must be a non-negative integer`);
  }
  if (options.minConfidence !== undefined && (!Number.isFinite(options.minConfidence) || options.minConfidence < 0 || options.minConfidence > 1)) throw new Error('minConfidence must be in 0..1');
  const started = Date.now();
  const stats = { promptVersion: PROMPT_VERSION, llmCalls: 0, blocks: blocks.length };
  const checks = runChecks(blocks);
  const { structure, coverage } = await extractStructure({ blocks, meta, stats });
  const diagnosis = await diagnose({ blocks, meta, structure, coverage, checks, options, stats });
  const findings = await verify({ findings: diagnosis.findings, blocks, meta, options, stats });
  const verdicts = diagnosis.verdicts.map((v) => {
    const check = checks.find((f) => f.criterionId === v.criterionId);
    return check ? { ...v, claim: check.claim, rationale: check.rationale, materiality: check.materiality,
      evidenceBlockIds: check.evidenceBlockIds, confidence: check.confidence, suggestedAction: check.suggestedAction,
      missingSection: check._missingSection, severity: check.severity, severityReason: null,
      verdict: 'issue', source: 'deterministic' } : { ...v, source: 'diagnose' };
  });
  const counts = { ok: 0, issue: 0, not_applicable: 0 };
  for (const v of verdicts) counts[v.verdict] += 1;
  Object.assign(stats, { deterministicFindings: checks.length, candidateFindings: diagnosis.findings.length,
    findings: findings.length, droppedFindings: diagnosis.findings.length - findings.length, elapsedMs: Date.now() - started });
  return { findings, rubricSummary: { verdicts, counts, coverage }, stats };
}
module.exports = { runReview, generateSuggestion, PROMPT_VERSION };
