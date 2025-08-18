const express = require('express');
const { auth } = require('../middleware/auth');
const StudentCluster = require('../models/StudentCluster');
const { SurveyResponse } = require('../models/Survey');

const router = express.Router();

// Get current active student clusters
router.get('/current', auth, async (req, res) => {
  try {
    const currentClusters = await StudentCluster.getCurrentClusters();
    res.json({
      message: 'Current student clusters retrieved successfully',
      clusters: currentClusters
    });
  } catch (error) {
    console.error('Error getting current clusters:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all student cluster configurations (admin/manager only)
router.get('/', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const clusters = await StudentCluster.find()
      .populate('uploadedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({
      message: 'Student clusters retrieved successfully',
      clusters
    });
  } catch (error) {
    console.error('Error getting clusters:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload new student cluster configuration (admin/manager only)
router.post('/', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { quarter, clusters, totalStudents, notes } = req.body;

    // Validate required fields
    if (!quarter || !clusters || !Array.isArray(clusters)) {
      return res.status(400).json({ 
        message: 'Quarter and clusters array are required' 
      });
    }

    // Validate quarter format
    if (!/^Q[1-4] \d{4}$/.test(quarter)) {
      return res.status(400).json({ 
        message: 'Quarter must be in format "Q1 2024", "Q2 2024", etc.' 
      });
    }

    // Validate clusters
    if (clusters.length === 0) {
      return res.status(400).json({ 
        message: 'At least one cluster is required' 
      });
    }

    // Validate percentages sum to approximately 100
    const totalPercentage = clusters.reduce((sum, cluster) => sum + (cluster.percentage || 0), 0);
    if (Math.abs(totalPercentage - 100) > 5) {
      return res.status(400).json({ 
        message: 'Cluster percentages should sum to approximately 100%' 
      });
    }

    // Check if quarter already exists
    const existingCluster = await StudentCluster.findOne({ quarter });
    if (existingCluster) {
      return res.status(400).json({ 
        message: 'Cluster configuration for this quarter already exists' 
      });
    }

    const newCluster = new StudentCluster({
      quarter,
      clusters,
      uploadedBy: req.user.userId,
      totalStudents: totalStudents || 0,
      notes: notes || '',
      isActive: true // New cluster becomes active automatically
    });

    await newCluster.save();

    res.status(201).json({
      message: 'Student cluster configuration created successfully',
      cluster: newCluster
    });
  } catch (error) {
    console.error('Error creating cluster configuration:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update cluster configuration (admin/manager only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { clusters, totalStudents, notes, isActive } = req.body;

    const clusterConfig = await StudentCluster.findById(id);
    if (!clusterConfig) {
      return res.status(404).json({ message: 'Cluster configuration not found' });
    }

    // Update fields
    if (clusters) clusterConfig.clusters = clusters;
    if (typeof totalStudents === 'number') clusterConfig.totalStudents = totalStudents;
    if (notes !== undefined) clusterConfig.notes = notes;
    if (typeof isActive === 'boolean') clusterConfig.isActive = isActive;

    await clusterConfig.save();

    res.json({
      message: 'Cluster configuration updated successfully',
      cluster: clusterConfig
    });
  } catch (error) {
    console.error('Error updating cluster configuration:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Activate specific cluster configuration (admin/manager only)
router.patch('/:id/activate', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;

    // Deactivate all clusters
    await StudentCluster.updateMany({}, { $set: { isActive: false } });

    // Activate the specified cluster
    const clusterConfig = await StudentCluster.findByIdAndUpdate(
      id,
      { $set: { isActive: true } },
      { new: true }
    );

    if (!clusterConfig) {
      return res.status(404).json({ message: 'Cluster configuration not found' });
    }

    res.json({
      message: 'Cluster configuration activated successfully',
      cluster: clusterConfig
    });
  } catch (error) {
    console.error('Error activating cluster configuration:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete cluster configuration (admin/manager only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;

    const clusterConfig = await StudentCluster.findById(id);
    if (!clusterConfig) {
      return res.status(404).json({ message: 'Cluster configuration not found' });
    }

    // Don't allow deletion of active cluster if it's the only one
    if (clusterConfig.isActive) {
      const totalClusters = await StudentCluster.countDocuments();
      if (totalClusters === 1) {
        return res.status(400).json({ 
          message: 'Cannot delete the only cluster configuration' 
        });
      }
    }

    await StudentCluster.findByIdAndDelete(id);

    res.json({
      message: 'Cluster configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting cluster configuration:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Survey Response Management

// Get survey responses (admin/manager only)
router.get('/surveys', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const surveys = await SurveyResponse.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SurveyResponse.countDocuments();

    res.json({
      message: 'Survey responses retrieved successfully',
      surveys,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error getting survey responses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get survey insights/analytics (admin/manager only)
router.get('/surveys/insights', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const totalResponses = await SurveyResponse.countDocuments();
    const recentResponses = await SurveyResponse.find()
      .sort({ createdAt: -1 })
      .limit(100);

    // Extract common themes from challenges
    const challenges = recentResponses.map(s => s.challenge).filter(Boolean);
    const decisions = recentResponses.map(s => s.decisions).filter(Boolean);
    const learningStyles = recentResponses.map(s => s.learningStyle).filter(Boolean);

    // Simple keyword extraction
    const extractKeywords = (textArray) => {
      const wordFreq = {};
      textArray.forEach(text => {
        const words = text.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(word => word.length > 3);
        
        words.forEach(word => {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
      });

      return Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([word, count]) => ({ keyword: word, frequency: count }));
    };

    const insights = {
      totalResponses,
      responsesByMonth: await getResponsesByMonth(),
      commonChallenges: extractKeywords(challenges),
      decisionTypes: extractKeywords(decisions),
      learningPreferences: extractKeywords(learningStyles),
      lastUpdated: recentResponses[0]?.createdAt || null
    };

    res.json({
      message: 'Survey insights retrieved successfully',
      insights
    });
  } catch (error) {
    console.error('Error getting survey insights:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create survey response (public endpoint for webhook)
router.post('/surveys', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      challenge,
      decisions,
      situation,
      experience,
      learningStyle,
      formId,
      responseId
    } = req.body;

    // Basic validation
    if (!firstName || !lastName) {
      return res.status(400).json({ 
        message: 'First name and last name are required' 
      });
    }

    const surveyResponse = new SurveyResponse({
      firstName,
      lastName,
      challenge: challenge || '',
      decisions: decisions || '',
      situation: situation || '',
      experience: experience || '',
      learningStyle: learningStyle || '',
      formId: formId || 'google-form',
      responseId: responseId || `resp_${Date.now()}`
    });

    await surveyResponse.save();

    res.status(201).json({
      message: 'Survey response recorded successfully',
      responseId: surveyResponse._id
    });
  } catch (error) {
    console.error('Error recording survey response:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Clear all survey responses (admin/manager only)
router.delete('/surveys/all', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await SurveyResponse.deleteMany({});

    res.json({
      message: 'All survey responses cleared successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing survey responses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete specific survey response (admin/manager only)
router.delete('/surveys/:id', auth, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;

    const surveyResponse = await SurveyResponse.findByIdAndDelete(id);
    if (!surveyResponse) {
      return res.status(404).json({ message: 'Survey response not found' });
    }

    res.json({
      message: 'Survey response deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting survey response:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper method to get responses by month
async function getResponsesByMonth() {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const responsesByMonth = await SurveyResponse.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    return responsesByMonth.map(item => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      count: item.count
    }));
  } catch (error) {
    console.error('Error getting responses by month:', error);
    return [];
  }
}

module.exports = router;
