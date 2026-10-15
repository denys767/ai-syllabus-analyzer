// Потік розмови: створення з привітанням, «наступна картка» після кожного рішення,
// submission-cta, коли pending не лишилось.

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const { httpError } = require('../../utils/httpError');
const { loadSyllabus, assertEditable, refreshConversationReadiness } = require('./state');

const MAX_CONSECUTIVE_FAILURES = 3;
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const SEVERITY_PLURAL = { critical: 'критичних', high: 'важливих', medium: 'середніх', low: 'незначних' };

function greetingText(syllabus, suggestions) {
  const total = suggestions.length;
  if (!total) {
    return `Вітаю! Я завершив аналіз силабусу «${syllabus.title}» і не знайшов суттєвих проблем. Можете завантажити фінальні файли й відправити силабус академічному директору.`;
  }
  const counts = SEVERITY_ORDER
    .map((sev) => [sev, suggestions.filter((s) => s.severity === sev).length])
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `${SEVERITY_PLURAL[sev]}: ${n}`);
  return `Вітаю! Я завершив аналіз силабусу «${syllabus.title}». Пропозицій: ${total} (${counts.join(', ')}). `
    + 'Пройдемо їх по одній: кожну можна прийняти, відхилити або попросити змінити.';
}

const SUBMISSION_CTA_TEXT = 'Усі пропозиції розглянуто. Перегляньте фінальні файли й відправте силабус: академічний директор отримає документ зі змінами і підсумковий звіт.';

async function getOrCreateConversation(syllabusId, userId) {
  const existing = await Conversation.findOne({ syllabusId });
  if (existing) return existing;

  const syllabus = await loadSyllabus(syllabusId);
  let conversation;
  try {
    conversation = await Conversation.create({ syllabusId, instructorId: userId });
  } catch (err) {
    // Паралельний /start уже створив розмову
    if (err.code === 11000) return Conversation.findOne({ syllabusId });
    throw err;
  }
  const suggestions = await Suggestion.find({ syllabusId }).select('severity').lean();
  await Message.create({
    conversationId: conversation._id,
    role: 'ai',
    kind: 'text',
    content: greetingText(syllabus, suggestions),
  });
  await refreshConversationReadiness(syllabusId);
  return Conversation.findById(conversation._id);
}

async function nextPending(syllabusId) {
  return Suggestion.findOne({ syllabusId, status: 'pending' }).sort({ order: 1, _id: 1 });
}

/** Повідомлення-картка для пропозиції (вміст будується на льоту з Suggestion). */
async function postSuggestionCard(conversation, suggestion) {
  await Message.create({
    conversationId: conversation._id,
    role: 'ai',
    kind: 'suggestion',
    content: suggestion.title,
    relatedSuggestionId: suggestion._id,
  });
  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: suggestion._id } });
}

/**
 * Після рішення: показати наступну pending-пропозицію (якщо остання картка в чаті — не вона),
 * або submission-cta, коли pending не лишилось.
 */
async function postNextCard(conversation) {
  const next = await nextPending(conversation.syllabusId);
  const lastCard = await Message.findOne({ conversationId: conversation._id, kind: { $in: ['suggestion', 'submission-cta'] } })
    .sort({ createdAt: -1, _id: -1 });

  if (next) {
    if (lastCard && lastCard.kind === 'suggestion' && String(lastCard.relatedSuggestionId) === String(next._id)) {
      await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: next._id } });
      return next;
    }
    await postSuggestionCard(conversation, next);
    return next;
  }

  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: null } });
  if (!lastCard || lastCard.kind !== 'submission-cta') {
    await Message.create({ conversationId: conversation._id, role: 'ai', kind: 'submission-cta', content: SUBMISSION_CTA_TEXT });
  }
  return null;
}

/** POST /start: створити розмову (якщо немає) і показати першу pending-пропозицію. */
async function startConversation(syllabusId, userId) {
  const syllabus = await loadSyllabus(syllabusId);
  if (syllabus.status === 'submitted') {
    const conversation = await Conversation.findOne({ syllabusId });
    if (conversation) return conversation;
  } else {
    assertEditable(syllabus);
  }
  const conversation = await getOrCreateConversation(syllabusId, userId);
  if (syllabus.status !== 'submitted') await postNextCard(conversation);
  return conversation;
}

async function postUserMessage(conversation, content, suggestionId = null) {
  return Message.create({
    conversationId: conversation._id,
    role: 'user',
    kind: 'text',
    content,
    relatedSuggestionId: suggestionId,
  });
}

async function postAiMessage(conversation, content, suggestionId = null) {
  return Message.create({
    conversationId: conversation._id,
    role: 'ai',
    kind: 'text',
    content,
    relatedSuggestionId: suggestionId,
  });
}

/** Обгортка для LLM-викликів чату: лічильник збоїв поспіль, 503 retryable для користувача. */
async function withAiFailureTracking(conversation, fn, message) {
  try {
    const result = await fn();
    if (conversation.consecutiveAiFailures || conversation.status === 'error') {
      await Conversation.updateOne({ _id: conversation._id, status: { $ne: 'submitted' } },
        { $set: { consecutiveAiFailures: 0, status: 'active' } });
    }
    return result;
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) throw err;
    console.error('chat AI call failed:', err.message);
    const failures = (conversation.consecutiveAiFailures || 0) + 1;
    const update = { consecutiveAiFailures: failures };
    if (failures >= MAX_CONSECUTIVE_FAILURES) update.status = 'error';
    await Conversation.updateOne({ _id: conversation._id }, { $set: update });
    throw httpError(503, message || 'Не вдалося отримати відповідь AI. Спробуйте ще раз.', { retryable: true });
  }
}

module.exports = {
  MAX_CONSECUTIVE_FAILURES,
  greetingText,
  getOrCreateConversation,
  startConversation,
  nextPending,
  postSuggestionCard,
  postNextCard,
  postUserMessage,
  postAiMessage,
  withAiFailureTracking,
};
