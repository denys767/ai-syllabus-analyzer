const mongoose = require('mongoose');

const studentClusterSchema = new mongoose.Schema({
  quarter: {
    type: String,
    required: true,
    unique: true,
    match: /^Q[1-4] \d{4}$/ // Format: Q1 2024, Q2 2024, etc.
  },
  isActive: {
    type: Boolean,
    default: true
  },
  clusters: [{
    id: {
      type: Number,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    description: {
      type: String,
      required: true
    },
    characteristics: [String],
    businessChallenges: [String],
    suggestedCases: [{
      title: String,
      description: String,
      source: String,
      relevanceScore: {
        type: Number,
        min: 1,
        max: 10
      }
    }]
  }],
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  totalStudents: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Ensure only one active cluster configuration at a time
studentClusterSchema.pre('save', async function(next) {
  if (this.isActive && this.isNew) {
    // Deactivate all other cluster configurations
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { $set: { isActive: false } }
    );
  }
  next();
});

// Static method to get current active clusters
studentClusterSchema.statics.getCurrentClusters = async function() {
  const activeCluster = await this.findOne({ isActive: true }).populate('uploadedBy', 'firstName lastName');
  
  if (!activeCluster) {
    // Return default clusters if none are set
    return {
      quarter: "Default",
      clusters: [
        {
          id: 1,
          name: "Technology Leaders",
          percentage: 25,
          description: "IT-сфера, переважно senior рівень",
          characteristics: ["Технологічний досвід", "Product management"],
          businessChallenges: ["Масштабування продуктів", "Цифрова трансформація"]
        },
        {
          id: 2,
          name: "Finance & Banking",
          percentage: 25,
          description: "Фінансова сфера, різні рівні",
          characteristics: ["Фінансовий аналіз", "Управління ризиками"],
          businessChallenges: ["Регуляторні вимоги", "Fintech інновації"]
        },
        {
          id: 3,
          name: "Military & Public",
          percentage: 25,
          description: "Військова сфера + NGO",
          characteristics: ["Лідерство", "Стратегічне планування"],
          businessChallenges: ["Управління в кризі", "Ресурсна оптимізація"]
        },
        {
          id: 4,
          name: "Business Operations",
          percentage: 25,
          description: "Різні індустрії, management ролі",
          characteristics: ["P&L відповідальність", "Команда управління"],
          businessChallenges: ["Операційна ефективність", "Розвиток ринків"]
        }
      ]
    };
  }
  
  return activeCluster;
};

module.exports = mongoose.model('StudentCluster', studentClusterSchema);
