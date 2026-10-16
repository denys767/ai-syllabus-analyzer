// Спільний стан чату: силабус і його DocModel, пропозиції у форматі services/document,
// множина прийнятих, інвалідація outputs і readiness.

const fs = require('fs');
const crypto = require('crypto');
const Syllabus = require('../../models/Syllabus');
const Suggestion = require('../../models/Suggestion');
const Conversation = require('../../models/Conversation');
const { httpError } = require('../../utils/httpError');
const { computeReadiness } = require('./readiness');

const SEVERITY_LABELS = { critical: 'критична', high: 'важлива', medium: 'середня', low: 'незначна' };
const GROUP_LABELS = {
  template: 'Шаблон KSE',
  outcomes: 'Результати навчання',
  assessment: 'Оцінювання',
  practice: 'Практика і кейси',
  policy: 'Політики курсу',
};
const REJECT_TAG_LABELS = {
  already_present: 'вже є в тексті',
  too_generic: 'занадто загально',
  incorrect: 'неправильно',
  not_relevant: 'не стосується курсу',
  other: 'інше',
};

function requiresReason(s) {
  return s.severity === 'critical' || s.severity === 'high';
}

async function loadSyllabus(syllabusId, select) {
  const query = Syllabus.findById(syllabusId);
  if (select) query.select(select);
  const syllabus = await query;
  if (!syllabus) throw httpError(404, 'Силабус не знайдено');
  return syllabus;
}

function isLegacy(syllabus) {
  // docVersion і blocks записуються разом (етап extract), тож достатньо перевірити docVersion
  return Boolean(syllabus.legacy) || !syllabus.document?.docVersion;
}

function legacyError() {
  return httpError(409, 'Цей силабус створено в попередній версії системи, тому його можна лише переглядати. Щоб продовжити роботу з пропозиціями, завантажте файл силабусу ще раз.', { code: 'LEGACY_SYLLABUS' });
}

/** DocModel із збереженого Syllabus.document (для apply/validate/preview без XML). */
function docOf(syllabus) {
  if (isLegacy(syllabus)) throw legacyError();
  return { ...syllabus.document.toObject?.() || syllabus.document, format: syllabus.sourceFormat === 'pptx' ? 'pptx' : 'docx' };
}

/** Рішення в чаті можливі лише для проаналізованого і ще не відправленого силабусу. */
function assertEditable(syllabus) {
  if (isLegacy(syllabus)) throw legacyError();
  if (syllabus.status === 'submitted') throw httpError(409, 'Силабус уже відправлено, змінювати рішення не можна.', { code: 'ALREADY_SUBMITTED' });
  if (syllabus.status === 'analyzing') throw httpError(409, 'Аналіз ще триває. Зачекайте, будь ласка.', { code: 'ANALYSIS_IN_PROGRESS' });
  if (syllabus.status === 'error') throw httpError(409, 'Аналіз завершився з помилкою. Запустіть аналіз повторно.', { code: 'ANALYSIS_FAILED' });
}

function optionOf(s, optionId) {
  return (s.options || []).find((o) => o.id === optionId) || null;
}

/** Операції пропозиції: для choice — вибраного (або явно переданого) варіанта. */
function opsOf(s, optionId) {
  if (s.kind === 'choice') {
    const option = optionOf(s, optionId || s.selectedOptionId);
    return option ? (option.ops || []) : [];
  }
  return s.ops || [];
}

/** Пропозиція у форматі services/document: { id, ops, supersedes, rationale }. */
function toDocSuggestion(s, optionId) {
  const option = s.kind === 'choice' ? optionOf(s, optionId || s.selectedOptionId) : null;
  const plain = (v) => JSON.parse(JSON.stringify(v || []));
  return {
    id: String(s._id),
    ops: plain(opsOf(s, optionId)),
    supersedes: (s.supersedes || []).map(String),
    rationale: (option && option.rationale) || s.rationale || s.description || s.title || '',
  };
}

/** Прийняті пропозиції в порядку прийняття (у ньому ж застосовуються і зливаються правки). */
async function loadAccepted(syllabusId) {
  return Suggestion.find({ syllabusId, status: 'accepted' }).sort({ acceptedAt: 1, _id: 1 });
}

/** Прийняті з реальними правками (поради без ops документ не змінюють) — вхід для writer-а. */
async function loadAcceptedDocs(syllabusId) {
  return (await loadAccepted(syllabusId)).map((s) => toDocSuggestion(s)).filter((d) => d.ops.length > 0);
}

/** Хеш множини прийнятих правок: ключ кешу outputs. */
function acceptedHash(docSuggestions) {
  const canonical = docSuggestions.map((s) => ({ id: s.id, ops: s.ops, supersedes: s.supersedes, rationale: s.rationale }));
  return crypto.createHash('sha1').update(JSON.stringify(canonical)).digest('hex');
}

/** Після будь-якого рішення: прибрати кеш фінальних файлів (ключ кешу і так зміниться). */
async function invalidateOutputs(syllabusId) {
  const prev = await Syllabus.findOneAndUpdate({ _id: syllabusId }, { $unset: { outputs: '' } }, { new: false })
    .select('outputs').lean();
  for (const out of Object.values(prev?.outputs || {})) {
    if (out?.path) await fs.promises.unlink(out.path).catch(() => {});
  }
}

async function readinessFor(syllabusId) {
  const items = await Suggestion.find({ syllabusId }).select('group status').lean();
  return computeReadiness(items);
}

/** Перераховує знімок readiness у Conversation. */
async function refreshConversationReadiness(syllabusId) {
  const readiness = await readinessFor(syllabusId);
  await Conversation.updateOne({ syllabusId }, { $set: { readiness } });
  return readiness;
}

module.exports = {
  SEVERITY_LABELS,
  GROUP_LABELS,
  REJECT_TAG_LABELS,
  requiresReason,
  loadSyllabus,
  isLegacy,
  legacyError,
  docOf,
  assertEditable,
  optionOf,
  opsOf,
  toDocSuggestion,
  loadAccepted,
  loadAcceptedDocs,
  acceptedHash,
  invalidateOutputs,
  readinessFor,
  refreshConversationReadiness,
};
