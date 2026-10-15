const express = require('express');
const multer = require('multer');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');

const mongoose = require('mongoose');
const Syllabus = require('../models/Syllabus');
const Suggestion = require('../models/Suggestion');
const { auth, requireRole } = require('../middleware/auth');
const analysisRunner = require('../services/analysisRunner');
const { deleteSyllabiCascade, deleteConversationsFor } = require('../services/syllabusCleanup');
const { removeOutputDir } = require('../services/outputs');

const CLEANUP_GRACE_MS = 10 * 60 * 1000;

const router = express.Router();

// Некоректний ObjectId → 400 замість 500
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Некоректний id силабусу' });
  }
  next();
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

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

function isOwner(user, syllabus) {
  const ownerId = getOwnerId(syllabus);
  return !!ownerId && ownerId === user.userId;
}

function isOwnerOrAdmin(user, syllabus) {
  return isOwner(user, syllabus) || user.role === 'admin';
}

// Формат визначаємо за розширенням І сигнатурою файлу, а не за mimetype клієнта.
const FORMAT_MIMETYPES = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

async function detectFormat(filePath, ext) {
  const handle = await fs.open(filePath, 'r');
  let head;
  try {
    const buf = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buf, 0, 8, 0);
    head = buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const isPdf = head.subarray(0, 4).toString('latin1') === '%PDF';
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // 'PK'
  const isOle = head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  if (ext === '.pdf' && isPdf) return 'pdf';
  if (ext === '.doc' && isOle) return 'doc';
  // OOXML — це zip: DOCX і PPTX розрізняємо за головною частиною пакета
  const ooxmlPart = { '.docx': 'word/document.xml', '.pptx': 'ppt/presentation.xml' }[ext];
  if (ooxmlPart && isZip) {
    try {
      const zip = await JSZip.loadAsync(await fs.readFile(filePath));
      return zip.file(ooxmlPart) ? ext.slice(1) : null;
    } catch {
      return null;
    }
  }
  return null;
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
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.doc', '.pptx'].includes(fileExt)) {
      return cb(null, true);
    }
    cb(httpError(400, 'Непідтримуваний тип файлу. Дозволені DOCX, DOC, PDF і PPTX.'));
  }
});

async function unlinkQuiet(filePath) {
  if (filePath) await fs.unlink(filePath).catch(() => {});
}

// Upload and analyze syllabus
router.post('/upload', auth, upload.single('syllabus'), [
  body('courseName').trim().notEmpty().withMessage('Назва силабусу обов\'язкова'),
  body('courseCode').optional().trim(),
  body('credits').optional().isInt({ min: 1, max: 10 }).withMessage('Кредити мають бути від 1 до 10'),
  body('semester').optional().trim(),
  body('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Рік має бути від 2020 до 2030'),
  body('programId').trim().notEmpty().withMessage('Програма обов\'язкова')
    .bail()
    .isMongoId().withMessage('Некоректний id програми')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) await unlinkQuiet(req.file.path);
      return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Файл силабусу обов\'язковий' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const format = await detectFormat(req.file.path, ext);
    if (!format) {
      await unlinkQuiet(req.file.path);
      return res.status(400).json({ message: 'Вміст файлу не відповідає його розширенню. Завантажте справжній DOCX, DOC, PDF або PPTX.' });
    }

    const { courseName, courseCode, credits, semester, year, programId } = req.body;

    // Розбір документа (конвертація .doc/.pdf) іде у фоні як етап `extract`

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
        mimetype: FORMAT_MIMETYPES[format],
        size: req.file.size,
        path: req.file.path
      },
      sourceFormat: format,
      status: 'analyzing',
      analysisStage: 'extract',
      analysisStartedAt: new Date()
    });

    await syllabus.save();
    analysisRunner.runAnalysisInBackground(syllabus._id);

    res.status(201).json({
      message: 'Силабус завантажено. Триває аналіз.',
      syllabusId: syllabus._id,
      status: syllabus.status
    });
  } catch (error) {
    if (req.file) await unlinkQuiet(req.file.path);
    console.error('Syllabus upload error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Внутрішня помилка сервера під час завантаження файлу' });
  }
});

// Без серверних шляхів до файлів і кешу outputs
function publicSyllabus(syllabus) {
  const obj = syllabus.toObject();
  if (obj.originalFile) delete obj.originalFile.path;
  delete obj.workingFile;
  delete obj.outputs;
  delete obj.submittedPdfPath;
  delete obj.submitting;
  return obj;
}

// Get specific syllabus details
router.get('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .populate('instructor', 'firstName lastName email')
      .populate('programId', 'name code academicDirectorEmail');

    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено. Ви можете переглядати лише власні силабуси.' });
    }
    res.json(publicSyllabus(syllabus));
  } catch (error) {
    console.error('Get syllabus error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Get syllabus analysis status
router.get('/:id/status', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .select('status analysisStage analysisError instructor')
      .populate('instructor', '_id');

    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено' });
    }
    res.json({ status: syllabus.status, stage: syllabus.analysisStage || null, error: syllabus.analysisError || null });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Delete syllabus (власник або адмін): каскадно прибирає файли, розмову й повідомлення
router.delete('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id).select('instructor');
    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено. Ви можете видаляти лише власні силабуси.' });
    }

    await deleteSyllabiCascade({ _id: syllabus._id });
    res.json({ message: 'Силабус видалено' });
  } catch (error) {
    console.error('Delete syllabus error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Update syllabus metadata (лише власник)
router.put('/:id', auth, [
  body('title').optional().trim().notEmpty().withMessage('Назва не може бути порожньою'),
  body('courseCode').optional().trim(),
  body('courseName').optional().trim(),
  body('credits').optional().isInt({ min: 1, max: 10 }).withMessage('Кредити мають бути від 1 до 10'),
  body('semester').optional().trim(),
  body('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Рік має бути від 2020 до 2030'),
  body('programId').optional().isMongoId().withMessage('Некоректний id програми')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
    }
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwner(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено. Ви можете редагувати лише власні силабуси.' });
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
    res.json({ message: 'Силабус оновлено', syllabus });
  } catch (error) {
    console.error('Update syllabus error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Trigger AI analysis (re-analyze) — лише власник; скидає розмову й похідний стан
router.post('/:id/analyze', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id).select('instructor status');
    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwner(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено' });
    }

    // Атомарне захоплення: два паралельні запити не запустять аналіз двічі
    const claimed = await Syllabus.findOneAndUpdate(
      { _id: syllabus._id, status: { $nin: ['analyzing', 'submitted'] } },
      {
        $set: { status: 'analyzing', analysisStage: null, analysisStartedAt: new Date(), analysisAttempts: 0 },
        $unset: { outputs: '', rubricSummary: '', analysisError: '', analysisLeaseUntil: '', analysisLeaseToken: '' },
      },
      { new: false }
    );
    if (!claimed) {
      const reason = syllabus.status === 'submitted'
        ? 'Силабус уже відправлено, повторний аналіз неможливий'
        : 'Аналіз уже виконується';
      return res.status(409).json({ message: reason, status: syllabus.status });
    }

    await removeOutputDir(syllabus._id);
    await Suggestion.deleteMany({ syllabusId: syllabus._id });
    await deleteConversationsFor([syllabus._id]);
    analysisRunner.runAnalysisInBackground(syllabus._id);

    res.json({ message: 'Аналіз розпочато', status: 'analyzing' });
  } catch (error) {
    console.error('Start analysis error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Download original syllabus file
router.get('/:id/download', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено' });
    }

    const filePath = syllabus.originalFile.path;
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ message: 'Файл на сервері не знайдено' });
    }
    res.download(filePath, syllabus.originalFile.originalName);
  } catch (error) {
    console.error('Download syllabus error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Admin: cleanup orphaned files under uploads/syllabi (файли молодші за 10 хв не чіпаємо)
router.post('/maintenance/cleanup-uploads', auth, requireRole('admin'), async (req, res) => {
  try {
    const dir = path.join(__dirname, '../uploads/syllabi');
    let entries = [];
    try { entries = await fs.readdir(dir); } catch { entries = []; }

    const docs = await Syllabus.find().select(Syllabus.FILE_FIELDS).lean();
    const referenced = new Set(docs.flatMap((d) => Syllabus.filePaths(d)).map((p) => path.basename(p)));

    let deleted = 0;
    for (const name of entries) {
      if (referenced.has(name)) continue;
      const full = path.join(dir, name);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile() || Date.now() - stat.mtimeMs < CLEANUP_GRACE_MS) continue;
        await fs.unlink(full);
        deleted++;
      } catch { /* ignore */ }
    }
    return res.json({ message: 'Очищення завершено', deleted });
  } catch (e) {
    console.error('Cleanup uploads error:', e);
    return res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

module.exports = router;
