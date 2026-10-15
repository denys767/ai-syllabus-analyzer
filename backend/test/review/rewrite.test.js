jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const { generateSuggestion, validateOps } = require('../../services/ai/review/rewrite');
const { getClause } = require('../../services/ai/rubric');
const { blocks, finding, response } = require('./fixtures');
const edit = (ops = [{ op: 'replaceBlock', blockId: 'b0002', newText: 'Evaluate competitive strategy.' }]) => ({
  kind: 'edit', title: 'Уточнення результату', description: 'Сформулюйте вимірюваний результат.', rationale: 'Оцінювання стане прозорішим.', ops, question: null,
});
const clauseResponse = (id = 'ai-policy') => ({
  title: 'Правила використання AI', description: 'Оберіть варіант політики.', rationale: 'Студентам потрібні чіткі правила.', op: 'insertAfter', blockId: 'b0004',
  options: getClause(id).variants.map((v) => ({ id: v.id, label: 'Варіант політики', rationale: 'Визначає межі використання AI.',
    placeholders: [...new Set(v.text.match(/\[[^\]]+\]/g) || [])].map((placeholder) => ({ placeholder, value: null })),
  })),
});
beforeEach(() => createResponse.mockReset());

test('edit retry feeds precise validation errors and returns full paragraph operation', async () => {
  createResponse.mockResolvedValueOnce(response(edit([{ op: 'replaceBlock', blockId: 'b9999', newText: 'Evaluate strategy.' }])))
    .mockResolvedValueOnce(response(edit()));
  const suggestion = await generateSuggestion({ finding: finding(), blocks });
  expect(suggestion).toMatchObject({ kind: 'edit', findingId: finding().id, ops: edit().ops });
  expect(createResponse).toHaveBeenCalledTimes(2);
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('ops[0].blockId: block b9999 does not exist');
});
test('injected document validator is awaited; errors drive retry', async () => {
  createResponse.mockResolvedValue(response(edit()));
  const validator = jest.fn().mockResolvedValueOnce(['replacement changes more than 70% of block b0002']).mockResolvedValueOnce([]);
  expect((await generateSuggestion({ finding: finding(), blocks, validateOps: validator })).kind).toBe('edit');
  expect(validator).toHaveBeenCalledWith(blocks, edit().ops); expect(validator).toHaveBeenCalledTimes(2);
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('replacement changes more than 70% of block b0002');
});
test('three failed attempts become a non-applicable advisory with neither ops nor question', async () => {
  createResponse.mockResolvedValue(response(edit([{ op: 'replaceBlock', blockId: 'b9999', newText: 'Evaluate.' }])));
  const suggestion = await generateSuggestion({ finding: finding(), blocks });
  expect(createResponse).toHaveBeenCalledTimes(3); expect(suggestion).toMatchObject({ kind: 'edit', applicable: false });
  expect(suggestion).not.toHaveProperty('ops'); expect(suggestion).not.toHaveProperty('question');
});
test('malformed strict responses retry and cannot leak extra operation fields', async () => {
  createResponse.mockResolvedValueOnce(response(edit([{ op: 'replaceBlock', blockId: 'b0002', newText: 'Evaluate.', diff: '+Evaluate' }])))
    .mockResolvedValueOnce(response(edit()));
  expect((await generateSuggestion({ finding: finding(), blocks })).ops).toEqual(edit().ops);
  expect(createResponse).toHaveBeenCalledTimes(2);
});
test('question finding asks for facts, without operations', async () => {
  createResponse.mockResolvedValue(response({ kind: 'question', title: 'Уточнення ваг', description: 'Сума ваг не дорівнює 100%.',
    rationale: 'Потрібне рішення викладача.', ops: [], question: 'Якими мають бути ваги проєкту та іспиту?' }));
  const suggestion = await generateSuggestion({ finding: finding('AS-1'), blocks });
  expect(suggestion).toMatchObject({ kind: 'question', question: 'Якими мають бути ваги проєкту та іспиту?' });
  expect(suggestion).not.toHaveProperty('ops');
});
test('question finding cannot silently invent an edit before instructor feedback', async () => {
  createResponse.mockResolvedValue(response(edit()));
  expect((await generateSuggestion({ finding: finding('AS-1'), blocks })).applicable).toBe(false);
  expect(createResponse).toHaveBeenCalledTimes(3);
});
test('Refine feedback is included verbatim as data in each generation', async () => {
  createResponse.mockResolvedValue(response(edit()));
  const feedback = 'Зробіть коротше, без дат і назв компаній.';
  await generateSuggestion({ finding: finding(), blocks, feedback });
  expect(createResponse.mock.calls[0][0].input[1].content).toContain(feedback);
});
test('clause choices are built from exact templates; unresolved variants have no ops', async () => {
  createResponse.mockResolvedValue(response(clauseResponse()));
  const suggestion = await generateSuggestion({ finding: finding('PO-1'), blocks });
  expect(suggestion.kind).toBe('choice'); expect(suggestion.options).toHaveLength(3); expect(suggestion.description).toContain('Чернетка');
  expect(suggestion.options[0].ops[0]).toEqual({ op: 'insertAfter', blockId: 'b0004', newBlocks: [{ kind: 'paragraph', text: getClause('ai-policy').variants[0].text }] });
  expect(suggestion.options[1].ops).toEqual([]); expect(suggestion.options[2].ops).toEqual([]); expect(suggestion.applicable).toBe(true);
});
test('clause placeholder adaptation uses only literal instructor-supplied values', async () => {
  const parsed = clauseResponse('attendance');
  parsed.options[0].placeholders = [{ placeholder: '[number]', value: '2' }, { placeholder: '[percentage]', value: '10%' }];
  createResponse.mockResolvedValue(response(parsed));
  const suggestion = await generateSuggestion({ finding: finding('PO-4'), blocks, feedback: 'Не більше 2 пропусків; зниження на 10%.' });
  expect(suggestion.options[0].ops[0].newBlocks[0].text).toBe(getClause('attendance').variants[0].text.replace('[number]', '2').replace('[percentage]', '10%'));
});
test('invented placeholder values and invalid clause anchors retry', async () => {
  const bad = clauseResponse('attendance'); bad.blockId = 'b9999';
  bad.options[0].placeholders = [{ placeholder: '[number]', value: 'invented-99' }, { placeholder: '[percentage]', value: null }];
  createResponse.mockResolvedValueOnce(response(bad)).mockResolvedValueOnce(response(clauseResponse('attendance')));
  const suggestion = await generateSuggestion({ finding: finding('PO-4'), blocks });
  expect(createResponse).toHaveBeenCalledTimes(2);
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('literal supplied fact');
  expect(suggestion).toMatchObject({ kind: 'choice', applicable: false }); expect(suggestion.options[0].ops).toEqual([]);
});
test('minimal validator rejects unknown, readonly, empty and duplicate block operations', () => {
  expect(validateOps([{ ...blocks[0], readOnly: true }, ...blocks.slice(1)], [
    { op: 'deleteBlock', blockId: 'b0001' }, { op: 'replaceBlock', blockId: 'b0002', newText: ' ' },
    { op: 'deleteBlock', blockId: 'b0002' }, { op: 'insertAfter', blockId: 'b9999', newBlocks: [] },
  ])).toEqual(expect.arrayContaining([expect.stringContaining('readOnly'), expect.stringContaining('non-empty'), expect.stringContaining('duplicate'), expect.stringContaining('does not exist'), expect.stringContaining('at least one block')]));
  expect(validateOps(blocks, [{ op: 'insertAfter', blockId: 'b0002', newBlocks: [{ kind: 'paragraph', text: '' }] }])).toEqual([expect.stringContaining('non-empty')]);
  expect(validateOps(blocks, [{ op: 'deleteBlock', blockId: 'b0002' }])).toEqual([]);
});
test('existing policy paragraph can be replaced with the exact chosen clause', async () => {
  const parsed = clauseResponse(); parsed.op = 'replaceBlock';
  createResponse.mockResolvedValue(response(parsed));
  const suggestion = await generateSuggestion({ finding: finding('PO-2'), blocks });
  expect(suggestion.options[0].ops).toEqual([{ op: 'replaceBlock', blockId: 'b0004', newText: getClause('ai-policy').variants[0].text }]);
});
test('custom validation is applied to clause option operations as well', async () => {
  createResponse.mockResolvedValue(response(clauseResponse()));
  const validator = jest.fn().mockReturnValueOnce(['block b0004 conflicts with accepted edit']).mockReturnValueOnce([]);
  expect((await generateSuggestion({ finding: finding('PO-1'), blocks, validateOps: validator })).kind).toBe('choice');
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('block b0004 conflicts with accepted edit');
});
