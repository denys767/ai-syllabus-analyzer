jest.mock('../../services/ai/client', () => ({ createResponse: require('../../eval/mock').mockCreateResponse, llmModel: 'gpt-mock' }));
const fs = require('fs');
const os = require('os');
const path = require('path');
const { measureDocument, aggregate, matchedCount } = require('../../eval/metrics');
const { main, validateAnnotation, parseArgs } = require('../../eval/run');
const { finding, blocks } = require('./fixtures');
const annotationFixture = require('../../eval/golden/synthetic.annotation.json');
const documentFixture = require('../../eval/docs/synthetic.blocks.json');

test('metrics match one-to-one and count duplicates, false positives and invalid evidence', () => {
  const good = finding(); const invalid = finding('LO-1', { evidenceBlockIds: ['b9999'] });
  const annotation = { document: 'test', criteria: [{ criterionId: 'LO-1', verdict: 'issue', issues: [{ evidenceBlockIds: ['b0002'], missingSection: false }] }] };
  const metric = measureDocument([good, good, invalid], annotation, blocks);
  expect(metric.byCriterion['LO-1']).toEqual({ tp: 1, fp: 2, fn: 0 });
  const total = aggregate([metric]); expect(total.duplicateRate).toBeCloseTo(1 / 3); expect(total.evidenceValidityRate).toBeCloseTo(2 / 3);
  expect(total.byCriterion['LO-1']).toMatchObject({ precision: 1 / 3, recall: 1 });
});
test('maximum matching handles overlapping expected evidence', () => {
  expect(matchedCount([{ evidenceBlockIds: ['b1', 'b2'] }, { evidenceBlockIds: ['b1'] }], [{ evidenceBlockIds: ['b1'] }, { evidenceBlockIds: ['b2'] }])).toBe(2);
});
test('missing predictions count as false negatives and zero denominators are null', () => {
  const result = measureDocument([], { document: 'test', criteria: [{ criterionId: 'LO-1', verdict: 'issue', issues: [{ evidenceBlockIds: ['b0002'], missingSection: false }] }] }, blocks);
  expect(aggregate([result]).byCriterion['LO-1']).toMatchObject({ fn: 1, precision: null, recall: 0 }); expect(aggregate([result]).duplicateRate).toBeNull();
});
test('existing golden format validates and resolves explicit ids or literal evidence', () => {
  expect(validateAnnotation(annotationFixture, documentFixture.blocks).document).toBe('synthetic');
  const annotation = JSON.parse(JSON.stringify(annotationFixture));
  delete annotation.criteria.find((c) => c.criterionId === 'AS-1').evidenceBlockIds;
  expect(validateAnnotation(annotation, documentFixture.blocks).criteria.find((c) => c.criterionId === 'AS-1').issues[0].evidenceBlockIds).toEqual(['b0011', 'b0012']);
});
test('annotation and CLI validators reject incomplete and invalid input', () => {
  expect(() => parseArgs(['--docs'])).toThrow(/argument/);
  const incomplete = { ...annotationFixture, criteria: annotationFixture.criteria.slice(1) };
  expect(() => validateAnnotation(incomplete, documentFixture.blocks)).toThrow(/every rubric criterion/);
  const bad = JSON.parse(JSON.stringify(annotationFixture)); delete bad.criteria.find((c) => c.verdict === 'issue').severity;
  expect(() => validateAnnotation(bad, documentFixture.blocks)).toThrow(/severity/);
});
test('eval smoke runs without API credentials and writes detailed JSON', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kse-review-test-')); const output = path.join(dir, 'result.json');
  const table = jest.spyOn(console, 'table').mockImplementation(() => {});
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await main(['--mock', '--output', output]);
    const result = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(result.mock).toBe(true); expect(result.summary.findingsCount).toBe(1);
    expect(result.summary.byCriterion['AS-1']).toMatchObject({ precision: 1, recall: 1 }); expect(result.summary.evidenceValidityRate).toBe(1);
    expect(result.skipped[0].annotation).toBe('example.annotation.json');
  } finally { table.mockRestore(); log.mockRestore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('document-level annotations match a missing-section finding anchored to a real heading', () => {
  const annotation = { document: 'test', criteria: [{ criterionId: 'T-5', verdict: 'issue', issues: [{ evidenceBlockIds: ['document'], missingSection: true }] }] };
  expect(measureDocument([finding('T-5', { evidenceBlockIds: ['b0001'], missingSection: true })], annotation, blocks).byCriterion['T-5']).toEqual({ tp: 1, fp: 0, fn: 0 });
});
