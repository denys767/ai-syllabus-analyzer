const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['multiple_choice', 'open_text', 'scale', 'checkbox'],
    required: true
  },
  options: [{
    text: String,
    value: mongoose.Schema.Types.Mixed
  }],
  required: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    required: true
  }
});

const surveySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  questions: [questionSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  frequency: {
    type: String,
    enum: ['per_course', 'per_3_courses', 'semester', 'yearly'],
    default: 'per_3_courses'
  },
  targetAudience: {
    type: String,
    enum: ['students', 'instructors', 'all'],
    default: 'students'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: Date,
  endDate: Date,
  anonymized: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const responseSchema = new mongoose.Schema({
  survey: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Survey',
    required: true
  },
  respondent: {
    email: String, // Only stored if not anonymous
    studentId: String,
    cluster: String // Will be assigned after clustering
  },
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    answer: mongoose.Schema.Types.Mixed,
    textAnswer: String
  }],
  isAnonymous: {
    type: Boolean,
    default: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Indexes for performance
surveySchema.index({ isActive: 1, createdAt: -1 });
responseSchema.index({ survey: 1, submittedAt: -1 });
responseSchema.index({ 'respondent.cluster': 1 });

const Survey = mongoose.model('Survey', surveySchema);
const SurveyResponse = mongoose.model('SurveyResponse', responseSchema);

module.exports = { Survey, SurveyResponse };
