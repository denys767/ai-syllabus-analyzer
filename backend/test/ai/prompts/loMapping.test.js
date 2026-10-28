jest.mock('../../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../../services/ai/client');
const { respond, assertStrictSchema } = require('../helpers');
const { loadFixtureRefs } = require('../../../services/references/fixtureRefs');
const { riskManagementState } = require('../../fixtures/state/riskManagement');
const { normalizePloCode } = require('../../../services/references');
const { suggestPlo } = require('../../../services/ai/prompts/loMapping');

const refs = loadFixtureRefs('MBA28');
const state = riskManagementState();
const CODES = refs.outcomes.map((o) => o.code);
const plo = (code, coverage = 'full') => ({ code, coverage, reason: `Because ${code}.` });
const mapping = (outcomeId, ...codes) => ({ outcomeId, plo: codes.map((c) => plo(c)) });

beforeEach(() => createResponse.mockReset());

test('strict-схема: коди ПРН — enum з refs своєї програми, id CLO — enum зі стану', async () => {
  createResponse.mockResolvedValue(respond({ mappings: [mapping('clo1', CODES[0], CODES[1])] }));
  await suggestPlo({ state, refs, outcomeIds: ['clo1'] });
  const { format } = createResponse.mock.calls[0][0].text;
  expect(format).toMatchObject({ type: 'json_schema', strict: true });
  assertStrictSchema(format.schema);
  const item = format.schema.properties.mappings.items.properties;
  expect(item.outcomeId.enum).toEqual(['clo1']);
  expect(item.plo.items.properties.code.enum).toEqual(CODES.map(normalizePloCode));
  expect(createResponse.mock.calls[0][0].input[0].content).toContain(`${CODES[0]}: ${refs.outcomes[0].text}`);
});

test('результат: вхід createDraftSuggestions — шлях outcomes[<id>].plo, confirmed:false, нормалізовані коди', async () => {
  createResponse.mockResolvedValue(respond({ mappings: [
    { outcomeId: 'clo1', plo: [plo(CODES[2]), plo(CODES[0], 'partial')] },
    mapping('clo2', CODES[1], CODES[3], CODES[4]),
  ] }));
  const out = await suggestPlo({ state, refs, outcomeIds: ['clo1', 'clo2'] });
  expect(out).toHaveLength(2);
  expect(out[0]).toMatchObject({ kind: 'edit', target: { path: 'outcomes[clo1].plo', entityId: 'clo1' }, title: 'Map LO1 to programme outcomes' });
  expect(out[0].value).toEqual([{ code: CODES[2], coverage: 'full', confirmed: false }, { code: CODES[0], coverage: 'partial', confirmed: false }]);
  expect(out[0].description).toContain(`${CODES[2]}: Because ${CODES[2]}.`);
  expect(out[1].value).toHaveLength(3);
  out.forEach((o) => o.value.forEach((v) => expect(CODES).toContain(v.code)));
});

test('без outcomeIds — усі CLO з текстом', async () => {
  const ids = state.outcomes.map((o) => o.id);
  createResponse.mockResolvedValue(respond({ mappings: ids.map((id) => mapping(id, CODES[0], CODES[1])) }));
  expect(await suggestPlo({ state, refs })).toHaveLength(ids.length);
});

test('код поза переліком програми відхиляється strict-валідацією; 1 код або дублікати — коригувальний повтор', async () => {
  createResponse.mockResolvedValue(respond({ mappings: [mapping('clo1', 'ПРН99', CODES[0])] }));
  await expect(suggestPlo({ state, refs, outcomeIds: ['clo1'] })).rejects.toThrow(/invalid enum/);

  createResponse.mockReset();
  createResponse
    .mockResolvedValueOnce(respond({ mappings: [mapping('clo1', CODES[0])] }))
    .mockResolvedValueOnce(respond({ mappings: [mapping('clo1', CODES[0], CODES[1])] }));
  const out = await suggestPlo({ state, refs, outcomeIds: ['clo1'] });
  expect(out[0].value.map((v) => v.code)).toEqual([CODES[0], CODES[1]]);
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('2 to 3 distinct PLO codes required');

  // дублікати коду не рахуються за різні; друга погана відповідь — помилка
  createResponse.mockReset();
  createResponse.mockResolvedValue(respond({ mappings: [mapping('clo1', CODES[0], CODES[0])] }));
  await expect(suggestPlo({ state, refs, outcomeIds: ['clo1'] })).rejects.toThrow(/distinct PLO codes/);
});

test('немає CLO або ПРН програми → [] без виклику моделі', async () => {
  expect(await suggestPlo({ state: { ...state, outcomes: [] }, refs })).toEqual([]);
  expect(await suggestPlo({ state, refs: { ...refs, outcomes: [] } })).toEqual([]);
  expect(await suggestPlo({ state, refs, outcomeIds: ['nope'] })).toEqual([]);
  expect(createResponse).not.toHaveBeenCalled();
});
