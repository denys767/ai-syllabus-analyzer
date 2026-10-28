import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useWorkspace from './useWorkspace';

jest.mock('../services/workspaceClient', () => ({ __esModule: true, default: {} }));

// Перевіряємо межу hook ↔ API: підтвердження фактів, ревізії, оновлення документа та зміна вкладки.
global.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
let current;
const base = (extra = {}) => ({
  syllabus: { id: 'one', title: 'Risk Management', status: 'in_progress', canMutate: true },
  revision: 4, state: { policies: [] }, sections: [], messages: [], conversation: { id: 'conversation' },
  suggestions: [{ _id: 'draft', draft: { proposedValues: [{ id: 'v1', value: '48 hours', confirmed: false }] }, status: 'pending' }],
  ...extra,
});
const makeClient = (data = base()) => ({
  chat: {
    get: jest.fn().mockResolvedValue({ data }), start: jest.fn(),
    document: jest.fn().mockResolvedValue({ data: { sections: [] } }),
    setValues: jest.fn().mockResolvedValue({ data: base({ revision: 5 }) }),
    accept: jest.fn().mockResolvedValue({ data: base({ revision: 6 }) }),
    choosePolicy: jest.fn().mockResolvedValue({ data }),
  },
  policies: { syllabusLibrary: jest.fn().mockResolvedValue({ data: [] }) },
});
function Harness({ id = 'one', client }) {
  current = useWorkspace(id, { client });
  return null;
}
const render = async (client, id = 'one') => {
  // React DOM без Testing Library потребує act, щоб завершити ефекти hook.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => { root.render(<Harness id={id} client={client} />); });
};
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test('Confirm explicitly confirms displayed facts before accepting at the returned revision', async () => {
  const client = makeClient();
  await render(client);
  await act(async () => { expect((await current.actions.confirm('draft')).ok).toBe(true); });
  expect(client.chat.setValues).toHaveBeenCalledWith('one', 'draft', [{ id: 'v1', value: '48 hours', confirmed: true }]);
  expect(client.chat.accept).toHaveBeenCalledWith('one', 'draft', { expectedRevision: 5 });
  expect(current.revision).toBe(6);
  expect(client.chat.document).toHaveBeenLastCalledWith('one', { diff: false });
  await act(async () => current.setDiff(true));
  expect(client.chat.document).toHaveBeenLastCalledWith('one', { diff: true });
});

test('a failed values confirmation never accepts the draft', async () => {
  const client = makeClient();
  client.chat.setValues.mockRejectedValue({ response: { status: 409, data: { code: 'UNCONFIRMED_VALUES' } } });
  await render(client);
  await act(async () => { expect((await current.actions.confirm('draft')).code).toBe('UNCONFIRMED_VALUES'); });
  expect(client.chat.accept).not.toHaveBeenCalled();
});

test('revision fallback omits expectedRevision when the View has no revision', async () => {
  const client = makeClient(base({ revision: undefined, suggestions: [] }));
  await render(client);
  await act(async () => current.actions.confirm('draft'));
  expect(client.chat.accept).toHaveBeenCalledWith('one', 'draft', {});
});

test('changing syllabi during values confirmation never accepts in the new syllabus', async () => {
  const client = makeClient();
  let finish;
  client.chat.setValues.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await render(client);
  let pending;
  await act(async () => { pending = current.actions.confirm('draft'); });
  client.chat.get.mockResolvedValue({ data: base({ syllabus: { id: 'two', status: 'in_progress' }, revision: 10 }) });
  await render(client, 'two');
  await act(async () => { finish({ data: base({ revision: 5 }) }); await pending; });
  expect(current.syllabus.id).toBe('two');
  expect(current.revision).toBe(10);
  expect(client.chat.accept).not.toHaveBeenCalled();
});

test('policy actions send one explicit action and retain the returned View', async () => {
  const client = makeClient();
  await render(client);
  await act(async () => current.actions.writeOwnPolicy('policy.late'));
  expect(client.chat.choosePolicy).toHaveBeenLastCalledWith('one', 'policy.late', { writeOwn: true });
  await act(async () => current.actions.keepPolicyText('policy.late'));
  expect(client.chat.choosePolicy).toHaveBeenLastCalledWith('one', 'policy.late', { keepText: true });
});

test('a conflict refreshes the View and returns a clear English error', async () => {
  const client = makeClient(base({ suggestions: [] }));
  await render(client);
  client.chat.get.mockResolvedValue({ data: base({ revision: 9 }) });
  client.chat.accept.mockRejectedValue({ response: { status: 409, data: { code: 'STATE_CONFLICT' } } });
  await act(async () => {
    const result = await current.actions.confirm('draft');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('syllabus changed');
  });
  expect(current.revision).toBe(9);
});

test('read-only syllabi do not start a conversation', async () => {
  const client = makeClient(base({ conversation: null, syllabus: { status: 'in_progress', canMutate: false } }));
  await render(client);
  expect(client.chat.start).not.toHaveBeenCalled();
  expect(current.readOnly).toBe(true);
});
