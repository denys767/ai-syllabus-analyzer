const { runChecks } = require('../../services/checks');
const { weightMentions } = require('../../services/checks/assessment');
const { rm, refs, byRule } = require('./helpers');

const run = (state) => runChecks(state, refs());

describe('сума ваг = 100 (critical)', () => {
  test.each([
    [[35, 25, 40], null],
    [[35, 25, 39], 'critical'],
    [[35, 25, 41], 'critical'],
    [[33.33, 33.33, 33.34], null],
  ])('ваги %j → %s', (weights, severity) => {
    const state = rm((s) => { s.assessments.forEach((a, i) => { a.weight = weights[i]; }); s.header.computed.assessmentTotal = null; });
    const found = byRule(run(state), 'assessment.weights_total');
    expect(found.map((c) => c.severity)).toEqual(severity ? [severity] : []);
    if (severity) expect(found[0]).toMatchObject({ section: 'assessment', passed: false, details: { total: weights.reduce((a, b) => a + b, 0) } });
  });

  test('без компонентів сума не перевіряється (це прогалина повноти)', () => {
    expect(byRule(run(rm((s) => { s.assessments = []; })), 'assessment.weights_total')).toEqual([]);
  });
});

describe('консистентність ваг (high)', () => {
  test('згадка в політиці з іншою вагою → high по компоненту', () => {
    const state = rm((s) => { s.policies.find((p) => p.key === 'policy.late').text = 'The Final project (30%) is due two weeks after the last session.'; });
    const [check] = byRule(run(state), 'assessment.weight_consistency');
    expect(check).toMatchObject({ id: 'assessment.weight_consistency:as3', severity: 'high', details: { weight: 40 } });
    expect(check.details.mentions).toEqual([expect.objectContaining({ path: 'policies{policy.late}.text', value: 30 })]);
  });

  test('згадка в розкладі й критеріях з тією ж вагою — без зауважень', () => {
    const state = rm((s) => {
      s.sessions[4].additional = 'Written Exam: 25% of the final grade';
      s.assessments[2].criteria = '40% Final project, graded on the risk plan.';
    });
    expect(byRule(run(state), 'assessment.weight_consistency')).toEqual([]);
  });

  test.each([
    ['Written Exam 25%, Final project 40%', { as2: [25], as3: [40] }],
    ['Weights: 25% Written Exam, 40% Final project', { as2: [25], as3: [40] }],
    ['Written Exam (25%) and 40% for the project', { as2: [25] }],
    ['Students who miss 40% of classes fail the Written Exam', {}],
    ['The Written Exam counts for 30% of the final grade', { as2: [30] }],
    ['Final Exam 25%, Exam prep 10%', { as5: [25], as4: [10] }],
  ])('прив\'язка відсотків до назв: %s', (text, expected) => {
    const comps = [{ id: 'as2', name: 'Written Exam' }, { id: 'as3', name: 'Final project' }, { id: 'as4', name: 'Exam' }, { id: 'as5', name: 'Final Exam' }];
    const got = {};
    for (const m of weightMentions(text, comps)) (got[m.componentId] ||= []).push(m.value);
    expect(got).toEqual(expected);
  });
});

test('повнота рядка: бракує Criteria і Deadline → high по рядку', () => {
  const state = rm((s) => { s.assessments[1].criteria = ''; s.assessments[1].deadline = null; });
  const found = byRule(run(state), 'assessment.row_complete');
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ id: 'assessment.row_complete:as2', severity: 'high', details: { missing: ['Performance Criteria', 'Deadline'] } });
});

describe('кількість компонентів: ≤ 30 год → 2, понад 30 → 3 (critical)', () => {
  test.each([
    [30, 2, null],
    [31, 2, 'critical'],
    [31, 3, null],
    [20, 1, 'critical'],
    [20, 3, null],
  ])('%i год, %i компонентів → %s', (hours, count, severity) => {
    const state = rm((s) => {
      s.header.computed.contactHours = hours;
      s.assessments = s.assessments.slice(0, count);
    });
    const found = byRule(run(state), 'assessment.component_count');
    expect(found.map((c) => c.severity)).toEqual(severity ? [severity] : []);
    if (severity) expect(found[0].details).toMatchObject({ components: count, required: hours <= 30 ? 2 : 3 });
  });

  test('годин немає → info з проханням додати тривалість занять', () => {
    const state = rm((s) => { s.header.computed.contactHours = null; s.sessions[0].hours = null; });
    const [check] = byRule(run(state), 'assessment.component_count');
    expect(check).toMatchObject({ severity: 'info', passed: false });
    expect(check.message).toMatch(/add session durations/i);
  });

  test('години без E-поля рахуються з розкладу', () => {
    const state = rm((s) => { s.header.computed.contactHours = null; s.sessions.forEach((x) => { x.hours = 8; }); s.assessments = s.assessments.slice(0, 2); });
    expect(byRule(run(state), 'assessment.component_count')[0]).toMatchObject({ severity: 'critical', details: { contactHours: 48, required: 3 } });
  });
});

describe('частка participation ≤ 30 (warning, питання)', () => {
  test.each([[30, []], [31, ['warning']]])('participation %i%% → %j', (weight, severities) => {
    const state = rm((s) => { s.assessments[0].weight = weight; s.assessments[2].weight = 75 - weight; });
    const found = byRule(run(state), 'assessment.participation_share');
    expect(found.map((c) => c.severity)).toEqual(severities);
    if (severities.length) expect(found[0].message).toMatch(/\?/);
  });

  test('обґрунтування в Performance Criteria → info', () => {
    const state = rm((s) => {
      s.assessments[0].criteria = 'The weight is higher than usual because the course is built around live case discussions. Each session is graded on the quality of contributions.';
    });
    const [check] = byRule(run(state), 'assessment.participation_share');
    expect(check).toMatchObject({ severity: 'info', passed: true, details: { justified: true } });
  });

  test('одне речення з «because» обґрунтуванням не вважається', () => {
    const state = rm((s) => { s.assessments[0].criteria = 'Weighted at 35% because discussion matters.'; });
    expect(byRule(run(state), 'assessment.participation_share')[0].severity).toBe('warning');
  });
});

describe('дедлайни в межах терму (warning)', () => {
  test.each([
    ['2026-06-08', []],          // кінець + 30 днів
    ['2026-06-09', ['warning']], // кінець + 31 день
    ['2026-04-24', ['warning']], // до початку
    ['9 May 2026', []],
    ['Throughout the course', []],
  ])('дедлайн %s → %j', (deadline, severities) => {
    const state = rm((s) => { s.assessments[2].deadline = deadline; });
    expect(byRule(run(state), 'assessment.deadline_in_term').map((c) => c.severity)).toEqual(severities);
  });

  test('header.term має пріоритет над датами розкладу', () => {
    const state = rm((s) => { s.header.term = { start: '2026-01-10', end: '2026-03-01' }; });
    const found = byRule(run(state), 'assessment.deadline_in_term');
    expect(found.map((c) => c.id)).toEqual(['assessment.deadline_in_term:as2', 'assessment.deadline_in_term:as3']);
    expect(found[0].details.term.source).toBe('header.term');
  });

  test('без дат перевірка мовчить', () => {
    const state = rm((s) => { s.header.computed.termFromSchedule = { start: null, end: null }; s.sessions.forEach((x) => { x.date = null; }); s.assessments[2].deadline = '2030-01-01'; });
    expect(byRule(run(state), 'assessment.deadline_in_term')).toEqual([]);
  });
});
