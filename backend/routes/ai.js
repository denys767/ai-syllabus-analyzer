const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');
const Syllabus = require('../models/Syllabus');

const router = express.Router();

// AI Challenge endpoints removed during v2.0.0 refactoring
// The AI Challenger feature has been removed to simplify the codebase
// If you need this functionality, see backend/services/aiService.old.js

module.exports = router;
 
/**
 * Add finalize route after default export to keep patch minimal
 * This will be appended by the module system; consumers import the same router instance
 */

