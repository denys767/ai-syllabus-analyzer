// Кейси з перевіреними джерелами: веб-пошук (mock), перевірка URL (fetch і DNS — mock, без мережі).
jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const dns = require('dns');
const { createResponse } = require('../../services/ai/client');
const { generateSuggestion } = require('../../services/ai/review/rewrite');
const {
  verifyUrl, saneUrl, isCaseFinding, applyVerifiedSources, findCaseSources, UNVERIFIED_LABEL,
} = require('../../services/ai/review/caseSources');
const { blocks, finding, response } = require('./fixtures');

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

test('isCaseFinding: лише PR-1..3 групи practice; питання — тільки з відповіддю викладача', () => {
  expect(isCaseFinding(finding('PR-3'))).toBe(true);
  expect(isCaseFinding(finding('PR-4'))).toBe(false);
  expect(isCaseFinding(finding('LO-1'))).toBe(false);
  expect(isCaseFinding(finding('PR-1'))).toBe(false);
  expect(isCaseFinding(finding('PR-1'), 'Кейс з HBS 2022')).toBe(true);
});

describe('generateSuggestion з CASE_WEB_SEARCH', () => {
  const research = {
    output_text: `Found: "Nova Poshta: Scaling Logistics", The Case Centre, 2022, ${GOOD}. Also "Monobank Growth", HBS, 2021, ${BAD}.`,
    output: [{ type: 'message', content: [{ type: 'output_text', annotations: [{ type: 'url_citation', url: GOOD, title: 'Nova Poshta' }] }] }],
  };
  const formatted = { cases: [
    { title: 'Nova Poshta: Scaling Logistics', publisher: 'The Case Centre', year: 2022, url: GOOD, relevance: 'Український кейс логістики.' },
    { title: 'Monobank Growth', publisher: 'HBS', year: 2021, url: BAD, relevance: 'Український фінтех.' },
  ] };
  const edit = (newText) => ({
    kind: 'edit', title: 'Додати український кейс', description: 'Замініть кейс на український.', rationale: `Джерело: ${BAD}`,
    ops: [{ op: 'replaceBlock', blockId: 'b0002', newText }], question: null,
  });

  test('за замовчуванням вимкнено: один виклик без tools', async () => {
    createResponse.mockResolvedValue(response(edit('Case: Nova Poshta.')));
    await generateSuggestion({ finding: finding('PR-3'), blocks });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(createResponse.mock.calls[0][0].tools).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('пошук → strict-форматування → перевірка URL; неперевірені URL вирізано, картка позначена', async () => {
    process.env.CASE_WEB_SEARCH = '1';
    createResponse
      .mockResolvedValueOnce(research)
      .mockResolvedValueOnce(response(formatted))
      .mockResolvedValueOnce(response(edit(`Session 5 case: Nova Poshta: Scaling Logistics (The Case Centre, 2022), ${GOOD}; Monobank Growth (${BAD}).`)));
    const s = await generateSuggestion({ finding: finding('PR-3'), blocks });

    expect(createResponse.mock.calls[0][0].tools).toEqual([{ type: 'web_search_preview' }]);
    expect(createResponse.mock.calls[1][0].text.format).toMatchObject({ type: 'json_schema', name: 'case_sources', strict: true });
    expect(createResponse.mock.calls[1][0].tools).toBeUndefined();
    const prompt = createResponse.mock.calls[2][0].input[1].content;
    expect(prompt).toContain(GOOD);
    expect(prompt).not.toContain(BAD);

    expect(s.ops[0].newText).toBe(`Session 5 case: Nova Poshta: Scaling Logistics (The Case Centre, 2022), ${GOOD}; Monobank Growth.`);
    expect(s.rationale).not.toContain(BAD);
    expect(s.description).toContain(UNVERIFIED_LABEL);
    expect(s.description).toContain('«Monobank Growth»');
    expect(s.sources).toEqual([
      { title: 'Nova Poshta: Scaling Logistics', publisher: 'The Case Centre', year: 2022, url: GOOD, verified: true },
      { title: 'Monobank Growth', publisher: 'HBS', year: 2021, url: null, verified: false },
    ]);
  });

  test('збережені джерела (Refine) — без нового пошуку', async () => {
    process.env.CASE_WEB_SEARCH = '1';
    createResponse.mockResolvedValue(response({ ...edit(`Case: Nova Poshta, ${GOOD}.`), rationale: 'Український кейс.' }));
    const s = await generateSuggestion({ finding: finding('PR-3'), blocks,
      caseSources: [{ title: 'Nova Poshta', publisher: null, year: null, url: GOOD, verified: true }] });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.ops[0].newText).toBe(`Case: Nova Poshta, ${GOOD}.`);
    expect(s.description).not.toContain(UNVERIFIED_LABEL);
  });

  test('збій пошуку не зриває генерацію; будь-який URL вирізається', async () => {
    process.env.CASE_WEB_SEARCH = '1';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    createResponse
      .mockRejectedValueOnce(Object.assign(new Error('tool not supported'), { status: 400 }))
      .mockResolvedValueOnce(response(edit(`Case: Monobank Growth, see ${BAD}`)));
    const s = await generateSuggestion({ finding: finding('PR-3'), blocks });
    warn.mockRestore();
    expect(s.ops[0].newText).toBe('Case: Monobank Growth, see');
    expect(s.description).toContain(UNVERIFIED_LABEL);
    expect(s.sources).toEqual([]);
  });
});

test('m2: програма в промпті пошуку — з refs силабусу (meta.programCode), «MBA» не зашито', async () => {
  createResponse.mockResolvedValue({ output_text: '', output: [] });
  await findCaseSources({ finding: { claim: 'risk' }, meta: { courseName: 'Risk', programCode: 'EMBA1' } }, { verify: async () => false });
  const [system, user] = createResponse.mock.calls[0][0].input;
  expect(system.content).toContain('suitable for a KSE EMBA1 course');
  expect(user.content).toContain('Programme: EMBA1');
  createResponse.mockClear();
  await findCaseSources({ finding: { claim: 'risk' }, meta: {} }, { verify: async () => false });
  const input = createResponse.mock.calls[0][0].input.map((m) => m.content).join('\n');
  expect(input).not.toMatch(/MBA/);
  expect(input).toContain('a KSE course');
});

test('applyVerifiedSources зберігає підтверджений URL з кінцевою крапкою і чистить варіанти choice', () => {
  const sources = [{ title: 'A', publisher: null, year: null, url: `${GOOD}/`, verified: true }];
  const out = applyVerifiedSources({
    kind: 'choice', title: 't', description: 'd', rationale: 'r',
    options: [{ id: 'o1', label: 'l', rationale: `x ${BAD}`, ops: [{ op: 'insertAfter', blockId: 'b1', newBlocks: [{ kind: 'paragraph', text: `See ${GOOD}.` }] }] }],
  }, sources);
  expect(out.options[0].ops[0].newBlocks[0].text).toBe(`See ${GOOD}.`);
  expect(out.options[0].rationale).toBe('x');
  expect(out.description).toContain(UNVERIFIED_LABEL);
});
