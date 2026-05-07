const path = require('path');
const fs = require('fs');
const {
  refineRevisionMarkup,
  revisionMarkupToHtml,
  escapeHtml,
} = require('./revisionMarkup');
const { buildAcceptedState } = require('./applyEdits');
const { getCategoryLabel } = require('./constants');

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
    ? revisionMarkupToHtml(revisionMarkup)
    : escapeHtml(editedText);

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
  const bodyHtml = refined ? revisionMarkupToHtml(refined) : escapeHtml(meta?.fallbackText || '');
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
  .body { white-space: pre-wrap; }
  .rev-del { color: #b42318; text-decoration: line-through; text-decoration-thickness: 1.5px; background: #fff1f0; }
  .rev-add { color: #067647; background: #ecfdf3; font-weight: 600; }
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
