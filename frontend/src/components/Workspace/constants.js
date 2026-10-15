export const SEVERITY = {
  critical: { label: 'Критична', color: 'error', rank: 4 },
  high: { label: 'Важлива', color: 'warning', rank: 3 },
  medium: { label: 'Середня', color: 'info', rank: 2 },
  low: { label: 'Низька', color: 'default', rank: 1 },
};

export const GROUP_LABELS = {
  template: 'Шаблон KSE',
  outcomes: 'Результати навчання',
  assessment: 'Оцінювання',
  practice: 'Практика та кейси',
  policy: 'Політики',
};
export const GROUP_KEYS = Object.keys(GROUP_LABELS);

export const REJECT_TAGS = [
  { value: 'already_present', label: 'Вже є в тексті' },
  { value: 'too_generic', label: 'Занадто загально' },
  { value: 'incorrect', label: 'Неправильно' },
  { value: 'not_relevant', label: 'Не стосується курсу' },
  { value: 'other', label: 'Інше' },
];

export const REFINE_HINTS = ['Коротше', 'Без дат', 'Простішими словами', 'Додай український кейс'];

export const ANALYSIS_STAGES = [
  { key: 'extract', label: 'Розбір документа' },
  { key: 'structure', label: 'Структура' },
  { key: 'diagnose', label: 'Діагностика' },
  { key: 'verify', label: 'Перевірка' },
  { key: 'rewrite', label: 'Формування пропозицій' },
];

export const BLOCK_KIND_LABELS = {
  heading: 'Заголовок',
  'list-item': 'Пункт списку',
  'table-cell': 'Клітинка таблиці',
  'slide-title': 'Заголовок слайда',
  notes: 'Нотатки',
};

export const STATUS_LABELS = {
  pending: 'Очікують рішення',
  accepted: 'Прийняті',
  rejected: 'Відхилені',
};

export const ADVISORY_REJECT_REASON = 'Зрозуміло (порада без правки в тексті)';
