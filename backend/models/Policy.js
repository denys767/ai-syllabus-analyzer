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
  type: {
    type: String,
    enum: ['ai-policy', 'academic-integrity', 'teaching-tips'],
    required: true
  },
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
    required: true
  }
}, {
  timestamps: true
});

// Indexes
PolicySchema.index({ type: 1, isActive: 1 });
PolicySchema.index({ 'acknowledgments.user': 1 });

// Virtual for acknowledgment count
PolicySchema.virtual('acknowledgmentCount').get(function() {
  return this.acknowledgments ? this.acknowledgments.length : 0;
});

// Method to check if user has acknowledged
PolicySchema.methods.isAcknowledgedBy = function(userId) {
  return this.acknowledgments.some(ack => ack.user.toString() === userId.toString());
};

module.exports = mongoose.model('Policy', PolicySchema);
