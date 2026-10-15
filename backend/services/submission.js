// Відправка силабусу академічному директору: gate (немає pending), атомарне захоплення,
// свіжі outputs, лист з tracked.docx + tracked.pdf і звітом.

const fs = require('fs').promises;
const Syllabus = require('../models/Syllabus');
const Suggestion = require('../models/Suggestion');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { httpError } = require('../utils/httpError');
const { ensureOutputs, downloadName, OUTPUTS } = require('./outputs');
const { isLegacy, SEVERITY_LABELS, GROUP_LABELS, REJECT_TAG_LABELS } = require('./chat/state');

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const FORMAT_LABELS = {
  pptx: 'PPTX',
  docx: 'DOCX',
  doc: 'DOC (сконвертовано в DOCX)',
  pdf: 'PDF (текст перенесено в DOCX, форматування оригіналу не збережено)',
};

function item(s) {
  return `  - [${SEVERITY_LABELS[s.severity] || s.severity}] ${s.title}${s.criterionId ? ` (${s.criterionId})` : ''}`;
}

function rejectedItem(s) {
  const parts = [item(s)];
  if (s.rejectTag) parts.push(`категорія: ${REJECT_TAG_LABELS[s.rejectTag] || s.rejectTag}`);
  if (s.decisionReason) parts.push(`причина: ${s.decisionReason}`);
  return parts.join(' — ');
}

function rubricHighlights(summary) {
  if (!summary || typeof summary !== 'object') return [];
  const lines = [];
  const c = summary.counts || {};
  const total = ['ok', 'issue', 'not_applicable', 'not_evaluated'].reduce((n, k) => n + (c[k] || 0), 0);
  if (total) {
    lines.push(`Критеріїв рубрики перевірено: ${total} (виконано: ${c.ok || 0}, проблем: ${c.issue || 0}, не застосовно: ${c.not_applicable || 0}${c.not_evaluated ? `, не оцінено: ${c.not_evaluated}` : ''}).`);
  }
  const issues = (summary.verdicts || []).filter((v) => v && v.verdict === 'issue').slice(0, 10);
  if (issues.length) {
    lines.push('Основні проблеми за рубрикою:');
    for (const v of issues) lines.push(`  - ${v.criterionId}${v.claim ? `: ${v.claim}` : ''}`);
  }
  const degraded = summary.stats?.degraded || [];
  if (degraded.length) lines.push(`Увага: частину перевірок виконано в спрощеному режимі (${degraded.join(', ')}).`);
  return lines;
}

/** Текстовий звіт для академічного директора (українською). */
function generateSubmissionReport(syllabus, suggestions) {
  const accepted = suggestions.filter((s) => s.status === 'accepted');
  const rejected = suggestions.filter((s) => s.status === 'rejected');
  const pending = suggestions.filter((s) => s.status === 'pending');
  const instructor = `${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim();
  const lines = [
    `Курс: ${syllabus.course?.name || syllabus.title}`,
    ...(instructor ? [`Викладач: ${instructor}`] : []),
    ...(syllabus.programId?.name ? [`Програма: ${syllabus.programId.name}`] : []),
    `Формат оригіналу: ${FORMAT_LABELS[syllabus.sourceFormat] || syllabus.sourceFormat || 'невідомо'}`,
    '',
    `Пропозицій AI: ${suggestions.length}; прийнято: ${accepted.length}, відхилено: ${rejected.length}${pending.length ? `, не розглянуто: ${pending.length}` : ''}.`,
    '',
    'За групами:',
  ];
  for (const [group, label] of Object.entries(GROUP_LABELS)) {
    const inGroup = suggestions.filter((s) => s.group === group);
    if (!inGroup.length) continue;
    lines.push(`  ${label}: ${inGroup.length} (прийнято ${inGroup.filter((s) => s.status === 'accepted').length}, відхилено ${inGroup.filter((s) => s.status === 'rejected').length})`);
  }
  lines.push('', 'За важливістю:');
  for (const sev of SEVERITY_ORDER) {
    const bySev = suggestions.filter((s) => s.severity === sev);
    if (!bySev.length) continue;
    lines.push(`  ${SEVERITY_LABELS[sev]}: ${bySev.length} (прийнято ${bySev.filter((s) => s.status === 'accepted').length}, відхилено ${bySev.filter((s) => s.status === 'rejected').length})`);
  }
  lines.push('', 'Прийняті пропозиції:');
  lines.push(...(accepted.length ? accepted.map((s) => `${item(s)}${s.applicable === false ? ' — порада, без зміни тексту' : ''}`) : ['  - немає']));
  lines.push('', 'Відхилені пропозиції:');
  lines.push(...(rejected.length ? rejected.map(rejectedItem) : ['  - немає']));
  const rubric = rubricHighlights(syllabus.rubricSummary);
  if (rubric.length) lines.push('', ...rubric);
  return lines.join('\n');
}

/**
 * Збирає вкладення (tracked.docx + tracked.pdf) і надсилає лист директору.
 * PDF необов'язковий: якщо LibreOffice недоступний, лист іде з DOCX і приміткою у звіті.
 * @returns {Promise<'sent'|'failed'>}
 */
async function sendSubmissionEmail(syllabus, { fresh = false } = {}) {
  const adEmail = syllabus.programId?.academicDirectorEmail;
  if (!adEmail) {
    console.warn(`submission: no AD email for program ${syllabus.programId?._id}`);
    return 'failed';
  }
  const { sendSubmissionToAdEmail } = require('./emailService');
  const suggestions = await Suggestion.find({ syllabusId: syllabus._id }).sort({ order: 1, _id: 1 }).lean();
  let summaryText = generateSubmissionReport(syllabus, suggestions);

  const attachments = [];
  const primary = syllabus.sourceFormat === 'pptx' ? ['edited.pptx']
    : syllabus.sourceFormat === 'pdf' ? ['annotated.pdf', 'tracked.docx'] : ['tracked.docx'];
  const addAttachment = async (name) => {
    const key = OUTPUTS[name].key;
    const files = await ensureOutputs(syllabus._id, [key], { fresh });
    attachments.push({ filename: downloadName(syllabus, name),
      content: files[key].buffer || await fs.readFile(files[key].path), contentType: OUTPUTS[name].contentType });
  };
  for (const name of primary) await addAttachment(name);
  try {
    await addAttachment(syllabus.sourceFormat === 'pptx' ? 'preview.pdf' : 'tracked.pdf');
  } catch (err) {
    // Презентація за контрактом надсилається разом із PDF; помилку рендеру треба виправити до submit.
    if (syllabus.sourceFormat === 'pptx') throw err;
    console.error('submission: tracked PDF failed:', err.message);
    summaryText += '\n\nPDF-версію правок не вдалося згенерувати; правки додано у форматі DOCX.';
  }

  try {
    const info = await sendSubmissionToAdEmail({ adEmail, syllabusMeta: syllabus, summaryText, attachments });
    return info?.skipped ? 'failed' : 'sent';
  } catch (err) {
    console.error('Submission email failed:', err.message);
    return 'failed';
  }
}

/** Legacy (до v4): повторна відправка збереженого PDF старого пайплайну. */
async function sendLegacySubmissionEmail(syllabus) {
  const adEmail = syllabus.programId?.academicDirectorEmail;
  if (!adEmail) return 'failed';
  let content;
  try { content = await fs.readFile(syllabus.submittedPdfPath); } catch {
    throw httpError(409, 'Фінальний PDF цього силабусу (попередня версія системи) не збережено. Повторна відправка неможлива.', { code: 'LEGACY_SYLLABUS' });
  }
  const { sendSubmissionToAdEmail } = require('./emailService');
  const info = await sendSubmissionToAdEmail({
    adEmail,
    syllabusMeta: syllabus,
    summaryText: `Курс: ${syllabus.course?.name || syllabus.title}\nСилабус оброблено попередньою версією системи; деталі рішень у звіті недоступні.`,
    attachments: [{ filename: `${syllabus.course?.name || 'syllabus'}.pdf`, content, contentType: 'application/pdf' }],
  });
  return info?.skipped ? 'failed' : 'sent';
}

async function submitSyllabus(syllabusId) {
  // Атомарне захоплення: паралельний submit отримає 409, а не відправить лист двічі
  const claimed = await Syllabus.findOneAndUpdate(
    { _id: syllabusId, status: 'in_progress', submitting: { $ne: true }, legacy: { $ne: true } },
    { $set: { submitting: true } },
    { new: true },
  )
    .populate('programId', 'name academicDirectorEmail')
    .populate('instructor', 'firstName lastName email');
  if (!claimed) {
    const existing = await Syllabus.findById(syllabusId).select('status legacy document.docVersion');
    if (!existing) throw httpError(404, 'Силабус не знайдено');
    if (isLegacy(existing)) {
      throw httpError(409, 'Цей силабус створено в попередній версії системи. Завантажте файл ще раз, щоб відправити його.', { code: 'LEGACY_SYLLABUS' });
    }
    if (existing.status === 'submitted') throw httpError(409, 'Силабус уже відправлено', { code: 'ALREADY_SUBMITTED' });
    if (existing.status !== 'in_progress') throw httpError(409, 'Силабус ще не готовий до відправки: аналіз не завершено.');
    throw httpError(409, 'Відправка вже триває', { code: 'SUBMIT_IN_PROGRESS' });
  }

  try {
    const pending = await Suggestion.find({ syllabusId, status: 'pending' }).sort({ order: 1 }).select('title severity').lean();
    if (pending.length) {
      throw httpError(409, `Силабус ще не готовий до відправки: нерозглянутих пропозицій — ${pending.length}.`, {
        code: 'PENDING_SUGGESTIONS',
        details: { pending: pending.map((s) => ({ suggestionId: String(s._id), title: s.title, severity: s.severity })) },
      });
    }
    const emailStatus = await sendSubmissionEmail(claimed, { fresh: true });

    await Syllabus.updateOne({ _id: syllabusId }, {
      $set: { status: 'submitted', submitting: false, submittedAt: new Date(), submissionEmailStatus: emailStatus },
    });
    const conversation = await Conversation.findOneAndUpdate(
      { syllabusId },
      { $set: { status: 'submitted', currentSuggestionId: null } },
      { new: true },
    );
    if (conversation) {
      const adEmail = claimed.programId?.academicDirectorEmail;
      const courseName = claimed.course?.name || claimed.title || 'ваш силабус';
      await Message.create({
        conversationId: conversation._id,
        role: 'ai',
        kind: 'text',
        content: emailStatus === 'sent'
          ? `Силабус **${courseName}** відправлено. Лист із файлами силабусу та звітом надіслано академічному директору (${adEmail}).`
          : `Силабус **${courseName}** відправлено, але лист академічному директору не вдалося доставити. Зверніться, будь ласка, до офісу програми.`,
      });
    }
    return { emailStatus };
  } catch (err) {
    await Syllabus.updateOne({ _id: syllabusId }, { $set: { submitting: false } }).catch(() => {});
    throw err;
  }
}

module.exports = { submitSyllabus, sendSubmissionEmail, sendLegacySubmissionEmail, generateSubmissionReport };
