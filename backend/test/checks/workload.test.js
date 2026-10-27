const { runChecks } = require('../../services/checks');
const { rm, refs, byRule } = require('./helpers');

// Очікувано 2 × 20 = 40 годин самостійної роботи; межі 50–150 % включно
describe('самостійна робота ≈ 2 × контактні (warning)', () => {
  test.each([
    [19.6, ['warning']], // 49 %
    [20, []],            // 50 %
    [60, []],            // 150 %
    [60.4, ['warning']], // 151 %
  ])('%s год проти 40 → %j', (selfStudy, severities) => {
    const state = rm((s) => { s.header.computed.selfStudyHours = selfStudy; });
    const found = byRule(runChecks(state, refs()), 'workload.self_study_ratio');
    expect(found.map((c) => c.severity)).toEqual(severities);
    if (severities.length) expect(found[0]).toMatchObject({ section: 'schedule', details: { contactHours: 20, expected: 40 } });
  });

  test('без годин занять або самостійної роботи перевірка мовчить', () => {
    const noContact = rm((s) => { s.header.computed.contactHours = null; s.sessions[0].hours = null; });
    const noSelf = rm((s) => { s.header.computed.selfStudyHours = null; s.individualWork = []; });
    for (const state of [noContact, noSelf]) expect(byRule(runChecks(state, refs()), 'workload.self_study_ratio')).toEqual([]);
  });
});
