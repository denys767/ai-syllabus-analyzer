const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');
const Syllabus = require('../models/Syllabus');

const router = express.Router();

// AI Challenge endpoint - respond to the challenge
router.post('/challenge/respond', auth, [
  body('syllabusId')
    .notEmpty()
    .isMongoId()
    .withMessage('Valid syllabus ID is required'),
  body('response')
    .trim()
    .notEmpty()
    .withMessage('Instructor response is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { syllabusId, response } = req.body;

    // Get syllabus to ensure ownership
    const syllabus = await Syllabus.findById(syllabusId);
    
    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

    if (syllabus.instructor.toString() !== req.user.userId) {
      return res.status(403).json({
        message: 'Access denied. You can only work with your own syllabi.'
      });
    }

    // Generate AI response based on instructor's input
    const aiResponse = await aiService.respondToChallenge(syllabusId, response);

    res.json({
      message: 'AI response generated successfully',
      aiResponse
    });

  } catch (error) {
    console.error('AI challenge response error:', error);
    res.status(500).json({
      message: 'Internal server error during AI challenge response'
    });
  }
});

// Generate practical ideas and cases
router.post('/recommendations/interactive', auth, [
  body('topic')
    .trim()
    .notEmpty()
    .withMessage('Topic is required'),
  body('studentClusters')
    .optional()
    .isArray()
    .withMessage('Student clusters must be an array'),
  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Difficulty must be beginner, intermediate, or advanced')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { topic, studentClusters = [], difficulty = 'intermediate' } = req.body;

    const recommendations = await aiService.generateInteractiveRecommendations(topic, studentClusters, difficulty);

    res.json({
      message: 'Interactive recommendations generated successfully',
      recommendations
    });

  } catch (error) {
    console.error('Interactive recommendations generation error:', error);
    res.status(500).json({
      message: 'Internal server error during recommendation generation'
    });
  }
});

module.exports = router;
 
/**
 * Add finalize route after default export to keep patch minimal
 * This will be appended by the module system; consumers import the same router instance
 */

