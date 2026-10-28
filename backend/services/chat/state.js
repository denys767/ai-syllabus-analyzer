// Спільний стан чату v5: завантаження силабусу зі станом і довідниками, перевірки доступності мутацій,
// зняття readiness (знімок у Conversation) і прапорці stale для карток.

const Syllabus = require('../../models/Syllabus');
const Suggestion = require('../../models/Suggestion');
const Conversation = require('../../models/Conversation');
const { httpError } = require('../../utils/httpError');
const references = require('../references');
const { runChecks } = require('../checks');
const { computeReadiness } = require('../syllabusState/readiness');
const { getPath } = require('../syllabusState/paths');
const { hashValue } = require('./draftSuggestions');

const REJECT_TAGS = Suggestion.REJECT_TAGS;

// Перевірки, що блокують гуртове затвердження розділу: severity ≥ warning (info не блокує)
const BLOCKING_SEVERITIES = ['critical', 'high', 'medium', 'warning'];

function requiresReason(s) {
  return s.severity === 'critical' || s.severity === 'high';
}

async function loadSyllabus(syllabusId, select) {
  const query = Syllabus.findById(syllabusId);
  if (select) query.select(select);
  const syllabus = await query;
  if (!syllabus) throw httpError(404, 'Syllabus not found');
  return syllabus;
}

/** Силабус v4 (без стану, legacy або з прапорцем needsRebuild): чат лише читається. */
function isV4(syllabus) {
  return Boolean(syllabus.legacy || syllabus.needsRebuild || !syllabus.state);
}

function needsRebuildError() {
  return httpError(409, 'This syllabus was created in an older version. Rebuild in the new format to continue.', { code: 'NEEDS_REBUILD' });
}

/** Мутації чату можливі лише для розібраного v5-силабусу, аналіз якого завершено. */
function assertEditable(syllabus) {
  if (syllabus.status === 'analyzing') throw httpError(409, 'The analysis is still running. Please wait.', { code: 'ANALYSIS_IN_PROGRESS' });
  if (syllabus.status === 'error') throw httpError(409, 'The analysis failed. Run it again.', { code: 'ANALYSIS_FAILED' });
  if (isV4(syllabus)) throw needsRebuildError();
}

/** Силабус зі станом, ревізією і довідниками своєї програми. */
async function loadContext(syllabusId, { editable = true } = {}) {
  const syllabus = await loadSyllabus(syllabusId);
  if (editable) assertEditable(syllabus);
  else if (isV4(syllabus)) throw needsRebuildError();
  const refs = await references.getRefs(syllabus.programCode);
  return { syllabus, state: syllabus.state, revision: syllabus.stateRevision || 0, refs };
}

async function pendingCountsBySection(syllabusId) {
  const pending = await Suggestion.find({ syllabusId, status: 'pending' }).select('section target').lean();
  const bySection = new Map();
  for (const s of pending) {
    const key = s.section || s.target?.section;
    if (key) bySection.set(key, (bySection.get(key) || 0) + 1);
  }
  return { total: pending.length, bySection };
}

/** Readiness (docs/api-v5.md §4) з поточного стану, перевірок і кількості відкритих карток. */
async function buildReadiness(ctx) {
  const checks = runChecks(ctx.state, ctx.refs);
  const { total } = await pendingCountsBySection(ctx.syllabus._id);
  return { readiness: computeReadiness(ctx.state, { refs: ctx.refs, checks, pendingSuggestions: total }), checks };
}

/** Перераховує знімок readiness у Conversation. */
async function refreshConversationReadiness(syllabusId) {
  const ctx = await loadContext(syllabusId, { editable: false });
  const { readiness } = await buildReadiness(ctx);
  await Conversation.updateOne({ syllabusId }, { $set: { readiness } });
  return readiness;
}

/**
 * Прапорець stale: чернетка, збудована від значення, якого вже немає в стані (basisHash ≠ hash поточного).
 * Картки без basisHash (вибір варіанта) не чіпаємо — їх позначає markStale.
 */
async function refreshStale(syllabusId, state) {
  const pending = await Suggestion.find({ syllabusId, status: 'pending', 'draft.basisHash': { $ne: null } })
    .select('target draft.basisHash stale').lean();
  for (const s of pending) {
    let stale;
    try {
      stale = hashValue(getPath(state, s.target.path)) !== s.draft.basisHash;
    } catch {
      stale = true;
    }
    if (stale !== Boolean(s.stale)) await Suggestion.updateOne({ _id: s._id, status: 'pending' }, { $set: { stale } });
  }
}

// 'outcomes[]' перекриває 'outcomes[lo1].text', 'assessments[as1]' — 'assessments[as1].criteria'
const baseOf = (p) => p.replace(/(\[\]|\{\})$/, '');
const isPrefix = (prefix, path) => path === prefix || (path.startsWith(prefix) && '.[{'.includes(path[prefix.length]));
const overlaps = (a, b) => isPrefix(baseOf(a), b) || isPrefix(baseOf(b), a);

/** Інші pending-картки на той самий (або вкладений/батьківський) шлях стають застарілими. */
async function markStale(syllabusId, paths, exceptId = null) {
  const pending = await Suggestion.find({ syllabusId, status: 'pending' }).select('target').lean();
  const ids = pending
    .filter((s) => String(s._id) !== String(exceptId) && s.target?.path && paths.some((p) => overlaps(p, s.target.path)))
    .map((s) => s._id);
  if (ids.length) await Suggestion.updateMany({ _id: { $in: ids }, status: 'pending' }, { $set: { stale: true } });
}

module.exports = {
  REJECT_TAGS,
  BLOCKING_SEVERITIES,
  requiresReason,
  loadSyllabus,
  loadContext,
  isV4,
  needsRebuildError,
  assertEditable,
  pendingCountsBySection,
  buildReadiness,
  refreshConversationReadiness,
  refreshStale,
  markStale,
};
