const path = require('path');
const fs = require('fs');
const MarkdownIt = require('markdown-it');
const {
  refineRevisionMarkup,
  escapeHtml,
} = require('./revisionMarkup');
const { buildAcceptedState } = require('./applyEdits');
const {
  getCategoryLabel,
  REV_DEL_OPEN,
  REV_DEL_CLOSE,
  REV_ADD_OPEN,
  REV_ADD_CLOSE,
} = require('./constants');

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: true,
  typographer: false,
});

function markdownToHtml(text) {
  return markdown.render(String(text || ''));
}

function splitRevisionSegments(markup) {
  const source = String(markup || '');
  const segments = [];
  let mode = 'same';
  let buffer = '';
  for (let i = 0; i < source.length;) {
    const marker = [REV_DEL_OPEN, REV_DEL_CLOSE, REV_ADD_OPEN, REV_ADD_CLOSE]
      .find((candidate) => source.startsWith(candidate, i));
    if (marker) {
      if (buffer) segments.push({ mode, text: buffer });
      buffer = '';
      if (marker === REV_DEL_OPEN) mode = 'del';
      if (marker === REV_ADD_OPEN) mode = 'add';
      if (marker === REV_DEL_CLOSE || marker === REV_ADD_CLOSE) mode = 'same';
      i += marker.length;
    } else {
      buffer += source[i];
      i += 1;
    }
  }
  if (buffer) segments.push({ mode, text: buffer });
  return segments;
}

function revisionMarkupToMarkdownHtml(markup) {
  return splitRevisionSegments(markup).map((segment) => {
    const html = markdownToHtml(segment.text);
    if (segment.mode === 'add') return `<div class="rev-add">${html}</div>`;
    if (segment.mode === 'del') return `<div class="rev-del">${html}</div>`;
    return html;
  }).join('');
}

/**
 * Render the syllabus PDF for preview and submission. When accepted changes
 * exist, the PDF uses track-changes markup: deletions in red strikethrough
 * and additions in green.
 * Returns the absolute file path. Caller is responsible for cleanup of preview PDFs.
 */
async function renderFinalSyllabusPdf(syllabus, destPath) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('puppeteer is not installed');
  }

  const accepted = buildAcceptedState(syllabus);
  const revisionMarkup = refineRevisionMarkup(syllabus.revisionMarkup || accepted.revisionMarkup || '');
  const editedText = accepted.editedText || syllabus.editedText || syllabus.extractedText || '';
  const course = syllabus.course?.name || syllabus.title || 'Untitled Course';
  const instructor = `${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim();
  const program = syllabus.programId?.name || '';
  const bodyHtml = revisionMarkup
    ? revisionMarkupToMarkdownHtml(revisionMarkup)
    : markdownToHtml(editedText);

  const html = renderHtmlScaffold({ course, instructor, program, bodyHtml });

  const outDir = path.join(__dirname, '../../uploads/pdfs');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = destPath || path.join(outDir, `syllabus_${syllabus._id}_${Date.now()}.pdf`);

  await renderHtmlToPdf(puppeteer, html, filePath);
  return filePath;
}

/**
 * Render a one-rec preview PDF given pre-built revision markup. Caller produces
 * the markup via applyEdits.buildSingleRecPreviewMarkup and passes it here.
 */
async function renderRevisionPdfFromMarkup(markup, meta, destPath) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('puppeteer is not installed');
  }

  const refined = refineRevisionMarkup(markup || '');
  const bodyHtml = refined ? revisionMarkupToMarkdownHtml(refined) : markdownToHtml(meta?.fallbackText || '');
  const course = meta?.course || 'Syllabus preview';
  const instructor = meta?.instructor || '';
  const program = meta?.program || '';
  const html = renderHtmlScaffold({ course, instructor, program, bodyHtml });

  const outDir = path.join(__dirname, '../../uploads/pdfs');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = destPath || path.join(outDir, `preview_${Date.now()}.pdf`);
  await renderHtmlToPdf(puppeteer, html, filePath);
  return filePath;
}

function renderHtmlScaffold({ course, instructor, program, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #111; margin: 40px; line-height: 1.55; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  .meta { font-size: 10pt; color: #555; margin-bottom: 24px; }
  .body { overflow-wrap: anywhere; }
  .body table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
  .body th, .body td { border: 1px solid #d0d5dd; padding: 6px 8px; vertical-align: top; }
  .body th { background: #f2f4f7; font-weight: 700; }
  .body h1, .body h2, .body h3 { margin: 18px 0 8px; line-height: 1.25; }
  .body h1 { font-size: 15pt; }
  .body h2 { font-size: 13pt; }
  .body h3 { font-size: 12pt; }
  .body p { margin: 0 0 8px; }
  .body ul, .body ol { margin: 0 0 10px 22px; padding: 0; }
  .body li { margin: 2px 0; }
  .rev-del { color: #b42318; text-decoration: line-through; text-decoration-thickness: 1.5px; background: #fff1f0; padding: 2px 4px; border-radius: 3px; }
  .rev-add { color: #067647; background: #ecfdf3; font-weight: 600; padding: 2px 4px; border-radius: 3px; }
  .rev-add table, .rev-del table { background: #fff; }
  .rev-add p:last-child, .rev-del p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
<h1>${escapeHtml(course)}</h1>
<div class="meta">${escapeHtml(instructor)}${program ? ` &mdash; ${escapeHtml(program)}` : ''}</div>
<div class="body">${bodyHtml}</div>
</body>
</html>`;
}

async function renderHtmlToPdf(puppeteer, html, filePath) {
  let browser;
  try {
    const launchOpts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: false,
      margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
    });
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Short text report sent to the Academic Director on submission.
 */
function generateSubmissionReport(syllabus) {
  const recsForReport = syllabus.recommendations || [];
  const acceptedForReport = recsForReport.filter((r) => r.decision === 'accepted');
  const rejectedForReport = recsForReport.filter((r) => r.decision === 'rejected');
  const skippedForReport = recsForReport.filter((r) => r.decision === 'skipped' || r.decision === 'pending');
  const criticalForReport = recsForReport.filter((r) => r.priority === 'critical' || r.priority === 'high');
  const acceptedCriticalForReport = acceptedForReport.filter((r) => r.priority === 'critical' || r.priority === 'high');
  const formatReportItem = (r) => `  - ${r.title}${r.category ? ` (${getCategoryLabel(r.category)})` : ''}`;
  const reportLines = [
    `Course: ${syllabus.course?.name || syllabus.title}`,
    `Instructor: ${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim(),
    `Final PDF source: ${syllabus.editedText ? 'confirmed edited syllabus text' : 'original extracted syllabus text'}`,
    '',
    `Issues addressed: ${acceptedForReport.length} accepted, ${rejectedForReport.length} rejected, ${skippedForReport.length} skipped/pending`,
    '',
    'Critical/high items found:',
    ...(criticalForReport.length ? criticalForReport.map(formatReportItem) : ['  - None']),
    '',
    'Critical/high items fixed:',
    ...(acceptedCriticalForReport.length ? acceptedCriticalForReport.map(formatReportItem) : ['  - None']),
  ];
  if (rejectedForReport.length) {
    reportLines.push('', 'Items the instructor declined:', ...rejectedForReport.map(formatReportItem));
  }
  return reportLines.join('\n');
}

module.exports = {
  renderFinalSyllabusPdf,
  renderRevisionPdfFromMarkup,
  generateSubmissionReport,
};
