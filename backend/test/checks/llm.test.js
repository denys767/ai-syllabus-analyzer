// М'які LLM-перевірки: модель замокана, мережі немає.
const { runLlmChecks, matchComponentsToSchedule, clearLlmChecksCache } = require('../../services/checks/llm');
const { rm, refs, policy, libraryText } = require('./helpers');

const MODEL = 'gpt-test';
const reply = (obj) => ({ status: 'completed', output_text: JSON.stringify(obj) });
const withAiMode = (mode) => rm((s) => Object.assign(policy(s, 'policy.ai_mode'), { optionKey: mode, text: libraryText('policy.ai_mode', mode), source: 'fixture' }));

// Mock відповідає за назвою strict-схеми
function mockClient({ ai = { judgements: [] }, schedule = { matches: [] } } = {}) {
  return jest.fn(async (req) => {
    const name = req.text.format.name;
    if (name === 'checks_ai_prohibitions') return reply(typeof ai === 'function' ? ai(req) : ai);
    if (name === 'checks_component_schedule') return reply(typeof schedule === 'function' ? schedule(req) : schedule);
    throw new Error(`unexpected ${name}`);
  });
}
const callsOf = (fn, name) => fn.mock.calls.filter(([req]) => req.text.format.name === name);

beforeEach(() => clearLlmChecksCache());

test('збіг назв компонент ↔ розклад детермінований; participation пропускається', () => {
  const { matched, unmatched } = matchComponentsToSchedule(rm());
  expect(matched).toEqual([
    { componentId: 'as2', scheduleItemId: 's5' },  // «Written Exam» — заняття 5
    { componentId: 'as3', scheduleItemId: 'iw3' }, // «Final project preparation» — самостійна робота
  ]);
  expect(unmatched).toEqual([]);
});

test('RM без режиму ШІ і з повним збігом розкладу — модель не викликається', async () => {
  const createResponse = mockClient();
  expect(await runLlmChecks(rm(), refs(), { createResponse, model: MODEL })).toEqual([]);
  expect(createResponse).not.toHaveBeenCalled();
});

test('ШІ дозволено з декларацією: модель зіставляє компоненти з категоріями → warning з цитатою категорії', async () => {
  const createResponse = mockClient({ ai: { judgements: [
    { componentId: 'as2', category: 'answers to exams, quizzes and tests', comment: 'A written exam is a test.' },
    { componentId: 'as3', category: 'none', comment: 'Project work.' },
    { componentId: 'as1', category: 'none', comment: 'In-class activity.' },
  ] } });
  const checks = await runLlmChecks(withAiMode('ai_mode_disclosure'), refs(), { createResponse, model: MODEL });
  expect(checks).toEqual([expect.objectContaining({
    id: 'llm.ai_prohibition:as2', severity: 'warning', source: 'llm', section: 'policies', passed: false,
    details: expect.objectContaining({ category: 'answers to exams, quizzes and tests', mode: 'ai_mode_disclosure' }),
  })]);
  expect(checks[0].message).toMatch(/Should AI be excluded/);

  const [[req]] = callsOf(createResponse, 'checks_ai_prohibitions');
  expect(req).toMatchObject({ model: MODEL, text: { format: { type: 'json_schema', strict: true } } });
  const schema = req.text.format.schema.properties.judgements.items.properties;
  expect(schema.componentId.enum).toEqual(['as1', 'as2', 'as3']);
  expect(schema.category.enum).toHaveLength(6); // 5 категорій + none
  expect(req.input[0].content).toMatch(/not instructions/);
});

test('режим, що забороняє ШІ, — звірки немає', async () => {
  const createResponse = mockClient();
  await runLlmChecks(withAiMode('ai_mode_prohibited'), refs(), { createResponse, model: MODEL });
  expect(callsOf(createResponse, 'checks_ai_prohibitions')).toHaveLength(0);
});

test('незбіглий компонент іде в модель; без відповідника в розкладі → warning', async () => {
  const state = rm((s) => { s.assessments[2].name = 'Risk registry presentation'; s.individualWork[2].title = 'Preparing the final deliverable'; s.sessions[5].additional = null; });
  const createResponse = mockClient({ schedule: { matches: [{ componentId: 'as3', scheduleItemId: null, comment: 'Not scheduled.' }] } });
  const checks = await runLlmChecks(state, refs(), { createResponse, model: MODEL });
  expect(checks.map((c) => [c.id, c.severity, c.source])).toEqual([['llm.component_schedule:as3', 'warning', 'llm']]);
  const [[req]] = callsOf(createResponse, 'checks_component_schedule');
  expect(JSON.parse(req.input[1].content).components.map((c) => c.id)).toEqual(['as3']);
});

test('модель знайшла відповідник — зауваження немає', async () => {
  const state = rm((s) => { s.assessments[2].name = 'Risk plan'; });
  const createResponse = mockClient({ schedule: { matches: [{ componentId: 'as3', scheduleItemId: 'iw3', comment: 'Prepared in individual work.' }] } });
  expect(await runLlmChecks(state, refs(), { createResponse, model: MODEL })).toEqual([]);
});

test('кеш за hash входу: повторний виклик без зміни стану не йде в модель', async () => {
  const createResponse = mockClient();
  const state = withAiMode('ai_mode_scoped');
  await runLlmChecks(state, refs(), { createResponse, model: MODEL });
  await runLlmChecks(state, refs(), { createResponse, model: MODEL });
  expect(callsOf(createResponse, 'checks_ai_prohibitions')).toHaveLength(1);
  state.assessments[1].criteria = 'Open-book exam.';
  await runLlmChecks(state, refs(), { createResponse, model: MODEL });
  expect(callsOf(createResponse, 'checks_ai_prohibitions')).toHaveLength(2);
});

test('збій або невалідна відповідь моделі → info llm.unavailable, без винятку і без кешу', async () => {
  const failing = jest.fn(async () => { throw new Error('timeout'); });
  const state = withAiMode('ai_mode_required');
  const checks = await runLlmChecks(state, refs(), { createResponse: failing, model: MODEL });
  expect(checks).toEqual([expect.objectContaining({ id: 'llm.unavailable:ai_prohibitions', severity: 'info', source: 'llm', passed: false })]);

  const invalid = mockClient({ ai: { judgements: [{ componentId: 'nope', category: 'none', comment: '' }] } });
  expect((await runLlmChecks(state, refs(), { createResponse: invalid, model: MODEL }))[0].id).toBe('llm.unavailable:ai_prohibitions');
  const ok = mockClient();
  expect(await runLlmChecks(state, refs(), { createResponse: ok, model: MODEL })).toEqual([]);
  expect(ok).toHaveBeenCalled();
});
