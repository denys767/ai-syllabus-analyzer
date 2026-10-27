// Шляхи в Syllabus.state: читання/запис за шляхом слота і пошук змінених шляхів між двома станами.
//
// Синтаксис шляху (той самий, що в slots.js, плюс конкретні сутності):
//   'summary.shortDescription'        — поле
//   'assessments[]'                   — увесь масив сутностей
//   'assessments[as1]', '…[as1].criteria' — сутність масиву за id (і її поле)
//   'policies{policy.late}'           — блок політики за key; 'policies{}' — увесь масив
//   'sessions[].format'               — (лише читання) значення поля в кожній сутності
// У реєстрі слотів '{key}' — це шаблон «будь-який ключ».
const { stateSchema, SECTION_KEYS } = require('./schema');
const { SLOTS } = require('./slots');
const { httpError } = require('../../utils/httpError');

const SEGMENT_RE = /([^.[\]{}]+)|\[([^\]]*)\]|\{([^}]*)\}|(\.)/g;

function parsePath(path) {
  const segs = [];
  let pos = 0;
  for (const m of String(path).matchAll(SEGMENT_RE)) {
    if (m.index !== pos) break;
    pos += m[0].length;
    if (m[1] !== undefined) segs.push({ prop: m[1] });
    else if (m[2] !== undefined) segs.push(m[2] === '' ? { all: true, idKey: 'id' } : { match: m[2], idKey: 'id' });
    else if (m[3] !== undefined) segs.push(m[3] === '' ? { all: true, idKey: 'key' } : { match: m[3], idKey: 'key' });
  }
  if (!path || pos !== String(path).length) throw httpError(400, `Invalid state path: ${path}`, { code: 'INVALID_PATH' });
  return segs;
}

function getAt(node, segs) {
  if (!segs.length) return node;
  const [seg, ...rest] = segs;
  if (seg.prop !== undefined) return node == null ? undefined : getAt(node[seg.prop], rest);
  if (!Array.isArray(node)) return undefined;
  if (seg.all) return rest.length ? node.map((item) => getAt(item, rest)) : node;
  return getAt(node.find((item) => item?.[seg.idKey] === seg.match), rest);
}

/** Значення за шляхом; undefined, якщо шляху немає. */
const getPath = (state, path) => getAt(state, parsePath(path));

function setAt(node, segs, value, path) {
  if (!segs.length) return value;
  const [seg, ...rest] = segs;
  if (seg.prop !== undefined) {
    if (node != null && typeof node !== 'object') throw httpError(400, `Cannot set ${path}`, { code: 'INVALID_PATH' });
    return { ...(node || {}), [seg.prop]: setAt(node?.[seg.prop], rest, value, path) };
  }
  if (node != null && !Array.isArray(node)) throw httpError(400, `Cannot set ${path}: not an array`, { code: 'INVALID_PATH' });
  const arr = node || [];
  if (seg.all) {
    if (rest.length) throw httpError(400, `Cannot set ${path}: ambiguous entity`, { code: 'INVALID_PATH' });
    return value == null ? [] : value;
  }
  const idx = arr.findIndex((item) => item?.[seg.idKey] === seg.match);
  if (rest.length) {
    if (idx === -1) throw httpError(404, `State path not found: ${path}`, { code: 'PATH_NOT_FOUND' });
    return arr.map((item, i) => (i === idx ? setAt(item, rest, value, path) : item));
  }
  // Сутність цілком: null — видалити, немає — додати в кінець, є — замінити на місці
  if (value == null) return idx === -1 ? arr : arr.filter((_, i) => i !== idx);
  const entity = { ...value, [seg.idKey]: seg.match };
  return idx === -1 ? [...arr, entity] : arr.map((item, i) => (i === idx ? entity : item));
}

/** Новий стан зі значенням за шляхом (вхідний не змінюється). Для сутності null означає видалення. */
const setPath = (state, path, value) => setAt(state, parsePath(path), value, path);

/** Часткове оновлення сутності масиву за id: updateEntity(state, 'assessments', 'as1', { weight: 30 }). */
function updateEntity(state, arrayPath, id, patch) {
  const base = String(arrayPath).replace(/(\[\]|\{\})$/, '');
  const keyed = arrayPath.endsWith('{}') || GRANULES.some((g) => g.path === base && g.kind === 'keyed');
  const wrap = keyed ? `{${id}}` : `[${id}]`;
  const current = getPath(state, base + wrap);
  if (current === undefined) throw httpError(404, `State path not found: ${base}${wrap}`, { code: 'PATH_NOT_FOUND' });
  return setPath(state, base + wrap, { ...current, ...patch });
}

/** Шаблон слота → конкретний шлях: ('assessments[].criteria', { id: 'as1' }) → 'assessments[as1].criteria'. */
function concretePath(slotPath, { id, key } = {}) {
  let p = String(slotPath);
  if (id != null) p = p.replace('[]', `[${id}]`);
  if (key != null) p = p.replace('{key}', `{${key}}`);
  return p;
}

/** Конкретний шлях → шаблон реєстру: 'policies{policy.late}' → 'policies{key}', 'sessions[s1].hours' → 'sessions[].hours'. */
const toPattern = (path) => String(path).replace(/\[[^\]]*\]/g, '[]').replace(/\{[^}]*\}/g, '{key}');

// Слоти з конкретними шляхами (без policy.* як окремих ключів) — від найдовшого шляху
const SLOTS_BY_PATH = [...SLOTS].sort((a, b) => b.path.length - a.path.length);
const isPrefix = (prefix, path) => path === prefix || (path.startsWith(prefix) && '.[{'.includes(path[prefix.length]));

/** Слот реєстру для шляху (найдовший префікс) або null. */
function slotOfPath(path) {
  const pattern = toPattern(path);
  return SLOTS_BY_PATH.find((s) => isPrefix(s.path, pattern)) || null;
}

/** Розділ шаблону, до якого належить шлях; поля header поза реєстром — At a Glance; службові поля — null. */
function sectionOfPath(path) {
  const slot = slotOfPath(path);
  if (slot) return slot.section;
  const p = String(path);
  if (p.startsWith('sections.')) return SECTION_KEYS.includes(p.split('.')[1]) ? p.split('.')[1] : null;
  return p.startsWith('header.') ? 'at_a_glance' : null;
}

// ---------- змінені шляхи ----------

// Канонічне порівняння: порядок ключів і undefined-поля не важать
function canonical(value) {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : canonical(v)));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) if (value[k] !== undefined) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}
const deepEqual = (a, b) => JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));

// E-поля перераховуються автоматично: їх зміна не є правкою розділу і не пишеться в журнал
const COMPUTED_PATHS = SLOTS.filter((s) => s.type === 'E').map((s) => s.path).concat('header.computed');
const SKIP_PATHS = new Set([...COMPUTED_PATHS, 'sections']);

/**
 * Гранули журналу — найменші шляхи, за якими порівнюються стани:
 * масив сутностей ('outcomes', ідентичність за id), політики ('policies', за key), решта — значення.
 * Виводяться з реєстру слотів і доповнюються полями схеми, яких реєстр не покриває (header.courseCode, track …).
 */
function buildGranules() {
  const granules = new Map();
  for (const s of SLOTS) {
    if (s.type === 'E') continue;
    if (s.path.includes('{')) granules.set(s.path.split('{')[0], 'keyed');
    else if (s.path.includes('[]')) granules.set(s.path.split('[]')[0], 'array');
    else granules.set(s.path, 'value');
  }
  const covered = (p) => [...granules.keys()].some((g) => isPrefix(p, g) || isPrefix(g, p));
  const isEntityArray = (sub) => sub.type === 'array' && Boolean(sub.items?.properties?.id);
  const walk = (schema, prefix) => {
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (SKIP_PATHS.has(p) || granules.has(p)) continue;
      if (!covered(p)) granules.set(p, isEntityArray(sub) ? 'array' : 'value');
      else if (sub.properties) walk(sub, p);
    }
  };
  walk(stateSchema, '');
  return [...granules.entries()].map(([path, kind]) => ({ path, kind }));
}
const GRANULES = buildGranules();

function diffGranule({ path, kind }, before, after, out) {
  const b = getPath(before, path);
  const a = getPath(after, path);
  if (kind === 'value') {
    if (!deepEqual(b, a)) out.push({ path, before: b ?? null, after: a ?? null });
    return;
  }
  const idKey = kind === 'keyed' ? 'key' : 'id';
  const wrap = (id) => (kind === 'keyed' ? `{${id}}` : `[${id}]`);
  const bArr = Array.isArray(b) ? b : [];
  const aArr = Array.isArray(a) ? a : [];
  const bIds = bArr.map((e) => e?.[idKey]);
  const aIds = aArr.map((e) => e?.[idKey]);
  const sameIds = bIds.length === aIds.length && bIds.every((id, i) => id && id === aIds[i]) && new Set(aIds).size === aIds.length;
  if (sameIds) {
    // Ті самі сутності в тому самому порядку — по запису на кожну змінену
    aArr.forEach((entity, i) => {
      if (!deepEqual(bArr[i], entity)) out.push({ path: `${path}${wrap(aIds[i])}`, before: bArr[i], after: entity });
    });
  } else if (!deepEqual(b, a)) {
    // Додано, видалено чи переставлено — масив цілком
    out.push({ path: `${path}${kind === 'keyed' ? '{}' : '[]'}`, before: b ?? null, after: a ?? null });
  }
}

/** Змінені шляхи між двома станами: [{ path, section, before, after }] (E-поля і sections не враховуються). */
function changedPaths(before, after) {
  const out = [];
  for (const g of GRANULES) diffGranule(g, before || {}, after || {}, out);
  return out.map((c) => ({ ...c, section: sectionOfPath(c.path) }));
}

/** Розділи, яких торкнулась зміна, у порядку шаблону. */
function sectionsTouched(before, after) {
  const touched = new Set(changedPaths(before, after).map((c) => c.section).filter(Boolean));
  return SECTION_KEYS.filter((k) => touched.has(k));
}

module.exports = {
  parsePath, getPath, setPath, updateEntity, concretePath, toPattern, slotOfPath, sectionOfPath,
  changedPaths, sectionsTouched, deepEqual, GRANULES,
};
