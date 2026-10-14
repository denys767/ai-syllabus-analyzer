const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { generateToken, hashToken } = require('../utils/tokens');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();

function validationFailed(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  return true;
}

// Login user
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail({ gmail_remove_dots: false })
    .withMessage('Вкажіть коректний email'),
  body('password')
    .notEmpty()
    .withMessage('Пароль обов\'язковий')
], async (req, res) => {
  try {
    if (validationFailed(req, res)) return;

    const { email, password } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
    }

    user.lastLogin = new Date();
    await user.save();

    // Роль у токен не кладемо як джерело істини: middleware auth бере її з БД
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Вхід виконано успішно',
      token,
      user: user.toPublicJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера під час входу' });
  }
});

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }
    res.json({ user: user.toPublicJSON() });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Update user profile. Email змінюється лише через /api/users/email-change/*.
router.put('/profile', auth, [
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Ім\'я не може бути порожнім'),
  body('lastName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Прізвище не може бути порожнім'),
  body('avatarUrl')
    .optional()
    .trim(),
], async (req, res) => {
  try {
    if (validationFailed(req, res)) return;

    const { firstName, lastName, avatarUrl } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    await user.save();

    res.json({
      message: 'Профіль оновлено успішно',
      user: user.toPublicJSON()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

const RESET_GENERIC_MESSAGE = 'Якщо така адреса існує, ви отримаєте інструкції зі скидання пароля';

// Request password reset
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail({ gmail_remove_dots: false })
    .withMessage('Вкажіть коректний email')
], async (req, res) => {
  try {
    if (validationFailed(req, res)) return;

    const { email } = req.body;
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      // Не розкриваємо, чи існує обліковий запис
      return res.json({ message: RESET_GENERIC_MESSAGE });
    }

    const { raw, hash } = generateToken();
    user.resetPasswordToken = hash;
    user.resetPasswordExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 години
    await user.save();

    try {
      await sendPasswordResetEmail(user.email, raw);
    } catch (e) {
      console.warn('Failed to send password reset email:', e.message);
    }

    res.json({ message: RESET_GENERIC_MESSAGE });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Reset password (також використовується для встановлення пароля за інвайтом)
router.post('/reset-password', [
  body('token')
    .isString()
    .notEmpty()
    .withMessage('Токен скидання обов\'язковий'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Пароль має містити мінімум 6 символів')
], async (req, res) => {
  try {
    if (validationFailed(req, res)) return;

    const { token, password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: hashToken(token),
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Недійсний або прострочений токен скидання' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Пароль оновлено' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Logout (client-side token invalidation)
router.post('/logout', auth, (req, res) => {
  res.json({ message: 'Вихід виконано' });
});

module.exports = router;
