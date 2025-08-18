const express = require('express');
const { body, validationResult } = require('express-validator');
const { Survey, SurveyResponse } = require('../models/Survey');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Create new survey (admin only)
router.post('/', auth, authorize('admin'), [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Survey title is required'),
  body('description')
    .optional()
    .trim(),
  body('questions')
    .isArray({ min: 1 })
    .withMessage('At least one question is required'),
  body('questions.*.text')
    .trim()
    .notEmpty()
    .withMessage('Question text is required'),
  body('questions.*.type')
    .isIn(['multiple_choice', 'open_text', 'scale', 'checkbox'])
    .withMessage('Invalid question type'),
  body('frequency')
    .optional()
    .isIn(['per_course', 'per_3_courses', 'semester', 'yearly'])
    .withMessage('Invalid frequency'),
  body('targetAudience')
    .optional()
    .isIn(['students', 'instructors', 'all'])
    .withMessage('Invalid target audience')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, description, questions, frequency, targetAudience, startDate, endDate } = req.body;

    // Validate and process questions
    const processedQuestions = questions.map((question, index) => {
      const processedQuestion = {
        text: question.text,
        type: question.type,
        required: question.required !== false, // Default to true
        order: index + 1
      };

      // Add options for multiple choice and checkbox questions
      if (['multiple_choice', 'checkbox'].includes(question.type)) {
        if (!question.options || !Array.isArray(question.options) || question.options.length === 0) {
          throw new Error(`Question "${question.text}" requires options for ${question.type} type`);
        }
        processedQuestion.options = question.options.map((option, optionIndex) => ({
          text: option.text || option,
          value: option.value || optionIndex
        }));
      }

      return processedQuestion;
    });

    const survey = new Survey({
      title,
      description,
      questions: processedQuestions,
      frequency: frequency || 'per_3_courses',
      targetAudience: targetAudience || 'students',
      createdBy: req.user.userId,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null
    });

    await survey.save();

    res.status(201).json({
      message: 'Survey created successfully',
      survey
    });

  } catch (error) {
    console.error('Survey creation error:', error);
    res.status(500).json({
      message: 'Internal server error during survey creation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all surveys
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    
    // Filter by active status
    if (req.query.active !== undefined) {
      query.isActive = req.query.active === 'true';
    }

    // Filter by target audience
    if (req.query.audience) {
      query.targetAudience = { $in: [req.query.audience, 'all'] };
    }

    const surveys = await Survey.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Survey.countDocuments(query);

    res.json({
      surveys,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get surveys error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Get specific survey
router.get('/:id', async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email');

    if (!survey) {
      return res.status(404).json({
        message: 'Survey not found'
      });
    }

    // Check if survey is active and within date range
    const now = new Date();
    const isAccessible = survey.isActive && 
                        (!survey.startDate || survey.startDate <= now) &&
                        (!survey.endDate || survey.endDate >= now);

    res.json({
      survey,
      isAccessible
    });

  } catch (error) {
    console.error('Get survey error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Submit survey response
router.post('/:id/responses', [
  body('answers')
    .isArray({ min: 1 })
    .withMessage('At least one answer is required'),
  body('answers.*.questionId')
    .notEmpty()
    .withMessage('Question ID is required for each answer'),
  body('respondent.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const surveyId = req.params.id;
    const { answers, respondent, isAnonymous = true } = req.body;

    // Get survey and validate
    const survey = await Survey.findById(surveyId);
    if (!survey || !survey.isActive) {
      return res.status(404).json({
        message: 'Survey not found or not active'
      });
    }

    // Check if survey is within active date range
    const now = new Date();
    if ((survey.startDate && survey.startDate > now) || 
        (survey.endDate && survey.endDate < now)) {
      return res.status(400).json({
        message: 'Survey is not currently active'
      });
    }

    // Validate answers against survey questions
    const questionIds = survey.questions.map(q => q._id.toString());
    const invalidAnswers = answers.filter(answer => 
      !questionIds.includes(answer.questionId.toString())
    );

    if (invalidAnswers.length > 0) {
      return res.status(400).json({
        message: 'Invalid question IDs in answers'
      });
    }

    // Check required questions
    const requiredQuestions = survey.questions.filter(q => q.required);
    const answeredQuestionIds = answers.map(a => a.questionId.toString());
    const missingRequired = requiredQuestions.filter(q => 
      !answeredQuestionIds.includes(q._id.toString())
    );

    if (missingRequired.length > 0) {
      return res.status(400).json({
        message: 'Missing answers for required questions',
        missingQuestions: missingRequired.map(q => ({ id: q._id, text: q.text }))
      });
    }

    // Process answers
    const processedAnswers = answers.map(answer => {
      const question = survey.questions.find(q => q._id.toString() === answer.questionId.toString());
      
      return {
        questionId: answer.questionId,
        answer: answer.answer,
        textAnswer: question.type === 'open_text' ? answer.answer : answer.textAnswer
      };
    });

    // Create response
    const response = new SurveyResponse({
      survey: surveyId,
      answers: processedAnswers,
      isAnonymous,
      respondent: isAnonymous ? {} : {
        email: respondent?.email,
        studentId: respondent?.studentId
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await response.save();

    res.status(201).json({
      message: 'Survey response submitted successfully',
      responseId: response._id
    });

  } catch (error) {
    console.error('Survey response submission error:', error);
    res.status(500).json({
      message: 'Internal server error during response submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get survey responses (admin only)
router.get('/:id/responses', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const surveyId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Check if survey exists
    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({
        message: 'Survey not found'
      });
    }

    const responses = await SurveyResponse.find({ survey: surveyId })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SurveyResponse.countDocuments({ survey: surveyId });

    // Generate basic analytics
    const analytics = await this.generateSurveyAnalytics(surveyId);

    res.json({
      survey: {
        id: survey._id,
        title: survey.title,
        totalQuestions: survey.questions.length
      },
      responses,
      analytics,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get survey responses error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Generate survey analytics
async function generateSurveyAnalytics(surveyId) {
  try {
    const survey = await Survey.findById(surveyId);
    const responses = await SurveyResponse.find({ survey: surveyId });

    const analytics = {
      totalResponses: responses.length,
      responseRate: 0, // Would need total invited to calculate
      completionRate: 100, // All submitted responses are complete
      averageTimeToComplete: 0, // Would need to track submission time
      questionAnalytics: []
    };

    // Analyze each question
    for (const question of survey.questions) {
      const questionAnswers = responses.map(response => 
        response.answers.find(answer => 
          answer.questionId.toString() === question._id.toString()
        )
      ).filter(Boolean);

      const questionAnalytic = {
        questionId: question._id,
        questionText: question.text,
        questionType: question.type,
        totalAnswers: questionAnswers.length,
        responses: []
      };

      if (question.type === 'multiple_choice') {
        // Count responses for each option
        const optionCounts = {};
        question.options.forEach(option => {
          optionCounts[option.value] = 0;
        });

        questionAnswers.forEach(answer => {
          if (optionCounts[answer.answer] !== undefined) {
            optionCounts[answer.answer]++;
          }
        });

        questionAnalytic.responses = Object.entries(optionCounts).map(([value, count]) => {
          const option = question.options.find(opt => opt.value.toString() === value.toString());
          return {
            option: option?.text || value,
            count,
            percentage: questionAnswers.length > 0 ? Math.round((count / questionAnswers.length) * 100) : 0
          };
        });

      } else if (question.type === 'scale') {
        // Calculate average and distribution
        const values = questionAnswers.map(answer => parseInt(answer.answer)).filter(val => !isNaN(val));
        const average = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;

        questionAnalytic.average = Math.round(average * 100) / 100;
        questionAnalytic.responses = values;

      } else if (question.type === 'open_text') {
        // Just count responses (text analysis could be added)
        questionAnalytic.responses = questionAnswers.map(answer => ({
          text: answer.textAnswer || answer.answer,
          submittedAt: responses.find(r => r.answers.includes(answer))?.submittedAt
        }));
      }

      analytics.questionAnalytics.push(questionAnalytic);
    }

    return analytics;

  } catch (error) {
    console.error('Survey analytics generation error:', error);
    return {
      totalResponses: 0,
      questionAnalytics: []
    };
  }
}

// Update survey (admin only)
router.put('/:id', auth, authorize('admin'), [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Survey title cannot be empty'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, description, isActive, endDate } = req.body;

    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        message: 'Survey not found'
      });
    }

    // Update fields if provided
    if (title) survey.title = title;
    if (description !== undefined) survey.description = description;
    if (isActive !== undefined) survey.isActive = isActive;
    if (endDate) survey.endDate = new Date(endDate);

    await survey.save();

    res.json({
      message: 'Survey updated successfully',
      survey
    });

  } catch (error) {
    console.error('Survey update error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Delete survey (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        message: 'Survey not found'
      });
    }

    // Also delete all responses
    await SurveyResponse.deleteMany({ survey: req.params.id });
    await Survey.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Survey and all responses deleted successfully'
    });

  } catch (error) {
    console.error('Survey deletion error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

module.exports = router;
