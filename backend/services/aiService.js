const path = require('path');
const fs = require('fs');
const Syllabus = require('../models/Syllabus');
const OpenAI = require('openai');
const DiffMatchPatch = require('diff-match-patch');

const MISSING_SECTION_TEXT = '(missing section)';
const MAX_BEFORE_AFTER_CHARS = 1800;
const MAX_SOURCE_EXCERPT_CHARS = 1400;
const SOURCE_EXCERPT_COUNT = 12;
const BATCH_CANDIDATES_PER_RECOMMENDATION = 5;
const BATCH_MAX_SHARED_EXCERPTS = 30;
const REV_DEL_OPEN = '[[KSE_DEL]]';
const REV_DEL_CLOSE = '[[/KSE_DEL]]';
const REV_ADD_OPEN = '[[KSE_ADD]]';
const REV_ADD_CLOSE = '[[/KSE_ADD]]';

class AIService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.diffMatchPatch = new DiffMatchPatch();
    this.aiRequestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 130000);

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

  async createResponse(params) {
    return this.openai.responses.create(params, { timeout: this.aiRequestTimeoutMs });
  }

  async analyzeSyllabus(syllabusId) {
    try {
      console.log('Starting syllabus analysis:', syllabusId);
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) throw new Error('Syllabus not found');

      const analysis = await this.analyzeAgainstStandards(syllabus.extractedText);
      const plagiarismCheck = {
        riskLevel: 'none',
        similarSyllabi: [],
        overallSimilarity: 0,
        skipped: true,
        reason: 'Similarity check is disabled for the Professor Tutor MVP'
      };

      const allRecs = analysis.recommendations;

      // Pre-generate grounded Before/After payloads for every pending recommendation.
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

    const response = await this.createResponse({
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
    return {
      riskLevel: 'none',
      similarSyllabi: [],
      overallSimilarity: 0,
      skipped: true,
      reason: 'Similarity check is disabled for the Professor Tutor MVP'
    };
  }

  async generateDisabledAntiPlagiarismRecommendations(syllabus, plagiarismCheck) {
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
      'other': 'Other'
    };
    return labels[category] || 'Other';
  }

  async getDisabledStudentClusterContext() {
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

  getEditableSyllabusText(syllabus) {
    return String(syllabus?.editedText || syllabus?.extractedText || '');
  }

  isMissingBefore(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === MISSING_SECTION_TEXT || normalized === 'missing section';
  }

  clipGeneratedText(value, maxChars = MAX_BEFORE_AFTER_CHARS) {
    const text = String(value || '').trim();
    if (text.length <= maxChars) return text;
    const clipped = text.slice(0, maxChars);
    const sentenceEnd = Math.max(
      clipped.lastIndexOf('. '),
      clipped.lastIndexOf('! '),
      clipped.lastIndexOf('? '),
      clipped.lastIndexOf('\n')
    );
    if (sentenceEnd > Math.floor(maxChars * 0.55)) {
      return clipped.slice(0, sentenceEnd + 1).trim();
    }
    return clipped.trim();
  }

  escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  findTextRange(text, excerpt, preferredStart = null) {
    const source = String(text || '');
    const needle = String(excerpt || '').trim();
    if (!source || !needle) return null;

    const preferred = Number.isInteger(preferredStart) ? preferredStart : null;
    if (preferred !== null && source.slice(preferred, preferred + needle.length) === needle) {
      return { start: preferred, end: preferred + needle.length, exact: true };
    }

    let exactIndex = source.indexOf(needle);
    if (exactIndex >= 0) {
      if (preferred !== null) {
        let bestIndex = exactIndex;
        let bestDistance = Math.abs(exactIndex - preferred);
        while (exactIndex >= 0) {
          const distance = Math.abs(exactIndex - preferred);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = exactIndex;
          }
          exactIndex = source.indexOf(needle, exactIndex + 1);
        }
        return { start: bestIndex, end: bestIndex + needle.length, exact: true };
      }
      return { start: exactIndex, end: exactIndex + needle.length, exact: true };
    }

    const tokens = needle.split(/\s+/).filter(Boolean).map((token) => this.escapeRegExp(token));
    if (!tokens.length) return null;

    try {
      const regex = new RegExp(tokens.join('\\s+'), 'g');
      let match = regex.exec(source);
      if (!match) return null;
      if (preferred !== null) {
        let bestMatch = match;
        let bestDistance = Math.abs(match.index - preferred);
        while ((match = regex.exec(source)) !== null) {
          const distance = Math.abs(match.index - preferred);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = match;
          }
        }
        return { start: bestMatch.index, end: bestMatch.index + bestMatch[0].length, exact: false };
      }
      return { start: match.index, end: match.index + match[0].length, exact: false };
    } catch {
      return null;
    }
  }

  tokenizeForSearch(text) {
    return String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  }

  categorySearchKeywords(category) {
    const map = {
      'template-compliance': ['template', 'section', 'summary', 'course', 'schedule', 'grading', 'assessment', 'materials', 'resources', 'policy'],
      'learning-objectives': ['learning', 'outcomes', 'objectives', 'lo', 'mba', 'competencies', 'alignment'],
      'content-quality': ['description', 'clarity', 'topics', 'readings', 'assessment', 'workload', 'course'],
      'cases': ['case', 'cases', 'schedule', 'week', 'session', 'readings', 'materials'],
      'policy': ['policy', 'policies', 'attendance', 'academic', 'integrity', 'ai', 'artificial', 'intelligence'],
      'other': ['course', 'syllabus', 'section']
    };
    return map[category] || map.other;
  }

  pushTextBlock(blocks, source, start, end) {
    const raw = source.slice(start, end);
    const trimStart = raw.length - raw.trimStart().length;
    const trimEnd = raw.trimEnd().length;
    if (trimEnd <= trimStart) return;

    const blockStart = start + trimStart;
    const blockEnd = start + trimEnd;
    const text = source.slice(blockStart, blockEnd);
    if (text.trim().length < 20) return;
    blocks.push({ start: blockStart, end: blockEnd, text });
  }

  splitSyllabusIntoBlocks(text) {
    const source = String(text || '');
    const blocks = [];
    const blankLine = /\r?\n\s*\r?\n/g;
    let start = 0;
    let match;

    while ((match = blankLine.exec(source)) !== null) {
      this.pushTextBlock(blocks, source, start, match.index);
      start = blankLine.lastIndex;
    }
    this.pushTextBlock(blocks, source, start, source.length);

    if (blocks.length < 6) {
      const lines = [];
      const lineBreak = /\r?\n/g;
      let lineStart = 0;
      while ((match = lineBreak.exec(source)) !== null) {
        lines.push({ start: lineStart, end: match.index, text: source.slice(lineStart, match.index) });
        lineStart = lineBreak.lastIndex;
      }
      if (lineStart < source.length) {
        lines.push({ start: lineStart, end: source.length, text: source.slice(lineStart) });
      }

      const nonBlank = lines.filter((line) => line.text.trim().length > 0);
      for (let i = 0; i < nonBlank.length; i += 4) {
        const window = nonBlank.slice(i, i + 6);
        if (!window.length) continue;
        this.pushTextBlock(blocks, source, window[0].start, window[window.length - 1].end);
      }
    }

    const seen = new Set();
    return blocks.filter((block) => {
      const key = block.text.replace(/\s+/g, ' ').trim().slice(0, 300);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  focusBlock(block, queryTokens) {
    const text = block.text;
    if (text.length <= MAX_SOURCE_EXCERPT_CHARS) return block;

    const lower = text.toLowerCase();
    let bestIndex = -1;
    for (const token of queryTokens) {
      const idx = lower.indexOf(token.toLowerCase());
      if (idx >= 0 && (bestIndex === -1 || idx < bestIndex)) {
        bestIndex = idx;
      }
    }

    let offset = Math.max(0, (bestIndex >= 0 ? bestIndex : 0) - 450);
    if (offset > 0) {
      const previousBreak = Math.max(text.lastIndexOf('\n', offset), text.lastIndexOf('. ', offset));
      if (previousBreak > 0) offset = previousBreak + 1;
    }

    let endOffset = Math.min(text.length, offset + MAX_SOURCE_EXCERPT_CHARS);
    if (endOffset < text.length) {
      const nextBreaks = [
        text.lastIndexOf('\n', endOffset),
        text.lastIndexOf('. ', endOffset),
        text.lastIndexOf('; ', endOffset)
      ].filter((idx) => idx > offset + 300);
      if (nextBreaks.length) endOffset = Math.max(...nextBreaks) + 1;
    }

    const raw = text.slice(offset, endOffset);
    const trimStart = raw.length - raw.trimStart().length;
    const trimEnd = raw.trimEnd().length;
    return {
      start: block.start + offset + trimStart,
      end: block.start + offset + trimEnd,
      text: raw.trim()
    };
  }

  scoreExcerpt(text, queryTokens) {
    const lower = String(text || '').toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      const escaped = this.escapeRegExp(token.toLowerCase());
      const matches = lower.match(new RegExp(`\\b${escaped}\\b`, 'g'));
      if (matches) score += matches.length * (token.length > 5 ? 2 : 1);
    }
    if (/learning outcomes?|course objectives?/i.test(text)) score += 2;
    if (/attendance|academic integrity|use of ai|artificial intelligence/i.test(text)) score += 3;
    if (/schedule|week|session|case/i.test(text)) score += 2;
    return score;
  }

  buildCandidateExcerpts(syllabusText, recommendation) {
    const blocks = this.splitSyllabusIntoBlocks(syllabusText);
    const recommendationText = [
      recommendation?.category,
      recommendation?.groupTag,
      recommendation?.title,
      recommendation?.description,
      this.categorySearchKeywords(recommendation?.category).join(' ')
    ].filter(Boolean).join(' ');
    const queryTokens = [...new Set(this.tokenizeForSearch(recommendationText))]
      .filter((token) => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'to', 'of', 'in', 'on', 'or', 'as', 'an'].includes(token));

    const scored = blocks.map((block) => ({
      ...this.focusBlock(block, queryTokens),
      score: this.scoreExcerpt(block.text, queryTokens)
    }));

    scored.sort((a, b) => (b.score - a.score) || (a.start - b.start));
    return scored.slice(0, SOURCE_EXCERPT_COUNT).map((candidate, idx) => ({
      id: `s${idx + 1}`,
      start: candidate.start,
      end: candidate.end,
      text: candidate.text
    }));
  }

  buildBatchPreviewContext(syllabusText, recommendations) {
    const sources = [];
    const sourceByRange = new Map();
    const candidatesByRecommendationId = new Map();

    const addSource = (candidate) => {
      const key = `${candidate.start}:${candidate.end}`;
      const existing = sourceByRange.get(key);
      if (existing) return existing;

      const source = {
        id: `s${sources.length + 1}`,
        start: candidate.start,
        end: candidate.end,
        text: candidate.text
      };
      sourceByRange.set(key, source);
      sources.push(source);
      return source;
    };

    for (const recommendation of recommendations) {
      const recommendationId = String(recommendation.id || '').trim();
      if (!recommendationId) continue;

      const localCandidates = this.buildCandidateExcerpts(syllabusText, recommendation);
      const selected = [];
      const selectedIds = new Set();

      const pushCandidate = (candidate, force = false) => {
        if (!candidate) return;
        const key = `${candidate.start}:${candidate.end}`;
        if (!force && sources.length >= BATCH_MAX_SHARED_EXCERPTS && !sourceByRange.has(key)) return;
        const source = addSource(candidate);
        if (!selectedIds.has(source.id)) {
          selectedIds.add(source.id);
          selected.push(source);
        }
      };

      // Always include the top local source for each recommendation, then fill
      // the shared source catalog up to the batch cap.
      pushCandidate(localCandidates[0], true);
      for (const candidate of localCandidates.slice(1, BATCH_CANDIDATES_PER_RECOMMENDATION)) {
        pushCandidate(candidate);
      }

      if (selected.length) {
        candidatesByRecommendationId.set(recommendationId, selected);
      }
    }

    return { sources, candidatesByRecommendationId };
  }

  async generateIssueMessagesBatch(syllabus, recommendations) {
    const recs = (recommendations || []).filter((recommendation) => recommendation?.id);
    if (!recs.length) return new Map();

    const syllabusText = this.getEditableSyllabusText(syllabus);
    const { sources, candidatesByRecommendationId } = this.buildBatchPreviewContext(syllabusText, recs);
    if (!sources.length) {
      throw new Error('Cannot generate Before/After previews without syllabus text');
    }

    const issueLines = recs.map((recommendation, idx) => {
      const recommendationId = String(recommendation.id);
      const candidateIds = (candidatesByRecommendationId.get(recommendationId) || []).map((source) => source.id);
      return [
        `ISSUE ${idx + 1}`,
        `recommendationId: ${recommendationId}`,
        `candidateSourceIds: ${candidateIds.join(', ') || 'missing only if truly absent'}`,
        `category: ${recommendation.category || 'other'}`,
        `priority: ${recommendation.priority || 'medium'}`,
        `title: ${recommendation.title || 'Untitled recommendation'}`,
        `description: ${recommendation.description || ''}`
      ].join('\n');
    }).join('\n\n');

    const prompt = `You are Professor's Tutor, helping an MBA instructor revise a syllabus.

Create grounded Before/After previews for EVERY recommendation below using this shared source catalog.

Rules:
- Return exactly one preview object for each recommendationId.
- Choose sourceId only from that issue's candidateSourceIds, or "missing" only when the section does not exist in the syllabus.
- BEFORE must be an exact contiguous quote copied from the chosen source excerpt.
- If sourceId is "missing", set before to "${MISSING_SECTION_TEXT}" and after to the new drop-in section text.
- AFTER must be the revised syllabus text that directly replaces BEFORE, or the text to insert when the section is missing.
- Do not invent facts such as dates, grading weights, instructor names, required readings, or case titles unless they are present in the source or recommendation.
- Keep AFTER concise and drop-in ready, usually 1-3 paragraphs.

SHARED CURRENT SYLLABUS SOURCE EXCERPTS:
${sources.map((source) => `SOURCE ${source.id}:\n"""${source.text}"""`).join('\n\n')}

RECOMMENDATIONS:
${issueLines}

Return only JSON:
{
  "previews": [
    {
      "recommendationId": "same id from the input",
      "sourceId": "one candidate source id or missing",
      "before": "exact old text copied from the source, or ${MISSING_SECTION_TEXT}",
      "after": "replacement or insertion text",
      "editAction": "replace or append or insert_after",
      "insertAfterSourceId": "source id to insert after when missing, otherwise null"
    }
  ]
}`;

    const resp = await this.createResponse({
      model: this.llmModel,
      input: [
        { role: 'system', content: 'You create grounded syllabus Before/After previews in one batch. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_object' } },
    });

    const parsed = this.safeParseJSON(resp.output_text || '{}') || {};
    const rawPreviews = Array.isArray(parsed)
      ? parsed
      : (parsed.previews || parsed.items || parsed.beforeAfter || []);
    if (!Array.isArray(rawPreviews)) {
      throw new Error('Batch Before/After generation returned invalid JSON');
    }

    const result = new Map();
    for (const raw of rawPreviews) {
      const recommendationId = String(raw.recommendationId || raw.recommendation_id || raw.issueId || raw.id || '').trim();
      if (!recommendationId || result.has(recommendationId)) continue;

      const candidates = candidatesByRecommendationId.get(recommendationId);
      if (!candidates?.length) continue;

      try {
        result.set(
          recommendationId,
          this.normalizeIssuePreview(raw, candidates, syllabusText)
        );
      } catch (err) {
        console.error(`Batch Before/After validation failed for ${recommendationId}:`, err.message);
      }
    }

    return result;
  }

  normalizeIssuePreview(parsed, candidates, syllabusText) {
    const sourceId = String(parsed.sourceId || parsed.source_id || '').trim();
    const insertAfterSourceId = String(parsed.insertAfterSourceId || parsed.insert_after_source_id || '').trim();
    const parsedBefore = String(parsed.before || parsed.exactBefore || parsed.exact_before || '').trim();
    const after = this.clipGeneratedText(parsed.after || parsed.replacement || parsed.newText);
    if (!after) throw new Error('Before/After generation returned empty AFTER text');

    const selected = candidates.find((candidate) => candidate.id === sourceId);
    const missing = sourceId.toLowerCase() === 'missing' || this.isMissingBefore(parsedBefore);
    if (missing) {
      const insertAfter = candidates.find((candidate) => candidate.id === insertAfterSourceId) || null;
      return {
        kind: 'before-after',
        before: MISSING_SECTION_TEXT,
        after,
        payload: {
          editAction: insertAfter ? 'insert_after' : 'append',
          source: 'missing-section',
          insertAfterSourceId: insertAfter?.id || null,
          insertAfterText: insertAfter?.text || null,
          generatedAt: new Date().toISOString(),
          grounded: true
        }
      };
    }

    let before = null;
    let beforeRange = null;
    if (parsedBefore && !this.isMissingBefore(parsedBefore)) {
      beforeRange = this.findTextRange(syllabusText, parsedBefore);
      if (beforeRange) before = parsedBefore;
    }

    const source = selected || (beforeRange ? null : candidates[0]);
    if (!before && source) {
      before = source.text;
      beforeRange = this.findTextRange(syllabusText, before);
    }
    if (!before || !beforeRange) {
      throw new Error('Before/After generation was not grounded in the syllabus text');
    }

    return {
      kind: 'before-after',
      before: this.clipGeneratedText(before),
      after,
      payload: {
        editAction: 'replace',
        source: 'syllabus-excerpt',
        sourceId: selected?.id || null,
        beforeStart: beforeRange.start,
        beforeEnd: beforeRange.end,
        generatedAt: new Date().toISOString(),
        grounded: true
      }
    };
  }

  normalizePolicyOptions(rawOptions, recommendation) {
    const baseId = String(recommendation?.id || 'policy');
    const fallbackText = String(recommendation?.description || 'Add a clear policy that meets KSE Graduate Business School standards.').trim();
    const fallback = [
      {
        id: `${baseId}_standard`,
        label: 'Standard policy',
        text: fallbackText,
        rationale: 'Directly addresses the missing or weak policy requirement.'
      },
      {
        id: `${baseId}_flexible`,
        label: 'Flexible policy',
        text: `${fallbackText}\n\nThe instructor may adapt implementation details to the course format while keeping expectations transparent.`,
        rationale: 'Keeps the requirement explicit while leaving room for instructor judgment.'
      },
      {
        id: `${baseId}_strict`,
        label: 'Strict policy',
        text: `${fallbackText}\n\nNon-compliance should be handled according to KSE Graduate Business School academic rules.`,
        rationale: 'Makes the compliance consequence explicit.'
      }
    ];

    const options = (Array.isArray(rawOptions) ? rawOptions : [])
      .slice(0, 3)
      .map((option, index) => ({
        id: String(option.id || `${baseId}_option_${index + 1}`).trim(),
        label: String(option.label || `Option ${index + 1}`).trim(),
        text: this.clipGeneratedText(option.text || option.policyText || option.content),
        rationale: String(option.rationale || '').trim()
      }))
      .filter((option) => option.id && option.label && option.text);

    return options.length >= 3 ? options : fallback;
  }

  async generatePolicyChoicePreview(syllabus, recommendation) {
    const syllabusText = this.getEditableSyllabusText(syllabus);
    const candidates = this.buildCandidateExcerpts(syllabusText, recommendation);
    const prompt = `Create three policy choices for one MBA syllabus issue.

Issue:
Title: ${recommendation.title || 'Policy issue'}
Description: ${recommendation.description || ''}
Priority: ${recommendation.priority || 'medium'}

Relevant syllabus excerpts:
${candidates.slice(0, 5).map((candidate) => `SOURCE ${candidate.id}:\n"""${candidate.text}"""`).join('\n\n') || '(no relevant excerpt found)'}

Rules:
- Return three distinct options the instructor can choose from.
- Do not invent instructor names, dates, grading weights, or institutional rules not implied by the issue.
- Each option text must be drop-in ready syllabus text.

Return JSON only:
{
  "options": [
    { "id": "option_1", "label": "Short label", "text": "Drop-in policy text", "rationale": "Why this option fits" }
  ],
  "insertAfterSourceId": "source id to insert after, or null"
}`;

    const resp = await this.createResponse({
      model: this.llmModel,
      input: [
        { role: 'system', content: 'You create structured policy choices for an MBA syllabus assistant. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_object' } },
    });

    const parsed = this.safeParseJSON(resp.output_text || '{}') || {};
    const insertAfter = candidates.find((candidate) => candidate.id === String(parsed.insertAfterSourceId || '').trim()) || candidates[0] || null;
    return {
      kind: 'choice',
      before: MISSING_SECTION_TEXT,
      after: '',
      payload: {
        source: 'policy-choice',
        editAction: insertAfter ? 'insert_after' : 'append',
        insertAfterSourceId: insertAfter?.id || null,
        insertAfterText: insertAfter?.text || null,
        options: this.normalizePolicyOptions(parsed.options || parsed.choices, recommendation),
        generatedAt: new Date().toISOString(),
        grounded: true
      }
    };
  }

  normalizeCaseCards(rawCards, recommendation) {
    const cards = (Array.isArray(rawCards) ? rawCards : [])
      .slice(0, 5)
      .map((card, index) => ({
        id: String(card.id || `case_${index + 1}`).trim(),
        title: String(card.title || '').trim(),
        sourceLabel: String(card.sourceLabel || card.source || '').trim(),
        sourceUrl: String(card.sourceUrl || card.url || '').trim(),
        fitLabel: String(card.fitLabel || 'Good fit').trim(),
        summary: String(card.summary || '').trim(),
        insertText: this.clipGeneratedText(card.insertText || card.syllabusText || card.text),
        previewText: this.clipGeneratedText(card.previewText || card.summary || card.insertText)
      }))
      .filter((card) => card.id && card.title && card.insertText);

    if (!cards.length) {
      const err = new Error(`Case-card generation returned no usable cards for ${recommendation?.id || recommendation?.title || 'issue'}`);
      err.retryable = true;
      throw err;
    }
    return cards;
  }

  async generateCaseCardsPreview(syllabus, recommendation) {
    const syllabusText = this.getEditableSyllabusText(syllabus);
    const candidates = this.buildCandidateExcerpts(syllabusText, recommendation);
    const prompt = `Find practical business case recommendations for one MBA syllabus issue using live web search.

Course context:
Title: ${syllabus.title || syllabus.course?.name || 'Untitled course'}

Issue:
Title: ${recommendation.title || 'Case recommendation'}
Description: ${recommendation.description || ''}
Priority: ${recommendation.priority || 'medium'}

Relevant syllabus excerpts:
${candidates.slice(0, 5).map((candidate) => `SOURCE ${candidate.id}:\n"""${candidate.text}"""`).join('\n\n') || '(no relevant excerpt found)'}

Rules:
- Prefer credible sources such as Harvard Business Publishing, Ivey, INSEAD, Stanford, MIT Sloan, Berkeley Haas, or reputable open business school collections.
- Return cards with a concrete case title and a source URL when available.
- insertText must be concise syllabus-ready text for adding the case to a relevant week/session.

Return JSON only:
{
  "week": "Week/session label if implied, otherwise null",
  "insertAfterSourceId": "source id to insert after, or null",
  "cards": [
    {
      "id": "case_1",
      "title": "Case title",
      "sourceLabel": "Publisher or source",
      "sourceUrl": "https://...",
      "fitLabel": "Good fit",
      "summary": "Why this case fits",
      "insertText": "Syllabus-ready insertion",
      "previewText": "Readable preview"
    }
  ]
}`;

    const resp = await this.createResponse({
      model: this.llmModel,
      tools: [{ type: 'web_search_preview' }],
      input: [
        { role: 'system', content: 'You create grounded case recommendation cards for MBA syllabi. Use web search and return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_object' } },
    });

    const parsed = this.safeParseJSON(resp.output_text || '{}') || {};
    const insertAfter = candidates.find((candidate) => candidate.id === String(parsed.insertAfterSourceId || '').trim()) || candidates[0] || null;
    return {
      kind: 'case-cards',
      before: MISSING_SECTION_TEXT,
      after: '',
      payload: {
        source: 'case-cards',
        editAction: insertAfter ? 'insert_after' : 'append',
        insertAfterSourceId: insertAfter?.id || null,
        insertAfterText: insertAfter?.text || null,
        week: parsed.week || null,
        cards: this.normalizeCaseCards(parsed.cards || parsed.cases || parsed.recommendations, recommendation),
        generatedAt: new Date().toISOString(),
        grounded: true
      }
    };
  }

  isBeforeAfterApplicable(syllabusOrText, beforeAfter) {
    const text = typeof syllabusOrText === 'string'
      ? syllabusOrText
      : this.getEditableSyllabusText(syllabusOrText);
    const before = beforeAfter?.before;
    const after = beforeAfter?.after;
    if (!after) return false;
    if (this.isMissingBefore(before) || beforeAfter?.payload?.source === 'missing-section') return true;
    return !!this.findTextRange(text, before, beforeAfter?.payload?.beforeStart);
  }

  applyBeforeAfterToText(text, beforeAfter) {
    return this.applyBeforeAfterToTextWithTrace(text, beforeAfter).text;
  }

  applyBeforeAfterToTextWithTrace(text, beforeAfter) {
    const source = String(text || '');
    const after = String(beforeAfter?.after || '').trim();
    if (!after) {
      const err = new Error('Suggested change is missing AFTER text');
      err.code = 'INVALID_BEFORE_AFTER';
      throw err;
    }

    const before = String(beforeAfter?.before || '').trim();
    const action = beforeAfter?.payload?.editAction;
    if (this.isMissingBefore(before) || beforeAfter?.payload?.source === 'missing-section') {
      const anchorText = beforeAfter?.payload?.insertAfterText;
      if (action === 'insert_after' && anchorText) {
        const anchorRange = this.findTextRange(source, anchorText);
        if (anchorRange) {
          const prefix = source.slice(0, anchorRange.end).trimEnd();
          const inserted = `\n\n${after}`;
          return {
            text: `${prefix}${inserted}${source.slice(anchorRange.end)}`,
            trace: {
              action: 'insert',
              start: prefix.length,
              end: prefix.length,
              before: '',
              after: inserted
            }
          };
        }
      }
      const prefix = source.trimEnd();
      const inserted = `${source.trim() ? '\n\n' : ''}${after}`;
      return {
        text: `${prefix}${inserted}`,
        trace: {
          action: 'insert',
          start: prefix.length,
          end: prefix.length,
          before: '',
          after: inserted
        }
      };
    }

    const range = this.findTextRange(source, before, beforeAfter?.payload?.beforeStart);
    if (!range) {
      const err = new Error('The BEFORE excerpt no longer matches the current syllabus text');
      err.code = 'STALE_BEFORE_AFTER';
      throw err;
    }

    return {
      text: `${source.slice(0, range.start)}${after}${source.slice(range.end)}`,
      trace: {
        action: 'replace',
        start: range.start,
        end: range.end,
        before: source.slice(range.start, range.end),
        after
      }
    };
  }

  resolveStructuredIssueText(beforeAfter, selection = null) {
    const payload = beforeAfter?.payload || {};
    const appliedSelection = selection || payload.appliedSelection || {};
    if (payload.appliedText) return this.clipGeneratedText(payload.appliedText);

    if (beforeAfter?.kind === 'choice') {
      const customText = String(appliedSelection.customText || '').trim();
      if (customText) return this.clipGeneratedText(customText);

      const option = (payload.options || []).find((item) => (
        String(item.id) === String(appliedSelection.optionId || '')
      ));
      const optionText = this.clipGeneratedText(option?.text);
      if (!optionText) {
        const err = new Error('No policy option was selected');
        err.code = 'INVALID_SELECTION';
        throw err;
      }
      const customNote = String(appliedSelection.customNote || '').trim();
      return customNote
        ? this.clipGeneratedText(`${optionText}\n\nInstructor note: ${customNote}`)
        : optionText;
    }

    if (beforeAfter?.kind === 'case-cards') {
      const card = (payload.cards || []).find((item) => (
        String(item.id) === String(appliedSelection.caseId || '')
      ));
      const caseText = this.clipGeneratedText(card?.insertText || card?.previewText || card?.summary);
      if (!caseText) {
        const err = new Error('No case card was selected');
        err.code = 'INVALID_SELECTION';
        throw err;
      }
      return caseText;
    }

    return this.clipGeneratedText(beforeAfter?.after);
  }

  applyIssuePreviewToTextWithTrace(text, beforeAfter, selection = null) {
    if (!beforeAfter || !beforeAfter.kind || beforeAfter.kind === 'before-after') {
      const applied = this.applyBeforeAfterToTextWithTrace(text, beforeAfter);
      return { ...applied, appliedText: String(beforeAfter?.after || '').trim() };
    }

    const after = this.resolveStructuredIssueText(beforeAfter, selection);
    const structuredBeforeAfter = {
      kind: 'before-after',
      before: MISSING_SECTION_TEXT,
      after,
      payload: {
        source: 'missing-section',
        editAction: beforeAfter.payload?.editAction || (beforeAfter.payload?.insertAfterText ? 'insert_after' : 'append'),
        insertAfterText: beforeAfter.payload?.insertAfterText || null,
      }
    };
    const applied = this.applyBeforeAfterToTextWithTrace(text, structuredBeforeAfter);
    return { ...applied, appliedText: after };
  }

  markerAt(markup, index) {
    for (const marker of [REV_DEL_OPEN, REV_DEL_CLOSE, REV_ADD_OPEN, REV_ADD_CLOSE]) {
      if (markup.startsWith(marker, index)) return marker;
    }
    return null;
  }

  plainIndexToRevisionIndex(markup, plainIndex) {
    const target = Math.max(0, Number(plainIndex) || 0);
    let plain = 0;
    let i = 0;
    let inDeleted = false;

    while (i < markup.length) {
      const marker = this.markerAt(markup, i);
      if (marker) {
        if (marker === REV_DEL_OPEN) inDeleted = true;
        if (marker === REV_DEL_CLOSE) inDeleted = false;
        i += marker.length;
        continue;
      }

      if (!inDeleted) {
        if (plain === target) return i;
        plain += 1;
      }
      i += 1;
    }

    return plain === target ? markup.length : null;
  }

  revisionDiffToMarkup(before, after) {
    const oldText = String(before || '');
    const newText = String(after || '');

    if (!oldText) return newText ? `${REV_ADD_OPEN}${newText}${REV_ADD_CLOSE}` : '';
    if (!newText) return oldText ? `${REV_DEL_OPEN}${oldText}${REV_DEL_CLOSE}` : '';

    const diffs = this.diffMatchPatch.diff_main(oldText, newText);
    this.diffMatchPatch.diff_cleanupSemantic(diffs);

    return diffs.map(([op, value]) => {
      if (!value) return '';
      if (op === -1) return `${REV_DEL_OPEN}${value}${REV_DEL_CLOSE}`;
      if (op === 1) return `${REV_ADD_OPEN}${value}${REV_ADD_CLOSE}`;
      return value;
    }).join('');
  }

  refineRevisionMarkup(markup) {
    const source = String(markup || '');
    if (!source) return source;

    const replacementPair = new RegExp(
      `${this.escapeRegExp(REV_DEL_OPEN)}([\\s\\S]*?)${this.escapeRegExp(REV_DEL_CLOSE)}` +
      `${this.escapeRegExp(REV_ADD_OPEN)}([\\s\\S]*?)${this.escapeRegExp(REV_ADD_CLOSE)}`,
      'g'
    );

    return source.replace(replacementPair, (_match, before, after) => this.revisionDiffToMarkup(before, after));
  }

  applyBeforeAfterToRevisionMarkup(markup, trace) {
    const sourceMarkup = String(markup || '');
    if (!trace) return sourceMarkup;

    const start = this.plainIndexToRevisionIndex(sourceMarkup, trace.start);
    const end = this.plainIndexToRevisionIndex(sourceMarkup, trace.end);
    if (start === null || end === null || end < start) {
      const err = new Error('Cannot map accepted change to revision markup');
      err.code = 'STALE_REVISION_MARKUP';
      throw err;
    }

    const replacement = trace.action === 'replace'
      ? this.revisionDiffToMarkup(trace.before, trace.after)
      : `${REV_ADD_OPEN}${trace.after || ''}${REV_ADD_CLOSE}`;

    return `${sourceMarkup.slice(0, start)}${replacement}${sourceMarkup.slice(end)}`;
  }

  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  revisionMarkupToHtml(markup) {
    const source = String(markup || '');
    let html = '';
    let i = 0;

    while (i < source.length) {
      const marker = this.markerAt(source, i);
      if (marker) {
        if (marker === REV_DEL_OPEN) html += '<span class="rev-del">';
        else if (marker === REV_DEL_CLOSE) html += '</span>';
        else if (marker === REV_ADD_OPEN) html += '<span class="rev-add">';
        else if (marker === REV_ADD_CLOSE) html += '</span>';
        i += marker.length;
        continue;
      }
      html += this.escapeHtml(source[i]);
      i += 1;
    }

    return html;
  }

  buildRevisionMarkupFromAcceptedChanges(syllabus) {
    let cleanText = String(syllabus?.extractedText || '');
    let revisionMarkup = cleanText;
    let appliedCount = 0;

    for (const recommendation of syllabus?.recommendations || []) {
      if (recommendation?.decision !== 'accepted' || !recommendation.beforeAfter) continue;

      try {
        const applied = this.applyIssuePreviewToTextWithTrace(cleanText, recommendation.beforeAfter);
        revisionMarkup = this.applyBeforeAfterToRevisionMarkup(revisionMarkup, applied.trace);
        cleanText = applied.text;
        appliedCount += 1;
      } catch (err) {
        console.warn(`buildRevisionMarkupFromAcceptedChanges skipped ${recommendation.id || recommendation.title}:`, err.message);
      }
    }

    return appliedCount ? { revisionMarkup, editedText: cleanText } : null;
  }

  /**
   * Generate grounded Before/After payloads for all recommendations in one shared
   * model call. The chat still has a single-issue fallback for stale legacy data,
   * but fresh analyses should not spend one request per recommendation.
   */
  async pregenIssueMessages(syllabus, recommendations) {
    if (!Array.isArray(recommendations) || !recommendations.length) return recommendations;

    const beforeAfterRecommendations = recommendations.filter((recommendation) => (
      recommendation.category !== 'policy' && recommendation.category !== 'cases'
    ));

    if (beforeAfterRecommendations.length) {
      try {
        const generated = await this.generateIssueMessagesBatch(syllabus, beforeAfterRecommendations);
        for (const recommendation of beforeAfterRecommendations) {
          const beforeAfter = generated.get(String(recommendation.id || ''));
          if (beforeAfter) {
            recommendation.beforeAfter = beforeAfter;
          } else {
            console.warn(`pregenIssueMessages: no grounded preview returned for ${recommendation.id || recommendation.title}`);
          }
        }
      } catch (err) {
        console.error('pregenIssueMessages batch failed:', err.message);
      }
    }

    for (const recommendation of recommendations) {
      if (recommendation.beforeAfter) continue;
      try {
        if (recommendation.category === 'policy') {
          recommendation.beforeAfter = await this.generatePolicyChoicePreview(syllabus, recommendation);
        } else if (recommendation.category === 'cases') {
          recommendation.beforeAfter = await this.generateCaseCardsPreview(syllabus, recommendation);
        }
      } catch (err) {
        console.error(`pregenIssueMessages structured preview failed for ${recommendation.id || recommendation.title}:`, err.message);
      }
    }

    return recommendations;
  }

  /**
   * Generate a single grounded Before/After payload for the current syllabus text.
   * BEFORE is accepted only if it maps back to a real excerpt from the syllabus.
   */
  async generateIssueMessage(syllabus, recommendation) {
    if (recommendation.category === 'policy') {
      return this.generatePolicyChoicePreview(syllabus, recommendation);
    }
    if (recommendation.category === 'cases') {
      return this.generateCaseCardsPreview(syllabus, recommendation);
    }

    const syllabusText = this.getEditableSyllabusText(syllabus);
    const candidates = this.buildCandidateExcerpts(syllabusText, recommendation);
    if (!candidates.length) {
      throw new Error('Cannot generate Before/After without syllabus text');
    }

    const prompt = `You are Professor's Tutor, helping an MBA instructor revise one syllabus issue at a time.

You must ground the preview in the CURRENT SYLLABUS SOURCE EXCERPTS below.

Rules:
- Choose one source excerpt by id and set BEFORE to an exact contiguous quote copied from that excerpt.
- BEFORE should be the old syllabus text the instructor will see replaced. It may be a smaller contiguous part of the selected source excerpt, but it must be copied exactly.
- If the recommendation concerns a section that is truly missing, set sourceId to "missing", before to "${MISSING_SECTION_TEXT}", and after to the new drop-in section text.
- AFTER must be the revised syllabus text that directly replaces BEFORE, or the text to insert when the section is missing.
- Do not invent facts such as dates, grading weights, instructor names, or required readings that are not implied by the syllabus or recommendation.
- Keep AFTER concise and drop-in ready, usually 1-3 paragraphs.

RECOMMENDATION:
Category: ${recommendation.category || 'other'}
Priority: ${recommendation.priority || 'medium'}
Title: ${recommendation.title || 'Untitled recommendation'}
Description: ${recommendation.description || ''}

CURRENT SYLLABUS SOURCE EXCERPTS:
${candidates.map((candidate) => `SOURCE ${candidate.id}:\n"""${candidate.text}"""`).join('\n\n')}

Return only JSON:
{
  "sourceId": "s1 or missing",
  "before": "exact old text copied from the source, or ${MISSING_SECTION_TEXT}",
  "after": "replacement or insertion text",
  "editAction": "replace or append or insert_after",
  "insertAfterSourceId": "source id to insert after when missing, otherwise null"
}`;

    try {
      const resp = await this.createResponse({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You create grounded syllabus Before/After previews. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        text: { format: { type: 'json_object' } },
      });
      const parsed = this.safeParseJSON(resp.output_text || '{}') || {};
      return this.normalizeIssuePreview(parsed, candidates, syllabusText);
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

    const resp = await this.createResponse({
      model: this.llmModel,
      input: [
        { role: 'system', content: 'You are a focused, encouraging syllabus coach. Be brief and concrete.' },
        { role: 'user', content: prompt },
      ],
    });
    return (resp.output_text || '').trim();
  }

  /**
   * Render the syllabus PDF for preview and submission. When accepted changes
   * exist, the PDF uses track-changes markup: deletions in red strikethrough
   * and additions in green.
   * Returns the absolute file path. Caller is responsible for cleanup of preview PDFs.
   */
  async renderFinalSyllabusPdf(syllabus, destPath) {
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch {
      throw new Error('puppeteer is not installed');
    }

    const reconstructed = syllabus.revisionMarkup ? null : this.buildRevisionMarkupFromAcceptedChanges(syllabus);
    const revisionMarkup = this.refineRevisionMarkup(syllabus.revisionMarkup || reconstructed?.revisionMarkup || '');
    const text = revisionMarkup || syllabus.editedText || reconstructed?.editedText || syllabus.extractedText || '';
    const course = syllabus.course?.name || syllabus.title || 'Untitled Course';
    const instructor = `${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim();
    const program = syllabus.programId?.name || '';
    const bodyHtml = revisionMarkup
      ? this.revisionMarkupToHtml(text)
      : this.escapeHtml(text);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #111; margin: 40px; line-height: 1.55; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  .meta { font-size: 10pt; color: #555; margin-bottom: 24px; }
  .body { white-space: pre-wrap; }
  .rev-del { color: #b42318; text-decoration: line-through; text-decoration-thickness: 1.5px; background: #fff1f0; }
  .rev-add { color: #067647; background: #ecfdf3; font-weight: 600; }
</style>
</head>
<body>
<h1>${this.escapeHtml(course)}</h1>
<div class="meta">${this.escapeHtml(instructor)}${program ? ` &mdash; ${this.escapeHtml(program)}` : ''}</div>
<div class="body">${bodyHtml}</div>
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
    const recsForReport = syllabus.recommendations || [];
    const acceptedForReport = recsForReport.filter((r) => r.decision === 'accepted');
    const rejectedForReport = recsForReport.filter((r) => r.decision === 'rejected');
    const skippedForReport = recsForReport.filter((r) => r.decision === 'skipped' || r.decision === 'pending');
    const criticalForReport = recsForReport.filter((r) => r.priority === 'critical' || r.priority === 'high');
    const acceptedCriticalForReport = acceptedForReport.filter((r) => r.priority === 'critical' || r.priority === 'high');
    const formatReportItem = (r) => `  - ${r.title}${r.category ? ` (${this.getCategoryLabel(r.category)})` : ''}`;
    const reportLines = [
      `Course: ${syllabus.course?.name || syllabus.title}`,
      `Instructor: ${syllabus.instructor?.firstName || ''} ${syllabus.instructor?.lastName || ''}`.trim(),
      `Final PDF source: ${syllabus.editedText ? 'confirmed edited syllabus text' : 'original extracted syllabus text'}`,
      '',
      `Issues addressed: ${acceptedForReport.length} accepted, ${rejectedForReport.length} rejected, ${skippedForReport.length} skipped/pending`,
      '',
      'Critical/high items found:',
      ...(criticalForReport.length ? criticalForReport.map(formatReportItem) : ['  - None']),
      '',
      'Critical/high items fixed:',
      ...(acceptedCriticalForReport.length ? acceptedCriticalForReport.map(formatReportItem) : ['  - None']),
    ];
    if (rejectedForReport.length) {
      reportLines.push('', 'Items the instructor declined:', ...rejectedForReport.map(formatReportItem));
    }
    return reportLines.join('\n');
  }
}

module.exports = new AIService();
