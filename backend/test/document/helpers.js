const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'docx');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name));
}

async function documentXml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

async function partXml(buffer, name) {
  const zip = await JSZip.loadAsync(buffer);
  const f = zip.file(name);
  return f ? f.async('string') : null;
}

function byText(doc, text) {
  const block = doc.blocks.find((b) => b.text === text);
  if (!block) throw new Error(`block not found: ${text}`);
  return block;
}

function texts(doc) {
  return doc.blocks.map((b) => b.text);
}

module.exports = { FIXTURES, fixture, documentXml, partXml, byText, texts };
