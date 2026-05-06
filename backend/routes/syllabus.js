const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParseLib = require('pdf-parse');
const legacyPdfParse = typeof pdfParseLib === 'function'
  ? pdfParseLib
  : typeof pdfParseLib?.default === 'function'
    ? pdfParseLib.default
    : null;
const PdfParseClass = pdfParseLib?.PDFParse || pdfParseLib?.default?.PDFParse;
const mammoth = require('mammoth');
const { body, validationResult } = require('express-validator');

const Syllabus = require('../models/Syllabus');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');
const { admin } = require('../middleware/roles');

const router = express.Router();

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

function isOwnerOrAdmin(user, syllabus) {
  const ownerId = getOwnerId(syllabus);
  const isOwner = !!ownerId && ownerId === user.userId;
  return isOwner || user.role === 'admin';
}

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
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
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

// Strip any revision markup tokens that may be embedded in the source document
// (e.g. from a previously-reviewed export). DEL spans are removed entirely;
// ADD spans are unwrapped so only their content remains.
function sanitizeExtractedText(text) {
  return text
    .replace(/\[\[KSE_DEL\]\][\s\S]*?\[\[\/KSE_DEL\]\]/g, '')
    .replace(/\[\[KSE_ADD\]\]([\s\S]*?)\[\[\/KSE_ADD\]\]/g, '$1')
    .replace(/\[\[\/?KSE_(?:DEL|ADD)\]\]/g, '');
}

async function extractTextFromFile(filePath, mimetype) {
  try {
    let text;
    if (mimetype === 'application/pdf') {
      const dataBuffer = await fs.readFile(filePath);
      if (typeof legacyPdfParse === 'function') {
        const data = await legacyPdfParse(dataBuffer);
        text = data.text;
      } else if (typeof PdfParseClass === 'function') {
        const parser = new PdfParseClass({ data: dataBuffer });
        try {
          const result = await parser.getText();
          text = result?.text || '';
        } finally {
          if (typeof parser.destroy === 'function') {
            await parser.destroy().catch(() => {});
          }
        }
      } else {
        throw new Error('PDF parser is unavailable');
      }
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimetype === 'application/msword') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else {
      throw new Error('Unsupported file type');
    }
    return sanitizeExtractedText(text);
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error('Failed to extract text from file');
  }
}

// Upload and analyze syllabus
router.post('/upload', auth, upload.single('syllabus'), [
  body('courseName').trim().notEmpty().withMessage('Syllabus title is required'),
  body('courseCode').optional().trim(),
  body('credits').optional().isInt({ min: 1, max: 10 }).withMessage('Credits must be between 1 and 10'),
  body('semester').optional().trim(),
  body('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  body('programId').trim().notEmpty().withMessage('Program is required')
    .bail()
    .isMongoId().withMessage('programId must be a valid id')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(console.error);
      }
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Syllabus file is required' });
    }

    const { courseName, courseCode, credits, semester, year, programId } = req.body;

    const extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);
    if (!extractedText || extractedText.trim().length === 0) {
      await fs.unlink(req.file.path).catch(console.error);
      return res.status(400).json({ message: 'Could not extract text from the uploaded file' });
    }

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
      programId,
      originalFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      },
      extractedText,
      status: 'analyzing'
    });

    await syllabus.save();

    setImmediate(async () => {
      try {
        await aiService.analyzeSyllabus(syllabus._id);
      } catch (error) {
        console.error('AI analysis error for syllabus', syllabus._id, ':', error);
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
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    console.error('Syllabus upload error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
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
    if (req.query.status) {
      query.status = req.query.status;
    }

    const syllabi = await Syllabus.find(query)
      .select('-extractedText -vectorEmbedding')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('instructor', 'firstName lastName email')
      .populate('programId', 'name code');

    const total = await Syllabus.countDocuments(query);

    res.json({
      syllabi,
      pagination: { current: page, pages: Math.ceil(total / limit), total, limit }
    });
  } catch (error) {
    console.error('Get syllabi error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific syllabus details
router.get('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .populate('instructor', 'firstName lastName email')
      .populate('programId', 'name code academicDirectorEmail');

    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied. You can only view your own syllabi.' });
    }
    res.json(syllabus.toObject());
  } catch (error) {
    console.error('Get syllabus error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get syllabus analysis status
router.get('/:id/status', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .select('status analysis.error instructor')
      .populate('instructor', '_id');

    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ status: syllabus.status, error: syllabus.analysis?.error });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete syllabus
router.delete('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own syllabi.' });
    }

    try { await syllabus.cleanupFiles(); } catch (e) { /* best-effort */ }
    await Syllabus.findByIdAndDelete(req.params.id);
    res.json({ message: 'Syllabus deleted successfully' });
  } catch (error) {
    console.error('Delete syllabus error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update syllabus metadata
router.put('/:id', auth, [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('courseCode').optional().trim(),
  body('courseName').optional().trim(),
  body('credits').optional().isInt({ min: 1, max: 10 }).withMessage('Credits must be between 1 and 10'),
  body('semester').optional().trim(),
  body('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  body('programId').optional().isMongoId().withMessage('programId must be a valid id')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied. You can only edit your own syllabi.' });
    }

    const { title, courseCode, courseName, credits, semester, year, programId } = req.body;
    if (title) syllabus.title = title;
    if (courseCode !== undefined) syllabus.course.code = courseCode;
    if (courseName !== undefined) syllabus.course.name = courseName;
    if (credits !== undefined) syllabus.course.credits = parseInt(credits);
    if (semester !== undefined) syllabus.course.semester = semester;
    if (year !== undefined) syllabus.course.year = parseInt(year);
    if (programId !== undefined) syllabus.programId = programId || undefined;

    await syllabus.save();
    res.json({ message: 'Syllabus updated successfully', syllabus });
  } catch (error) {
    console.error('Update syllabus error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Trigger AI analysis (re-analyze)
router.post('/:id/analyze', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    syllabus.status = 'analyzing';
    await syllabus.save();

    setImmediate(async () => {
      try {
        await aiService.analyzeSyllabus(syllabus._id);
      } catch (error) {
        console.error('AI analysis error for syllabus', syllabus._id, ':', error);
        await Syllabus.findByIdAndUpdate(syllabus._id, {
          status: 'error',
          'analysis.error': error.message
        });
      }
    });

    res.json({ message: 'Analysis started successfully', status: 'analyzing' });
  } catch (error) {
    console.error('Start analysis error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Download original syllabus file
router.get('/:id/download', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filePath = syllabus.originalFile.path;
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ message: 'File not found on server' });
    }
    res.download(filePath, syllabus.originalFile.originalName);
  } catch (error) {
    console.error('Download syllabus error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Admin: cleanup orphaned files under uploads/syllabi
router.post('/maintenance/cleanup-uploads', auth, admin, async (req, res) => {
  try {
    const dir = path.join(__dirname, '../uploads/syllabi');
    let entries = [];
    try { entries = await fs.readdir(dir); } catch { entries = []; }

    const docs = await Syllabus.find().select('originalFile.path editedPdf.path modifiedFile.path previewPdf.path submittedPdfPath');
    const referenced = new Set();
    for (const d of docs) {
      if (d.originalFile?.path) referenced.add(path.basename(d.originalFile.path));
      if (d.editedPdf?.path) referenced.add(path.basename(d.editedPdf.path));
      if (d.modifiedFile?.path) referenced.add(path.basename(d.modifiedFile.path));
      if (d.previewPdf?.path) referenced.add(path.basename(d.previewPdf.path));
      if (d.submittedPdfPath) referenced.add(path.basename(d.submittedPdfPath));
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
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
