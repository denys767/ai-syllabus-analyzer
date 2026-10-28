// Еталонний силабус Risk Management: перевірки мають дати саме ті зауваження, які видно в документі.
const { runChecks, SEVERITIES } = require('../../services/checks');
const { rm, refs, ids, byRule } = require('./helpers');

const mba28 = () => runChecks(rm(), refs('MBA28'));
const mba27 = () => runChecks(rm(() => {}, { programCode: 'MBA27' }), refs('MBA27'));

test('participation 35% → warning з питанням про обґрунтування', () => {
  const [check] = byRule(mba28(), 'assessment.participation_share');
  expect(check).toMatchObject({ severity: 'warning', section: 'assessment', passed: false, details: { share: 35, limit: 30, componentIds: ['as1'] } });
  expect(check.message).toMatch(/What is the reason/);
});

test('self-study 14 проти очікуваних 40 → warning', () => {
  expect(byRule(mba28(), 'workload.self_study_ratio')[0]).toMatchObject({ severity: 'warning', details: { contactHours: 20, selfStudyHours: 14, expected: 40 } });
});

test('3 компоненти при 20 год і сума ваг 100 → без зауважень', () => {
  const checks = mba28();
  expect(byRule(checks, 'assessment.component_count')).toEqual([]);
  expect(byRule(checks, 'assessment.weights_total')).toEqual([]);
  expect(byRule(checks, 'assessment.row_complete')).toEqual([]);
  expect(byRule(checks, 'assessment.weight_consistency')).toEqual([]);
});

test('MBA27: курс core без PLO → high; MBA28: elective → info', () => {
  expect(byRule(mba27(), 'plo.coverage')[0]).toMatchObject({ severity: 'high', section: 'learning_outcomes', details: { courseKind: 'core', programCode: 'MBA27' } });
  expect(byRule(mba28(), 'plo.coverage')[0]).toMatchObject({ severity: 'info', passed: true, details: { courseKind: 'elective', programCode: 'MBA28' } });
});

test('clo4–clo6 без компонентів → warning', () => {
  expect(ids(byRule(mba28(), 'outcomes.clo_unassessed'))).toEqual(['outcomes.clo_unassessed:clo4', 'outcomes.clo_unassessed:clo5', 'outcomes.clo_unassessed:clo6']);
});

test('повний перелік і порядок: severity, далі TemplateSection.order', () => {
  expect(ids(mba27())).toEqual([
    'plo.coverage',                    // high · learning_outcomes
    'outcomes.clo_unassessed:clo4',    // warning · learning_outcomes (5)
    'outcomes.clo_unassessed:clo5',
    'outcomes.clo_unassessed:clo6',
    'workload.self_study_ratio',       // warning · schedule (8)
    'assessment.participation_share',  // warning · assessment (9)
    'regulations.ai_rules',            // warning · policies (11)
    'regulations.language',            // info · at_a_glance (1)
  ]);
});

test('інваріанти форми: лише непройдені й info, повідомлення англійською, сортування', () => {
  const order = new Map(refs().template.map((s) => [s.key, s.order]));
  const checks = mba28();
  for (const c of checks) {
    expect(Object.keys(c).sort()).toEqual(['details', 'id', 'message', 'passed', 'path', 'section', 'severity']);
    expect(c.passed === false || c.severity === 'info').toBe(true);
    expect(order.has(c.section)).toBe(true);
    expect(c.message).not.toMatch(/[Ѐ-ӿ]/);
  }
  const keys = checks.map((c) => [SEVERITIES.indexOf(c.severity), order.get(c.section)]);
  const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  expect(keys).toEqual(sorted);
  expect(new Set(ids(checks)).size).toBe(checks.length);
});

test('порожній стан треку 1 не падає і не сипле critical', () => {
  const empty = { schemaVersion: 1, programCode: 'MBA28', track: 'scratch', language: null, header: {}, policies: [] };
  const checks = runChecks(empty, refs());
  expect(checks.filter((c) => c.severity === 'critical').map((c) => c.id)).toEqual(['regulations.alternative_tasks']);
});

test('чиста функція: стан не змінюється', () => {
  const state = rm();
  const before = JSON.stringify(state);
  runChecks(state, refs());
  expect(JSON.stringify(state)).toBe(before);
});
