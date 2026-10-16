const mongoose = require('mongoose');

// Пропозиція правки силабусу (docs/api-v3.md). Операції — над блоками services/document.
// Рішення змінюються атомарно: findOneAndUpdate({ _id, status: 'pending' }, …).

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const GROUPS = ['template', 'outcomes', 'assessment', 'practice', 'policy'];
const KINDS = ['edit', 'choice', 'question'];
const STATUSES = ['pending', 'accepted', 'rejected'];
const REJECT_TAGS = ['already_present', 'too_generic', 'incorrect', 'not_relevant', 'other'];

const opsField = { type: [mongoose.Schema.Types.Mixed], default: [] };

const optionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, default: '' },
  rationale: { type: String, default: '' },
  ops: opsField,
}, { _id: false });

const sourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  publisher: { type: String, default: null },
  year: { type: Number, default: null },
  url: { type: String, default: null },
  verified: { type: Boolean, default: false },
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['accepted', 'rejected', 'reopened', 'refined', 'answered', 'replaced'],
    required: true,
  },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: String,
  rejectTag: String,
  optionId: String,
  feedback: String,
}, { _id: false });

const versionSchema = new mongoose.Schema({
  kind: String,
  title: String,
  description: String,
  ops: opsField,
  options: { type: [optionSchema], default: undefined },
  question: String,
  answer: String,
  applicable: Boolean,
  feedback: String,
  at: { type: Date, default: Date.now },
}, { _id: false });

const suggestionSchema = new mongoose.Schema({
  syllabusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true },
  findingId: String,
  criterionId: String,
  group: { type: String, enum: GROUPS, required: true },
  severity: { type: String, enum: SEVERITIES, default: 'medium' },
  confidence: Number,
  kind: { type: String, enum: KINDS, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  // Пояснення моделі; йде в коментар Word у tracked.docx
  rationale: String,
  evidenceBlockIds: { type: [String], default: [] },
  ops: opsField,
  options: { type: [optionSchema], default: [] },
  question: String,
  answer: String,
  applicable: { type: Boolean, default: true },
  // Джерела кейсів з веб-пошуку (CASE_WEB_SEARCH=1); url лише для підтверджених сервером
  sources: { type: [sourceSchema], default: [] },
  status: { type: String, enum: STATUSES, default: 'pending' },
  selectedOptionId: { type: String, default: null },
  // Порядок застосування прийнятих пропозицій (merge іде в порядку прийняття)
  acceptedAt: Date,
  supersedes: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  decisionReason: String,
  rejectTag: { type: String, enum: [...REJECT_TAGS, null], default: null },
  decisionHistory: { type: [historySchema], default: [] },
  versions: { type: [versionSchema], default: [] },
  order: { type: Number, default: 0 },
  // Версія документа, для якої згенеровано ops (sha1 робочого .docx)
  docVersion: String,
  // Знімок знахідки рубрики: потрібен для Refine/Answer (generateSuggestion)
  finding: mongoose.Schema.Types.Mixed,
  promptVersion: String,
}, { timestamps: true });

suggestionSchema.index({ syllabusId: 1, status: 1 });
suggestionSchema.index({ syllabusId: 1, order: 1 });
suggestionSchema.index({ criterionId: 1, status: 1 });

suggestionSchema.statics.SEVERITIES = SEVERITIES;
suggestionSchema.statics.GROUPS = GROUPS;
suggestionSchema.statics.KINDS = KINDS;
suggestionSchema.statics.REJECT_TAGS = REJECT_TAGS;

module.exports = mongoose.model('Suggestion', suggestionSchema);
