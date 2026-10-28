// Потік розмови v5: створення з привітанням (трек 1 — питання, трек 2 — «Here's what I found…»),
// «наступний крок» після кожного рішення (картка або питання інтерв'юера), skip, лічильник збоїв AI.

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const Suggestion = require('../../models/Suggestion');
const { httpError } = require('../../utils/httpError');
const interviewer = require('../ai/prompts/interviewer');
const { loadContext, buildReadiness, refreshConversationReadiness, BLOCKING_SEVERITIES } = require('./state');
const { approvableSections } = require('./sections');
const { policyDecided } = require('../syllabusState/slots');

const MAX_CONSECUTIVE_FAILURES = 3;
const TRANSCRIPT_LIMIT = 12;
const DONE_TEXT = 'That is everything I can ask about for now. Review the sections on the left, approve them, and download the .docx whenever you like.';

async function nextPending(syllabusId) {
  return Suggestion.findOne({ syllabusId, status: 'pending' }).sort({ order: 1, _id: 1 });
}

async function say(conversation, fields) {
  return Message.create({ conversationId: conversation._id, role: 'ai', kind: 'text', ...fields });
}

const postAiMessage = (conversation, content, suggestionId = null) => say(conversation, { content, relatedSuggestionId: suggestionId });

const postUserMessage = (conversation, content, suggestionId = null) => Message.create({
  conversationId: conversation._id, role: 'user', kind: 'text', content, relatedSuggestionId: suggestionId,
});

/** Повідомлення-картка для пропозиції (вміст будується на льоту з Suggestion). */
async function postSuggestionCard(conversation, suggestion) {
  await say(conversation, { kind: 'suggestion', content: suggestion.title, relatedSuggestionId: suggestion._id });
  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: suggestion._id } });
}

const lastMessage = (conversation, kinds) => Message.findOne({ conversationId: conversation._id, ...(kinds ? { kind: { $in: kinds } } : {}) })
  .sort({ createdAt: -1, _id: -1 });

/** Репліки розмови для промптів: transcript (останні) і лише слова викладача (для сканера фактів). */
async function transcriptOf(conversation, limit = TRANSCRIPT_LIMIT) {
  const rows = (await Message.find({ conversationId: conversation._id, kind: { $in: ['text', 'question'] } })
    .sort({ createdAt: -1, _id: -1 }).limit(limit).lean()).reverse();
  return {
    transcript: rows.map((m) => `${m.role === 'user' ? 'Instructor' : 'Assistant'}: ${m.content}`),
    instructorLines: rows.filter((m) => m.role === 'user').map((m) => m.content),
  };
}

// ---------- Привітання ----------

function scratchGreeting(syllabus) {
  return `Hi! I'll help you build the syllabus for "${syllabus.title}" step by step. I'll ask one question at a time; you can skip any of them and come back later. You can download the .docx at any moment.`;
}

function uploadGreeting(ctx, readiness, checks) {
  const sections = ctx.refs.template.filter((t) => readiness.sections[t.key]);
  const empty = sections.filter((t) => readiness.sections[t.key].status === 'empty');
  const lines = [
    `Here's what I found in your file: ${sections.length - empty.length} of ${sections.length} sections have content`
      + (empty.length ? `, and ${empty.length} ${empty.length > 1 ? 'are' : 'is'} still empty (${empty.map((t) => t.title).join(', ')}).` : '.'),
  ];
  const main = checks.filter((c) => c.passed === false && BLOCKING_SEVERITIES.includes(c.severity)).slice(0, 3);
  if (main.length) lines.push(`Main issues: ${main.map((c) => c.message).join(' ')}`);
  else lines.push('I found no critical issues.');
  return lines.join(' ');
}

// ---------- Питання інтерв'юера ----------

/**
 * Запасне питання, поки інтерв'юер не реалізовано: питання TemplateSection першого порожнього (потім неповного) розділу.
 * Для політик — вибір першого невирішеного library-блоку (картка policy-choice), а не вільне питання.
 */
function fallbackQuestion(ctx, readiness, skipped) {
  const status = (t) => readiness.sections[t.key]?.status;
  const policyQuestion = (t) => {
    const p = (ctx.state.policies || []).find((x) => x.mode === 'library' && !policyDecided(x) && !skipped.includes(x.key));
    if (!p) return null;
    const title = (ctx.refs.policyLibrary?.blocks || []).find((b) => b.key === p.key)?.title || p.key;
    return { slotKey: p.key, policyKey: p.key, question: `Which option fits your course for "${title}"?`, why: `The policy "${title}" has no decision yet.` };
  };
  const ask = (t) => {
    if (t.key === 'policies') return policyQuestion(t);
    return {
      slotKey: t.key,
      question: t.question,
      why: status(t) === 'empty' ? `The section "${t.title}" is still empty.` : `The section "${t.title}" is not complete yet.`,
    };
  };
  const open = (t) => (t.question || t.key === 'policies') && !skipped.includes(t.key) && !readiness.sections[t.key]?.approved;
  const candidates = [
    ...ctx.refs.template.filter((t) => open(t) && status(t) === 'empty'),
    ...ctx.refs.template.filter((t) => open(t) && status(t) !== 'empty' && !readiness.sections[t.key]?.complete),
  ];
  for (const t of candidates) {
    const q = ask(t);
    if (q) return q;
  }
  return null;
}

async function pickQuestion(conversation, ctx) {
  const skipped = conversation.skippedSlots || [];
  const { readiness } = await buildReadiness(ctx);
  let q;
  try {
    const { transcript } = await transcriptOf(conversation);
    q = await interviewer.nextQuestion({ state: ctx.state, refs: ctx.refs, transcript, skipped });
  } catch (err) {
    if (err.code !== 'NOT_IMPLEMENTED') console.error('interviewer failed, using the template question:', err.message);
    q = undefined;
  }
  if (q === null) return null;
  if (!q || !q.slotKey || !q.question || skipped.includes(q.slotKey)) return fallbackQuestion(ctx, readiness, skipped);
  return q;
}

/**
 * Наступний крок розмови: найвища pending-картка (за order), інакше питання інтерв'юера, інакше підсумок.
 * Не дублює картку/питання, які вже є останніми в чаті.
 * @returns {Promise<{ suggestion?: object, question?: object }|null>}
 */
async function postNextStep(conversation, { preferQuestion = false } = {}) {
  const ctx = await loadContext(conversation.syllabusId);
  const next = preferQuestion ? null : await nextPending(conversation.syllabusId);
  if (next) {
    const lastCard = await lastMessage(conversation, ['suggestion', 'question']);
    if (lastCard && lastCard.kind === 'suggestion' && String(lastCard.relatedSuggestionId) === String(next._id)) {
      await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: next._id } });
    } else {
      await postSuggestionCard(conversation, next);
    }
    return { suggestion: next };
  }

  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSuggestionId: null } });
  const fresh = await Conversation.findById(conversation._id);
  const q = await pickQuestion(fresh, ctx);
  const last = await lastMessage(conversation);
  if (!q) {
    if (!(last && last.role === 'ai' && last.content === DONE_TEXT)) await postAiMessage(conversation, DONE_TEXT);
    await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: null } });
    return null;
  }
  const policyKey = q.policyKey || (q.slotKey.startsWith('policy.') ? q.slotKey : null);
  const kind = policyKey ? 'policy-choice' : 'question';
  const repeated = last && last.kind === kind && last.payload?.slotKey === q.slotKey;
  if (!repeated) {
    await say(conversation, {
      kind, content: q.question, payload: { slotKey: q.slotKey, ...(policyKey ? { policyKey } : {}), question: q.question, why: q.why || '' },
    });
  }
  await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: q.slotKey } });
  return { question: q };
}

// ---------- Розмова ----------

/** @returns {Promise<{ conversation, created: boolean }>} */
async function ensureConversation(syllabusId, userId) {
  const existing = await Conversation.findOne({ syllabusId });
  if (existing) return { conversation: existing, created: false };
  try {
    return { conversation: await Conversation.create({ syllabusId, instructorId: userId }), created: true };
  } catch (err) {
    // Паралельний /start уже створив розмову
    if (err.code === 11000) return { conversation: await Conversation.findOne({ syllabusId }), created: false };
    throw err;
  }
}

const getOrCreateConversation = async (syllabusId, userId) => (await ensureConversation(syllabusId, userId)).conversation;

/** POST /start (ідемпотентно): привітання один раз, далі перший крок. */
async function startConversation(syllabusId, userId) {
  const ctx = await loadContext(syllabusId);
  const { conversation, created } = await ensureConversation(syllabusId, userId);
  if (created) {
    if (ctx.syllabus.track === 'scratch') {
      await postAiMessage(conversation, scratchGreeting(ctx.syllabus));
      await postNextStep(conversation, { preferQuestion: true });
    } else {
      const { readiness, checks } = await buildReadiness(ctx);
      await postAiMessage(conversation, uploadGreeting(ctx, readiness, checks));
      const sections = await approvableSections(ctx);
      if (sections.length) {
        await say(conversation, {
          kind: 'approve-all',
          content: `${sections.length} section${sections.length > 1 ? 's need' : ' needs'} no changes. Approve ${sections.length > 1 ? 'them all' : 'it'}?`,
          payload: { sections },
        });
      }
    }
  }
  if (!created || ctx.syllabus.track !== 'scratch' || await nextPending(syllabusId)) await postNextStep(conversation);
  await refreshConversationReadiness(syllabusId);
  return conversation;
}

/** POST /skip: слот лишається порожнім (видно ліворуч), інтерв'юер його більше не питає. */
async function skipSlot(syllabusId, slotKey, userId) {
  await loadContext(syllabusId);
  const conversation = await getOrCreateConversation(syllabusId, userId);
  await Conversation.updateOne({ _id: conversation._id }, { $addToSet: { skippedSlots: slotKey } });
  const fresh = await Conversation.findById(conversation._id);
  if (fresh.currentSlotKey === slotKey) await Conversation.updateOne({ _id: conversation._id }, { $set: { currentSlotKey: null } });
  await postNextStep(fresh, { preferQuestion: true });
  return fresh;
}

/** Обгортка для LLM-викликів чату: лічильник збоїв поспіль, 503 retryable для користувача. */
async function withAiFailureTracking(conversation, fn, message) {
  try {
    const result = await fn();
    if (conversation.consecutiveAiFailures || conversation.status === 'error') {
      await Conversation.updateOne({ _id: conversation._id }, { $set: { consecutiveAiFailures: 0, status: 'active' } });
    }
    return result;
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) throw err;
    console.error('chat AI call failed:', err.message);
    const failures = (conversation.consecutiveAiFailures || 0) + 1;
    const update = { consecutiveAiFailures: failures };
    if (failures >= MAX_CONSECUTIVE_FAILURES) update.status = 'error';
    await Conversation.updateOne({ _id: conversation._id }, { $set: update });
    throw httpError(503, message || 'The AI could not respond. Please try again.', { retryable: true });
  }
}

module.exports = {
  MAX_CONSECUTIVE_FAILURES,
  getOrCreateConversation,
  ensureConversation,
  startConversation,
  skipSlot,
  nextPending,
  postSuggestionCard,
  postNextStep,
  postUserMessage,
  postAiMessage,
  transcriptOf,
  withAiFailureTracking,
};
