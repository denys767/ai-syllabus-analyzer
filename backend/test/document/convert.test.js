const { convert, createQueue, isAvailable } = require('../../services/document/convert');
const { loadDocument } = require('../../services/document');
const { fixture, texts } = require('./helpers');

const lo = isAvailable() ? test : test.skip;

describe('convert', () => {
  lo('.doc → .docx: текст і структура зберігаються', async () => {
    const { doc, convertedFrom } = await loadDocument(fixture('legacy.doc'), 'doc');
    expect(convertedFrom).toBe('doc');
    const t = texts(doc);
    expect(t).toEqual(expect.arrayContaining([
      'Курс триває 10 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.',
      'Формулювати стратегію розвитку бізнесу.',
      'Аналіз галузі (Porter Five Forces)',
    ]));
    expect(doc.blocks.find((b) => b.text === '1. Загальна інформація')).toMatchObject({ kind: 'heading', level: 1 });
    expect(doc.blocks.find((b) => b.text === 'Командна робота').kind).toBe('list-item');
  }, 120000);

  lo('таймаут задачі дає зрозумілу помилку і не блокує чергу', async () => {
    await expect(convert(fixture('legacy.doc'), 'doc', 'docx', { timeoutMs: 1 }))
      .rejects.toMatchObject({ statusCode: 504, code: 'CONVERSION_TIMEOUT' });
    const docx = await convert(fixture('legacy.doc'), 'doc', 'docx');
    expect(docx.subarray(0, 2).toString()).toBe('PK');
  }, 120000);

  test('відсутній soffice → 503 SOFFICE_MISSING', async () => {
    const prev = process.env.SOFFICE_PATH;
    process.env.SOFFICE_PATH = '/nonexistent/soffice';
    try {
      await expect(convert(Buffer.from('x'), 'doc', 'docx')).rejects.toMatchObject({ statusCode: 503, code: 'SOFFICE_MISSING' });
    } finally {
      if (prev === undefined) delete process.env.SOFFICE_PATH;
      else process.env.SOFFICE_PATH = prev;
    }
  });

  test('непідтримуваний формат', async () => {
    await expect(loadDocument(Buffer.from('x'), 'rtf')).rejects.toMatchObject({ statusCode: 415 });
  });

  test('черга обмежує паралельність', async () => {
    const queue = createQueue(1);
    let active = 0;
    let peak = 0;
    const job = (v) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      if (v === 2) throw new Error('boom');
      return v;
    };
    const results = await Promise.allSettled([1, 2, 3].map((v) => queue.push(job(v))));
    expect(peak).toBe(1);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(results[2].value).toBe(3);
  });
});
