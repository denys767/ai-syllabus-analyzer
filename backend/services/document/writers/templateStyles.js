// Стилі шаблонного .docx. Брендований шаблон KSE ще не готовий — після його появи міняються лише значення тут.
const FONT = 'Calibri';
const COLORS = {
  heading: '1F3864',
  text: '000000',
  muted: '595959',
  tableHeaderFill: 'D9E2F3',
  tableLabelFill: 'F2F2F2',
  border: '8EAADB',
  link: '0563C1',
};
// Підсвітка плейсхолдерів (поле, яке ще треба заповнити)
const PLACEHOLDER_HIGHLIGHT = 'yellow';

// Розміри в half-points (docx) і DXA (1/20 pt)
const SIZES = { body: 22, title: 40, h1: 32, h2: 26, h3: 24, table: 20 };
const PAGE = { width: 11906, height: 16838, margin: 1134 }; // A4
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

// Частки ширини колонок (сума 1)
const COLUMN_FRACTIONS = {
  glance: [0.3, 0.7],
  matrix: [0.4, 0.35, 0.25],
  schedule: [0.17, 0.3, 0.1, 0.1, 0.13, 0.2],
  assessment: [0.22, 0.1, 0.48, 0.2],
  instructor: [0.25, 0.75],
};
const columnWidths = (key) => {
  const widths = COLUMN_FRACTIONS[key].map((f) => Math.round(CONTENT_WIDTH * f));
  widths[widths.length - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
  return widths;
};

module.exports = { FONT, COLORS, PLACEHOLDER_HIGHLIGHT, SIZES, PAGE, CONTENT_WIDTH, columnWidths };
