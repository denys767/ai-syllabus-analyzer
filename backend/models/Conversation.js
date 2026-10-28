const mongoose = require('mongoose');

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
    enum: ['active', 'error'],
    default: 'active',
  },
  // Знімок readiness: v5 — форма docs/api-v5.md §4 (syllabusState/readiness.computeReadiness); v4 — breakdown за групами
  readiness: { type: mongoose.Schema.Types.Mixed, default: null },
  // v5: слот, на якому зараз розмова (питання інтерв'юера, «Write my own», «Change the value»)
  currentSlotKey: { type: String, default: null },
  // v5: слоти, які викладач пропустив (POST /skip) — інтерв'юер їх більше не питає
  skippedSlots: { type: [String], default: [] },
  lastDecisionAt: Date,
  consecutiveAiFailures: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
