// Трек 2: розбір вхідного файлу по слотах (blocks → Syllabus.state), docs/V5_PLAN.md «Трек 2 — парсинг».
// extractSlots (LLM) → policyMatch (LLM-класифікація + детермінована схожість) → toState (детерміновано).
const { extractSlots } = require('./extractSlots');
const { matchPolicies } = require('./policyMatch');
const { toState } = require('./toState');
const references = require('../../references');

/**
 * @param {{ blocks: Block[], meta?, programCode, refs, course?: { title, code } }} input
 *   course — що відомо про курс поза файлом (лише для підказки courseKind, у стан не потрапляє)
 * @param {{ extractSlots?, matchPolicies?, courseKind?, stats? }} deps  підміна залежностей (тести)
 * @returns {Promise<{ state, policyMatches: Array<{ key, candidateOptionKey, match, similarity }>, lockedNotes: Array<{ key, fileText, similarity, match, evidenceBlockIds }>,
 *   courseHint: { code, title, matchedBy: 'title' } | null, warnings: string[] }>}
 *   state валідний за syllabusState/schema.validateState, source 'parsed', evidenceBlockIds заповнені
 */
async function parseToState({ blocks, meta = {}, programCode, refs, course = {} }, deps = {}) {
  const warnings = [];
  const extracted = await (deps.extractSlots || extractSlots)({ blocks, meta, refs }, { stats: deps.stats });
  warnings.push(...extracted.warnings);
  const { slots } = extracted;

  const policyResult = await (deps.matchPolicies || matchPolicies)({ segments: slots.policySegments, refs }, { stats: deps.stats });
  const state = toState({ slots, policies: policyResult.policies, programCode, refs });

  // courseKind у стані рахується лише за кодом курсу; збіг за назвою — підказка для картки з питанням про код
  let courseHint = null;
  try {
    const match = await (deps.courseKind || references.courseKind)(programCode, {
      courseCode: state.header.courseCode, courseTitle: state.header.courseTitle || course.title,
    });
    if (match.matchedBy === 'title' && !state.header.courseCode) {
      courseHint = { code: match.course.code, title: match.course.en || match.course.uk, matchedBy: 'title' };
    }
  } catch (error) {
    warnings.push(`The course type hint is unavailable: ${error.message}`);
  }

  return { state, policyMatches: policyResult.matches, lockedNotes: policyResult.lockedNotes, courseHint, warnings };
}

module.exports = { parseToState };
