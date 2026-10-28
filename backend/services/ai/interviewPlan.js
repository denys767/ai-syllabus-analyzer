// План інтерв'ю: одна розповідь покриває кілька D-слотів, похідні поради й політики не стають питаннями.
const { SLOTS } = require('../syllabusState/slots');
const { getPath } = require('../syllabusState/paths');
const { NARRATIVE_SLOTS } = require('./slotDrafts');

const QUESTION_SLOTS = [
  ...NARRATIVE_SLOTS, 'schedule.sessions', 'schedule.individual_work', 'assessment.criteria', 'materials.required',
];

function hasContent(value) {
  if (Array.isArray(value)) return value.some(hasContent);
  if (value && typeof value === 'object') return hasContent(value.text ?? value.citation ?? value.topic ?? value.title);
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function candidates({ state, refs, skipped = [], preferredSection } = {}) {
  return QUESTION_SLOTS.map((key) => SLOTS.find((s) => s.key === key))
    .filter((s) => s && ['C', 'D'].includes(s.type) && s.editability === 'free'
      && !skipped.includes(s.key) && !skipped.includes(s.section)
      && (refs?.template || []).some((t) => t.key === s.section)
      && !hasContent(getPath(state, s.path)))
    .sort((a, b) => Number(b.section === preferredSection) - Number(a.section === preferredSection));
}

function templateQuestion(slot, refs) {
  const section = refs.template.find((t) => t.key === slot.section);
  const narrative = refs.template.find((t) => t.key === 'short_description');
  return {
    slotKey: slot.key,
    question: section.question || (NARRATIVE_SLOTS.includes(slot.key) && narrative?.question)
      || `What would you like to include in ${section.title}?`,
    why: `The section "${section.title}" still needs your input.`,
  };
}

module.exports = { candidates, templateQuestion, hasContent };
