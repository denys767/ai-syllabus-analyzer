// Вільне повідомлення: хід оркестратора з інструментами (services/ai/tools/runner). Усі записи стану йдуть через
// deps (store.mutate, accept з перевірками); сам чат нічого не пише в стан.

const mongoose = require('mongoose');
const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const Conversation = require('../../models/Conversation');
const store = require('../syllabusState/store');
const { runChecks } = require('../checks');
const { httpError } = require('../../utils/httpError');
const runner = require('../ai/tools/runner');
const { buildDraftSuggestion } = require('./draftSuggestions');
const { loadContext } = require('./state');
const { acceptSuggestion, afterDecision } = require('./decisions');
const {
  getOrCreateConversation, postUserMessage, postAiMessage, postSuggestionCard, postNextStep, transcriptOf, withAiFailureTracking,
} = require('./flow');
const { knownFor } = require('./known');

/** Залежності оркестратора, прив'язані до силабусу (docs/api-v5.md §9). */
function buildDeps(ctx, conversation, userId, instructorLines) {
  const syllabusId = ctx.syllabus._id;
  const current = { state: ctx.state, revision: ctx.revision };
  const reload = async () => Object.assign(current, await store.getState(syllabusId));

  return {
    current,
    getRefs: () => ctx.refs,
    // mutate(fn, mctx?) → { state, revision, changes }; ревізію бере сам, на STATE_CONFLICT один повтор
    async mutate(fn, mctx = {}) {
      for (let attempt = 0; ; attempt += 1) {
        const { revision } = await store.getState(syllabusId);
        try {
          const result = await store.mutate(syllabusId, revision, fn, { by: userId, refs: ctx.refs, ...mctx });
          Object.assign(current, { state: result.state, revision: result.revision });
          return result;
        } catch (err) {
          if (err.code !== 'STATE_CONFLICT' || attempt >= 1) throw err;
        }
      }
    },
    // inputs — вхід buildDraftSuggestion; сканер фактів доповнює proposedValues кожної картки
    async createDraftSuggestions(inputs) {
      const docs = inputs.map((input) => buildDraftSuggestion({ origin: 'orchestrator', ...input }, {
        syllabusId, state: current.state, refs: ctx.refs,
        known: knownFor({ target: input.target }, { state: current.state, refs: ctx.refs }, instructorLines),
      }));
      return docs.length ? Suggestion.insertMany(docs) : [];
    },
    runChecks: (state) => runChecks(state || current.state, ctx.refs),
    async findSuggestion(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return Suggestion.findOne({ _id: id, syllabusId });
    },
    // Те саме, що кнопка Confirm: UNCONFIRMED_VALUES, STALE_DRAFT, LOCKED перевіряються тут
    async acceptSuggestion(id, { optionId = null } = {}) {
      const result = await acceptSuggestion(syllabusId, id, { optionId }, userId);
      await reload();
      return result;
    },
    reload,
  };
}

async function freeChatMessage(syllabusId, text, userId) {
  const ctx = await loadContext(syllabusId);
  const conversation = await getOrCreateConversation(syllabusId, userId);
  await postUserMessage(conversation, text);

  const { transcript, instructorLines } = await transcriptOf(conversation);
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(12).lean();
  const deps = buildDeps(ctx, conversation, userId, instructorLines);
  const { current, reload, ...runnerDeps } = deps;

  const result = await withAiFailureTracking(conversation, async () => {
    const res = await runner.runOrchestratorTurn({
      syllabus: ctx.syllabus, state: ctx.state, revision: ctx.revision, refs: ctx.refs,
      conversation: conversation.toObject(), messages: messages.reverse(), transcript, userText: text, userId,
      currentSlotKey: conversation.currentSlotKey || null,
      deps: runnerDeps,
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
