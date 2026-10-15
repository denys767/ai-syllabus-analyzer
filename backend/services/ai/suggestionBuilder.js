// Перетворення знахідок рубрики (services/ai/review) на документи Suggestion.

const { validateOps } = require('../document');
const { SEVERITY_RANK } = require('./rubric');

const KINDS = new Set(['edit', 'choice', 'question']);
const GROUPS = new Set(['template', 'outcomes', 'assessment', 'practice', 'policy']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

const reviewModule = require('./review');

function review() {
  return reviewModule;
}

function metaOf(syllabus) {
  return {
    title: syllabus.title,
    courseName: syllabus.course?.name || syllabus.title,
  };
}

/** Валідатор модуля документів у сигнатурі review: (blocks, ops) → рядки помилок для повтору LLM. */
function validateOpsForReview(blocks, ops) {
  return validateOps({ blocks }, ops).map((e) => `${e.code}${e.blockId ? ` (${e.blockId})` : ''}: ${e.message}`);
}

async function generateFor({ finding, blocks, meta, feedback }) {
  return review().generateSuggestion({
    finding, blocks, meta, feedback: feedback || '', validateOps: validateOpsForReview,
  });
}

function clip(text, max) {
  const s = String(text || '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function cleanOps(ops) {
  return Array.isArray(ops) ? JSON.parse(JSON.stringify(ops)) : [];
}

/** Поля Suggestion зі знахідки (без варіанта правки). */
function baseFromFinding(finding, docVersion) {
  return {
    findingId: finding.id,
    criterionId: finding.criterionId,
    group: GROUPS.has(finding.group) ? finding.group : 'template',
    severity: SEVERITIES.has(finding.severity) ? finding.severity : 'medium',
    confidence: Number.isFinite(finding.confidence) ? finding.confidence : null,
    evidenceBlockIds: Array.isArray(finding.evidenceBlockIds) ? finding.evidenceBlockIds.filter((id) => typeof id === 'string') : [],
    promptVersion: finding.promptVersion,
    finding: JSON.parse(JSON.stringify(finding)),
    docVersion,
  };
}

/** Варіант правки з результату generateSuggestion: kind, title, description, ops/options/question, applicable. */
function variantFrom(result, finding) {
  const kind = KINDS.has(result?.kind) ? result.kind : 'edit';
  const ops = kind === 'edit' ? cleanOps(result.ops) : [];
  const options = kind === 'choice'
    ? (result.options || []).map((o, i) => ({
      id: String(o.id || `opt${i + 1}`),
      label: String(o.label || `Варіант ${i + 1}`),
      rationale: String(o.rationale || ''),
      ops: cleanOps(o.ops),
    }))
    : [];
  let applicable;
  if (kind === 'edit') applicable = ops.length > 0 && result.applicable !== false;
  else if (kind === 'choice') applicable = options.some((o) => o.ops.length > 0) && result.applicable !== false;
  else applicable = true; // question: дія — відповідь викладача (/answer), не «Прийняти»
  return {
    kind,
    title: clip(result.title || finding.claim || 'Пропозиція', 300),
    description: String(result.description || finding.suggestedAction || finding.rationale || ''),
    rationale: String(result.rationale || finding.rationale || ''),
    ops,
    options,
    question: kind === 'question' ? String(result.question || '') : undefined,
    applicable,
  };
}

/** Порада без правки, якщо generateSuggestion впав: знахідку не губимо. */
function advisoryVariant(finding) {
  return {
    kind: 'edit',
    title: clip(finding.claim || 'Рекомендація', 300),
    description: String(finding.suggestedAction || finding.rationale || ''),
    rationale: String(finding.rationale || ''),
    ops: [],
    options: [],
    question: undefined,
    applicable: false,
  };
}

/** Пріоритет показу: severity rank × confidence (більше — раніше). */
function priorityScore(s) {
  const confidence = Number.isFinite(s.confidence) ? s.confidence : 0.5;
  return (SEVERITY_RANK[s.severity] || 0) * confidence;
}

module.exports = {
  review,
  metaOf,
  validateOpsForReview,
  generateFor,
  baseFromFinding,
  variantFrom,
  advisoryVariant,
  priorityScore,
};
