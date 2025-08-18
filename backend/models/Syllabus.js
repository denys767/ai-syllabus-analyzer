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
  extractedText: {
    type: String,
    required: true
  },
  structure: {
    hasObjectives: Boolean,
    hasAssessment: Boolean,
    hasSchedule: Boolean,
    hasResources: Boolean,
    completenessScore: Number,
    missingParts: [String]
  },
  analysis: {
    templateCompliance: {
      score: Number,
      missingElements: [String],
      recommendations: [String]
    },
    learningObjectivesAlignment: {
      score: Number,
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
      uniquenessScore: Number,
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
syllabusSchema.index({ 'analysis.plagiarismCheck.uniquenessScore': 1 });

// Method to calculate overall quality score
syllabusSchema.methods.calculateQualityScore = function() {
  const weights = {
    templateCompliance: 0.25,
    learningObjectivesAlignment: 0.35,
    uniqueness: 0.25,
    completeness: 0.15
  };

  const scores = {
    templateCompliance: this.analysis.templateCompliance.score || 0,
    learningObjectivesAlignment: this.analysis.learningObjectivesAlignment.score || 0,
    uniqueness: this.analysis.plagiarismCheck.uniquenessScore || 0,
    completeness: this.structure.completenessScore || 0
  };

  return Math.round(
    Object.keys(weights).reduce((total, key) => {
      return total + (scores[key] * weights[key]);
    }, 0)
  );
};

module.exports = mongoose.model('Syllabus', syllabusSchema);
