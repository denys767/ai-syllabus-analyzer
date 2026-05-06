const fs = require('fs');
const path = require('path');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Syllabus = require('../models/Syllabus');
const aiService = require('./aiService');

const MAX_CONSECUTIVE_FAILURES = 3;

// Maps every recommendation category to one of the four readiness blocks tracked by the spec.
const CATEGORY_TO_BLOCK = {
  'template-compliance': 'templateCompliance',
  'content-quality': 'templateCompliance',
  'other': 'templateCompliance',
  'learning-objectives': 'learningOutcomes',
  'cases': 'cases',
  'policy': 'policies',
};

const BLOCK_KEYS = ['templateCompliance', 'learningOutcomes', 'cases', 'policies'];

function blockOf(category) {
  return CATEGORY_TO_BLOCK[category] || 'templateCompliance';
}

function findIssue(syllabus, issueId) {
  return (syllabus.recommendations || []).find((r) => r.id === issueId);
}

function nextPendingIssue(syllabus) {
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  const pending = (syllabus.recommendations || []).filter((r) => r.decision === 'pending');
  pending.sort((a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0));
  return pending[0] || null;
}

function isBlockingRejectedIssue(rec) {
  return rec?.decision === 'rejected' && ['critical', 'high'].includes(rec.priority);
}

function getIssueCounts(syllabus) {
  const recs = syllabus.recommendations || [];
  return {
    open: recs.filter((r) => r.decision === 'pending').length,
    resolved: recs.filter((r) => r.decision === 'accepted').length,
    rejected: recs.filter((r) => r.decision === 'rejected').length,
    blockers: recs.filter(isBlockingRejectedIssue).length,
  };
}

function getFinalGateError(syllabus) {
  const pending = (syllabus.recommendations || []).filter((r) => r.decision === 'pending');
  const blockers = (syllabus.recommendations || []).filter(isBlockingRejectedIssue);
  if (!pending.length && !blockers.length) return null;

  const parts = [];
  if (pending.length) parts.push(`${pending.length} open issue${pending.length === 1 ? '' : 's'}`);
  if (blockers.length) parts.push(`${blockers.length} declined critical/high blocker${blockers.length === 1 ? '' : 's'}`);
  const err = new Error(`Syllabus is not ready for final preview or submission: ${parts.join(', ')}`);
  err.statusCode = 409;
  err.pendingIssues = pending.map((r) => ({ id: r.id, title: r.title, priority: r.priority }));
  err.blockers = blockers.map((r) => ({ id: r.id, title: r.title, priority: r.priority }));
  return err;
}

function assertReadyForFinal(syllabus) {
  const err = getFinalGateError(syllabus);
  if (err) throw err;
}

async function recomputeReadiness(conversation, syllabus) {
  const recs = syllabus.recommendations || [];
  const totals = { templateCompliance: 0, learningOutcomes: 0, cases: 0, policies: 0 };
  const resolved = { templateCompliance: 0, learningOutcomes: 0, cases: 0, policies: 0 };
  for (const rec of recs) {
    const block = blockOf(rec.category);
    totals[block] += 1;
    if (rec.decision === 'accepted') resolved[block] += 1;
  }
  const breakdown = {};
  for (const k of BLOCK_KEYS) {
    breakdown[k] = totals[k] === 0 ? 100 : Math.round((resolved[k] / totals[k]) * 100);
  }
  const weights = conversation.readiness?.weights || Conversation.DEFAULT_WEIGHTS;
  const score = Math.round(
    BLOCK_KEYS.reduce((sum, k) => sum + (weights[k] || 0) * breakdown[k], 0)
  );
  conversation.readiness.breakdown = breakdown;
  conversation.readiness.score = score;
  return conversation;
}

async function getOrCreateConversation(syllabusId, userId) {
  let convo = await Conversation.findOne({ syllabusId });
  if (convo) return convo;

  const syllabus = await Syllabus.findById(syllabusId);
  if (!syllabus) throw Object.assign(new Error('Syllabus not found'), { statusCode: 404 });

  convo = await Conversation.create({
    syllabusId,
    instructorId: userId,
    currentIssueId: null,
  });
  await recomputeReadiness(convo, syllabus);
  await convo.save();

  // Seed a system summary message describing what the AI found.
  const recs = syllabus.recommendations || [];
  const critical = recs.filter((r) => r.priority === 'critical' && r.decision === 'pending').length;
  const improvements = recs.filter((r) => r.priority !== 'critical' && r.decision === 'pending').length;
  const summary = recs.length === 0
    ? `Hi! I've finished analysing "${syllabus.title}" and didn't find any blocking issues. You can preview the final syllabus or upload a new one anytime.`
    : `Hi! I've finished analysing "${syllabus.title}". I found ${critical} critical issue${critical === 1 ? '' : 's'} and ${improvements} area${improvements === 1 ? '' : 's'} to improve. Let's walk through them one at a time.`;

  await Message.create({
    conversationId: convo._id,
    role: 'ai',
    kind: 'text',
    content: summary,
  });

  return convo;
}

async function nextIssueMessage(conversation) {
  const syllabus = await Syllabus.findById(conversation.syllabusId);
  if (!syllabus) throw Object.assign(new Error('Syllabus not found'), { statusCode: 404 });

  const activeIssue = conversation.currentIssueId ? findIssue(syllabus, conversation.currentIssueId) : null;
  const issue = activeIssue?.decision === 'pending' ? activeIssue : nextPendingIssue(syllabus);
  if (!issue) {
    // All decisions made — surface the submission CTA.
    if (conversation.currentIssueId !== null) {
      conversation.currentIssueId = null;
      await conversation.save();
    }

    const blockers = (syllabus.recommendations || []).filter(isBlockingRejectedIssue);
    if (blockers.length) {
      await Message.deleteMany({ conversationId: conversation._id, kind: 'submission-cta' });
      const blockerTitles = blockers.map((rec) => `- ${rec.title} (${rec.priority})`).join('\n');
      const content = `Syllabus is not ready for submission yet. The following critical/high issues were declined and must be resolved before preview or submission:\n${blockerTitles}`;
      const existingWarning = await Message.findOne({
        conversationId: conversation._id,
        role: 'ai',
        kind: 'text',
        content: /^Syllabus is not ready for submission yet\./,
      }).sort({ createdAt: -1 });
      if (!existingWarning) {
        await Message.create({
          conversationId: conversation._id,
          role: 'ai',
          kind: 'text',
          content,
        });
      }
      return null;
    }

    const existingCta = await Message.findOne({ conversationId: conversation._id, kind: 'submission-cta' }).sort({ createdAt: -1 });
    if (!existingCta) {
      await Message.create({
        conversationId: conversation._id,
        role: 'ai',
        kind: 'submission-cta',
        content: 'Syllabus ready for submission. All required criteria are met. The Academic Director will receive a summary report automatically.',
      });
    }
    return null;
  }

  const alreadyCurrent = conversation.currentIssueId === issue.id;

  // Cache miss → backfill via live LLM call.
  const currentSyllabusText = aiService.getEditableSyllabusText(syllabus);
  const missingPreview = !issue.beforeAfter || (!issue.beforeAfter.before && !issue.beforeAfter.after);
  const previewKind = issue.beforeAfter?.kind || 'before-after';
  const stalePreview = previewKind === 'before-after'
    && !aiService.isBeforeAfterApplicable(currentSyllabusText, issue.beforeAfter);

  if (alreadyCurrent && !missingPreview && !stalePreview) return issue;

  if (missingPreview || stalePreview) {
    try {
      const ba = await aiService.generateIssueMessage(syllabus, issue);
      issue.beforeAfter = ba;
      await syllabus.save();
      conversation.consecutiveAiFailures = 0;
    } catch (err) {
      conversation.consecutiveAiFailures = (conversation.consecutiveAiFailures || 0) + 1;
      if (conversation.consecutiveAiFailures >= MAX_CONSECUTIVE_FAILURES) {
        conversation.status = 'error';
      }
      await conversation.save();
      const e = new Error('AI generation failed; please retry');
      e.statusCode = 503;
      e.retryable = true;
      throw e;
    }
  }

  const issueMessage = {
    conversationId: conversation._id,
    role: 'ai',
    kind: issue.beforeAfter.kind || 'before-after',
    content: `${issue.title}\n\n${issue.description}`,
    payload: {
      before: issue.beforeAfter.before,
      after: issue.beforeAfter.after,
      ...(issue.beforeAfter.payload || {}),
    },
    relatedIssueId: issue.id,
  };

  if (alreadyCurrent) {
    const updated = await Message.findOneAndUpdate(
      { conversationId: conversation._id, relatedIssueId: issue.id, role: 'ai' },
      { $set: issueMessage },
      { sort: { createdAt: -1 }, new: true }
    );
    if (!updated) await Message.create(issueMessage);
    await conversation.save();
    return issue;
  }

  await Message.create(issueMessage);

  conversation.currentIssueId = issue.id;
  await conversation.save();
  return issue;
}

async function applyDecision(conversation, issueId, decision, selection = null) {
  const syllabus = await Syllabus.findById(conversation.syllabusId);
  if (!syllabus) {
    const e = new Error('Syllabus not found');
    e.statusCode = 404;
    throw e;
  }

  const issue = findIssue(syllabus, issueId);
  if (!issue || issue.decision !== 'pending') {
    const e = new Error('Issue not pending or not found');
    e.statusCode = 409;
    throw e;
  }

  if (decision === 'accepted') {
    if (!issue.beforeAfter) {
      const e = new Error('Issue does not have a Before/After preview to apply');
      e.statusCode = 409;
      throw e;
    }
    const currentText = aiService.getEditableSyllabusText(syllabus);
    try {
      const applied = aiService.applyIssuePreviewToTextWithTrace(currentText, issue.beforeAfter, selection);
      syllabus.editedText = applied.text;
      syllabus.revisionMarkup = aiService.applyBeforeAfterToRevisionMarkup(
        syllabus.revisionMarkup || currentText,
        applied.trace
      );
      if (issue.beforeAfter.kind && issue.beforeAfter.kind !== 'before-after') {
        issue.beforeAfter.payload = {
          ...(issue.beforeAfter.payload || {}),
          appliedSelection: selection || {},
          appliedText: applied.appliedText,
        };
      }
      if (syllabus.previewPdf?.path) {
        try { await fs.promises.unlink(syllabus.previewPdf.path); } catch { /* best-effort stale preview cleanup */ }
      }
      syllabus.previewPdf = undefined;
      syllabus.editingStatus = 'ready';
    } catch (err) {
      err.statusCode = ['STALE_BEFORE_AFTER', 'INVALID_SELECTION', 'INVALID_BEFORE_AFTER'].includes(err.code) ? 409 : 500;
      err.retryable = err.code === 'STALE_BEFORE_AFTER';
      throw err;
    }
  }

  issue.decision = decision;
  issue.decidedVia = 'chat';
  issue.respondedAt = new Date();
  await syllabus.save();

  conversation.lastDecisionAt = new Date();
  await recomputeReadiness(conversation, syllabus);
  await conversation.save();
  return syllabus;
}

async function confirmIssue(conversation, issueId, selection = null) {
  const syllabus = await applyDecision(conversation, issueId, 'accepted', selection);
  await Message.create({
    conversationId: conversation._id,
    role: 'user',
    kind: 'text',
    content: 'Confirmed.',
    relatedIssueId: issueId,
  });
  await nextIssueMessage(conversation);
  return syllabus;
}

async function cancelIssue(conversation, issueId) {
  const syllabus = await applyDecision(conversation, issueId, 'rejected');
  await Message.create({
    conversationId: conversation._id,
    role: 'user',
    kind: 'text',
    content: 'Cancelled.',
    relatedIssueId: issueId,
  });
  await nextIssueMessage(conversation);
  return syllabus;
}

async function freeChatMessage(conversation, userText) {
  const syllabus = await Syllabus.findById(conversation.syllabusId).populate('instructor', 'firstName lastName');
  if (!syllabus) throw Object.assign(new Error('Syllabus not found'), { statusCode: 404 });

  await Message.create({
    conversationId: conversation._id,
    role: 'user',
    kind: 'text',
    content: userText,
  });

  const recent = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1 }).limit(8).lean();
  const currentIssue = conversation.currentIssueId ? findIssue(syllabus, conversation.currentIssueId) : null;

  let aiText;
  try {
    aiText = await aiService.chatReply(syllabus, recent.reverse(), userText, currentIssue);
    conversation.consecutiveAiFailures = 0;
    await conversation.save();
  } catch (err) {
    conversation.consecutiveAiFailures = (conversation.consecutiveAiFailures || 0) + 1;
    if (conversation.consecutiveAiFailures >= MAX_CONSECUTIVE_FAILURES) {
      conversation.status = 'error';
    }
    await conversation.save();
    const e = new Error('AI reply failed; please retry');
    e.statusCode = 503;
    e.retryable = true;
    throw e;
  }

  const aiMessage = await Message.create({
    conversationId: conversation._id,
    role: 'ai',
    kind: 'text',
    content: aiText || '...',
  });
  return aiMessage;
}

async function previewFinalPdf(syllabusId) {
  const syllabus = await Syllabus.findById(syllabusId).populate('programId', 'name').lean();
  if (!syllabus) throw Object.assign(new Error('Syllabus not found'), { statusCode: 404 });
  assertReadyForFinal(syllabus);

  const conversation = await Conversation.findOne({ syllabusId });
  const lastDecision = conversation?.lastDecisionAt;

  // Return cached preview if it was generated after the last decision.
  if (
    syllabus.previewPdf?.path &&
    syllabus.previewPdf?.generatedAt &&
    (!lastDecision || new Date(syllabus.previewPdf.generatedAt) >= new Date(lastDecision))
  ) {
    try {
      if (fs.existsSync(syllabus.previewPdf.path)) {
        return syllabus.previewPdf.path;
      }
    } catch { /* fall through to regenerate */ }
  }

  const pdfPath = await aiService.renderFinalSyllabusPdf(syllabus);
  await Syllabus.findByIdAndUpdate(syllabusId, {
    previewPdf: { path: pdfPath, generatedAt: new Date() },
  });
  return pdfPath;
}

async function submitSyllabus(syllabusId) {
  const syllabus = await Syllabus.findById(syllabusId)
    .populate('programId', 'name academicDirectorEmail')
    .populate('instructor', 'firstName lastName email');
  if (!syllabus) throw Object.assign(new Error('Syllabus not found'), { statusCode: 404 });
  if (syllabus.status === 'submitted') {
    throw Object.assign(new Error('Already submitted'), { statusCode: 409 });
  }
  assertReadyForFinal(syllabus);

  // Render final PDF (always fresh on submit — ignore preview cache).
  const outDir = path.join(__dirname, '../uploads/pdfs');
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.join(outDir, `submitted_${syllabus._id}.pdf`);
  await aiService.renderFinalSyllabusPdf(syllabus, pdfPath);

  const summaryText = aiService.generateSubmissionReport(syllabus);
  const adEmail = syllabus.programId?.academicDirectorEmail;

  let emailStatus = 'sent';
  if (adEmail) {
    const { sendSubmissionToAdEmail } = require('./emailService');
    let pdfBuffer;
    try { pdfBuffer = fs.readFileSync(pdfPath); } catch { /* skip attachment if unreadable */ }
    try {
      const info = await sendSubmissionToAdEmail({
        adEmail,
        syllabusMeta: syllabus,
        summaryText,
        pdfBuffer,
        pdfFilename: `${syllabus.course?.name || 'syllabus'}.pdf`,
      });
      if (info?.skipped) emailStatus = 'failed';
    } catch (err) {
      console.error('Submission email failed:', err.message);
      emailStatus = 'failed';
    }
  } else {
    console.warn(`submitSyllabus: no AD email for program ${syllabus.programId?._id}`);
    emailStatus = 'failed';
  }

  await Syllabus.findByIdAndUpdate(syllabusId, {
    status: 'submitted',
    submittedAt: new Date(),
    submittedPdfPath: pdfPath,
    submissionEmailStatus: emailStatus,
  });
  await Conversation.findOneAndUpdate({ syllabusId }, { status: 'submitted', currentIssueId: null });
}

async function getConversationView(syllabusId, { limit = 200 } = {}) {
  const conversation = await Conversation.findOne({ syllabusId });
  if (!conversation) return null;
  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  return { conversation: conversation.toObject(), messages };
}

module.exports = {
  getOrCreateConversation,
  nextIssueMessage,
  confirmIssue,
  cancelIssue,
  freeChatMessage,
  previewFinalPdf,
  submitSyllabus,
  getConversationView,
  recomputeReadiness,
  blockOf,
  getIssueCounts,
};
