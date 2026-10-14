const Syllabus = require('../models/Syllabus');
const aiService = require('./ai');

// Запускає аналіз у фоні; помилку зберігає у analysisError, статус → error
function runAnalysisInBackground(syllabusId) {
  setImmediate(async () => {
    try {
      await aiService.analyzeSyllabus(syllabusId);
    } catch (error) {
      console.error('AI analysis error for syllabus', syllabusId, ':', error);
      await Syllabus.findByIdAndUpdate(syllabusId, {
        status: 'error',
        analysisError: error.message,
      }).catch(() => {});
    }
  });
}

module.exports = { runAnalysisInBackground };
