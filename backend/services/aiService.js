const path = require('path');
const fs = require('fs');
const Syllabus = require('../models/Syllabus');
const StudentCluster = require('../models/StudentCluster');
const natural = require('natural');
const OpenAI = require('openai');

const MISSING_SECTION_TEXT = '(missing section)';
const MAX_BEFORE_AFTER_CHARS = 1800;
const MAX_SOURCE_EXCERPT_CHARS = 1400;
const SOURCE_EXCERPT_COUNT = 12;

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
      'student-clusters': ['case', 'cases', 'students', 'cluster', 'audience', 'schedule'],
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
          return `${source.slice(0, anchorRange.end).trimEnd()}\n\n${after}${source.slice(anchorRange.end)}`;
        }
      }
      return `${source.trimEnd()}${source.trim() ? '\n\n' : ''}${after}`;
    }

    const range = this.findTextRange(source, before, beforeAfter?.payload?.beforeStart);
    if (!range) {
      const err = new Error('The BEFORE excerpt no longer matches the current syllabus text');
      err.code = 'STALE_BEFORE_AFTER';
      throw err;
    }

    return `${source.slice(0, range.start)}${after}${source.slice(range.end)}`;
  }

  /**
   * Generate grounded Before/After payloads for every recommendation using the same
   * single-issue path the chat uses for cache misses.
   */
  async pregenIssueMessages(syllabus, recommendations) {
    if (!Array.isArray(recommendations) || !recommendations.length) return recommendations;

    for (const recommendation of recommendations) {
      try {
        recommendation.beforeAfter = await this.generateIssueMessage(syllabus, recommendation);
      } catch (err) {
        console.error(`pregenIssueMessages failed for ${recommendation.id || recommendation.title}:`, err.message);
      }
    }
    return recommendations;
  }

  /**
   * Generate a single grounded Before/After payload for the current syllabus text.
   * BEFORE is accepted only if it maps back to a real excerpt from the syllabus.
   */
  async generateIssueMessage(syllabus, recommendation) {
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
      const resp = await this.openai.responses.create({
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
