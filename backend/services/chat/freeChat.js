// Вільне повідомлення: хід оркестратора з інструментами (services/ai/tools/runner). Усі записи стану йдуть через
// deps (store.mutate, accept з перевірками); сам чат нічого не пише в стан.

const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const Conversation = require('../../models/Conversation');
const { httpError } = require('../../utils/httpError');
const runner = require('../ai/tools/runner');
const formulator = require('../ai/prompts/formulator');
const { NARRATIVE_SLOTS, referenceTexts } = require('../ai/slotDrafts');
const { candidates } = require('../ai/interviewPlan');
const { createDraftSuggestions } = require('./draftSuggestions');
const { loadContext } = require('./state');
const { acceptSuggestion, afterDecision } = require('./decisions');
const {
  getOrCreateConversation, postUserMessage, postAiMessage, postSuggestionCard, postNextStep, transcriptOf, withAiFailureTracking,
} = require('./flow');

/** Явний стрибок із панелі або реплікою «Let's work on …» має пріоритет над попереднім питанням. */
function requestedSection(text, refs) {
  const match = String(text).trim().match(/^(?:let['’]s work on|work on|help me with|go to|discuss|ask me about)\s+(.+?)[.!?]?$/i);
  if (!match) return null;
  const label = match[1].toLowerCase();
  return refs.template.find((s) => [s.key, s.title].some((v) => v.toLowerCase() === label))?.key || null;
}

/** Решту залежностей runner підставляє сам; Confirm використовує ті самі перевірки, що й HTTP-кнопка. */
function buildDeps(ctx, userId) {
  return {
    acceptSuggestion: (id, { expectedRevision, optionId } = {}) => acceptSuggestion(
      ctx.syllabus._id, id, { expectedRevision, optionId }, userId,
    ),
  };
}

async function freeChatMessage(syllabusId, text, userId) {
  const ctx = await loadContext(syllabusId);
  const conversation = await getOrCreateConversation(syllabusId, userId);
  await postUserMessage(conversation, text);

  const scratch = ctx.syllabus.track === 'scratch';
  const section = scratch && requestedSection(text, ctx.refs);
  if (section) {
    const keys = candidates({ ...ctx, state: {}, refs: ctx.refs }).filter((s) => s.section === section).map((s) => s.key);
    await Conversation.updateOne({ _id: conversation._id }, {
      $set: { currentSlotKey: null, preferredSection: section },
      $pull: { skippedSlots: { $in: [section, ...keys] }, answeredSlots: { $in: keys } },
    });
    if (section === 'policies' || candidates({ ...ctx, preferredSection: section }).some((s) => s.section === section)) {
      await postNextStep(await Conversation.findById(conversation._id));
      return;
    }
    // Для заповнених та A/B/E-розділів оркестратор показує наявне й обробляє пряму вказівку викладача.
    conversation.currentSlotKey = keys[0] || section;
  }

  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(12).lean();
  const deps = buildDeps(ctx, userId);

  const result = await withAiFailureTracking(conversation, async () => {
    if (scratch && !section && NARRATIVE_SLOTS.includes(conversation.currentSlotKey)) {
      const { instructorLines } = await transcriptOf(conversation);
      const slotKeys = candidates({ ...ctx, skipped: conversation.skippedSlots }).map((s) => s.key).filter((k) => NARRATIVE_SLOTS.includes(k));
      const drafts = await formulator.draftFromNarrative({ state: ctx.state, refs: ctx.refs, narrative: text, slotKeys, transcript: instructorLines });
      const cards = [];
      for (const draft of drafts) {
        cards.push(...await createDraftSuggestions([{ ...draft, origin: 'interviewer' }], {
          syllabusId, state: ctx.state, refs: ctx.refs, known: [...instructorLines, ...referenceTexts(ctx.refs, draft.slotKey)],
        }));
      }
      return { reply: 'I have drafted these sections from your answer. Review and confirm each card to continue.',
        createdSuggestionIds: cards.map((c) => String(c._id)), answeredSlots: drafts.map((d) => d.slotKey) };
    }
    const res = await runner.runOrchestratorTurn({
      syllabus: ctx.syllabus, state: ctx.state, revision: ctx.revision, refs: ctx.refs,
      conversation: conversation.toObject(), messages: messages.reverse(), userText: text, userId,
      currentSlotKey: conversation.currentSlotKey || null,
      deps,
    });
    if (!res || typeof res.reply !== 'string') throw httpError(502, 'The orchestrator returned no reply');
    return res;
  });

  const created = (result.createdSuggestionIds || []).map(String);
  if (result.reply.trim()) await postAiMessage(conversation, result.reply.trim());
  if (created.length) {
    const cards = await Suggestion.find({ _id: { $in: created }, syllabusId, status: 'pending' }).sort({ order: 1, _id: 1 });
    for (const card of cards) await postSuggestionCard(conversation, card);
  }
  const answered = scratch && !section && (created.length || result.stateChanged);
  if (answered) {
    await Conversation.updateOne({ _id: conversation._id }, {
      $set: { currentSlotKey: null },
      $addToSet: { answeredSlots: { $each: [...(result.answeredSlots || []), conversation.currentSlotKey].filter(Boolean) } },
    });
  } else if (result.currentSlotKey !== undefined) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: result.currentSlotKey || null } });
  } else if (created.length || result.stateChanged) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: null } });
  }
  if (result.stateChanged || created.length) {
    await afterDecision(await Conversation.findById(conversation._id), { nextStep: false });
    if (result.stateChanged && !created.length) await postNextStep(await Conversation.findById(conversation._id));
  }
}

module.exports = { freeChatMessage, buildDeps, requestedSection };
