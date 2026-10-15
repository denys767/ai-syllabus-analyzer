// PDF → робочий DOCX: один PDF-блок відповідає одному абзацу.
const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType } = require('docx');
const { extractPdf, pdfBlocksToParagraphs } = require('./pdf');
const HEADINGS = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

async function synthesizeDocx(paragraphs, { title } = {}) {
  let instance = 0;
  let prevNumbered = false;
  const children = paragraphs.map((p) => {
    const run = [new TextRun(p.text)];
    const numbered = p.kind === 'list-item' && p.listFormat !== 'bullet';
    if (numbered && !prevNumbered) instance += 1;
    prevNumbered = numbered;
    if (p.kind === 'heading') return new Paragraph({ heading: HEADINGS[Math.min(p.level || 0, 6)], children: run });
    if (p.kind === 'list-item' && p.listFormat === 'bullet') return new Paragraph({ bullet: { level: 0 }, children: run });
    if (numbered) return new Paragraph({ numbering: { reference: 'pdf-numbered', level: 0, instance }, children: run });
    return new Paragraph({ children: run });
  });
  const doc = new Document({
    creator: 'KSE Syllabus Analyzer',
    title: title || 'Syllabus',
    numbering: {
      config: [{
        reference: 'pdf-numbered',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: [{ children: children.length ? children : [new Paragraph({})] }],
  });
  return Packer.toBuffer(doc);
}

async function pdfToDocx(buffer, opts = {}) {
  const pdfDoc = opts.pdfDoc || await extractPdf(buffer);
  return synthesizeDocx(pdfBlocksToParagraphs(pdfDoc), opts);
}
module.exports = { pdfToDocx, synthesizeDocx };
