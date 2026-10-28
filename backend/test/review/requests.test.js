jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const { requestJSON } = require('../../services/ai/review/common');
const schema = { type: 'object', properties: { outcomes: { type: 'array', items: { type: 'string' } } }, required: ['outcomes'], additionalProperties: false };
const emptyStructure = () => ({ outcomes: [] });
const response = (value) => ({ output_text: JSON.stringify(value) });
const request = (options = {}) => requestJSON('review_structure', schema, 'Static rules', 'Original document', options);

beforeEach(() => { createResponse.mockReset(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test.each([
  ['429', { status: 429 }], ['500', { status: 500 }], ['503', { statusCode: 503 }], ['408', { status: 408 }],
  ['network error', { name: 'APIConnectionError' }], ['connection timeout', { name: 'APIConnectionTimeoutError' }],
  ['socket reset', { code: 'ECONNRESET' }], ['fetch failure', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }],
])('retries transient %s errors and counts every API attempt', async (_, properties) => {
  const error = Object.assign(new Error('Connection failed'), properties);
  createResponse.mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValueOnce(response(emptyStructure()));
  const stats = { llmCalls: 0 };
  const pending = request({ stats });
  await jest.runAllTimersAsync();
  expect(await pending).toEqual(emptyStructure());
  expect(stats.llmCalls).toBe(3);
  expect(createResponse.mock.calls[2][0].input[1].content).toBe('Original document');
});

test('stops transient retries after three attempts', async () => {
  createResponse.mockRejectedValue(Object.assign(new Error('Rate limit'), { status: 429 }));
  const pending = expect(request()).rejects.toThrow('Rate limit');
  await jest.runAllTimersAsync(); await pending;
  expect(createResponse).toHaveBeenCalledTimes(3);
});

test.each([400, 401, 403, 404])('does not retry permanent API status %s', async (status) => {
  createResponse.mockRejectedValue(Object.assign(new Error('Permanent error'), { status }));
  await expect(request()).rejects.toThrow('Permanent error');
  expect(createResponse).toHaveBeenCalledTimes(1);
});

test.each([
  ['incomplete', { status: 'incomplete', output_text: '{}' }],
  ['invalid JSON', { output_text: '{' }],
  ['schema-invalid', response({ ...emptyStructure(), outcomes: null })],
])('retries %s responses twice', async (_, badResponse) => {
  createResponse.mockResolvedValueOnce(badResponse).mockResolvedValueOnce(badResponse).mockResolvedValueOnce(response(emptyStructure()));
  expect(await request()).toEqual(emptyStructure());
  expect(createResponse).toHaveBeenCalledTimes(3);
  expect(createResponse.mock.calls[1][0].input[1].content).toContain('Previous response validation errors');
  expect(createResponse.mock.calls[1][0].input[0].content).toBe('Static rules');
});

test('persistent schema mismatch stops after three attempts with precise errors', async () => {
  createResponse.mockResolvedValue(response({ ...emptyStructure(), outcomes: null }));
  await expect(request()).rejects.toThrow('$.outcomes: expected array');
  expect(createResponse).toHaveBeenCalledTimes(3);
  expect(createResponse.mock.calls[2][0].input[1].content).toContain('$.outcomes: expected array');
});

test('semantic retry appends the exact error and leaves static rules intact', async () => {
  createResponse.mockResolvedValue(response(emptyStructure()));
  const validate = jest.fn().mockReturnValueOnce(['missing criterion verdict: LO-2']).mockReturnValueOnce([]);
  expect(await request({ validate })).toEqual(emptyStructure());
  expect(createResponse).toHaveBeenCalledTimes(2);
  expect(createResponse.mock.calls[1][0].input).toEqual([
    { role: 'system', content: 'Static rules' },
    { role: 'user', content: expect.stringContaining('review_structure: missing criterion verdict: LO-2') },
  ]);
});

test('persistent semantic errors have only one correction attempt', async () => {
  createResponse.mockResolvedValue(response(emptyStructure()));
  await expect(request({ validate: () => ['duplicate criterion LO-1'] })).rejects.toThrow('duplicate criterion LO-1');
  expect(createResponse).toHaveBeenCalledTimes(2);
});

test('transport and semantic failures share bounded budgets across the full request', async () => {
  createResponse.mockRejectedValueOnce(Object.assign(new Error('Server busy'), { status: 503 }))
    .mockResolvedValueOnce(response(emptyStructure()))
    .mockResolvedValueOnce({ status: 'incomplete' })
    .mockResolvedValueOnce(response(emptyStructure()));
  const validate = jest.fn().mockReturnValueOnce(['unknown findingId bad-id']).mockReturnValueOnce([]);
  const pending = request({ validate });
  await jest.runAllTimersAsync();
  expect(await pending).toEqual(emptyStructure());
  expect(createResponse).toHaveBeenCalledTimes(4);
  expect(createResponse.mock.calls[3][0].input[1].content).toContain('unknown findingId bad-id');
});
