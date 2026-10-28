// Кейси з перевіреними джерелами: веб-пошук (mock), перевірка URL (fetch і DNS — mock, без мережі).
jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const dns = require('dns');
const { createResponse } = require('../../services/ai/client');
const { verifyUrl, saneUrl, findCaseSources } = require('../../services/ai/review/caseSources');

const response = (value) => ({ output_text: JSON.stringify(value) });

const GOOD = 'https://www.thecasecentre.org/products/view?id=123';
const BAD = 'https://hbsp.harvard.edu/product/made-up-case';
const res = (status) => ({ status, body: { cancel: jest.fn(async () => {}) } });

let fetchMock;
let lookup;
beforeEach(() => {
  createResponse.mockReset();
  fetchMock = jest.fn(async (url) => res(url.startsWith(GOOD) ? 200 : 404));
  global.fetch = fetchMock;
  lookup = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  delete process.env.CASE_WEB_SEARCH;
});
afterEach(() => {
  lookup.mockRestore();
  delete global.fetch;
  delete process.env.CASE_WEB_SEARCH;
});

describe('verifyUrl', () => {
  test('HEAD 2xx/3xx → true; без слідування редиректам і з таймаутом', async () => {
    fetchMock.mockResolvedValueOnce(res(301));
    expect(await verifyUrl(GOOD)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(GOOD, expect.objectContaining({ method: 'HEAD', redirect: 'manual', signal: expect.any(AbortSignal) }));
  });

  test('HEAD 405 або обрив → GET', async () => {
    fetchMock.mockResolvedValueOnce(res(405)).mockResolvedValueOnce(res(200));
    expect(await verifyUrl(GOOD)).toBe(true);
    fetchMock.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(res(204));
    expect(await verifyUrl(GOOD)).toBe(true);
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(['HEAD', 'GET', 'HEAD', 'GET']);
  });

  test('4xx/5xx, таймаут і мережеві помилки → false', async () => {
    expect(await verifyUrl(BAD)).toBe(false);
    fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    expect(await verifyUrl(GOOD)).toBe(false);
  });

  test('хост: IP, localhost, приватні адреси DNS, не-http — без запитів', async () => {
    for (const url of ['http://127.0.0.1/x', 'http://localhost/x', 'ftp://example.org/x', 'https://user:pw@site.com/x',
      'https://intranet/x', 'https://site.com:8080/x', 'not a url']) {
      expect(await verifyUrl(url)).toBe(false);
    }
    lookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    expect(await verifyUrl('https://rebind.attacker.com/x')).toBe(false);
    lookup.mockRejectedValueOnce(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    expect(await verifyUrl('https://no-such-host.com/x')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saneUrl('https://xn--80ak6aa92e.com/x')).toBeTruthy();
  });
});

describe('findCaseSources', () => {
  const research = {
    output_text: `Found: "Nova Poshta: Scaling Logistics", The Case Centre, 2022, ${GOOD}. Also "Monobank Growth", HBS, 2021, ${BAD}.`,
    output: [{ type: 'message', content: [{ type: 'output_text', annotations: [{ type: 'url_citation', url: GOOD, title: 'Nova Poshta' }] }] }],
  };
  const formatted = { cases: [
    { title: 'Nova Poshta: Scaling Logistics', publisher: 'The Case Centre', year: 2022, url: GOOD, relevance: 'Український кейс логістики.' },
    { title: 'Monobank Growth', publisher: 'HBS', year: 2021, url: BAD, relevance: 'Український фінтех.' },
  ] };
  const input = { finding: { claim: 'Add a case on logistics', suggestedAction: 'Recommend suitable cases' }, meta: { courseName: 'Strategy' } };

  test('пошук → strict-форматування → перевірка URL; неперевірений URL не повертається', async () => {
    createResponse.mockResolvedValueOnce(research).mockResolvedValueOnce(response(formatted));
    const cases = await findCaseSources(input);
    expect(createResponse.mock.calls[0][0].tools).toEqual([{ type: 'web_search_preview' }]);
    expect(createResponse.mock.calls[1][0].text.format).toMatchObject({ type: 'json_schema', name: 'case_sources', strict: true });
    expect(createResponse.mock.calls[1][0].tools).toBeUndefined();
    expect(cases).toEqual([
      expect.objectContaining({ title: 'Nova Poshta: Scaling Logistics', publisher: 'The Case Centre', year: 2022, url: GOOD, verified: true }),
      expect.objectContaining({ title: 'Monobank Growth', publisher: 'HBS', year: 2021, url: null, verified: false }),
    ]);
  });

  test('порожня відповідь пошуку → без другого виклику і без перевірки URL', async () => {
    createResponse.mockResolvedValueOnce({ output_text: '' });
    expect(await findCaseSources(input)).toEqual([]);
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
