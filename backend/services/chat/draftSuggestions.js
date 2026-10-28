// Створення v5-карток (Suggestion з target + draft) — спільне для ревізора треку 2, перевірок і оркестратора чату.
// Пропозиція не змінює стан: стан змінюється лише при accept (Confirm) через syllabusState/store.mutate.
const crypto = require('crypto');
const Suggestion = require('../../models/Suggestion');
const { getPath, sectionOfPath } = require('../syllabusState/paths');
const { mergeProposedValues, scanFacts, toTemplate } = require('../ai/facts');
const { currentText } = require('../ai/slotDrafts');

// Порядок показу: critical перед improvement, всередині — за order розділу шаблону (ТЗ §6)
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'warning', 'low', 'info'];

function stableStringify(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/** hash значення слота: basisHash у чернетці і перевірка STALE_DRAFT при accept. */
const hashValue = (value) => crypto.createHash('sha1').update(stableStringify(value ?? null)).digest('hex');

function orderFor({ severity, section }, refs) {
  const sectionOrder = (refs?.template || []).find((t) => t.key === section)?.order ?? 99;
  const rank = SEVERITY_ORDER.indexOf(severity);
  return (rank < 0 ? SEVERITY_ORDER.length : rank) * 100 + sectionOrder;
}

/**
 * Готує документ Suggestion v5 з чернетки (без запису в БД).
 * @param {object} input { origin, checkId?, criterionId?, severity, kind, title, description, rationale,
 *   target: { path (конкретний: 'summary.shortDescription', 'assessments[as1].criteria', 'policies{policy.late}'), entityId? }, value?, text?, proposedValues?, options?, question?, applicable?, sources?, evidenceBlockIds? }
 * @param {object} ctx { syllabusId, state, refs, known: string[] } known — репліки викладача й тексти довідників для сканера фактів
 */
function buildDraftSuggestion(input, { syllabusId, state, refs, known = [] }) {
  const section = input.target.section || sectionOfPath(input.target.path) || null;
  const current = getPath(state, input.target.path);
  const text = typeof input.text === 'string' ? input.text : (input.value == null ? null : currentText(input.value));
  const proposedValues = text != null
    ? mergeProposedValues(input.proposedValues || [], scanFacts(text, { known }))
    : mergeProposedValues(input.proposedValues || []);
  return {
    syllabusId,
    origin: input.origin,
    checkId: input.checkId || null,
    criterionId: input.criterionId || null,
    section,
    severity: input.severity || 'medium',
    kind: input.kind || 'edit',
    title: input.title || '',
    description: input.description || '',
    rationale: input.rationale || '',
    evidenceBlockIds: input.evidenceBlockIds || [],
    target: { section, path: input.target.path, entityId: input.target.entityId || null },
    // Питання й вибір без значення — без чернетки (значення з'явиться після answer / вибору варіанта)
    draft: input.choiceBasis ? {
      value: null, source: 'instructor_directed', proposedValues: [], basisHash: hashValue(current),
    } : input.kind === 'question' || (input.kind === 'choice' && input.value === undefined) ? undefined : {
      value: input.value !== undefined ? input.value : text,
      source: input.source === 'instructor_directed' ? 'instructor_directed' : 'ai_draft',
      template: text != null && proposedValues.length ? toTemplate(text, proposedValues) : null,
      proposedValues,
      basisHash: hashValue(current),
    },
    options: input.options || [],
    question: input.question || undefined,
    applicable: input.applicable !== false,
    sources: input.sources || [],
    order: orderFor({ severity: input.severity, section }, refs),
    promptVersion: input.promptVersion || null,
  };
}

/** Записує картки; повертає створені документи. */
async function createDraftSuggestions(inputs, ctx) {
  const docs = inputs.map((i) => buildDraftSuggestion(i, ctx));
  if (!docs.length) return [];
  return Suggestion.insertMany(docs);
}

module.exports = { buildDraftSuggestion, createDraftSuggestions, hashValue, stableStringify, orderFor, SEVERITY_ORDER };
