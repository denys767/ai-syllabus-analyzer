jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const { criteria, GROUPS } = require('../../services/ai/rubric');
const { diagnose } = require('../../services/ai/review/diagnose');
const { extractStructure, computeCoverage } = require('../../services/ai/review/structure');
const { filterFindings, verify, calibratedSeverity } = require('../../services/ai/review/verify');
const { runReview } = require('../../services/ai/review');
const { validEvidence, mapLimit, renderDocument } = require('../../services/ai/review/common');
const { blocks, emptyStructure, verdictsFor, issue, finding, approval, response } = require('./fixtures');

beforeEach(() => createResponse.mockReset());
afterEach(() => criteria.forEach((c) => { delete c.disabled; }));
const diagnoseInput = () => ({ blocks, meta: {}, structure: emptyStructure(), coverage: {}, checks: [] });

test('diagnose parses every group, merges deterministic findings and retains ok verdicts', async () => {
  createResponse.mockImplementation(async (p) => response(verdictsFor(p.text.format.name.replace('review_diagnose_', ''), { 'LO-1': issue() })));
  const deterministic = finding();
  const result = await diagnose({ ...diagnoseInput(), checks: [deterministic] });
  expect(result.findings).toEqual([deterministic]);
  expect(result.verdicts).toHaveLength(34);
  expect(createResponse).toHaveBeenCalledTimes(5);
  for (const [p] of createResponse.mock.calls) {
    expect(p.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(p.input[0].content).toContain('CRITERIA:');
    expect(p.input[0].content).not.toContain('[b0002]');
    expect(p.input[1].content).toContain('[b0002]');
  }
});
test('zero issues is valid; disabled criteria are neither prompted nor expected', async () => {
  criteria.find((c) => c.id === 'LO-1').disabled = true;
  createResponse.mockImplementation(async (p) => response(verdictsFor(p.text.format.name.replace('review_diagnose_', ''))));
  const result = await diagnose(diagnoseInput());
  expect(result.findings).toEqual([]);
  expect(result.verdicts).toHaveLength(33);
  const prompt = createResponse.mock.calls.find(([p]) => p.text.format.name === 'review_diagnose_outcomes')[0].input[0].content;
  expect(prompt).not.toContain('[LO-1]');
});
test('persistent missing, duplicate or unknown criterion verdicts skip only the failed group', async () => {
  for (const bad of [[], [verdictsFor('template').verdicts[0], verdictsFor('template').verdicts[0]], [{ ...verdictsFor('template').verdicts[0], criterionId: 'X' }]]) {
    createResponse.mockImplementation(async (p) => response(p.text.format.name === 'review_diagnose_template' ? { verdicts: bad } : verdictsFor(p.text.format.name.replace('review_diagnose_', ''))));
    const result = await diagnose(diagnoseInput());
    expect(result.failedGroups).toEqual(['template']);
    expect(result.verdicts.filter((v) => v.verdict === 'not_evaluated')).toHaveLength(9);
  }
});
test('coverage is computed in code from explicit MBA, outcome and direct assessment links', () => {
  const structure = { ...emptyStructure(), outcomes: [
    { id: 'o1', mba27: ['Learning outcome 3'] }, { id: 'o2', mba27: ['Learning outcome 3'] }, { id: 'o3', mba27: [] },
  ], assessments: [{ id: 'a1', linkedOutcomes: ['o1'], direct: true }, { id: 'a2', linkedOutcomes: ['o2'], direct: false }] };
  const coverage = computeCoverage(structure);
  expect(coverage.mba27).toHaveLength(9);
  expect(coverage.mba27[2]).toMatchObject({ outcomeIds: ['o1', 'o2'], assessmentIds: ['a1', 'a2'], directAssessmentIds: ['a1'] });
  expect(coverage.unassessedOutcomeIds).toEqual(['o3']);
  expect(coverage.indirectlyAssessedOutcomeIds).toEqual(['o2']);
});
test('structure rejects invented evidence and outcome links', async () => {
  for (const outcome of [
    { id: 'o1', text: 'Evaluate', mba27: [], blockIds: ['b9999'] },
    { id: 'o1', text: 'Evaluate', mba27: ['Invented MBA outcome'], blockIds: ['b0002'] },
  ]) {
    createResponse.mockResolvedValue(response({ ...emptyStructure(), outcomes: [outcome] }));
    await expect(extractStructure({ blocks })).rejects.toThrow(/invalid/);
  }
});
test('verifier rejects each failed boolean and low confidence', () => {
  for (const failure of [{ evidenceSupportsClaim: false }, { alreadyAddressed: true }, { generic: true }, { material: false }, { actionable: false }]) {
    const f = finding();
    expect(filterFindings([f], [approval(f, failure)], blocks)).toEqual([]);
  }
  const f = finding('LO-1', { confidence: 0.69 });
  expect(filterFindings([f], [approval(f)], blocks)).toEqual([]);
});
test('evidence validation allows document only for explicit missing-section criteria', () => {
  expect(validEvidence(finding('LO-1', { evidenceBlockIds: ['b9999'] }), blocks)).toBe(false);
  expect(validEvidence(finding('LO-1', { evidenceBlockIds: [] }), blocks)).toBe(false);
  expect(validEvidence(finding('LO-1', { evidenceBlockIds: ['document'], missingSection: true }), blocks)).toBe(false);
  expect(validEvidence(finding('T-5', { evidenceBlockIds: ['document'], missingSection: false }), blocks)).toBe(false);
  expect(validEvidence(finding('T-5', { evidenceBlockIds: ['document'], missingSection: true }), blocks)).toBe(true);
  const invalid = finding('T-5', { evidenceBlockIds: ['document', 'b9999'], missingSection: true });
  expect(filterFindings([invalid], [approval(invalid)], blocks)).toEqual([]);
});
test('severity changes by at most one level and requires a reason', () => {
  expect(calibratedSeverity(finding('LO-1', { severity: 'critical', severityReason: 'Blocking alignment' }))).toBe('critical');
  expect(calibratedSeverity(finding('LO-1', { severity: 'critical', severityReason: '' }))).toBe('high');
  expect(calibratedSeverity(finding('LO-1', { severity: 'low', severityReason: 'Minor' }))).toBe('high');
  expect(calibratedSeverity(finding('LO-1', { severity: 'medium', severityReason: 'Only a small part' }))).toBe('medium');
});
test('dedup ignores evidence order; caps are enforced after score sorting', () => {
  const candidates = criteria.map((c) => finding(c.id, { evidenceBlockIds: ['b0002', 'b0004'] }));
  const duplicate = { ...candidates[0], evidenceBlockIds: ['b0004', 'b0002'] };
  const result = filterFindings([...candidates, duplicate], candidates.map((f) => approval(f)), blocks);
  expect(result).toHaveLength(10);
  for (const group of GROUPS) expect(result.filter((f) => f.group === group).length).toBeLessThanOrEqual(3);
  expect(new Set(result.map((f) => f.criterionId)).size).toBe(10);
  expect(result.every((f) => !Object.keys(f).some((k) => k.startsWith('_')))).toBe(true);
  const scores = result.map((f) => ({ critical: 4, high: 3, medium: 2, low: 1 }[f.severity] * f.confidence));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(filterFindings(candidates, candidates.map((f) => approval(f)), blocks, { maxFindings: 99, maxPerGroup: 99 })).toHaveLength(10);
});
test('verifier uses low reasoning and fails closed on missing or duplicate judgments', async () => {
  const f = finding();
  createResponse.mockResolvedValue(response({ results: [] }));
  expect(await verify({ findings: [f], blocks })).toEqual([]);
  expect(createResponse.mock.calls[0][0].reasoning.effort).toBe('low');
  createResponse.mockResolvedValue(response({ results: [approval(f), approval(f)] }));
  expect(await verify({ findings: [f], blocks })).toEqual([]);
});
test('bounded parallel helper preserves ordering and concurrency', async () => {
  let active = 0; let peak = 0;
  const results = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return n * 2;
  });
  expect(results).toEqual([2, 4, 6, 8, 10]); expect(peak).toBe(2);
});
test('document rendering uses ids, heading levels and readonly markers', () => {
  expect(renderDocument([{ ...blocks[0], readOnly: true }])).toContain('[b0001] ## Learning Outcomes [READ ONLY]');
});
test('runReview smoke provides public API, rubric summary and call stats', async () => {
  createResponse.mockImplementation(async (p) => {
    const name = p.text.format.name;
    if (name === 'review_structure') return response(emptyStructure());
    if (name.startsWith('review_diagnose_')) return response(verdictsFor(name.replace('review_diagnose_', '')));
    const findings = JSON.parse(p.input[1].content.match(/^Findings: (.*)\n/)[1]);
    return response({ results: findings.map((f) => approval(f)) });
  });
  const result = await runReview({ blocks });
  expect(result.stats).toMatchObject({ llmCalls: 7, blocks: 4 });
  expect(result.rubricSummary.verdicts).toHaveLength(34);
  expect(result.rubricSummary.coverage.mba27).toHaveLength(9);
  expect(result.findings.length).toBeLessThanOrEqual(10);
  expect(Object.keys(result.findings[0]).sort()).toEqual(['id','criterionId','group','severity','confidence','materiality','claim','rationale','evidenceBlockIds','mba27','fixType','standardClauseId','suggestedAction','promptVersion'].sort());
});
test('input rejects duplicate ids and invalid block fields before calling LLM', async () => {
  await expect(runReview({ blocks: [blocks[0], blocks[0]] })).rejects.toThrow(/unique/);
  await expect(runReview({ blocks: [{ ...blocks[0], kind: 'unknown' }] })).rejects.toThrow(/valid kinds/);
  await expect(runReview({ blocks: [{ ...blocks[0], level: NaN }] })).rejects.toThrow(/optional fields/);
  expect(createResponse).not.toHaveBeenCalled();
});
test('valid structure extraction retains evidence and produces coverage', async () => {
  const structure = { ...emptyStructure(), outcomes: [{ id: 'o1', text: 'Evaluate strategy.', mba27: ['Learning outcome 4'], blockIds: ['b0002'] }],
    assessments: [{ id: 'a1', name: 'Final project', weight: 100, direct: true, linkedOutcomes: ['o1'], blockIds: ['b0004'] }] };
  createResponse.mockResolvedValue(response(structure));
  const result = await extractStructure({ blocks });
  expect(result.structure).toEqual(structure); expect(result.coverage.mba27[3].directAssessmentIds).toEqual(['a1']);
});
test('missing-section findings cite headings while ordinary claims cannot use document sentinel', () => {
  const f = finding('T-5', { missingSection: true, evidenceBlockIds: ['b0002'] });
  expect(validEvidence(f, blocks)).toBe(false);
  expect(validEvidence(finding('T-5', { missingSection: true, evidenceBlockIds: ['b0001'] }), blocks)).toBe(true);
});
test('empty final candidate list skips verifier call', async () => {
  const complete = require('../../eval/docs/synthetic.blocks.json').blocks.map((b) => b.id === 'b0012' ? { ...b, text: 'Final exam: 60%.' } : b);
  createResponse.mockImplementation(async (p) => response(p.text.format.name === 'review_structure' ? emptyStructure() : verdictsFor(p.text.format.name.replace('review_diagnose_', ''))));
  const result = await runReview({ blocks: complete }); expect(result.findings).toEqual([]); expect(result.stats.llmCalls).toBe(6);
});

 test('stage callbacks are awaited in order and failures do not interrupt analysis', async () => {
  const stages = [];
  createResponse.mockImplementation(async (p) => {
    const name = p.text.format.name;
    expect(stages).toContain(name === 'review_structure' ? 'structure' : name.startsWith('review_diagnose_') ? 'diagnose' : 'verify');
    if (name === 'review_structure') return response(emptyStructure());
    if (name.startsWith('review_diagnose_')) return response(verdictsFor(name.replace('review_diagnose_', '')));
    const findings = JSON.parse(p.input[1].content.match(/^Findings: (.*)\n/)[1]);
    return response({ results: findings.map((f) => approval(f)) });
  });
  await runReview({ blocks, options: { onStage: async (stage) => {
    await Promise.resolve(); stages.push(stage);
    if (stage === 'diagnose') throw new Error('progress unavailable');
  } } });
  expect(stages).toEqual(['structure', 'diagnose', 'verify']);
});
