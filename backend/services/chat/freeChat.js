// Вільне повідомлення: хід оркестратора з інструментами (services/ai/tools/runner). Усі записи стану йдуть через
// deps (store.mutate, accept з перевірками); сам чат нічого не пише в стан.

const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const Conversation = require('../../models/Conversation');
const { httpError } = require('../../utils/httpError');
const runner = require('../ai/tools/runner');
const { loadContext } = require('./state');
const { acceptSuggestion, afterDecision } = require('./decisions');
const {
  getOrCreateConversation, postUserMessage, postAiMessage, postSuggestionCard, postNextStep, withAiFailureTracking,
} = require('./flow');

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

  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(12).lean();
  const deps = buildDeps(ctx, userId);

  const result = await withAiFailureTracking(conversation, async () => {
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
  if (result.currentSlotKey !== undefined) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: result.currentSlotKey || null } });
  } else if (created.length || result.stateChanged) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: null } });
  }
  if (result.stateChanged || created.length) {
    await afterDecision(await Conversation.findById(conversation._id), { nextStep: false });
    if (result.stateChanged && !created.length) await postNextStep(await Conversation.findById(conversation._id));
  }
}

module.exports = { freeChatMessage, buildDeps };
