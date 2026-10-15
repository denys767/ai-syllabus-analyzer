const { runChecks, assessmentWeights } = require('../../services/ai/review/checks');
const fixture = require('../../eval/docs/synthetic.blocks.json');
const ids = (blocks) => runChecks(blocks).map((f) => f.criterionId);
const b = (text, i, kind = 'paragraph') => ({ id: `b${String(i).padStart(4, '0')}`, kind, text });

test('finds only the clear weight error in a complete synthetic syllabus', () => {
  const findings = runChecks(fixture.blocks);
  expect(findings.map((f) => f.criterionId)).toEqual(['AS-1']);
  expect(findings[0]).toMatchObject({ confidence: 1, evidenceBlockIds: ['b0011', 'b0012'] });
  expect(findings[0].claim).toContain('90');
});
test('checks missing sections with document anchor, including AI policy', () => {
  const findings = runChecks([]);
  expect(findings.map((f) => f.criterionId)).toEqual(expect.arrayContaining(['T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'PO-1']));
  expect(findings.every((f) => f.confidence === 1 && f.evidenceBlockIds[0] === 'document' && f._missingSection)).toBe(true);
});
test('recognizes reasonable synonyms and content outside headings', () => {
  const blocks = ['Entry requirements: none.', 'This course introduces strategy.', 'Competencies: evaluate options.',
    'Week 1: Strategy.', 'How you will be assessed: final project 100%.', 'Materials distributed in class.',
    'KSE AI policy applies.'].map((text, i) => b(text, i + 1));
  expect(runChecks(blocks)).toEqual([]);
});
test('correct sums, points, absent percentages, total and grading scale do not raise AS-1', () => {
  for (const texts of [
    ['Assessment', 'Exam 60%', 'Project 40%', 'Total 100%', '90–100% = A'],
    ['Assessment', 'Exam 60 points', 'Project 40 points'],
    ['Assessment', 'Exam and project'],
    ['Assessment', 'Exam 60%', 'Project 40%', 'Late penalty 10%'],
  ]) expect(ids(texts.map((text, i) => b(text, i + 1, i ? 'paragraph' : 'heading')))).not.toContain('AS-1');
});
test('handles decimal weights and separate table cells', () => {
  const blocks = [b('Evaluation', 1, 'heading'), b('Exam', 2, 'table-cell'), b('32,5%', 3, 'table-cell'),
    b('Project', 4, 'table-cell'), b('57.5%', 5, 'table-cell')];
  expect(assessmentWeights(blocks).map((r) => r.weight)).toEqual([32.5, 57.5]);
  expect(runChecks(blocks).find((f) => f.criterionId === 'AS-1').evidenceBlockIds).toEqual(['b0002', 'b0003', 'b0004', 'b0005']);
});
test('leaves ambiguous subcomponents to the LLM', () => {
  const blocks = [b('Assessment', 1, 'heading'), b('Project 60% (including presentation 20%)', 2), b('Exam 40%', 3)];
  expect(assessmentWeights(blocks)).toBeNull();
});
test('does not count assessment percentages repeated in the course schedule', () => {
  const texts = [b('Course Schedule', 1, 'heading'), b('Week 1: Project 40%', 2), b('Assessment', 3, 'heading'), b('Project 40%', 4), b('Exam 60%', 5)];
  expect(runChecks(texts).map((f) => f.criterionId)).not.toContain('AS-1');
});
