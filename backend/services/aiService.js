const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const puppeteer = require('puppeteer');
const Syllabus = require('../models/Syllabus');
const {
  buildAssistantChatMessage,
  buildWorkflowFromAnalysis,
  createId,
  ensureWorkflow,
} = require('./workflowService');

class AIService {
  constructor() {
    this.apiKey = (process.env.OPENAI_API_KEY || '').trim();
    this.openai = this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : null;
    const envModel = (process.env.LLM_MODEL || '').trim();
    this.llmModel = envModel && envModel.startsWith('gpt-') ? envModel : 'gpt-5-nano';
    this.learningObjectives = [
      'Leverage real-life business experiences to develop adaptive leadership and decision-making skills.',
      'Integrate and apply global business management practices to scale ventures and drive innovation.',
      'Master digital, analytical, and AI-driven decision-making tools.',
      'Develop resilient business strategies for growth and competitive advantage.',
      'Drive the growth and scalability of Ukrainian businesses.',
      'Cultivate ethical leadership and cultural intelligence.',
      'Enhance communication, negotiation, and persuasion skills.',
      'Develop a career path that leverages MBA learning.',
      'Strengthen leadership impact in diverse team environments.',
    ];
  }

  async analyzeSyllabus(syllabusId) {
    this.ensureClient();
    const syllabus = await Syllabus.findById(syllabusId);
    if (!syllabus) throw new Error('Syllabus not found');

    const analysis = await this.analyzeAgainstStandards(syllabus.extractedText);
    const workflow = buildWorkflowFromAnalysis(analysis, syllabus.workflow);

    syllabus.analysis = {
      templateCompliance: {
        missingElements: analysis.templateCompliance?.missingElements || [],
      },
      learningObjectivesAlignment: {
        alignedObjectives: analysis.learningObjectivesAlignment?.alignedObjectives || [],
        missingObjectives: analysis.learningObjectivesAlignment?.missingObjectives || [],
      },
      summary: analysis.summary,
    };
    syllabus.recommendations = analysis.issues.map((issue) => ({
      id: issue.id,
      category: mapBlockToRecommendationCategory(issue.block),
      groupTag: issue.block,
      title: issue.title,
      description: issue.description,
      priority: issue.severity === 'critical' ? 'critical' : 'medium',
      status: 'pending',
      suggestedText: issue.afterText || issue.choice?.appliedText || issue.caseRecommendation?.cards?.[0]?.afterText || '',
    }));
    syllabus.workflow = workflow;
    syllabus.status = 'analyzed';
    syllabus.workspaceStatus = workflow.readiness.canSubmit ? 'In Progress' : 'Draft';
    await syllabus.save();

    return workflow;
  }

  async analyzeAgainstStandards(syllabusText) {
    this.ensureClient();
    const prompt = `You are Professor's Tutor, an expert KSE syllabus reviewer.

Review the syllabus and return JSON only.

Priorities:
- surface only the most important 3 to 7 issues
- split issues into the blocks template, learning_outcomes, cases, policies
- use kind "diff" when you can propose a direct before/after change
- use kind "choice" for policy choices with 3 options
- use kind "case_recommendation" for weekly case cards
- mark required=true for anything that should block submission
- use severity "critical" only for true blockers

Reference learning outcomes:
${this.learningObjectives.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Syllabus:
${syllabusText.slice(0, 18000)}

Return this JSON shape:
{
  "summary": { "criticalIssues": number, "improvements": number },
  "templateCompliance": { "missingElements": string[] },
  "learningObjectivesAlignment": {
    "alignedObjectives": string[],
    "missingObjectives": string[]
  },
  "issues": [
    {
      "id": "short_id",
      "block": "template|learning_outcomes|cases|policies",
      "kind": "diff|choice|case_recommendation",
      "severity": "critical|normal",
      "required": true,
      "title": "short title",
      "description": "short explanation in a friendly tutoring tone",
      "beforeText": "existing wording or concise description of the current gap",
      "afterText": "improved wording",
      "choice": {
        "prompt": "question for radio options",
        "customPrompt": "prompt for optional note",
        "options": [
          { "id": "opt1", "label": "Option 1", "description": "when to use", "text": "policy text", "isRecommended": true }
        ]
      },
      "caseRecommendation": {
        "weekLabel": "Week N",
        "cards": [
          { "id": "card1", "title": "case title", "source": "source", "fitLabel": "Good fit", "previewText": "why it fits", "afterText": "text to add into syllabus" }
        ]
      }
    }
  ]
}`;

    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        {
          role: 'system',
          content: 'You are an MBA syllabus reviewer. Output valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_object' } },
    });

    const parsed = safeParseJSON(response.output_text || '{}') || {};
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

    const normalizedIssues = issues.slice(0, 7).map((issue, index) => ({
      ...issue,
      id: issue.id || createId(`issue_${index + 1}`),
      block: ['template', 'learning_outcomes', 'cases', 'policies'].includes(issue.block) ? issue.block : 'template',
      kind: ['diff', 'choice', 'case_recommendation'].includes(issue.kind) ? issue.kind : 'diff',
      severity: issue.severity === 'critical' ? 'critical' : 'normal',
      required: issue.required !== undefined ? Boolean(issue.required) : issue.severity === 'critical',
      beforeText: issue.beforeText || '',
      afterText: issue.afterText || '',
      choice: issue.kind === 'choice' ? issue.choice || defaultPolicyChoice(issue.title) : null,
      caseRecommendation:
        issue.kind === 'case_recommendation'
          ? issue.caseRecommendation || defaultCaseRecommendation(issue.title)
          : null,
    }));

    const criticalIssues = normalizedIssues.filter((issue) => issue.severity === 'critical').length;
    const improvements = normalizedIssues.length - criticalIssues;

    return {
      summary: {
        criticalIssues: parsed.summary?.criticalIssues ?? criticalIssues,
        improvements: parsed.summary?.improvements ?? Math.max(improvements, 0),
      },
      templateCompliance: {
        missingElements: parsed.templateCompliance?.missingElements || [],
      },
      learningObjectivesAlignment: {
        alignedObjectives: parsed.learningObjectivesAlignment?.alignedObjectives || [],
        missingObjectives: parsed.learningObjectivesAlignment?.missingObjectives || [],
      },
      issues: normalizedIssues,
    };
  }

  async generateChatReply(syllabusId, message) {
    this.ensureClient();
    const syllabus = await Syllabus.findById(syllabusId);
    if (!syllabus) throw new Error('Syllabus not found');
    const workflow = ensureWorkflow(syllabus);
    const activeIssue = workflow.issues.find((issue) => issue.id === workflow.activeIssueId);
    const contextSummary = activeIssue
      ? `Current issue: ${activeIssue.title}\n${activeIssue.description}\nBefore: ${activeIssue.beforeText}\nAfter: ${activeIssue.afterText}`
      : 'All required issues are resolved. Help the instructor with final polish or submit questions.';

    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        {
          role: 'system',
          content:
            "You are Professor's Tutor, a conversational syllabus assistant. Reply in concise, supportive English. Clarify the current issue, suggest next steps, and do not invent new tracked issues.",
        },
        {
          role: 'user',
          content: `Syllabus title: ${syllabus.title}\nProgram: ${syllabus.program}\n${contextSummary}\n\nInstructor message: ${message}`,
        },
      ],
    });

    return (response.output_text || '').trim() || "Let's keep going. I can clarify the current issue or help you prepare the final submission.";
  }

  async generateFinalPdf(syllabusId) {
    this.ensureClient();
    const syllabus = await Syllabus.findById(syllabusId);
    if (!syllabus) throw new Error('Syllabus not found');

    const workflow = ensureWorkflow(syllabus);
    const confirmedIssues = workflow.issues.filter((issue) => issue.decision === 'confirmed');
    const finalText = await this.generateFinalText(syllabus, confirmedIssues);

    const html = this.buildFinalHtml(syllabus, finalText, confirmedIssues);
    const uploadDir = path.join(__dirname, '../uploads/syllabi');
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `professors-tutor-${syllabus._id}-${Date.now()}.pdf`;
    const pdfPath = path.join(uploadDir, filename);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: (process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '').trim() || undefined,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '24px', right: '24px', bottom: '24px', left: '24px' },
      });
    } finally {
      await browser.close();
    }

    const stats = await fs.stat(pdfPath);
    if (workflow.finalPdf?.path) {
      try {
        await fs.unlink(workflow.finalPdf.path);
      } catch (error) {
        // ignore cleanup error
      }
    }

    workflow.finalPdf = {
      filename,
      originalName: `${sanitizeFilename(syllabus.title)}-final.pdf`,
      path: pdfPath,
      size: stats.size,
      generatedAt: new Date(),
      mimetype: 'application/pdf',
    };
    syllabus.workflow = workflow;
    await syllabus.save();

    return workflow.finalPdf;
  }

  async generateFinalText(syllabus, confirmedIssues) {
    this.ensureClient();
    if (confirmedIssues.length === 0) {
      return syllabus.extractedText;
    }

    const prompt = `Apply the confirmed Professor's Tutor issue resolutions to this syllabus and return only JSON.

Syllabus:
${syllabus.extractedText.slice(0, 18000)}

Confirmed changes:
${confirmedIssues
  .map((issue, index) => {
    if (issue.kind === 'choice') {
      return `${index + 1}. ${issue.title}\nSelected policy text: ${issue.choice?.appliedText || issue.afterText}\nInstructor note: ${issue.instructorNote || 'none'}`;
    }
    if (issue.kind === 'case_recommendation') {
      const selectedCards = (issue.caseRecommendation?.cards || []).filter((card) =>
        (issue.caseRecommendation?.selectedCardIds || []).includes(card.id)
      );
      return `${index + 1}. ${issue.title}\nSelected cards: ${selectedCards.map((card) => `${card.title} — ${card.afterText}`).join('\n')}`;
    }
    return `${index + 1}. ${issue.title}\nBefore: ${issue.beforeText}\nAfter: ${issue.afterText}\nInstructor note: ${issue.instructorNote || 'none'}`;
  })
  .join('\n\n')}

Return:
{ "finalText": "full revised syllabus text" }`;

    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        {
          role: 'system',
          content:
            'You are a careful academic editor. Apply only the listed changes and keep the output as a natural syllabus. Return valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_object' } },
    });

    const parsed = safeParseJSON(response.output_text || '{}');
    return parsed?.finalText || syllabus.extractedText;
  }

  buildFinalHtml(syllabus, finalText, confirmedIssues) {
    const escapeHtml = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(syllabus.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1f2937; background: #f5f7fb; }
      .page { background: white; border: 1px solid #dbe4ef; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      .meta { color: #5b6472; margin-bottom: 24px; }
      .summary { background: #f0f6f4; border: 1px solid #c6ddd4; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
      .summary li { margin-bottom: 6px; }
      .content { white-space: pre-wrap; line-height: 1.6; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>${escapeHtml(syllabus.title)}</h1>
      <div class="meta">Program: ${escapeHtml(syllabus.program)} | Generated by Professor's Tutor</div>
      <div class="summary">
        <strong>Confirmed changes</strong>
        <ul>
          ${confirmedIssues.map((issue) => `<li>${escapeHtml(issue.title)}</li>`).join('')}
        </ul>
      </div>
      <div class="content">${escapeHtml(finalText)}</div>
    </div>
  </body>
</html>`;
  }

  ensureClient() {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
  }
}

function defaultPolicyChoice(title) {
  return {
    prompt: `Choose the policy wording for ${title || 'this section'}.`,
    customPrompt: 'Add a note if you want the policy tuned to your teaching style.',
    options: [
      {
        id: 'recommended',
        label: 'Recommended',
        description: 'Balanced wording aligned with KSE expectations.',
        text: 'Use the standard KSE-aligned policy wording for this section.',
        isRecommended: true,
      },
      {
        id: 'strict',
        label: 'Strict',
        description: 'More prescriptive wording for tightly structured courses.',
        text: 'Use a stricter policy wording with explicit compliance rules.',
        isRecommended: false,
      },
      {
        id: 'flexible',
        label: 'Flexible',
        description: 'Softer wording while preserving required intent.',
        text: 'Use a flexible version of the policy while keeping the required standards.',
        isRecommended: false,
      },
    ],
  };
}

function defaultCaseRecommendation(title) {
  return {
    weekLabel: 'Week recommendation',
    cards: [
      {
        id: 'case_1',
        title: title || 'Suggested case',
        source: 'AI recommendation',
        fitLabel: 'Good fit',
        previewText: 'This case fits the course objectives and adds applied discussion.',
        afterText: 'Add this recommended case to the weekly schedule.',
      },
    ],
  };
}

function safeParseJSON(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    return null;
  }
}

function sanitizeFilename(value) {
  return String(value || 'syllabus')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function mapBlockToRecommendationCategory(block) {
  if (block === 'template') return 'template-compliance';
  if (block === 'learning_outcomes') return 'learning-objectives';
  if (block === 'cases') return 'cases';
  if (block === 'policies') return 'policy';
  return 'other';
}

module.exports = new AIService();
