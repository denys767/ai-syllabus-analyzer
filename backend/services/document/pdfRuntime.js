const { Worker } = require('worker_threads');
const path = require('path');
const { docError } = require('./ooxml');

const PDF_TIMEOUT_MS = Number(process.env.PDF_EXTRACT_TIMEOUT_MS) || 120000;

function readPdf(buffer, { annotations = false, timeoutMs = PDF_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdfWorker.js'), { workerData: { buffer, annotations } });
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (err) reject(err); else resolve(result);
    };
    const timer = setTimeout(() => finish(docError('Читання PDF триває задовго. Спробуйте завантажити DOCX.', 504, 'PDF_TIMEOUT', { retryable: true })), timeoutMs);
    worker.on('message', (m) => finish(m.error ? docError(`Не вдалося прочитати PDF: ${m.error.message}`, 422, 'INVALID_PDF') : null, m.pages));
    worker.on('error', (e) => finish(docError(`Не вдалося прочитати PDF: ${e.message}`, 422, 'INVALID_PDF')));
    worker.on('exit', (code) => { if (!settled) finish(docError(`Обробка PDF перервалася (${code})`, 422, 'INVALID_PDF')); });
  });
}
module.exports = { readPdf };
