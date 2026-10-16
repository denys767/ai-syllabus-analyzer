// Вільне повідомлення в чаті: класифікація наміру → відповідь AI або Refine поточної картки.

const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const { chatReply, classifyIntent } = require('../ai/chatReply');
const { loadSyllabus, isLegacy, docOf } = require('./state');
const { suggestionViews } = require('./view');
const { getOrCreateConversation, postUserMessage, postAiMessage, withAiFailureTracking } = require('./flow');
const { refineSuggestion } = require('./decisions');

async function currentSuggestion(conversation) {
  if (!conversation.currentSuggestionId) return null;
  return Suggestion.findOne({ _id: conversation.currentSuggestionId, syllabusId: conversation.syllabusId });
}

function evidenceText(syllabus, s) {
  if (!s || isLegacy(syllabus)) return '';
  const ids = new Set([...(s.evidenceBlockIds || []), ...(s.ops || []).map((o) => o.blockId)]);
  return docOf(syllabus).blocks.filter((b) => ids.has(b.id)).slice(0, 8)
    .map((b) => `[${b.id}] ${b.text}`).join('\n');
}

async function freeChatMessage(syllabusId, text, userId) {
  const syllabus = await loadSyllabus(syllabusId);
  if (isLegacy(syllabus)) docOf(syllabus); // кидає LEGACY_SYLLABUS
  const conversation = await getOrCreateConversation(syllabusId, userId);
  const current = await currentSuggestion(conversation);
  const all = current ? await Suggestion.find({ syllabusId }) : [];
  const views = current ? await suggestionViews(syllabus, all) : [];
  const view = current ? views.find((v) => v.id === String(current._id)) : null;

  // Refine можливий лише для pending-картки силабусу, що ще редагується
  const canRefine = current && current.status === 'pending' && syllabus.status === 'in_progress';
  let intent = 'question';
  if (canRefine) {
    try {
      intent = await classifyIntent(text, view);
    } catch (err) {
      console.error('intent classification failed:', err.message);
    }
  }
  if (intent === 'refine') {
    await postUserMessage(conversation, text, current._id);
    await refineSuggestion(syllabusId, current._id, { feedback: text }, userId, { postFeedback: false });
    return;
  }

  await postUserMessage(conversation, text);
  const recent = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(8).lean();
  const reply = await withAiFailureTracking(
    conversation,
    () => chatReply(syllabus, recent.reverse(), text, view, evidenceText(syllabus, current)),
  );
  await postAiMessage(conversation, reply || 'Не вдалося сформулювати відповідь. Спробуйте перефразувати питання.');
}

module.exports = { freeChatMessage };
