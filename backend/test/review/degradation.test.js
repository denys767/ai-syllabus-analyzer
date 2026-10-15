jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const { criteria, GROUPS } = require('../../services/ai/rubric');
const { runReview } = require('../../services/ai/review');
const { diagnose } = require('../../services/ai/review/diagnose');
const { verify, fallbackFindings, filterFindings } = require('../../services/ai/review/verify');
const { computeCoverage } = require('../../services/ai/review/structure');
const { runChecks } = require('../../services/ai/review/checks');
const { blocks, emptyStructure, verdictsFor, issue, finding, approval, response } = require('./fixtures');

beforeEach(() => createResponse.mockReset());
afterEach(() => criteria.forEach((c) => { delete c.disabled; }));
const complete = require('../../eval/docs/synthetic.blocks.json').blocks.map((b) => b.id === 'b0012' ? { ...b, text: 'Final exam: 60%.' } : b);
function normalResponse(params, issues = {}) {
  const name = params.text.format.name;
  if (name === 'review_structure') return response(emptyStructure());
  if (name.startsWith('review_diagnose_')) return response(verdictsFor(name.replace('review_diagnose_', ''), issues));
  const findings = JSON.parse(params.input[1].content.match(/^Findings: (.*)\n/)[1]);
  return response({ results: findings.map((f) => approval(f)) });
}
const stageCalls = (name) => createResponse.mock.calls.filter(([p]) => p.text.format.name === name);

test.each([
  ['API error', () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); }, 1],
  ['incomplete response', () => ({ status: 'incomplete' }), 3],
  ['invalid JSON', () => ({ output_text: '{' }), 3],
  ['schema mismatch', () => response({}), 3],
  ['semantic mismatch', () => response({ ...emptyStructure(), outcomes: [{ id: 'o1', text: 'Evaluate', mba27: [], blockIds: ['b9999'] }] }), 2],
])('failed structure degrades after %s and still diagnoses the document', async (_, fail, attempts) => {
  createResponse.mockImplementation(async (p) => p.text.format.name === 'review_structure' ? fail() : normalResponse(p));
  const result = await runReview({ blocks });
  expect(result.stats.degraded).toEqual(['structure']);
  expect(result.stats.failedGroups).toEqual([]);
  expect(result.rubricSummary.coverage).toEqual(computeCoverage(emptyStructure()));
  expect(result.rubricSummary.verdicts).toHaveLength(34);
  expect(stageCalls('review_structure')).toHaveLength(attempts);
  const user = stageCalls('review_diagnose_outcomes')[0][0].input[1].content;
  expect(user).toContain(JSON.stringify({ structure: emptyStructure(), coverage: computeCoverage(emptyStructure()) }));
});

test('a failed group is explicitly not_evaluated without losing deterministic findings', async () => {
  createResponse.mockImplementation(async (p) => p.text.format.name === 'review_diagnose_template' ? { status: 'incomplete' } : normalResponse(p));
  const result = await runReview({ blocks });
  expect(result.stats.failedGroups).toEqual(['template']);
  expect(result.stats.degraded).toEqual([]);
  const skipped = result.rubricSummary.verdicts.filter((v) => v.criterionId.startsWith('T-'));
  expect(skipped).toHaveLength(9);
  expect(skipped.every((v) => v.verdict === 'not_evaluated' && v.source === 'diagnose')).toBe(true);
  expect(result.rubricSummary.counts.not_evaluated).toBe(9);
  expect(result.findings.some((f) => f.criterionId === 'T-3')).toBe(true);
  expect(stageCalls('review_diagnose_template')).toHaveLength(3);
});

test.each([
  ['missing criterion verdict', (verdicts) => verdicts.slice(1), 'missing criterion verdict: LO-1'],
  ['duplicate criterion', (verdicts) => [...verdicts, verdicts[0]], 'duplicate criterion LO-1'],
  ['unknown criterion', (verdicts) => [...verdicts, { ...verdicts[0], criterionId: 'X-1' }], 'unknown criterion X-1'],
])('diagnose corrects %s using precise feedback without skipping the group', async (_, corrupt, error) => {
  let attempts = 0;
  createResponse.mockImplementation(async (p) => {
    if (p.text.format.name === 'review_diagnose_outcomes' && attempts++ === 0) return response({ verdicts: corrupt(verdictsFor('outcomes').verdicts) });
    return normalResponse(p);
  });
  const result = await runReview({ blocks: complete });
  expect(result.stats.failedGroups).toEqual([]);
  const calls = stageCalls('review_diagnose_outcomes');
  expect(calls).toHaveLength(2);
  expect(calls[1][0].input[1].content).toContain(error);
});

test('persistent semantic group error retries once then skips all its criteria', async () => {
  createResponse.mockImplementation(async (p) => p.text.format.name === 'review_diagnose_outcomes' ? response({ verdicts: [] }) : normalResponse(p));
  const result = await runReview({ blocks: complete });
  expect(stageCalls('review_diagnose_outcomes')).toHaveLength(2);
  expect(result.stats.failedGroups).toEqual(['outcomes']);
  expect(result.rubricSummary.counts).toMatchObject({ not_evaluated: 7, ok: 27 });
});

test('all failed groups throw only after every enabled group has exhausted its retries', async () => {
  createResponse.mockImplementation(async (p) => p.text.format.name === 'review_structure' ? response(emptyStructure()) : { status: 'incomplete' });
  await expect(runReview({ blocks })).rejects.toThrow('All diagnose groups failed: template, outcomes, assessment, practice, policy');
  for (const g of GROUPS) expect(stageCalls(`review_diagnose_${g}`)).toHaveLength(3);
  expect(stageCalls('review_verify')).toHaveLength(0);
});

test('all enabled groups failing is fatal even when other groups are disabled', async () => {
  criteria.forEach((c) => { if (c.group !== 'policy') c.disabled = true; });
  createResponse.mockImplementation(async (p) => p.text.format.name === 'review_structure' ? response(emptyStructure()) : response({ verdicts: [] }));
  await expect(runReview({ blocks })).rejects.toThrow('All diagnose groups failed: policy');
  expect(stageCalls('review_diagnose_policy')).toHaveLength(2);
});

test('no enabled groups is a valid deterministic-only run', async () => {
  criteria.forEach((c) => { c.disabled = true; });
  createResponse.mockImplementation(async (p) => normalResponse(p));
  const result = await runReview({ blocks });
  expect(result.findings).toEqual([]); expect(result.stats.failedGroups).toEqual([]);
  expect(result.rubricSummary.counts.not_evaluated).toBe(0);
});

test('verifier corrects an unknown finding id on one semantic retry', async () => {
  const f = finding();
  createResponse.mockResolvedValueOnce(response({ results: [approval({ id: 'unknown-id' })] }))
    .mockResolvedValueOnce(response({ results: [approval(f)] }));
  expect(await verify({ findings: [f], blocks })).toHaveLength(1);
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('unknown findingId unknown-id');
  expect(createResponse.mock.calls[1][0].reasoning.effort).toBe('low');
});

test.each([
  ['incomplete', () => ({ status: 'incomplete' }), 3],
  ['schema-invalid', () => response({ results: null }), 3],
  ['unknown finding id', () => response({ results: [approval({ id: 'unknown-id' })] }), 2],
  ['permanent API error', () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); }, 1],
])('failed verifier uses conservative fallback after %s', async (_, fail, attempts) => {
  createResponse.mockImplementation(async (p) => p.text.format.name === 'review_verify' ? fail() : normalResponse(p, {
    'LO-1': issue({ confidence: 0.9 }), 'LO-2': issue({ confidence: 0.899 }),
    'LO-4': issue({ confidence: 0.99, evidenceBlockIds: ['b9999'] }),
  }));
  const result = await runReview({ blocks });
  expect(result.stats.degraded).toEqual(['verify']);
  expect(result.findings.some((f) => f.criterionId === 'LO-1')).toBe(true);
  expect(result.findings.some((f) => f.criterionId === 'LO-2' || f.criterionId === 'LO-4')).toBe(false);
  expect(result.findings.some((f) => f.criterionId === 'T-3')).toBe(true);
  expect(stageCalls('review_verify')).toHaveLength(attempts);
});

test('fallback applies the same severity, dedup, sorting and caps as normal verification', () => {
  const checks = runChecks(blocks);
  const candidates = criteria.map((c) => finding(c.id, { confidence: c.id === 'LO-2' ? 0.89 : 0.9,
    ...(c.id === 'LO-1' ? { severity: 'critical', severityReason: 'Впливає на головний результат курсу.' } : {}) }));
  const duplicate = { ...candidates.find((f) => f.criterionId === 'LO-1') };
  const all = [...checks, ...candidates, duplicate];
  const eligible = all.filter((f) => checks.some((c) => c.id === f.id) || f.confidence >= 0.9);
  const approvals = [...new Map(eligible.map((f) => [f.id, approval(f)])).values()];
  const fallback = fallbackFindings(all, checks, blocks);
  expect(fallback).toEqual(filterFindings(eligible, approvals, blocks));
  expect(fallback).toHaveLength(10);
  for (const group of GROUPS) expect(fallback.filter((f) => f.group === group).length).toBeLessThanOrEqual(3);
  expect(fallback.find((f) => f.criterionId === 'LO-1')).toMatchObject({ severity: 'critical', rationale: expect.stringContaining('Впливає на головний результат курсу.') });
  expect(new Set(fallback.map((f) => f.id)).size).toBe(10);
});

test('structure, group and verifier can fail together without losing the surviving analysis', async () => {
  createResponse.mockImplementation(async (p) => {
    if (['review_structure', 'review_diagnose_template', 'review_verify'].includes(p.text.format.name)) return { status: 'incomplete' };
    return normalResponse(p, { 'LO-1': issue() });
  });
  const result = await runReview({ blocks });
  expect(result.stats.degraded).toEqual(['structure', 'verify']); expect(result.stats.failedGroups).toEqual(['template']);
  expect(result.findings.some((f) => f.criterionId === 'LO-1')).toBe(true);
  expect(result.stats.llmCalls).toBe(13);
});

test('invalid optional settings fall back to defaults instead of aborting analysis', async () => {
  createResponse.mockImplementation(async (p) => normalResponse(p));
  const result = await runReview({ blocks: complete, options: { concurrency: 0, maxFindings: -1, minConfidence: 10 } });
  expect(result.stats).toMatchObject({ failedGroups: [], degraded: [], llmCalls: 6 });
});
