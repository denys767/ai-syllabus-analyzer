const crypto = require('crypto');

const PROGRAMS = ['MBA', 'EMBA', 'Corporate', 'Intensive'];
const WORKSPACE_STATUSES = ['Draft', 'In Progress', 'Submitted'];
const READINESS_WEIGHTS = {
  template: 0.3,
  learning_outcomes: 0.3,
  cases: 0.15,
  policies: 0.25,
};

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function toDate(value) {
  return value ? new Date(value) : new Date();
}

function buildGreetingMessage() {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'greeting',
    content:
      "Hi! I'm here to help you build a syllabus that meets all KSE Graduate Business School standards. Upload your draft and I'll take it from there.",
    createdAt: new Date(),
  };
}

function buildSummaryMessage(summary) {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'summary',
    content: `I found ${summary.criticalIssues} critical issue${summary.criticalIssues === 1 ? '' : 's'} and ${summary.improvements} area${summary.improvements === 1 ? '' : 's'} to improve.`,
    createdAt: new Date(),
  };
}

function buildIssuePromptMessage(issue) {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'issue',
    issueId: issue.id,
    content: issue.description || issue.title,
    createdAt: new Date(),
  };
}

function buildStatusMessage(content) {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'status',
    content,
    createdAt: new Date(),
  };
}

function buildUserMessage(content) {
  return {
    id: createId('msg'),
    role: 'user',
    kind: 'chat',
    content,
    createdAt: new Date(),
  };
}

function buildAssistantChatMessage(content) {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'chat',
    content,
    createdAt: new Date(),
  };
}

function normalizeChoice(choice) {
  if (!choice) return null;
  return {
    prompt: choice.prompt || '',
    customPrompt: choice.customPrompt || 'Add a note to tailor the selected policy text.',
    selectedOptionId: choice.selectedOptionId || null,
    customNote: choice.customNote || '',
    appliedText: choice.appliedText || '',
    options: Array.isArray(choice.options)
      ? choice.options.map((option, index) => ({
          id: option.id || `option_${index + 1}`,
          label: option.label || `Option ${index + 1}`,
          description: option.description || '',
          text: option.text || option.afterText || '',
          isRecommended: Boolean(option.isRecommended),
        }))
      : [],
  };
}

function normalizeCaseRecommendation(payload) {
  if (!payload) return null;
  return {
    weekLabel: payload.weekLabel || 'Week recommendation',
    selectedCardIds: Array.isArray(payload.selectedCardIds) ? payload.selectedCardIds : [],
    previewCardId: payload.previewCardId || null,
    cards: Array.isArray(payload.cards)
      ? payload.cards.map((card, index) => ({
          id: card.id || `case_${index + 1}`,
          title: card.title || `Case ${index + 1}`,
          source: card.source || '',
          fitLabel: card.fitLabel || 'Good fit',
          previewText: card.previewText || card.summary || '',
          afterText: card.afterText || card.suggestedText || card.previewText || '',
        }))
      : [],
  };
}

function normalizeIssue(rawIssue, order = 0) {
  const severity = rawIssue.severity === 'critical' ? 'critical' : 'normal';
  const required = rawIssue.required !== undefined ? Boolean(rawIssue.required) : severity === 'critical';
  return {
    id: rawIssue.id || createId('issue'),
    block: rawIssue.block || 'template',
    kind: rawIssue.kind || 'diff',
    severity,
    required,
    state: rawIssue.state || 'open',
    decision: rawIssue.decision || null,
    order,
    title: rawIssue.title || 'Issue',
    description: rawIssue.description || '',
    beforeText: rawIssue.beforeText || rawIssue.before || '',
    afterText: rawIssue.afterText || rawIssue.after || '',
    choice: normalizeChoice(rawIssue.choice),
    caseRecommendation: normalizeCaseRecommendation(rawIssue.caseRecommendation),
    instructorNote: rawIssue.instructorNote || '',
    resolvedAt: rawIssue.resolvedAt ? toDate(rawIssue.resolvedAt) : null,
    createdAt: rawIssue.createdAt ? toDate(rawIssue.createdAt) : new Date(),
    updatedAt: rawIssue.updatedAt ? toDate(rawIssue.updatedAt) : new Date(),
  };
}

function computeBlockProgress(issues, block) {
  const weight = READINESS_WEIGHTS[block] || 0;
  const requiredIssues = issues.filter((issue) => issue.block === block && issue.required);
  const resolvedRequired = requiredIssues.filter((issue) => issue.state === 'resolved').length;
  const pct = requiredIssues.length === 0 ? 100 : Math.round((resolvedRequired / requiredIssues.length) * 100);

  return {
    block,
    weight,
    requiredTotal: requiredIssues.length,
    resolvedRequired,
    pct,
  };
}

function computeReadiness(issues) {
  const blocks = Object.keys(READINESS_WEIGHTS).map((block) => computeBlockProgress(issues, block));
  const weightedPct = Math.round(
    blocks.reduce((sum, block) => sum + block.pct * block.weight, 0)
  );
  const openIssues = issues.filter((issue) => issue.state === 'open').length;
  const resolvedIssues = issues.filter((issue) => issue.state === 'resolved').length;
  const openRequired = issues.filter((issue) => issue.required && issue.state === 'open').length;
  const canSubmit = openRequired === 0;
  const label = canSubmit ? 'Ready to submit' : weightedPct >= 75 ? 'Almost there' : weightedPct >= 40 ? 'Needs work' : 'Getting started';

  return {
    pct: canSubmit ? 100 : weightedPct,
    label,
    canSubmit,
    openIssues,
    resolvedIssues,
    blocks,
  };
}

function getActiveIssueId(issues) {
  const nextIssue = [...issues]
    .sort((a, b) => a.order - b.order)
    .find((issue) => issue.state === 'open');
  return nextIssue ? nextIssue.id : null;
}

function buildWorkflowFromAnalysis(analysis, existingWorkflow = null) {
  const issues = (analysis.issues || []).map((issue, index) => normalizeIssue(issue, index));
  const readiness = computeReadiness(issues);
  const messages = [];

  if (!existingWorkflow?.messages?.length) {
    messages.push(buildGreetingMessage());
  } else {
    messages.push(...existingWorkflow.messages);
  }

  messages.push(buildSummaryMessage(analysis.summary));

  const activeIssueId = getActiveIssueId(issues);
  const activeIssue = issues.find((issue) => issue.id === activeIssueId);
  if (activeIssue) {
    messages.push(buildIssuePromptMessage(activeIssue));
  } else {
    messages.push(
      buildStatusMessage(
        'Syllabus ready for submission. All required criteria are met. The Academic Director will receive a summary report automatically.'
      )
    );
  }

  return {
    messages,
    issues,
    activeIssueId,
    readiness,
    finalPdf: existingWorkflow?.finalPdf || null,
    submission: existingWorkflow?.submission || null,
  };
}

function migrateLegacyRecommendations(syllabus) {
  const legacyRecommendations = Array.isArray(syllabus.recommendations) ? syllabus.recommendations : [];
  const issues = legacyRecommendations.map((recommendation, index) =>
    normalizeIssue(
      {
        id: recommendation.id || recommendation._id?.toString(),
        block: mapLegacyCategoryToBlock(recommendation.category),
        kind: recommendation.suggestedText ? 'diff' : recommendation.category === 'cases' ? 'case_recommendation' : 'diff',
        severity: recommendation.priority === 'critical' || recommendation.priority === 'high' ? 'critical' : 'normal',
        required: recommendation.priority === 'critical' || recommendation.priority === 'high',
        state: recommendation.status === 'pending' ? 'open' : 'resolved',
        decision: recommendation.status === 'accepted' ? 'confirmed' : recommendation.status === 'rejected' ? 'cancelled' : null,
        title: recommendation.title,
        description: recommendation.description,
        beforeText: '',
        afterText: recommendation.suggestedText || recommendation.description || '',
        caseRecommendation:
          recommendation.category === 'cases'
            ? {
                weekLabel: recommendation.title || 'Case recommendation',
                cards: [
                  {
                    id: createId('case'),
                    title: recommendation.title || 'Suggested case',
                    source: 'Legacy recommendation',
                    fitLabel: 'Good fit',
                    previewText: recommendation.description || '',
                    afterText: recommendation.suggestedText || recommendation.description || '',
                  },
                ],
              }
            : null,
      },
      index
    )
  );

  const readiness = computeReadiness(issues);
  const messages = [buildGreetingMessage()];
  const criticalIssues = issues.filter((issue) => issue.severity === 'critical' && issue.state === 'open').length;
  const improvements = issues.filter((issue) => issue.severity !== 'critical' && issue.state === 'open').length;
  messages.push(buildSummaryMessage({ criticalIssues, improvements }));
  const activeIssueId = getActiveIssueId(issues);
  const activeIssue = issues.find((issue) => issue.id === activeIssueId);
  if (activeIssue) {
    messages.push(buildIssuePromptMessage(activeIssue));
  }

  return {
    messages,
    issues,
    activeIssueId,
    readiness,
    finalPdf: null,
    submission: null,
  };
}

function ensureWorkflow(syllabus) {
  const currentWorkflow = syllabus.workflow || {};
  if (Array.isArray(currentWorkflow.issues) && currentWorkflow.issues.length > 0) {
    const issues = currentWorkflow.issues.map((issue, index) => normalizeIssue(issue, index));
    const readiness = computeReadiness(issues);
    currentWorkflow.issues = issues;
    currentWorkflow.readiness = readiness;
    currentWorkflow.activeIssueId = getActiveIssueId(issues);
    syllabus.workflow = currentWorkflow;
    if (!syllabus.workspaceStatus) {
      syllabus.workspaceStatus = readiness.canSubmit ? 'In Progress' : 'Draft';
    }
    if (!syllabus.program) {
      syllabus.program = 'MBA';
    }
    return syllabus.workflow;
  }

  syllabus.program = syllabus.program || 'MBA';
  syllabus.workflow = migrateLegacyRecommendations(syllabus);
  syllabus.workspaceStatus =
    syllabus.workflow.readiness.canSubmit && syllabus.status === 'analyzed' ? 'In Progress' : syllabus.workspaceStatus || 'Draft';
  return syllabus.workflow;
}

function mapLegacyCategoryToBlock(category) {
  if (category === 'template-compliance' || category === 'structure') return 'template';
  if (category === 'learning-objectives' || category === 'objectives') return 'learning_outcomes';
  if (category === 'cases' || category === 'student-clusters') return 'cases';
  if (category === 'policy' || category === 'assessment') return 'policies';
  return 'template';
}

function markWorkflowDirty(workflow) {
  if (!workflow) return;
  workflow.finalPdf = null;
  workflow.submission = workflow.submission || null;
}

function advanceWorkflowMessages(workflow) {
  workflow.activeIssueId = getActiveIssueId(workflow.issues);
  const activeIssue = workflow.issues.find((issue) => issue.id === workflow.activeIssueId);

  if (activeIssue) {
    workflow.messages.push(buildIssuePromptMessage(activeIssue));
    return;
  }

  workflow.messages.push(
    buildStatusMessage(
      'Syllabus ready for submission. All required criteria are met. The Academic Director will receive a summary report automatically.'
    )
  );
}

function confirmIssue(workflow, issue, note = '') {
  issue.state = 'resolved';
  issue.decision = 'confirmed';
  issue.instructorNote = note || issue.instructorNote || '';
  issue.resolvedAt = new Date();
  issue.updatedAt = new Date();
  workflow.messages.push(
    buildStatusMessage(`Confirmed: ${issue.title}.`)
  );
  markWorkflowDirty(workflow);
  workflow.readiness = computeReadiness(workflow.issues);
  advanceWorkflowMessages(workflow);
}

function cancelIssue(workflow, issue, note = '') {
  issue.instructorNote = note || issue.instructorNote || '';
  issue.updatedAt = new Date();

  if (issue.required || issue.severity === 'critical') {
    issue.state = 'open';
    issue.decision = 'cancelled';
    workflow.messages.push(
      buildStatusMessage(`This issue is still open because it is required: ${issue.title}.`)
    );
  } else {
    issue.state = 'resolved';
    issue.decision = 'cancelled';
    issue.resolvedAt = new Date();
    workflow.messages.push(
      buildStatusMessage(`Cancelled optional improvement: ${issue.title}.`)
    );
  }

  markWorkflowDirty(workflow);
  workflow.readiness = computeReadiness(workflow.issues);
  advanceWorkflowMessages(workflow);
}

function serializeMessage(message) {
  return {
    id: message.id,
    role: message.role,
    kind: message.kind || 'chat',
    issueId: message.issueId || null,
    content: message.content || '',
    createdAt: message.createdAt || null,
  };
}

function serializeIssue(issue) {
  return {
    id: issue.id,
    block: issue.block,
    kind: issue.kind,
    severity: issue.severity,
    required: Boolean(issue.required),
    state: issue.state,
    decision: issue.decision || null,
    order: issue.order ?? 0,
    title: issue.title || 'Issue',
    description: issue.description || '',
    beforeText: issue.beforeText || '',
    afterText: issue.afterText || '',
    choice: issue.choice ? normalizeChoice(issue.choice) : null,
    caseRecommendation: issue.caseRecommendation
      ? normalizeCaseRecommendation(issue.caseRecommendation)
      : null,
    instructorNote: issue.instructorNote || '',
    resolvedAt: issue.resolvedAt || null,
    createdAt: issue.createdAt || null,
    updatedAt: issue.updatedAt || null,
  };
}

function serializeReadiness(readiness) {
  return {
    pct: readiness?.pct || 0,
    label: readiness?.label || 'Needs work',
    canSubmit: Boolean(readiness?.canSubmit),
    openIssues: readiness?.openIssues || 0,
    resolvedIssues: readiness?.resolvedIssues || 0,
    blocks: Array.isArray(readiness?.blocks)
      ? readiness.blocks.map((block) => ({
          block: block.block,
          weight: block.weight,
          requiredTotal: block.requiredTotal || 0,
          resolvedRequired: block.resolvedRequired || 0,
          pct: block.pct || 0,
        }))
      : [],
  };
}

function serializeFinalPdf(finalPdf) {
  if (!finalPdf) return null;
  return {
    filename: finalPdf.filename || '',
    originalName: finalPdf.originalName || '',
    mimetype: finalPdf.mimetype || 'application/pdf',
    size: finalPdf.size || 0,
    path: finalPdf.path || '',
    generatedAt: finalPdf.generatedAt || null,
  };
}

function serializeSubmission(submission) {
  if (!submission) return null;
  return {
    submittedAt: submission.submittedAt || null,
    submittedBy: submission.submittedBy || null,
    academicDirectorEmail: submission.academicDirectorEmail || '',
    reportText: submission.reportText || '',
  };
}

function buildWorkspaceSummary(syllabus) {
  const workflow = ensureWorkflow(syllabus);
  return {
    _id: syllabus._id,
    title: syllabus.title,
    course: syllabus.course,
    originalFile: syllabus.originalFile,
    program: syllabus.program,
    workspaceStatus: syllabus.workspaceStatus || 'Draft',
    status: syllabus.status,
    readinessPct: workflow.readiness?.pct || 0,
    readinessLabel: workflow.readiness?.label || 'Needs work',
    openIssues: workflow.readiness?.openIssues || 0,
    resolvedIssues: workflow.readiness?.resolvedIssues || 0,
    updatedAt: syllabus.updatedAt,
    createdAt: syllabus.createdAt,
    instructor: syllabus.instructor,
  };
}

function buildWorkspacePayload(syllabus) {
  const workflow = ensureWorkflow(syllabus);
  return {
    _id: syllabus._id,
    title: syllabus.title,
    course: syllabus.course,
    originalFile: syllabus.originalFile,
    program: syllabus.program,
    status: syllabus.status,
    workspaceStatus: syllabus.workspaceStatus || 'Draft',
    extractedText: syllabus.extractedText,
    workflow: {
      messages: Array.isArray(workflow.messages) ? workflow.messages.map(serializeMessage) : [],
      issues: Array.isArray(workflow.issues) ? workflow.issues.map(serializeIssue) : [],
      activeIssueId: workflow.activeIssueId || null,
      readiness: serializeReadiness(workflow.readiness),
      finalPdf: serializeFinalPdf(workflow.finalPdf),
      submission: serializeSubmission(workflow.submission),
    },
    preview: {
      ready: Boolean(workflow.finalPdf),
      generatedAt: workflow.finalPdf?.generatedAt || null,
    },
    submission: serializeSubmission(workflow.submission),
    analysis: syllabus.analysis || {},
  };
}

module.exports = {
  PROGRAMS,
  WORKSPACE_STATUSES,
  READINESS_WEIGHTS,
  buildAssistantChatMessage,
  buildGreetingMessage,
  buildIssuePromptMessage,
  buildUserMessage,
  buildWorkflowFromAnalysis,
  buildWorkspacePayload,
  buildWorkspaceSummary,
  cancelIssue,
  computeReadiness,
  confirmIssue,
  createId,
  ensureWorkflow,
  markWorkflowDirty,
  normalizeIssue,
};
