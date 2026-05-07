const express = require('express');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Syllabus = require('../models/Syllabus');
const workspaceService = require('../services/workspaceService');

const router = express.Router();

// Tighter limit on free-chat to cap LLM cost from a runaway client. Keyed per-user.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.CHAT_MESSAGE_RATE_LIMIT || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (!token) return req.ip;
      const decoded = jwt.decode(token);
      return decoded?.userId || req.ip;
    } catch {
      return req.ip;
    }
  },
});

async function loadSyllabusOrFail(syllabusId, res) {
  const syllabus = await Syllabus.findById(syllabusId).select('instructor status');
  if (!syllabus) {
    res.status(404).json({ message: 'Syllabus not found' });
    return null;
  }
  return syllabus;
}

function isOwner(syllabus, user) {
  return syllabus.instructor && syllabus.instructor.toString() === user.userId;
}

// Read access: owner OR admin. Mutation access: owner only (admins are read-only on chat).
async function gateRead(req, res, next) {
  const syllabus = await loadSyllabusOrFail(req.params.syllabusId, res);
  if (!syllabus) return;
  if (!isOwner(syllabus, req.user) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  req.syllabus = syllabus;
  next();
}

async function gateMutate(req, res, next) {
  const syllabus = await loadSyllabusOrFail(req.params.syllabusId, res);
  if (!syllabus) return;
  if (!isOwner(syllabus, req.user)) {
    return res.status(403).json({ message: 'Only the instructor can change this conversation' });
  }
  req.syllabus = syllabus;
  next();
}

// GET /api/chat/:syllabusId — full conversation + messages + current issue
router.get('/:syllabusId', auth, gateRead, async (req, res) => {
  try {
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view || { conversation: null, messages: [] });
  } catch (err) {
    console.error('chat get error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Internal server error' });
  }
});

// POST /api/chat/:syllabusId/start — bootstrap (idempotent) + ensure first issue is queued
router.post('/:syllabusId/start', auth, gateMutate, async (req, res) => {
  try {
    if (req.syllabus.status === 'analyzing') {
      return res.status(409).json({ message: 'Analysis still in progress', status: req.syllabus.status });
    }
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.nextIssueMessage(conversation);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat start error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Internal server error',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/confirm — accept the current issue's suggested change
router.post('/:syllabusId/confirm', auth, gateMutate, [
  body('issueId').notEmpty().withMessage('issueId is required'),
  body('selection').optional().isObject().withMessage('selection must be an object'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.confirmIssue(conversation, req.body.issueId, req.body.selection || null);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat confirm error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Internal server error',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/cancel — reject the current issue
router.post('/:syllabusId/cancel', auth, gateMutate, [
  body('issueId').notEmpty().withMessage('issueId is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.cancelIssue(conversation, req.body.issueId);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat cancel error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Internal server error',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/message — free-text question to the AI
router.post('/:syllabusId/message', auth, messageLimiter, gateMutate, [
  body('text').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('text must be 1-4000 chars'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const conversation = await workspaceService.getOrCreateConversation(req.params.syllabusId, req.user.userId);
    await workspaceService.freeChatMessage(conversation, req.body.text);
    const view = await workspaceService.getConversationView(req.params.syllabusId);
    res.json(view);
  } catch (err) {
    console.error('chat message error:', err);
    res.status(err.statusCode || 500).json({
      message: err.message || 'Internal server error',
      retryable: !!err.retryable,
    });
  }
});

// POST /api/chat/:syllabusId/issues/:issueId/preview — stream a per-issue preview PDF
router.post('/:syllabusId/issues/:issueId/preview', auth, gateMutate, [
  body('selection').optional().isObject().withMessage('selection must be an object'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const pdfPath = await workspaceService.previewIssueChange(
      req.params.syllabusId,
      req.params.issueId,
      req.body?.selection || null,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="issue-preview.pdf"');
    const stream = fs.createReadStream(pdfPath);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ message: 'Error streaming PDF' });
      console.error('Issue preview stream error:', err);
    });
    stream.on('close', () => {
      // Cleanup the one-off preview PDF after streaming.
      fs.promises.unlink(pdfPath).catch(() => {});
    });
    stream.pipe(res);
  } catch (err) {
    console.error('chat issue preview error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Issue preview failed' });
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
      if (!res.headersSent) res.status(500).json({ message: 'Error streaming PDF' });
      console.error('PDF stream error:', err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error('chat preview error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Preview generation failed' });
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
    res.status(err.statusCode || 500).json({ message: err.message || 'Submission failed' });
  }
});

module.exports = router;
