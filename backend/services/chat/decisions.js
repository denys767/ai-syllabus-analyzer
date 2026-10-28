// Рішення викладача над картками v5 (docs/api-v5.md §5–§6): Confirm (accept), Change the value (values),
// Cancel (reject), Reword (refine), answer, reopen. Кожна зміна статусу — атомарний findOneAndUpdate з умовою
// на статус; стан силабусу змінює лише syllabusState/store.mutate (accept) і revertChange (reopen).
// Після рішення: прапорці stale, readiness-знімок у Conversation, наступна картка або питання.

const Conversation = require('../../models/Conversation');
const Suggestion = require('../../models/Suggestion');
const SlotChange = require('../../models/SlotChange');
const store = require('../syllabusState/store');
const { slotOfPath, getPath } = require('../syllabusState/paths');
const { httpError } = require('../../utils/httpError');
const { renderTemplate } = require('../ai/facts');
const formulator = require('../ai/prompts/formulator');
const { buildDraftSuggestion, hashValue } = require('./draftSuggestions');
const {
  loadContext, requiresReason, REJECT_TAGS, refreshConversationReadiness, refreshStale, markStale,
} = require('./state');
const { knownFor } = require('./known');
const { policyKeyOf, assertWritable, writeSlot, policyPatch, setPolicy, filled } = require('./slotWrite');
const {
  getOrCreateConversation, postNextStep, postUserMessage, postAiMessage, postSuggestionCard, transcriptOf, withAiFailureTracking,
} = require('./flow');

async function loadSuggestion(syllabusId, suggestionId) {
  const s = await Suggestion.findOne({ _id: suggestionId, syllabusId });
  if (!s) throw httpError(404, 'Suggestion not found');
  return s;
}

const notPending = () => httpError(409, 'This suggestion has already been handled. Refresh the page.', { code: 'NOT_PENDING' });

async function context(syllabusId, suggestionId, userId) {
  const ctx = await loadContext(syllabusId);
  const suggestion = await loadSuggestion(syllabusId, suggestionId);
  const conversation = await getOrCreateConversation(syllabusId, userId);
  return { ...ctx, suggestion, conversation };
}

async function afterDecision(conversation, { card = null, nextStep = true } = {}) {
  const { state } = await loadContext(conversation.syllabusId, { editable: false });
  await refreshStale(conversation.syllabusId, state);
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastDecisionAt: new Date() } });
  await refreshConversationReadiness(conversation.syllabusId);
  if (card) await postSuggestionCard(conversation, card);
  else if (nextStep) await postNextStep(conversation);
}

/** Знімок попереднього варіанта картки (versions) перед Reword / answer / values. */
function snapshot(s, extra = {}) {
  const plain = s.toObject ? s.toObject() : s;
  return {
    kind: plain.kind, title: plain.title, description: plain.description, question: plain.question, answer: plain.answer,
    applicable: plain.applicable, draft: plain.draft, ...extra, at: new Date(),
  };
}

// ---------- accept (Confirm) ----------

/** Що саме запишемо в стан: функція над копією стану + походження для SlotChange. Усі перевірки — до захоплення картки. */
function buildPlan(s, optionId, ctx) {
  const path = s.target.path;
  const { state, refs } = ctx;
  assertWritable(state, path);
  const policyKey = policyKeyOf(path);

  let option = null;
  if (s.kind === 'choice') {
    if (!optionId) throw httpError(400, 'optionId is required for this suggestion', { code: 'OPTION_REQUIRED' });
    option = (s.options || []).find((o) => o.id === optionId);
    if (!option) throw httpError(400, 'Unknown option', { code: 'UNKNOWN_OPTION' });
  } else if (!s.draft) {
    throw httpError(409, 'This suggestion has no draft to apply.', { code: 'NOT_APPLICABLE' });
  }

  const hasBasis = Boolean(s.draft?.basisHash);
  if (s.stale || (hasBasis && hashValue(getPath(state, path)) !== s.draft.basisHash)) {
    throw httpError(409, 'The text this draft was based on has changed. Reword the draft or cancel it.', { code: 'STALE_DRAFT' });
  }
  const unconfirmed = (s.draft?.proposedValues || []).filter((v) => !v.confirmed);
  if (unconfirmed.length) {
    throw httpError(409, 'Confirm the highlighted values before applying this draft.', {
      code: 'UNCONFIRMED_VALUES', details: { unconfirmed: unconfirmed.map((v) => v.id) },
    });
  }

  let source;
  let fn;
  if (policyKey) {
    const blockOf = (st) => (st.policies || []).find((p) => p.key === policyKey);
    let args;
    if (option?.optionKey) {
      args = { optionKey: option.optionKey };
    } else {
      const text = option ? (option.value ?? blockOf(state).text) : s.draft.value;
      if (typeof text !== 'string') throw httpError(409, 'There is no text to apply.', { code: 'NOT_APPLICABLE' });
      args = { text };
    }
    source = policyPatch(blockOf(state), args, refs).source;
    fn = (st) => setPolicy(st, policyKey, policyPatch(blockOf(st), args, refs));
  } else {
    if (option && option.value === undefined) throw httpError(409, 'This option has no value to apply.', { code: 'NOT_APPLICABLE' });
    const value = option ? option.value : s.draft.value;
    source = option ? 'instructor_directed' : 'ai_draft';
    fn = (st) => writeSlot(st, path, value, { source });
  }
  return { fn, source };
}

async function acceptSuggestion(syllabusId, suggestionId, { optionId = null, expectedRevision } = {}, userId) {
  const ctx = await context(syllabusId, suggestionId, userId);
  const { suggestion: s, conversation } = ctx;
  if (s.status !== 'pending') throw notPending();
  if (s.kind === 'question') throw httpError(409, 'Answer the question first.', { code: 'ANSWER_REQUIRED' });

  const plan = s.applicable === false ? null : buildPlan(s, optionId, ctx);
  if (plan) plan.fn(structuredClone(ctx.state)); // пробний прогін: некоректні шляхи/значення — до захоплення картки

  const claimed = await Suggestion.findOneAndUpdate(
    { _id: s._id, syllabusId, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date(), selectedOptionId: optionId || null, stale: false } },
    { new: true },
  );
  if (!claimed) throw notPending();

  try {
    if (plan) {
      const result = await store.mutate(syllabusId, expectedRevision ?? ctx.revision, plan.fn, {
        by: userId, source: plan.source, suggestionId: s._id, refs: ctx.refs,
      });
      await markStale(syllabusId, [s.target.path, ...result.changes.map((c) => c.path)], s._id);
    }
  } catch (err) {
    await Suggestion.updateOne({ _id: s._id, status: 'accepted' }, {
      $set: { status: 'pending', selectedOptionId: s.selectedOptionId || null }, $unset: { acceptedAt: '' },
    });
    throw err;
  }
  await Suggestion.updateOne({ _id: s._id }, { $push: { decisionHistory: { action: 'accepted', by: userId, optionId: optionId || undefined } } });
  await postUserMessage(conversation, `Confirmed: ${s.title}`, s._id);
  await afterDecision(conversation);
  return claimed;
}

// ---------- values (Change the value) ----------

async function updateValues(syllabusId, suggestionId, { values }, userId) {
  const { suggestion: s, conversation } = await context(syllabusId, suggestionId, userId);
  if (s.status !== 'pending') throw notPending();
  if (s.kind !== 'edit' || !s.draft) throw httpError(409, 'This suggestion has no values to change.', { code: 'NOT_APPLICABLE' });

  const proposed = s.draft.proposedValues.map((v) => ({ id: v.id, label: v.label, value: v.value, path: v.path, confirmed: v.confirmed }));
  for (const patch of values) {
    const target = proposed.find((v) => v.id === patch.id);
    if (!target) throw httpError(400, `Unknown value: ${patch.id}`, { code: 'UNKNOWN_VALUE' });
    if (patch.value !== undefined) {
      if (!filled(patch.value)) throw httpError(400, 'A value cannot be empty', { code: 'EMPTY_VALUE' });
      target.value = String(patch.value).trim();
    }
    if (patch.confirmed !== undefined) target.confirmed = Boolean(patch.confirmed);
  }
  // Шаблон перерендерюється без LLM; чернетка без шаблону (масив сутностей) лишає значення, змінюються лише факти
  const $set = { 'draft.proposedValues': proposed };
  if (s.draft.template) $set['draft.value'] = renderTemplate(s.draft.template, proposed);

  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, syllabusId, status: 'pending' },
    { $set, $push: { versions: snapshot(s), decisionHistory: { action: 'values', by: userId } } },
    { new: true },
  );
  if (!updated) throw notPending();
  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: s._id } });
  return updated;
}

// ---------- reject (Cancel) ----------

async function rejectSuggestion(syllabusId, suggestionId, { reason, rejectTag } = {}, userId) {
  const { suggestion: s, conversation } = await context(syllabusId, suggestionId, userId);
  if (s.status !== 'pending') throw notPending();
  const text = (reason || '').trim();
  if (requiresReason(s) && !text) {
    throw httpError(400, 'A reason is required to cancel a critical or high-severity suggestion.', { code: 'REASON_REQUIRED' });
  }
  if (rejectTag && !REJECT_TAGS.includes(rejectTag)) throw httpError(400, 'Unknown reason category');

  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, syllabusId, status: 'pending' },
    {
      $set: { status: 'rejected', decisionReason: text || null, rejectTag: rejectTag || (text ? 'other' : null) },
      $push: { decisionHistory: { action: 'rejected', by: userId, reason: text || undefined, rejectTag: rejectTag || undefined } },
    },
    { new: true },
  );
  if (!updated) throw notPending();
  await postUserMessage(conversation, `Cancelled: ${s.title}${text ? ` — ${text}` : ''}`, s._id);
  await afterDecision(conversation);
  return updated;
}

// ---------- refine (Reword) ----------

function draftFromModel(s, out, ctx, known) {
  const built = buildDraftSuggestion({
    origin: s.origin || 'orchestrator',
    severity: s.severity,
    kind: 'edit',
    target: { section: s.target.section, path: s.target.path, entityId: s.target.entityId },
    text: typeof out.text === 'string' ? out.text : undefined,
    value: out.value,
    proposedValues: out.proposedValues,
  }, { syllabusId: s.syllabusId, state: ctx.state, refs: ctx.refs, known });
  return built.draft;
}

const hasDraftText = (out) => out && (typeof out.text === 'string' || out.value !== undefined);

async function refineSuggestion(syllabusId, suggestionId, { feedback }, userId, { postFeedback = true } = {}) {
  const ctx = await context(syllabusId, suggestionId, userId);
  const { suggestion: s, conversation } = ctx;
  if (s.status !== 'pending') throw notPending();
  if (s.kind !== 'edit' || !s.draft) {
    throw httpError(409, s.kind === 'question' ? 'Answer the question instead.' : 'Only drafts can be reworded.', { code: 'NOT_APPLICABLE' });
  }
  assertWritable(ctx.state, s.target.path);
  const text = (feedback || '').trim();
  if (!text) throw httpError(400, 'Tell me what to change', { code: 'FEEDBACK_REQUIRED' });

  const { transcript, instructorLines } = await transcriptOf(conversation);
  const out = await withAiFailureTracking(conversation, async () => {
    const res = await formulator.reword({
      suggestion: s.toObject(), feedback: text, state: ctx.state, refs: ctx.refs, transcript,
    });
    if (!hasDraftText(res)) throw new Error('Formulator returned no draft');
    return res;
  });

  const draft = draftFromModel(s, out, ctx, knownFor(s, ctx, instructorLines, [text]));
  const set = { draft, stale: false };
  if (out.rationale) set.rationale = out.rationale;
  if (out.title) set.title = out.title;
  if (out.description) set.description = out.description;
  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, syllabusId, status: 'pending' },
    { $set: set, $push: { versions: snapshot(s, { feedback: text }), decisionHistory: { action: 'refined', by: userId, feedback: text } } },
    { new: true },
  );
  if (!updated) throw notPending();
  if (postFeedback) await postUserMessage(conversation, text, s._id);
  await postAiMessage(conversation, 'Here is the reworded draft. Check it and confirm when it looks right.', s._id);
  await postSuggestionCard(conversation, updated);
  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: null } });
  return updated;
}

// ---------- answer ----------

async function answerSuggestion(syllabusId, suggestionId, { answer }, userId) {
  const ctx = await context(syllabusId, suggestionId, userId);
  const { suggestion: s, conversation } = ctx;
  if (s.status !== 'pending') throw notPending();
  if (s.kind !== 'question') throw httpError(409, 'This suggestion is not a question.', { code: 'NOT_A_QUESTION' });
  assertWritable(ctx.state, s.target.path);
  const text = (answer || '').trim();
  if (!text) throw httpError(400, 'Answer cannot be empty', { code: 'ANSWER_EMPTY' });

  const { transcript, instructorLines } = await transcriptOf(conversation);
  const slotKey = slotOfPath(s.target.path)?.key || s.target.section;
  const drafts = await withAiFailureTracking(conversation, () => formulator.draftFromNarrative({
    state: ctx.state, refs: ctx.refs, narrative: text, slotKeys: [slotKey], transcript,
  }));
  const pick = (drafts || []).find((d) => d.target?.path === s.target.path) || (drafts || []).find((d) => d.slotKey === slotKey) || (drafts || [])[0];

  await postUserMessage(conversation, text, s._id);
  if (!hasDraftText(pick)) {
    // Модель не склала чернетку: картка лишається питанням, відповідь зберігаємо для контексту
    await Suggestion.updateOne({ _id: s._id, status: 'pending' }, {
      $set: { answer: text }, $push: { versions: snapshot(s), decisionHistory: { action: 'answered', by: userId } },
    });
    await postAiMessage(conversation, 'I could not turn that into a draft yet. Could you add a few more details?', s._id);
    return Suggestion.findById(s._id);
  }
  const draft = draftFromModel(s, pick, ctx, knownFor(s, ctx, instructorLines, [text]));
  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, syllabusId, status: 'pending', kind: 'question' },
    {
      $set: { kind: 'edit', draft, answer: text, stale: false, ...(pick.rationale ? { rationale: pick.rationale } : {}) },
      $push: { versions: snapshot(s), decisionHistory: { action: 'answered', by: userId } },
    },
    { new: true },
  );
  if (!updated) throw notPending();
  await postAiMessage(conversation, 'Thanks! Here is a draft based on your answer. Check it and confirm when it looks right.', s._id);
  await postSuggestionCard(conversation, updated);
  return updated;
}

// ---------- reopen ----------

/** Зміни стану останнього прийняття картки (усі шляхи однієї ревізії; reopen-записи пропускаються). */
async function lastAcceptChanges(syllabusId, suggestionId) {
  const last = await SlotChange.findOne({ syllabusId, suggestionId, source: { $ne: 'reopen' } }).sort({ revision: -1 }).lean();
  if (!last) return [];
  return SlotChange.find({ syllabusId, suggestionId, revision: last.revision, source: { $ne: 'reopen' } }).lean();
}

async function reopenSuggestion(syllabusId, suggestionId, userId) {
  const ctx = await context(syllabusId, suggestionId, userId);
  const { suggestion: s, conversation } = ctx;
  if (s.status === 'pending') throw httpError(409, 'This suggestion is already open.', { code: 'NOT_DECIDED' });

  const changes = s.status === 'accepted' ? await lastAcceptChanges(syllabusId, s._id) : [];
  const claimed = await Suggestion.findOneAndUpdate(
    { _id: s._id, syllabusId, status: s.status },
    {
      $set: { status: 'pending', selectedOptionId: null, decisionReason: null, rejectTag: null },
      $unset: { acceptedAt: '' },
      $push: { decisionHistory: { action: 'reopened', by: userId } },
    },
    { new: true },
  );
  if (!claimed) throw notPending();

  if (changes.length) {
    try {
      await store.revertChange(syllabusId, changes, { by: userId, suggestionId: s._id, refs: ctx.refs });
    } catch (err) {
      await Suggestion.updateOne({ _id: s._id, status: 'pending' }, {
        $set: { status: s.status, selectedOptionId: s.selectedOptionId, decisionReason: s.decisionReason, rejectTag: s.rejectTag, acceptedAt: s.acceptedAt },
        $pop: { decisionHistory: 1 },
      });
      throw err;
    }
  }
  await postUserMessage(conversation, `Back to: ${s.title}`, s._id);
  await afterDecision(conversation, { card: claimed });
  return claimed;
}

module.exports = {
  acceptSuggestion, updateValues, rejectSuggestion, refineSuggestion, answerSuggestion, reopenSuggestion, afterDecision,
};
