const mongoose = require('mongoose');

const syllabusSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    code: String,
    name: String,
    credits: Number,
    semester: String,
    year: Number
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalFile: {
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
  // Auto-generated updated version of syllabus that incorporates accepted AI recommendations
  modifiedFile: {
    filename: String,
    originalName: String, // base name + "-modified"
    mimetype: { type: String, default: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    size: Number,
    path: String,
    generatedAt: Date
  },
  extractedText: {
    type: String,
    required: true
  },
  // Generated annotated version with inline comments after applying accepted recommendations
  editedText: {
    type: String
  },
  structure: {
    hasObjectives: Boolean,
    hasAssessment: Boolean,
    hasSchedule: Boolean,
    hasResources: Boolean,
    missingParts: [String]
  },
  analysis: {
    templateCompliance: {
      missingElements: [String],
      recommendations: [String]
    },
    learningObjectivesAlignment: {
      alignedObjectives: [String],
      missingObjectives: [String],
      recommendations: [String]
    },
    studentClusterAnalysis: {
      dominantClusters: [{
        cluster: String,
        percentage: Number,
        recommendations: [String]
      }],
      suggestedCases: [{
        company: String,
        cluster: String,
        description: String,
        relevance: Number
  }],
  adaptationRecommendations: [String]
    },
    plagiarismCheck: {
      similarSyllabi: [{
        syllabusId: mongoose.Schema.Types.ObjectId,
        similarity: Number,
        instructor: String,
        course: String,
        year: Number
      }],
      riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high']
      }
  },
  // Optional survey insights snapshot used for grouped recommendations
  surveyInsights: mongoose.Schema.Types.Mixed
  },
  recommendations: [{
    id: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ['structure', 'content', 'objectives', 'assessment', 'cases', 'methods'],
      required: true
    },
  // UI grouping tag (UA labels) — NOT enforced enum to allow future expansion
  groupTag: { type: String }, // e.g. "Відповідність до шаблону"
    title: String,
    description: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'commented'],
      default: 'pending'
    },
    instructorComment: String,
    aiResponse: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    respondedAt: Date
  }],
  practicalChallenge: {
    initialQuestion: String,
    instructorResponse: String,
    discussion: [{
      instructorResponse: String,
      aiResponse: String,
      respondedAt: { type: Date, default: Date.now }
    }],
    aiSuggestions: [{
      suggestion: String,
      category: String, // e.g., 'case-study', 'group-activity', 'interactive-method'
      createdAt: { type: Date, default: Date.now }
    }],
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'],
      default: 'pending'
    }
  },
  vectorEmbedding: [Number], // For similarity comparison
  status: {
    type: String,
    enum: ['processing', 'analyzed', 'reviewed', 'approved', 'error'],
    default: 'processing'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Indexes for performance
syllabusSchema.index({ instructor: 1, createdAt: -1 });
syllabusSchema.index({ 'course.code': 1, 'course.year': 1 });
syllabusSchema.index({ status: 1 });
// Removed uniquenessScore index (numeric scoring deprecated)

// Method to calculate overall quality score
// Deprecated: quality score removed per new simplified spec (no percentage scoring)
syllabusSchema.methods.calculateQualityScore = function() { return 0; };

module.exports = mongoose.model('Syllabus', syllabusSchema);
