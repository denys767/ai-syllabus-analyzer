const mongoose = require('mongoose');

// Журнал змін Syllabus.state (append-only): по запису на кожен змінений шлях за одну мутацію.
// Пише лише services/syllabusState/store; потрібен для аудиту, reopen (revertChange) і diff.
// path — шлях у стані (services/syllabusState/paths.js), section — розділ шаблону, до якого він належить.

const slotChangeSchema = new mongoose.Schema({
  syllabusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true, index: true },
  revision: { type: Number, required: true }, // stateRevision після мутації
  path: { type: String, required: true },
  section: { type: String, default: null },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  // Хто/що ініціював зміну: provenance-джерело (instructor_directed, ai_draft, parsed …) або службове (approve, reopen)
  source: { type: String, default: null },
  suggestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suggestion', default: null },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
}, { minimize: false });

slotChangeSchema.index({ syllabusId: 1, revision: 1 });
slotChangeSchema.index({ syllabusId: 1, suggestionId: 1 });

// Append-only: оновлення записів заборонені (видалення лишається для каскаду силабусу)
function appendOnly() {
  throw new Error('SlotChange is append-only');
}
slotChangeSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], appendOnly);
slotChangeSchema.pre('save', function() {
  if (!this.isNew) appendOnly();
});

module.exports = mongoose.model('SlotChange', slotChangeSchema);
