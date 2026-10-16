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

// BlockChange.op ∈ 'replaceBlock' | 'insertAfter' | 'deleteBlock' (docs/api-v3.md).
export function blockChangeStatus(change) {
  if (change?.op === 'insertAfter') return 'inserted';
  if (change?.op === 'deleteBlock') return 'deleted';
  return 'changed';
}
