const { createResponse, safeParseJSON, llmModel } = require('./client');
const {
  SYLLABUS_TEMPLATE,
  LEARNING_OUTCOMES,
  getCategoryLabel,
} = require('./constants');

/**
 * Analyze a syllabus against the KSE template and MBA-27 learning outcomes.
 * Returns the structure analysis + an array of recommendations (without
 * before/after edits — those are added by editGenerator).
 */
async function analyzeAgainstStandards(syllabusText) {
  const prompt = `You are analyzing an MBA syllabus for KSE Business School (Kyiv School of Economics).

**SYLLABUS TEMPLATE TO FOLLOW:**
${SYLLABUS_TEMPLATE}

**MBA-27 LEARNING OUTCOMES (ALL COURSES MUST ALIGN):**
${LEARNING_OUTCOMES.map((lo, idx) => `Learning Outcome ${idx + 1}: ${lo.text}`).join('\n')}

**SYLLABUS TO ANALYZE:**
${syllabusText}

**TASK:**
Analyze the syllabus and provide recommendations in the following categories:
1. **template-compliance** - Missing sections, formatting issues compared to template
2. **learning-objectives** - Which learning outcomes are covered/missing, how to improve alignment. Specify which learning outcome is covered by this recommendation
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

  const response = await createResponse({
    model: llmModel,
    input: [
      { role: 'system', content: 'You are an expert MBA syllabus analyzer for KSE Business School. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ],
    text: { format: { type: 'json_object' } },
  });

  const result = safeParseJSON(response.output_text || '{}');
  if (!result) throw new Error('Invalid analysis response');

  result.recommendations = (result.recommendations || []).map((rec, idx) => ({
    id: `rec_${Date.now()}_${idx}`,
    category: rec.category || 'other',
    groupTag: getCategoryLabel(rec.category),
    title: rec.title || `Recommendation ${idx + 1}`,
    description: rec.description || 'No description provided',
    priority: rec.priority || 'medium',
    decision: 'pending',
  }));

  return result;
}

module.exports = { analyzeAgainstStandards };
