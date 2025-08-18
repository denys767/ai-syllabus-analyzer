const mongoose = require('mongoose');

const practicalIdeaSchema = new mongoose.Schema({
  syllabus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Syllabus',
    required: true
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['case_study', 'exercise', 'method', 'assignment', 'other'],
    required: true
  },
  tags: [String],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
  },
  estimatedDuration: {
    type: Number, // in minutes
    min: 15,
    max: 300
  },
  materials: [String],
  steps: [String],
  learningObjectives: [String],
  isImplemented: {
    type: Boolean,
    default: false
  },
  implementationNotes: String,
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comments: String,
    date: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
practicalIdeaSchema.index({ syllabus: 1, createdAt: -1 });
practicalIdeaSchema.index({ instructor: 1, type: 1 });
practicalIdeaSchema.index({ tags: 1 });

module.exports = mongoose.model('PracticalIdea', practicalIdeaSchema);
