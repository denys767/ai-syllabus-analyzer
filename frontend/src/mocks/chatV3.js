// Dev-фікстури за контрактом docs/api-v3.md. Використовуються лише сторінкою /dev/cards.
const p = (type, text) => ({ type, text });

export const diffInline = [
  p('eq', 'Курс оцінюється за '),
  p('del', 'трьома'),
  p('ins', 'чотирма'),
  p('eq', ' компонентами: '),
  p('del', 'іспит (50%), '),
  p('ins', 'груповий проєкт (30%), '),
  p('eq', 'активність на заняттях (20%)'),
  p('ins', ' та кейс-аналіз (20%)'),
  p('eq', '.'),
];

export const changeReplace = {
  blockId: 'b0042', op: 'replaceBlock', kind: 'paragraph',
  before: 'Курс оцінюється за трьома компонентами: іспит (50%), активність на заняттях (20%).',
  after: 'Курс оцінюється за чотирма компонентами: груповий проєкт (30%), активність на заняттях (20%) та кейс-аналіз (20%).',
  parts: diffInline,
};

export const changeHeading = {
  blockId: 'b0010', op: 'replaceBlock', kind: 'heading',
  parts: [p('eq', 'Результати '), p('del', 'вивчення'), p('ins', 'навчання'), p('eq', ' курсу')],
};

export const changeListItem = {
  blockId: 'b0021', op: 'replaceBlock', kind: 'list-item',
  parts: [p('eq', 'Студент '), p('del', 'знає основи'), p('ins', 'здатний застосувати'), p('eq', ' фінансового аналізу')],
};

export const changeTableCell = {
  blockId: 'b0090', op: 'replaceBlock', kind: 'table-cell',
  parts: [p('eq', 'Вага: '), p('del', '40%'), p('ins', '30%')],
};

export const changeInserted = {
  blockId: 'b0050', op: 'insertAfter', kind: 'paragraph',
  after: 'Політика щодо використання генеративного ШІ: студенти зобов’язані вказувати інструменти ШІ, використані під час підготовки робіт.',
  parts: [p('ins', 'Політика щодо використання генеративного ШІ: студенти зобов’язані вказувати інструменти ШІ, використані під час підготовки робіт.')],
};

export const changeDeleted = {
  blockId: 'b0061', op: 'deleteBlock', kind: 'paragraph',
  before: 'Застарілий пункт про усні заліки, який більше не застосовується.',
  parts: [p('del', 'Застарілий пункт про усні заліки, який більше не застосовується.')],
};

// >60% змінено — має відобразитися як «було / стало»
export const changeHeavy = {
  blockId: 'b0070', op: 'replaceBlock', kind: 'paragraph',
  before: 'Студенти повинні відвідувати всі заняття, інакше оцінка знижується.',
  after: 'Відвідування занять рекомендоване, але не обов’язкове. Оцінка залежить від виконання завдань, а не від присутності.',
  parts: [
    p('del', 'Студенти повинні відвідувати всі заняття, інакше оцінка знижується.'),
    p('ins', 'Відвідування занять рекомендоване, але не обов’язкове. Оцінка залежить від виконання завдань, а не від присутності.'),
  ],
};

const base = {
  id: 's0', kind: 'edit', status: 'pending', severity: 'high', group: 'assessment', criterionId: 'assess-weights',
  title: 'Узгодьте вагу компонентів оцінювання', description: 'Сума ваг компонентів не дорівнює 100%. Додано відсутній компонент і виправлено ваги.',
  question: null, applicable: true, selectedOptionId: null, decisionReason: null, rejectTag: null, order: 1,
  changes: [changeReplace], options: [], conflictsWith: [], requiresReason: true,
};

export const suggestionEdit = { ...base, id: 's1' };
export const suggestionManyKinds = {
  ...base, id: 's2', severity: 'medium', group: 'template', criterionId: 'tpl-headings', requiresReason: false,
  title: 'Приведіть заголовки до шаблону KSE',
  description: 'Заголовки, пункти списку та клітинки таблиці узгоджено з шаблоном.',
  changes: [changeHeading, changeListItem, changeTableCell, changeInserted, changeDeleted],
};
export const suggestionHeavy = {
  ...base, id: 's3', severity: 'low', group: 'policy', criterionId: 'policy-attendance', requiresReason: false,
  title: 'Перепишіть політику відвідування', changes: [changeHeavy],
};
export const suggestionAdvisory = {
  ...base, id: 's4', severity: 'critical', group: 'outcomes', criterionId: 'out-measurable', applicable: false, changes: [],
  title: 'Результати навчання не пов’язані з MBA-27',
  description: 'Автоматично виправити неможливо: потрібно вирішити, які компетенції курс розвиває насправді.',
};
export const suggestionConflict = {
  ...base, id: 's5', severity: 'high', title: 'Додайте груповий проєкт до оцінювання',
  conflictsWith: [{ suggestionId: 's6', title: 'Узгодьте вагу компонентів оцінювання' }],
};
export const suggestionAccepted = {
  ...base, id: 's6', status: 'accepted', severity: 'medium', requiresReason: false, title: 'Уточніть формулювання політики доброчесності',
};
export const suggestionRejected = {
  ...base, id: 's7', status: 'rejected', severity: 'high', rejectTag: 'not_relevant',
  decisionReason: 'Цей курс не передбачає групових робіт.', title: 'Додайте командні завдання',
};
export const suggestionChoice = {
  ...base, id: 's8', kind: 'choice', severity: 'medium', group: 'practice', criterionId: 'practice-cases', requiresReason: false,
  title: 'Оберіть кейс для теми «Фінансова стратегія»', changes: [],
  description: 'Є два варіанти кейсу. Оберіть той, що краще пасує до вашої аудиторії.',
  options: [
    {
      id: 'o1', label: 'Кейс Нова пошта', rationale: 'Український приклад масштабування логістики.',
      changes: [{ blockId: 'b0080', op: 'insertAfter', kind: 'paragraph', after: 'Кейс: «Нова пошта — масштабування мережі».', parts: [p('ins', 'Кейс: «Нова пошта — масштабування мережі».')] }],
    },
    {
      id: 'o2', label: 'Кейс Monobank', rationale: 'Приклад цифрового банкінгу.',
      changes: [{ blockId: 'b0080', op: 'insertAfter', kind: 'paragraph', after: 'Кейс: «Monobank — продукт без відділень».', parts: [p('ins', 'Кейс: «Monobank — продукт без відділень».')] }],
    },
  ],
};
export const suggestionQuestion = {
  ...base, id: 's9', kind: 'question', severity: 'high', group: 'assessment', criterionId: 'assess-dates', applicable: false, changes: [],
  title: 'Потрібні дати здачі завдань',
  question: 'У силабусі немає дат здачі завдань. Вкажіть, будь ласка, дедлайни для кожного з трьох завдань.',
};

export const allSuggestions = [
  suggestionEdit, suggestionManyKinds, suggestionHeavy, suggestionAdvisory, suggestionConflict,
  suggestionAccepted, suggestionRejected, suggestionChoice, suggestionQuestion,
];

export const readiness = {
  score: 62,
  breakdown: { template: 80, outcomes: 40, assessment: 60, practice: 100, policy: 50 },
  counts: { pending: 6, accepted: 1, rejected: 1, total: 8 },
};

export const documentPreviewBlocks = [
  { blockId: 'b0001', kind: 'heading', level: 1, status: 'unchanged', parts: [p('eq', 'Силабус курсу «Фінансовий менеджмент»')] },
  { blockId: 'b0002', kind: 'paragraph', level: null, status: 'unchanged', parts: [p('eq', 'Курс розрахований на слухачів програми MBA.')] },
  { blockId: 'b0010', kind: 'heading', level: 2, status: 'changed', parts: changeHeading.parts },
  { blockId: 'b0042', kind: 'paragraph', level: null, status: 'changed', parts: diffInline },
  { blockId: 'b0021', kind: 'list-item', level: 1, status: 'changed', parts: changeListItem.parts },
  { blockId: 'b0090', kind: 'table-cell', level: null, status: 'changed', parts: changeTableCell.parts },
  { blockId: 'b0050n', kind: 'paragraph', level: null, status: 'inserted', parts: changeInserted.parts },
  { blockId: 'b0061', kind: 'paragraph', level: null, status: 'deleted', parts: changeDeleted.parts },
  { blockId: 'b0099', kind: 'paragraph', level: null, status: 'unchanged', parts: [p('eq', 'Контактна інформація викладача вказана на сайті школи.')] },
];

export const messages = [
  { _id: 'm1', role: 'ai', kind: 'text', content: 'Вітаю! Я проаналізував силабус і підготував **кілька пропозицій**. Проходимо по одній.' },
  { _id: 'm2', role: 'ai', kind: 'suggestion', relatedSuggestionId: 's1' },
  { _id: 'm3', role: 'user', kind: 'text', content: 'Зробіть коротше, будь ласка' },
  { _id: 'm4', role: 'ai', kind: 'submission-cta', content: 'Усі пропозиції опрацьовано. Можна надсилати директору.' },
];
