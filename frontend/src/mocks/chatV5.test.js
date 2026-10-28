import { createMockClient, MOCK_IDS, mockView } from './chatV5';

// Наскрізний сценарій моків: непідтверджені факти не змінюють документ, політики не мають дефолтів.
test('Risk Management requires explicit facts and policy decisions, then renders a diff', async () => {
  const client = createMockClient();
  const id = MOCK_IDS.upload;
  const { data: initial } = await client.chat.start(id);
  expect(initial.messages.some((m) => m.kind === 'approve-all')).toBe(true);
  expect(initial.state.policies.find((p) => p.key === 'policy.attendance').optionKey).toBeNull();
  const sid = 'sg-weights';
  await expect(client.chat.accept(id, sid, { expectedRevision: initial.revision })).rejects.toMatchObject({ response: { data: { code: 'UNCONFIRMED_VALUES' } } });
  const { data: confirmed } = await client.chat.setValues(id, sid, [{ id: 'v1', value: '30%', confirmed: true }, { id: 'v2', value: '45%', confirmed: true }]);
  expect(confirmed.state.assessments[0].weight).toBe(35);
  const { data: accepted } = await client.chat.accept(id, sid, { expectedRevision: confirmed.revision });
  expect(accepted.state.assessments[0].weight).toBe(30);
  const { data: diff } = await client.chat.document(id, { diff: true });
  expect(diff.sections.flatMap((s) => s.blocks).flatMap((b) => b.parts || []).some((part) => part.type === 'ins')).toBe(true);
  const { data: kept } = await client.chat.choosePolicy(id, 'policy.attendance', { keepText: true });
  expect(kept.state.policies.find((p) => p.key === 'policy.attendance').source).toBe('instructor_directed');
  const { data: own } = await client.chat.choosePolicy(id, 'policy.late', { writeOwn: true });
  expect(own.conversation.currentSlotKey).toBe('policy.late');
  expect(own.messages.at(-1).kind).toBe('question');
  expect(own.state.policies.find((p) => p.key === 'policy.late').source).toBe('parsed');
}, 15000);

test('scratch asks one question and preserves skipped slots in the View', async () => {
  const client = createMockClient();
  const { data: start } = await client.chat.start(MOCK_IDS.scratch);
  const question = start.messages.find((m) => m.kind === 'question');
  expect(question.payload.slotKey).toBe(start.conversation.currentSlotKey);
  const { data: next } = await client.chat.skip(MOCK_IDS.scratch, question.payload.slotKey);
  expect(next.conversation.skippedSlots).toContain(question.payload.slotKey);
  expect(next.state.summary.prerequisites.text).toBeFalsy();
  expect(next.conversation.currentSlotKey).not.toBe(question.payload.slotKey);
  expect(mockView(MOCK_IDS.scratch).messages[0].kind).toBe('question');
});
