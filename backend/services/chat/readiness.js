// Readiness (docs/api-v3.md): частка розглянутих (accepted + rejected) пропозицій по групах рубрики.

const WEIGHTS = { template: 0.3, outcomes: 0.25, assessment: 0.2, practice: 0.1, policy: 0.15 };
const GROUP_KEYS = Object.keys(WEIGHTS);

/**
 * @param {{group: string, status: string}[]} items  пропозиції або агреговані записи
 *   (опційне поле `count` — кількість однакових записів)
 */
function computeReadiness(items) {
  const totals = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0]));
  const resolved = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0]));
  const counts = { pending: 0, accepted: 0, rejected: 0, total: 0 };
  for (const item of items || []) {
    const n = item.count == null ? 1 : item.count;
    const group = WEIGHTS[item.group] != null ? item.group : 'template';
    totals[group] += n;
    counts.total += n;
    if (counts[item.status] != null) counts[item.status] += n;
    if (item.status === 'accepted' || item.status === 'rejected') resolved[group] += n;
  }
  const breakdown = {};
  for (const k of GROUP_KEYS) {
    breakdown[k] = totals[k] === 0 ? 100 : Math.round((resolved[k] / totals[k]) * 100);
  }
  const score = Math.round(GROUP_KEYS.reduce((sum, k) => sum + WEIGHTS[k] * breakdown[k], 0));
  return { score, breakdown, counts };
}

module.exports = { WEIGHTS, GROUP_KEYS, computeReadiness };
