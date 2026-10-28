jest.mock('../../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../../services/ai/client');
const { respond, assertStrictSchema } = require('../helpers');
const { loadFixtureRefs } = require('../../../services/references/fixtureRefs');
const { createEmptyState } = require('../../../services/syllabusState/empty');
const { SLOTS } = require('../../../services/syllabusState/slots');
const { setPath } = require('../../../services/syllabusState/paths');
const { candidates, templateQuestion } = require('../../../services/ai/interviewPlan');
const { nextQuestion } = require('../../../services/ai/prompts/interviewer');

const refs = loadFixtureRefs('MBA28');
const empty = () => createEmptyState({ programCode: 'MBA28', refs, course: { title: 'Negotiations' } });
const schemaOf = (n = 0) => createResponse.mock.calls[n][0].text.format;
const typeOf = (key) => SLOTS.find((s) => s.key === key).type;

beforeEach(() => {
  createResponse.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('пре-фільтр слотів', () => {
  test('ніколи A/B/E, locked/library, політики; порядок = потік розмови', () => {
    const keys = candidates({ state: empty(), refs }).map((s) => s.key);
    expect(keys).toEqual([
      'course.description', 'course.objectives', 'course.outcomes', 'course.capstone',
      'schedule.sessions', 'schedule.individual_work', 'assessment.criteria', 'materials.required',
    ]);
    for (const key of keys) {
      expect(['C', 'D']).toContain(typeOf(key));
      expect(SLOTS.find((s) => s.key === key).editability).toBe('free');
    }
    expect(keys.some((k) => k.startsWith('policy.') || k.startsWith('glance.') || k.startsWith('instructor.'))).toBe(false);
  });

  test('пропущений слот (за ключем слота або розділу) і заповнений слот не питаються', () => {
    let state = setPath(empty(), 'summary.shortDescription.text', 'You will learn to negotiate under pressure with real counterparts.');
    const keys = (skipped) => candidates({ state, refs, skipped }).map((s) => s.key);
    expect(keys([])).not.toContain('course.description');
    expect(keys(['schedule.sessions'])).not.toContain('schedule.sessions');
    expect(keys(['schedule'])).not.toContain('schedule.individual_work');
    expect(keys(['materials'])).not.toContain('materials.required');
    state = setPath(state, 'materials.required[]', [{ id: 'm1', citation: 'Fisher, Getting to Yes', url: null, verified: false, source: 'instructor_directed', evidenceBlockIds: [] }]);
    expect(keys([])).not.toContain('materials.required');
  });

  test('preferredSection звужує вибір до розділу, а якщо в ньому нічого питати — лишається потік', () => {
    expect(candidates({ state: empty(), refs, preferredSection: 'assessment' }).map((s) => s.key)).toEqual(['assessment.criteria']);
    expect(candidates({ state: empty(), refs, preferredSection: 'policies' }).length).toBe(8);
    expect(candidates({ state: empty(), refs, preferredSection: 'assessment', skipped: ['assessment'] })[0].key).toBe('course.description');
  });
});

describe('nextQuestion', () => {
  test('strict json_schema; slotKey — enum дозволених C/D-слотів; питання і why повертаються як є', async () => {
    createResponse.mockResolvedValue(respond({ slotKey: 'course.description', question: 'What is this course about?', why: 'It lets me draft the summary.' }));
    const q = await nextQuestion({ state: empty(), refs, transcript: ['Assistant: Hi!'], skipped: ['schedule'] });
    expect(q).toEqual({ slotKey: 'course.description', question: 'What is this course about?', why: 'It lets me draft the summary.' });
    const { schema, strict, type } = schemaOf();
    expect([type, strict]).toEqual(['json_schema', true]);
    assertStrictSchema(schema);
    expect(schema.properties.slotKey.enum).toEqual([
      'course.description', 'course.objectives', 'course.outcomes', 'course.capstone', 'assessment.criteria', 'materials.required',
    ]);
    expect(schema.properties.slotKey.enum.every((k) => ['C', 'D'].includes(typeOf(k)))).toBe(true);
  });

  test('усе заповнене або пропущене → null без виклику моделі', async () => {
    const skipped = ['course.description', 'course.objectives', 'course.outcomes', 'course.capstone', 'schedule', 'assessment', 'materials'];
    expect(await nextQuestion({ state: empty(), refs, skipped })).toBeNull();
    expect(createResponse).not.toHaveBeenCalled();
  });

  test('збій LLM → детермінований наступний слот із TemplateSection.question', async () => {
    createResponse.mockRejectedValue(Object.assign(new Error('boom'), { status: 400 }));
    const q = await nextQuestion({ state: empty(), refs, skipped: ['course.description', 'course.objectives', 'course.outcomes', 'course.capstone'] });
    const section = refs.template.find((t) => t.key === 'schedule');
    expect(q).toEqual({ slotKey: 'schedule.sessions', question: section.question, why: expect.stringContaining(section.title) });
    expect(q).toEqual(templateQuestion(SLOTS.find((s) => s.key === 'schedule.sessions'), refs));
  });

  test('два питання в одному повідомленні або слот поза списком → повтор, а потім запасне питання', async () => {
    createResponse
      .mockResolvedValueOnce(respond({ slotKey: 'course.description', question: 'What is it about? And who is it for?', why: 'Needed.' }))
      .mockResolvedValueOnce(respond({ slotKey: 'course.description', question: 'What is it about?', why: 'Needed.' }));
    expect((await nextQuestion({ state: empty(), refs })).question).toBe('What is it about?');
    expect(createResponse).toHaveBeenCalledTimes(2);

    createResponse.mockReset();
    createResponse.mockResolvedValue(respond({ slotKey: 'policy.late', question: 'Late work?', why: 'x' }));
    const q = await nextQuestion({ state: empty(), refs });
    expect(q.slotKey).toBe('course.description');
    expect(q.question).toBe(refs.template.find((t) => t.key === 'short_description').question);
  });
});
