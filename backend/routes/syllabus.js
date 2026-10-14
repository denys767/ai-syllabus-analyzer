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

const mongoose = require('mongoose');
const Syllabus = require('../models/Syllabus');
const { auth, requireRole } = require('../middleware/auth');
const { runAnalysisInBackground } = require('../services/analysisRunner');
const { deleteSyllabiCascade, deleteConversationsFor } = require('../services/syllabusCleanup');

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
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  if (ext === '.docx' && isZip) return 'docx';
  if (ext === '.doc' && isOle) return 'doc';
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
    if (fileExt === '.doc') {
      // TODO: окрема фаза додасть конвертацію через LibreOffice
      return cb(httpError(415, 'Формат .doc наразі не підтримується. Збережіть файл як .docx або PDF і завантажте знову.'));
    }
    if (['.pdf', '.docx'].includes(fileExt)) {
      return cb(null, true);
    }
    cb(httpError(400, 'Непідтримуваний тип файлу. Дозволені лише PDF та DOCX.'));
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

async function extractTextFromFile(filePath, format) {
  try {
    let text;
    if (format === 'pdf') {
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
    } else if (format === 'docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else {
      throw new Error('Unsupported file type');
    }
    return sanitizeExtractedText(text);
  } catch (error) {
    console.error('Text extraction error:', error);
    throw httpError(400, 'Не вдалося зчитати текст із файлу. Перевірте, що файл не пошкоджений.');
  }
}

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
    if (format === 'doc') {
      await unlinkQuiet(req.file.path);
      return res.status(415).json({ message: 'Формат .doc наразі не підтримується. Збережіть файл як .docx або PDF і завантажте знову.' });
    }
    if (!format) {
      await unlinkQuiet(req.file.path);
      return res.status(400).json({ message: 'Вміст файлу не відповідає його розширенню. Завантажте справжній PDF або DOCX.' });
    }

    const { courseName, courseCode, credits, semester, year, programId } = req.body;

    const extractedText = await extractTextFromFile(req.file.path, format);
    if (!extractedText || extractedText.trim().length === 0) {
      await unlinkQuiet(req.file.path);
      return res.status(400).json({ message: 'Не вдалося отримати текст із завантаженого файлу' });
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
        mimetype: FORMAT_MIMETYPES[format],
        size: req.file.size,
        path: req.file.path
      },
      extractedText,
      status: 'analyzing',
      analysisStartedAt: new Date()
    });

    await syllabus.save();
    runAnalysisInBackground(syllabus._id);

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
    res.json(syllabus.toObject());
  } catch (error) {
    console.error('Get syllabus error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});

// Get syllabus analysis status
router.get('/:id/status', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .select('status analysisError instructor')
      .populate('instructor', '_id');

    if (!syllabus) {
      return res.status(404).json({ message: 'Силабус не знайдено' });
    }
    if (!isOwnerOrAdmin(req.user, syllabus)) {
      return res.status(403).json({ message: 'Доступ заборонено' });
    }
    res.json({ status: syllabus.status, error: syllabus.analysisError });
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
    const syllabus = await Syllabus.findById(req.params.id).select('instructor status previewPdf');
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
        $set: { status: 'analyzing', analysisStartedAt: new Date(), recommendations: [] },
        $unset: { editedText: '', revisionMarkup: '', previewPdf: '', analysisError: '' },
      },
      { new: false }
    );
    if (!claimed) {
      const reason = syllabus.status === 'submitted'
        ? 'Силабус уже відправлено, повторний аналіз неможливий'
        : 'Аналіз уже виконується';
      return res.status(409).json({ message: reason, status: syllabus.status });
    }

    await unlinkQuiet(claimed.previewPdf?.path);
    await deleteConversationsFor([syllabus._id]);
    runAnalysisInBackground(syllabus._id);

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

    const docs = await Syllabus.find().select('originalFile.path previewPdf.path submittedPdfPath');
    const referenced = new Set();
    for (const d of docs) {
      if (d.originalFile?.path) referenced.add(path.basename(d.originalFile.path));
      if (d.previewPdf?.path) referenced.add(path.basename(d.previewPdf.path));
      if (d.submittedPdfPath) referenced.add(path.basename(d.submittedPdfPath));
    }

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
