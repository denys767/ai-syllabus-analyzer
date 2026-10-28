// Мінімальний OOXML-файл для моків: ZIP без стиснення, без сторонніх залежностей.
// Продакшн завжди отримує брендований файл від бекенду.
const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  });
  return (crc ^ 0xffffffff) >>> 0;
};
const header = (size, fields) => {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  fields.forEach(([offset, value, width = 4]) => width === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value, true));
  return bytes;
};
export function mockDocx(sections) {
  const p = (text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('Mock syllabus — for UI testing')}${sections.map((s) => p(s.title) + s.blocks.map((b) => p(b.text)).join('')).join('')}<w:sectPr/></w:body></w:document>`,
  };
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  let offset = 0;
  Object.entries(files).forEach(([path, text]) => {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);
    chunks.push(header(30, [[0, 0x04034b50], [4, 20, 2], [14, crc], [18, data.length], [22, data.length], [26, name.length, 2]]), name, data);
    directory.push(header(46, [[0, 0x02014b50], [4, 20, 2], [6, 20, 2], [16, crc], [20, data.length], [24, data.length], [28, name.length, 2], [42, offset]]), name);
    offset += 30 + name.length + data.length;
  });
  const directorySize = directory.reduce((sum, bytes) => sum + bytes.length, 0);
  return new Blob([...chunks, ...directory, header(22, [[0, 0x06054b50], [8, 3, 2], [10, 3, 2], [12, directorySize], [16, offset]])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
