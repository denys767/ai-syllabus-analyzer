// Збереження файлів, отриманих як Blob (завантаження .docx).

export function filenameFromDisposition(header) {
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

// Ім'я за замовчуванням, якщо сервер не передав Content-Disposition
export function docxFallbackName(title) {
  const base = String(title || 'syllabus').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'syllabus';
  return `${base}.docx`;
}
