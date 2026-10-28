// policyMatch: AI лише класифікує; library без дефолту, locked — завжди текст довідника, кандидат — за схожістю або судженням.
jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const { matchPolicies, similarity, buildSchema } = require('../../services/ai/parse/policyMatch');
const { policyDecided } = require('../../services/syllabusState/slots');
const { refs, reply } = require('./fixtures');

beforeEach(() => createResponse.mockReset());

// Реальні тексти з Risk_Management_MBA_2026_Syllabus v.2 (стандартні формулювання політик шаблону KSE)
const RM_ATTENDANCE = 'Attendance is mandatory. If a student misses more than 40% of classes, they will be required to retake the course unless explicitly agreed otherwise with the instructor in advance. Participation in an online class with the camera turned off is considered equivalent to absence.';
const RM_LATE = 'Assignments submitted after the deadline may be subject to a penalty in the form of a reduction of the maximum possible score. Unless explicitly stated otherwise, assignments submitted seven days or more after the deadline will not be accepted and will receive a score of 0. In exceptional cases, the instructor may offer an alternative or additional assignment.';
const RM_PASSING = 'To successfully complete the course, a student must earn at least 60 out of 100 points.';
const RM_PARTICIPATION = 'Please note that attendance alone (online or offline) does not constitute participation. Students are expected to actively contribute to class discussions, group work, role plays, presentations, and other learning activities throughout the course.';

const seg = (text, topicHint, blockIds = ['b1']) => ({ text, topicHint, blockIds });
const by = (policies) => Object.fromEntries(policies.map((p) => [p.key, p]));
const block = (key) => refs().policyLibrary.blocks.find((b) => b.key === key);

test('Risk Management: відвідування і запізнення → candidateOptionKey, текст викладача, optionKey null', async () => {
  const segments = [seg(RM_ATTENDANCE, 'attendance', ['b0121']), seg(RM_PARTICIPATION, 'participation', ['b0122']), seg(RM_LATE, 'late', ['b0126']), seg(RM_PASSING, 'passing', ['b0127'])];
  const classify = async () => [
    { segmentIndex: 0, blockKey: 'policy.attendance', optionKey: 'attendance_std', match: 'equivalent' },
    { segmentIndex: 1, blockKey: 'policy.participation', optionKey: 'participation_active', match: 'equivalent' },
    { segmentIndex: 2, blockKey: 'policy.late', optionKey: 'late_gbs', match: 'equivalent' },
    { segmentIndex: 3, blockKey: 'policy.passing', optionKey: null, match: 'equivalent' },
  ];
  const { policies, matches, lockedNotes } = await matchPolicies({ segments, refs: refs() }, { classify });
  const p = by(policies);
  expect(p['policy.attendance']).toMatchObject({ mode: 'library', optionKey: null, candidateOptionKey: 'attendance_std', source: 'parsed', text: RM_ATTENDANCE, evidenceBlockIds: ['b0121'], modified: false });
  expect(p['policy.late']).toMatchObject({ optionKey: null, candidateOptionKey: 'late_gbs', source: 'parsed', text: RM_LATE });
  expect(p['policy.participation'].candidateOptionKey).toBe('participation_active');
  // Дефолту немає: жоден library-блок не зараховано без явного вибору
  for (const policy of policies.filter((x) => x.mode === 'library')) {
    expect(policy.optionKey).toBeNull();
    expect(policyDecided(policy)).toBe(false);
  }
  expect(matches.find((m) => m.key === 'policy.attendance')).toMatchObject({ candidateOptionKey: 'attendance_std', match: 'equivalent' });
  // Locked: текст довідника, а не викладача; розбіжність → нотатка
  expect(p['policy.passing']).toMatchObject({ mode: 'locked', source: 'fixture', text: block('policy.passing').text });
  expect(lockedNotes).toEqual([expect.objectContaining({ key: 'policy.passing', fileText: RM_PASSING, evidenceBlockIds: ['b0127'] })]);
});

test('без сегментів: усі library-блоки порожні, кандидатів немає, LLM не викликається', async () => {
  const { policies, matches, lockedNotes } = await matchPolicies({ segments: [], refs: refs() });
  expect(createResponse).not.toHaveBeenCalled();
  expect(policies).toHaveLength(13);
  for (const p of policies.filter((x) => x.mode === 'library')) expect(p).toMatchObject({ optionKey: null, candidateOptionKey: null, text: null, source: null });
  expect([matches, lockedNotes]).toEqual([[], []]);
});

test('текст майже збігається з варіантом (схожість ≥ 0.9) → кандидат без судження моделі', async () => {
  const text = block('policy.late').options.find((o) => o.key === 'late_daily').text.replace('five days', '5 days');
  const { policies } = await matchPolicies({ segments: [seg(text, 'late')], refs: refs() },
    { classify: async () => [{ segmentIndex: 0, blockKey: 'policy.late', optionKey: null, match: 'none' }] });
  expect(by(policies)['policy.late']).toMatchObject({ candidateOptionKey: 'late_daily', optionKey: null, text });
});

test('судження «equivalent» з числами, що не збігаються з варіантом (25% проти 40%), кандидата не дає', async () => {
  const { policies } = await matchPolicies({ segments: [seg(RM_ATTENDANCE, 'attendance')], refs: refs() },
    { classify: async () => [{ segmentIndex: 0, blockKey: 'policy.attendance', optionKey: 'attendance_strict', match: 'equivalent' }] });
  expect(by(policies)['policy.attendance']).toMatchObject({ candidateOptionKey: null, optionKey: null, text: RM_ATTENDANCE });
});

test('«partial» кандидата не дає; текст викладача зберігається', async () => {
  const { policies } = await matchPolicies({ segments: [seg(RM_LATE, 'late')], refs: refs() },
    { classify: async () => [{ segmentIndex: 0, blockKey: 'policy.late', optionKey: 'late_gbs', match: 'partial' }] });
  expect(by(policies)['policy.late']).toMatchObject({ candidateOptionKey: null, text: RM_LATE, source: 'parsed' });
});

test('«equivalent» для зовсім іншого тексту (схожість < 0.2) відхиляється', async () => {
  const { policies } = await matchPolicies({ segments: [seg('Come to class and have fun.', 'attendance')], refs: refs() },
    { classify: async () => [{ segmentIndex: 0, blockKey: 'policy.attendance', optionKey: 'attendance_std', match: 'equivalent' }] });
  expect(by(policies)['policy.attendance'].candidateOptionKey).toBeNull();
});

test('locked-блок, що збігається з довідником дослівно, нотатки не дає; кілька сегментів одного блоку об’єднуються', async () => {
  const fallback = block('policy.fallback').text;
  const segments = [seg(fallback, 'fallback', ['b1']), seg('Attendance is mandatory.', 'attendance', ['b2']), seg('Cameras must be on.', 'attendance', ['b3'])];
  const { policies, lockedNotes } = await matchPolicies({ segments, refs: refs() }, { classify: async () => [
    { segmentIndex: 0, blockKey: 'policy.fallback', optionKey: null, match: 'exact' },
    { segmentIndex: 1, blockKey: 'policy.attendance', optionKey: null, match: 'partial' },
    { segmentIndex: 2, blockKey: 'policy.attendance', optionKey: null, match: 'partial' },
  ] });
  expect(lockedNotes).toEqual([]);
  expect(by(policies)['policy.attendance']).toMatchObject({ text: 'Attendance is mandatory.\nCameras must be on.', evidenceBlockIds: ['b2', 'b3'] });
});

test('LLM-виклик: strict enum з довідника, коригувальний повтор для варіанта не з того блоку', async () => {
  createResponse
    .mockResolvedValueOnce(reply({ classifications: [{ segmentIndex: 0, blockKey: 'policy.late', optionKey: 'attendance_std', match: 'equivalent' }] }))
    .mockResolvedValueOnce(reply({ classifications: [{ segmentIndex: 0, blockKey: 'policy.attendance', optionKey: 'attendance_std', match: 'equivalent' }] }));
  const { policies } = await matchPolicies({ segments: [seg(RM_ATTENDANCE, 'attendance')], refs: refs() });
  expect(by(policies)['policy.attendance'].candidateOptionKey).toBe('attendance_std');
  expect(createResponse).toHaveBeenCalledTimes(2);
  const [[req]] = createResponse.mock.calls;
  expect(req.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'parse_policy_match' });
  const props = req.text.format.schema.properties.classifications.items.properties;
  expect(props.blockKey.enum).toEqual([...refs().policyLibrary.blocks.map((b) => b.key), null]);
  expect(props.optionKey.enum).toContain('attendance_std');
  expect(props.match.enum).toEqual(['exact', 'equivalent', 'partial', 'none']);
  expect(req.input[0].content).toMatch(/Never write, rewrite or merge policy text/);
  expect(createResponse.mock.calls[1][0].input[1].content).toMatch(/option attendance_std does not belong to block policy.late/);
});

test('непокритий сегмент → помилка валідації', async () => {
  createResponse.mockResolvedValue(reply({ classifications: [] }));
  await expect(matchPolicies({ segments: [seg(RM_LATE, 'late')], refs: refs() })).rejects.toThrow(/segment 0 is not classified/);
});

test('similarity: ідентичні = 1, різні близькі до 0, регістр не важить', () => {
  expect(similarity('Late work gets zero.', 'late work gets ZERO')).toBe(1);
  expect(similarity('alpha beta', 'gamma delta')).toBe(0);
  expect(similarity('', 'x')).toBe(0);
  expect(buildSchema(['a'], ['b']).properties.classifications.items.required).toHaveLength(4);
});
