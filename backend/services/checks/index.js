// Детерміновані перевірки силабуса (ТЗ §2): runChecks(state, refs) → Check[] (docs/api-v5.md §3).
// Жодна перевірка тут не звертається до LLM; м'які судження — окремо в checks/llm.js (runLlmChecks).
const { SEVERITIES } = require('./common');
const glance = require('./glance');
const assessment = require('./assessment');
const workload = require('./workload');
const regulations = require('./regulations');
const outcomes = require('./outcomes');
const plo = require('./plo');

const MODULES = [glance, assessment, workload, regulations, outcomes, plo];

/** Порядок: severity (critical → info), далі TemplateSection.order з refs.template; інакше — порядок появи. */
function sortChecks(checks, refs) {
  const order = new Map((refs?.template || []).map((s) => [s.key, s.order]));
  const rank = (c) => SEVERITIES.indexOf(c.severity);
  const sectionOrder = (c) => order.get(c.section) ?? Number.MAX_SAFE_INTEGER;
  return checks.map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || sectionOrder(a.c) - sectionOrder(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/**
 * @param {object} state Syllabus.state
 * @param {object} refs  довідники програми (services/references.getRefs / fixtureRefs.loadFixtureRefs)
 * @returns {Check[]} непройдені перевірки та інформаційні (info), відсортовані
 */
function runChecks(state, refs = {}) {
  const all = MODULES.flatMap((m) => m.run(state || {}, refs));
  return sortChecks(all.filter((c) => !c.passed || c.severity === 'info'), refs);
}

// Ліниво: llm.js сам імпортує sortChecks звідси
const runLlmChecks = (...args) => require('./llm').runLlmChecks(...args);

module.exports = { runChecks, runLlmChecks, sortChecks, SEVERITIES };
