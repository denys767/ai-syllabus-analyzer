// Допоміжні функції для parts: [{ type: 'eq' | 'del' | 'ins', text }]

export const HEAVY_REWRITE_RATIO = 0.6;

export function changeRatio(parts = []) {
  let changed = 0;
  let total = 0;
  parts.forEach((part) => {
    const len = (part.text || '').length;
    total += len;
    if (part.type !== 'eq') changed += len;
  });
  return total ? changed / total : 0;
}

export function beforeText(parts = []) {
  return parts.filter((p) => p.type !== 'ins').map((p) => p.text).join('');
}

export function afterText(parts = []) {
  return parts.filter((p) => p.type !== 'del').map((p) => p.text).join('');
}

// Тип зміни блоку за BlockChange.op / status. Контракт не фіксує точні значення op,
// тому порівнюємо за підрядком (insertAfter, insert, inserted → inserted).
export function blockChangeStatus(change) {
  const tag = String(change?.status || change?.op || '').toLowerCase();
  if (tag.includes('insert')) return 'inserted';
  if (tag.includes('delete')) return 'deleted';
  return 'changed';
}
