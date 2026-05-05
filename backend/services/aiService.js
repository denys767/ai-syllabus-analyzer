const path = require('path');
const fs = require('fs');
const Syllabus = require('../models/Syllabus');
const StudentCluster = require('../models/StudentCluster');
const natural = require('natural');
const OpenAI = require('openai');

class AIService {
  constructor() {
    this.stemmer = natural.PorterStemmer;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const envModel = (process.env.LLM_MODEL || '').trim();
    this.llmModel = envModel && envModel.startsWith('gpt-') ? envModel : 'gpt-5-nano';

    this.syllabusTemplate = `# Syllabus Template
## 1. Summary
- Course Title & Code
- Instructor(s)
- Prerequisites
- Course Objectives
- Learning Outcomes

## 2. Course Structure & Schedule
- Table with dates and topics

## 3. Grading & Assessment
- Assessment components with weights

## 4. Course Materials
- Required Readings
- Recommended Materials

## 5. Course Policies
- Attendance
- Academic Integrity
- Use of AI`;

    this.learningObjectives = [
      { id: 'LO1', text: 'Leverage real-life business experiences to develop adaptive leadership and decision-making skills for managing businesses in complex and dynamic environments.' },
      { id: 'LO2', text: 'Integrate and apply global business management practices to scale ventures, drive innovation, and enhance long-term business sustainability.' },
      { id: 'LO3', text: 'Master advanced digital, analytical, and AI-driven decision-making tools to optimize management efficiency and strategic foresight.' },
      { id: 'LO4', text: 'Develop innovative and resilient business strategies to foster growth, navigate uncertainty, and maintain a competitive edge in local and global markets.' },
      { id: 'LO5', text: 'Drive the growth and scalability of Ukrainian businesses through expert strategic planning, market expansion, and cross-border business development.' },
      { id: 'LO6', text: 'Cultivate strong ethical leadership and cultural intelligence to foster inclusive, responsible, and sustainable business practices in a complex geopolitical and intercultural environment.' },
      { id: 'LO7', text: 'Enhance communication, negotiation, and persuasion skills to effectively influence stakeholders, build partnerships, and drive business success.' },
      { id: 'LO8', text: 'Develop a career path to maximize individual growth, leverage MBA learning in career transitions, and strengthen professional positioning in competitive job markets.' },
      { id: 'LO9', text: 'Strengthen leadership impact by mastering interpersonal and intercultural collaboration, fostering high-performance teams, and leading with confidence in diverse environments.' }
    ];
  }

  async analyzeSyllabus(syllabusId) {
    try {
      console.log('Starting syllabus analysis:', syllabusId);
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) throw new Error('Syllabus not found');

      const analysis = await this.analyzeAgainstStandards(syllabus.extractedText);
      const plagiarismCheck = await this.checkPlagiarism(syllabus);

      let plagiarismRecommendations = [];
      if (plagiarismCheck.riskLevel === 'medium' || plagiarismCheck.riskLevel === 'high') {
        plagiarismRecommendations = await this.generateAntiPlagiarismRecommendations(syllabus, plagiarismCheck);
      }

      const allRecs = [...analysis.recommendations, ...plagiarismRecommendations];

      // Pre-generate Before/After payloads for the top-N highest-priority pending recs in one batched
      // LLM call so per-Confirm latency in the chat is just a Mongo write, not a model call.
      const recsWithPayloads = await this.pregenIssueMessages(syllabus, allRecs);

      await Syllabus.findByIdAndUpdate(syllabusId, {
        structure: analysis.structure || {},
        analysis: {
          templateCompliance: {
            missingElements: analysis.templateCompliance?.missingElements || []
          },
          learningObjectivesAlignment: {
            alignedObjectives: analysis.learningObjectivesAlignment?.alignedObjectives || [],
            missingObjectives: analysis.learningObjectivesAlignment?.missingObjectives || []
          },
          plagiarismCheck: plagiarismCheck
        },
        recommendations: recsWithPayloads,
        vectorEmbedding: this.generateVectorEmbedding(syllabus.extractedText),
        status: 'in_progress'
      });

      return true;
    } catch (error) {
      console.error('Analysis error:', error.message);
      await Syllabus.findByIdAndUpdate(syllabusId, { status: 'error' });
      throw error;
    }
  }

  async analyzeAgainstStandards(syllabusText) {
    const prompt = `You are analyzing an MBA syllabus for KSE Business School (Kyiv School of Economics).

**SYLLABUS TEMPLATE TO FOLLOW:**
${this.syllabusTemplate}

**MBA-27 LEARNING OUTCOMES (ALL COURSES MUST ALIGN):**
${this.learningObjectives.map((lo, idx) => `LO${idx + 1}: ${lo.text}`).join('\n')}

**SYLLABUS TO ANALYZE:**
${syllabusText}

**TASK:**
Analyze the syllabus and provide recommendations in the following categories:
1. **template-compliance** - Missing sections, formatting issues compared to template
2. **learning-objectives** - Which learning outcomes are covered/missing, how to improve alignment. Specify which LO is covered by this recommendation
3. **content-quality** - Content depth, relevance, clarity improvements
4. **cases** - Case study additions or improvements relevant to the course
5. **policy** - Attendance, academic integrity, AI use policies
6. **other** - Any other improvements

Return JSON with this exact structure:
{
  "structure": {
    "hasObjectives": boolean,
    "hasAssessment": boolean,
    "hasSchedule": boolean,
    "hasResources": boolean,
    "missingParts": string[]
  },
  "templateCompliance": {
    "missingElements": string[]
  },
  "learningObjectivesAlignment": {
    "alignedObjectives": string[],
    "missingObjectives": string[]
  },
  "recommendations": [
    {
      "category": "template-compliance" | "learning-objectives" | "content-quality" | "cases" | "policy" | "other",
      "title": "Short title",
      "description": "Detailed recommendation.",
      "priority": "critical" | "high" | "medium" | "low"
    }
  ]
}`;

    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        { role: 'system', content: 'You are an expert MBA syllabus analyzer for KSE Business School. Always return valid JSON.' },
        { role: 'user', content: prompt }
      ],
      text: { format: { type: 'json_object' } }
    });

    const result = this.safeParseJSON(response.output_text || '{}');
    if (!result) throw new Error('Invalid analysis response');

    result.recommendations = (result.recommendations || []).map((rec, idx) => ({
      id: `rec_${Date.now()}_${idx}`,
      category: rec.category || 'other',
      groupTag: this.getCategoryLabel(rec.category),
      title: rec.title || `Recommendation ${idx + 1}`,
      description: rec.description || 'No description provided',
      priority: rec.priority || 'medium',
      decision: 'pending'
    }));

    return result;
  }

  async checkPlagiarism(currentSyllabus) {
    try {
      const otherSyllabi = await Syllabus.find({
        _id: { $ne: currentSyllabus._id },
        status: { $in: ['in_progress', 'submitted'] },
        vectorEmbedding: { $exists: true }
      }).select('title course extractedText vectorEmbedding instructor');

      if (otherSyllabi.length === 0) {
        return { riskLevel: 'none', similarSyllabi: [], overallSimilarity: 0 };
      }

      const currentVector = this.generateVectorEmbedding(currentSyllabus.extractedText);
      const similarities = [];

      for (const other of otherSyllabi) {
        const similarity = this.calculateCosineSimilarity(currentVector, other.vectorEmbedding);
        if (similarity > 0.5) {
          similarities.push({
            syllabusId: other._id,
            title: other.title || other.course?.name || 'Untitled',
            instructor: other.instructor,
            similarity: Math.round(similarity * 100),
            excerpts: this.findSimilarExcerpts(currentSyllabus.extractedText, other.extractedText)
          });
        }
      }

      similarities.sort((a, b) => b.similarity - a.similarity);
      const maxSimilarity = similarities.length > 0 ? similarities[0].similarity : 0;
      let riskLevel = 'low';
      if (maxSimilarity >= 80) riskLevel = 'high';
      else if (maxSimilarity >= 60) riskLevel = 'medium';

      return { riskLevel, similarSyllabi: similarities.slice(0, 5), overallSimilarity: maxSimilarity };
    } catch (error) {
      return { riskLevel: 'unknown', similarSyllabi: [], overallSimilarity: 0, error: error.message };
    }
  }

  async generateAntiPlagiarismRecommendations(syllabus, plagiarismCheck) {
    const recommendations = [];
    for (let i = 0; i < Math.min(plagiarismCheck.similarSyllabi.length, 3); i++) {
      const similar = plagiarismCheck.similarSyllabi[i];
      recommendations.push({
        id: `plagiarism_${Date.now()}_${i}`,
        category: 'plagiarism',
        groupTag: 'Match with Previous Syllabi',
        title: `Висока схожість із "${similar.title}" (${similar.similarity}%)`,
        description: `Рекомендується додати унікальні українські кейси та переформулювати контент для підвищення оригінальності.`,
        priority: plagiarismCheck.riskLevel === 'high' ? 'critical' : 'high',
        decision: 'pending'
      });
    }
    return recommendations;
  }

  findSimilarExcerpts(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const excerpts = [];
    for (let i = 0; i < Math.min(words1.length - 10, 100); i++) {
      const phrase = words1.slice(i, i + 10).join(' ');
      if (text2.toLowerCase().includes(phrase)) {
        const startIdx = text1.toLowerCase().indexOf(phrase);
        excerpts.push({ text: text1.substring(startIdx, startIdx + 200), position: startIdx });
        if (excerpts.length >= 5) break;
      }
    }
    return excerpts;
  }

  extractResponsesText(resp) {
    if (!resp) return '';
    if (resp.output_text) return resp.output_text.trim();
    return '';
  }

  safeParseJSON(text) {
    if (!text || typeof text !== 'string') return null;
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
    }
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  getCategoryLabel(category) {
    const labels = {
      'template-compliance': 'Template Compliance',
      'learning-objectives': 'Learning Outcomes Alignment',
      'content-quality': 'Content Quality',
      'cases': 'Case Recommendations',
      'policy': 'Course Policies',
      'plagiarism': 'Match with Previous Syllabi',
      'student-clusters': 'Student Cluster Integration',
      'other': 'Other'
    };
    return labels[category] || 'Other';
  }

  generateVectorEmbedding(text) {
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2).map(w => this.stemmer.stem(w));
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 50).map(e => e[0]);
    const vector = topWords.map(w => freq[w] || 0);
    const mag = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => mag > 0 ? val / mag : 0);
  }

  calculateCosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dot += vectorA[i] * vectorB[i];
      magA += vectorA[i] * vectorA[i];
      magB += vectorB[i] * vectorB[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    return (magA === 0 || magB === 0) ? 0 : dot / (magA * magB);
  }

  async getStudentClusterContext() {
    try {
      const clusterDoc = await StudentCluster.getCurrentClusters();
      if (!clusterDoc) return null;

      const plain = typeof clusterDoc.toObject === 'function' ? clusterDoc.toObject() : clusterDoc;
      const clusters = Array.isArray(plain.clusters) ? plain.clusters : [];

      const summary = clusters.map(cluster => {
        const parts = [];
        const nameWithShare = typeof cluster.percentage === 'number'
          ? `${cluster.name} (${cluster.percentage}%)`
          : cluster.name || 'Unnamed cluster';
        parts.push(nameWithShare);

        if (cluster.description) {
          parts.push(cluster.description);
        }

        if (Array.isArray(cluster.businessChallenges) && cluster.businessChallenges.length) {
          parts.push(`Challenges: ${cluster.businessChallenges.slice(0, 3).join('; ')}`);
        }

        if (Array.isArray(cluster.characteristics) && cluster.characteristics.length) {
          parts.push(`Traits: ${cluster.characteristics.slice(0, 3).join('; ')}`);
        }

        return `- ${parts.join(' — ')}`;
      }).join('\n');

      return {
        quarter: plain.quarter || 'Current cohort',
        clusters,
        summary: summary || '- No student clusters configured',
        nameList: clusters.map(c => c.name).filter(Boolean).join(', ') || 'Technology Leaders, Finance & Banking, Military & Public Sector, Business Operations'
      };
    } catch (err) {
      console.error('Student cluster context error:', err.message);
      return null;
    }
  }

  /**
   * Batch-generate Before/After payloads for the top-N highest-priority pending recommendations.
   * Mutates each recommendation in place by attaching `beforeAfter` and returns the full array.
   * Falls back to a static placeholder on failure so the chat is never blocked on AI errors at
   * upload time — the live cache-miss path in workspaceService.nextIssueMessage handles backfill.
   */
  async pregenIssueMessages(syllabus, recommendations, topN = 5) {
    const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
    const sorted = [...recommendations].sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
    const targets = sorted.slice(0, topN);
    if (!targets.length) return recommendations;

    const prompt = `You are helping an MBA instructor improve a syllabus, one issue at a time. For EACH recommendation below, produce a concise Before/After pair:

- BEFORE: a 1-3 sentence excerpt of what the syllabus currently says (or "(missing section)" if absent).
- AFTER: a 1-3 sentence concrete revision the instructor can drop in.

SYLLABUS TEXT:
${syllabus.extractedText.substring(0, 6000)}

RECOMMENDATIONS (${targets.length}):
${targets.map((r, i) => `[${i}] (${r.category} / ${r.priority}) ${r.title} — ${r.description}`).join('\n')}

Return JSON: { "items": [ { "index": <int>, "before": "...", "after": "..." } ] }`;

    let items = [];
    try {
      const resp = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You produce precise Before/After syllabus revisions. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        text: { format: { type: 'json_object' } },
      });
      const parsed = this.safeParseJSON(resp.output_text || '{}') || {};
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch (err) {
      console.error('pregenIssueMessages failed (will backfill on demand):', err.message);
    }

    for (const item of items) {
      const target = targets[item.index];
      if (!target) continue;
      target.beforeAfter = {
        kind: 'before-after',
        before: String(item.before || '').slice(0, 1200),
        after: String(item.after || '').slice(0, 1200),
        payload: null,
      };
    }
    return recommendations;
  }

  /**
   * Generate a single Before/After payload on demand. Used as a cache-miss fallback when a
   * recommendation outside the pregenerated top-N gets surfaced in the chat.
   */
  async generateIssueMessage(syllabus, recommendation) {
    const prompt = `For the recommendation below, produce a concise Before/After pair (1-3 sentences each).

SYLLABUS EXCERPT:
${(syllabus.editedText || syllabus.extractedText).substring(0, 4000)}

RECOMMENDATION:
(${recommendation.category} / ${recommendation.priority}) ${recommendation.title} — ${recommendation.description}

Return JSON: { "before": "...", "after": "..." }`;
    try {
      const resp = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You produce precise Before/After syllabus revisions. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        text: { format: { type: 'json_object' } },
      });
      const parsed = this.safeParseJSON(resp.output_text || '{}') || {};
      return {
        kind: 'before-after',
        before: String(parsed.before || '').slice(0, 1200),
        after: String(parsed.after || '').slice(0, 1200),
        payload: null,
      };
    } catch (err) {
      console.error('generateIssueMessage failed:', err.message);
      throw err;
    }
  }

  /**
   * Conversational reply grounded in the active issue and the recent transcript.
   * Used for free-text questions the instructor types into the workspace chat.
   */
  async chatReply(syllabus, recentMessages, userText, currentIssue) {
    const transcript = (recentMessages || []).slice(-8).map((m) => {
      const speaker = m.role === 'ai' ? 'AI' : m.role === 'user' ? 'Instructor' : 'System';
      return `${speaker}: ${m.content || ''}`;
    }).join('\n');

    const issueLine = currentIssue
      ? `Current issue under discussion: (${currentIssue.category} / ${currentIssue.priority}) ${currentIssue.title} — ${currentIssue.description}`
      : 'No specific issue is active right now.';

    const prompt = `You are Professor's Tutor, helping an MBA instructor at KSE Business School improve a syllabus. Be concise (2-4 sentences), specific, and reference the syllabus or current issue when relevant.

${issueLine}

Recent conversation:
${transcript}

Instructor just said: ${userText}

Reply directly to the instructor.`;

    const resp = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        { role: 'system', content: 'You are a focused, encouraging syllabus coach. Be brief and concrete.' },
        { role: 'user', content: prompt },
      ],
    });
    return (resp.output_text || '').trim();
  }

  /**
   * Render a clean (non-diff) final PDF of the syllabus for preview and submission.
   * Returns the absolute file path. Caller is responsible for cleanup of preview PDFs.
   */
  async renderFinalSyllabusPdf(syllabus, destPath) {
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch {
      throw new Error('puppeteer is not installed');
    }

    const text = syllabus.editedText || syllabus.extractedText || '';
    const course = syllabus.course?.name || syllabus.title || 'Untitled Course';
    const instructor = `${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim();
    const program = syllabus.programId?.name || '';
    const escHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const paragraphs = text.split(/\n{2,}/).map((p) =>
      `<p style="margin:0 0 10px">${escHtml(p.replace(/\n/g, '<br>'))}</p>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #111; margin: 40px; line-height: 1.55; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  .meta { font-size: 10pt; color: #555; margin-bottom: 24px; }
  .body { white-space: pre-wrap; }
</style>
</head>
<body>
<h1>${escHtml(course)}</h1>
<div class="meta">${escHtml(instructor)}${program ? ` &mdash; ${escHtml(program)}` : ''}</div>
<div class="body">${paragraphs}</div>
</body>
</html>`;

    const outDir = path.join(__dirname, '../uploads/pdfs');
    fs.mkdirSync(outDir, { recursive: true });
    const filePath = destPath || path.join(outDir, `syllabus_${syllabus._id}_${Date.now()}.pdf`);

    let browser;
    try {
      const launchOpts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] };
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      browser = await puppeteer.launch(launchOpts);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({ path: filePath, format: 'A4', printBackground: false, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    } finally {
      if (browser) await browser.close();
    }
    return filePath;
  }

  /**
   * Short text report sent to the Academic Director on submission.
   */
  generateSubmissionReport(syllabus) {
    const recs = syllabus.recommendations || [];
    const accepted = recs.filter((r) => r.decision === 'accepted');
    const rejected = recs.filter((r) => r.decision === 'rejected');
    const skipped = recs.filter((r) => r.decision === 'skipped' || r.decision === 'pending');
    const lines = [
      `Course: ${syllabus.course?.name || syllabus.title}`,
      `Instructor: ${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim(),
      '',
      `Issues addressed: ${accepted.length} accepted, ${rejected.length} rejected, ${skipped.length} skipped/pending`,
      '',
      'Critical items resolved:',
      ...accepted.filter((r) => r.priority === 'critical' || r.priority === 'high').map((r) => `  ✓ ${r.title}`),
    ];
    if (rejected.length) {
      lines.push('', 'Items the instructor declined:', ...rejected.map((r) => `  ✗ ${r.title}`));
    }
    return lines.join('\n');
  }

  getDefaultClusterDetails() {
    return {
      summary: [
        '- Technology Leaders (25%): Focus on digital transformation and product scaling.',
        '- Finance & Banking (25%): Emphasize risk management and fintech innovation.',
        '- Military & Public Sector (25%): Highlight adaptive leadership and crisis response.',
        '- Business Operations (25%): Stress operational excellence and market expansion.'
      ].join('\n'),
      nameList: 'Technology Leaders, Finance & Banking, Military & Public Sector, Business Operations',
      quarter: 'current cohort'
    };
  }
}

module.exports = new AIService();
