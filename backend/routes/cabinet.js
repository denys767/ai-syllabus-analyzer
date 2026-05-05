const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth, admin } = require('../middleware/auth');
const Program = require('../models/Program');
const User = require('../models/User');
const Syllabus = require('../models/Syllabus');
const { sendInvitationEmail } = require('../services/emailService');
const crypto = require('crypto');

router.use(auth, admin);

// ─── Programs ────────────────────────────────────────────────────────────────

router.get('/programs', async (req, res) => {
  try {
    const programs = await Program.find().sort({ name: 1 });
    res.json(programs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/programs', async (req, res) => {
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

router.put('/programs/:id', async (req, res) => {
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

router.delete('/programs/:id', async (req, res) => {
  try {
    const program = await Program.findByIdAndDelete(req.params.id);
    if (!program) return res.status(404).json({ message: 'Program not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Metrics ─────────────────────────────────────────────────────────────────

router.get('/metrics', async (req, res) => {
  try {
    const [total, submitted, inProgress] = await Promise.all([
      Syllabus.countDocuments(),
      Syllabus.countDocuments({ status: 'submitted' }),
      Syllabus.countDocuments({ status: 'in_progress' }),
    ]);
    res.json({ total, submitted, inProgress });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Syllabi ─────────────────────────────────────────────────────────────────

router.get('/syllabi', async (req, res) => {
  try {
    const { program, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (program) filter.programId = new mongoose.Types.ObjectId(program);
    if (status) filter.status = status;
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
    res.json({ syllabi, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/syllabi/:id/resend-submission', async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id).populate('programId');
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (syllabus.status !== 'submitted') return res.status(400).json({ message: 'Syllabus not submitted yet' });
    const adEmail = syllabus.programId?.academicDirectorEmail;
    if (!adEmail) return res.status(400).json({ message: 'No Academic Director email for this program' });

    const { sendSubmissionToAdEmail } = require('../services/emailService');
    const { generateSubmissionReport } = require('../services/aiService');

    let pdfBuffer;
    if (syllabus.submittedPdfPath) {
      const fs = require('fs');
      try { pdfBuffer = fs.readFileSync(syllabus.submittedPdfPath); } catch { /* pdf may have been cleaned up */ }
    }

    const summaryText = await generateSubmissionReport(syllabus);
    await sendSubmissionToAdEmail({
      adEmail,
      syllabusMeta: syllabus,
      summaryText,
      pdfBuffer,
      pdfFilename: `${syllabus.course?.name || 'syllabus'}.pdf`,
    });

    await Syllabus.findByIdAndUpdate(req.params.id, { submissionEmailStatus: 'sent' });
    res.json({ message: 'Email resent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const filter = {};
    if (role) filter.role = role;
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select('-password -resetPasswordToken -resetPasswordExpires -emailChangeToken -emailChangeExpires')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/users', async (req, res) => {
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

module.exports = router;
