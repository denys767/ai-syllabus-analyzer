// Спільне для формулювальника й інструментів чату: як текст від моделі стає значенням слота в чернетці.
// Шлях і форма значення — як у docs/api-v5.md §9: текстовий слот-об'єкт (shortDescription, capstone) → value = рядок тексту
// (провенанс при accept ставить сервіс рішень), списки (objectives, outcomes) → value = масив повних сутностей.
const { getPath, concretePath } = require('../syllabusState/paths');

// D-слоти, які формулювальник чернетить з розповіді викладача
const NARRATIVE_SLOTS = ['course.description', 'course.objectives', 'course.outcomes', 'course.capstone'];

const DRAFTABLE = {
  'course.description': { mode: 'text', path: 'summary.shortDescription' },
  'course.capstone': { mode: 'text', path: 'summary.capstone' },
  'course.objectives': { mode: 'list', path: 'summary.objectives[]', idPrefix: 'obj', extra: () => ({}) },
  'course.outcomes': { mode: 'list', path: 'outcomes[]', idPrefix: 'clo', extra: () => ({ plo: [], assessmentIds: [] }) },
  'assessment.criteria': { mode: 'text', path: 'assessments[].criteria', entity: 'assessments' },
  'schedule.additional': { mode: 'text', path: 'sessions[].additional', entity: 'sessions' },
};

// Скалярні числові поля стану (решта скалярів — рядки)
const NUMERIC_PATHS = new Set(['header.ects', 'header.totalHours']);

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** «- text», «1. text», «• text» → «text»; порожні рядки відкидаються. */
function splitLines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}

function nextId(prefix, taken) {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  const id = `${prefix}${n}`;
  taken.add(id);
  return id;
}

/** Рядки → масив повних сутностей слота-списку; сутності на тих самих позиціях зберігають id та інші поля. */
function listEntities(def, lines, existing = []) {
  const taken = new Set(existing.map((e) => e?.id).filter(Boolean));
  return lines.map((line, i) => {
    const old = existing[i];
    if (old?.id) {
      return old.text === line ? old : { ...old, text: line, source: 'ai_draft', evidenceBlockIds: [] };
    }
    return { id: nextId(def.idPrefix, taken), ...def.extra(), text: line, source: 'ai_draft', evidenceBlockIds: [] };
  });
}

/**
 * Частина входу createDraftSuggestions для слота з DRAFTABLE: { target: { path, entityId }, value, text }.
 * text — те, що сканується на факти; value — що буде записано при accept.
 * @returns {object|null} null, якщо слот не чернеткується текстом
 */
function draftTarget(slotKey, { state, text, entityId = null }) {
  const def = DRAFTABLE[slotKey];
  if (!def) return null;
  if (def.mode === 'list') {
    const lines = splitLines(text);
    if (!lines.length) return null;
    const existing = getPath(state, def.path) || [];
    return { target: { path: def.path, entityId: null }, value: listEntities(def, lines, existing), text: lines.join('\n') };
  }
  const value = String(text || '').trim();
  if (!value) return null;
  return { target: { path: def.entity ? concretePath(def.path, { id: entityId }) : def.path, entityId: def.entity ? entityId : null }, value, text: value };
}

/** Поточне значення слота як текст (для known сканера фактів і reword). */
function currentText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(currentText).filter(Boolean).join('\n');
  if (typeof value === 'object') return filled(value.text) ? String(value.text) : (filled(value.citation) ? String(value.citation) : '');
  return String(value);
}

/**
 * Тексти довідника, з яких факт у чернетці слота вважається названим системою. Лише довідник цього слота:
 * політика → її блок і варіанти, capstone → критерії Capstone, outcomes → ПРН. Числа з чужих політик
 * (наприклад «48 hours» з політики запізнень) не роблять факт «відомим» в описі курсу.
 */
function referenceTexts(refs, slotKey) {
  if (String(slotKey).startsWith('policy.')) {
    const block = (refs?.policyLibrary?.blocks || []).find((b) => b.key === slotKey);
    return [block?.text, ...(block?.options || []).map((o) => o.text)].filter(Boolean);
  }
  if (slotKey === 'course.capstone') {
    return (refs?.capstone?.criteria || []).map((c) => `${c.name}: ${c.description}${c.weight != null ? ` ${Math.round(c.weight * 100)}%` : ''}`);
  }
  if (slotKey === 'course.outcomes') return (refs?.outcomes || []).map((o) => o.text).filter(Boolean);
  return [];
}

module.exports = { NARRATIVE_SLOTS, DRAFTABLE, NUMERIC_PATHS, splitLines, listEntities, draftTarget, currentText, referenceTexts, filled };
