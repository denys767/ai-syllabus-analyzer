const mongoose = require('mongoose');

const syllabusSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    code: String,
    name: String,
    credits: Number,
    semester: String,
    year: Number
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program'
  },
  originalFile: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  // Cached preview of the clean final syllabus PDF; invalidated when conversation has new decisions after generatedAt
  previewPdf: {
    path: String,
    generatedAt: Date
  },
  // Final PDF persisted at submission time — audit artifact attached to the AD email
  submittedPdfPath: String,
  submittedAt: Date,
  submissionEmailStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  extractedText: {
    type: String,
    required: true
  },
  // Running edited version mutated by per-issue Confirm; initialized from extractedText on first decision
  editedText: {
    type: String
  },
  // Track-changes version used by Preview/Submit PDFs. Deleted text is retained
  // with internal markers while editedText remains the clean accepted text.
  revisionMarkup: {
    type: String
  },
  structure: {
    hasObjectives: Boolean,
    hasAssessment: Boolean,
    hasSchedule: Boolean,
    hasResources: Boolean,
    missingParts: [String]
  },
  analysis: {
    templateCompliance: {
      missingElements: [String]
    },
    learningObjectivesAlignment: {
      alignedObjectives: [String],
      missingObjectives: [String]
    },
    plagiarismCheck: {
      similarSyllabi: [{
        syllabusId: mongoose.Schema.Types.ObjectId,
        similarity: Number,
        instructor: String,
        course: String,
        year: Number
      }],
      riskLevel: {
        type: String,
        enum: ['none', 'low', 'medium', 'high', 'unknown']
      }
    }
  },
  recommendations: [{
    id: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: [
        'template-compliance',
        'learning-objectives',
        'content-quality',
        'cases',
        'student-clusters',
        'policy',
        'plagiarism',
        'other'
      ],
      required: true
    },
    groupTag: { type: String },
    title: String,
    description: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    decision: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'skipped'],
      default: 'pending'
    },
    decidedVia: {
      type: String,
      enum: ['chat'],
      default: null
    },
    decisionReason: String,
    decisionHistory: [{
      action: {
        type: String,
        enum: ['accepted', 'rejected', 'reopened']
      },
      previousDecision: String,
      previousAppliedSelection: mongoose.Schema.Types.Mixed,
      previousReason: String,
      previousRespondedAt: Date,
      resultingDecision: String,
      selection: mongoose.Schema.Types.Mixed,
      reason: String,
      at: {
        type: Date,
        default: Date.now
      }
    }],
    // Pre-generated chat payload to avoid live LLM calls per Confirm
    beforeAfter: {
      kind: {
        type: String,
        enum: ['before-after', 'choice', 'case-cards']
      },
      before: String,
      after: String,
      payload: mongoose.Schema.Types.Mixed
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    respondedAt: Date
  }],
  editingStatus: {
    type: String,
    enum: ['idle', 'processing', 'ready', 'error'],
    default: 'idle'
  },
  status: {
    type: String,
    enum: ['analyzing', 'in_progress', 'submitted', 'error'],
    default: 'analyzing'
  },
  // Коли розпочато поточний аналіз (для відновлення завислих) і текст останньої помилки
  analysisStartedAt: Date,
  analysisError: String,
  // Прапорець атомарного захоплення під час submit (захист від подвійної відправки)
  submitting: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

syllabusSchema.index({ instructor: 1, createdAt: -1 });
syllabusSchema.index({ status: 1 });
syllabusSchema.index({ programId: 1, status: 1 });
syllabusSchema.index({ programId: 1, updatedAt: -1 });

syllabusSchema.methods.cleanupFiles = async function(fsPromises) {
  const fs = fsPromises || require('fs').promises;
  const tryUnlink = async (p) => {
    if (!p) return;
    try { await fs.unlink(p); } catch (e) { /* ignore */ }
  };
  try {
    await tryUnlink(this.originalFile?.path);
    await tryUnlink(this.previewPdf?.path);
    await tryUnlink(this.submittedPdfPath);
  } catch (e) {
    // best-effort
  }
};

syllabusSchema.statics.cleanupFilesByFilter = async function(filter = {}) {
  const fs = require('fs').promises;
  const docs = await this.find(filter).select('originalFile.path previewPdf.path submittedPdfPath');
  for (const doc of docs) {
    await doc.cleanupFiles(fs);
  }
};

module.exports = mongoose.model('Syllabus', syllabusSchema);
