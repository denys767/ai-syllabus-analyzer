// Корпус «відомого» для сканера фактів (services/ai/facts.scanFacts): факт, названий тут, не потребує окремого підтвердження.

const { getPath } = require('../syllabusState/paths');
const { policyKeyOf } = require('./slotWrite');

// Службові поля сутностей: ідентифікатори (clo3, obj2, as1), блоки файлу, провенанс, прапорці.
// Їхні «числа» не є фактами, названими викладачем.
const SERVICE_KEYS = new Set([
  'id', 'blockIds', 'evidenceBlockIds', 'source', 'assessmentIds', 'outcomeIds', 'fixtureRefs', 'optionKey',
  'mode', 'modified', 'confirmed', 'verified', 'libraryVersion', 'approved', 'approvedAt', 'approvedRevision',
]);

/** Людський текст значення слота: рядки й числа змістових полів, без id і службових полів (не JSON.stringify). */
function readableText(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readableText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value).filter(([k]) => !SERVICE_KEYS.has(k)).map(([, v]) => readableText(v)).filter(Boolean).join('\n');
  }
  return '';
}

/**
 * Корпус «відомого» для сканера фактів: репліки викладача (лише його власні — без серверних «Confirmed: …»),
 * його поточний відгук, людський текст поточного значення слота і довідник, що стосується саме цього слота
 * (варіанти політики, ПРН, критерії Capstone).
 */
function knownFor(s, { state, refs }, instructorLines, extra = []) {
  const path = s.target.path;
  const known = [...instructorLines, ...extra];
  known.push(readableText(getPath(state, path)));
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


module.exports = { knownFor, readableText };
