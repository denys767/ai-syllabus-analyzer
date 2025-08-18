const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, admin } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');

// Admin-only user creation endpoint
router.post('/create-user', auth, admin, [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('role')
    .isIn(['instructor', 'admin', 'manager'])
    .withMessage('Role must be instructor, admin, or manager')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, firstName, lastName, role, department } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        message: 'Користувач з такою електронною поштою вже існує'
      });
    }

  // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      department,
      isVerified: true, // Admin-created users are automatically verified
      isActive: true
    });

    await user.save();

    res.status(201).json({
      message: 'Користувач створений успішно',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({
      message: 'Internal server error during user creation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login user
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({
        message: 'Неправильна електронна пошта або пароль'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Неправильна електронна пошта або пароль'
      });
    }

    // Block unverified users
    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Потрібно підтвердити email. Перевірте пошту або надішліть лист повторно.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role
      },
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
    res.status(500).json({
      message: 'Internal server error during login'
    });
  }
});

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.json({
      user: user.toPublicJSON()
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Update user profile
router.put('/profile', auth, [
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty'),
  body('lastName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty'),
  body('department')
    .optional()
    .trim(),
  body('avatarUrl')
    .optional()
    .trim(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

  const { firstName, lastName, department, avatarUrl, email } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Update fields if provided
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (department !== undefined) user.department = department;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    // Handle email change: set new email and mark unverified + issue token
    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: 'Email already in use' });
      }
      user.email = email;
      user.isVerified = false;
      user.verificationToken = require('crypto').randomBytes(32).toString('hex');
      // Best-effort send verification email
      try {
        const { sendVerificationEmail } = require('../services/emailService');
        await sendVerificationEmail(user.email, user.verificationToken);
      } catch (e) {
        console.warn('Failed to send verification after email change:', e.message);
      }
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Verify email
router.post('/verify-email', [
  body('token')
    .notEmpty()
    .withMessage('Verification token is required')
], async (req, res) => {
  try {
    const { token } = req.body;

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired verification token'
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Request password reset
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({
        message: 'If the email exists, you will receive password reset instructions'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email via Gmail/SMTP
    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (e) {
      console.warn('Failed to send password reset email:', e.message);
    }

    res.json({
      message: 'If the email exists, you will receive password reset instructions'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Resend verification email
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      // Don't reveal existence
      return res.json({ message: 'If the email exists, a verification link will be sent' });
    }
    if (user.isVerified) {
      return res.json({ message: 'Account already verified' });
    }

    // Create new verification token if missing
    if (!user.verificationToken) {
      user.verificationToken = crypto.randomBytes(32).toString('hex');
      await user.save();
    }

    try {
      await sendVerificationEmail(user.email, user.verificationToken);
    } catch (e) {
      console.warn('Failed to send verification email:', e.message);
    }

    res.json({ message: 'If the email exists, a verification link will be sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reset password
router.post('/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired reset token'
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Logout (client-side token invalidation)
router.post('/logout', auth, (req, res) => {
  res.json({
    message: 'Logout successful'
  });
});

module.exports = router;
