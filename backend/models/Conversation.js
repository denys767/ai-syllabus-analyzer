const mongoose = require('mongoose');

const GROUP_KEYS = ['template', 'outcomes', 'assessment', 'practice', 'policy'];
const breakdownShape = Object.fromEntries(GROUP_KEYS.map((k) => [k, { type: Number, default: 100 }]));

const conversationSchema = new mongoose.Schema({
  syllabusId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Syllabus',
    required: true,
    unique: true,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Пропозиція, картку якої показано останньою (контекст для вільного чату і Refine)
  currentSuggestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suggestion', default: null },
  status: {
    type: String,
    enum: ['active', 'submitted', 'error'],
    default: 'active',
  },
  // Знімок readiness (docs/api-v3.md); перераховується після кожного рішення
  readiness: {
    score: { type: Number, default: 0 },
    breakdown: breakdownShape,
    counts: {
      pending: { type: Number, default: 0 },
      accepted: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  lastDecisionAt: Date,
  consecutiveAiFailures: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
