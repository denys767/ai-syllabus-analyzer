// DOCX → DocModel: обхід word/document.xml у порядку тіла, один блок на непорожній w:p.

const {
  W_NS, W14_NS, isW, wChild, wChildren, wAttr, closestW,
  loadPackage, readPart, parseXml, bodyOf, bodyParagraphs, readStyles, readNumbering,
  classifyParagraph, flattenParagraph,
} = require('../ooxml');
const { computeDocVersion, formatBlockId } = require('../model');

function isTocSdt(sdt) {
  const gallery = wAttr(wChild(wChild(wChild(sdt, 'sdtPr'), 'docPartObj'), 'docPartGallery'), 'val');
  return Boolean(gallery && /table of contents/i.test(gallery));
}

function insideTocSdt(p, body) {
  for (let n = p.parentNode; n && n !== body; n = n.parentNode) if (isW(n, 'sdt') && isTocSdt(n)) return true;
  return false;
}

function readOnlyReason(p, flat, cls, body) {
  if (cls.isToc || insideTocSdt(p, body)) return 'toc';
  if (flat.flags.field) return 'field';
  if (flat.flags.revision) return 'tracked-change';
  if (flat.flags.lockedSdt) return 'locked-content-control';
  if (flat.flags.complex) return 'complex-content';
  return null;
}

/** Контекст для абзаців у таблицях: індекс таблиці (pre-order), рядок, стовпець. */
function cellPosition(tc, tableIndex) {
  const tr = tc.parentNode;
  const tbl = tr.parentNode;
  return {
    table: tableIndex.get(tbl),
    row: wChildren(tbl, 'tr').indexOf(tr),
    col: wChildren(tr, 'tc').indexOf(tc),
  };
}

/**
 * Будує DocModel з .docx.
 * Порожні абзаци поза таблицями пропускаються (це відступи). Порожній абзац, що є
 * єдиним у клітинці, лишається блоком, щоб модель могла заповнити клітинку.
 * Написи (w:txbxContent), колонтитули і виноски в v1 не витягуються.
 * @param {Buffer} buffer
 * @returns {Promise<import('../model').DocModel>}
 */
async function extractDocx(buffer) {
  const { zip, xml } = await loadPackage(buffer);
  const dom = parseXml(xml, 'document.xml');
  const styles = readStyles(await readPart(zip, 'word/styles.xml'));
  const numbering = readNumbering(await readPart(zip, 'word/numbering.xml'));
  const body = bodyOf(dom);

  const tableIndex = new Map(Array.from(body.getElementsByTagNameNS(W_NS, 'tbl')).map((t, i) => [t, i]));
  const paragraphs = bodyParagraphs(dom);
  const blocks = [];
  let hasTrackedChanges = false;
  let sectionId;

  paragraphs.forEach((p, paraIndex) => {
    if (closestW(p, 'txbxContent', body)) return;
    const flat = flattenParagraph(p);
    if (flat.flags.revision) hasTrackedChanges = true;
    const tc = closestW(p, 'tc', body);
    if (!flat.text.trim()) {
      const onlyInCell = tc && wChildren(tc, 'p').length === 1 && wChildren(tc, 'p')[0] === p;
      if (!onlyInCell) return;
    }

    const cls = classifyParagraph(p, styles, numbering);
    const id = formatBlockId(blocks.length + 1);
    const block = { id, kind: tc ? 'table-cell' : cls.kind, text: flat.text };
    if (cls.level != null) block.level = cls.level;
    if (cls.listFormat) block.listFormat = cls.listFormat;
    if (cls.style) block.style = cls.style;
    if (block.kind === 'heading') sectionId = id;
    if (sectionId) block.sectionId = sectionId;
    const reason = readOnlyReason(p, flat, cls, body);
    if (reason) {
      block.readOnly = true;
      block.readOnlyReason = reason;
    }
    if (tc) block.cell = cellPosition(tc, tableIndex);
    const paraId = p.getAttributeNS(W14_NS, 'paraId');
    block.locator = { docx: paraId ? { paraIndex, paraId } : { paraIndex } };
    blocks.push(block);
  });

  return {
    format: 'docx',
    docVersion: computeDocVersion(buffer),
    blocks,
    meta: { paragraphCount: paragraphs.length, hasTrackedChanges },
  };
}

module.exports = { extractDocx };
