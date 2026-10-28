jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const { reviewState, reviewableTargets } = require('../../services/ai/prompts/reviewer');
const { buildDraftSuggestion } = require('../../services/chat/draftSuggestions');
const { toState } = require('../../services/ai/parse/toState');
const { slots, refs, reply } = require('./fixtures');

beforeEach(() => createResponse.mockReset());
const stateOf = () => toState({ slots: slots(), refs: refs(), programCode: 'MBA28' });

test('ревізор бачить лише вільні формулювання, strict enum не допускає політики', async () => {
  const state = stateOf();
  state.policies[0].text = 'PRIVATE POLICY SENTINEL';
  const targets = reviewableTargets(state);
  expect(targets).toHaveLength(8);
  expect(targets.some((t) => /polic/.test(t.path))).toBe(false);
  const target = targets.find((t) => t.path.includes('objectives'));
  createResponse.mockResolvedValue(reply({ suggestions: [{ ref: target.ref, issue: 'The objective is vague.', severity: 'medium', after: 'Apply negotiation frameworks to prepare a negotiation.', proposedValues: [] }] }));
  const cards = await reviewState({ state, refs: refs(), checks: [], blocks: [] });
  expect(cards[0]).toMatchObject({ origin: 'reviewer', severity: 'medium', target: { path: target.path }, text: 'Apply negotiation frameworks to prepare a negotiation.' });
  const request = createResponse.mock.calls[0][0];
  expect(request.text.format).toMatchObject({ strict: true, type: 'json_schema' });
  expect(request.input[0].content).toContain('Never add unnoticed');
  expect(request.input[1].content).not.toContain('PRIVATE POLICY SENTINEL');
  expect(request.input[1].content).toContain('<untrusted_document_text>');
  expect(request.text.format.schema.properties.suggestions.items.properties.ref.enum).toEqual(targets.map((t) => t.ref));
  const card = buildDraftSuggestion(cards[0], { syllabusId: 's1', state, refs: refs() });
  expect(card.draft.value).toBe(cards[0].text);
  expect(card.draft.basisHash).toBeTruthy();
});

test('нові факти передаються через proposedValues і лишаються непідтвердженими', async () => {
  const state = stateOf();
  createResponse.mockResolvedValue(reply({ suggestions: [{ ref: 'r1', issue: 'Clarify the method.', severity: 'info', after: 'Use 12 negotiation exercises.', proposedValues: [{ label: 'Number of exercises', value: '12' }] }] }));
  const [input] = await reviewState({ state, refs: refs(), checks: [] });
  const card = buildDraftSuggestion(input, { syllabusId: 's1', state, refs: refs(), known: [] });
  expect(card.draft.proposedValues).toEqual(expect.arrayContaining([expect.objectContaining({ value: '12', confirmed: false })]));
});

test('спроба націлитись на політики відхиляється схемою', async () => {
  createResponse.mockResolvedValue(reply({ suggestions: [{ ref: 'policies{policy.late}', issue: 'Rewrite.', severity: 'info', after: 'New policy', proposedValues: [] }] }));
  await expect(reviewState({ state: stateOf(), refs: refs() })).rejects.toThrow(/invalid enum/);
});
