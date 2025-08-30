const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Syllabus = require('../models/Syllabus');
// const { Survey, SurveyResponse } = require('../models/Survey'); // removed unused survey stats for now
const User = require('../models/User');
const PracticalIdea = require('../models/PracticalIdea');
const { sendAccountDeletionEmail } = require('../services/emailService');

const router = express.Router();

// Get user statistics for dashboard
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user's syllabi count
    const totalSyllabi = await Syllabus.countDocuments({ instructor: userId });
    
    // Get analyzed syllabi count
    const analyzedSyllabi = await Syllabus.countDocuments({ 
      instructor: userId, 
      status: 'analyzed' 
    });
    
    
    // Calculate AI score (average quality score across user's syllabi)
    const syllabi = await Syllabus.find({ instructor: userId });
    let aiScore = 0;
    
    if (syllabi.length > 0) {
      const scores = syllabi
        .filter(s => s.analysis?.templateCompliance?.score)
        .map(s => s.analysis.templateCompliance.score);
      
      if (scores.length > 0) {
        aiScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
      }
    }
    
    const stats = {
      totalSyllabi,
      analyzedSyllabi,
  // completedSurveys: 0, // metric not implemented currently
      aiScore
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({
      message: 'Помилка отримання статистики користувача'
    });
  }
});

// Update user settings
router.put('/settings', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
  const { notifications, language, theme } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }
    
    // Update user settings
    if (notifications !== undefined) user.settings.notifications = notifications;
  if (language !== undefined) user.settings.language = language;
  if (theme !== undefined) user.settings.theme = theme; // now accepts 'system'|'light'|'dark'
    
    await user.save();
    
    res.json({
      message: 'Налаштування оновлено успішно',
      settings: user.settings
    });
    
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({
      message: 'Помилка оновлення налаштувань'
    });
  }
});

// Change password
router.put('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Поточний пароль обов\'язковий'),
  body('newPassword').isLength({ min: 6 }).withMessage('Новий пароль має містити мінімум 6 символів'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }
    
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    // Only verified users can change password
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Спочатку підтвердіть email, щоб змінити пароль' });
    }
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Неправильний поточний пароль' });
    }
    
  // Assign plain new password; pre-save hook will hash
  user.password = newPassword;
    
    await user.save();
    
    res.json({
      message: 'Пароль змінено успішно'
    });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      message: 'Помилка зміни пароля'
    });
  }
});

// Delete user account
router.delete('/account', auth, [
  body('password').notEmpty().withMessage('Пароль необхідний для підтвердження видалення акаунта')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const userId = req.user.userId;
    const { password } = req.body;
    
    // Verify user and password
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Неправильний пароль' });
    }

    // Delete user's syllabi
    await Syllabus.deleteMany({ instructor: userId });
    
  // Delete user's practical ideas
  await PracticalIdea.deleteMany({ instructor: userId });
    
    // Delete user account
    await User.findByIdAndDelete(userId);

    // Send confirmation email (best-effort)
    try {
      await sendAccountDeletionEmail(user.email);
    } catch (e) {
      console.warn('Failed to send account deletion email:', e.message);
    }
    
    res.json({
      message: 'Акаунт видалено успішно'
    });
    
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      message: 'Помилка видалення акаунта'
    });
  }
});

module.exports = router;
