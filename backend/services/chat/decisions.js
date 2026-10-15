// Рішення викладача над пропозиціями. Кожна зміна статусу — атомарний findOneAndUpdate
// з умовою на поточний статус. Після рішення: інвалідація outputs, readiness, наступна картка.

const Conversation = require('../../models/Conversation');
const Suggestion = require('../../models/Suggestion');
const { validateSuggestion, findConflicts, applyAccepted } = require('../document');
const { httpError } = require('../../utils/httpError');
const { metaOf, generateFor, variantFrom } = require('../ai/suggestionBuilder');
const {
  loadSyllabus, docOf, assertEditable, toDocSuggestion, loadAccepted, optionOf,
  requiresReason, invalidateOutputs, refreshConversationReadiness, REJECT_TAG_LABELS,
} = require('./state');
const {
  getOrCreateConversation, postNextCard, postUserMessage, postAiMessage, postSuggestionCard, withAiFailureTracking,
} = require('./flow');

const REJECT_TAGS = Suggestion.REJECT_TAGS;

async function loadSuggestion(syllabusId, suggestionId) {
  const s = await Suggestion.findOne({ _id: suggestionId, syllabusId });
  if (!s) throw httpError(404, 'Пропозицію не знайдено');
  return s;
}

function notPending() {
  return httpError(409, 'Цю пропозицію вже розглянуто. Оновіть сторінку.', { code: 'NOT_PENDING' });
}

async function context(syllabusId, suggestionId, userId) {
  const syllabus = await loadSyllabus(syllabusId);
  assertEditable(syllabus);
  const suggestion = await loadSuggestion(syllabusId, suggestionId);
  const conversation = await getOrCreateConversation(syllabusId, userId);
  return { syllabus, suggestion, conversation, doc: docOf(syllabus) };
}

async function afterDecision(conversation, { nextCard = true } = {}) {
  await invalidateOutputs(conversation.syllabusId);
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastDecisionAt: new Date() } });
  await refreshConversationReadiness(conversation.syllabusId);
  if (nextCard) await postNextCard(conversation);
}

function conflictList(conflicts, titles) {
  const ids = [...new Set(conflicts.map((c) => c.suggestionId))];
  return ids.map((id) => ({ suggestionId: id, title: titles.get(id) || '' }));
}

// ---------- accept ----------

async function acceptSuggestion(syllabusId, suggestionId, { optionId, conflictResolution } = {}, userId) {
  const { syllabus, suggestion: s, conversation, doc } = await context(syllabusId, suggestionId, userId);
  if (s.status !== 'pending') throw notPending();
  if (s.kind === 'question') {
    throw httpError(409, 'Спершу дайте відповідь на питання, щоб AI підготував правку.', { code: 'ANSWER_REQUIRED' });
  }
  if (s.applicable === false) {
    throw httpError(409, 'Це порада без готової правки: її можна лише відхилити або попросити AI переробити.', { code: 'NOT_APPLICABLE' });
  }
  if (s.docVersion && s.docVersion !== syllabus.document.docVersion) {
    throw httpError(409, 'Пропозиція підготовлена для іншої версії документа. Запустіть повторний аналіз.', { code: 'STALE_DOC_VERSION', retryable: true });
  }
  if (conflictResolution != null && conflictResolution !== 'replacePrevious') {
    throw httpError(400, 'Некоректне значення conflictResolution');
  }

  let selectedOptionId = null;
  if (s.kind === 'choice') {
    if (!optionId) throw httpError(400, 'Оберіть один із варіантів.', { code: 'OPTION_REQUIRED' });
    const option = optionOf(s, optionId);
    if (!option) throw httpError(400, 'Такого варіанта немає.');
    if (!(option.ops || []).length) {
      throw httpError(409, 'Для цього варіанта бракує даних. Уточніть деталі через «Змінити» або оберіть інший варіант.', { code: 'NOT_APPLICABLE' });
    }
    selectedOptionId = option.id;
  }

  const candidate = toDocSuggestion(s, selectedOptionId);
  const errors = validateSuggestion(doc, candidate, { strict: false });
  if (errors.length) {
    throw httpError(422, 'Правка цієї пропозиції некоректна. Попросіть AI переробити її.', { code: 'INVALID_OPS', details: { errors } });
  }

  const acceptedDocs = await loadAccepted(syllabusId);
  const titles = new Map(acceptedDocs.map((a) => [String(a._id), a.title]));
  const conflicts = conflictList(findConflicts(doc, acceptedDocs.map((a) => toDocSuggestion(a)), candidate), titles);
  const replace = conflictResolution === 'replacePrevious';
  if (conflicts.length && !replace) {
    throw httpError(409, 'Ця пропозиція змінює той самий текст, що й уже прийняті.', {
      code: 'SUGGESTION_CONFLICT', details: { conflicts },
    });
  }

  const now = new Date();
  const claimed = await Suggestion.findOneAndUpdate(
    { _id: s._id, status: 'pending' },
    {
      $set: { status: 'accepted', selectedOptionId, acceptedAt: now, decisionReason: null, rejectTag: null },
      $push: { decisionHistory: { action: 'accepted', at: now, by: userId, optionId: selectedOptionId || undefined } },
    },
    { new: true },
  );
  if (!claimed) throw notPending();

  if (replace) {
    for (const c of conflicts) {
      const reason = `Замінено пропозицією «${s.title}»`;
      await Suggestion.findOneAndUpdate(
        { _id: c.suggestionId, syllabusId, status: 'accepted' },
        {
          $set: { status: 'rejected', rejectTag: 'other', decisionReason: reason, acceptedAt: null, selectedOptionId: null },
          $push: { decisionHistory: { action: 'replaced', at: now, by: userId, reason, rejectTag: 'other' } },
        },
      );
    }
  } else {
    // Повторна перевірка після захоплення: паралельний accept міг додати конфліктну правку
    const others = (await loadAccepted(syllabusId)).filter((a) => String(a._id) !== String(s._id));
    const late = findConflicts(doc, others.map((a) => toDocSuggestion(a)), candidate);
    if (late.length) {
      await Suggestion.updateOne(
        { _id: s._id, status: 'accepted' },
        { $set: { status: 'pending', selectedOptionId: null, acceptedAt: null }, $pop: { decisionHistory: 1 } },
      );
      const lateTitles = new Map(others.map((a) => [String(a._id), a.title]));
      throw httpError(409, 'Ця пропозиція змінює той самий текст, що й уже прийняті.', {
        code: 'SUGGESTION_CONFLICT', details: { conflicts: conflictList(late, lateTitles) },
      });
    }
  }

  const option = selectedOptionId ? optionOf(s, selectedOptionId) : null;
  let text = option ? `Прийнято: «${s.title}» (варіант «${option.label}»).` : `Прийнято: «${s.title}».`;
  if (replace && conflicts.length) text += ` Замінено попередні: ${conflicts.map((c) => `«${c.title}»`).join(', ')}.`;
  await postUserMessage(conversation, text, s._id);
  await afterDecision(conversation);
}

// ---------- reject ----------

async function rejectSuggestion(syllabusId, suggestionId, { reason, rejectTag } = {}, userId) {
  const { suggestion: s, conversation } = await context(syllabusId, suggestionId, userId);
  if (s.status !== 'pending') throw notPending();
  const normalizedReason = String(reason || '').trim();
  if (rejectTag != null && !REJECT_TAGS.includes(rejectTag)) throw httpError(400, 'Некоректна категорія причини відхилення');
  if (requiresReason(s) && !normalizedReason) {
    throw httpError(400, 'Для критичних і важливих пропозицій потрібно вказати причину відхилення.', { code: 'REASON_REQUIRED' });
  }

  const now = new Date();
  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, status: 'pending' },
    {
      $set: { status: 'rejected', decisionReason: normalizedReason || null, rejectTag: rejectTag || null, selectedOptionId: null },
      $push: { decisionHistory: { action: 'rejected', at: now, by: userId, reason: normalizedReason || undefined, rejectTag: rejectTag || undefined } },
    },
    { new: true },
  );
  if (!updated) throw notPending();

  const parts = [`Відхилено: «${s.title}».`];
  if (rejectTag) parts.push(`Категорія: ${REJECT_TAG_LABELS[rejectTag]}.`);
  if (normalizedReason) parts.push(`Причина: ${normalizedReason}`);
  await postUserMessage(conversation, parts.join(' '), s._id);
  await afterDecision(conversation);
}

// ---------- reopen ----------

async function reopenSuggestion(syllabusId, suggestionId, userId) {
  const { suggestion: s, conversation } = await context(syllabusId, suggestionId, userId);
  if (!['accepted', 'rejected'].includes(s.status)) {
    throw httpError(409, 'Повторно відкрити можна лише розглянуту пропозицію.', { code: 'NOT_DECIDED' });
  }
  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, status: s.status },
    {
      $set: { status: 'pending', selectedOptionId: null, acceptedAt: null, decisionReason: null, rejectTag: null },
      $push: { decisionHistory: { action: 'reopened', at: new Date(), by: userId } },
    },
    { new: true },
  );
  if (!updated) throw httpError(409, 'Статус пропозиції щойно змінився. Оновіть сторінку.');

  await postUserMessage(conversation, `Повернутися до пропозиції «${s.title}».`, s._id);
  await afterDecision(conversation, { nextCard: false });
  await postSuggestionCard(conversation, updated);
}

// ---------- refine / answer ----------

function snapshotOf(s, feedback) {
  return {
    kind: s.kind,
    title: s.title,
    description: s.description,
    ops: JSON.parse(JSON.stringify(s.ops || [])),
    options: JSON.parse(JSON.stringify(s.options || [])),
    question: s.question,
    applicable: s.applicable,
    feedback,
    at: new Date(),
  };
}

function describePrevious(s) {
  if (s.kind === 'question') return `Previous variant asked the instructor: ${s.question}`;
  const ops = s.kind === 'choice' ? (s.options || []).map((o) => ({ id: o.id, label: o.label, ops: o.ops })) : s.ops;
  return `Previous variant (${s.kind}): ${JSON.stringify(ops)}`;
}

/**
 * Блоки для перегенерації: з mergeWithAccepted текст блоків, які змінюють конфліктні прийняті
 * пропозиції, замінюється на поточний (з прийнятими правками) — нова правка будується поверх нього.
 */
function mergeContext(doc, acceptedSuggestions, s) {
  const acceptedDocs = acceptedSuggestions.map((a) => toDocSuggestion(a));
  const candidates = s.kind === 'choice' ? (s.options || []).map((o) => toDocSuggestion(s, o.id)) : [toDocSuggestion(s)];
  const conflicts = candidates.flatMap((c) => findConflicts(doc, acceptedDocs, c));
  const conflictIds = [...new Set(conflicts.map((c) => c.suggestionId))];
  if (!conflictIds.length) return { blocks: doc.blocks, supersedes: [], note: '' };

  const applied = applyAccepted(doc, acceptedDocs);
  const current = new Map(applied.blocks.filter((b) => b.status === 'changed').map((b) => [b.id, b.text]));
  const touched = new Set(conflicts.map((c) => c.blockId));
  const blocks = doc.blocks.map((b) => (touched.has(b.id) && current.has(b.id) ? { ...b, text: current.get(b.id) } : b));
  const lines = [...touched].filter((id) => current.has(id)).map((id) => `[${id}] current accepted text: ${current.get(id)}`);
  const note = 'Some target paragraphs already contain changes the instructor accepted from other suggestions. '
    + 'The document below shows their CURRENT text. Build your edit on top of it and keep those accepted changes.\n'
    + lines.join('\n');
  return { blocks, supersedes: conflictIds, note };
}

async function regenerate(conversation, syllabus, s, { feedback, blocks, supersedes }) {
  const finding = s.finding || {
    id: s.findingId, criterionId: s.criterionId, group: s.group, severity: s.severity, claim: s.title, rationale: s.rationale,
  };
  const result = await withAiFailureTracking(
    conversation,
    () => generateFor({ finding, blocks, meta: metaOf(syllabus), feedback }),
    'Не вдалося переробити пропозицію. Спробуйте ще раз.',
  );
  const variant = variantFrom(result, finding);
  const set = {
    kind: variant.kind,
    title: variant.title,
    description: variant.description,
    rationale: variant.rationale,
    ops: variant.ops,
    options: variant.options,
    question: variant.question,
    applicable: variant.applicable,
    selectedOptionId: null,
  };
  if (supersedes) set.supersedes = supersedes;
  return set;
}

async function refineSuggestion(syllabusId, suggestionId, { feedback, mergeWithAccepted } = {}, userId, { postFeedback = true } = {}) {
  const { syllabus, suggestion: s, conversation, doc } = await context(syllabusId, suggestionId, userId);
  if (s.status !== 'pending') throw httpError(409, 'Змінювати можна лише нерозглянуту пропозицію. Спершу відкрийте її повторно.', { code: 'NOT_PENDING' });
  const text = String(feedback || '').trim();
  if (!text && !mergeWithAccepted) throw httpError(400, 'Напишіть, що саме змінити в пропозиції.');

  let blocks = doc.blocks;
  let supersedes;
  const notes = [];
  if (text) notes.push(`Instructor comment: ${text}`);
  notes.push(describePrevious(s));
  if (mergeWithAccepted) {
    const merge = mergeContext(doc, await loadAccepted(syllabusId), s);
    blocks = merge.blocks;
    supersedes = merge.supersedes;
    if (merge.note) notes.push(merge.note);
  }

  if (postFeedback) {
    const userText = text || 'Об\'єднати з уже прийнятими змінами.';
    await postUserMessage(conversation, userText, s._id);
  }
  const set = await regenerate(conversation, syllabus, s, { feedback: notes.join('\n\n'), blocks, supersedes });

  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, status: 'pending' },
    {
      $set: set,
      $push: {
        versions: snapshotOf(s, text || (mergeWithAccepted ? 'mergeWithAccepted' : '')),
        decisionHistory: { action: 'refined', at: new Date(), by: userId, feedback: text || undefined },
      },
    },
    { new: true },
  );
  if (!updated) throw notPending();

  await postAiMessage(conversation, updated.applicable === false && updated.kind !== 'question'
    ? 'Не вдалося підготувати коректну правку з урахуванням коментаря. Пропозицію залишено як пораду.'
    : 'Оновив пропозицію з урахуванням вашого коментаря.', s._id);
  await afterDecision(conversation, { nextCard: false });
  await postSuggestionCard(conversation, updated);
  return updated;
}

async function answerSuggestion(syllabusId, suggestionId, { answer } = {}, userId) {
  const { syllabus, suggestion: s, conversation, doc } = await context(syllabusId, suggestionId, userId);
  if (s.status !== 'pending') throw notPending();
  if (s.kind !== 'question') throw httpError(409, 'Ця пропозиція не містить питання.', { code: 'NOT_A_QUESTION' });
  const text = String(answer || '').trim();
  if (!text) throw httpError(400, 'Напишіть відповідь на питання.');

  await postUserMessage(conversation, text, s._id);
  const feedback = `The instructor answered the question "${s.question}": ${text}\nNow prepare the edit using these facts.`;
  const set = await regenerate(conversation, syllabus, s, { feedback, blocks: doc.blocks });

  const updated = await Suggestion.findOneAndUpdate(
    { _id: s._id, status: 'pending', kind: 'question' },
    {
      $set: { ...set, answer: text },
      $push: {
        versions: snapshotOf(s, text),
        decisionHistory: { action: 'answered', at: new Date(), by: userId, feedback: text },
      },
    },
    { new: true },
  );
  if (!updated) throw notPending();

  await postAiMessage(conversation, updated.kind === 'question'
    ? 'Дякую! Мені бракує ще кількох деталей.'
    : 'Дякую! Підготував правку з урахуванням вашої відповіді.', s._id);
  await afterDecision(conversation, { nextCard: false });
  await postSuggestionCard(conversation, updated);
  return updated;
}

module.exports = {
  acceptSuggestion,
  rejectSuggestion,
  reopenSuggestion,
  refineSuggestion,
  answerSuggestion,
  mergeContext,
};
