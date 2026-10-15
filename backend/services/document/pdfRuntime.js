const { Worker } = require('worker_threads');
const path = require('path');
const { docError } = require('./ooxml');
function readPdf(buffer, { annotations = false, timeoutMs = 120000 } = {}) {
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
    const timer = setTimeout(() => finish(docError('Обробка PDF перевищила ліміт часу', 504, 'PDF_TIMEOUT')), timeoutMs);
    worker.on('message', (m) => finish(m.error ? docError(`Не вдалося прочитати PDF: ${m.error.message}`, 422, 'INVALID_PDF') : null, m.pages));
    worker.on('error', (e) => finish(docError(`Не вдалося прочитати PDF: ${e.message}`, 422, 'INVALID_PDF')));
    worker.on('exit', (code) => { if (!settled) finish(docError(`Обробка PDF перервалася (${code})`, 422, 'INVALID_PDF')); });
  });
}
module.exports = { readPdf };
