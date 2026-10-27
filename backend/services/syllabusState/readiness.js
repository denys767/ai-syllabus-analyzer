// Readiness v5 (docs/api-v5.md §4): частка затверджених обов'язкових розділів шаблону.
// Розділ затверджено = пороги slots.sectionGaps пройдені І state.sections[key].approved.
// Поради (Suggestion) і перевірки на score не впливають: відхилена порада його не знижує, порожній стан дає 0.
const { SECTION_KEYS } = require('./schema');
const { slotsOfSection, sectionGaps, policyDecided } = require('./slots');
const { getPath } = require('./paths');

// Службові поля сутностей не роблять слот заповненим
const META_KEYS = new Set(['id', 'key', 'n', 'source', 'evidenceBlockIds', 'mode', 'modified', 'verified', 'confirmed',
  'isParticipation', 'isControl', 'fixtureRef', 'candidateOptionKey', 'coverage']);

function hasContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === 'object') return Object.entries(value).some(([k, v]) => !META_KEYS.has(k) && hasContent(v));
  return false;
}

/**
 * Чи є в розділі хоч один заповнений слот. Locked (програма, тексти locked-політик) і E-поля
 * підставляються автоматично, тож розділ сам по собі не заповнюють.
 */
function sectionHasContent(key, state) {
  return slotsOfSection(key).some((slot) => {
    if (slot.type === 'E' || slot.editability === 'locked') return false;
    if (slot.key === 'policy.*') {
      return (state.policies || []).some((p) => p.mode !== 'locked' && (policyDecided(p) || hasContent(p.text)));
    }
    return hasContent(getPath(state, slot.path));
  });
}

const CHECK_BUCKETS = { critical: 'critical', high: 'high' };

/**
 * @param {object} state  Syllabus.state
 * @param {{ refs?, checks?: Check[], pendingSuggestions?: number }} opts
 *   refs.template задає розділи й обов'язковість (TemplateSection.required); без refs — усі розділи схеми обов'язкові.
 *   checks — результат services/checks; рахуються лише непройдені (passed === false).
 * @returns {{ score, sections: { [key]: { status, complete, approved, gaps, checks: { critical, high, other } } },
 *   counts: { approved, required, pendingSuggestions } }}
 */
function computeReadiness(state, { refs, checks = [], pendingSuggestions = 0 } = {}) {
  const s = state || {};
  const template = refs?.template?.length
    ? [...refs.template].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : SECTION_KEYS.map((key) => ({ key, required: true }));

  const sections = {};
  let required = 0;
  let approvedRequired = 0;
  for (const { key, required: isRequired } of template) {
    const gaps = sectionGaps(key, s);
    const complete = gaps.length === 0;
    const approved = complete && Boolean(s.sections?.[key]?.approved);
    const counts = { critical: 0, high: 0, other: 0 };
    for (const c of checks) {
      if (c.section === key && c.passed === false) counts[CHECK_BUCKETS[c.severity] || 'other'] += 1;
    }
    sections[key] = {
      status: approved ? 'approved' : sectionHasContent(key, s) ? 'draft' : 'empty',
      complete, approved, gaps, checks: counts,
    };
    if (isRequired) {
      required += 1;
      if (approved) approvedRequired += 1;
    }
  }
  return {
    score: required ? Math.round((approvedRequired / required) * 100) : 0,
    sections,
    counts: { approved: approvedRequired, required, pendingSuggestions },
  };
}

module.exports = { computeReadiness, sectionHasContent };
