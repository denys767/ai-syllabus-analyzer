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
  'student-clusters': 'cases',
  'policy': 'policies',
  'plagiarism': 'policies',
};

const BLOCK_KEYS = ['templateCompliance', 'learningOutcomes', 'cases', 'policies'];

function blockOf(category) {
  return CATEGORY_TO_BLOCK[category] || 'templateCompliance';
}

function findIssue(syllabus, issueId) {
  return (syllabus.recommendations || []).find((r) => r.id === issueId);
}

function nextPendingIssue(syllabus) {
  const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
  const pending = (syllabus.recommendations || []).filter((r) => r.decision === 'pending');
  pending.sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
  return pending[0] || null;
}

async function recomputeReadiness(conversation, syllabus) {
  const recs = syllabus.recommendations || [];
  const totals = { templateCompliance: 0, learningOutcomes: 0, cases: 0, policies: 0 };
  const resolved = { templateCompliance: 0, learningOutcomes: 0, cases: 0, policies: 0 };
  for (const rec of recs) {
    const block = blockOf(rec.category);
    totals[block] += 1;
    if (rec.decision && rec.decision !== 'pending') resolved[block] += 1;
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

  const issue = nextPendingIssue(syllabus);
  if (!issue) {
    // All decisions made — surface the submission CTA.
    if (conversation.currentIssueId !== null) {
      conversation.currentIssueId = null;
      await conversation.save();
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

  // Already showed this issue? Don't double-post.
  if (conversation.currentIssueId === issue.id) return issue;

  // Cache miss → backfill via live LLM call.
  if (!issue.beforeAfter || (!issue.beforeAfter.before && !issue.beforeAfter.after)) {
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

  await Message.create({
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
  });

  conversation.currentIssueId = issue.id;
  await conversation.save();
  return issue;
}

async function applyDecision(conversation, issueId, decision) {
  const syllabus = await Syllabus.findOneAndUpdate(
    { _id: conversation.syllabusId, 'recommendations.id': issueId, 'recommendations.decision': 'pending' },
    {
      $set: {
        'recommendations.$.decision': decision,
        'recommendations.$.decidedVia': 'chat',
        'recommendations.$.respondedAt': new Date(),
      },
    },
    { new: true }
  );
  if (!syllabus) {
    const e = new Error('Issue not pending or not found');
    e.statusCode = 409;
    throw e;
  }

  // On accept, append the AFTER text to editedText (initialise from extractedText on first decision).
  if (decision === 'accepted') {
    const issue = findIssue(syllabus, issueId);
    const afterText = issue?.beforeAfter?.after;
    if (afterText) {
      syllabus.editedText = (syllabus.editedText || syllabus.extractedText || '') + `\n\n[${issue.title}]\n${afterText}`;
      await syllabus.save();
    }
  }

  conversation.lastDecisionAt = new Date();
  await recomputeReadiness(conversation, syllabus);
  await conversation.save();
  return syllabus;
}

async function confirmIssue(conversation, issueId) {
  const syllabus = await applyDecision(conversation, issueId, 'accepted');
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
    content: 'Skipped.',
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
      await sendSubmissionToAdEmail({
        adEmail,
        syllabusMeta: syllabus,
        summaryText,
        pdfBuffer,
        pdfFilename: `${syllabus.course?.name || 'syllabus'}.pdf`,
      });
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
};
