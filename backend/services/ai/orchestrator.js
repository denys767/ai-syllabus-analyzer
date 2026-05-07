const Syllabus = require('../../models/Syllabus');
const { analyzeAgainstStandards } = require('./analyzer');
const { generateEditsForRecs } = require('./editGenerator');

async function analyzeSyllabus(syllabusId) {
  try {
    console.log('Starting syllabus analysis:', syllabusId);
    const syllabus = await Syllabus.findById(syllabusId);
    if (!syllabus) throw new Error('Syllabus not found');

    const analysis = await analyzeAgainstStandards(syllabus.extractedText);

    // Pre-generate line-anchored edits for every pending recommendation in one batch.
    syllabus.recommendations = analysis.recommendations;
    await generateEditsForRecs(syllabus, syllabus.recommendations);

    await Syllabus.findByIdAndUpdate(syllabusId, {
      structure: analysis.structure || {},
      analysis: {
        templateCompliance: {
          missingElements: analysis.templateCompliance?.missingElements || [],
        },
        learningObjectivesAlignment: {
          alignedObjectives: analysis.learningObjectivesAlignment?.alignedObjectives || [],
          missingObjectives: analysis.learningObjectivesAlignment?.missingObjectives || [],
        },
        plagiarismCheck: {
          riskLevel: 'none',
          similarSyllabi: [],
          overallSimilarity: 0,
          skipped: true,
          reason: 'Similarity check is disabled for the Professor Tutor MVP',
        },
      },
      recommendations: syllabus.recommendations,
      status: 'in_progress',
    });

    return true;
  } catch (error) {
    console.error('Analysis error:', error.message);
    await Syllabus.findByIdAndUpdate(syllabusId, { status: 'error' });
    throw error;
  }
}

module.exports = { analyzeSyllabus };
