// Растеризація лише запитаних сторінок: та сама модель черги й ізоляції, що в convert.js.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { toPdf, createQueue } = require('./convert');
const { docError } = require('./ooxml');
const rasterQueue = createQueue(1);
function pageNumbers(pages) {
  if (!Array.isArray(pages) || pages.some((n) => !Number.isInteger(n) || n < 1)) throw docError('Номери сторінок мають бути додатними цілими числами', 400, 'BAD_PAGES');
  return [...new Set(pages)].sort((a, b) => a - b);
}
function raster(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftoppm', args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let details = ''; let timedOut = false;
    child.stderr.on('data', (d) => { details = (details + d).slice(-2000); });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
    }, timeoutMs);
    child.on('error', () => { clearTimeout(timer); reject(docError('Не вдалося запустити pdftoppm для прев’ю PDF', 503, 'PDF_RENDER_MISSING')); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(docError('Рендеринг PDF перевищив ліміт часу', 504, 'PDF_RENDER_TIMEOUT', { retryable: true }));
      else if (code !== 0) reject(docError('Не вдалося створити прев’ю PDF', 422, 'PDF_RENDER_FAILED', { details }));
      else resolve();
    });
  });
}
/** @returns {Promise<Array<{page: number, png: Buffer}>>} сторінки нумеруються від 1. */
async function pdfToPng(pdfBuffer, pages, { timeoutMs = 120000 } = {}) {
  const requested = pageNumbers(pages);
  if (!requested.length) return [];
  return rasterQueue.push(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kse-png-'));
    try {
      const input = path.join(dir, 'input.pdf');
      await fs.writeFile(input, pdfBuffer);
      const results = [];
      for (const page of requested) {
        const prefix = path.join(dir, `page-${page}`);
        await raster(['-png', '-r', '80', '-f', String(page), '-l', String(page), '-singlefile', input, prefix], timeoutMs);
        let png;
        try { png = await fs.readFile(`${prefix}.png`); } catch (_) { throw docError('Сторінка PDF відсутня', 422, 'PDF_RENDER_FAILED'); }
        results.push({ page, png });
      }
      return results;
    } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  });
}
async function renderPptxPreview(originalBuffer, editedBuffer, changedSlides) {
  const pages = pageNumbers(changedSlides);
  if (!pages.length) return { slides: [] };
  const beforePdf = await toPdf(originalBuffer, 'pptx');
  const afterPdf = await toPdf(editedBuffer, 'pptx');
  const before = await pdfToPng(beforePdf, pages);
  const after = await pdfToPng(afterPdf, pages);
  return { slides: pages.map((slide, i) => ({ slide, before: before[i].png, after: after[i].png })) };
}
module.exports = { pdfToPng, renderPptxPreview };
