const { parseToState } = require('../../services/ai/parse');
const { slots, refs } = require('./fixtures');
const { policiesFromRefs } = require('../../services/syllabusState/empty');

function depsFor(s, r, match) {
  return {
    extractSlots: jest.fn(async () => ({ slots: s, warnings: [] })),
    matchPolicies: jest.fn(async () => ({ policies: policiesFromRefs(r), matches: [], lockedNotes: [] })),
    courseKind: jest.fn(async () => match),
  };
}

test('тип курсу визначає references.courseKind; збіг назви дає лише підказку коду', async () => {
  const r = refs('MBA27');
  const course = r.coreCourses[0];
  const s = slots(); s.header.title = course.en;
  const deps = depsFor(s, r, { kind: 'core', matchedBy: 'title', course });
  const result = await parseToState({ blocks: [], programCode: 'MBA27', refs: r }, deps);
  expect(deps.courseKind).toHaveBeenCalledWith('MBA27', { courseCode: null, courseTitle: course.en });
  expect(result.state.header).toMatchObject({ courseCode: null, courseKind: 'elective' });
  expect(result.courseHint).toMatchObject({ code: course.code, matchedBy: 'title' });
});

test('явний код своєї програми → core, без підказки; іншої програми → elective', async () => {
  const r = refs('MBA27'); const course = r.coreCourses[0];
  const s = slots(); s.header.code = course.code;
  const result = await parseToState({ blocks: [], programCode: 'MBA27', refs: r }, depsFor(s, r, { kind: 'core', matchedBy: 'code', course }));
  expect(result.state.header).toMatchObject({ courseCode: course.code, courseKind: 'core' });
  expect(result.courseHint).toBeNull();
  const other = refs('MBA28');
  const elective = await parseToState({ blocks: [], programCode: 'MBA28', refs: other }, depsFor(s, other, { kind: 'elective', matchedBy: null, course: null }));
  expect(elective.state.header.courseKind).toBe('elective');
});
