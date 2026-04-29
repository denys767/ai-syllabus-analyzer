const mongoose = require('mongoose');

const workflowMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ['assistant', 'user'], required: true },
    kind: {
      type: String,
      enum: ['greeting', 'summary', 'issue', 'status', 'chat'],
      default: 'chat',
    },
    issueId: String,
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const choiceOptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    description: String,
    text: String,
    isRecommended: { type: Boolean, default: false },
  },
  { _id: false }
);

const issueChoiceSchema = new mongoose.Schema(
  {
    prompt: String,
    customPrompt: String,
    selectedOptionId: String,
    customNote: String,
    appliedText: String,
    options: [choiceOptionSchema],
  },
  { _id: false }
);

const caseCardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    source: String,
    fitLabel: String,
    previewText: String,
    afterText: String,
  },
  { _id: false }
);

const caseRecommendationSchema = new mongoose.Schema(
  {
    weekLabel: String,
    selectedCardIds: [String],
    previewCardId: String,
    cards: [caseCardSchema],
  },
  { _id: false }
);

const workflowIssueSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    block: {
      type: String,
      enum: ['template', 'learning_outcomes', 'cases', 'policies'],
      required: true,
    },
    kind: {
      type: String,
      enum: ['diff', 'choice', 'case_recommendation'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['critical', 'normal'],
      default: 'normal',
    },
    required: { type: Boolean, default: false },
    state: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
    },
    decision: {
      type: String,
      enum: ['confirmed', 'cancelled', null],
      default: null,
    },
    order: { type: Number, default: 0 },
    title: { type: String, required: true },
    description: String,
    beforeText: String,
    afterText: String,
    choice: issueChoiceSchema,
    caseRecommendation: caseRecommendationSchema,
    instructorNote: String,
    resolvedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const readinessBlockSchema = new mongoose.Schema(
  {
    block: String,
    weight: Number,
    requiredTotal: Number,
    resolvedRequired: Number,
    pct: Number,
  },
  { _id: false }
);

const workflowReadinessSchema = new mongoose.Schema(
  {
    pct: { type: Number, default: 0 },
    label: { type: String, default: 'Needs work' },
    canSubmit: { type: Boolean, default: false },
    openIssues: { type: Number, default: 0 },
    resolvedIssues: { type: Number, default: 0 },
    blocks: [readinessBlockSchema],
  },
  { _id: false }
);

const finalPdfSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimetype: { type: String, default: 'application/pdf' },
    size: Number,
    path: String,
    generatedAt: Date,
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    submittedAt: Date,
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    academicDirectorEmail: String,
    reportText: String,
  },
  { _id: false }
);

const syllabusSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    program: {
      type: String,
      enum: ['MBA', 'EMBA', 'Corporate', 'Intensive'],
      default: 'MBA',
      required: true,
    },
    course: {
      code: String,
      name: String,
      credits: Number,
      semester: String,
      year: Number,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    originalFile: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      path: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
    extractedText: {
      type: String,
      required: true,
    },
    analysis: {
      templateCompliance: {
        missingElements: [String],
      },
      learningObjectivesAlignment: {
        alignedObjectives: [String],
        missingObjectives: [String],
      },
      summary: {
        criticalIssues: { type: Number, default: 0 },
        improvements: { type: Number, default: 0 },
      },
    },
    recommendations: [
      {
        id: { type: String, required: true },
        category: String,
        groupTag: String,
        title: String,
        description: String,
        priority: String,
        status: {
          type: String,
          enum: ['pending', 'accepted', 'rejected'],
          default: 'pending',
        },
        suggestedText: String,
        createdAt: { type: Date, default: Date.now },
        respondedAt: Date,
      },
    ],
    workflow: {
      messages: [workflowMessageSchema],
      issues: [workflowIssueSchema],
      activeIssueId: String,
      readiness: workflowReadinessSchema,
      finalPdf: finalPdfSchema,
      submission: submissionSchema,
    },
    workspaceStatus: {
      type: String,
      enum: ['Draft', 'In Progress', 'Submitted'],
      default: 'Draft',
    },
    status: {
      type: String,
      enum: ['processing', 'analyzed', 'error'],
      default: 'processing',
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

syllabusSchema.index({ instructor: 1, createdAt: -1 });
syllabusSchema.index({ status: 1, workspaceStatus: 1, program: 1 });

syllabusSchema.methods.cleanupFiles = async function cleanupFiles(fsPromises) {
  const fs = fsPromises || require('fs').promises;
  const tryUnlink = async (filePath) => {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // ignore cleanup errors
    }
  };

  await tryUnlink(this.originalFile?.path);
  await tryUnlink(this.workflow?.finalPdf?.path);
};

syllabusSchema.methods.calculateQualityScore = function calculateQualityScore() {
  return this.workflow?.readiness?.pct || 0;
};

module.exports = mongoose.model('Syllabus', syllabusSchema);
