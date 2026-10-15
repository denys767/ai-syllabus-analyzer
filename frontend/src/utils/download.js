import api from '../services/api';
import { describeError } from './apiError';

const FILE_LABELS = {
  'tracked.docx': 'DOCX з правками (tracked changes)',
  'clean.docx': 'Чистий DOCX',
  'tracked.pdf': 'PDF з правками',
  'annotated.pdf': 'Оригінальний PDF з примітками',
  'edited.pptx': 'Презентація з правками',
  'preview.pdf': 'PDF презентації з правками',
};

const file = (name) => ({ name, label: FILE_LABELS[name] });

// Набір файлів за форматом силабуса (docs/api-v3.md, «Фаза 5»). Запасний варіант, коли сервер
// не передав `syllabus.outputs`; для docx/doc і невідомого формату — класична трійка.
const OUTPUTS_BY_FORMAT = {
  pdf: ['annotated.pdf', 'tracked.docx', 'clean.docx', 'tracked.pdf'].map(file),
  pptx: ['edited.pptx', 'preview.pdf'].map(file),
  default: ['tracked.docx', 'clean.docx', 'tracked.pdf'].map(file),
};

// Головний файл і PDF для кабінету (відправлені силабуси)
const CABINET_BY_FORMAT = {
  pdf: ['annotated.pdf', 'tracked.docx'].map(file),
  pptx: ['edited.pptx', 'preview.pdf'].map(file),
  default: ['tracked.docx', 'tracked.pdf'].map(file),
};

const pick = (table, sourceFormat) => table[sourceFormat] || table.default;

export const outputsForFormat = (sourceFormat) => pick(OUTPUTS_BY_FORMAT, sourceFormat);

// Файли для кнопок: список із сервера, інакше за форматом.
export const syllabusOutputs = (syllabus) => (
  Array.isArray(syllabus?.outputs) && syllabus.outputs.length
    ? syllabus.outputs
    : outputsForFormat(syllabus?.sourceFormat)
);

// Кабінет: головний файл формату + другий (PDF для docx/pptx, DOCX для pdf), без чистої версії.
export const cabinetOutputs = (syllabus) => {
  if (Array.isArray(syllabus?.outputs) && syllabus.outputs.length) {
    const list = syllabus.outputs;
    const main = list[0];
    const second = list.find((o) => o.name !== main.name && o.name !== 'clean.docx');
    return second ? [main, second] : [main];
  }
  return pick(CABINET_BY_FORMAT, syllabus?.sourceFormat);
};

function filenameFromDisposition(header) {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // ігноруємо, пробуємо звичайне filename
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Завантажує фінальний файл силабуса. Повертає null або текст помилки.
export async function downloadOutput(syllabusId, name, fallbackBase = 'syllabus') {
  try {
    const response = await api.chat.downloadOutput(syllabusId, name);
    const filename = filenameFromDisposition(response.headers?.['content-disposition'])
      || `${fallbackBase}_${name}`;
    saveBlob(response.data, filename);
    return null;
  } catch (err) {
    return (await describeError(err, 'Не вдалося завантажити файл')).message;
  }
}
