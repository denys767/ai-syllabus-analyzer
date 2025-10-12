const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Syllabus = require('../models/Syllabus');
// const { Survey, SurveyResponse } = require('../models/Survey'); // removed unused survey stats for now
const User = require('../models/User');
const PracticalIdea = require('../models/PracticalIdea');
const { sendAccountDeletionEmail, sendEmailChangeConfirmation } = require('../services/emailService');
const crypto = require('crypto');

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
    
    
    // Deprecated AI score removed (numeric scoring no longer used)

    const stats = {
      totalSyllabi,
      analyzedSyllabi,
      // aiScore removed
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

// Request email change: store pendingEmail and send confirmation to the new address
router.post('/email-change/request', auth, [
  body('newEmail').isEmail().withMessage('Вкажіть коректний email').normalizeEmail({ gmail_remove_dots: false })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Помилки валідації', errors: errors.array() });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });

    const { newEmail } = req.body;
    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ message: 'Новий email співпадає з поточним' });
    }

    // Ensure email is not used by another account
    const exists = await User.findOne({ email: newEmail.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Цей email вже використовується' });

    user.pendingEmail = newEmail.toLowerCase();
    user.emailChangeToken = crypto.randomBytes(32).toString('hex');
    user.emailChangeTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
    await user.save();

    // Best-effort email to new address
    try {
      await sendEmailChangeConfirmation(user.pendingEmail, user.emailChangeToken);
    } catch (e) {
      console.warn('Failed to send email change confirmation:', e.message);
    }

    return res.json({ message: 'Майже готово! Перевірте нову пошту для підтвердження зміни.' });
  } catch (error) {
    console.error('Email change request error:', error);
    return res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Confirm email change via token sent to the new email address
router.post('/email-change/confirm', [
  body('token').notEmpty().withMessage('Потрібен токен підтвердження')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Помилки валідації', errors: errors.array() });
    }

    const { token } = req.body;
    const user = await User.findOne({ emailChangeToken: token, emailChangeTokenExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ message: 'Недійсний або прострочений токен' });
    }

    if (!user.pendingEmail) {
      return res.status(400).json({ message: 'Немає запиту на зміну email' });
    }

    // Final check that pendingEmail is still free
    const exists = await User.findOne({ email: user.pendingEmail });
    if (exists && exists._id.toString() !== user._id.toString()) {
      return res.status(409).json({ message: 'Цей email вже використовується' });
    }

    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.emailChangeToken = undefined;
    user.emailChangeTokenExpires = undefined;

    // When changing email, user must re-verify? Typically not if already verified, but business can decide.
    // We'll keep existing verification status. Optionally could set isVerified=false and issue new verification.

    await user.save();

    return res.json({ message: 'Email успішно змінено' });
  } catch (error) {
    console.error('Email change confirm error:', error);
    return res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

module.exports = router;
