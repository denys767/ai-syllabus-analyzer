const { scanFacts, mergeProposedValues, toTemplate, renderTemplate } = require('../services/ai/facts');
const { buildDraftSuggestion, hashValue } = require('../services/chat/draftSuggestions');
const { riskManagementState } = require('./fixtures/state/riskManagement');
const { loadFixtureRefs } = require('../services/references/fixtureRefs');

test('сканер знаходить числа, відсотки, дати й назви, яких не називав викладач', () => {
  const found = scanFacts('Work submitted within 48 hours loses 10%; read "Managing Risks" by May 9, 2026.', { known: ['allow a short grace period'] });
  expect(found.map((f) => f.value)).toEqual(['48 hours', '10%', '"Managing Risks"', 'May 9, 2026']);
});

test('факт, названий викладачем (навіть в іншій формі), не пропонується', () => {
  expect(scanFacts('A 48-hour grace period applies.', { known: ['give them a 48 hour grace'] })).toEqual([]);
  expect(scanFacts('Missing more than 40% of classes means retaking the course.', { known: ['more than 40% of classes'] })).toEqual([]);
  expect(scanFacts('Late work loses ten percent.', { known: [] }).map((f) => f.value)).toEqual(['ten percent']);
});

test('merge, шаблон і перерендер без LLM («Change the value»)', () => {
  const pv = mergeProposedValues([{ label: 'Grace period', value: '48 hours' }], scanFacts('within 48 hours, lose 10%'));
  expect(pv.map((v) => [v.label, v.value, v.confirmed])).toEqual([['Grace period', '48 hours', false], ['Percentage', '10%', false]]);
  const t = toTemplate('within 48 hours, lose 10%', pv);
  expect(t).toBe('within {{v1}}, lose {{v2}}');
  expect(renderTemplate(t, [{ id: 'v1', value: '72 hours' }, { id: 'v2', value: '5%' }])).toBe('within 72 hours, lose 5%');
});

test('buildDraftSuggestion: target, розділ, basisHash, порядок critical раніше', () => {
  const state = riskManagementState();
  const refs = loadFixtureRefs('MBA28');
  const ctx = { syllabusId: 'x', state, refs, known: [] };
  const late = buildDraftSuggestion({ origin: 'orchestrator', severity: 'medium', kind: 'edit', target: { path: 'policies{policy.late}' }, text: 'Up to 48 hours late loses 10%.' }, ctx);
  expect(late.section).toBe('policies');
  expect(late.draft.proposedValues).toHaveLength(2);
  expect(late.draft.basisHash).toBe(hashValue(state.policies.find((p) => p.key === 'policy.late')));
  const crit = buildDraftSuggestion({ origin: 'check', severity: 'critical', kind: 'question', target: { path: 'assessments[]' }, question: 'Add a component?' }, ctx);
  expect(crit.draft).toBeUndefined();
  expect(crit.order).toBeLessThan(late.order);
});
