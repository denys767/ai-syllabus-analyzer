const express = require('express');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Syllabus = require('../models/Syllabus');
const workspaceService = require('../services/workspaceService');

const router = express.Router();

// Жорсткіший ліміт на вільний чат, щоб обмежити витрати на LLM. Ключ — користувач.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.CHAT_MESSAGE_RATE_LIMIT || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  // Викликається після auth, тож ключ — перевірений userId
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : req.ip),
  validate: { keyGeneratorIpFallback: false },
});

router.param('syllabusId', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Некоректний id силабусу' });
  }
  next();
});

async function loadSyllabusOrFail(syllabusId, res) {
  const syllabus = await Syllabus.findById(syllabusId).select('instructor status');
  if (!syllabus) {
    res.status(404).json({ message: 'Силабус не знайдено' });
    return null;
  }
  return syllabus;
}

function isOwner(syllabus, user) {
  return syllabus.instructor && syllabus.instructor.toString() === user.userId;
}

// Read access: owner OR admin. Mutation access: owner only (admins are read-only on chat).
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
    req.syllabus = syllabus;
    next();
  } catch (err) {
    next(err);
  }
}

// GET /api/chat/:syllabusId — full conversation + messages + current issue
router.get('/:syllabusId', auth, gateRead, async (req, res) => {
  try {
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view || { conversation: null, messages: [] });
  } catch (err) {
    console.error('chat get error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Внутрішня помилка сервера' });
  }
});

// POST /api/chat/:syllabusId/start — bootstrap (idempotent) + ensure first issue is queued
router.post('/:syllabusId/start', auth, gateMutate, async (req, res) => {
  try {
    if (req.syllabus.status === 'analyzing') {
      return res.status(409).json({ message: 'Аналіз ще триває', status: req.syllabus.status });
    }
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.nextIssueMessage(conversation);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat start error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Внутрішня помилка сервера',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/confirm — accept the current issue's suggested change
router.post('/:syllabusId/confirm', auth, gateMutate, [
  body('issueId').notEmpty().withMessage('Потрібен issueId'),
  body('selection').optional().isObject().withMessage('selection має бути об\'єктом'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.confirmIssue(conversation, req.body.issueId, req.body.selection || null);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat confirm error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Внутрішня помилка сервера',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/cancel — reject the current issue
router.post('/:syllabusId/cancel', auth, gateMutate, [
  body('issueId').notEmpty().withMessage('Потрібен issueId'),
  body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }).withMessage('Причина має бути рядком до 2000 символів'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.cancelIssue(conversation, req.body.issueId, req.body.reason || null);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat cancel error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Внутрішня помилка сервера',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/issues/:issueId/reopen — rewind to a resolved issue card
router.post('/:syllabusId/issues/:issueId/reopen', auth, gateMutate, [
  body('anchorMessageId').optional({ nullable: true }).isMongoId().withMessage('Некоректний anchorMessageId'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.reopenIssue(conversation, req.params.issueId, req.body.anchorMessageId || null);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat reopen error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Не вдалося повторно відкрити рекомендацію',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/message — free-text question to the AI
router.post('/:syllabusId/message', auth, messageLimiter, gateMutate, [
  body('text').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('Текст має містити від 1 до 4000 символів'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.freeChatMessage(conversation, req.body.text);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat message error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Внутрішня помилка сервера',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/issues/:issueId/preview — stream a per-issue preview PDF
router.post('/:syllabusId/issues/:issueId/preview', auth, gateMutate, [
  body('selection').optional().isObject().withMessage('selection має бути об\'єктом'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Помилка валідації', errors: errors.array() });
  try {
    const preview = await workspaceService.previewIssueChangeText(
      req.params.syllabusId,
      req.params.issueId,
      req.body?.selection || null,
    );
    res.json(preview);
  } catch (err) {
    console.error('chat issue preview error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Не вдалося побудувати попередній перегляд' });
  }
});

// POST /api/chat/:syllabusId/preview — stream the generated PDF
router.post('/:syllabusId/preview', auth, gateMutate, async (req, res) => {
  try {
    const pdfPath = await workspaceService.previewFinalPdf(req.params.syllabusId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    const stream = fs.createReadStream(pdfPath);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ message: 'Помилка передачі PDF' });
      console.error('PDF stream error:', err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error('chat preview error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Не вдалося згенерувати попередній перегляд' });
  }
});

// POST /api/chat/:syllabusId/submit — finalize and email the Academic Director
router.post('/:syllabusId/submit', auth, gateMutate, async (req, res) => {
  try {
    await workspaceService.submitSyllabus(req.params.syllabusId);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json({ ...view, submitted: true });
  } catch (err) {
    console.error('chat submit error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Не вдалося відправити силабус' });
  }
});

module.exports = router;
