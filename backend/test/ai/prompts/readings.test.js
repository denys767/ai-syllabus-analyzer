jest.mock('../../../services/ai/review/caseSources', () => ({
  ...jest.requireActual('../../../services/ai/review/caseSources'),
  findCaseSources: jest.fn(),
}));
const caseSources = require('../../../services/ai/review/caseSources');
const { riskManagementState } = require('../../fixtures/state/riskManagement');
const { buildDraftSuggestion } = require('../../../services/chat/draftSuggestions');
const { loadFixtureRefs } = require('../../../services/references/fixtureRefs');
const { suggestReadings } = require('../../../services/ai/prompts/readings');

const refs = loadFixtureRefs('MBA28');
const state = riskManagementState();
const found = [
  { title: 'Pepsico Ukraine: Managing Risk in War', publisher: 'Ivey', year: 2023, url: 'https://example.org/a', verified: true, relevance: 'Fits risk topic.' },
  { title: 'Invented Case', publisher: null, year: null, url: null, verified: false, relevance: 'x' },
  { title: 'Case With Dead Link', publisher: 'HBP', year: 2020, url: 'https://dead.example.org', verified: false, relevance: 'y' },
];

beforeEach(() => { caseSources.findCaseSources.mockReset(); delete process.env.CASE_WEB_SEARCH; });
afterAll(() => { delete process.env.CASE_WEB_SEARCH; });

test('без CASE_WEB_SEARCH=1 → [] і пошук не запускається', async () => {
  expect(await suggestReadings({ state, refs, query: 'risk cases' })).toEqual([]);
  expect(caseSources.findCaseSources).not.toHaveBeenCalled();
});

test('порожній запит → []', async () => {
  process.env.CASE_WEB_SEARCH = '1';
  expect(await suggestReadings({ state, refs, query: '  ' })).toEqual([]);
});

test('пропонується лише знайдене з перевіреним URL; назви — у proposedValues', async () => {
  process.env.CASE_WEB_SEARCH = '1';
  caseSources.findCaseSources.mockResolvedValue(found);
  const [input, ...rest] = await suggestReadings({ state, refs, query: 'risk cases in Ukraine' });
  expect(rest).toEqual([]);
  expect(caseSources.findCaseSources.mock.calls[0][0]).toMatchObject({ finding: { claim: 'risk cases in Ukraine' } });
  expect(input).toMatchObject({ kind: 'edit', target: { path: 'materials.recommended[]' } });
  expect(input.proposedValues).toEqual([{ label: 'Reading title', value: 'Pepsico Ukraine: Managing Risk in War' }]);
  expect(input.sources).toEqual([expect.objectContaining({ url: 'https://example.org/a', verified: true })]);
  // наявні рідінги зберігаються, новий отримує вільний id
  const existing = state.materials.recommended;
  expect(input.value.slice(0, existing.length)).toEqual(existing);
  expect(input.value[existing.length]).toMatchObject({ url: 'https://example.org/a', verified: true, citation: 'Pepsico Ukraine: Managing Risk in War — Ivey, 2023' });
  expect(existing.map((m) => m.id)).not.toContain(input.value[existing.length].id);
  expect(input.description).not.toContain('Invented Case');
  expect(JSON.stringify(input)).not.toContain('Invented Case');

  const card = buildDraftSuggestion({ origin: 'orchestrator', ...input }, { syllabusId: 's1', state, refs, known: [] });
  expect(card.draft.proposedValues).toEqual([expect.objectContaining({ value: 'Pepsico Ukraine: Managing Risk in War', confirmed: false })]);
  expect(card.sources).toHaveLength(1);
});

test('жодного перевіреного джерела → []', async () => {
  process.env.CASE_WEB_SEARCH = '1';
  caseSources.findCaseSources.mockResolvedValue(found.slice(1));
  expect(await suggestReadings({ state, refs, query: 'risk' })).toEqual([]);
});
