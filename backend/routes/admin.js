const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const { auth } = require('../middleware/auth');
const { admin, manager } = require('../middleware/roles');
const User = require('../models/User');
const Syllabus = require('../models/Syllabus');
const AppConfig = require('../models/AppConfig');
const { sendInvitationEmail } = require('../services/emailService');
const { READINESS_WEIGHTS, buildWorkspaceSummary } = require('../services/workflowService');

const router = express.Router();

router.get('/config', auth, admin, async (req, res) => {
  try {
    const config = await AppConfig.findOne({ key: 'main' });
    return res.json({
      academicDirectorEmail:
        config?.academicDirectorEmail || process.env.ACADEMIC_DIRECTOR_EMAIL || process.env.ADMIN_EMAIL || '',
      readinessWeights: READINESS_WEIGHTS,
    });
  } catch (error) {
    console.error('Get admin config error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put(
  '/config',
  auth,
  admin,
  [body('academicDirectorEmail').isEmail().withMessage('Valid academicDirectorEmail is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const config = await AppConfig.findOneAndUpdate(
        { key: 'main' },
        { key: 'main', academicDirectorEmail: req.body.academicDirectorEmail.toLowerCase() },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return res.json({
        academicDirectorEmail: config.academicDirectorEmail,
        readinessWeights: READINESS_WEIGHTS,
      });
    } catch (error) {
      console.error('Update admin config error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.get('/syllabi', auth, manager, async (req, res) => {
  try {
    const query = {};
    if (req.query.program) query.program = req.query.program;
    if (req.query.status) query.workspaceStatus = req.query.status;

    const syllabi = await Syllabus.find(query)
      .populate('instructor', 'firstName lastName email')
      .sort({ updatedAt: -1 });

    const items = syllabi.map((syllabus) => buildWorkspaceSummary(syllabus));
    const summary = {
      total: items.length,
      submitted: items.filter((item) => item.workspaceStatus === 'Submitted').length,
      inProgress: items.filter((item) => item.workspaceStatus === 'In Progress').length,
    };

    return res.json({ syllabi: items, summary });
  } catch (error) {
    console.error('Get admin syllabi error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/users',
  auth,
  admin,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').isIn(['instructor', 'admin', 'manager']).withMessage('Invalid role'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const existing = await User.findOne({ email: req.body.email.toLowerCase() });
      if (existing) {
        return res.status(409).json({ message: 'User with this email already exists' });
      }

      const tempPassword = crypto.randomBytes(12).toString('base64url');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const user = new User({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email.toLowerCase(),
        password: tempPassword,
        role: req.body.role,
        isVerified: false,
        isActive: true,
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() + 24 * 60 * 60 * 1000,
      });

      await user.save();
      sendInvitationEmail(user.email, resetToken).catch((error) => {
        console.warn('Invitation email failed:', error.message);
      });

      return res.status(201).json({
        message: 'User created. Invitation email sent.',
        user: user.toPublicJSON(),
      });
    } catch (error) {
      console.error('Create user error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.get('/users', auth, admin, async (req, res) => {
  try {
    const query = {};
    if (req.query.role) query.role = req.query.role;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [{ firstName: searchRegex }, { lastName: searchRegex }, { email: searchRegex }];
    }

    const users = await User.find(query)
      .select('-password -verificationToken -resetPasswordToken')
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(
      users.map(async (user) => {
        const lastSyllabus = await Syllabus.findOne({ instructor: user._id }).sort({ updatedAt: -1 }).select('updatedAt');
        return {
          ...user.toObject(),
          status: user.isActive ? (user.isVerified ? 'Active' : 'Invited') : 'Inactive',
          lastActive: lastSyllabus?.updatedAt || user.lastLogin || user.createdAt,
        };
      })
    );

    return res.json({ users: enriched });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put(
  '/users/:id',
  auth,
  admin,
  [
    body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
    body('role').optional().isIn(['instructor', 'admin', 'manager']).withMessage('Invalid role'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (req.body.firstName !== undefined) user.firstName = req.body.firstName;
      if (req.body.lastName !== undefined) user.lastName = req.body.lastName;
      if (req.body.role !== undefined) user.role = req.body.role;
      if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
      await user.save();

      return res.json({ message: 'User updated successfully', user: user.toPublicJSON() });
    } catch (error) {
      console.error('Update user error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete('/users/:id', auth, admin, async (req, res) => {
  try {
    const syllabusCount = await Syllabus.countDocuments({ instructor: req.params.id });
    if (syllabusCount > 0) {
      return res.status(400).json({
        message: `Cannot delete user with ${syllabusCount} syllab${syllabusCount === 1 ? 'us' : 'i'}.`,
      });
    }

    await User.findByIdAndDelete(req.params.id);
    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/health', auth, admin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalSyllabi = await Syllabus.countDocuments();
    return res.json({
      status: 'HEALTHY',
      totals: {
        users: totalUsers,
        syllabi: totalSyllabi,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Admin health error:', error);
    return res.status(500).json({ status: 'ERROR', message: 'Health check failed' });
  }
});

module.exports = router;
