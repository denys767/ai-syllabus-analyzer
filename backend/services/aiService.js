const fs = require('fs').promises;
const path = require('path');
const Syllabus = require('../models/Syllabus');
const StudentCluster = require('../models/StudentCluster');
const natural = require('natural');
const OpenAI = require('openai');
const puppeteer = require('puppeteer');
const DiffMatchPatch = require('diff-match-patch');

class AIService {
  constructor() {
    this.stemmer = natural.PorterStemmer;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.dmp = new DiffMatchPatch();
    
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

      const clusterContext = await this.getStudentClusterContext();
      const defaultClusterDetails = this.getDefaultClusterDetails();
      const clusterSummaryText = clusterContext?.summary || defaultClusterDetails.summary;
      const clusterQuarterLabel = clusterContext?.quarter || defaultClusterDetails.quarter;
      const clusterNameList = clusterContext?.nameList || defaultClusterDetails.nameList;
      const clusterContextBlock = `Student Cluster Context (Quarter: ${clusterQuarterLabel}):\n${clusterSummaryText}`;

      const analysis = await this.analyzeAgainstStandards(syllabus.extractedText);
      const plagiarismCheck = await this.checkPlagiarism(syllabus);
      
      let plagiarismRecommendations = [];
      if (plagiarismCheck.riskLevel === 'medium' || plagiarismCheck.riskLevel === 'high') {
        plagiarismRecommendations = await this.generateAntiPlagiarismRecommendations(syllabus, plagiarismCheck);
      }

      // Generate student cluster-specific recommendations
      const clusterRecommendations = await this.generateClusterRecommendations(syllabus.extractedText, clusterNameList, clusterSummaryText);

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
        recommendations: [...analysis.recommendations, ...plagiarismRecommendations, ...clusterRecommendations],
        vectorEmbedding: this.generateVectorEmbedding(syllabus.extractedText),
        status: 'analyzed'
      });

      // Auto-start AI Challenger after analysis
      try {
        console.log('🚀 Auto-starting AI Challenger...');
        await this.startPracticalChallenge(syllabusId);
      } catch (challengeError) {
        console.error('⚠️ AI Challenger auto-start failed (non-critical):', challengeError.message);
        // Don't fail the whole analysis if challenger fails
      }

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
4. **assessment** - Grading structure, assessment methods improvements
5. **other** - Any other improvements

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
      "category": "template-compliance" | "learning-objectives" | "content-quality" | "assessment" | "other",
      "title": "Short title",
      "description": "Detailed recommendation.",
      "priority": "critical" | "high" | "medium" | "low",
      "suggestedText": "Concrete text to add (optional)"
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
      suggestedText: rec.suggestedText || null,
      status: 'pending'
    }));

    return result;
  }

  async checkPlagiarism(currentSyllabus) {
    try {
      const otherSyllabi = await Syllabus.find({
        _id: { $ne: currentSyllabus._id },
        status: 'analyzed',
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
        groupTag: 'Збіг з попередніми силабусами',
        title: `Висока схожість із "${similar.title}" (${similar.similarity}%)`,
        description: `Рекомендується додати унікальні українські кейси та переформулювати контент для підвищення оригінальності.`,
        priority: plagiarismCheck.riskLevel === 'high' ? 'critical' : 'high',
        status: 'pending'
      });
    }
    return recommendations;
  }

  async generateClusterRecommendations(syllabusText, clusterNameList, clusterSummaryText) {
    try {
      console.log('🎯 Generating student cluster recommendations...');
      
      const prompt = `Analyze this MBA syllabus and generate specific recommendations for each student cluster.

SYLLABUS:
${syllabusText.substring(0, 3000)}

STUDENT CLUSTERS:
${clusterSummaryText}

For EACH cluster, generate ONE specific recommendation on how to make the course more relevant to their background.

Return JSON:
{
  "recommendations": [
    {
      "cluster": "cluster name",
      "title": "Short recommendation title (max 60 chars)",
      "description": "Specific suggestion mentioning a Ukrainian company/case relevant to this cluster (max 150 chars)",
      "priority": "medium"
    }
  ]
}

Generate recommendations for all clusters: ${clusterNameList}`;

      const response = await this.openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          { role: 'system', content: 'You are an MBA curriculum advisor. Generate practical, cluster-specific recommendations. Always return valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      const recommendations = (result.recommendations || []).map((rec, idx) => ({
        id: `cluster_${Date.now()}_${idx}`,
        category: 'student-clusters',
        groupTag: `Рекомендації для ${rec.cluster}`,
        title: rec.title || `Recommendation for ${rec.cluster}`,
        description: rec.description || 'No description provided',
        priority: rec.priority || 'medium',
        status: 'pending'
      }));

      console.log(`✅ Generated ${recommendations.length} cluster recommendations`);
      return recommendations;
    } catch (error) {
      console.error('❌ Cluster recommendations error:', error.message);
      return [];
    }
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

  async generateDiffPdf(syllabusId) {
    let browser;
    try {
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) throw new Error('Syllabus not found');

      const accepted = syllabus.recommendations.filter(r => r.status === 'accepted');
      if (accepted.length === 0) throw new Error('No accepted recommendations');

      const editedSyllabus = await this.applyRecommendationsWithLLM(syllabus.extractedText, accepted);
      const html = this.generateDiffHtml(syllabus.extractedText, editedSyllabus.modifiedText, editedSyllabus.changes, syllabus);

      const uploadDir = path.join(__dirname, '../uploads/syllabi');
      await fs.mkdir(uploadDir, { recursive: true });

      const filename = `syllabus-edited-${Date.now()}.pdf`;
      const pdfPath = path.join(uploadDir, filename);

      browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({ format: 'A4', path: pdfPath, printBackground: true });
      await browser.close();
      browser = null;

      const stats = await fs.stat(pdfPath);

      if (syllabus.editedPdf?.path) {
        try { await fs.unlink(syllabus.editedPdf.path); } catch {}
      }

      syllabus.editedPdf = {
        filename,
        originalName: filename,
        path: pdfPath,
        size: stats.size,
        generatedAt: new Date(),
        mimetype: 'application/pdf'
      };
      syllabus.editedText = editedSyllabus.modifiedText;
      syllabus.editingStatus = 'ready';
      await syllabus.save();

      return syllabus.editedPdf;
    } catch (error) {
      console.error('PDF generation error:', error);
      await Syllabus.findByIdAndUpdate(syllabusId, { editingStatus: 'error', editingError: error.message.slice(0, 280) });
      throw error;
    } finally {
      if (browser) try { await browser.close(); } catch {}
    }
  }

  async applyRecommendationsWithLLM(originalText, recommendations) {
    console.log('\n=== APPLYING RECOMMENDATIONS (OPTIMIZED) ===');
    console.log('📊 Recommendations:', recommendations.length);
    console.log('📄 Original text length:', originalText.length);

    // Group recommendations by category for more efficient processing
    const groupedRecs = this.groupRecommendationsByCategory(recommendations);
    
    // ONE LLM request for ALL recommendations at once
    const prompt = `You are editing an MBA syllabus. Apply ALL recommendations below in one pass.

ORIGINAL SYLLABUS TEXT:
${originalText}

RECOMMENDATIONS TO APPLY (${recommendations.length} total):
${recommendations.map((rec, idx) => `
${idx + 1}. [${rec.category}] ${rec.title}
   Description: ${rec.description}
   ${rec.suggestedText ? `Suggested text: ${rec.suggestedText}` : ''}
`).join('\n')}

MBA-27 LEARNING OUTCOMES REFERENCE:
${this.learningObjectives.map((lo, idx) => `LO${idx + 1}: ${lo.text}`).join('\n')}

Return JSON:
{
  "editedText": "the complete edited syllabus with ALL changes applied seamlessly - NO meta-text, NO recommendation labels, ONLY the natural syllabus content",
  "changes": [
    {
      "recommendation": "recommendation title",
      "location": "where in document (e.g., 'Learning Outcomes section, paragraph 3')",
      "action": "what was done (e.g., 'Added specific assessment criteria')",
      "textAdded": "brief snippet of what was added/changed (max 100 chars)"
    }
  ]
}

Return the FULL edited text with changes applied naturally.`;

    console.log('🚀 Sending ONE request for all recommendations...');
    
    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        { 
          role: 'system', 
          content: 'You are a professional academic editor for MBA syllabi. You apply multiple edits contextually and inline, maintaining document flow. Return only valid JSON.' 
        },
        { role: 'user', content: prompt }
      ],
      text: { format: { type: 'json_object' } }
    });

    const result = this.safeParseJSON(response.output_text || '{}');
    
    if (!result || !result.editedText) {
      console.error('❌ LLM did not return edited text');
      throw new Error('Failed to generate edited syllabus');
    }

    const modifiedText = result.editedText;
    const changes = (result.changes || []).map(c => ({
      recommendation: c.recommendation || 'Unknown',
      section: c.location || 'Unknown location',
      change: c.action || 'No description',
      preview: c.textAdded || ''
    }));

    console.log(`\n✅ Successfully applied changes`);
    console.log(`📊 Changes documented: ${changes.length}`);
    console.log(`📄 New text length: ${modifiedText.length} chars (was: ${originalText.length})`);
    console.log(`📈 Change: ${modifiedText.length > originalText.length ? '+' : ''}${modifiedText.length - originalText.length} chars`);
    console.log('=== COMPLETED ===\n');

    return { modifiedText, changes };
  }

  groupRecommendationsByCategory(recommendations) {
    const grouped = {};
    for (const rec of recommendations) {
      const cat = rec.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(rec);
    }
    return grouped;
  }

  generateDiffHtml(originalText, modifiedText, changes, syllabus) {
    const escapeHtml = (text) => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Використовуємо diff-match-patch для генерації детального diff
    const diffs = this.dmp.diff_main(originalText, modifiedText);
    this.dmp.diff_cleanupSemantic(diffs);
    
    // Створюємо diff HTML з мітками рекомендацій
    const diffSegments = [];
    let charCount = { added: 0, removed: 0, same: 0 };
    
    for (const [op, data] of diffs) {
      const safe = escapeHtml(data).replace(/\n/g, '<br>');
      
      if (op === 0) { // Unchanged
        charCount.same += data.length;
        // Show only first/last N characters to save space if block is very large
        if (data.length > 500) {
          const preview = escapeHtml(data.substring(0, 200)).replace(/\n/g, '<br>');
          const previewEnd = escapeHtml(data.substring(data.length - 100)).replace(/\n/g, '<br>');
          diffSegments.push(`<span class="diff-same">${preview}</span><span class="diff-ellipsis" title="Skipped ${data.length - 300} unchanged characters">... (${data.length - 300} chars unchanged) ...</span><span class="diff-same">${previewEnd}</span>`);
        } else {
          diffSegments.push(`<span class="diff-same">${safe}</span>`);
        }
      } else if (op === -1) { // Removed
        charCount.removed += data.length;
        diffSegments.push(`<span class="diff-remove">${safe}</span>`);
      } else if (op === 1) { // Added
        charCount.added += data.length;
        diffSegments.push(`<span class="diff-add">${safe}</span>`);
      }
    }
    
    const diffHtml = diffSegments.join('');
    
    // Створюємо список рекомендацій з їх змінами
    const accepted = syllabus.recommendations.filter(r => r.status === 'accepted');
    const recommendationsHtml = accepted.map((rec, index) => {
      const change = changes.find(c => 
        c.recommendation === rec.title || 
        c.recommendation.includes(rec.title) ||
        rec.title.includes(c.recommendation)
      );
      const hasChange = change ? '✅' : '📝';
      
      return `
        <li class="recommendation-item ${change ? 'applied' : 'documented'}">
          <div class="rec-header">
            <span class="rec-status">${hasChange}</span>
            <span class="rec-cat">${escapeHtml(rec.category)}</span>
            <span class="rec-title">${escapeHtml(rec.title || '')}</span>
          </div>
          <div class="rec-desc">${escapeHtml(rec.description || '')}</div>
          ${change ? `
            <div class="rec-change">
              <strong>📍 Location:</strong> ${escapeHtml(change.section)}<br>
              <strong>✏️ Action:</strong> ${escapeHtml(change.change)}
              ${change.preview ? `<br><strong>💬 Added:</strong> "${escapeHtml(change.preview)}..."` : ''}
            </div>
          ` : `
            <div class="rec-note">
              📝 This change was applied to the syllabus text inline
            </div>
          `}
          ${rec.suggestedText ? `
            <details class="rec-suggested">
              <summary>💡 Suggested Text</summary>
              <div class="suggested-content">${escapeHtml(rec.suggestedText)}</div>
            </details>
          ` : ''}
        </li>`;
    }).join('');

    const now = new Date();
    const header = syllabus.course?.name || syllabus.title || 'Syllabus';
    const statsHtml = `
      <div class="diff-stats">
        <div class="stat-item stat-added">
          <span class="stat-label">Added</span>
          <span class="stat-value">+${charCount.added}</span>
        </div>
        <div class="stat-item stat-removed">
          <span class="stat-label">Removed</span>
          <span class="stat-value">-${charCount.removed}</span>
        </div>
        <div class="stat-item stat-total">
          <span class="stat-label">Changes</span>
          <span class="stat-value">${changes.length}</span>
        </div>
      </div>
    `;
    
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Syllabus Editing: ${escapeHtml(header)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto', sans-serif; 
        padding: 48px 56px; 
        color: #1a202c; 
        background: #f7fafc; 
        line-height: 1.6; 
      }
      
      .header {
        margin-bottom: 48px;
        padding-bottom: 24px;
        border-bottom: 3px solid #4299e1;
      }
      
      h1 { 
        font-size: 32px; 
        margin-bottom: 12px; 
        color: #1a202c; 
        font-weight: 700;
      }
      
      .meta { 
        color: #718096; 
        font-size: 14px; 
        display: flex;
        gap: 24px;
        align-items: center;
      }
      
      .meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      h2 { 
        font-size: 24px; 
        margin: 48px 0 24px; 
        color: #2d3748; 
        border-bottom: 2px solid #e2e8f0; 
        padding-bottom: 12px;
        font-weight: 600;
      }
      
      .diff-stats {
        display: flex;
        gap: 24px;
        margin: 32px 0;
        padding: 24px;
        background: white;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
      }
      
      .stat-item {
        flex: 1;
        text-align: center;
        padding: 16px;
        border-radius: 8px;
      }
      
      .stat-item.stat-added { background: #c6f6d5; }
      .stat-item.stat-removed { background: #fed7d7; }
      .stat-item.stat-total { background: #bee3f8; }
      
      .stat-label {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #2d3748;
        margin-bottom: 8px;
        font-weight: 600;
      }
      
      .stat-value {
        display: block;
        font-size: 28px;
        font-weight: 700;
        color: #1a202c;
      }
      
      .legend { 
        margin: 32px 0; 
        padding: 24px; 
        background: white; 
        border-radius: 12px; 
        border: 1px solid #e2e8f0; 
        display: flex; 
        gap: 32px; 
        flex-wrap: wrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      
      .legend-item { 
        display: flex; 
        align-items: center; 
        gap: 10px; 
        font-weight: 600;
        font-size: 14px;
        color: #2d3748;
      }
      
      .legend-item::before { 
        content: ""; 
        width: 20px; 
        height: 20px; 
        border-radius: 4px; 
        display: block;
      }
      
      .legend .add::before { background: #48bb78; }
      .legend .remove::before { background: #f56565; }
      .legend .same::before { background: #a0aec0; }
      
      /* Рекомендації */
      ul.recommendations { 
        list-style: none; 
        padding: 0; 
        margin: 0 0 48px 0; 
      }
      
      .recommendation-item { 
        margin-bottom: 24px; 
        padding: 24px; 
        border-radius: 12px; 
        border: 1px solid #e2e8f0; 
        background: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        transition: box-shadow 0.2s;
      }
      
      .recommendation-item.applied {
        border-left: 4px solid #48bb78;
      }
      
      .recommendation-item.documented {
        border-left: 4px solid #4299e1;
      }
      
      .recommendation-item:hover {
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
      
      .rec-header { 
        display: flex; 
        align-items: center; 
        gap: 12px; 
        margin-bottom: 12px; 
      }
      
      .rec-status { 
        font-size: 20px; 
        line-height: 1;
      }
      
      .rec-cat { 
        text-transform: uppercase; 
        font-size: 11px; 
        letter-spacing: 0.05em; 
        color: #667eea; 
        font-weight: 700; 
        background: #eef2ff; 
        padding: 6px 12px; 
        border-radius: 8px; 
      }
      
      .rec-title { 
        font-weight: 600; 
        font-size: 17px; 
        color: #1a202c; 
        flex: 1; 
      }
      
      .rec-desc { 
        font-size: 15px; 
        color: #4a5568; 
        margin-bottom: 12px; 
        line-height: 1.6;
      }
      
      .rec-change {
        margin-top: 12px;
        padding: 16px;
        background: #e6fffa;
        border-left: 4px solid #38b2ac;
        border-radius: 6px;
        font-size: 14px;
        color: #234e52;
        line-height: 1.6;
      }
      
      .rec-change strong {
        color: #1a202c;
        font-weight: 600;
        display: inline-block;
        margin-right: 4px;
      }
      
      .rec-warning {
        margin-top: 12px;
        padding: 16px;
        background: #fffbeb;
        border-left: 4px solid #f59e0b;
        border-radius: 6px;
        font-size: 14px;
        color: #78350f;
        font-weight: 500;
      }
      
      .rec-note {
        margin-top: 12px;
        padding: 16px;
        background: #e6f7ff;
        border-left: 4px solid #4299e1;
        border-radius: 6px;
        font-size: 14px;
        color: #1e3a8a;
        font-weight: 400;
      }
      
      .rec-suggested {
        margin-top: 12px;
      }
      
      .rec-suggested summary { 
        cursor: pointer; 
        font-size: 14px; 
        color: #667eea; 
        font-weight: 600; 
        padding: 12px 16px;
        background: #f7fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        transition: all 0.2s;
      }
      
      .rec-suggested summary:hover {
        background: #edf2f7;
        border-color: #cbd5e0;
      }
      
      .suggested-content { 
        margin-top: 8px; 
        padding: 16px; 
        border-radius: 8px; 
        font-size: 14px; 
        background: #fffbeb;
        border: 2px solid #fbbf24;
        color: #78350f;
        font-family: 'Monaco', 'Courier New', monospace;
        white-space: pre-wrap;
        line-height: 1.6;
      }
      
      /* Diff текст */
      .diff-wrapper { 
        margin-top: 32px; 
        background: white; 
        border-radius: 12px; 
        border: 1px solid #e2e8f0; 
        padding: 32px 40px; 
        line-height: 1.8; 
        font-size: 15px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
      }
      
      .diff-add { 
        background: #c6f6d5; 
        color: #22543d; 
        border-radius: 3px; 
        padding: 2px 4px; 
        margin: 0 1px; 
        display: inline;
        font-weight: 500;
      }
      
      .diff-remove { 
        background: #fed7d7; 
        color: #742a2a; 
        text-decoration: line-through; 
        border-radius: 3px; 
        padding: 2px 4px; 
        margin: 0 1px; 
        display: inline;
      }
      
      .diff-same { 
        color: #2d3748;
      }
      
      .diff-ellipsis {
        display: inline-block;
        margin: 0 8px;
        padding: 4px 12px;
        background: #edf2f7;
        border-radius: 6px;
        font-size: 13px;
        color: #718096;
        font-style: italic;
        cursor: help;
      }
      
      .footer-note {
        margin-top: 48px;
        padding: 24px;
        background: #edf2f7;
        border-radius: 12px;
        font-size: 14px;
        color: #4a5568;
        line-height: 1.8;
      }
      
      .footer-note strong {
        color: #2d3748;
        font-weight: 600;
      }
      
      @media print {
        body { padding: 24px; background: white; }
        .recommendation-item { page-break-inside: avoid; }
        .diff-ellipsis { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Syllabus redacting: ${escapeHtml(header)}</h1>
      <div class="meta">
        <div class="meta-item">
          <span>📅</span>
          <span>${escapeHtml(now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }))}</span>
        </div>
        <div class="meta-item">
          <span>📊</span>
          <span>Implemented changes: ${changes.length} of ${accepted.length}</span>
        </div>
      </div>
    </div>
    
    ${statsHtml}
    
    <div class="legend">
      <span class="legend-item add">Added</span>
      <span class="legend-item remove">Removed</span>
      <span class="legend-item same">Unchanged</span>
    </div>
    
    <h2>Accepted recommendations and their realisation:</h2>
    <ul class="recommendations">
      ${recommendationsHtml || '<li class="recommendation-item"><div class="rec-desc">No accepted recommendations found</div></li>'}
    </ul>
    
    <div style="page-break-before: always; margin-top: 48px;">
      <h2>Final edited syllabus text:</h2>
      <div style="margin-top: 24px; padding: 32px; background: white; border: 2px solid #e2e8f0; border-radius: 12px; line-height: 1.8; color: #2d3748; white-space: pre-wrap; font-size: 15px;">${escapeHtml(modifiedText)}</div>
    </div>

    <h2>Text with changes (comparison view):</h2>
    <div class="diff-wrapper">${diffHtml}</div>
  </body>
</html>`;
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
      'template-compliance': 'Відповідність до шаблону',
      'learning-objectives': 'Відповідність до learning outcomes',
      'content-quality': 'Якість контенту',
      'assessment': 'Оцінювання',
      'policy': 'Політики курсу',
      'plagiarism': 'Збіг з попередніми силабусами',
      'student-clusters': 'Інтеграція прикладів для кластеру студентів',
      'other': 'Інше'
    };
    return labels[category] || 'Інше';
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

  normalizeScore(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const clamped = Math.min(100, Math.max(0, num));
    // keep one decimal for readability
    return Math.round(clamped * 10) / 10;
  }

  // AI Challenger methods
  async startPracticalChallenge(syllabusId) {
    try {
      console.log('\n=== AI CHALLENGER: START ===');
      console.log('📄 Syllabus ID:', syllabusId);
      
      const syllabus = await Syllabus.findById(syllabusId).select('extractedText analysis');
      if (!syllabus) throw new Error('Syllabus not found');

      const clusterContext = await this.getStudentClusterContext();
      const defaultClusterDetails = this.getDefaultClusterDetails();
      const clusterSummaryText = clusterContext?.summary || defaultClusterDetails.summary;
      const clusterQuarterLabel = clusterContext?.quarter || defaultClusterDetails.quarter;

      console.log('📊 Analysis available:', !!syllabus.analysis);
      console.log('📄 Syllabus text length:', syllabus.extractedText?.length || 0, 'characters');

      const prompt = `
Generate ONE short, simple question (max 2 sentences) asking the instructor how they will make this course practical.

Course topic from syllabus:
${syllabus.extractedText.substring(0, 1500)}

Student groups: ${clusterQuarterLabel}

The question should be:
- Simple and direct (not academic or complex)
- Ask about ONE specific practical activity (case study, exercise, or project)
- Easy to answer in 2-3 sentences

Example good questions:
- "What real company example will you use to teach pricing strategies?"
- "How will students practice negotiation skills in class?"
- "What hands-on exercise will help students understand financial modeling?"

Generate ONLY the question, nothing else.
      `;

      console.log('📝 Prompt length:', prompt.length, 'characters');

      const startTime = Date.now();
      const response = await this.openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          { role: 'system', content: 'You are an expert MBA academic advisor specializing in practical, student-centered pedagogy. You help instructors integrate real business cases, address diverse student backgrounds, and implement interactive teaching methods.' },
          { role: 'user', content: prompt }
        ]
      });
      const endTime = Date.now();

      console.log('⏱️ Question generation time:', endTime - startTime, 'ms');

      const initialQuestion = (response.choices[0]?.message?.content || '').trim();
      console.log('❓ Generated question length:', initialQuestion.length, 'characters');

      await Syllabus.findByIdAndUpdate(syllabusId, {
        'practicalChallenge.initialQuestion': initialQuestion,
        'practicalChallenge.status': 'pending',
        'practicalChallenge.discussion': []
      });

      console.log('💾 Question saved to database');
      console.log('=== AI CHALLENGER START COMPLETED ===\n');

      return initialQuestion;
    } catch (error) {
      console.error('❌ AI Challenger start error:', error.message);
      console.log('=== AI CHALLENGER START FAILED ===\n');
      throw error;
    }
  }

  async respondToChallenge(syllabusId, instructorResponse) {
    try {
      console.log('\n=== AI CHALLENGER: RESPOND ===');
      console.log('📄 Syllabus ID:', syllabusId);
      console.log('👨‍🏫 Instructor response length:', instructorResponse?.length || 0, 'characters');
      
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) throw new Error('Syllabus not found');

      if (!syllabus.practicalChallenge?.initialQuestion) {
        throw new Error('AI challenge has not been started for this syllabus');
      }

      const previousDiscussion = Array.isArray(syllabus.practicalChallenge?.discussion)
        ? [...syllabus.practicalChallenge.discussion]
        : [];

      console.log('💬 Previous exchanges:', previousDiscussion.length);

      // Ensure cluster context helpers exist for prompt building
      const clusterContext = await this.getStudentClusterContext();
      const defaultClusterDetails = this.getDefaultClusterDetails();
      const clusterSummaryText = clusterContext?.summary || defaultClusterDetails.summary;
      const clusterQuarterLabel = clusterContext?.quarter || defaultClusterDetails.quarter;
      const clusterNameList = clusterContext?.nameList || defaultClusterDetails.nameList;
      const clusterContextBlock = `Student Cluster Context (Quarter: ${clusterQuarterLabel}):\n${clusterSummaryText}`;

      const discussionHistory = previousDiscussion.map(d => 
        `Instructor: ${d.instructorResponse}\nAI: ${d.aiResponse}`
      ).join('\n\n');

      const prompt = `
        You are an expert MBA academic advisor analyzing an instructor's approach to practical teaching.
        
        Your goal is to provide constructive feedback that helps them improve in THREE KEY AREAS:
        
        1. **Real Cases & Practical Tasks**: Suggest concrete business cases (prioritize Ukrainian examples), simulations, hands-on projects
        2. **Student Cluster Relevance**: Ensure activities address needs of the current cohorts (${clusterNameList})
        3. **Interactive Methods**: Promote discussions, group projects, peer-to-peer learning, workshops
        
        Context:
        ${clusterContextBlock}
        - Initial Question: ${syllabus.practicalChallenge.initialQuestion}
        - Discussion History:
        ${discussionHistory}
        - Instructor's Latest Response: "${instructorResponse}"

          Task:
          Generate a response in English that:
          1. Acknowledges what the instructor said (briefly)
          2. Provides 2-3 SPECIFIC suggestions covering the three key areas above:
            - Real Ukrainian business cases or practical exercises
            - How each student cluster (${clusterNameList}) can benefit
            - Interactive/collaborative teaching methods
          3. Ends with a concise call-to-action or encouragement. Do NOT ask any additional questions.

          Be concrete, actionable, and professional. Focus on Ukrainian business context where relevant.
      `;

      console.log('📝 Prompt length:', prompt.length, 'characters');

      const startTime = Date.now();
      const response = await this.openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          { role: 'system', content: `You are an expert MBA academic advisor. You provide specific, actionable feedback to instructors focusing on: 1) Real business cases (Ukrainian context prioritized), 2) Diverse student needs (current student clusters: ${clusterNameList}), 3) Interactive teaching methods.` },
          { role: 'user', content: prompt }
        ]
      });
      const endTime = Date.now();

      console.log('⏱️ AI response time:', endTime - startTime, 'ms');

      const aiResponse = (response.choices[0]?.message?.content || '').trim();
      console.log('📥 AI response length:', aiResponse.length, 'characters');

      // Add to discussion history
      const discussionEntry = {
        instructorResponse,
        aiResponse,
        respondedAt: new Date()
      };

      if (!Array.isArray(syllabus.practicalChallenge.discussion)) {
        syllabus.practicalChallenge.discussion = [];
      }
      syllabus.practicalChallenge.discussion.push(discussionEntry);
      syllabus.practicalChallenge.status = 'completed';
      syllabus.practicalChallenge.completedAt = new Date();

      const updatedDiscussion = [...previousDiscussion, discussionEntry];

      // Generate Practicality recommendations once the instructor responds
      let newRecommendations = [];
      if (updatedDiscussion.length > 0) {
        console.log('\n--- GENERATING PRACTICALITY RECOMMENDATIONS ---');
        try {
          const recPrompt = `Analyze the AI ⇄ Instructor dialog and produce practicality insights tied directly to:
- The latest instructor answer: "${instructorResponse}"
- Current student clusters (${clusterNameList}) and their needs
- Ukrainian business context for real cases

Each recommendation must explicitly mention:
1. At least one student cluster from this list: ${clusterNameList}
2. A Ukrainian company, sector, or case idea that fits that cluster
3. An interactive delivery format (discussion, workshop, simulation, etc.)

Student Cluster Context:
${clusterContextBlock}

Return JSON format:
{
  "score": number, // 0-100 integer practicality & interactivity score after considering the latest instructor response
  "critique": "1-3 sentences referencing the instructor answer, clusters, and Ukrainian practicality context",
  "recommendations": [
    {
      "category": "practicality", // Category MUST be "practicality"
      "priority": "low" | "medium" | "high",
      "title": "Short actionable title (max 80 chars)",
      "description": "Describe the practical idea, naming the cluster and Ukrainian case (max 160 chars)",
      "suggestedText": "Optional concrete text to add to syllabus"
    }
  ]
}

Discussion Transcript:
${updatedDiscussion.map(d => `Instructor: ${d.instructorResponse}\nAI: ${d.aiResponse}`).join('\n\n')}

Return ONLY valid JSON.`;

          const recResp = await this.openai.chat.completions.create({
            model: this.llmModel,
            messages: [
              { role: 'system', content: `You extract actionable recommendations from teaching discussions. Focus on: real cases, student cluster needs (${clusterNameList}), and interactive methods. Return only valid JSON.` },
              { role: 'user', content: recPrompt }
            ],
            response_format: { type: 'json_object' }
          });
          
          const rawRec = (recResp.choices[0]?.message?.content || '').trim();
          console.log('📥 Raw recommendation extraction:', rawRec.substring(0, 200));
          
          const parsed = JSON.parse(rawRec);
          const practicalityScore = this.normalizeScore(parsed.score ?? parsed.practicalityScore);
          const practicalityCritique = typeof parsed.critique === 'string' ? parsed.critique.trim() : '';

          if (Number.isFinite(practicalityScore)) {
            syllabus.practicalChallenge.practicalityScore = practicalityScore;
          }
          if (practicalityCritique) {
            syllabus.practicalChallenge.practicalityCritique = practicalityCritique.slice(0, 600);
          }

          if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
            newRecommendations = parsed.recommendations.map((rec, idx) => ({
              id: `rec_ai_challenger_${Date.now()}_${idx}`,
              category: 'practicality',
              priority: rec.priority || 'medium',
              title: rec.title || 'Practical improvement',
              description: rec.description || '',
              suggestedText: rec.suggestedText || '',
              status: 'pending',
              source: 'ai-challenger'
            }));
            
            // Add to syllabus recommendations
            if (!Array.isArray(syllabus.recommendations)) {
              syllabus.recommendations = [];
            }
            syllabus.recommendations.push(...newRecommendations);
            const suggestionEntries = newRecommendations.map(rec => ({
              title: rec.title,
              suggestion: rec.description || rec.title,
              category: rec.category,
              priority: rec.priority,
              createdAt: new Date()
            }));

            if (!Array.isArray(syllabus.practicalChallenge.aiSuggestions)) {
              syllabus.practicalChallenge.aiSuggestions = [];
            }
            const combinedSuggestions = [...syllabus.practicalChallenge.aiSuggestions, ...suggestionEntries];
            // Keep latest 10 suggestions to avoid unbounded growth
            syllabus.practicalChallenge.aiSuggestions = combinedSuggestions.slice(-10);
            
            console.log('✅ Generated', newRecommendations.length, 'practicality recommendations');
          }
        } catch (recError) {
          console.error('⚠️ Recommendation extraction error:', recError.message);
        }
      }

      await syllabus.save();
      
      console.log('💾 Discussion saved to database');
      console.log('💬 Total exchanges:', syllabus.practicalChallenge.discussion.length);
      console.log('=== AI CHALLENGER RESPOND COMPLETED ===\n');

      return {
        aiResponse,
        newRecommendations,
        updatedChallenge: syllabus.practicalChallenge
      };
    } catch (error) {
      console.error('❌ AI Challenger respond error:', error.message);
      console.log('=== AI CHALLENGER RESPOND FAILED ===\n');
      throw error;
    }
  }
}

module.exports = new AIService();
