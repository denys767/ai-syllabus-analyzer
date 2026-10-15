#!/usr/bin/env node
// Генератор синтетичних DOCX/DOC-фікстур для тестів services/document.
// Запуск: node test/fixtures/docx/generate.js  (з каталогу backend)
// Результат комітиться, тож тести не залежать від генератора.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ExternalHyperlink, Footer, PageNumber, LevelFormat, AlignmentType,
  InsertedTextRun, DeletedTextRun,
} = require('docx');

const OUT_DIR = __dirname;
const FIXED_DATE = '2026-01-15T10:00:00Z';

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 3000, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.bold })] })],
  });
}

async function buildSyllabus() {
  const doc = new Document({
    creator: 'KSE test fixtures',
    title: 'MBA Syllabus fixture',
    numbering: {
      config: [{
        reference: 'kse-numbered',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: [{
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [new TextRun({ children: ['Сторінка ', PageNumber.CURRENT, ' з ', PageNumber.TOTAL_PAGES] })],
          })],
        }),
      },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Силабус курсу «Стратегічний менеджмент»')] }),
        new Paragraph({ children: [new TextRun('Kyiv School of Economics, MBA Program, 2026')] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. Загальна інформація')] }),
        new Paragraph({
          children: [
            new TextRun('Курс триває '),
            new TextRun({ text: '10 тижнів', bold: true }),
            new TextRun(' і завершується '),
            new TextRun({ text: 'письмовим іспитом', italics: true }),
            new TextRun('. Викладач: доц. Іваненко.'),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun('Матеріали курсу доступні на '),
            new ExternalHyperlink({
              link: 'https://kse.ua/mba',
              children: [new TextRun({ text: 'сторінці програми', style: 'Hyperlink' })],
            }),
            new TextRun(' (English: course materials are on the program page).'),
          ],
        }),
        new Paragraph({}),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. Результати навчання')] }),
        new Paragraph({ children: [new TextRun('Після завершення курсу студенти зможуть:')] }),
        new Paragraph({ numbering: { reference: 'kse-numbered', level: 0 }, children: [new TextRun('Аналізувати конкурентне середовище компанії.')] }),
        new Paragraph({ numbering: { reference: 'kse-numbered', level: 0 }, children: [new TextRun('Формулювати стратегію розвитку бізнесу.')] }),
        new Paragraph({ numbering: { reference: 'kse-numbered', level: 0 }, children: [new TextRun('Evaluate strategic options using financial metrics.')] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('2.1 Навички')] }),
        new Paragraph({ bullet: { level: 0 }, children: [new TextRun('Командна робота')] }),
        new Paragraph({ bullet: { level: 0 }, children: [new TextRun('Публічні виступи')] }),
        new Paragraph({ bullet: { level: 0 }, children: [new TextRun('Критичне мислення')] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. Розклад занять')] }),
        new Table({
          rows: [
            new TableRow({ children: [cell('Тиждень', { bold: true }), cell('Тема', { bold: true }), cell('Кейс', { bold: true })] }),
            new TableRow({ children: [cell('1'), cell('Вступ до стратегії'), cell('Nova Poshta')] }),
            new TableRow({ children: [cell('2'), cell('Аналіз галузі (Porter Five Forces)'), cell('Monobank')] }),
            new TableRow({
              children: [cell('3'), cell('Ресурсний підхід'), new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({})] })],
            }),
          ],
        }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('4. Оцінювання')] }),
        new Paragraph({
          children: [
            new TextRun('Підсумкова оцінка складається з '),
            new DeletedTextRun({ text: 'трьох', id: 101, author: 'Іваненко', date: FIXED_DATE }),
            new InsertedTextRun({ text: 'чотирьох', id: 102, author: 'Іваненко', date: FIXED_DATE }),
            new TextRun(' компонентів.'),
          ],
        }),
        new Paragraph({ children: [new TextRun('Академічна доброчесність: плагіат неприпустимий.')] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

// Ручна збірка пакета для складних випадків, яких не генерує бібліотека docx.
const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  v: 'urn:schemas-microsoft-com:vml',
};

const TRICKY_DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:w14="${NS.w14}" xmlns:mc="${NS.mc}" xmlns:v="${NS.v}" mc:Ignorable="w14"><w:body>
<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>
<w:p w14:paraId="10000001"><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>Зміст</w:t></w:r></w:p>
<w:p w14:paraId="10000002"><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Вступ</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
</w:sdtContent></w:sdt>
<w:p w14:paraId="10000003"><w:pPr><w:pStyle w:val="a1"/></w:pPr><w:bookmarkStart w:id="0" w:name="_Toc1"/><w:r><w:t>Вступ</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>
<w:p w14:paraId="10000004"><w:r w:rsidR="00A1"><w:t xml:space="preserve">Методи оцінювання: Asse</w:t></w:r><w:proofErr w:type="spellStart"/><w:r w:rsidR="00B2"><w:t>ssment</w:t></w:r><w:proofErr w:type="spellEnd"/><w:r><w:t xml:space="preserve"> та </w:t></w:r><w:smartTag w:uri="urn:test" w:element="place"><w:r><w:t>Київ</w:t></w:r></w:smartTag><w:r><w:t>.</w:t></w:r></w:p>
<w:p w14:paraId="10000005"><w:r><w:t>Колонка А</w:t></w:r><w:r><w:tab/><w:t>Колонка Б</w:t></w:r><w:r><w:br/><w:t>Другий рядок</w:t></w:r></w:p>
<w:p w14:paraId="10000006"><w:r><w:t xml:space="preserve">Дата документа: </w:t></w:r><w:fldSimple w:instr=" DATE \\@ &quot;dd.MM.yyyy&quot; "><w:r><w:t>15.01.2026</w:t></w:r></w:fldSimple></w:p>
<w:p w14:paraId="10000007"><w:r><w:t xml:space="preserve">Сторінка </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
<w:p w14:paraId="10000008"><w:r><w:t xml:space="preserve">Див. примітку</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:t xml:space="preserve"> щодо дедлайнів.</w:t></w:r></w:p>
<w:p w14:paraId="10000009"><w:r><w:t xml:space="preserve">Ім'я студента: </w:t></w:r><w:sdt><w:sdtPr><w:alias w:val="Name"/></w:sdtPr><w:sdtContent><w:r><w:t>Олена</w:t></w:r></w:sdtContent></w:sdt></w:p>
<w:sdt><w:sdtPr><w:alias w:val="Block"/></w:sdtPr><w:sdtContent><w:p w14:paraId="1000000A"><w:r><w:t>Абзац у блоковому контролі вмісту.</w:t></w:r></w:p></w:sdtContent></w:sdt>
<w:p w14:paraId="1000000B"><w:r><w:t xml:space="preserve">Текст із фігурою </w:t></w:r><w:r><w:pict><v:shape id="tb1" style="width:100pt;height:30pt" type="#_x0000_t202"><v:textbox><w:txbxContent><w:p><w:r><w:t>Текст у написі</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r><w:r><w:t xml:space="preserve"> після фігури.</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
<w:tr><w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p w14:paraId="1000000C"><w:r><w:t>Зовнішня клітинка</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p w14:paraId="1000000D"><w:r><w:t>Вкладена клітинка</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p w14:paraId="1000000E"/></w:tc></w:tr>
</w:tbl>
<w:p w14:paraId="1000000F"><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Перший пункт</w:t></w:r></w:p>
<w:p w14:paraId="10000010"><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Другий пункт</w:t></w:r></w:p>
<w:p w14:paraId="10000011"><w:r><w:t xml:space="preserve">Існуюча правка: </w:t></w:r><w:ins w:id="7" w:author="Reviewer" w:date="${FIXED_DATE}"><w:r><w:t>вставлено</w:t></w:r></w:ins><w:del w:id="8" w:author="Reviewer" w:date="${FIXED_DATE}"><w:r><w:delText>видалено</w:delText></w:r></w:del></w:p>
<w:p w14:paraId="10000012"><w:r><w:t>Final paragraph in English with “smart quotes” and a non-breaking space.</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body></w:document>`.replace(/\n/g, '').replace('non-breaking space', 'non-breaking space');

const TRICKY_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${NS.w}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="a1"><w:name w:val="heading 1"/><w:basedOn w:val="a"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="a1"/></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="a"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>`.replace(/\n/g, '');

const TRICKY_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${NS.w}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1)"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const TRICKY_FOOTNOTES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${NS.w}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Дедлайни фіксовані.</w:t></w:r></w:p></w:footnote></w:footnotes>`;

async function buildTricky() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>`.replace(/\n/g, ''));
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`);
  zip.file('word/document.xml', TRICKY_DOCUMENT);
  zip.file('word/styles.xml', TRICKY_STYLES);
  zip.file('word/numbering.xml', TRICKY_NUMBERING);
  zip.file('word/footnotes.xml', TRICKY_FOOTNOTES);
  // Фіксована дата у zip, щоб повторна генерація давала ті самі байти.
  const date = new Date('2026-01-15T10:00:00Z');
  zip.forEach((_, f) => { f.date = date; });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main() {
  const syllabus = await buildSyllabus();
  fs.writeFileSync(path.join(OUT_DIR, 'syllabus.docx'), syllabus);
  fs.writeFileSync(path.join(OUT_DIR, 'tricky.docx'), await buildTricky());
  console.log('syllabus.docx, tricky.docx written');

  // .doc через LibreOffice (якщо встановлено).
  try {
    const { convert } = require('../../../services/document/convert');
    fs.writeFileSync(path.join(OUT_DIR, 'legacy.doc'), await convert(syllabus, 'docx', 'doc'));
    console.log('legacy.doc written');
  } catch (err) {
    console.warn(`legacy.doc skipped: ${err.message}`);
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
