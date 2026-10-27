const { runChecks } = require('../../services/checks');
const { aiProhibitedCategories, aiPermissionScope } = require('../../services/checks/regulations');
const { rm, refs, byRule, policy, libraryText } = require('./helpers');

const run = (state) => runChecks(state, refs());
const choose = (s, key, optionKey) => Object.assign(policy(s, key), { optionKey, text: libraryText(key, optionKey), source: 'fixture' });

describe('альтернативні завдання, 2.5.6(1) (critical)', () => {
  test('locked policy.absence згадує alternative task → пройдено', () => {
    expect(byRule(run(rm()), 'regulations.alternative_tasks')).toEqual([]);
  });

  test('без absence і compensation → critical', () => {
    const state = rm((s) => { s.policies = s.policies.filter((p) => p.key !== 'policy.absence'); });
    expect(byRule(run(state), 'regulations.alternative_tasks')[0]).toMatchObject({ severity: 'critical', section: 'assessment', details: { regulation: '2.5.6(1)' } });
  });

  test('compensation групи comp закриває вимогу', () => {
    const state = rm((s) => {
      s.policies = s.policies.filter((p) => p.key !== 'policy.absence');
      s.compensation.items.push({ id: 'c1', group: 'comp', fixtureRef: null, text: 'An essay on the missed topic.', modified: false, source: 'instructor_directed', evidenceBlockIds: [] });
    });
    expect(byRule(run(state), 'regulations.alternative_tasks')).toEqual([]);
  });
});

describe('прохідний бал 60, 2.5.4(2) (critical)', () => {
  test.each([
    ['To pass the course a student must earn at least 50 points.', [50]],
    ['The passing grade is 55 out of 100.', [55]],
    ['A minimum of 40 points is required for the final grade.', [40]],
    ['A minimum of 5 points for participation.', []],
    ['Students pass 3 of 4 quizzes in class.', []],
    ['To pass the course a student must earn at least 60 out of 100 points.', []],
  ])('%s → %j', (text, values) => {
    const state = rm((s) => { s.assessments[1].criteria = text; });
    const found = byRule(run(state), 'regulations.passing_score');
    expect(found.flatMap((c) => c.details.found.map((f) => f.value))).toEqual(values);
    if (values.length) expect(found[0]).toMatchObject({ severity: 'critical', path: 'assessments[].criteria' });
  });

  test('locked policy.passing (60) не дає зауважень', () => {
    expect(byRule(run(rm()), 'regulations.passing_score')).toEqual([]);
  });
});

describe('повторне проходження, 2.5.6(4) (high, умовна)', () => {
  test('згадка resit лише в оцінюванні → high', () => {
    const state = rm((s) => { s.assessments[1].criteria = 'Students who fail may resit the exam.'; });
    expect(byRule(run(state), 'regulations.retake')[0]).toMatchObject({ severity: 'high', details: { regulation: '2.5.6(4)' } });
  });

  test('опис у політиках або compensation групи retake закриває вимогу', () => {
    const inPolicy = rm((s) => {
      s.assessments[1].criteria = 'Students who fail may resit the exam.';
      policy(s, 'policy.appeal').text = 'A student may resit the written exam once, within two weeks; the resit grade is capped at 60.';
    });
    const inComp = rm((s) => {
      s.assessments[1].criteria = 'Students who fail may resit the exam.';
      s.compensation.items.push({ id: 'c1', group: 'retake', fixtureRef: null, text: 'One resit during the retake week.', modified: false, source: 'fixture', evidenceBlockIds: [] });
    });
    expect(byRule(run(inPolicy), 'regulations.retake')).toEqual([]);
    expect(byRule(run(inComp), 'regulations.retake')).toEqual([]);
  });

  test('без згадок — без зауважень; «retake the course» (наслідок пропусків) не є перескладанням', () => {
    expect(byRule(run(rm()), 'regulations.retake')).toEqual([]);
    const state = rm((s) => { s.assessments[0].criteria = 'Students who skip half of the sessions retake the course next year.'; });
    expect(byRule(run(state), 'regulations.retake')).toEqual([]);
  });
});

describe('відвідування, 2.4.3 (high)', () => {
  test('текст з файлу є → пройдено', () => {
    expect(byRule(run(rm()), 'regulations.attendance')).toEqual([]);
  });
  test('не вирішено й тексту немає → high', () => {
    const state = rm((s) => Object.assign(policy(s, 'policy.attendance'), { text: null, optionKey: null }));
    expect(byRule(run(state), 'regulations.attendance')[0]).toMatchObject({ severity: 'high', section: 'policies' });
  });
  test('обрано варіант довідника → пройдено', () => {
    const state = rm((s) => choose(s, 'policy.attendance', 'attendance_strict'));
    expect(byRule(run(state), 'regulations.attendance')).toEqual([]);
  });
});

describe('бонусні/штрафні бали, 2.5.4(1) (medium, умовна)', () => {
  test('штраф без розміру → medium (RM: late policy)', () => {
    expect(byRule(run(rm()), 'regulations.bonus_penalty')[0]).toMatchObject({ severity: 'medium', section: 'policies', path: 'policies{policy.late}.text' });
  });
  test('з розміром — пройдено', () => {
    const state = rm((s) => { policy(s, 'policy.late').text = 'Late work carries a penalty of 10% per day.'; s.assessments[0].criteria = 'Up to 5 bonus points for the best case presentation.'; });
    expect(byRule(run(state), 'regulations.bonus_penalty')).toEqual([]);
  });
  test('«penalties» у політиці доброчесності не рахуються', () => {
    const state = rm((s) => { choose(s, 'policy.late', 'late_daily'); choose(s, 'policy.integrity', 'integrity_std'); });
    expect(byRule(run(state), 'regulations.bonus_penalty')).toEqual([]);
  });
});

describe('правила ШІ зафіксовані (warning)', () => {
  test('режим не обрано і місце не вказано → warning', () => {
    expect(byRule(run(rm()), 'regulations.ai_rules')[0]).toMatchObject({ severity: 'warning', section: 'policies' });
  });
  test('ai_place = assignments: порожній розділ ШІ не є порушенням', () => {
    const state = rm((s) => choose(s, 'policy.ai_place', 'ai_place_assignments'));
    expect(byRule(run(state), 'regulations.ai_rules')).toEqual([]);
  });
  test('ai_place = syllabus без режиму → warning', () => {
    const state = rm((s) => choose(s, 'policy.ai_place', 'ai_place_syllabus'));
    expect(byRule(run(state), 'regulations.ai_rules')).toHaveLength(1);
  });
  test('режим обрано → пройдено', () => {
    const state = rm((s) => choose(s, 'policy.ai_mode', 'ai_mode_prohibited'));
    expect(byRule(run(state), 'regulations.ai_rules')).toEqual([]);
  });
});

describe('дозвіл ШІ ↔ заборони (детермінована частина)', () => {
  test('5 категорій розділу 3 беруться з довідника', () => {
    const categories = aiProhibitedCategories(refs());
    expect(categories).toHaveLength(5);
    expect(categories[1]).toBe('answers to exams, quizzes and tests');
  });

  test.each([
    ['ai_mode_disclosure', true],
    ['ai_mode_scoped', true],
    ['ai_mode_required', true],
    ['ai_mode_prohibited', false],
    ['ai_mode_refer', false],
  ])('режим %s → звірка потрібна: %s', (mode, applicable) => {
    const state = rm((s) => choose(s, 'policy.ai_mode', mode));
    expect(aiPermissionScope(state, refs()).applicable).toBe(applicable);
    const found = byRule(run(state), 'regulations.ai_prohibitions');
    expect(found.map((c) => c.severity)).toEqual(applicable ? ['info'] : []);
    if (applicable) expect(found[0].details).toMatchObject({ mode, componentIds: ['as1', 'as2', 'as3'], needsJudgement: true });
  });

  test('без компонентів звірка не потрібна', () => {
    const state = rm((s) => { choose(s, 'policy.ai_mode', 'ai_mode_disclosure'); s.assessments = []; });
    expect(aiPermissionScope(state, refs()).applicable).toBe(false);
  });
});

describe('обов\'язковість контрольних заходів, 2.4.3 (medium)', () => {
  test('attendance_recorded + «optional» біля контрольного компонента → medium', () => {
    const state = rm((s) => {
      choose(s, 'policy.attendance', 'attendance_recorded');
      s.sessions[4].additional = 'The Written Exam is optional for students with full attendance.';
    });
    const [check] = byRule(run(state), 'regulations.control_mandatory');
    expect(check).toMatchObject({ id: 'regulations.control_mandatory:as2', severity: 'medium', details: { attendanceOption: 'attendance_recorded' } });
    expect(check.message).toMatch(/\?$/);
  });
  test('«optional» біля не-контрольного компонента — без зауважень', () => {
    const state = rm((s) => { s.assessments[0].criteria = 'Speaking in class is optional but rewarded.'; });
    expect(byRule(run(state), 'regulations.control_mandatory')).toEqual([]);
  });
});

describe('мова силабуса, 2.4.5(1) (info)', () => {
  test.each([
    ['en', null, true],
    [null, 'Українська', true],
    [null, 'German', false],
    [null, null, false],
  ])('language=%s, header.language=%s → passed %s', (language, headerLanguage, passed) => {
    const state = rm((s) => { s.language = language; s.header.language = headerLanguage; });
    expect(byRule(run(state), 'regulations.language')).toEqual([expect.objectContaining({ severity: 'info', passed })]);
  });
});
