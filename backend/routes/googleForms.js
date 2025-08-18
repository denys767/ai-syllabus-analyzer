const express = require('express');
const AIService = require('../services/aiService');

const router = express.Router();

// Webhook для отримання даних з Google Forms
router.post('/survey-webhook', async (req, res) => {
  try {
    // Optional shared secret check for webhook security
    const expected = process.env.GF_WEBHOOK_SECRET;
    const provided = req.headers['x-webhook-secret'] || req.query.secret;
    if (expected && expected !== provided) {
      return res.status(401).json({ message: 'Unauthorized: invalid webhook secret' });
    }

    if (!req.is('application/json')) {
      return res.status(400).json({ message: 'Invalid content-type; expected application/json' });
    }

    console.log('Google Forms survey response received:', req.body);
    
    // Обробляємо дані з Google Forms
    const processedData = await AIService.processSurveyResponse(req.body);
    
  res.status(200).json({
      message: 'Survey response processed successfully',
      data: processedData
    });
    
  } catch (error) {
    console.error('Error processing Google Forms webhook:', error);
    res.status(500).json({
      message: 'Error processing survey response',
      hint: 'Verify webhook secret and payload matches survey-info questions'
    });
  }
});

// Ендпоінт для отримання інформації про опитування
router.get('/survey-info', (req, res) => {
  try {
    const surveyInfo = {
      title: 'Student Profiling Survey for MBA Program',
      description: 'This survey helps us understand student backgrounds and challenges to personalize course content.',
      fields: [
        { name: 'firstName', label: 'First Name', type: 'text', required: true },
        { name: 'lastName', label: 'Last Name', type: 'text', required: true }
      ],
      questions: [
        {
          id: 1,
          question: 'Describe ONE of the biggest challenges you\'re facing at work right now that you believe could be solved through MBA knowledge. Be as specific as possible.',
          type: 'textarea',
          required: true,
          example: 'Our IT team grew from 15 to 45 people in a year, and I\'m unsure how to structure processes and KPIs to maintain delivery speed and product quality while managing this scale.'
        },
        {
          id: 2,
          question: 'What are 2–3 types of decisions you make most frequently in your work? What makes these decisions particularly challenging?',
          type: 'textarea',
          required: true,
          example: '1) Budget allocation across different projects - hard to assess ROI properly. 2) Hiring decisions - difficult to predict cultural fit. 3) Feature prioritization - conflict between user needs and business goals.'
        },
        {
          id: 3,
          question: 'Think of a situation from the past month when you thought: \'I should have known something from management/economics/strategy to handle this better.\' What was that situation?',
          type: 'textarea',
          required: true,
          example: 'We were launching a new product and I realized I was choosing the wrong pricing strategy. I intuitively felt customers were ready to pay more, but didn\'t know how to properly research and justify it.'
        },
        {
          id: 4,
          question: 'In which area or function do you have experience that you could share with colleagues? And conversely - what industry/function experience would be most interesting for you to learn from?',
          type: 'textarea',
          required: true,
          example: 'Can share: scaling engineering teams, agile processes, technical product management. Interested in: B2B sales strategies, financial modeling, supply chain optimization.'
        },
        {
          id: 5,
          question: 'How do you typically learn most effectively - through case studies, discussions, hands-on practice, or something else? And what prevents you from applying new knowledge at work?',
          type: 'textarea',
          required: true,
          example: 'Best through real examples and hands-on practice. Barriers: lack of time for experiments, fear of making mistakes in high-stakes situations, not understanding how to adapt theory to our specific context.'
        }
      ],
      webhookUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/google-forms/survey-webhook`,
      webhookSecretHeader: 'x-webhook-secret',
      webhookSecretValue: process.env.GF_WEBHOOK_SECRET || 'set-in-.env',
      instructions: {
        setup: [
          '1. Create a Google Form with the questions above',
          '2. Set up a Google Apps Script trigger to send responses to the webhook',
          '3. Configure the webhook URL and secret header in your Google Form script',
          '4. Test the integration with a sample response'
        ],
        script: `
// Google Apps Script code to add to your Google Form
function onFormSubmit(e) {
  const form = FormApp.getActiveForm();
  const responses = e.response.getItemResponses();
  
  // Format the data
  const formData = {
    timestamp: new Date().toISOString(),
    formTitle: form.getTitle()
  };
  
  responses.forEach(response => {
    const question = response.getItem().getTitle();
    const answer = response.getResponse();
    formData[question] = answer;
  });
  
  // Send to webhook
  const webhookUrl = '${process.env.BACKEND_URL || 'http://localhost:5000'}/api/google-forms/survey-webhook';
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': '${process.env.GF_WEBHOOK_SECRET || 'set-in-.env'}'
    },
    payload: JSON.stringify(formData)
  };
  
  try {
    const response = UrlFetchApp.fetch(webhookUrl, options);
    console.log('Webhook response:', response.getContentText());
  } catch (error) {
    console.error('Webhook error:', error);
  }
}`
      }
    };

    res.json(surveyInfo);
  } catch (error) {
    console.error('Error getting survey info:', error);
    res.status(500).json({
      message: 'Error getting survey information'
    });
  }
});

module.exports = router;
