#!/usr/bin/env node
// Ручний OOXML: силабус, таблиця, група, змішані run-и та нотатки. Запуск з backend.
const fs = require('fs/promises');
const JSZip = require('jszip');
const { P, A } = require('../../../services/document/pptxXml');
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = (items) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const r = (text, props = '') => `<a:r><a:rPr lang="uk-UA" sz="2200" ${props}><a:latin typeface="DejaVu Sans"/></a:rPr><a:t>${text}</a:t></a:r>`;
const p = (text, bullet = false) => `<a:p><a:pPr${bullet ? ' marL="342900" indent="-285750"' : ''}>${bullet ? '<a:buChar char="•"/>' : ''}</a:pPr>${r(text)}<a:endParaRPr lang="uk-UA"/></a:p>`;
const shape = (id, text, { title = false, y = 1500000, raw = false } = {}) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr>${title ? '<p:ph type="title"/>' : ''}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="600000" y="${y}"/><a:ext cx="7800000" cy="2500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${raw ? text : p(text)}</p:txBody></p:sp>`;
const groupProps = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="5143500"/><a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="5143500"/></a:xfrm></p:grpSpPr>';
const slide = (content) => `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree>${groupProps}${content}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
const title = (text) => shape(2, `<a:p>${r(text, 'b="1" sz_dummy="unused"'.replace(' sz_dummy="unused"', ''))}</a:p>`, { title: true, y: 300000, raw: true });
async function main() {
  const zip = new JSZip();
  const schedule = [['Тиждень', 'Тема', 'Кейс'], ['1', 'Вступ до стратегії', 'Nova Poshta'], ['2', 'Аналіз галузі', 'Monobank']];
  const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Schedule"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="600000" y="1500000"/><a:ext cx="7800000" cy="2400000"/></p:xfrm><a:graphic><a:graphicData uri="${A}/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="1500000"/><a:gridCol w="3800000"/><a:gridCol w="2500000"/></a:tblGrid>${schedule.map((row) => `<a:tr h="800000">${row.map((text) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${p(text)}</a:txBody><a:tcPr/></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const contents = [
    title('Силабус: Стратегічний менеджмент') + shape(3, 'Kyiv School of Economics — MBA 2026'),
    // Текст перед заголовком навмисно: extractor має поставити title першим.
    shape(3, p('Мета та результати навчання', true) + p('Командна робота', true) + p('Оцінювання та політики', true), { raw: true }) + title('План курсу'),
    title('Розклад занять') + table,
    title('Оцінювання') + shape(3, `<a:p><a:pPr/>${r('Курс триває ', 'b="1"')}${r('10 тижнів', 'i="1"')}${r(' і має іспит.')}<a:endParaRPr lang="uk-UA"/></a:p>`, { raw: true })
      + `<p:grpSp>${groupProps.replace('id="1"', 'id="4"')}${shape(5, 'Academic integrity: плагіат заборонено.', { y: 3600000 })}</p:grpSp>`,
  ];
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  // Нумерація частин навмисно не збігається з порядком презентації.
  const numbers = [3, 1, 4, 2];
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:sldIdLst>${numbers.map((n, i) => `<p:sldId id="${256 + i}" r:id="rId${n}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', rels(numbers.map((n) => [`rId${n}`, 'slide', `slides/slide${n}.xml`])));
  contents.forEach((content, i) => zip.file(`ppt/slides/slide${numbers[i]}.xml`, slide(content)));
  zip.file('ppt/slides/_rels/slide2.xml.rels', rels([['notes', 'notesSlide', '../notesSlides/notesSlide1.xml']]));
  zip.file('ppt/notesSlides/notesSlide1.xml', `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${groupProps}${shape(2, 'Нотатки викладача: обговорити кейс українською.')}</p:spTree></p:cSld></p:notes>`);
  zip.file('ppt/notesSlides/_rels/notesSlide1.xml.rels', rels([['slide', 'slide', '../slides/slide2.xml']]));
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${numbers.map((n) => `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`);
  await fs.writeFile(`${__dirname}/syllabus.pptx`, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
