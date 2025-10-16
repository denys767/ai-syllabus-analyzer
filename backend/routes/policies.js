const express = require('express');
const Policy = require('../models/Policy');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/policies');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'policy-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволено: PDF, DOC, DOCX, TXT, MD'));
    }
  }
});

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
router.post('/', 
  auth, 
  authorize('admin'), 
  upload.single('file'),
  async (req, res) => {
  console.log('POST /policies - Creating policy');
  console.log('User:', req.user);
  console.log('Body:', req.body);
  console.log('File:', req.file);
  try {
    // Manual validation since we can't use express-validator array with multer
    if (!req.body.title || !req.body.title.trim()) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Назва обов\'язкова' });
    }
    if (!req.body.content || !req.body.content.trim()) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Зміст обов\'язковий' });
    }
    if (req.body.contentType && !['markdown', 'plain'].includes(req.body.contentType)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Невірний тип контенту' });
    }
    if (!req.body.type || !['ai-policy', 'academic-integrity', 'teaching-tips'].includes(req.body.type)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Невірний тип документа' });
    }

    const { title, content, type, contentType = 'markdown', isRequired = true } = req.body;

    const policyData = {
      title,
      content,
      contentType,
      type,
      isRequired,
      createdBy: req.user.userId
    };

    // Add file info if uploaded
    if (req.file) {
      policyData.attachedFile = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
    }

    const policy = new Policy(policyData);
    await policy.save();

    res.status(201).json({
      message: 'Документ створено успішно',
      policy
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    console.error('Create policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update policy (admin only)
router.put('/:id', 
  auth, 
  authorize('admin'), 
  upload.single('file'),
  async (req, res) => {
  try {
    // Manual validation
    if (req.body.title !== undefined && !req.body.title.trim()) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Назва не може бути порожньою' });
    }
    if (req.body.content !== undefined && !req.body.content.trim()) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Зміст не може бути порожнім' });
    }
    if (req.body.contentType && !['markdown', 'plain'].includes(req.body.contentType)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Невірний тип контенту' });
    }
    if (req.body.type && !['ai-policy', 'academic-integrity', 'teaching-tips'].includes(req.body.type)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Невірний тип документа' });
    }

    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    const { title, content, contentType, type, isRequired, isActive } = req.body;

    if (title !== undefined) policy.title = title;
    if (content !== undefined) policy.content = content;
    if (contentType !== undefined) policy.contentType = contentType;
    if (type !== undefined) policy.type = type;
    if (isRequired !== undefined) policy.isRequired = isRequired;
    if (isActive !== undefined) policy.isActive = isActive;

    // Handle file upload
    if (req.file) {
      // Delete old file if exists
      if (policy.attachedFile?.path) {
        await fs.unlink(policy.attachedFile.path).catch(() => {});
      }
      
      policy.attachedFile = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
    }

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
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    console.error('Update policy error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete policy (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    // Delete associated file if exists
    if (policy.attachedFile?.path) {
      await fs.unlink(policy.attachedFile.path).catch(() => {});
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

// Download attached file
router.get('/:id/download', auth, async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({ message: 'Документ не знайдено' });
    }

    if (!policy.attachedFile || !policy.attachedFile.path) {
      return res.status(404).json({ message: 'Файл не знайдено' });
    }

    // Check if file exists
    try {
      await fs.access(policy.attachedFile.path);
    } catch {
      return res.status(404).json({ message: 'Файл не знайдено на сервері' });
    }

    res.download(policy.attachedFile.path, policy.attachedFile.originalName);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
