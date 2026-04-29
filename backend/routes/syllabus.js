const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParseLib = require('pdf-parse');
const mammoth = require('mammoth');
const { body, validationResult } = require('express-validator');

const Syllabus = require('../models/Syllabus');
const AppConfig = require('../models/AppConfig');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');
const { sendSyllabusSubmissionEmail } = require('../services/emailService');
const {
  PROGRAMS,
  buildAssistantChatMessage,
  buildUserMessage,
  buildWorkspacePayload,
  buildWorkspaceSummary,
  cancelIssue,
  confirmIssue,
  ensureWorkflow,
  markWorkflowDirty,
} = require('../services/workflowService');

const router = express.Router();

const legacyPdfParse =
  typeof pdfParseLib === 'function'
    ? pdfParseLib
    : typeof pdfParseLib?.default === 'function'
      ? pdfParseLib.default
      : null;
const PdfParseClass = pdfParseLib?.PDFParse || pdfParseLib?.default?.PDFParse;

function getOwnerId(syllabus) {
  const instructor = syllabus?.instructor;
  if (!instructor) return null;
  if (typeof instructor === 'object' && instructor !== null && instructor._id) {
    return instructor._id.toString();
  }
  return instructor.toString();
}

function isOwnerOrRole(user, syllabus, allowedRoles = ['admin', 'manager']) {
  const ownerId = getOwnerId(syllabus);
  return ownerId === user.userId || allowedRoles.includes(user.role);
}

function getIssue(workflow, issueId) {
  return workflow.issues.find((candidate) => candidate.id === issueId);
}

function ensureIssue(workflow, issueId) {
  const issue = getIssue(workflow, issueId);
  if (!issue) {
    const error = new Error('Issue not found');
    error.statusCode = 404;
    throw error;
  }
  return issue;
}

function buildSubmissionReport(syllabus) {
  const workflow = ensureWorkflow(syllabus);
  const criticalIssues = workflow.issues.filter((issue) => issue.required || issue.severity === 'critical');
  const confirmed = criticalIssues.filter((issue) => issue.decision === 'confirmed');
  const declined = criticalIssues.filter((issue) => issue.decision === 'cancelled');
  const open = criticalIssues.filter((issue) => issue.state === 'open');

  return [
    `Syllabus: ${syllabus.title}`,
    `Program: ${syllabus.program}`,
    '',
    `Critical items found: ${criticalIssues.length}`,
    `Confirmed: ${confirmed.length}`,
    `Declined: ${declined.length}`,
    `Still open: ${open.length}`,
    '',
    'Confirmed items:',
    ...confirmed.map((issue) => `- ${issue.title}`),
    '',
    'Declined items:',
    ...(declined.length ? declined.map((issue) => `- ${issue.title}`) : ['- None']),
  ].join('\n');
}

async function getAcademicDirectorEmail() {
  const config = await AppConfig.findOne({ key: 'main' });
  return config?.academicDirectorEmail || process.env.ACADEMIC_DIRECTOR_EMAIL || process.env.ADMIN_EMAIL || '';
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
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid file type. Only PDF and DOCX files are allowed.'));
  },
});

async function extractTextFromFile(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const buffer = await fs.readFile(filePath);
    if (typeof legacyPdfParse === 'function') {
      const parsed = await legacyPdfParse(buffer);
      return parsed.text;
    }
    if (typeof PdfParseClass === 'function') {
      const parser = new PdfParseClass({ data: buffer });
      try {
        const result = await parser.getText();
        return result?.text || '';
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy().catch(() => {});
        }
      }
    }
    throw new Error('PDF parser unavailable');
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error('Unsupported file type');
}

router.post(
  '/upload',
  auth,
  upload.single('syllabus'),
  [
    body('courseName').trim().notEmpty().withMessage('Syllabus title is required'),
    body('courseCode').optional().trim(),
    body('program').isIn(PROGRAMS).withMessage(`Program must be one of: ${PROGRAMS.join(', ')}`),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Syllabus file is required' });
      }

      const extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);
      if (!extractedText.trim()) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: 'Could not extract text from the uploaded file' });
      }

      const syllabus = new Syllabus({
        title: req.body.courseName,
        program: req.body.program,
        course: {
          code: req.body.courseCode || '',
          name: req.body.courseName,
          year: new Date().getFullYear(),
        },
        instructor: req.user.userId,
        originalFile: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
        },
        extractedText,
        workflow: {
          messages: [
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              kind: 'greeting',
              content:
                "Hi! I'm here to help you build a syllabus that meets all KSE Graduate Business School standards. Upload your draft and I'll take it from there.",
              createdAt: new Date(),
            },
          ],
          issues: [],
          readiness: {
            pct: 0,
            label: 'Needs work',
            canSubmit: false,
            openIssues: 0,
            resolvedIssues: 0,
            blocks: [],
          },
        },
        status: 'processing',
        workspaceStatus: 'Draft',
      });

      await syllabus.save();

      setImmediate(async () => {
        try {
          await aiService.analyzeSyllabus(syllabus._id);
        } catch (error) {
          await Syllabus.findByIdAndUpdate(syllabus._id, { status: 'error' });
          console.error('Syllabus analysis error:', error);
        }
      });

      return res.status(201).json({
        message: 'Syllabus uploaded successfully. Analysis is in progress.',
        syllabus: buildWorkspaceSummary(syllabus),
      });
    } catch (error) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      console.error('Upload error:', error);
      return res.status(500).json({ message: 'Internal server error during file upload' });
    }
  }
);

router.get('/my-syllabi', auth, async (req, res) => {
  try {
    const syllabi = await Syllabus.find({ instructor: req.user.userId })
      .sort({ updatedAt: -1 })
      .populate('instructor', 'firstName lastName email');
    const items = syllabi.map((syllabus) => buildWorkspaceSummary(syllabus));
    return res.json({ syllabi: items });
  } catch (error) {
    console.error('Get my syllabi error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id/status', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    ensureWorkflow(syllabus);
    return res.json({
      status: syllabus.status,
      workspaceStatus: syllabus.workspaceStatus,
      readinessPct: syllabus.workflow.readiness?.pct || 0,
    });
  } catch (error) {
    console.error('Get status error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id).populate('instructor', 'firstName lastName email');
    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    if (!isOwnerOrRole(req.user, syllabus)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    ensureWorkflow(syllabus);
    await syllabus.save();
    return res.json(buildWorkspacePayload(syllabus));
  } catch (error) {
    console.error('Get syllabus error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:id/chat',
  auth,
  [body('message').trim().notEmpty().withMessage('Message is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const syllabus = await Syllabus.findById(req.params.id);
      if (!syllabus) {
        return res.status(404).json({ message: 'Syllabus not found' });
      }
      if (!isOwnerOrRole(req.user, syllabus)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const workflow = ensureWorkflow(syllabus);
      workflow.messages.push(buildUserMessage(req.body.message));
      const reply = await aiService.generateChatReply(syllabus._id, req.body.message);
      workflow.messages.push(buildAssistantChatMessage(reply));
      syllabus.workflow = workflow;
      await syllabus.save();

      return res.json(buildWorkspacePayload(syllabus));
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.post('/:id/issues/:issueId/confirm', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const workflow = ensureWorkflow(syllabus);
    const issue = ensureIssue(workflow, req.params.issueId);
    confirmIssue(workflow, issue, req.body.note || '');
    syllabus.workflow = workflow;
    syllabus.workspaceStatus = workflow.readiness.canSubmit ? 'In Progress' : 'Draft';
    await syllabus.save();
    return res.json(buildWorkspacePayload(syllabus));
  } catch (error) {
    console.error('Confirm issue error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
});

router.post('/:id/issues/:issueId/cancel', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const workflow = ensureWorkflow(syllabus);
    const issue = ensureIssue(workflow, req.params.issueId);
    cancelIssue(workflow, issue, req.body.note || '');
    syllabus.workflow = workflow;
    syllabus.workspaceStatus = workflow.readiness.canSubmit ? 'In Progress' : 'Draft';
    await syllabus.save();
    return res.json(buildWorkspacePayload(syllabus));
  } catch (error) {
    console.error('Cancel issue error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
});

router.post(
  '/:id/issues/:issueId/apply-choice',
  auth,
  [body('optionId').trim().notEmpty().withMessage('optionId is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const syllabus = await Syllabus.findById(req.params.id);
      if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
      if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

      const workflow = ensureWorkflow(syllabus);
      const issue = ensureIssue(workflow, req.params.issueId);
      if (issue.kind !== 'choice' || !issue.choice) {
        return res.status(400).json({ message: 'Issue does not support structured choices' });
      }

      const option = issue.choice.options.find((candidate) => candidate.id === req.body.optionId);
      if (!option) {
        return res.status(404).json({ message: 'Option not found' });
      }

      issue.choice.selectedOptionId = option.id;
      issue.choice.customNote = req.body.customNote || '';
      issue.choice.appliedText = issue.choice.customNote
        ? `${option.text}\n\nInstructor note: ${issue.choice.customNote}`
        : option.text;
      issue.afterText = issue.choice.appliedText;
      issue.updatedAt = new Date();
      markWorkflowDirty(workflow);
      syllabus.workflow = workflow;
      await syllabus.save();
      return res.json(buildWorkspacePayload(syllabus));
    } catch (error) {
      console.error('Apply choice error:', error);
      return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
    }
  }
);

router.post(
  '/:id/issues/:issueId/add-case',
  auth,
  [body('cardId').trim().notEmpty().withMessage('cardId is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const syllabus = await Syllabus.findById(req.params.id);
      if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
      if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

      const workflow = ensureWorkflow(syllabus);
      const issue = ensureIssue(workflow, req.params.issueId);
      if (issue.kind !== 'case_recommendation' || !issue.caseRecommendation) {
        return res.status(400).json({ message: 'Issue does not support case cards' });
      }

      const card = issue.caseRecommendation.cards.find((candidate) => candidate.id === req.body.cardId);
      if (!card) {
        return res.status(404).json({ message: 'Case card not found' });
      }

      const selectedSet = new Set(issue.caseRecommendation.selectedCardIds || []);
      selectedSet.add(card.id);
      issue.caseRecommendation.selectedCardIds = Array.from(selectedSet);
      issue.caseRecommendation.previewCardId = req.body.preview ? card.id : issue.caseRecommendation.previewCardId;
      issue.afterText = issue.caseRecommendation.cards
        .filter((candidate) => issue.caseRecommendation.selectedCardIds.includes(candidate.id))
        .map((candidate) => candidate.afterText)
        .join('\n\n');
      issue.updatedAt = new Date();
      markWorkflowDirty(workflow);
      syllabus.workflow = workflow;
      await syllabus.save();
      return res.json(buildWorkspacePayload(syllabus));
    } catch (error) {
      console.error('Add case error:', error);
      return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
    }
  }
);

router.get('/:id/preview', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const workflow = ensureWorkflow(syllabus);
    if (!workflow.finalPdf?.path) {
      await aiService.generateFinalPdf(syllabus._id);
    }

    const freshSyllabus = await Syllabus.findById(req.params.id);
    const finalPdf = freshSyllabus.workflow?.finalPdf;
    if (!finalPdf?.path) {
      return res.status(500).json({ message: 'Preview generation failed' });
    }

    res.setHeader('Content-Type', finalPdf.mimetype || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${finalPdf.originalName || 'final-syllabus.pdf'}"`);
    return res.sendFile(path.resolve(finalPdf.path));
  } catch (error) {
    console.error('Preview error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/submit', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });

    const workflow = ensureWorkflow(syllabus);
    if (!workflow.readiness.canSubmit) {
      return res.status(400).json({ message: 'Resolve all required issues before submission' });
    }

    if (!workflow.finalPdf?.path) {
      await aiService.generateFinalPdf(syllabus._id);
    }

    const freshSyllabus = await Syllabus.findById(req.params.id);
    const finalPdf = freshSyllabus.workflow?.finalPdf;
    const academicDirectorEmail = await getAcademicDirectorEmail();
    if (!academicDirectorEmail) {
      return res.status(400).json({ message: 'Academic Director email is not configured' });
    }

    const reportText = buildSubmissionReport(freshSyllabus);
    await sendSyllabusSubmissionEmail({
      to: academicDirectorEmail,
      syllabusTitle: freshSyllabus.title,
      reportText,
      pdfPath: finalPdf?.path,
      pdfFilename: finalPdf?.originalName,
    });

    freshSyllabus.workflow.submission = {
      submittedAt: new Date(),
      submittedBy: req.user.userId,
      academicDirectorEmail,
      reportText,
    };
    freshSyllabus.workspaceStatus = 'Submitted';
    await freshSyllabus.save();

    return res.json(buildWorkspacePayload(freshSyllabus));
  } catch (error) {
    console.error('Submit error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id/download', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });
    return res.download(syllabus.originalFile.path, syllabus.originalFile.originalName);
  } catch (error) {
    console.error('Download original error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const syllabus = await Syllabus.findById(req.params.id);
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });
    if (!isOwnerOrRole(req.user, syllabus)) return res.status(403).json({ message: 'Access denied' });
    await syllabus.cleanupFiles();
    await Syllabus.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Syllabus deleted successfully' });
  } catch (error) {
    console.error('Delete syllabus error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
