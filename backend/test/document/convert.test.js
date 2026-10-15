const { convert, createQueue, isAvailable } = require('../../services/document/convert');
const { loadDocument } = require('../../services/document');
const { fixture, texts } = require('./helpers');

const lo = isAvailable() ? test : test.skip;

describe('convert', () => {
  lo('.doc → .docx: текст і структура зберігаються', async () => {
    const { buffer, doc, convertedFrom } = await loadDocument(fixture('legacy.doc'), 'doc');
    expect(convertedFrom).toBe('doc');
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
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
    await expect(convert(fixture('syllabus.docx'), 'docx', 'pdf', { timeoutMs: 1 }))
      .rejects.toMatchObject({ statusCode: 504, code: 'CONVERSION_TIMEOUT' });
    const pdf = await convert(fixture('syllabus.docx'), 'docx', 'pdf');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 120000);

  lo('buildOutputs: clean, tracked і PDF з коментарями як анотаціями', async () => {
    const { extractDocx, buildOutputs } = require('../../services/document');
    const original = fixture('syllabus.docx');
    const doc = await extractDocx(original);
    const block = doc.blocks.find((b) => b.text.startsWith('Академічна доброчесність'));
    const accepted = [{ id: 's', rationale: 'Уточнити політику.', ops: [{ op: 'replaceBlock', blockId: block.id, newText: 'Академічна доброчесність: плагіат і списування неприпустимі.' }] }];
    const out = await buildOutputs(original, doc, accepted, { pdf: true });
    expect(Object.keys(out)).toEqual(['clean', 'tracked', 'trackedPdf']);
    expect(out.trackedPdf.toString('latin1')).toMatch(/\/Subtype\s*\/Text/);
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
    await expect(loadDocument(Buffer.from('x'), 'pptx')).rejects.toMatchObject({ statusCode: 415 });
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
