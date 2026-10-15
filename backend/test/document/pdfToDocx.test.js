const fs = require('fs');
const path = require('path');
const { paragraphsFromText, synthesizeDocx, pdfToDocx } = require('../../services/document/extractors/pdfToDocx');
const { loadDocument, extractDocx } = require('../../services/document');

const PDF = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pdf', 'syllabus-text.pdf'));

describe('paragraphsFromText', () => {
  test('заголовки, списки, перенесені рядки, номери сторінок', () => {
    const text = [
      'Сторінка 1 з 2',
      'Strategic Management',
      '1. Course Overview',
      'This course runs for ten weeks and covers corporate and business-level strategy for',
      'growing companies in volatile markets.',
      '',
      'Prerequisites: none.',
      '2.1 Skills',
      '• Teamwork',
      '- Public speaking',
      '1. Analyse the competitive environment.',
      '2. Formulate a growth strategy.',
      'GRADING POLICY',
      '-- 1 of 2 --',
      'Final exam weighs 40%.',
      '7',
    ].join('\n');
    const paras = paragraphsFromText(text);
    expect(paras).toEqual([
      { kind: 'heading', level: 0, text: 'Strategic Management' },
      { kind: 'heading', level: 1, text: '1. Course Overview' },
      { kind: 'paragraph', text: 'This course runs for ten weeks and covers corporate and business-level strategy for growing companies in volatile markets.' },
      { kind: 'paragraph', text: 'Prerequisites: none.' },
      { kind: 'heading', level: 2, text: '2.1 Skills' },
      { kind: 'list-item', listFormat: 'bullet', text: 'Teamwork' },
      { kind: 'list-item', listFormat: 'bullet', text: 'Public speaking' },
      { kind: 'list-item', listFormat: 'decimal', text: 'Analyse the competitive environment.' },
      { kind: 'list-item', listFormat: 'decimal', text: 'Formulate a growth strategy.' },
      { kind: 'heading', level: 1, text: 'GRADING POLICY' },
      { kind: 'paragraph', text: 'Final exam weighs 40%.' },
    ]);
  });

  test('перенос зі знаком переносу склеюється без пробілу', () => {
    const paras = paragraphsFromText('Intro.\nThe course uses inter-\nactive cases and simulations.');
    expect(paras[1].text).toBe('The course uses interactive cases and simulations.');
  });

  test('порожній текст → []', () => {
    expect(paragraphsFromText('\n\n-- 1 of 1 --\n\n')).toEqual([]);
  });
});

describe('synthesizeDocx', () => {
  test('типи блоків зберігаються після екстракції', async () => {
    const buf = await synthesizeDocx([
      { kind: 'heading', level: 0, text: 'Title' },
      { kind: 'heading', level: 2, text: 'Section' },
      { kind: 'paragraph', text: 'Body text.' },
      { kind: 'list-item', listFormat: 'bullet', text: 'Bullet' },
      { kind: 'list-item', listFormat: 'decimal', text: 'Numbered' },
    ]);
    const doc = await extractDocx(buf);
    expect(doc.blocks.map((b) => [b.kind, b.level ?? null, b.text])).toEqual([
      ['heading', 0, 'Title'],
      ['heading', 2, 'Section'],
      ['paragraph', null, 'Body text.'],
      ['list-item', 1, 'Bullet'],
      ['list-item', 1, 'Numbered'],
    ]);
    expect(doc.blocks[3].listFormat).toBe('bullet');
    expect(doc.blocks[4].listFormat).toBe('decimal');
  });
});

describe('pdfToDocx / loadDocument(pdf)', () => {
  test('фікстура PDF → DocModel з convertedFrom=pdf', async () => {
    const { buffer, doc, convertedFrom } = await loadDocument(PDF, 'pdf');
    expect(convertedFrom).toBe('pdf');
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    const texts = doc.blocks.map((b) => b.text);
    expect(texts).toContain('Курс триває 10 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.');
    expect(doc.blocks.find((b) => b.text === '1. Загальна інформація').kind).toBe('heading');
    expect(doc.blocks.find((b) => b.text === 'Командна робота').kind).toBe('list-item');
    expect(texts.some((t) => /Сторінка/.test(t))).toBe(false);
  });

  test('PDF без тексту → 422 PDF_NO_TEXT', async () => {
    const empty = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pdf', 'empty.pdf'));
    await expect(pdfToDocx(empty)).rejects.toMatchObject({ statusCode: 422, code: 'PDF_NO_TEXT' });
  });

  test('пошкоджений PDF → 422', async () => {
    await expect(pdfToDocx(Buffer.from('%PDF-1.4 broken'))).rejects.toMatchObject({ statusCode: 422 });
  });
});
