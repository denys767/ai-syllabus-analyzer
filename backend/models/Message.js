const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  role: {
    type: String,
    enum: ['ai', 'user', 'system'],
    required: true,
  },
  // suggestion: картка пропозиції; вміст формується на льоту з Suggestion за relatedSuggestionId
  // v5: question { slotKey, question, why }, approve-all { sections }, policy-choice { policyKey } — у payload
  kind: {
    type: String,
    enum: ['text', 'suggestion', 'question', 'approve-all', 'policy-choice'],
    default: 'text',
  },
  // Хто автор репліки role: 'user'. instructor — сам викладач (вільне повідомлення, відгук Reword, відповідь на питання);
  // server — сервер від імені викладача («Confirmed: …», «Cancelled: …», «Back to: …», «Skip: …»). Заголовки в них пише
  // модель, тож серверні репліки не є ні «відомими фактами», ні вказівками: їх виключають усі транскрипти для LLM.
  // Для role: 'ai' поле не задається.
  origin: {
    type: String,
    enum: ['instructor', 'server'],
    default() { return this.role === 'user' ? 'instructor' : undefined; },
  },
  content: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  relatedSuggestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suggestion', default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
