// Корпус «відомого» для сканера фактів (services/ai/facts.scanFacts): факт, названий тут, не потребує окремого підтвердження.

const { getPath } = require('../syllabusState/paths');
const { policyKeyOf } = require('./slotWrite');

/**
 * Корпус «відомого» для сканера фактів: репліки викладача, його поточний відгук, поточне значення слота
 * і довідник, що стосується саме цього слота (варіанти політики, ПРН, критерії Capstone).
 */
function knownFor(s, { state, refs }, instructorLines, extra = []) {
  const path = s.target.path;
  const known = [...instructorLines, ...extra];
  const current = getPath(state, path);
  known.push(typeof current === 'string' ? current : JSON.stringify(current ?? ''));
  const key = policyKeyOf(path);
  if (key) {
    const block = (refs.policyLibrary?.blocks || []).find((b) => b.key === key);
    known.push(block?.text || '', ...(block?.options || []).map((o) => o.text));
  } else if (path.startsWith('outcomes')) {
    known.push(...refs.outcomes.map((o) => o.text));
  } else if (path.startsWith('summary.capstone')) {
    known.push(JSON.stringify(refs.capstone || {}));
  }
  return known;
}


module.exports = { knownFor };
