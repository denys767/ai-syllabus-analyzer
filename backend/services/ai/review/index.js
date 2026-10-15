const { runChecks } = require('./checks');
const { extractStructure, computeCoverage, emptyStructure } = require('./structure');
const { diagnose } = require('./diagnose');
const { verify, fallbackFindings } = require('./verify');
const { generateSuggestion } = require('./rewrite');
const { PROMPT_VERSION } = require('./common');

async function runReview({ blocks, meta = {}, options = {} } = {}) {
  const kinds = new Set(['heading', 'paragraph', 'list-item', 'table-cell', 'slide-title', 'slide-text', 'notes']);
  if (!Array.isArray(blocks) || blocks.some((b) => !b || typeof b.id !== 'string' || !/^b\d{4,}$/.test(b.id) || typeof b.text !== 'string'
      || !kinds.has(b.kind) || (b.level !== undefined && !Number.isFinite(b.level))
      || (b.sectionId !== undefined && typeof b.sectionId !== 'string') || (b.readOnly !== undefined && typeof b.readOnly !== 'boolean'))
    || new Set(blocks.map((b) => b.id)).size !== blocks.length) throw new Error('blocks must have unique block ids, valid kinds, string text and valid optional fields');
  // Некоректні необов’язкові налаштування повертаємо до безпечних дефолтів.
  const supplied = options || {};
  options = {
    concurrency: Number.isInteger(supplied.concurrency) && supplied.concurrency > 0 ? supplied.concurrency : 2,
    minConfidence: Number.isFinite(supplied.minConfidence) && supplied.minConfidence >= 0 && supplied.minConfidence <= 1 ? supplied.minConfidence : 0.7,
    maxFindings: Number.isInteger(supplied.maxFindings) && supplied.maxFindings >= 0 ? supplied.maxFindings : 10,
    maxPerGroup: Number.isInteger(supplied.maxPerGroup) && supplied.maxPerGroup >= 0 ? supplied.maxPerGroup : 3,
  };
  const stage = async (name) => {
    try { await supplied.onStage?.(name); } catch { /* Прогрес не впливає на аналіз. */ }
  };
  meta = meta || {};
  const started = Date.now();
  const stats = { promptVersion: PROMPT_VERSION, llmCalls: 0, blocks: blocks.length, degraded: [], failedGroups: [] };
  const checks = runChecks(blocks);
  let structure = emptyStructure();
  let coverage = computeCoverage(structure);
  await stage('structure');
  try {
    ({ structure, coverage } = await extractStructure({ blocks, meta, stats }));
  } catch {
    stats.degraded.push('structure');
  }
  await stage('diagnose');
  const diagnosis = await diagnose({ blocks, meta, structure, coverage, checks, options, stats });
  let findings;
  await stage('verify');
  try {
    findings = await verify({ findings: diagnosis.findings, blocks, meta, options, stats });
  } catch {
    stats.degraded.push('verify');
    findings = fallbackFindings(diagnosis.findings, checks, blocks, options);
  }
  const verdicts = diagnosis.verdicts.map((v) => {
    if (v.verdict === 'not_evaluated') return { ...v, source: 'diagnose' };
    const check = checks.find((f) => f.criterionId === v.criterionId);
    return check ? { ...v, claim: check.claim, rationale: check.rationale, materiality: check.materiality,
      evidenceBlockIds: check.evidenceBlockIds, confidence: check.confidence, suggestedAction: check.suggestedAction,
      missingSection: check._missingSection, severity: check.severity, severityReason: null,
      verdict: 'issue', source: 'deterministic' } : { ...v, source: 'diagnose' };
  });
  const counts = { ok: 0, issue: 0, not_applicable: 0, not_evaluated: 0 };
  for (const v of verdicts) counts[v.verdict] += 1;
  Object.assign(stats, { deterministicFindings: checks.length, candidateFindings: diagnosis.findings.length,
    findings: findings.length, droppedFindings: diagnosis.findings.length - findings.length, elapsedMs: Date.now() - started });
  return { findings, rubricSummary: { verdicts, counts, coverage }, stats };
}
module.exports = { runReview, generateSuggestion, PROMPT_VERSION };
