const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth, admin } = require('../middleware/auth');
const Program = require('../models/Program');
const User = require('../models/User');
const Syllabus = require('../models/Syllabus');
const Conversation = require('../models/Conversation');
const { getIssueCounts } = require('../services/workspaceService');
const { sendInvitationEmail } = require('../services/emailService');
const crypto = require('crypto');

// ─── Programs ────────────────────────────────────────────────────────────────

router.get('/programs', auth, async (req, res) => {
  try {
    const programs = await Program.find().sort({ name: 1 });
    res.json(programs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/programs', auth, admin, async (req, res) => {
  try {
    const { name, code, academicDirectorEmail } = req.body;
    if (!name || !code) return res.status(400).json({ message: 'name and code are required' });
    const program = await Program.create({ name, code, academicDirectorEmail, createdBy: req.user.userId });
    res.status(201).json(program);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Program code already exists' });
    res.status(500).json({ message: err.message });
  }
});

router.put('/programs/:id', auth, admin, async (req, res) => {
  try {
    const { name, academicDirectorEmail } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (academicDirectorEmail !== undefined) update.academicDirectorEmail = academicDirectorEmail;
    const program = await Program.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!program) return res.status(404).json({ message: 'Program not found' });
    res.json(program);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/programs/:id', auth, admin, async (req, res) => {
  try {
    const program = await Program.findByIdAndDelete(req.params.id);
    if (!program) return res.status(404).json({ message: 'Program not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Metrics ─────────────────────────────────────────────────────────────────

router.get('/metrics', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'manager') {
      const me = await User.findById(req.user.userId).select('managedProgramIds').lean();
      if (!me?.managedProgramIds?.length) return res.json({ total: 0, submitted: 0, inProgress: 0 });
      filter.programId = { $in: me.managedProgramIds };
    } else if (req.user.role === 'instructor') {
      filter.instructor = req.user.userId;
    }
    const [total, submitted, inProgress] = await Promise.all([
      Syllabus.countDocuments(filter),
      Syllabus.countDocuments({ ...filter, status: 'submitted' }),
      Syllabus.countDocuments({ ...filter, status: 'in_progress' }),
    ]);
    res.json({ total, submitted, inProgress });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Syllabi ─────────────────────────────────────────────────────────────────

router.get('/syllabi', auth, async (req, res) => {
  try {
    const { program, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    if (req.user.role === 'manager') {
      const me = await User.findById(req.user.userId).select('managedProgramIds').lean();
      const allowed = me?.managedProgramIds || [];
      if (!allowed.length) return res.json({ syllabi: [], total: 0, page: 1, pages: 0 });
      // Manager can only see syllabi from their assigned programs; optional further filter.
      const requestedProgram = program ? new mongoose.Types.ObjectId(program) : null;
      if (requestedProgram && allowed.some((id) => id.equals(requestedProgram))) {
        filter.programId = requestedProgram;
      } else {
        filter.programId = { $in: allowed };
      }
    } else if (req.user.role === 'instructor') {
      filter.instructor = new mongoose.Types.ObjectId(req.user.userId);
      if (program) filter.programId = new mongoose.Types.ObjectId(program);
    } else if (program) {
      filter.programId = new mongoose.Types.ObjectId(program);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [syllabi, total] = await Promise.all([
      Syllabus.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('instructor', 'firstName lastName email')
        .populate('programId', 'name code'),
      Syllabus.countDocuments(filter),
    ]);

    const syllabusIds = syllabi.map((item) => item._id);
    const conversations = await Conversation.find({ syllabusId: { $in: syllabusIds } })
      .select('syllabusId readiness')
      .lean();
    const conversationBySyllabus = new Map(conversations.map((c) => [String(c.syllabusId), c]));

    const enriched = syllabi.map((syllabus) => {
      const plain = syllabus.toObject();
      const conversation = conversationBySyllabus.get(String(plain._id));
      return {
        ...plain,
        readiness: conversation?.readiness || { score: 0, breakdown: {} },
        issueCounts: getIssueCounts(plain),
      };
    });
    res.json({ syllabi: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/syllabi/:id/resend-submission', auth, admin, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id)
      .populate('programId')
      .populate('instructor', 'firstName lastName email');
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (syllabus.status !== 'submitted') return res.status(400).json({ message: 'Syllabus not submitted yet' });
    const adEmail = syllabus.programId?.academicDirectorEmail;
    if (!adEmail) return res.status(400).json({ message: 'No Academic Director email for this program' });

    const { sendSubmissionToAdEmail } = require('../services/emailService');
    const aiService = require('../services/aiService');

    let pdfBuffer;
    const fs = require('fs');
    if (syllabus.submittedPdfPath) {
      try { pdfBuffer = fs.readFileSync(syllabus.submittedPdfPath); } catch { /* pdf may have been cleaned up */ }
    }
    if (!pdfBuffer) {
      const path = require('path');
      const outDir = path.join(__dirname, '../uploads/pdfs');
      fs.mkdirSync(outDir, { recursive: true });
      const pdfPath = syllabus.submittedPdfPath || path.join(outDir, `submitted_${syllabus._id}.pdf`);
      await aiService.renderFinalSyllabusPdf(syllabus, pdfPath);
      pdfBuffer = fs.readFileSync(pdfPath);
      if (!syllabus.submittedPdfPath) {
        await Syllabus.findByIdAndUpdate(req.params.id, { submittedPdfPath: pdfPath });
      }
    }

    const summaryText = aiService.generateSubmissionReport(syllabus);
    const info = await sendSubmissionToAdEmail({
      adEmail,
      syllabusMeta: syllabus,
      summaryText,
      pdfBuffer,
      pdfFilename: `${syllabus.course?.name || 'syllabus'}.pdf`,
    });
    if (info?.skipped) {
      return res.status(503).json({ message: 'Email transporter is not configured' });
    }

    await Syllabus.findByIdAndUpdate(req.params.id, { submissionEmailStatus: 'sent' });
    res.json({ message: 'Email resent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', auth, admin, async (req, res) => {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const filter = {};
    if (role) filter.role = role;
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -resetPasswordExpires -emailChangeToken -emailChangeExpires')
        .populate('managedProgramIds', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/users', auth, admin, async (req, res) => {
  try {
    const { email, firstName, lastName, role = 'instructor' } = req.body;
    if (!email || !firstName || !lastName) return res.status(400).json({ message: 'email, firstName, lastName required' });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: 'User already exists' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      email: email.toLowerCase().trim(),
      firstName,
      lastName,
      role,
      password: crypto.randomBytes(16).toString('hex'),
      isVerified: false,
      isActive: true,
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires,
    });

    try {
      await sendInvitationEmail(user.email, resetToken);
    } catch (emailErr) {
      console.error('Invitation email failed:', emailErr.message);
    }

    res.status(201).json({ _id: user._id, email: user.email, firstName, lastName, role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin assigns programs to a manager.
router.put('/users/:id/programs', auth, admin, async (req, res) => {
  try {
    const { programIds } = req.body;
    if (!Array.isArray(programIds)) return res.status(400).json({ message: 'programIds must be an array' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'manager') return res.status(400).json({ message: 'User is not a manager' });

    const validIds = programIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    user.managedProgramIds = validIds;
    await user.save();
    await user.populate('managedProgramIds', 'name code');
    res.json({ managedProgramIds: user.managedProgramIds });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
