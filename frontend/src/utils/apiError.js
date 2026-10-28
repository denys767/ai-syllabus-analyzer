import { ERROR_MESSAGES, S } from '../strings';

// Текст для коду помилки api-v5; для SECTION_INCOMPLETE додаємо перелік прогалин з details.gaps.
function messageForCode(code, data) {
  const base = code ? ERROR_MESSAGES[code] : null;
  if (!base) return null;
  if (code === 'SECTION_INCOMPLETE' && Array.isArray(data?.gaps) && data.gaps.length) {
    return `${base} Still missing: ${data.gaps.join('; ')}.`;
  }
  return base;
}

// Витягує повідомлення, код і деталі з помилки Axios. Для responseType 'blob'
// тіло помилки теж приходить як Blob, тому його треба розпарсити окремо.
export async function describeError(err, fallback = S.errAction) {
  let data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch {
      data = null;
    }
  }
  const status = err?.response?.status || null;
  const code = data?.code || null;
  const message = messageForCode(code, data)
    || data?.message
    || (err?.code === 'ECONNABORTED' ? S.errTimeout : null)
    || err?.message
    || fallback;
  return { message, code, status, data: data || {} };
}
