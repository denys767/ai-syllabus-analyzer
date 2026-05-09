const { analyzeSyllabus } = require('./orchestrator');
const { analyzeAgainstStandards } = require('./analyzer');
const { generateEditsForRecs, regenerateForRec } = require('./editGenerator');
const {
  resolveEditsForRec,
  buildAcceptedState,
  buildSingleRecPreviewMarkup,
  buildSingleRecPreviewState,
  recomputeSyllabusState,
  isRecApplicable,
  validateRecEdits,
} = require('./applyEdits');
const {
  renderFinalSyllabusPdf,
  renderRevisionPdfFromMarkup,
  generateSubmissionReport,
} = require('./finalRender');
const { chatReply, serializeIssueContext } = require('./chatReply');
const { getCategoryLabel } = require('./constants');

function getEditableSyllabusText(syllabus) {
  return String(syllabus?.editedText || syllabus?.extractedText || '');
}

/**
 * Apply a single recommendation's edits to the syllabus state. Updates
 * `syllabus.editedText` and `syllabus.revisionMarkup` from the original
 * extractedText plus all currently-accepted recs (idempotent).
 *
 * Caller is expected to have already mutated `rec.decision = 'accepted'` and
 * (for choice/case-cards) `rec.beforeAfter.payload.appliedSelection = selection`.
 */
function applyAcceptedDecisions(syllabus) {
  recomputeSyllabusState(syllabus);
}

/**
 * Generate a one-rec preview PDF and return the file path.
 */
async function renderIssuePreviewPdf(syllabus, recId, selection = null) {
  const markup = buildSingleRecPreviewMarkup(syllabus, recId, selection);
  const course = syllabus.course?.name || syllabus.title || 'Syllabus preview';
  const instructor = `${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim();
  const program = syllabus.programId?.name || '';
  return renderRevisionPdfFromMarkup(markup, {
    course,
    instructor,
    program,
    fallbackText: syllabus.extractedText,
  });
}

function buildIssuePreview(syllabus, recId, selection = null) {
  return buildSingleRecPreviewState(syllabus, recId, selection);
}

module.exports = {
  // Orchestration
  analyzeSyllabus,
  analyzeAgainstStandards,
  generateEditsForRecs,
  regenerateForRec,

  // Apply / state
  getEditableSyllabusText,
  applyAcceptedDecisions,
  isRecApplicable,
  validateRecEdits,
  buildAcceptedState,
  resolveEditsForRec,

  // Preview rendering
  renderFinalSyllabusPdf,
  renderIssuePreviewPdf,
  buildIssuePreview,
  buildSingleRecPreviewMarkup,
  generateSubmissionReport,

  // Chat
  chatReply,
  serializeIssueContext,

  // Misc
  getCategoryLabel,
};
