const express = require('express');
const { body, validationResult } = require('express-validator');
const Policy = require('../models/Policy');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all policies
router.get('/', auth, async (req, res) => {
  try {
    const { type, isActive = true } = req.query;
    const query = { isActive };

    if (type) {
      query.type = type;
    }

    const policies = await Policy.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    // Add acknowledgment status for current user
    const policiesWithStatus = policies.map(policy => ({
      ...policy.toObject(),
      isAcknowledged: policy.isAcknowledgedBy(req.user.userId)
    }));

    res.json({ policies: policiesWithStatus });
  } catch (error) {
    console.error('Get policies error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific policy
router.get('/:id', auth, async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    res.json({
      policy: {
        ...policy.toObject(),
        isAcknowledged: policy.isAcknowledgedBy(req.user.userId)
      }
    });
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new policy (admin only)
router.post('/', auth, authorize(['admin']), [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Назва обов\'язкова'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Зміст обов\'язковий'),
  body('type')
    .isIn(['ai-policy', 'academic-integrity', 'teaching-tips'])
    .withMessage('Невірний тип документа'),
  body('isRequired')
    .optional()
    .isBoolean()
    .withMessage('isRequired має бути булевим значенням')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилка валідації',
        errors: errors.array()
      });
    }

    const { title, content, type, isRequired = true } = req.body;

    const policy = new Policy({
      title,
      content,
      type,
      isRequired,
      createdBy: req.user.userId
    });

    await policy.save();

    res.status(201).json({
      message: 'Документ створено успішно',
      policy
    });
  } catch (error) {
    console.error('Create policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update policy (admin only)
router.put('/:id', auth, authorize(['admin']), [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Назва не може бути порожньою'),
  body('content')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Зміст не може бути порожнім'),
  body('type')
    .optional()
    .isIn(['ai-policy', 'academic-integrity', 'teaching-tips'])
    .withMessage('Невірний тип документа'),
  body('isRequired')
    .optional()
    .isBoolean()
    .withMessage('isRequired має бути булевим значенням'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive має бути булевим значенням')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилка валідації',
        errors: errors.array()
      });
    }

    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    const { title, content, type, isRequired, isActive } = req.body;

    if (title !== undefined) policy.title = title;
    if (content !== undefined) policy.content = content;
    if (type !== undefined) policy.type = type;
    if (isRequired !== undefined) policy.isRequired = isRequired;
    if (isActive !== undefined) policy.isActive = isActive;

    // Increment version if content changed
    if (content !== undefined && content !== policy.content) {
      policy.version += 1;
    }

    await policy.save();

    res.json({
      message: 'Документ оновлено успішно',
      policy
    });
  } catch (error) {
    console.error('Update policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete policy (admin only)
router.delete('/:id', auth, authorize(['admin']), async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    await Policy.findByIdAndDelete(req.params.id);

    res.json({ message: 'Документ видалено успішно' });
  } catch (error) {
    console.error('Delete policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Acknowledge policy
router.post('/:id/acknowledge', auth, async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    // Check if already acknowledged
    if (policy.isAcknowledgedBy(req.user.userId)) {
      return res.status(400).json({ message: 'Документ вже підтверджено' });
    }

    // Add acknowledgment
    policy.acknowledgments.push({
      user: req.user.userId,
      version: policy.version
    });

    await policy.save();

    res.json({
      message: 'Документ підтверджено успішно',
      acknowledgedAt: new Date()
    });
  } catch (error) {
    console.error('Acknowledge policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get acknowledgment status for user
router.get('/:id/status', auth, async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    const isAcknowledged = policy.isAcknowledgedBy(req.user.userId);
    const acknowledgment = policy.acknowledgments.find(
      ack => ack.user.toString() === req.user.userId
    );

    res.json({
      isAcknowledged,
      acknowledgedAt: acknowledgment?.acknowledgedAt,
      version: acknowledgment?.version,
      currentVersion: policy.version,
      needsReAcknowledgment: acknowledgment && acknowledgment.version < policy.version
    });
  } catch (error) {
    console.error('Get acknowledgment status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
