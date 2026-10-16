// Конвертації через LibreOffice headless: .doc → .docx, docx/doc/odt → pdf.
// Кожна задача отримує окремий профіль (-env:UserInstallation) і тимчасовий каталог,
// задачі виконуються через чергу в процесі (за замовчуванням по одній).

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const DEFAULT_TIMEOUT_MS = Number(process.env.SOFFICE_TIMEOUT_MS) || 120000;
const CANDIDATES = ['/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/lib/libreoffice/program/soffice',
  '/opt/libreoffice/program/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];

const FILTERS = {
  docx: 'docx:MS Word 2007 XML',
  doc: 'doc:MS Word 97',
  pdf: 'pdf:writer_pdf_Export',
};

function httpError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

let cachedPath;
function findSoffice() {
  if (process.env.SOFFICE_PATH) return fs.existsSync(process.env.SOFFICE_PATH) ? process.env.SOFFICE_PATH : null;
  if (cachedPath !== undefined) return cachedPath;
  const fromPath = (process.env.PATH || '').split(path.delimiter)
    .flatMap((dir) => ['soffice', 'libreoffice'].map((bin) => path.join(dir, bin)));
  cachedPath = [...CANDIDATES, ...fromPath].find((p) => fs.existsSync(p)) || null;
  return cachedPath;
}

function isAvailable() {
  return Boolean(findSoffice());
}

// Проста черга з обмеженням паралельності.
function createQueue(concurrency) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= concurrency || waiting.length === 0) return;
    active += 1;
    const { job, resolve, reject } = waiting.shift();
    Promise.resolve().then(job).then(resolve, reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return {
    push(job) {
      return new Promise((resolve, reject) => {
        waiting.push({ job, resolve, reject });
        next();
      });
    },
    get size() { return waiting.length + active; },
  };
}

const queue = createQueue(Math.max(1, Number(process.env.SOFFICE_CONCURRENCY) || 1));

function runSoffice(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    // detached: soffice запускає дочірній soffice.bin, вбивати треба всю групу.
    const child = spawn(bin, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(httpError(`Не вдалося запустити LibreOffice: ${err.message}`, 503, 'SOFFICE_FAILED'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(httpError('Конвертація документа перевищила ліміт часу', 504, 'CONVERSION_TIMEOUT', { retryable: true }));
      } else {
        resolve({ code, output: output.slice(-2000) });
      }
    });
  });
}

/**
 * Конвертує buffer з формату inExt у targetExt ('docx' | 'doc' | 'pdf').
 * exportComments (лише для pdf): коментарі Word стають анотаціями PDF.
 * @returns {Promise<Buffer>}
 */
function convert(buffer, inExt, targetExt, { timeoutMs = DEFAULT_TIMEOUT_MS, exportComments = false } = {}) {
  const bin = findSoffice();
  if (!bin) {
    return Promise.reject(httpError(
      'LibreOffice не встановлено на сервері: конвертація документів недоступна',
      503, 'SOFFICE_MISSING',
    ));
  }
  let filter = FILTERS[targetExt];
  // Коментарі Word → анотації PDF (ExportNotesInMargin у headless LibreOffice 25.2 падає з I/O-помилкою).
  if (filter && targetExt === 'pdf' && exportComments) filter += ':{"ExportNotes":{"type":"boolean","value":"true"}}';
  if (!filter) return Promise.reject(httpError(`Непідтримуваний формат конвертації: ${targetExt}`, 400, 'BAD_TARGET'));
  const ext = String(inExt || '').replace(/^\./, '').toLowerCase();

  return queue.push(async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kse-lo-'));
    try {
      const input = path.join(dir, `input.${ext}`);
      const outDir = path.join(dir, 'out');
      const profile = pathToFileURL(path.join(dir, `profile-${crypto.randomUUID()}`)).href;
      await fsp.writeFile(input, buffer);
      const { code, output } = await runSoffice(bin, [
        `-env:UserInstallation=${profile}`,
        '--headless', '--invisible', '--norestore', '--nolockcheck', '--nodefault', '--nofirststartwizard',
        '--convert-to', filter, '--outdir', outDir, input,
      ], timeoutMs);
      const outFile = path.join(outDir, `input.${targetExt}`);
      if (!fs.existsSync(outFile)) {
        throw httpError('Не вдалося сконвертувати документ', 422, 'CONVERSION_FAILED', { exitCode: code, details: output });
      }
      return await fsp.readFile(outFile);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

const docToDocx = (buffer, opts) => convert(buffer, 'doc', 'docx', opts);
const toPdf = (buffer, ext = 'docx', opts) => convert(buffer, ext, 'pdf', opts);

module.exports = { convert, docToDocx, toPdf, isAvailable, findSoffice, createQueue };
