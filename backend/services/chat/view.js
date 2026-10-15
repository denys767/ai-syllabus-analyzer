// Подання для фронтенду (docs/api-v3.md): SuggestionView з word-diff і конфліктами,
// GET-view розмови, прев'ю однієї пропозиції і всього документа.

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const { previewChanges, findConflicts, applyAccepted, diffBlock } = require('../document');
const { blockMap } = require('../document/model');
const { httpError } = require('../../utils/httpError');
const { computeReadiness } = require('./readiness');
const { outputList } = require('../outputFormats');
const { getCriterion } = require('../ai/rubric');
const {
  loadSyllabus, isLegacy, docOf, toDocSuggestion, loadAccepted, requiresReason, optionOf,
} = require('./state');

const MESSAGE_LIMIT = 200;
const PART_TYPES = { equal: 'eq', delete: 'del', insert: 'ins' };
const OP_BY_STATUS = { changed: 'replaceBlock', deleted: 'deleteBlock', inserted: 'insertAfter' };

function toParts(diff) {
  return (diff || []).map((p) => ({ type: PART_TYPES[p.type] || p.type, text: p.text }));
}

/** Для pptx — номер слайду (з 1) за локатором блоку; для вставки передається якір. */
function withSlide(doc, blocks, blockId, entry) {
  if (doc.format !== 'pptx') return entry;
  return { ...entry, slide: blocks.get(blockId)?.locator?.slide ?? null };
}

/** BlockChange[] для однієї пропозиції (або варіанта) відносно оригіналу. */
function changesFor(doc, docSuggestion) {
  if (!docSuggestion.ops.length) return [];
  const blocks = blockMap(doc);
  return previewChanges(doc, [docSuggestion]).entries.map((e) => {
    // Для insertAfter кожен новий блок — окремий BlockChange з blockId якоря
    const blockId = e.anchorId || e.blockId;
    return withSlide(doc, blocks, blockId, {
      blockId,
      op: OP_BY_STATUS[e.status],
      kind: e.kind || blocks.get(blockId)?.kind || 'paragraph',
      before: e.before,
      after: e.after,
      parts: toParts(e.diff),
    });
  });
}

function conflictsFor(doc, acceptedDocs, docSuggestion, titles) {
  if (!docSuggestion.ops.length) return [];
  const ids = [...new Set(findConflicts(doc, acceptedDocs, docSuggestion).map((c) => c.suggestionId))];
  return ids.map((id) => ({ suggestionId: id, title: titles.get(id) || '' }));
}

function uniqueConflicts(list) {
  const seen = new Set();
  return list.filter((c) => (seen.has(c.suggestionId) ? false : seen.add(c.suggestionId)));
}

/**
 * @param {object} doc          DocModel (null для legacy — тоді без changes)
 * @param {object} s            Suggestion
 * @param {object[]} acceptedDocs  прийняті у форматі services/document
 * @param {Map<string,string>} titles  id → title (для conflictsWith)
 */
function buildSuggestionView(doc, s, acceptedDocs, titles) {
  const pending = s.status === 'pending';
  const view = {
    id: String(s._id),
    kind: s.kind,
    status: s.status,
    severity: s.severity,
    group: s.group,
    criterionId: s.criterionId || null,
    criterionTitle: (s.criterionId && (getCriterion(s.criterionId)?.titleUk || getCriterion(s.criterionId)?.title)) || null,
    title: s.title,
    description: s.description,
    rationale: s.rationale || null,
    question: s.kind === 'question' ? (s.question || '') : null,
    answer: s.answer || null,
    applicable: s.applicable !== false,
    selectedOptionId: s.selectedOptionId || null,
    decisionReason: s.decisionReason || null,
    rejectTag: s.rejectTag || null,
    order: s.order,
    evidenceBlockIds: s.evidenceBlockIds || [],
    supersedes: (s.supersedes || []).map(String),
    versionsCount: (s.versions || []).length,
    requiresReason: requiresReason(s),
    changes: [],
    options: [],
    conflictsWith: [],
  };
  if (!doc) return view;

  if (s.kind === 'choice') {
    const all = [];
    view.options = (s.options || []).map((o) => {
      const docS = toDocSuggestion(s, o.id);
      const conflicts = pending ? conflictsFor(doc, acceptedDocs, docS, titles) : [];
      all.push(...conflicts);
      return {
        id: o.id,
        label: o.label,
        rationale: o.rationale,
        applicable: (o.ops || []).length > 0,
        changes: changesFor(doc, docS),
        conflictsWith: conflicts,
      };
    });
    view.conflictsWith = uniqueConflicts(all);
  } else if (s.kind === 'edit') {
    const docS = toDocSuggestion(s);
    view.changes = changesFor(doc, docS);
    if (pending) view.conflictsWith = conflictsFor(doc, acceptedDocs, docS, titles);
  }
  return view;
}

async function suggestionViews(syllabus, suggestions) {
  const doc = isLegacy(syllabus) ? null : docOf(syllabus);
  const accepted = suggestions
    .filter((s) => s.status === 'accepted')
    .sort((a, b) => (a.acceptedAt || 0) - (b.acceptedAt || 0) || String(a._id).localeCompare(String(b._id)));
  const acceptedDocs = accepted.map((s) => toDocSuggestion(s));
  const titles = new Map(suggestions.map((s) => [String(s._id), s.title]));
  return suggestions.map((s) => buildSuggestionView(doc, s, acceptedDocs, titles));
}

function isOwner(syllabus, userId) {
  return Boolean(userId) && String(syllabus.instructor?._id || syllabus.instructor) === String(userId);
}

function syllabusSummary(syllabus, userId) {
  return {
    id: String(syllabus._id),
    title: syllabus.title,
    status: syllabus.status,
    sourceFormat: syllabus.sourceFormat || null,
    outputs: outputList(syllabus),
    convertedFrom: syllabus.document?.convertedFrom || null,
    legacy: isLegacy(syllabus),
    analysisStage: syllabus.analysisStage || null,
    submittedAt: syllabus.submittedAt || null,
    submissionEmailStatus: syllabus.submissionEmailStatus || null,
    canMutate: isOwner(syllabus, userId) && syllabus.status !== 'submitted' && !isLegacy(syllabus),
  };
}

/**
 * GET /api/chat/:syllabusId — `{ conversation, messages, suggestions, readiness, syllabus }`.
 * До /start conversation і readiness — null. `userId` потрібен для `syllabus.canMutate`.
 */
async function getConversationView(syllabusId, { userId, limit = MESSAGE_LIMIT } = {}) {
  const syllabus = await loadSyllabus(syllabusId);
  const suggestions = await Suggestion.find({ syllabusId }).sort({ order: 1, _id: 1 });
  const conversation = await Conversation.findOne({ syllabusId });
  let messages = [];
  if (conversation) {
    // Беремо ОСТАННІ `limit` повідомлень і повертаємо їх за зростанням часу
    const latest = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    messages = latest.reverse();
  }
  return {
    conversation: conversation ? conversation.toObject() : null,
    messages,
    suggestions: await suggestionViews(syllabus, suggestions),
    readiness: conversation ? computeReadiness(suggestions) : null,
    syllabus: syllabusSummary(syllabus, userId),
  };
}

/** GET /suggestions/:sid/preview?optionId= — diff тільки цієї пропозиції відносно оригіналу. */
async function previewSuggestion(syllabusId, suggestionId, optionId) {
  const syllabus = await loadSyllabus(syllabusId);
  const doc = docOf(syllabus);
  const s = await Suggestion.findOne({ _id: suggestionId, syllabusId });
  if (!s) throw httpError(404, 'Пропозицію не знайдено');
  if (s.kind === 'choice' && optionId && !optionOf(s, optionId)) throw httpError(400, 'Такого варіанта немає');
  if (s.kind === 'choice' && !optionId && !s.selectedOptionId) {
    const changes = (s.options || []).flatMap((o) => changesFor(doc, toDocSuggestion(s, o.id)));
    return { suggestionId: String(s._id), changes };
  }
  return { suggestionId: String(s._id), changes: changesFor(doc, toDocSuggestion(s, optionId)) };
}

/** GET /document/preview — увесь документ з усіма прийнятими змінами (word-diff по блоках). */
async function documentPreview(syllabusId) {
  const syllabus = await loadSyllabus(syllabusId);
  const doc = docOf(syllabus);
  const accepted = (await loadAccepted(syllabusId)).map((s) => toDocSuggestion(s));
  const result = applyAccepted(doc, accepted);
  const deleted = new Set(result.changes.filter((c) => c.type === 'delete').map((c) => c.blockId));
  const byId = new Map();
  const insertsByAnchor = new Map();
  for (const b of result.blocks) {
    if (b.status !== 'inserted') byId.set(b.id, b);
    else insertsByAnchor.set(b.anchorId, [...(insertsByAnchor.get(b.anchorId) || []), b]);
  }
  const blockIndex = blockMap(doc);
  const entry = (b, status, parts) => withSlide(doc, blockIndex, b.anchorId || b.id,
    { blockId: b.id, kind: b.kind, level: b.level ?? null, parts, status });
  const blocks = [];
  for (const ob of doc.blocks) {
    if (deleted.has(ob.id)) {
      blocks.push(entry(ob, 'deleted', [{ type: 'del', text: ob.text }]));
    } else {
      const b = byId.get(ob.id) || ob;
      blocks.push(b.status === 'changed'
        ? entry(b, 'changed', toParts(diffBlock(b.originalText, b.text)))
        : entry(b, 'unchanged', [{ type: 'eq', text: b.text }]));
    }
    for (const ins of insertsByAnchor.get(ob.id) || []) {
      blocks.push({ ...entry(ins, 'inserted', [{ type: 'ins', text: ins.text }]), suggestionIds: ins.suggestionIds });
    }
  }
  return { blocks, conflicts: result.conflicts };
}

module.exports = {
  buildSuggestionView,
  suggestionViews,
  getConversationView,
  previewSuggestion,
  documentPreview,
  changesFor,
  syllabusSummary,
};
