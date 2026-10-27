const { runChecks } = require('../../services/checks');
const { rm, refs, byRule } = require('./helpers');

const DECLARED = { assessmentTotal: 100, contactHours: 20, selfStudyHours: 14, deliveryMode: 'hybrid', term: { start: '2026-04-20', end: '2026-05-31' }, instructor: 'Oleksii Gromyko' };
const glanceChecks = (declared) => runChecks(rm((s) => { s.header.declared = declared; }), refs()).filter((c) => c.details.rule.startsWith('glance.'));

test('без header.declared (трек 1) перевірки At a Glance не запускаються', () => {
  expect(glanceChecks(undefined)).toEqual([]);
  expect(glanceChecks(null)).toEqual([]);
});

test('збіг таблиці з тілом — без зауважень', () => {
  expect(glanceChecks(DECLARED)).toEqual([]);
});

test.each([
  ['assessmentTotal', 90, 'glance.assessment_total', 'high'],
  ['contactHours', 24, 'glance.contact_hours', 'high'],
  ['selfStudyHours', 40, 'glance.self_study_hours', 'high'],
  ['deliveryMode', 'offline', 'glance.delivery_mode', 'warning'],
  ['term', { start: '2026-04-26', end: '2026-05-31' }, 'glance.term', 'warning'],
  ['term', '1 May 2026 – 31 May 2026', 'glance.term', 'warning'],
  ['instructor', 'Jane Doe', 'glance.instructor', 'warning'],
])('%s = %j → %s (%s)', (field, value, rule, severity) => {
  const [check] = glanceChecks({ ...DECLARED, [field]: value });
  expect(check).toMatchObject({ id: rule, severity, section: 'at_a_glance', path: `header.declared.${field}`, passed: false });
  expect(check.message).toMatch(/\?$/);
});

test('null у полі declared — це поле не перевіряється; терм-текст без дат не розбирається', () => {
  expect(glanceChecks({ ...DECLARED, contactHours: null, term: 'Spring 2026', instructor: 'Dr. Oleksii Gromyko' })).toEqual([]);
});

test('hybrid збігається з поєднанням online і offline занять', () => {
  const state = rm((s) => {
    s.header.declared = DECLARED;
    s.header.computed.deliveryModes = ['online', 'offline'];
  });
  expect(byRule(runChecks(state, refs()), 'glance.delivery_mode')).toEqual([]);
});

test('схема: header.declared необов\'язковий, null або повний об\'єкт; term — текст або ISO-діапазон', () => {
  const { validateState } = require('../../services/syllabusState/schema');
  const withDeclared = (declared) => validateState(rm((s) => { s.header.declared = declared; }));
  expect(validateState(rm())).toEqual([]);
  expect(withDeclared(null)).toEqual([]);
  expect(withDeclared(DECLARED)).toEqual([]);
  expect(withDeclared({ ...DECLARED, term: 'Spring 2026' })).toEqual([]);
  expect(withDeclared({ ...DECLARED, deliveryMode: 'blended' })).not.toEqual([]);
  expect(withDeclared({ assessmentTotal: 100 })).not.toEqual([]);
});
