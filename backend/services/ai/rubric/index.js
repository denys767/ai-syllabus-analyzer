// Rubric entry point: criteria cards, standard clauses and prompt helpers.
// Only static content is rendered, in a stable order, so prompts stay cache-friendly.

const { criteria } = require('./criteria');
const { standardClauses } = require('./standardClauses');

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const GROUPS = ['template', 'outcomes', 'assessment', 'practice', 'policy'];

function criteriaByGroup() {
  const result = {};
  GROUPS.forEach((g) => { result[g] = []; });
  criteria.forEach((c) => {
    if (!result[c.group]) result[c.group] = [];
    result[c.group].push(c);
  });
  return result;
}

function getCriterion(id) {
  return criteria.find((c) => c.id === id) || null;
}

function getClause(id) {
  return standardClauses.find((c) => c.id === id) || null;
}

function renderCard(c) {
  const lines = [
    `[${c.id}] ${c.title} (default severity: ${c.defaultSeverity}; fix: ${c.fix})`,
    `Check: ${c.check}`,
    `Good: ${c.whatGoodLooksLike}`,
    `Do NOT report if: ${c.doNotReportIf.join('; ')}`,
    `Evidence: ${c.evidence}`,
  ];
  if (c.mba27) lines.push(`MBA-27: ${c.mba27.join(', ')}`);
  lines.push(`Good recommendation: ${c.examples.good}`);
  lines.push(`Bad recommendation (never produce): ${c.examples.bad}`);
  return lines.join('\n');
}

function renderCriteriaCards(group) {
  const list = group ? (criteriaByGroup()[group] || []) : criteria;
  return list.map(renderCard).join('\n\n');
}

module.exports = {
  criteria,
  standardClauses,
  SEVERITY_RANK,
  GROUPS,
  criteriaByGroup,
  getCriterion,
  getClause,
  renderCriteriaCards,
};
