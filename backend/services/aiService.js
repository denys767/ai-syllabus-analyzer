const fs = require('fs').promises;
const path = require('path');
const Syllabus = require('../models/Syllabus');
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

      const analysis = await this.analyzeAgainstStandards(syllabus.extractedText);
      const plagiarismCheck = await this.checkPlagiarism(syllabus);
      
      let plagiarismRecommendations = [];
      if (plagiarismCheck.riskLevel === 'medium' || plagiarismCheck.riskLevel === 'high') {
        plagiarismRecommendations = await this.generateAntiPlagiarismRecommendations(syllabus, plagiarismCheck);
      }

      // Convert recommendations arrays to strings for schema compatibility
      const convertRecommendationsToStrings = (recs) => {
        if (!Array.isArray(recs)) return [];
        return recs.map(rec => {
          if (typeof rec === 'string') return rec;
          // If it's an object, convert to string description
          return rec.description || rec.title || JSON.stringify(rec);
        });
      };

      const loAlignment = analysis.learningObjectivesAlignment || {};
      const tcCompliance = analysis.templateCompliance || {};

      await Syllabus.findByIdAndUpdate(syllabusId, {
        structure: analysis.structure,
        analysis: {
          templateCompliance: {
            ...tcCompliance,
            recommendations: convertRecommendationsToStrings(tcCompliance.recommendations)
          },
          learningObjectivesAlignment: {
            ...loAlignment,
            recommendations: convertRecommendationsToStrings(loAlignment.recommendations)
          },
          plagiarismCheck: plagiarismCheck
        },
        recommendations: [...analysis.recommendations, ...plagiarismRecommendations],
        vectorEmbedding: this.generateVectorEmbedding(syllabus.extractedText),
        status: 'analyzed'
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

**MBA-27 LEARNING OBJECTIVES (ALL COURSES MUST ALIGN):**
${this.learningObjectives.map((lo, idx) => `LO${idx + 1}: ${lo.text}`).join('\n')}

**SYLLABUS TO ANALYZE:**
${syllabusText}

**TASK:**
Analyze the syllabus and provide recommendations in the following categories:
1. **template-compliance** - Missing sections, formatting issues compared to template
2. **learning-objectives** - Which LOs are covered/missing, how to improve alignment. Use format "LO1 (brief summary)" when referring to objectives.
3. **content-quality** - Content depth, relevance, clarity improvements
4. **assessment** - Grading structure, assessment methods improvements
5. **other** - Any other improvements

**IMPORTANT:** When referring to Learning Objectives in recommendations:
- Use this format: "LO1 (adaptive leadership)", "LO3 (AI-driven tools)", etc.
- Include a brief summary of each LO after its number
- This helps instructors quickly understand which objective is being referenced

Return JSON with this exact structure:
{
  "structure": {
    "hasSummary": boolean,
    "hasSchedule": boolean,
    "hasGrading": boolean,
    "hasMaterials": boolean,
    "hasPolicies": boolean
  },
  "templateCompliance": {
    "score": number (0-100),
    "missingSections": string[],
    "suggestions": string[]
  },
  "learningObjectivesAlignment": {
    "alignedObjectives": string[], // Use format "LO1 (brief summary)"
    "missingObjectives": string[], // Use format "LO1 (brief summary)"
    "alignmentScore": number (0-100),
    "recommendations": string[]
  },
  "recommendations": [
    {
      "category": "template-compliance" | "learning-objectives" | "content-quality" | "assessment" | "other",
      "title": "Short title",
      "description": "Detailed recommendation. Reference LOs as 'LO1 (adaptive leadership)' format.",
      "priority": "critical" | "high" | "medium" | "low",
      "suggestedText": "Concrete text to add (optional)"
    }
  ]
}`;
    
    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        { role: 'system', content: 'You are an expert MBA syllabus analyzer for KSE Business School. Always return valid JSON. When referencing Learning Objectives, use format "LO1 (brief summary)" for clarity.' },
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
    console.log('\n=== ЗАСТОСУВАННЯ РЕКОМЕНДАЦІЙ (ТОЧКОВИЙ ПІДХІД З LLM) ===');
    console.log('📊 Рекомендацій:', recommendations.length);
    console.log('📄 Довжина тексту:', originalText.length);

    let modifiedText = originalText;
    const changes = [];

    // Обробляємо кожну рекомендацію окремо
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      console.log(`\n--- Рекомендація ${i + 1}/${recommendations.length}: ${rec.title} ---`);

      // Крок 1: LLM знаходить де саме в тексті потрібні зміни
      const locationPrompt = `Analyze this MBA syllabus and find WHERE this recommendation should be applied.

SYLLABUS (${modifiedText.length} chars):
${modifiedText.substring(0, 8000)}${modifiedText.length > 8000 ? '\n...(text truncated)...' : ''}

RECOMMENDATION:
Title: ${rec.title}
Category: ${rec.category}
Description: ${rec.description}
${rec.suggestedText ? `Suggested text: ${rec.suggestedText}` : ''}

Return JSON:
{
  "locationType": "existing" or "new",
  "sectionName": "exact section name (e.g., Learning Outcomes, Grading)",
  "anchorText": "unique 50-150 chars from syllabus showing WHERE to edit (or 'END' for new sections)",
  "insertAfter": true or false
}

For NEW sections, set locationType="new" and anchorText to where it should go (e.g., "END" or text of previous section).`;

      console.log('🔍 Шукаємо локацію...');
      const locResp = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You analyze document structure and locate where edits should be made. Return only JSON.' },
          { role: 'user', content: locationPrompt }
        ],
        text: { format: { type: 'json_object' } }
      });

      const location = this.safeParseJSON(locResp.output_text || '{}');
      if (!location || !location.sectionName) {
        console.warn(`⚠️ Пропускаємо "${rec.title}" - не знайдено локацію`);
        continue;
      }

      console.log(`📍 ${location.locationType} - ${location.sectionName}`);

      // Крок 2: LLM генерує ТІЛЬКИ новий/змінений текст
      const editPrompt = `Generate the ${location.locationType === 'new' ? 'NEW section text' : 'EDITED text'} for this syllabus recommendation.

RECOMMENDATION:
${rec.title}
${rec.description}
${rec.suggestedText ? `\nSuggested text:\n${rec.suggestedText}` : ''}

SECTION: ${location.sectionName}

CONTEXT - MBA-27 Learning Objectives Reference:
${this.learningObjectives.map((lo, idx) => `LO${idx + 1}: ${lo.text}`).join('\n')}

IMPORTANT: 
- When you see "LO1", "LO2", etc. in the recommendation, refer to the FULL TEXT from the list above
- Example: If recommendation mentions "LO1 (adaptive leadership)", use the complete text: "Leverage real-life business experiences to develop adaptive leadership and decision-making skills..."
- Be concise but include the essential meaning from the full learning objective

${location.locationType === 'new' ? `
Generate a COMPLETE NEW section including heading and content (200-600 chars).
` : `
Generate ONLY the edited/replacement text (100-500 chars). Be concise and professional.
`}

Return JSON:
{
  "newText": "the exact new or edited text",
  "summary": "one-sentence: what changed"
}`;

      console.log('✏️ Генеруємо зміни...');
      const editResp = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You are a professional academic editor for MBA syllabi. Generate concise, high-quality text. Return only JSON.' },
          { role: 'user', content: editPrompt }
        ],
        text: { format: { type: 'json_object' } }
      });

      const edit = this.safeParseJSON(editResp.output_text || '{}');
      if (!edit || !edit.newText) {
        console.warn(`⚠️ Пропускаємо "${rec.title}" - не згенеровано текст`);
        continue;
      }

      console.log(`✅ ${edit.newText.length} chars: ${edit.summary}`);

      // Крок 3: Застосовуємо зміни
      if (location.locationType === 'new') {
        // Додаємо нову секцію
        if (location.anchorText === 'END' || !location.anchorText) {
          modifiedText += '\n\n' + edit.newText;
        } else {
          const anchorIdx = modifiedText.indexOf(location.anchorText);
          if (anchorIdx !== -1) {
            const insertPos = anchorIdx + location.anchorText.length;
            modifiedText = modifiedText.substring(0, insertPos) + '\n\n' + edit.newText + modifiedText.substring(insertPos);
          } else {
            modifiedText += '\n\n' + edit.newText; // fallback
          }
        }
        console.log('📝 Додано нову секцію');
      } else {
        // Замінюємо існуючий текст
        if (location.anchorText && location.anchorText !== 'END') {
          const anchorIdx = modifiedText.indexOf(location.anchorText);
          if (anchorIdx !== -1) {
            const insertPos = location.insertAfter ? anchorIdx + location.anchorText.length : anchorIdx;
            // Вставляємо новий текст після/до якоря
            modifiedText = modifiedText.substring(0, insertPos) + '\n' + edit.newText + '\n' + modifiedText.substring(insertPos);
            console.log('📝 Вставлено текст після якоря');
          } else {
            console.warn('⚠️ Якір не знайдено, додаємо в кінець');
            modifiedText += '\n\n' + edit.newText;
          }
        } else {
          modifiedText += '\n\n' + edit.newText;
        }
      }

      changes.push({
        recommendation: rec.title,
        section: location.sectionName,
        change: edit.summary
      });
    }

    console.log(`\n✅ Оброблено: ${changes.length}/${recommendations.length}`);
    console.log(`📄 Фінальна довжина: ${modifiedText.length} chars`);
    console.log('=== ЗАВЕРШЕНО ===\n');

    return { modifiedText, changes };
  }

  generateDiffHtml(originalText, modifiedText, changes, syllabus) {
    const escapeHtml = (text) => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Використовуємо diff-match-patch для генерації детального diff
    const diffs = this.dmp.diff_main(originalText, modifiedText);
    this.dmp.diff_cleanupSemantic(diffs);
    
    // Створюємо diff HTML з мітками рекомендацій
    const diffSegments = [];
    for (const [op, data] of diffs) {
      const safe = escapeHtml(data).replace(/\n/g, '<br>');
      
      if (op === 0) { // Без змін
        diffSegments.push(`<span class="diff-same">${safe}</span>`);
      } else if (op === -1) { // Видалено
        diffSegments.push(`<span class="diff-remove">${safe}</span>`);
      } else if (op === 1) { // Додано
        diffSegments.push(`<span class="diff-add">${safe}</span>`);
      }
    }
    
    const diffHtml = diffSegments.join('');
    
    // Створюємо список рекомендацій з їх змінами
    const accepted = syllabus.recommendations.filter(r => r.status === 'accepted');
    const recommendationsHtml = accepted.map((rec, index) => {
      const change = changes.find(c => c.recommendation === rec.title);
      const hasChange = change ? '✅' : '➡️';
      
      return `
        <li class="recommendation-item">
          <div class="rec-header">
            <span class="rec-status">${hasChange}</span>
            <span class="rec-cat">${escapeHtml(rec.category)}</span>
            <span class="rec-title">${escapeHtml(rec.title || '')}</span>
          </div>
          <div class="rec-desc">${escapeHtml(rec.description || '')}</div>
          ${change ? `
            <div class="rec-change">
              <strong>Зміна:</strong> ${escapeHtml(change.change)}
            </div>
          ` : ''}
          ${rec.suggestedText ? `
            <details class="rec-suggested">
              <summary>💡 Запропонований текст</summary>
              <div class="suggested-content">${escapeHtml(rec.suggestedText)}</div>
            </details>
          ` : ''}
        </li>`;
    }).join('');

    const now = new Date();
    const header = syllabus.course?.name || syllabus.title || 'Силабус';
    
    return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <title>Редагування силабусу: ${escapeHtml(header)}</title>
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
        padding: 12px 16px;
        background: #edf2f7;
        border-left: 4px solid #4299e1;
        border-radius: 6px;
        font-size: 14px;
        color: #2d3748;
      }
      
      .rec-change strong {
        color: #1a202c;
        font-weight: 600;
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
      
      .footer-note {
        margin-top: 48px;
        padding: 24px;
        background: #edf2f7;
        border-radius: 12px;
        font-size: 14px;
        color: #4a5568;
        line-height: 1.6;
      }
      
      .footer-note strong {
        color: #2d3748;
        font-weight: 600;
      }
      
      @media print {
        body { padding: 24px; background: white; }
        .recommendation-item { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>📄 Редагування силабусу: ${escapeHtml(header)}</h1>
      <div class="meta">
        <div class="meta-item">
          <span>📅</span>
          <span>${escapeHtml(now.toLocaleString('uk-UA', { dateStyle: 'long', timeStyle: 'short' }))}</span>
        </div>
        <div class="meta-item">
          <span>📊</span>
          <span>Застосовано змін: ${changes.length} з ${accepted.length}</span>
        </div>
      </div>
    </div>
    
    <div class="legend">
      <span class="legend-item add">Додано</span>
      <span class="legend-item remove">Видалено</span>
      <span class="legend-item same">Без змін</span>
    </div>
    
    <h2>✅ Прийняті рекомендації та їх реалізація</h2>
    <ul class="recommendations">
      ${recommendationsHtml || '<li class="recommendation-item"><div class="rec-desc">Прийнятих рекомендацій не знайдено</div></li>'}
    </ul>
    
    <h2>📝 Текст силабусу з внесеними змінами</h2>
    <div class="diff-wrapper">${diffHtml}</div>
    
    <div class="footer-note">
      <strong>💡 Як читати цей документ:</strong><br>
      • <span style="background:#c6f6d5;padding:2px 6px;border-radius:3px;">Зелений фон</span> — текст, який було додано згідно з рекомендаціями<br>
      • <span style="background:#fed7d7;padding:2px 6px;border-radius:3px;text-decoration:line-through;">Червоний закреслений</span> — текст, який було видалено<br>
      • Звичайний текст — залишився без змін<br>
      • Кожна рекомендація показує конкретну зміну, яку вона внесла в документ
    </div>
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
      'learning-objectives': 'Відповідність до learning objectives',
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

  async generateResponseToComment(syllabusId, recommendationId, comment) {
    try {
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) throw new Error('Syllabus not found');

      const recommendation = syllabus.recommendations.id(recommendationId);
      if (!recommendation) throw new Error('Recommendation not found');

      const response = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You are an MBA program assistant.' },
          { role: 'user', content: `Respond to instructor comment: ${comment}` }
        ]
      });

      const aiResponse = response.output_text || 'Thank you for your feedback.';
      recommendation.instructorComment = comment;
      recommendation.aiResponse = aiResponse;
      recommendation.status = 'commented';
      await syllabus.save();

      return aiResponse;
    } catch (error) {
      console.error('Comment response error:', error);
      throw error;
    }
  }
}

module.exports = new AIService();
