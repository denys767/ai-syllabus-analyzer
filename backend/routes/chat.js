const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { body, query, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Syllabus = require('../models/Syllabus');
const Suggestion = require('../models/Suggestion');
const workspaceService = require('../services/workspaceService');
const { isLegacy, legacyError } = require('../services/chat/state');
const { sendError } = require('../utils/httpError');

const router = express.Router();

// Жорсткіший ліміт на LLM-дії чату (вільні повідомлення, Refine, Answer). Ключ — користувач.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.CHAT_MESSAGE_RATE_LIMIT || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  // Викликається після auth, тож ключ — перевірений userId
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : req.ip),
  message: { message: 'Забагато запитів до AI. Зачекайте хвилину.' },
});

router.param('syllabusId', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Некоректний id силабусу' });
  }
  next();
});

router.param('sid', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Некоректний id пропозиції' });
  }
  next();
});

function isOwner(syllabus, user) {
  return syllabus.instructor && syllabus.instructor.toString() === user.userId;
}

async function loadSyllabusOrFail(syllabusId, res) {
  const syllabus = await Syllabus.findById(syllabusId).select('instructor status legacy document.docVersion');
  if (!syllabus) {
    res.status(404).json({ message: 'Силабус не знайдено' });
    return null;
  }
  return syllabus;
}

// Читання: власник або admin. Мутації: лише власник (admin — read-only у чаті), не для legacy.
async function gateRead(req, res, next) {
  try {
    const syllabus = await loadSyllabusOrFail(req.params.syllabusId, res);
    if (!syllabus) return;
    if (!isOwner(syllabus, req.user) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Доступ заборонено' });
    }
    req.syllabus = syllabus;
    next();
  } catch (err) {
    next(err);
  }
}

async function gateMutate(req, res, next) {
  try {
    const syllabus = await loadSyllabusOrFail(req.params.syllabusId, res);
    if (!syllabus) return;
    if (!isOwner(syllabus, req.user)) {
      return res.status(403).json({ message: 'Змінювати розмову може лише викладач' });
    }
    if (isLegacy(syllabus)) return sendError(res, legacyError());
    req.syllabus = syllabus;
    next();
  } catch (err) {
    next(err);
  }
}

function validationFailed(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  return true;
}

function view(req) {
  return workspaceService.getConversationView(req.params.syllabusId, { userId: req.user.userId });
}

/** Обгортка для мутацій: валідація → дія → GET-view. */
function mutation(action, fallbackMessage) {
  return async (req, res) => {
    if (validationFailed(req, res)) return;
    try {
      await action(req);
      res.json(await view(req));
    } catch (err) {
      sendError(res, err, fallbackMessage);
    }
  };
}


// GET /api/chat/:syllabusId — розмова, повідомлення, пропозиції, readiness
router.get('/:syllabusId', auth, gateRead, async (req, res) => {
  try {
    res.json(await view(req));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/chat/:syllabusId/start — створити розмову (ідемпотентно) і показати першу картку
router.post('/:syllabusId/start', auth, gateMutate,
  mutation((req) => workspaceService.startConversation(req.params.syllabusId, req.user.userId)));

// GET /api/chat/:syllabusId/suggestions/:sid/preview?optionId=
router.get('/:syllabusId/suggestions/:sid/preview', auth, gateRead, [
  query('optionId').optional().isString().isLength({ max: 100 }),
], async (req, res) => {
  if (validationFailed(req, res)) return;
  try {
    res.json(await workspaceService.previewSuggestion(req.params.syllabusId, req.params.sid, req.query.optionId || null));
  } catch (err) {
    sendError(res, err, 'Не вдалося побудувати попередній перегляд');
  }
});

router.post('/:syllabusId/suggestions/:sid/accept', auth, gateMutate, [
  body('optionId').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('Некоректний optionId'),
  body('conflictResolution').optional({ nullable: true }).isIn(['replacePrevious']).withMessage('Некоректне значення conflictResolution'),
], mutation((req) => workspaceService.acceptSuggestion(
  req.params.syllabusId, req.params.sid,
  { optionId: req.body.optionId || null, conflictResolution: req.body.conflictResolution || null },
  req.user.userId,
)));

router.post('/:syllabusId/suggestions/:sid/reject', auth, gateMutate, [
  body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }).withMessage('Причина має бути рядком до 2000 символів'),
  body('rejectTag').optional({ nullable: true }).isIn(Suggestion.REJECT_TAGS).withMessage('Некоректна категорія причини'),
], mutation((req) => workspaceService.rejectSuggestion(
  req.params.syllabusId, req.params.sid,
  { reason: req.body.reason || null, rejectTag: req.body.rejectTag || null },
  req.user.userId,
)));

router.post('/:syllabusId/suggestions/:sid/refine', auth, messageLimiter, gateMutate, [
  body('feedback').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }).withMessage('Коментар має бути до 4000 символів'),
  body('mergeWithAccepted').optional({ nullable: true }).isBoolean().withMessage('mergeWithAccepted має бути boolean').toBoolean(),
], mutation((req) => workspaceService.refineSuggestion(
  req.params.syllabusId, req.params.sid,
  { feedback: req.body.feedback || '', mergeWithAccepted: Boolean(req.body.mergeWithAccepted) },
  req.user.userId,
), 'Не вдалося переробити пропозицію'));

router.post('/:syllabusId/suggestions/:sid/answer', auth, messageLimiter, gateMutate, [
  body('answer').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('Відповідь має містити від 1 до 4000 символів'),
], mutation((req) => workspaceService.answerSuggestion(
  req.params.syllabusId, req.params.sid, { answer: req.body.answer }, req.user.userId,
), 'Не вдалося підготувати правку'));

router.post('/:syllabusId/suggestions/:sid/reopen', auth, gateMutate,
  mutation((req) => workspaceService.reopenSuggestion(req.params.syllabusId, req.params.sid, req.user.userId),
    'Не вдалося повторно відкрити пропозицію'));

// POST /api/chat/:syllabusId/message — вільне питання або прохання змінити поточну картку
router.post('/:syllabusId/message', auth, messageLimiter, gateMutate, [
  body('text').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('Текст має містити від 1 до 4000 символів'),
], mutation((req) => workspaceService.freeChatMessage(req.params.syllabusId, req.body.text, req.user.userId)));

// GET /api/chat/:syllabusId/document/preview — увесь документ з прийнятими змінами
router.get('/:syllabusId/document/preview', auth, gateRead, async (req, res) => {
  try {
    res.json(await workspaceService.documentPreview(req.params.syllabusId));
  } catch (err) {
    sendError(res, err, 'Не вдалося побудувати попередній перегляд документа');
  }
});

// GET /api/chat/:syllabusId/outputs/:name — tracked.docx | clean.docx | tracked.pdf
router.get('/:syllabusId/outputs/:name', auth, gateRead, async (req, res) => {
  try {
    const file = await workspaceService.getOutputFile(req.params.syllabusId, req.params.name);
    res.setHeader('Content-Type', file.contentType);
    res.download(file.path, file.filename, { headers: { 'Content-Type': file.contentType } }, (err) => {
      if (err && !res.headersSent) sendError(res, err, 'Помилка передачі файлу');
    });
  } catch (err) {
    sendError(res, err, 'Не вдалося підготувати файл');
  }
});

// POST /api/chat/:syllabusId/submit — фінал: лист академічному директору
router.post('/:syllabusId/submit', auth, gateMutate, async (req, res) => {
  try {
    await workspaceService.submitSyllabus(req.params.syllabusId);
    res.json({ ...(await view(req)), submitted: true });
  } catch (err) {
    sendError(res, err, 'Не вдалося відправити силабус');
  }
});

module.exports = router;
