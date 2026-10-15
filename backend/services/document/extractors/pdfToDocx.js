// PDF → простий .docx: текст (pdf-parse) → абзаци за евристиками → синтезований DOCX (бібліотека docx).
// Форматування оригіналу не зберігається: це лише робоча копія, щоб PDF ішов тим самим
// шляхом, що й DOCX (блоки, ops, tracked changes). Повноцінний PDF-екстрактор — фаза 5.

const path = require('path');
const { execFile } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType,
} = require('docx');
const { docError } = require('../ooxml');

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const PAGE_MARKER = /^-- \d+ of \d+ --$/;
const PAGE_NUMBER_LINE = /^(?:(?:сторінка|стор\.|page)\s*\d+(?:\s*(?:з|із|of|\/)\s*\d+)?|\d{1,3}|\d+\s*\/\s*\d+)$/i;
const BULLET_RE = /^[●•▪◦○■□►▸‣⁃∙·\-–—*]\s+(.*)$/;
const NUMBERED_RE = /^(\d+|[a-zа-я])[.)]\s+(.*)$/i;
const HEADING_NUM_RE = /^((?:\d+\.)+\d*)\s+(\S.*)$/;
const TERMINAL = /[.!?:;,]$/;

const HEADINGS = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

const PDF_TIMEOUT_MS = Number(process.env.PDF_EXTRACT_TIMEOUT_MS) || 60000;
const WORKER = path.join(__dirname, 'pdfText.worker.js');

/** Текст PDF через pdf-parse в окремому процесі (див. pdfText.worker.js). */
function extractPdfText(buffer) {
  const invalid = () => docError('Не вдалося прочитати PDF. Перевірте, що файл не пошкоджений і не захищений паролем.', 422, 'INVALID_PDF');
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [WORKER], {
      timeout: PDF_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
    }, (err, stdout) => {
      if (err && err.killed) {
        return reject(docError('Читання PDF триває задовго. Спробуйте завантажити DOCX.', 504, 'PDF_TIMEOUT', { retryable: true }));
      }
      let parsed;
      try { parsed = JSON.parse(stdout); } catch { return reject(invalid()); }
      if (!parsed || parsed.error != null || typeof parsed.text !== 'string') return reject(invalid());
      resolve(parsed.text);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}

function isAllCapsHeading(line) {
  const letters = line.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && line.length <= 80 && letters === letters.toUpperCase()
    && letters !== letters.toLowerCase() && !TERMINAL.test(line);
}

/** Класифікує окремий рядок: заголовок, пункт списку чи початок/продовження абзацу. */
function classifyLine(line) {
  const heading = HEADING_NUM_RE.exec(line);
  if (heading && line.length <= 90 && !TERMINAL.test(line)) {
    const depth = heading[1].split('.').filter(Boolean).length;
    return { kind: 'heading', level: Math.min(depth, 6), text: line };
  }
  const bullet = BULLET_RE.exec(line);
  if (bullet && bullet[1].trim()) return { kind: 'list-item', listFormat: 'bullet', text: bullet[1].trim() };
  const numbered = NUMBERED_RE.exec(line);
  if (numbered && numbered[2].trim()) return { kind: 'list-item', listFormat: 'decimal', text: numbered[2].trim() };
  if (isAllCapsHeading(line)) return { kind: 'heading', level: 1, text: line };
  return { kind: 'paragraph', text: line };
}

function startsLowercase(line) {
  return /^[\p{Ll}]/u.test(line) || /^[(«"'“,]/.test(line);
}

/**
 * Розбиває текст PDF на абзаци. Евристики:
 * порожній рядок — межа абзацу; рядки-маркери сторінок і номери сторінок прибираються;
 * нумеровані короткі рядки без крапки в кінці («1. Вступ», «2.1 Навички») і короткі рядки
 * ВЕЛИКИМИ ЛІТЕРАМИ — заголовки; «•», «-», «1.» — пункти списку; рядок без кінцевого розділового
 * знака, після якого йде рядок з малої літери (або попередній рядок довгий), продовжує абзац.
 * Перший короткий абзац документа без кінцевої крапки стає назвою (Title).
 * @returns {{kind: 'heading'|'paragraph'|'list-item', text: string, level?: number, listFormat?: string}[]}
 */
function paragraphsFromText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '')
    .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim());
  const content = lines.filter((l) => l && !PAGE_MARKER.test(l) && !PAGE_NUMBER_LINE.test(l));
  const maxLen = content.reduce((m, l) => Math.max(m, l.length), 0);
  const longLine = Math.max(40, Math.floor(maxLen * 0.7));

  const out = [];
  let current = null;
  let currentLastLine = '';
  const flush = () => {
    if (current && current.text.trim()) out.push(current);
    current = null;
  };

  for (const raw of lines) {
    if (!raw || PAGE_MARKER.test(raw)) {
      flush();
      continue;
    }
    if (PAGE_NUMBER_LINE.test(raw)) continue;

    const cls = classifyLine(raw);
    const canContinue = current && current.kind !== 'heading'
      && !TERMINAL.test(currentLastLine)
      && cls.kind === 'paragraph'
      && (startsLowercase(raw) || currentLastLine.length >= longLine);
    const titleContinues = current && current.kind === 'heading' && current.level === 0
      && !TERMINAL.test(currentLastLine) && cls.kind === 'paragraph' && startsLowercase(raw);

    if (canContinue || titleContinues) {
      current.text = current.text.endsWith('-') && /^\p{Ll}/u.test(raw)
        ? current.text.slice(0, -1) + raw
        : `${current.text} ${raw}`;
      currentLastLine = raw;
      continue;
    }

    flush();
    current = { ...cls };
    if (!out.length && cls.kind === 'paragraph' && raw.length <= 120 && !TERMINAL.test(raw)) {
      current = { kind: 'heading', level: 0, text: raw };
    }
    currentLastLine = raw;
  }
  flush();
  return out;
}

/**
 * Синтезує .docx з абзаців: заголовки — стилі Title/Heading N, списки — нумерація Word
 * (кожна суцільна нумерована серія починається з 1).
 * @returns {Promise<Buffer>}
 */
async function synthesizeDocx(paragraphs, { title } = {}) {
  let instance = 0;
  let prevNumbered = false;
  const children = paragraphs.map((p) => {
    const run = [new TextRun(p.text)];
    const numbered = p.kind === 'list-item' && p.listFormat !== 'bullet';
    if (numbered && !prevNumbered) instance += 1;
    prevNumbered = numbered;
    if (p.kind === 'heading') return new Paragraph({ heading: HEADINGS[Math.min(p.level || 0, 6)], children: run });
    if (p.kind === 'list-item' && p.listFormat === 'bullet') return new Paragraph({ bullet: { level: 0 }, children: run });
    if (numbered) return new Paragraph({ numbering: { reference: 'pdf-numbered', level: 0, instance }, children: run });
    return new Paragraph({ children: run });
  });
  const doc = new Document({
    creator: 'KSE Syllabus Analyzer',
    title: title || 'Syllabus',
    numbering: {
      config: [{
        reference: 'pdf-numbered',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: [{ children: children.length ? children : [new Paragraph({})] }],
  });
  return Packer.toBuffer(doc);
}

/** PDF → .docx (Buffer). Порожній текст (скан) → 422 PDF_NO_TEXT. */
async function pdfToDocx(buffer, opts = {}) {
  const text = await extractPdfText(buffer);
  const paragraphs = paragraphsFromText(text);
  if (!paragraphs.length) {
    throw docError('У PDF не знайдено тексту (можливо, це скан). Завантажте DOCX або PDF з текстовим шаром.', 422, 'PDF_NO_TEXT');
  }
  return synthesizeDocx(paragraphs, opts);
}

module.exports = { pdfToDocx, extractPdfText, paragraphsFromText, synthesizeDocx };
