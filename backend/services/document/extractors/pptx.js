const { computeDocVersion, formatBlockId } = require('../model');
const { readPart, docError } = require('../ooxml');
const { A, all, child, parse, relationships, loadPptx, paragraphText, slideParagraphs } = require('../pptxXml');

async function extractPptx(buffer) {
  const { zip, slides } = await loadPptx(buffer);
  const blocks = [];
  for (const [index, slidePart] of slides.entries()) {
    const start = blocks.length;
    const dom = parse(await readPart(zip, slidePart), slidePart);
    const entries = slideParagraphs(dom);
    const add = (entry, notes = false, notesPart) => {
      const text = paragraphText(entry.p);
      if (!text.trim()) return;
      const block = {
        id: formatBlockId(blocks.length + 1),
        kind: notes ? 'notes' : entry.cell ? 'table-cell' : entry.title ? 'slide-title' : 'slide-text',
        text,
        locator: { slide: index + 1, slidePart, shapeId: entry.shapeId, paraIndex: entry.paraIndex },
      };
      if (entry.cell) { block.cell = entry.cell; block.locator.cell = entry.cell; }
      if (notesPart) block.locator.notesPart = notesPart;
      const props = child(entry.p, A, 'pPr');
      if (props?.hasAttribute('lvl')) block.level = Number(props.getAttribute('lvl')) + 1;
      if (child(props, A, 'buChar')) block.listFormat = 'bullet';
      if (child(props, A, 'buAutoNum')) block.listFormat = 'decimal';
      if (notes || all(entry.p, A, 'fld').length) {
        block.readOnly = true;
        block.readOnlyReason = notes ? 'notes' : 'field';
      }
      blocks.push(block);
    };
    entries.filter((e) => e.title).forEach((e) => add(e));
    entries.filter((e) => !e.title).forEach((e) => add(e));
    const rels = await relationships(zip, slidePart);
    for (const rel of rels.values()) {
      if (!rel.type.endsWith('/notesSlide')) continue;
      const xml = await readPart(zip, rel.part);
      if (!xml) throw docError('Відсутня частина нотаток PPTX', 422, 'INVALID_PPTX');
      slideParagraphs(parse(xml, rel.part)).filter((e) => !['dt', 'ftr', 'hdr', 'sldNum', 'sldImg'].includes(e.placeholder))
        .forEach((e) => add(e, true, rel.part));
    }
    const sectionId = blocks.slice(start).find((b) => b.kind === 'slide-title')?.id;
    if (sectionId) blocks.slice(start).forEach((b) => { b.sectionId = sectionId; });
  }
  return { format: 'pptx', docVersion: computeDocVersion(buffer), blocks, meta: { slideCount: slides.length } };
}
module.exports = { extractPptx };
