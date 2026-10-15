// Аналіз силабусу: рубрика (services/ai/review) → пропозиція на кожну знахідку → Suggestion-и.

const Syllabus = require('../../models/Syllabus');
const Suggestion = require('../../models/Suggestion');
const { ownedAnalysis, assertLease } = require('../analysisLease');
const { mapLimit } = require('../../utils/concurrency');
const {
  review, metaOf, generateFor, baseFromFinding, variantFrom, advisoryVariant, priorityScore,
} = require('./suggestionBuilder');

const REWRITE_CONCURRENCY = Number(process.env.REWRITE_CONCURRENCY) || 3;
const REVIEW_STAGES = new Set(['structure', 'diagnose', 'verify', 'rewrite']);

async function setStage(syllabusId, stage, leaseToken) {
  await Syllabus.updateOne(ownedAnalysis(syllabusId, leaseToken), { $set: { analysisStage: stage } });
}

/**
 * Повний аналіз силабусу з уже збереженим `document`. Попередні пропозиції замінюються.
 * Якщо generateSuggestion падає для знахідки, зберігається порада (applicable: false).
 */
async function analyzeSyllabus(syllabusId, { leaseToken } = {}) {
  await assertLease(syllabusId, leaseToken);
  const syllabus = await Syllabus.findById(syllabusId);
  if (!syllabus) throw new Error('Силабус не знайдено');
  const blocks = (syllabus.document?.blocks || []).map((b) => (b && typeof b.toObject === 'function' ? b.toObject() : b));
  if (!blocks.length) throw new Error('Документ силабусу не розібрано');
  const meta = metaOf(syllabus);
  const docVersion = syllabus.document.docVersion;

  await setStage(syllabusId, 'structure', leaseToken);
  const { findings, rubricSummary, stats } = await review().runReview({
    blocks,
    meta,
    options: {
      // Якщо пайплайн повідомляє про етапи — показуємо їх користувачу
      onStage: (stage) => (REVIEW_STAGES.has(stage) ? setStage(syllabusId, stage, leaseToken).catch(() => {}) : undefined),
    },
  });

  await assertLease(syllabusId, leaseToken);
  await setStage(syllabusId, 'rewrite', leaseToken);
  const drafts = await mapLimit(findings || [], REWRITE_CONCURRENCY, async (finding) => {
    await assertLease(syllabusId, leaseToken);
    const base = baseFromFinding(finding, docVersion);
    try {
      const result = await generateFor({ finding, blocks, meta });
      return { ...base, ...variantFrom(result, finding) };
    } catch (err) {
      console.error(`generateSuggestion failed for finding ${finding.id}:`, err.message);
      return { ...base, ...advisoryVariant(finding) };
    }
  });

  const ordered = drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => priorityScore(b.d) - priorityScore(a.d) || a.i - b.i)
    .map(({ d }, order) => ({ ...d, syllabusId, order, status: 'pending' }));

  await assertLease(syllabusId, leaseToken);
  await Suggestion.deleteMany({ syllabusId });
  await assertLease(syllabusId, leaseToken);
  if (ordered.length) await Suggestion.insertMany(ordered);

  await Syllabus.updateOne(ownedAnalysis(syllabusId, leaseToken), {
    $set: {
      rubricSummary: { ...(rubricSummary || {}), stats: stats || null },
      status: 'in_progress',
      analysisStage: 'done',
    },
    $unset: { analysisError: '' },
  });
  return { suggestions: ordered.length };
}

module.exports = { analyzeSyllabus };
