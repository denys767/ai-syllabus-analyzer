// Серверний сканер фактів для proposedValues (CLAUDE.md §0, ТЗ §4 «Механіка proposed_values»).
// Будь-яке число, відсоток, тривалість, дата, час або назва в лапках у чернетці моделі, яких немає
// в репліках викладача і в довідниках, мусить потрапити в proposedValues — навіть якщо модель їх не вказала.

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const UNITS = 'hours?|hrs?|h|days?|weeks?|months?|minutes?|mins?|points?|pts?|ac(?:ademic)?\\.? hours?|ects|credits?|percent|%|times|slides?|pages?|words?';
const NUM = '\\d+(?:[.,]\\d+)?';
const WORDNUM = `(?:${Object.keys(NUMBER_WORDS).join('|')})(?:[- ](?:${Object.keys(NUMBER_WORDS).join('|')}))?`;
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

// Порядок важливий: довші шаблони раніше, щоб «48 hours» не розпалось на «48»
const PATTERNS = [
  { label: 'Date', re: new RegExp(`\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}\\b|\\b(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:${MONTHS})(?:,? \\d{4})?\\b`, 'gi') },
  { label: 'Time', re: /\b\d{1,2}[:.]\d{2}\s?(?:[–-]\s?\d{1,2}[:.]\d{2})?\s?(?:am|pm)?\b/gi },
  { label: 'Percentage', re: new RegExp(`\\b${NUM}\\s?%|\\b${NUM} percent\\b|\\b${WORDNUM} percent\\b`, 'gi') },
  { label: 'Quantity', re: new RegExp(`\\b(?:${NUM}|${WORDNUM})(?:\\s?[-–]\\s?(?:${NUM}))?[- ](?:${UNITS})\\b`, 'gi') },
  { label: 'Title', re: /“[^”]{3,120}”|"[^"]{3,120}"|«[^»]{3,120}»/g },
  { label: 'Number', re: new RegExp(`\\b${NUM}\\b`, 'g') },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[“”"«»]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

/** Числа, які містить фрагмент (для порівняння «48 hours» з «48-hour» у репліці викладача). */
function numbersOf(text) {
  const t = norm(text);
  const digits = t.match(/\d+(?:[.,]\d+)?/g) || [];
  const words = (t.match(new RegExp(WORDNUM, 'gi')) || []).map((w) => w.split(/[- ]/).reduce((sum, part) => sum + (NUMBER_WORDS[part] || 0), 0));
  return [...digits.map((d) => d.replace(',', '.')), ...words.map(String)];
}

/**
 * Знаходить факти в тексті чернетки, яких немає в корпусі відомого (репліки викладача, довідники, поточний стан).
 * @param {string} text чернетка моделі
 * @param {{ known?: string[] }} opts known — тексти, з яких факт вважається вже названим
 * @returns {{ id: string, label: string, value: string }[]} у порядку появи, без дублікатів
 */
function scanFacts(text, { known = [] } = {}) {
  const src = String(text || '');
  const corpus = norm(known.join('\n'));
  const corpusNumbers = new Set(numbersOf(corpus));
  const taken = [];
  const found = [];
  for (const { label, re } of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const start = m.index; const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      const value = m[0].trim();
      const v = norm(value);
      if (corpus.includes(v)) continue;
      // Факт уже названо, якщо всі його числа є в корпусі (для назв — лише точний збіг)
      const nums = numbersOf(value);
      if (label !== 'Title' && nums.length && nums.every((n) => corpusNumbers.has(n))) continue;
      if (found.some((f) => norm(f.value) === v)) continue;
      found.push({ start, label, value });
    }
  }
  return found.sort((a, b) => a.start - b.start).map(({ label, value }, i) => ({ id: `v${i + 1}`, label, value }));
}

/**
 * Об'єднує значення, які назвала модель, зі знайденими сканером. Модельні мають пріоритет за підписом.
 * Повертає proposedValues для Suggestion.draft (усі confirmed: false).
 */
function mergeProposedValues(modelValues = [], scanned = []) {
  const out = [];
  const seen = new Set();
  for (const v of [...modelValues, ...scanned]) {
    const key = norm(v.value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `v${out.length + 1}`, label: v.label || 'Value', value: String(v.value), path: v.path || null, confirmed: false });
  }
  return out;
}

/**
 * Будує шаблон {{id}} з тексту: кожне входження значення proposedValues замінюється плейсхолдером.
 * Потрібен для «Change the value» без повторного виклику LLM.
 */
function toTemplate(text, proposedValues) {
  let template = String(text || '');
  for (const pv of [...proposedValues].sort((a, b) => b.value.length - a.value.length)) {
    if (!pv.value) continue;
    template = template.split(pv.value).join(`{{${pv.id}}}`);
  }
  return template;
}

/** Підставляє значення в шаблон. Невідомі плейсхолдери лишаються як є. */
function renderTemplate(template, proposedValues) {
  const byId = new Map(proposedValues.map((pv) => [pv.id, pv.value]));
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (all, id) => (byId.has(id) ? byId.get(id) : all));
}

module.exports = { scanFacts, mergeProposedValues, toTemplate, renderTemplate, numbersOf };
