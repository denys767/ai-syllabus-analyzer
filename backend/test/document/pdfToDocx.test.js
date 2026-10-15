const fs = require('fs');
const path = require('path');
const { synthesizeDocx, pdfToDocx } = require('../../services/document/extractors/pdfToDocx');
const { loadDocument, extractDocx, extractPdf, pdfBlocksToParagraphs } = require('../../services/document');

const PDF = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pdf', 'syllabus-text.pdf'));

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
    const pdfDoc = await extractPdf(PDF);
    expect(doc.blocks.map((b) => b.text)).toEqual(pdfDoc.blocks.map((b) => b.text));
    expect(doc.sourceBlocks).toEqual(pdfDoc.blocks);
    expect(doc.sourceDocVersion).toBe(pdfDoc.docVersion);
    expect(doc.pdfBlockMap).toEqual(Object.fromEntries(doc.blocks.map((b, i) => [b.id, pdfDoc.blocks[i].id])));
    expect(pdfBlocksToParagraphs(pdfDoc)).toHaveLength(doc.blocks.length);
  });

  test('PDF без тексту → 422 PDF_NO_TEXT', async () => {
    const empty = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pdf', 'empty.pdf'));
    await expect(pdfToDocx(empty)).rejects.toMatchObject({ statusCode: 422, code: 'PDF_NO_TEXT' });
  });

  test('пошкоджений PDF → 422', async () => {
    await expect(pdfToDocx(Buffer.from('%PDF-1.4 broken'))).rejects.toMatchObject({ statusCode: 422 });
  });
});
