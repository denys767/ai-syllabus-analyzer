#!/usr/bin/env node
// PDF-фікстури через LibreOffice; scanned.pdf — зображення без текстового шару.
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('@cantoo/pdf-lib');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } = require('docx');
const { toPdf } = require('../../../services/document/convert');
const { pdfToPng } = require('../../../services/document/preview');
async function main() {
  const out = __dirname;
  const deck = await fs.readFile(path.join(out, '../pptx/syllabus.pptx'));
  await fs.writeFile(path.join(out, 'slides.pdf'), await toPdf(deck, 'pptx'));
  const source = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Силабус MBA: Стратегія')] }),
    new Paragraph('Kyiv School of Economics — course syllabus, 2026.'),
    new Paragraph({ heading: HeadingLevel.HEADING_1, text: '1. Загальна інформація' }),
    new Paragraph('Курс триває 10 тижнів і має письмовий іспит. Викладач пояснює принципи стратегічного менеджменту, аналіз конкурентного середовища та прийняття управлінських рішень. Студенти застосовують отримані знання у практичних кейсах українських компаній і презентують результати командної роботи.'),
    new Paragraph({ text: 'Командна робота', bullet: { level: 0 } }),
    new Paragraph({ text: 'Evaluate strategic options', bullet: { level: 0 } }),
    new Table({ rows: [['Тиждень', 'Тема', 'Кейс'], ['1', 'Стратегія', 'Nova Poshta'], ['2', 'Аналіз галузі', 'Monobank']].map((row) => new TableRow({ children: row.map((text) => new TableCell({ children: [new Paragraph(text)] })) })) }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, text: '2. Політики курсу', pageBreakBefore: true }),
    new Paragraph('Академічна доброчесність: плагіат неприпустимий.'),
    new Paragraph('Assessment includes cases, participation and a final exam.'),
    new Paragraph({ heading: HeadingLevel.HEADING_1, text: '3. Результати навчання', pageBreakBefore: true }),
    new Paragraph('Формулювати стратегію розвитку бізнесу.'),
    new Paragraph('Students analyse data and justify management decisions.'),
  ] }] });
  const docx = await Packer.toBuffer(source);
  await fs.writeFile(path.join(out, 'source.docx'), docx);
  const pdf = await toPdf(docx, 'docx');
  await fs.writeFile(path.join(out, 'syllabus.pdf'), pdf);
  const [{ png }] = await pdfToPng(pdf, [1]);
  const scanned = await PDFDocument.create();
  const image = await scanned.embedPng(png);
  const page = scanned.addPage([595, 842]);
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  await fs.writeFile(path.join(out, 'scanned.pdf'), await scanned.save());
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
