const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { admin, manager } = require('../middleware/roles');
const User = require('../models/User');
const Syllabus = require('../models/Syllabus');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Create new user (admin only) WITHOUT setting password; user will set it via onboarding email
router.post('/users', auth, admin, [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('role')
    .isIn(['instructor', 'admin', 'manager'])
    .withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this email already exists'
      });
    }

    // Generate temp random password (will be replaced when user sets their own)
    const tempPassword = require('crypto').randomBytes(12).toString('base64url');
    const crypto = require('crypto');
  const { sendInvitationEmail } = require('../services/emailService');

  const resetToken = crypto.randomBytes(32).toString('hex');

    const user = new User({
      firstName,
      lastName,
      email,
      password: tempPassword, // hashed via pre-save hook
      role,
      isVerified: false, // must verify email
      isActive: true,
  resetPasswordToken: resetToken,
  resetPasswordExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    await user.save();

    // Fire-and-forget onboarding email
  sendInvitationEmail(email, resetToken)
      .catch(e => console.warn('Failed to send onboarding email:', e.message));

    res.status(201).json({
  message: 'User created. Invitation email sent (verify & set password).',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Dashboard stats (admin only)
router.get('/dashboard-stats', auth, admin, async (req, res) => {
  try {
    // Base statistics
    const [totalUsers, totalSyllabi] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Syllabus.countDocuments()
    ]);

    const activeUsers = await User.countDocuments({ 
      isActive: true, 
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });

    const analyzedSyllabi = await Syllabus.countDocuments({ status: 'analyzed' });
    
    // User distribution by role
    const usersByRole = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    const roleDistribution = {};
    usersByRole.forEach(item => {
      roleDistribution[item._id] = item.count;
    });

    // Recent syllabi
    const recentSyllabi = await Syllabus.find()
      .populate('instructor', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status createdAt instructor');

    // Average quality calculation via model method (client-facing score)
    const analyzedDocs = await Syllabus.find({ status: 'analyzed' }).select('analysis recommendations structure');
    const averageQuality = analyzedDocs.length > 0
      ? Math.round(analyzedDocs.reduce((sum, s) => sum + (typeof s.calculateQualityScore === 'function' ? s.calculateQualityScore() : 0), 0) / analyzedDocs.length)
      : 0;

    // Activity statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    const thisMonth = new Date();
    thisMonth.setDate(thisMonth.getDate() - 30);

    const [uploadsToday, analysesThisWeek, surveyResponsesThisMonth] = await Promise.all([
      Syllabus.countDocuments({ createdAt: { $gte: today } }),
      Syllabus.countDocuments({ 
        status: 'analyzed', 
        updatedAt: { $gte: thisWeek } 
      }),
      // If Survey model exists, count responses
      0 // Placeholder - будемо оновлювати коли додамо модель Survey
    ]);

    const stats = {
      users: {
        total: totalUsers,
        active: activeUsers,
        byRole: roleDistribution
      },
      syllabi: {
        total: totalSyllabi,
        analyzed: analyzedSyllabi,
        averageQuality: averageQuality
      },
      surveys: {
        total: 0, // Placeholder
        thisMonth: surveyResponsesThisMonth
      },
      activity: {
        uploadsToday,
        analysesThisWeek,
        activeUsers
      },
      recentSyllabi
    };

    res.json({ stats });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      message: 'Помилка завантаження статистики'
    });
  }
});

// Get syllabi for admin view
router.get('/syllabi', auth, manager, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const sort = req.query.sort || 'createdAt';

    const query = {};
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.instructor) {
      query.instructor = req.query.instructor;
    }

    const syllabi = await Syllabus.find(query)
      .populate('instructor', 'firstName lastName email')
      .sort({ [sort]: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Syllabus.countDocuments(query);

    res.json({
      syllabi,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get syllabi error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Get all users (admin only)
router.get('/users', auth, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    
    if (req.query.role) {
      query.role = req.query.role;
    }
    if (req.query.verified !== undefined) {
      query.isVerified = req.query.verified === 'true';
    }
    if (req.query.active !== undefined) {
      query.isActive = req.query.active === 'true';
    }
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex }
      ];
    }

    const users = await User.find(query)
      .select('-password -verificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const syllabusCount = await Syllabus.countDocuments({ instructor: user._id });
        const lastSyllabusUpload = await Syllabus.findOne({ instructor: user._id })
          .sort({ createdAt: -1 })
          .select('createdAt');

        return {
          ...user.toObject(),
          statistics: {
            syllabusCount,
            lastActivity: lastSyllabusUpload?.createdAt || user.lastLogin || user.createdAt
          }
        };
      })
    );

    res.json({
      users: usersWithStats,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Get specific user details (admin only)
router.get('/users/:id', auth, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -verificationToken -resetPasswordToken');

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    const syllabi = await Syllabus.find({ instructor: req.params.id })
      .select('title course status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    const userDetails = {
      ...user.toObject(),
      statistics: {
        syllabusCount: syllabi.length,
        averageQualityScore: await calculateUserAverageQuality(req.params.id),
        lastActivity: await getUserLastActivity(req.params.id)
      },
      recentSyllabi: syllabi
    };

    res.json(userDetails);

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Update user (admin only)
router.put('/users/:id', auth, admin, [
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
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['instructor', 'admin', 'manager'])
    .withMessage('Invalid role'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, password, role, isActive, isVerified } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    if (req.user.userId === req.params.id && isActive === false) {
      return res.status(400).json({
        message: 'You cannot deactivate your own account'
      });
    }

    // Update fields if provided
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (password !== undefined && password.trim()) {
      // Assign plain password and let pre-save hook hash it
      user.password = password;
    }
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (isVerified !== undefined) user.isVerified = isVerified;

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Delete user (admin only)
router.delete('/users/:id', auth, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    if (req.user.userId === req.params.id) {
      return res.status(400).json({
        message: 'You cannot delete your own account'
      });
    }

    const syllabusCount = await Syllabus.countDocuments({ instructor: req.params.id });
    if (syllabusCount > 0) {
      return res.status(400).json({
        message: `Cannot delete user. They have ${syllabusCount} syllab${syllabusCount === 1 ? 'us' : 'i'} associated with their account.`,
        suggestedAction: 'Consider deactivating the user instead or transfer ownership of syllabi first.'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Get system statistics (admin/manager)
router.get('/statistics', auth, manager, async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '30days';
    const dateFilter = getDateFilter(timeRange);

    const stats = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ createdAt: { $gte: dateFilter } }),
      User.countDocuments({ role: 'instructor' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'manager' }),
      Syllabus.countDocuments(),
      Syllabus.countDocuments({ createdAt: { $gte: dateFilter } }),
      Syllabus.countDocuments({ status: 'analyzed' }),
      Syllabus.countDocuments({ status: 'processing' }),
      calculateSystemAverageQuality(),
      calculateRecommendationStats()
    ]);

    const systemStats = {
      users: {
        total: stats[0],
        newUsers: stats[1],
        instructors: stats[2],
        admins: stats[3],
        managers: stats[4]
      },
      syllabi: {
        total: stats[5],
        newSyllabi: stats[6],
        analyzed: stats[7],
        processing: stats[8]
      },
      quality: {
        averageScore: stats[9],
        recommendationStats: stats[10]
      },
      timeRange,
      generatedAt: new Date()
    };

    res.json(systemStats);

  } catch (error) {
    console.error('System statistics error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Get audit logs (admin only)
router.get('/audit-logs', auth, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const recentActivities = await Promise.all([
      User.find({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        .select('firstName lastName email createdAt')
        .sort({ createdAt: -1 })
        .limit(20),
      Syllabus.find({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        .populate('instructor', 'firstName lastName email')
        .select('title instructor createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
    ]);

    const auditLogs = [
      ...recentActivities[0].map(user => ({
        action: 'USER_REGISTERED',
        user: `${user.firstName} ${user.lastName}`,
        email: user.email,
        timestamp: user.createdAt,
        details: 'New user registration'
      })),
      ...recentActivities[1].map(syllabus => ({
        action: 'SYLLABUS_UPLOADED',
        user: `${syllabus.instructor.firstName} ${syllabus.instructor.lastName}`,
        email: syllabus.instructor.email,
        timestamp: syllabus.createdAt,
        details: `Uploaded syllabus: ${syllabus.title}`
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const paginatedLogs = auditLogs.slice(skip, skip + limit);

    res.json({
      logs: paginatedLogs,
      pagination: {
        current: page,
        pages: Math.ceil(auditLogs.length / limit),
        total: auditLogs.length,
        limit
      }
    });

  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Bulk user operations (admin only)
router.post('/users/bulk-action', auth, admin, [
  body('action')
    .isIn(['activate', 'deactivate', 'verify', 'delete'])
    .withMessage('Invalid bulk action'),
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('At least one user ID is required'),
  body('userIds.*')
    .isMongoId()
    .withMessage('Invalid user ID format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { action, userIds } = req.body;

    if (userIds.includes(req.user.userId)) {
      return res.status(400).json({
        message: 'You cannot perform bulk actions on your own account'
      });
    }

    let updateOperation = {};
    let successMessage = '';

    switch (action) {
      case 'activate':
        updateOperation = { isActive: true };
        successMessage = 'Users activated successfully';
        break;
      case 'deactivate':
        updateOperation = { isActive: false };
        successMessage = 'Users deactivated successfully';
        break;
      case 'verify':
        updateOperation = { isVerified: true };
        successMessage = 'Users verified successfully';
        break;
      case 'delete':
        const usersWithSyllabi = await Syllabus.distinct('instructor', {
          instructor: { $in: userIds }
        });
        
        if (usersWithSyllabi.length > 0) {
          return res.status(400).json({
            message: 'Cannot delete users who have syllabi associated with their accounts',
            usersWithSyllabi
          });
        }

        await User.deleteMany({ _id: { $in: userIds } });
        return res.json({
          message: 'Users deleted successfully',
          affectedCount: userIds.length
        });
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      updateOperation
    );

    res.json({
      message: successMessage,
      affectedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Bulk user action error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// System health check (admin only)
router.get('/health', auth, admin, async (req, res) => {
  try {
    const health = {
      database: 'connected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date(),
      checks: {}
    };

    try {
      await User.findOne().limit(1);
      health.checks.database = 'OK';
    } catch (error) {
      health.checks.database = 'ERROR';
      health.database = 'disconnected';
    }

    try {
      const fs = require('fs').promises;
      const path = require('path');
      const uploadDir = path.join(__dirname, '../uploads');
      await fs.access(uploadDir);
      health.checks.fileSystem = 'OK';
    } catch (error) {
      health.checks.fileSystem = 'ERROR';
    }

    const stuckSyllabi = await Syllabus.countDocuments({
      status: 'processing',
      createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } // Older than 1 hour
    });

    health.checks.stuckProcessing = stuckSyllabi === 0 ? 'OK' : `${stuckSyllabi} stuck`;

    const hasErrors = Object.values(health.checks).some(check => check !== 'OK');
    health.status = hasErrors ? 'WARNING' : 'HEALTHY';

    res.json(health);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date()
    });
  }
});

// Helper functions
function getDateFilter(timeRange) {
  const now = new Date();
  switch (timeRange) {
    case '7days':
      return new Date(now.setDate(now.getDate() - 7));
    case '30days':
      return new Date(now.setDate(now.getDate() - 30));
    case '90days':
      return new Date(now.setDate(now.getDate() - 90));
    case '1year':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setDate(now.getDate() - 30));
  }
}

async function calculateUserAverageQuality(userId) {
  const syllabi = await Syllabus.find({ instructor: userId });
  if (syllabi.length === 0) return 0;

  const scores = syllabi.map(s => s.calculateQualityScore());
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

async function getUserLastActivity(userId) {
  const lastSyllabus = await Syllabus.findOne({ instructor: userId })
    .sort({ createdAt: -1 })
    .select('createdAt');

  const user = await User.findById(userId).select('lastLogin');

  if (lastSyllabus && user.lastLogin) {
    return lastSyllabus.createdAt > user.lastLogin ? lastSyllabus.createdAt : user.lastLogin;
  }

  return lastSyllabus?.createdAt || user.lastLogin;
}

async function calculateSystemAverageQuality() {
  const syllabi = await Syllabus.find({ status: 'analyzed' });
  if (syllabi.length === 0) return 0;

  const scores = syllabi.map(s => s.calculateQualityScore());
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

async function calculateRecommendationStats() {
  const syllabi = await Syllabus.find({ 'recommendations.0': { $exists: true } });
  
  let totalRecommendations = 0;
  let acceptedRecommendations = 0;

  syllabi.forEach(s => {
    totalRecommendations += s.recommendations.length;
    acceptedRecommendations += s.recommendations.filter(r => r.status === 'accepted').length;
  });

  return {
    total: totalRecommendations,
    accepted: acceptedRecommendations,
    acceptanceRate: totalRecommendations > 0 ? 
      Math.round((acceptedRecommendations / totalRecommendations) * 100) : 0
  };
}

module.exports = router;
