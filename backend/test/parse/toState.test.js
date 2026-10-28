// toState: детермінований перехід витягу в Syllabus.state; стан завжди валідний за schema.validateState.
const { toState, detectLanguage } = require('../../services/ai/parse/toState');
const { validateState } = require('../../services/syllabusState/schema');
const { policyDecided } = require('../../services/syllabusState/slots');
const { matchPolicies } = require('../../services/ai/parse/policyMatch');
const { runChecks } = require('../../services/checks');
const { refs, slots, classifications } = require('./fixtures');

const build = (over = {}, programCode = 'MBA28', s = slots()) => toState({ slots: { ...s, ...over }, programCode, refs: refs(programCode) });

test('стан валідний, source parsed, докази з витягу, E-поля пораховані', () => {
  const state = build();
  expect(validateState(state)).toEqual([]);
  expect(state).toMatchObject({ programCode: 'MBA28', track: 'upload', language: 'en', sections: {} });
  expect(state.header).toMatchObject({
    courseTitle: 'Negotiation and Influence', courseCode: null, deliveryFormat: 'online', source: 'parsed', evidenceBlockIds: ['b0003', 'b0025'],
    computed: { contactHours: 10, selfStudyHours: 8, assessmentTotal: 100, deliveryModes: ['online'], termFromSchedule: { start: '2026-03-07', end: '2026-03-14' } },
  });
  expect(state.header.declared).toBeUndefined();
  expect(state.summary.shortDescription).toMatchObject({ source: 'parsed', evidenceBlockIds: ['b0005'] });
  expect(state.summary.capstone.text).toMatch(/negotiate resources/);
  expect(state.summary.prerequisites).toMatchObject({ text: 'none', source: 'parsed' });
});

test('кожна сутність має source parsed і непорожні evidenceBlockIds; id призначаються за порядком', () => {
  const state = build();
  const entities = [...state.summary.objectives, ...state.outcomes, ...state.instructors, ...state.sessions, ...state.individualWork,
    ...state.assessments, ...state.materials.required, ...state.materials.recommended];
  expect(entities.length).toBe(1 + 2 + 1 + 3 + 2 + 3 + 1 + 1);
  for (const e of entities) {
    expect(e.source).toBe('parsed');
    expect(e.evidenceBlockIds.length).toBeGreaterThan(0);
  }
  expect(state.outcomes.map((o) => o.id)).toEqual(['clo1', 'clo2']);
  expect(state.assessments.map((a) => a.id)).toEqual(['as1', 'as2', 'as3']);
  expect(state.sessions.map((s) => [s.id, s.n])).toEqual([['s1', 1], ['s2', 2], ['s3', 3]]);
  expect(state.materials.required[0].id).toBe('m1');
  expect(state.materials.recommended[0]).toMatchObject({ id: 'm2', verified: false });
});

test('зв’язки CLO ↔ компонент переносяться в обидва боки; локальні id моделі переназначаються', () => {
  const s = slots();
  s.outcomes[0].id = 'outcome_A';
  s.outcomes[1].id = 'outcome_B';
  s.assessments[1].outcomeIds = ['outcome_A'];
  s.assessments[2].outcomeIds = ['outcome_A', 'outcome_B'];
  const state = build({}, 'MBA28', s);
  expect(state.assessments[2].outcomeIds).toEqual(['clo1', 'clo2']);
  expect(state.outcomes[0].assessmentIds).toEqual(['as2', 'as3']);
  expect(state.outcomes[1].assessmentIds).toEqual(['as3']);
});

test('повні дати розкладу → ISO; неповні лишаються текстом; час як у файлі', () => {
  const s = slots();
  s.sessions[1].date = '5, 6 and 19 September';
  s.sessions[2].date = null;
  const state = build({}, 'MBA28', s);
  expect(state.sessions.map((x) => x.date)).toEqual(['2026-03-07', '5, 6 and 19 September', null]);
  expect(state.sessions[0].time).toBe('9.30 – 12.20');
});

test('ПРН зі файлу: код нормалізований, coverage full, confirmed false', () => {
  const s = slots();
  s.outcomes[0].ploCodes = ['ПРН3'];
  expect(build({}, 'MBA28', s).outcomes[0].plo).toEqual([{ code: 'ПРН3', coverage: 'full', confirmed: false }]);
});

test('courseKind лише за кодом: код НД.4 у MBA27 → core (і ECTS нормативного курсу), без коду → elective', () => {
  const r27 = refs('MBA27');
  const core = r27.coreCourses.find((c) => c.code === 'НД.4');
  const withCode = slots();
  withCode.header.code = 'НД.4';
  const s1 = toState({ slots: withCode, programCode: 'MBA27', refs: r27 });
  expect(s1.header).toMatchObject({ courseCode: 'НД.4', courseKind: 'core', ects: core.ects });

  const s2 = toState({ slots: slots(), programCode: 'MBA27', refs: r27 });
  expect(s2.header).toMatchObject({ courseCode: null, courseKind: 'elective', ects: null });
});

test('ECTS із файлу має пріоритет над довідником', () => {
  const s = slots();
  s.header.code = 'НД.4';
  s.header.ects = 9;
  expect(toState({ slots: s, programCode: 'MBA27', refs: refs('MBA27') }).header.ects).toBe(9);
});

test('назва курсу збігається з нормативним, але коду немає: courseCode не ставиться автоматично', () => {
  const r27 = refs('MBA27');
  const s = slots();
  s.header.title = r27.coreCourses.find((c) => c.code === 'НД.4').en;
  const state = toState({ slots: s, programCode: 'MBA27', refs: r27 });
  expect(state.header.courseCode).toBeNull();
  expect(state.header.courseKind).toBe('elective');
});

test('declared: значення таблиці At a Glance зберігаються лише коли вони є', () => {
  const s = slots();
  s.declared = { assessmentTotal: 100, contactHours: 12, selfStudyHours: null, deliveryMode: 'hybrid', term: 'March 2026', instructor: 'J. Doe', blockIds: ['b0003'] };
  const state = build({}, 'MBA28', s);
  expect(state.header.declared).toEqual({ assessmentTotal: 100, contactHours: 12, selfStudyHours: null, deliveryMode: 'hybrid', term: 'March 2026', instructor: 'J. Doe' });
  expect(validateState(state)).toEqual([]);
  const checks = runChecks(state, refs());
  expect(checks.map((c) => c.id)).toEqual(expect.arrayContaining(['glance.contact_hours', 'glance.delivery_mode']));
});

test('порожній витяг дає валідний порожній стан без провенансу', () => {
  const empty = {
    header: { title: null, code: null, department: null, ects: null, totalHours: null, language: null, studyMode: null, deliveryFormat: null, termText: null, termStart: null, termEnd: null, blockIds: [] },
    declared: { assessmentTotal: null, contactHours: null, selfStudyHours: null, deliveryMode: null, term: null, instructor: null, blockIds: [] },
    prerequisites: { text: null, blockIds: [] }, shortDescription: { text: null, blockIds: [] }, capstone: { text: null, blockIds: [] },
    objectives: [], outcomes: [], instructors: [], sessions: [], individualWork: [], assessments: [],
    materials: { required: [], recommended: [] }, policySegments: [],
  };
  const state = toState({ slots: empty, programCode: 'MBA28', refs: refs() });
  expect(validateState(state)).toEqual([]);
  expect(state.header).toMatchObject({ source: null, evidenceBlockIds: [], courseKind: 'elective' });
  expect(state.summary.shortDescription).toEqual({ text: null, source: null, evidenceBlockIds: [] });
  expect(state.policies).toHaveLength(13);
});

test('політики з policyMatch: library — текст викладача, optionKey null; locked — текст довідника', async () => {
  const r = refs();
  const { policies } = await matchPolicies({ segments: slots().policySegments, refs: r }, { classify: async () => classifications().classifications });
  const state = toState({ slots: slots(), policies, programCode: 'MBA28', refs: r });
  expect(validateState(state)).toEqual([]);
  const by = Object.fromEntries(state.policies.map((p) => [p.key, p]));
  expect(by['policy.attendance']).toMatchObject({ optionKey: null, candidateOptionKey: 'attendance_std', source: 'parsed', evidenceBlockIds: ['b0061'] });
  expect(by['policy.attendance'].text).toMatch(/^Attendance is mandatory/);
  expect(policyDecided(by['policy.attendance'])).toBe(false);
  expect(by['policy.passing']).toMatchObject({ mode: 'locked', source: 'fixture' });
  expect(by['policy.passing'].text).toBe(r.policyLibrary.blocks.find((b) => b.key === 'policy.passing').text);
});

test('мова: кирилиця переважає → uk', () => {
  const s = slots();
  s.shortDescription.text = 'Цей курс дає практичний інструментарій для підготовки та проведення переговорів.';
  s.objectives = []; s.outcomes = []; s.sessions = [];
  expect(detectLanguage(s)).toBe('uk');
  expect(detectLanguage(slots())).toBe('en');
});
