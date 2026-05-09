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
  kind: {
    type: String,
    enum: ['text', 'before-after', 'choice', 'case-cards', 'submission-cta'],
    default: 'text',
  },
  content: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  relatedIssueId: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
