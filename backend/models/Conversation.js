const mongoose = require('mongoose');

const DEFAULT_WEIGHTS = {
  templateCompliance: 0.4,
  learningOutcomes: 0.3,
  cases: 0.15,
  policies: 0.15,
};

const conversationSchema = new mongoose.Schema({
  syllabusId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Syllabus',
    required: true,
    unique: true,
    index: true,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  currentIssueId: { type: String, default: null },
  status: {
    type: String,
    enum: ['active', 'submitted', 'abandoned', 'error'],
    default: 'active',
  },
  readiness: {
    score: { type: Number, default: 0 },
    weights: {
      templateCompliance: { type: Number, default: DEFAULT_WEIGHTS.templateCompliance },
      learningOutcomes: { type: Number, default: DEFAULT_WEIGHTS.learningOutcomes },
      cases: { type: Number, default: DEFAULT_WEIGHTS.cases },
      policies: { type: Number, default: DEFAULT_WEIGHTS.policies },
    },
    breakdown: {
      templateCompliance: { type: Number, default: 0 },
      learningOutcomes: { type: Number, default: 0 },
      cases: { type: Number, default: 0 },
      policies: { type: Number, default: 0 },
    },
  },
  lastDecisionAt: Date,
  consecutiveAiFailures: { type: Number, default: 0 },
}, { timestamps: true });

conversationSchema.statics.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;

module.exports = mongoose.model('Conversation', conversationSchema);
