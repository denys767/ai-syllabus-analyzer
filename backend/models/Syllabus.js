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
  modifiedFile: {
    filename: String,
    originalName: String,
    mimetype: { type: String, default: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    size: Number,
    path: String,
    generatedAt: Date
  },
  editedPdf: {
    filename: String,
    originalName: String,
    mimetype: { type: String, default: 'application/pdf' },
    size: Number,
    path: String,
    generatedAt: Date
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
      missingElements: [String],
      recommendations: [String]
    },
    learningObjectivesAlignment: {
      alignedObjectives: [String],
      missingObjectives: [String],
      recommendations: [String]
    },
    studentClusterAnalysis: {
      dominantClusters: [{
        cluster: String,
        percentage: Number,
        recommendations: [String]
      }],
      suggestedCases: [{
        company: String,
        cluster: String,
        description: String,
        relevance: Number
      }],
      adaptationRecommendations: [String]
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
      enum: ['chat', 'admin-override'],
      default: null
    },
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
  vectorEmbedding: [Number],
  editingStatus: {
    type: String,
    enum: ['idle', 'processing', 'ready', 'error'],
    default: 'idle'
  },
  editingError: {
    type: String
  },
  status: {
    type: String,
    enum: ['analyzing', 'in_progress', 'submitted', 'error'],
    default: 'analyzing'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

syllabusSchema.index({ instructor: 1, createdAt: -1 });
syllabusSchema.index({ 'course.code': 1, 'course.year': 1 });
syllabusSchema.index({ status: 1 });
syllabusSchema.index({ programId: 1, status: 1 });

syllabusSchema.methods.cleanupFiles = async function(fsPromises) {
  const fs = fsPromises || require('fs').promises;
  const tryUnlink = async (p) => {
    if (!p) return;
    try { await fs.unlink(p); } catch (e) { /* ignore */ }
  };
  try {
    await tryUnlink(this.originalFile?.path);
    await tryUnlink(this.editedPdf?.path);
    await tryUnlink(this.modifiedFile?.path);
    await tryUnlink(this.previewPdf?.path);
    await tryUnlink(this.submittedPdfPath);
  } catch (e) {
    // best-effort
  }
};

syllabusSchema.statics.cleanupFilesByFilter = async function(filter = {}) {
  const fs = require('fs').promises;
  const docs = await this.find(filter).select('originalFile.path editedPdf.path modifiedFile.path previewPdf.path submittedPdfPath');
  for (const doc of docs) {
    await doc.cleanupFiles(fs);
  }
};

module.exports = mongoose.model('Syllabus', syllabusSchema);
