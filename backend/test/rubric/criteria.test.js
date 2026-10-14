const rubric = require('../../services/ai/rubric');
const { LEARNING_OUTCOMES } = require('../../services/ai/constants');

const { criteria, standardClauses, SEVERITY_RANK } = rubric;
const FIXES = ['replaceBlock', 'insertAfter', 'question', 'clause'];
const REQUIRED = ['id', 'group', 'title', 'check', 'whatGoodLooksLike', 'doNotReportIf', 'defaultSeverity', 'evidence', 'fix', 'standardClauseId', 'mba27', 'source', 'examples'];

describe('rubric criteria', () => {
  test('has 25-35 criteria with unique ids', () => {
    expect(criteria.length).toBeGreaterThanOrEqual(25);
    expect(criteria.length).toBeLessThanOrEqual(35);
    const ids = criteria.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(criteria.map((c) => [c.id, c]))('%s has valid fields', (_id, c) => {
    REQUIRED.forEach((key) => expect(c).toHaveProperty(key));
    expect(rubric.GROUPS).toContain(c.group);
    expect(Object.keys(SEVERITY_RANK)).toContain(c.defaultSeverity);
    expect(FIXES).toContain(c.fix);
    expect(Array.isArray(c.doNotReportIf)).toBe(true);
    expect(c.doNotReportIf.length).toBeGreaterThan(0);
    expect(c.examples.good).toBeTruthy();
    expect(c.examples.bad).toBeTruthy();
    expect(c.check.trim().endsWith('?')).toBe(true);
  });

  test('every group is used', () => {
    const groups = rubric.criteriaByGroup();
    rubric.GROUPS.forEach((g) => expect(groups[g].length).toBeGreaterThan(0));
  });

  test('standardClauseId resolves and clause-fix criteria have a clause', () => {
    const clauseIds = standardClauses.map((c) => c.id);
    criteria.forEach((c) => {
      if (c.standardClauseId) expect(clauseIds).toContain(c.standardClauseId);
      if (c.fix === 'clause') expect(c.standardClauseId).toBeTruthy();
    });
  });

  test('mba27 ids exist in constants.LEARNING_OUTCOMES', () => {
    const known = LEARNING_OUTCOMES.map((lo) => lo.id);
    criteria.forEach((c) => {
      if (c.mba27) c.mba27.forEach((id) => expect(known).toContain(id));
    });
  });

  test('clauses are drafts with text', () => {
    standardClauses.forEach((c) => {
      expect(c.status).toBe('draft');
      expect(c.variants.length).toBeGreaterThan(0);
      c.variants.forEach((v) => expect(v.text).toBeTruthy());
    });
    expect(rubric.getClause('ai-policy').variants).toHaveLength(3);
  });

  test('getCriterion works', () => {
    expect(rubric.getCriterion('LO-1').group).toBe('outcomes');
    expect(rubric.getCriterion('nope')).toBeNull();
  });

  test('renderCriteriaCards is deterministic and covers every card', () => {
    rubric.GROUPS.forEach((g) => {
      const a = rubric.renderCriteriaCards(g);
      expect(a).toBe(rubric.renderCriteriaCards(g));
      rubric.criteriaByGroup()[g].forEach((c) => expect(a).toContain(`[${c.id}]`));
    });
  });
});
