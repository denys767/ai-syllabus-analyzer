const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');
const Syllabus = require('../models/Syllabus');

const router = express.Router();

// Start AI Challenge
router.post('/challenge', auth, async (req, res) => {
  try {
    const { syllabusId } = req.body;
    
    if (!syllabusId) {
      return res.status(400).json({ message: 'Syllabus ID is required' });
    }

    const syllabus = await Syllabus.findById(syllabusId);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    // Check if user owns this syllabus
    if (syllabus.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const initialQuestion = await aiService.startPracticalChallenge(syllabusId);
    
    res.json({ 
      message: 'AI Challenge started',
      initialQuestion,
      challenge: {
        initialQuestion,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('AI Challenge start error:', error);
    res.status(500).json({ message: 'Failed to start AI challenge', error: error.message });
  }
});

// Respond to AI Challenge
router.post('/challenge/respond', 
  auth,
  [
    body('syllabusId').notEmpty().withMessage('Syllabus ID is required'),
    body('response').notEmpty().withMessage('Response is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { syllabusId, response: instructorResponse } = req.body;
      
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) {
        return res.status(404).json({ message: 'Syllabus not found' });
      }

      // Check if user owns this syllabus
      if (syllabus.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const result = await aiService.respondToChallenge(syllabusId, instructorResponse);
      
      res.json({ 
        message: 'Response processed',
        aiResponse: result.aiResponse,
        newRecommendations: result.newRecommendations || [],
        challenge: result.updatedChallenge
      });
    } catch (error) {
      console.error('AI Challenge respond error:', error);
      res.status(500).json({ message: 'Failed to process response', error: error.message });
    }
  }
);

// Finalize AI Challenge
router.post('/:syllabusId/challenge/finalize', auth, async (req, res) => {
  try {
    const { syllabusId } = req.params;
    
    const syllabus = await Syllabus.findById(syllabusId);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    // Check if user owns this syllabus
    if (syllabus.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Syllabus.findByIdAndUpdate(syllabusId, {
      'practicalChallenge.status': 'completed'
    });
    
    res.json({ message: 'AI Challenge completed', status: 'completed' });
  } catch (error) {
    console.error('AI Challenge finalize error:', error);
    res.status(500).json({ message: 'Failed to finalize challenge', error: error.message });
  }
});

module.exports = router;

