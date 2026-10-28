const { checksToCards, policyCards, courseHintCards } = require('../../services/ai/parse/cards');
const { runChecks } = require('../../services/checks');
const { buildDraftSuggestion } = require('../../services/chat/draftSuggestions');
const { matchPolicies } = require('../../services/ai/parse/policyMatch');
const { toState } = require('../../services/ai/parse/toState');
const { slots, refs, classifications } = require('./fixtures');

test('непройдені перевірки → англійські питання з checkId і конкретною ціллю', () => {
  const state = toState({ slots: slots(), refs: refs(), programCode: 'MBA28' });
  const checks = runChecks(state, refs());
  const cards = checksToCards(checks, state);
  expect(cards.length).toBeGreaterThan(0);
  expect(cards).toHaveLength(checks.filter((c) => !c.passed).length);
  for (const card of cards) {
    expect(card).toMatchObject({ origin: 'check', kind: 'question', checkId: expect.any(String), question: expect.any(String) });
    expect(card.question).not.toMatch(/[а-яіїєґ]/i);
    expect(buildDraftSuggestion(card, { syllabusId: 's1', state, refs: refs() }).draft).toBeUndefined();
  }
  expect(checksToCards([{ id: 'row:x', passed: false, path: 'assessments[].criteria', section: 'assessment', message: 'Which criteria?', severity: 'medium', details: { entityId: 'as1' } }], state)[0].target.path).toBe('assessments[as1].criteria');
});

test('політики → choice з кандидатом, власним текстом і рештою варіантів; locked → info', async () => {
  const r = refs();
  const result = await matchPolicies({ segments: slots().policySegments, refs: r }, { classify: async () => classifications().classifications });
  const state = toState({ slots: slots(), policies: result.policies, refs: r, programCode: 'MBA28' });
  const cards = policyCards(state, r, { lockedNotes: result.lockedNotes });
  const attendance = cards.find((c) => c.checkId === 'policy.choice:policy.attendance');
  expect(attendance.kind).toBe('choice');
  expect(attendance.options[0].optionKey).toBe('attendance_std');
  expect(attendance.options.find((o) => o.id === 'keep').value).toBe(slots().policySegments[0].text);
  expect(attendance.options).toHaveLength(r.policyLibrary.blocks.find((b) => b.key === 'policy.attendance').options.length + 1);
  expect(cards.find((c) => c.checkId === 'policy.locked:policy.passing')).toMatchObject({ severity: 'info', applicable: false });
  expect(courseHintCards({ title: 'Core course', code: 'C1' })[0].target).toEqual({ path: 'header.courseCode', section: 'at_a_glance' });
});
