// Текстове подання значення слота (draft.value / option.value): рядок, сутність або масив сутностей.
const ENTITY_TEXT_KEYS = ['text', 'name', 'title', 'citation', 'topic', 'label'];

function entityText(item) {
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object') return String(item);
  const key = ENTITY_TEXT_KEYS.find((k) => typeof item[k] === 'string' && item[k].trim());
  const main = key ? item[key] : '';
  const extras = [];
  if (item.weight !== undefined && item.weight !== null) extras.push(`${item.weight}%`);
  if (item.hours !== undefined && item.hours !== null) extras.push(`${item.hours} h`);
  if (item.deadline) extras.push(item.deadline);
  return [main, extras.join(' · ')].filter(Boolean).join(' — ');
}

export default function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(entityText).filter(Boolean).join('\n');
  return entityText(value);
}
