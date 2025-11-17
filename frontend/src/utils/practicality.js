export const extractAiSuggestions = (syllabus = {}) => {
  const stored = Array.isArray(syllabus.practicalChallenge?.aiSuggestions)
    ? syllabus.practicalChallenge.aiSuggestions.filter(item => item && (item.suggestion || item.title))
    : [];
  if (stored.length) {
    return stored;
  }

  const fallback = (syllabus.recommendations || [])
    .filter(rec => rec && rec.category === 'practicality')
    .map(rec => ({
      title: rec.title,
      suggestion: rec.description || rec.title || 'Practical improvement',
      category: rec.category || 'practicality',
      priority: rec.priority || 'medium',
      createdAt: rec.createdAt || rec.respondedAt || syllabus.updatedAt || syllabus.createdAt || new Date().toISOString()
    }));

  return fallback;
};

export const getPracticalityScoreData = (syllabus = {}) => {
  const rawScore = syllabus.practicalChallenge?.practicalityScore;
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore)
    ? Math.min(100, Math.max(0, rawScore))
    : null;

  return {
    score,
    critique: syllabus.practicalChallenge?.practicalityCritique || ''
  };
};

export const formatPracticalityScore = (value) => {
  if (value === null || value === undefined) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Number.isInteger(numeric) ? numeric : numeric.toFixed(1);
};
