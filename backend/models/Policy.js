const mongoose = require('mongoose');

const PolicySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  contentType: {
    type: String,
    enum: ['markdown', 'plain'],
    default: 'markdown'
  },
  attachedFile: {
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
  type: {
    type: String,
    enum: ['ai-policy', 'academic-integrity', 'teaching-tips', 'syllabus-policy'],
    required: true
  },
  // Довідник політик силабуса (type: 'syllabus-policy'), див. services/references/policies.js
  key: { type: String, trim: true },
  order: Number,
  mode: { type: String, enum: ['locked', 'library'] },
  blockRequired: Boolean,
  rationale: String,
  titleUk: String,
  text: String,
  options: [{
    _id: false,
    key: { type: String, required: true },
    label: { type: String, required: true },
    text: { type: String, required: true }
  }],
  libraryVersion: String,
  isRequired: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  acknowledgments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    acknowledgedAt: {
      type: Date,
      default: Date.now
    },
    version: {
      type: Number,
      default: 1
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // Записи довідника політик сідяться без користувача
    required: function() { return this.type !== 'syllabus-policy'; }
  }
}, {
  timestamps: true
});

// Indexes
PolicySchema.index({ type: 1, isActive: 1 });
PolicySchema.index({ 'acknowledgments.user': 1 });
PolicySchema.index({ key: 1 }, { unique: true, sparse: true });

// Virtual for acknowledgment count
PolicySchema.virtual('acknowledgmentCount').get(function() {
  return this.acknowledgments ? this.acknowledgments.length : 0;
});

// Чи ознайомився користувач із поточною версією документа
PolicySchema.methods.isAcknowledgedBy = function(userId) {
  return this.acknowledgments.some(
    ack => ack.user.toString() === userId.toString() && (ack.version || 1) >= this.version
  );
};

module.exports = mongoose.model('Policy', PolicySchema);
