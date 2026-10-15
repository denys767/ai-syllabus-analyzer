const { evidenceKey, ABSENCE_CRITERIA } = require('../services/ai/review/common');

// Максимальне взаємно-однозначне зіставлення: дублікати не збільшують recall.
function matchedCount(predicted, expected) {
  const owners = new Map();
  function assign(i, visited) {
    for (let j = 0; j < expected.length; j += 1) {
      const overlaps = predicted[i].evidenceBlockIds.some((id) => expected[j].evidenceBlockIds.includes(id));
      // document-level у golden відповідає також найближчому заголовку у Finding.
      const absent = expected[j].missingSection && predicted[i].evidenceBlockIds.length > 0;
      if (visited.has(j) || !(overlaps || absent)) continue;
      visited.add(j);
      if (!owners.has(j) || assign(owners.get(j), visited)) { owners.set(j, i); return true; }
    }
    return false;
  }
  return predicted.reduce((sum, _, i) => sum + Number(assign(i, new Set())), 0);
}
function measureDocument(findings, annotation, blocks) {
  const ids = new Set(blocks.map((b) => b.id));
  const byCriterion = {};
  for (const c of annotation.criteria) {
    const predicted = findings.filter((f) => f.criterionId === c.criterionId);
    const expected = c.verdict === 'issue' ? c.issues : [];
    const tp = matchedCount(predicted, expected);
    byCriterion[c.criterionId] = { tp, fp: predicted.length - tp, fn: expected.length - tp };
  }
  const unique = new Set(findings.map(evidenceKey));
  const evidenceValid = findings.filter((f) => f.evidenceBlockIds.length > 0 && f.evidenceBlockIds.every((id) => ids.has(id)
    || (id === 'document' && ABSENCE_CRITERIA.has(f.criterionId) && annotation.criteria.some((c) => c.criterionId === f.criterionId && c.issues.some((i) => i.missingSection))))).length;
  return { document: annotation.document, byCriterion, findingsCount: findings.length,
    duplicates: findings.length - unique.size, evidenceValid,
    unannotatedFindings: findings.filter((f) => !annotation.criteria.some((c) => c.criterionId === f.criterionId)).length };
}
const ratio = (a, b) => b ? a / b : null;
function aggregate(results) {
  const counts = {};
  for (const result of results) for (const [id, c] of Object.entries(result.byCriterion)) {
    counts[id] ||= { tp: 0, fp: 0, fn: 0 };
    for (const key of ['tp', 'fp', 'fn']) counts[id][key] += c[key];
  }
  const byCriterion = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([id, c]) => [id, { ...c, precision: ratio(c.tp, c.tp + c.fp), recall: ratio(c.tp, c.tp + c.fn) }]));
  const findingsCount = results.reduce((sum, r) => sum + r.findingsCount, 0);
  return { byCriterion, documents: results.length, findingsCount, meanFindings: ratio(findingsCount, results.length),
    duplicateRate: ratio(results.reduce((sum, r) => sum + r.duplicates, 0), findingsCount),
    evidenceValidityRate: ratio(results.reduce((sum, r) => sum + r.evidenceValid, 0), findingsCount),
    unannotatedFindings: results.reduce((sum, r) => sum + r.unannotatedFindings, 0) };
}
module.exports = { measureDocument, aggregate, matchedCount };
