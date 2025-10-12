const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { body, validationResult } = require('express-validator');

const Syllabus = require('../models/Syllabus');
const { auth, authorize, requireVerification } = require('../middleware/auth');
const aiService = require('../services/aiService');
const { admin } = require('../middleware/roles');

const router = express.Router();

// Helpers
function getOwnerId(syllabus) {
  const inst = syllabus && syllabus.instructor;
  if (!inst) return null;
  if (typeof inst === 'object' && inst !== null && inst._id) {
    return inst._id.toString();
  }
  try {
    return inst.toString();
  } catch {
    return null;
  }
}

function isOwnerOrRole(user, syllabus, allowedRoles = ['admin', 'manager']) {
  const ownerId = getOwnerId(syllabus);
  const isOwner = !!ownerId && ownerId === user.userId;
  const hasRole = allowedRoles.includes(user.role);
  return isOwner || hasRole;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/syllabi');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and DOCX files are allowed.'));
    }
  }
});

// Extract text from uploaded file
async function extractTextFromFile(filePath, mimetype) {
  try {
  if (mimetype === 'application/pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
  } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimetype === 'application/msword') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error('Failed to extract text from file');
  }
}

// Upload and analyze syllabus
router.post('/upload', auth, /* requireVerification, */ upload.single('syllabus'), [
  body('courseName')
    .trim()
    .notEmpty()
    .withMessage('Syllabus title is required'),
  body('courseCode')
    .optional()
    .trim(),
  body('credits')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Credits must be between 1 and 10'),
  body('semester')
    .optional()
    .trim(),
  body('year')
    .optional()
    .isInt({ min: 2020, max: 2030 })
    .withMessage('Year must be between 2020 and 2030')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        await fs.unlink(req.file.path).catch(console.error);
      }
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'Syllabus file is required'
      });
    }

    const { courseName, courseCode, credits, semester, year } = req.body;

    // Extract text from file
    const extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);

    if (!extractedText || extractedText.trim().length === 0) {
      await fs.unlink(req.file.path).catch(console.error);
      return res.status(400).json({
        message: 'Could not extract text from the uploaded file'
      });
    }

    // Create syllabus record
    const syllabus = new Syllabus({
      title: courseName,
      course: {
        code: courseCode,
        name: courseName,
        credits: credits ? parseInt(credits) : undefined,
        semester,
        year: year ? parseInt(year) : new Date().getFullYear()
      },
      instructor: req.user.userId,
      originalFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      },
      extractedText,
      status: 'processing'
    });

    await syllabus.save();

    // Start AI analysis in background
    setImmediate(async () => {
      try {
        await aiService.analyzeSyllabus(syllabus._id);
        // After analysis, start the practical challenge
        await aiService.startPracticalChallenge(syllabus._id);
      } catch (error) {
        console.error('AI analysis error for syllabus', syllabus._id, ':', error);
        // Update status to indicate analysis failed
        await Syllabus.findByIdAndUpdate(syllabus._id, { 
          status: 'error',
          'analysis.error': error.message 
        });
      }
    });

    res.status(201).json({
      message: 'Syllabus uploaded successfully. Analysis is in progress.',
      syllabusId: syllabus._id,
      status: syllabus.status
    });

  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    console.error('Syllabus upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large. Maximum size is 10MB.'
      });
    }

    res.status(500).json({
      message: 'Internal server error during file upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all syllabi for current user
router.get('/my-syllabi', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { instructor: req.user.userId };
    
    // Add status filter if provided
    if (req.query.status) {
      query.status = req.query.status;
    }

    const syllabi = await Syllabus.find(query)
      .select('-extractedText -vectorEmbedding') // Exclude large fields
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('instructor', 'firstName lastName email');

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

// Get specific syllabus details
router.get('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .populate('instructor', 'firstName lastName email department');

    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

  // Check if user owns this syllabus or has admin/manager role
  if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({
        message: 'Access denied. You can only view your own syllabi.'
      });
    }

  // Return syllabus without legacy quality score metric
  res.json(syllabus.toObject());

  } catch (error) {
    console.error('Get syllabus error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Update recommendation status
router.put('/:id/recommendations/:recommendationId', auth, [
  body('status')
    .isIn(['accepted', 'rejected', 'commented'])
    .withMessage('Status must be accepted, rejected, or commented'),
  body('comment')
    .optional()
    .trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { status, comment } = req.body;
    const { id: syllabusId, recommendationId } = req.params;

    const syllabus = await Syllabus.findById(syllabusId);
    
    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

    // Check ownership
    if (syllabus.instructor.toString() !== req.user.userId) {
      return res.status(403).json({
        message: 'Access denied. You can only update your own syllabi.'
      });
    }

    // Find and update the recommendation (support legacy custom id field)
    let recommendation = syllabus.recommendations.id(recommendationId);
    if (!recommendation) {
      recommendation = syllabus.recommendations.find(r => r.id === recommendationId);
    }
    if (!recommendation) {
      return res.status(404).json({
        message: 'Recommendation not found'
      });
    }

    recommendation.status = status;
    recommendation.respondedAt = new Date();
    
    if (comment) {
      recommendation.instructorComment = comment;
    }

    await syllabus.save();

    // If status is 'commented', trigger AI response
    if (status === 'commented' && comment) {
      setImmediate(async () => {
        try {
          const aiResponse = await aiService.generateResponseToComment(
            syllabus._id, 
            recommendationId, 
            comment
          );
          
          recommendation.aiResponse = aiResponse;
          await syllabus.save();
        } catch (error) {
          console.error('AI response generation error:', error);
        }
      });
    }

    res.json({
      message: 'Recommendation updated successfully',
      recommendation
    });

  } catch (error) {
    console.error('Update recommendation error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Get syllabus analysis status
router.get('/:id/status', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .select('status analysis.error instructor')
      .populate('instructor', '_id');

    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

  // Check ownership
  if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    res.json({
      status: syllabus.status,
      error: syllabus.analysis?.error
    });

  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Delete syllabus
router.delete('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    
    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

  // Check ownership or admin privileges
  if (!isOwnerOrRole(req.user, syllabus, ['admin'])) {
      return res.status(403).json({
        message: 'Access denied. You can only delete your own syllabi.'
      });
    }

    // Delete associated files from filesystem (best-effort)
    try { await syllabus.cleanupFiles(); } catch (e) { /* ignore */ }

    await Syllabus.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Syllabus deleted successfully'
    });

  } catch (error) {
    console.error('Delete syllabus error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Update syllabus (basic metadata)
router.put('/:id', auth, [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty'),
  body('courseCode')
    .optional()
    .trim(),
  body('courseName')
    .optional()
    .trim(),
  body('credits')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Credits must be between 1 and 10'),
  body('semester')
    .optional()
    .trim(),
  body('year')
    .optional()
    .isInt({ min: 2020, max: 2030 })
    .withMessage('Year must be between 2020 and 2030')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const syllabus = await Syllabus.findById(req.params.id);
    
    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

  // Check ownership
  if (!isOwnerOrRole(req.user, syllabus, ['admin'])) {
      return res.status(403).json({
        message: 'Access denied. You can only edit your own syllabi.'
      });
    }

    const { title, courseCode, courseName, credits, semester, year } = req.body;

    // Update syllabus
    if (title) syllabus.title = title;
    if (courseCode !== undefined) syllabus.course.code = courseCode;
    if (courseName !== undefined) syllabus.course.name = courseName;
    if (credits !== undefined) syllabus.course.credits = parseInt(credits);
    if (semester !== undefined) syllabus.course.semester = semester;
    if (year !== undefined) syllabus.course.year = parseInt(year);

    await syllabus.save();

    res.json({
      message: 'Syllabus updated successfully',
      syllabus
    });

  } catch (error) {
    console.error('Update syllabus error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Trigger AI analysis
router.post('/:id/analyze', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    
    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

  // Check ownership
  if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Update status to processing
    syllabus.status = 'processing';
    await syllabus.save();

    // Start AI analysis in background
    setImmediate(async () => {
      try {
        await aiService.analyzeSyllabus(syllabus._id);
        // After analysis, start the practical challenge
        await aiService.startPracticalChallenge(syllabus._id);
      } catch (error) {
        console.error('AI analysis error for syllabus', syllabus._id, ':', error);
        await Syllabus.findByIdAndUpdate(syllabus._id, { 
          status: 'error',
          'analysis.error': error.message 
        });
      }
    });

    res.json({
      message: 'Analysis started successfully',
      status: 'processing'
    });

  } catch (error) {
    console.error('Start analysis error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Start LLM-powered PDF diff generation
router.post('/:id/generate-diff-pdf', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const accepted = (syllabus.recommendations || []).filter(r => r.status === 'accepted');
    if (!accepted.length) {
      return res.status(400).json({ message: 'Спочатку прийміть принаймні одну рекомендацію' });
    }

    if (syllabus.editingStatus === 'processing') {
      return res.status(409).json({ message: 'Генерація вже триває' });
    }

    syllabus.editingStatus = 'processing';
    syllabus.editingError = undefined;
    await syllabus.save();

    setImmediate(async () => {
      try {
        await aiService.generateDiffPdf(syllabus._id);
      } catch (err) {
        console.error('Diff PDF generation error:', err);
      }
    });

    return res.status(202).json({
      message: 'Генерацію PDF розпочато',
      status: syllabus.editingStatus
    });
  } catch (error) {
    console.error('Start diff PDF error:', error);
    return res.status(500).json({ message: 'Не вдалося розпочати генерацію PDF' });
  }
});

// Poll current editing status
router.get('/:id/editing-status', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id).select('editingStatus editingError editedPdf instructor title course');
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const { editingStatus, editingError, editedPdf } = syllabus;
    return res.json({
      status: editingStatus,
      error: editingError,
      editedPdf: editedPdf ? {
        filename: editedPdf.originalName,
        generatedAt: editedPdf.generatedAt,
        size: editedPdf.size
      } : null
    });
  } catch (error) {
    console.error('Get editing status error:', error);
    return res.status(500).json({ message: 'Не вдалося отримати статус редагування' });
  }
});

// Download generated PDF diff
router.get('/:id/download-edited-pdf', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    if (!syllabus.editedPdf?.path || syllabus.editingStatus !== 'ready') {
      return res.status(400).json({ message: 'PDF ще не згенеровано' });
    }

    try {
      await fs.access(syllabus.editedPdf.path);
    } catch {
      return res.status(404).json({ message: 'Файл PDF не знайдено' });
    }

    res.download(syllabus.editedPdf.path, syllabus.editedPdf.originalName || 'syllabus-diff.pdf');
  } catch (error) {
    console.error('Download edited pdf error:', error);
    return res.status(500).json({ message: 'Не вдалося завантажити PDF' });
  }
});

// Download syllabus file
router.get('/:id/download', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    
    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

  // Check ownership or admin/manager privileges
  if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    const filePath = syllabus.originalFile.path;
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        message: 'File not found on server'
      });
    }

    res.download(filePath, syllabus.originalFile.originalName);

  } catch (error) {
    console.error('Download syllabus error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Download modified syllabus (DOCX with inline comment markers) – generates once then caches metadata
router.get('/:id/download-modified', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Силабус не знайдено' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Доступ заборонено' });

    // Regenerate fresh TXT with inline angle-bracket comments: "...оригінальний текст... <КОМЕНТАР>"
    const accepted = (syllabus.recommendations || []).filter(r => r.status === 'accepted');
    const original = (syllabus.extractedText || '').trim();
    const lines = original.split(/\n+/);
    const keywordMap = {
      structure: [/objective|ціл[ії]/i, /assessment|оцінюв/i, /schedule|розклад/i],
      objectives: [/objective|ціл[ії]/i],
      assessment: [/assessment|оцінюв/i],
      cases: [/case|кейс|приклад/i],
      methods: [/method|метод|активн|interactive|інтерактив/i],
      content: [/course|module|модул/i]
    };
    const used = new Set();
    function buildComment(rec, idx){
      const base = `${rec.title || 'Рекомендація'}: ${(rec.description||'').replace(/\s+/g,' ').slice(0,220)}`;
      const instr = rec.instructorComment ? ` Коментар викладача: ${rec.instructorComment.replace(/\s+/g,' ').slice(0,160)}` : '';
      return `<${idx+1}. ${base}${instr}>`;
    }
    const annotated = lines.map(line => {
      let appended = line;
      accepted.forEach((rec, i) => {
        if (used.has(i)) return;
        const pats = keywordMap[rec.category] || [];
        if (pats.some(r => r.test(line))) {
          appended = line + ' ' + buildComment(rec, i);
          used.add(i);
        }
      });
      return appended;
    });
    // Append any remaining accepted recs at end in a dedicated section
    const remaining = accepted.filter((_, i) => !used.has(i));
    if (remaining.length) {
      annotated.push('', '=== ДОДАНІ КОМЕНТАРІ БЕЗ ПРИВ\'ЯЗКИ ДО РЯДКА ===');
      remaining.forEach((rec, i) => {
        const globalIndex = accepted.indexOf(rec);
        annotated.push(buildComment(rec, globalIndex));
      });
    }
    if (!accepted.length) {
      annotated.push('', '<Немає прийнятих рекомендацій — змін не внесено>');
    }
    const merged = annotated.join('\n');
    const outDir = require('path').join(__dirname, '../uploads/syllabi');
    await fs.mkdir(outDir, { recursive: true });
    const base = (syllabus.originalFile?.originalName || syllabus.title || 'syllabus').replace(/\.[^.]+$/, '');
    const filename = `${base}-modified-${Date.now()}.txt`;
    const fullPath = require('path').join(outDir, filename);
    await fs.writeFile(fullPath, merged, 'utf8');
    syllabus.modifiedFile = {
      filename,
      originalName: filename,
      path: fullPath,
      size: Buffer.byteLength(merged, 'utf8'),
      generatedAt: new Date(),
      mimetype: 'text/plain'
    };
    await syllabus.save();
    return res.download(fullPath, filename);
  } catch (error) {
    console.error('Download modified syllabus error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Direct download of edited plain text (uses editedText if exists, else fallback to generate on the fly without persisting)
router.get('/:id/download-edited-txt', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });
    if (!syllabus.editedText) {
      return res.status(400).json({ message: 'Edited text not generated yet' });
    }
    const base = (syllabus.originalFile?.originalName || syllabus.title || 'syllabus').replace(/\.[^.]+$/, '');
    const filename = `${base}-edited.txt`;
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
    return res.send(syllabus.editedText);
  } catch (e) {
    console.error('Download edited txt error:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Generate editedText (inline comments) after accept/reject phase
router.post('/:id/generate-edited-text', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const accepted = (syllabus.recommendations||[]).filter(r=> r.status==='accepted');
    const original = (syllabus.extractedText||'').trim();
    const lines = original.split(/\n+/);
    const keywordMap = {
      structure: [/objective|ціл[ії]/i, /assessment|оцінюв/i, /schedule|розклад/i],
      objectives: [/objective|ціл[ії]/i],
      assessment: [/assessment|оцінюв/i],
      cases: [/case|кейс|приклад/i],
      methods: [/method|метод|активн|interactive|інтерактив/i],
      content: [/course|module|модул/i]
    };
    const used = new Set();
    const buildComment = (rec, idx) => {
      const changeText = (rec.description||'').replace(/\s+/g,' ').slice(0,240);
      const recCore = `${rec.title || 'Рекомендація'} — ${changeText}`;
      return `<${idx+1}. ${recCore}>`;
    };
    const annotated = lines.map(line => {
      let out = line;
      accepted.forEach((rec,i) => {
        if (used.has(i)) return;
        const pats = keywordMap[rec.category]||[];
        if (pats.some(r=> r.test(line))) { out = line + ' ' + buildComment(rec,i); used.add(i); }
      });
      return out;
    });
    const remaining = accepted.filter((_,i)=> !used.has(i));
    if (remaining.length) {
      annotated.push('', '=== КОМЕНТАРІ БЕЗ ПРИВ\'ЯЗКИ ===');
      remaining.forEach(r => annotated.push(buildComment(r, accepted.indexOf(r))));
    }
    if (!accepted.length) annotated.push('', '<Немає прийнятих рекомендацій – змін не внесено>');
    syllabus.editedText = annotated.join('\n');
    await syllabus.save();
    return res.json({ message: 'Edited text generated', editedText: syllabus.editedText });
  } catch (e) {
    console.error('Generate edited text error:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Finalize the practical challenge: mark completed and persist concise suggestions
router.post('/:id/challenge/finalize', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const discussion = Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : [];
    // Build compact summary payload (max 3 bullets) using existing data on server without extra OpenAI call
    const lastAi = discussion.filter(d => d.aiResponse).slice(-3);
    const aiSuggestions = lastAi.map(d => ({ suggestion: String(d.aiResponse || '').slice(0, 300), category: 'interactive-method' }));

    syllabus.practicalChallenge = {
      ...syllabus.practicalChallenge,
      aiSuggestions: [...(syllabus.practicalChallenge?.aiSuggestions || []), ...aiSuggestions].slice(0, 6),
      status: 'completed'
    };
    await syllabus.save();
    return res.json({ message: 'Challenge finalized', status: syllabus.practicalChallenge.status, aiSuggestions: syllabus.practicalChallenge.aiSuggestions });
  } catch (error) {
    console.error('Finalize challenge error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Admin: cleanup orphaned files under uploads/syllabi not referenced in DB
router.post('/maintenance/cleanup-uploads', auth, admin, async (req, res) => {
  try {
    const dir = path.join(__dirname, '../uploads/syllabi');
    let entries = [];
    try { entries = await fs.readdir(dir); } catch { entries = []; }

    // Collect all file paths referenced in DB
    const docs = await Syllabus.find().select('originalFile.path editedPdf.path modifiedFile.path');
    const referenced = new Set();
    for (const d of docs) {
      if (d.originalFile?.path) referenced.add(path.basename(d.originalFile.path));
      if (d.editedPdf?.path) referenced.add(path.basename(d.editedPdf.path));
      if (d.modifiedFile?.path) referenced.add(path.basename(d.modifiedFile.path));
    }

    let deleted = 0;
    for (const name of entries) {
      if (!referenced.has(name)) {
        try { await fs.unlink(path.join(dir, name)); deleted++; } catch { /* ignore */ }
      }
    }
    return res.json({ message: 'Cleanup completed', deleted });
  } catch (e) {
    console.error('Cleanup uploads error:', e);
    return res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

module.exports = router;
