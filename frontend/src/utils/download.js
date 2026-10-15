import api from '../services/api';
import { describeError } from './apiError';

export const OUTPUT_FILES = [
  { name: 'tracked.docx', label: 'DOCX з правками (tracked changes)' },
  { name: 'clean.docx', label: 'Чистий DOCX' },
  { name: 'tracked.pdf', label: 'PDF з правками' },
];

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
