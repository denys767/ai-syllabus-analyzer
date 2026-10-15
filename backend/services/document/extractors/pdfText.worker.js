// Окремий процес для pdf-parse (pdfjs): читає PDF зі stdin, пише { text } або { error } у stdout.
// pdfjs використовує dynamic import, тож в ізольованому процесі він працює і під Jest,
// а збій чи витік пам'яті на кривому PDF не зачіпає сервер.

const { PDFParse } = require('pdf-parse');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  const parser = new PDFParse({ data: Buffer.concat(chunks) });
  try {
    const result = await parser.getText();
    process.stdout.write(JSON.stringify({ text: String(result?.text || '') }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: String(err?.message || err) }));
  } finally {
    await parser.destroy().catch(() => {});
  }
});
