const {
  diffBlock, changeRatio, merge3, validateOps, validateSuggestion, applyAccepted, findConflicts, previewChanges,
} = require('../../services/document/apply');

function makeDoc() {
  const texts = [
    ['heading', 'Оцінювання'],
    ['paragraph', 'Курс триває 10 тижнів і завершується письмовим іспитом.'],
    ['list-item', 'Командна робота'],
    ['list-item', 'Публічні виступи'],
    ['paragraph', 'Дата: 15.01.2026'],
  ];
  const blocks = texts.map(([kind, text], i) => ({
    id: `b000${i + 1}`, kind, text, sectionId: 'b0001', locator: { docx: { paraIndex: i } },
  }));
  blocks[4].readOnly = true;
  blocks[4].readOnlyReason = 'field';
  return { format: 'docx', docVersion: 'x', blocks, meta: {} };
}

const S = (id, ops, extra = {}) => ({ id, ops, ...extra });
const replace = (blockId, newText) => ({ op: 'replaceBlock', blockId, newText });

describe('diffBlock', () => {
  test('кирилиця порівнюється на рівні слів', () => {
    const parts = diffBlock('Курс триває 10 тижнів і має іспит.', 'Курс триває 12 тижнів і має письмовий іспит.');
    expect(parts).toEqual([
      { type: 'equal', text: 'Курс триває ' },
      { type: 'delete', text: '10' },
      { type: 'insert', text: '12' },
      { type: 'equal', text: ' тижнів і має ' },
      { type: 'insert', text: 'письмовий ' },
      { type: 'equal', text: 'іспит.' },
    ]);
  });

  test('слово з апострофом — один токен, слова не ріжуться посередині', () => {
    const parts = diffBlock("Ім'я студента", "Ім'я слухача");
    expect(parts).toEqual([
      { type: 'equal', text: "Ім'я " },
      { type: 'delete', text: 'студента' },
      { type: 'insert', text: 'слухача' },
    ]);
  });

  test('сусідні заміни зливаються через пробіл; склеювання частин дає обидва тексти', () => {
    const a = 'Оцінка складається з трьох компонентів';
    const b = 'Оцінка формується з чотирьох частин';
    const parts = diffBlock(a, b);
    expect(parts.filter((p) => p.type !== 'insert').map((p) => p.text).join('')).toBe(a);
    expect(parts.filter((p) => p.type !== 'delete').map((p) => p.text).join('')).toBe(b);
    expect(parts).toContainEqual({ type: 'delete', text: 'трьох компонентів' });
  });

  test('емодзі та сурогатні пари не ламаються', () => {
    const parts = diffBlock('Мета 🎯 курсу', 'Мета 🚀 курсу');
    expect(parts).toEqual([
      { type: 'equal', text: 'Мета ' }, { type: 'delete', text: '🎯' }, { type: 'insert', text: '🚀' }, { type: 'equal', text: ' курсу' },
    ]);
  });

  test('changeRatio', () => {
    expect(changeRatio('a b c', 'a b c')).toBe(0);
    expect(changeRatio('abc', 'xyz')).toBe(1);
  });
});

describe('merge3', () => {
  const base = 'Курс триває 10 тижнів і має іспит.';
  test('неперетинні хунки зливаються', () => {
    expect(merge3(base, 'Курс триває 12 тижнів і має іспит.', 'Курс триває 10 тижнів і має письмовий іспит.'))
      .toEqual({ ok: true, text: 'Курс триває 12 тижнів і має письмовий іспит.' });
  });
  test('перетин — конфлікт', () => {
    const r = merge3(base, 'Курс триває 12 тижнів і має іспит.', 'Курс триває 14 тижнів і має іспит.');
    expect(r.ok).toBe(false);
    expect(r.conflicts[0]).toMatchObject({ base: '10', a: '12', b: '14' });
  });
});

describe('validateOps', () => {
  const doc = makeDoc();
  test('коректні операції', () => {
    expect(validateOps(doc, [
      replace('b0002', 'Курс триває 12 тижнів.'),
      { op: 'insertAfter', blockId: 'b0002', newBlocks: [{ kind: 'paragraph', text: 'Новий абзац' }] },
      { op: 'deleteBlock', blockId: 'b0004' },
    ])).toEqual([]);
  });

  test('точні помилки', () => {
    const codes = (ops, opts) => validateOps(doc, ops, opts).map((e) => e.code);
    expect(codes([])).toEqual(['NO_OPS']);
    expect(codes([{ op: 'rewrite', blockId: 'b0002' }])).toEqual(['UNKNOWN_OP']);
    expect(codes([replace('b9999', 'x')])).toEqual(['UNKNOWN_BLOCK']);
    expect(codes([replace('b0005', 'Дата: сьогодні')])).toEqual(['READ_ONLY_BLOCK']);
    expect(codes([{ op: 'deleteBlock', blockId: 'b0005' }])).toEqual(['READ_ONLY_BLOCK']);
    expect(codes([replace('b0002', '   ')])).toEqual(['EMPTY_TEXT']);
    expect(codes([replace('b0002', doc.blocks[1].text)])).toEqual(['NO_CHANGE']);
    expect(codes([replace('b0002', doc.blocks[1].text)], { strict: false })).toEqual([]);
    expect(codes([replace('b0002', 'Рядок 1\n\nРядок 2')])).toEqual(['MULTI_PARAGRAPH_TEXT']);
    expect(codes([replace('b0002', 'bad\u0001char')])).toEqual(['INVALID_CHARS']);
    expect(codes([replace('b0002', 'a'), replace('b0002', 'b')])).toEqual(['DUPLICATE_BLOCK_OP']);
    expect(codes([replace('b0002', 'a'), { op: 'deleteBlock', blockId: 'b0002' }])).toEqual(['DUPLICATE_BLOCK_OP']);
    expect(codes([{ op: 'insertAfter', blockId: 'b0002', newBlocks: [] }])).toEqual(['EMPTY_TEXT']);
    expect(codes([{ op: 'insertAfter', blockId: 'b0002', newBlocks: [{ kind: 'table', text: 'x' }] }])).toEqual(['BAD_BLOCK_KIND']);
  });

  test('replaceBlock + insertAfter на одному блоці дозволені', () => {
    expect(validateOps(doc, [replace('b0002', 'Новий текст'), { op: 'insertAfter', blockId: 'b0002', newBlocks: [{ kind: 'paragraph', text: 'ще' }] }])).toEqual([]);
  });

  test('validateSuggestion перевіряє id і supersedes', () => {
    expect(validateSuggestion(doc, { ops: [replace('b0002', 'x')], supersedes: 's1' }).map((e) => e.code))
      .toEqual(['BAD_SUGGESTION', 'BAD_SUGGESTION']);
  });
});

describe('applyAccepted', () => {
  const doc = makeDoc();
  const sA = S('A', [replace('b0002', 'Курс триває 12 тижнів і завершується письмовим іспитом.')]);
  const sB = S('B', [replace('b0002', 'Курс триває 10 тижнів і завершується усним іспитом.')]);
  const sC = S('C', [replace('b0002', 'Курс триває 14 тижнів і завершується письмовим іспитом.')]);
  const ins1 = S('I1', [{ op: 'insertAfter', blockId: 'b0003', newBlocks: [{ kind: 'list-item', text: 'Лідерство' }] }]);
  const ins2 = S('I2', [{ op: 'insertAfter', blockId: 'b0003', newBlocks: [{ kind: 'list-item', text: 'Переговори' }, { kind: 'list-item', text: 'Етика' }] }]);
  const del = S('D', [{ op: 'deleteBlock', blockId: 'b0004' }]);

  test('без прийнятих — оригінал без змін', () => {
    const r = applyAccepted(doc, []);
    expect(r.blocks.map((b) => b.text)).toEqual(doc.blocks.map((b) => b.text));
    expect(r.changes).toEqual([]);
  });

  test('неперетинні replaceBlock на одному блоці зливаються', () => {
    const r = applyAccepted(doc, [sA, sB]);
    expect(r.conflicts).toEqual([]);
    expect(r.blocks[1]).toMatchObject({ text: 'Курс триває 12 тижнів і завершується усним іспитом.', status: 'changed' });
    expect(r.changes[0]).toMatchObject({ blockId: 'b0002', type: 'replace', suggestionIds: ['A', 'B'] });
  });

  test('перетин — конфлікт, раніше прийнята перемагає детерміновано', () => {
    const r = applyAccepted(doc, [sA, sC]);
    expect(r.conflicts).toEqual([expect.objectContaining({ blockId: 'b0002', reason: 'overlapping-edit', suggestionIds: ['A', 'C'] })]);
    expect(r.blocks[1].text).toBe(sA.ops[0].newText);
  });

  test('supersedes: перекрита операція ігнорується', () => {
    const merged = S('M', [replace('b0002', 'Курс триває 14 тижнів і завершується усним іспитом.')], { supersedes: ['A'] });
    const r = applyAccepted(doc, [sA, merged]);
    expect(r.conflicts).toEqual([]);
    expect(r.ignored).toEqual([{ suggestionId: 'A', blockId: 'b0002', op: 'replaceBlock', reason: 'superseded' }]);
    expect(r.blocks[1].text).toBe('Курс триває 14 тижнів і завершується усним іспитом.');
  });

  test('ідемпотентність і чистота', () => {
    const accepted = [sA, ins1, del];
    const snapshot = JSON.stringify(doc);
    expect(applyAccepted(doc, accepted)).toEqual(applyAccepted(doc, accepted));
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  test('кілька вставок після одного блоку — у порядку пропозицій', () => {
    const r1 = applyAccepted(doc, [ins1, ins2]).blocks.map((b) => b.text);
    expect(r1.slice(2, 6)).toEqual(['Командна робота', 'Лідерство', 'Переговори', 'Етика']);
    const r2 = applyAccepted(doc, [ins2, ins1]).blocks.map((b) => b.text);
    expect(r2.slice(2, 6)).toEqual(['Командна робота', 'Переговори', 'Етика', 'Лідерство']);
    const inserted = applyAccepted(doc, [ins1]).blocks[3];
    expect(inserted).toMatchObject({ id: 'b0003+I1.1', status: 'inserted', anchorId: 'b0003', kind: 'list-item' });
  });

  test('deleteBlock прибирає блок; вставка після видаленого блоку лишається', () => {
    const insAfterDeleted = S('X', [{ op: 'insertAfter', blockId: 'b0004', newBlocks: [{ kind: 'list-item', text: 'Замість виступів' }] }]);
    const texts = applyAccepted(doc, [del, insAfterDeleted]).blocks.map((b) => b.text);
    expect(texts).not.toContain('Публічні виступи');
    expect(texts[3]).toBe('Замість виступів');
  });

  test('replace vs delete — конфлікт', () => {
    const r = applyAccepted(doc, [del, S('R', [replace('b0004', 'Виступи')])]);
    expect(r.conflicts).toEqual([{ blockId: 'b0004', suggestionIds: ['D', 'R'], reason: 'replace-vs-delete' }]);
  });

  test('reopen = вилучення з множини прийнятих', () => {
    const all = applyAccepted(doc, [sA, ins1, del]);
    const reopened = applyAccepted(doc, [ins1, del]);
    expect(all.blocks[1].text).toBe(sA.ops[0].newText);
    expect(reopened.blocks[1].text).toBe(doc.blocks[1].text);
    expect(reopened.blocks.map((b) => b.text)).toContain('Лідерство');
  });
});

describe('findConflicts', () => {
  const doc = makeDoc();
  const sA = S('A', [replace('b0002', 'Курс триває 12 тижнів і завершується письмовим іспитом.')]);
  const del = S('D', [{ op: 'deleteBlock', blockId: 'b0002' }]);

  test('неперетинні — без конфліктів', () => {
    expect(findConflicts(doc, [sA], S('B', [replace('b0002', 'Курс триває 10 тижнів і завершується усним іспитом.')]))).toEqual([]);
  });
  test('перетин хунків', () => {
    expect(findConflicts(doc, [sA], S('C', [replace('b0002', 'Курс триває 14 тижнів і завершується письмовим іспитом.')])))
      .toEqual([{ suggestionId: 'A', blockId: 'b0002', reason: 'overlapping-edit' }]);
  });
  test('replace vs delete в обидва боки', () => {
    expect(findConflicts(doc, [del], sA)).toEqual([{ suggestionId: 'D', blockId: 'b0002', reason: 'replace-vs-delete' }]);
    expect(findConflicts(doc, [sA], del)).toEqual([{ suggestionId: 'A', blockId: 'b0002', reason: 'replace-vs-delete' }]);
  });
  test('supersedes знімає конфлікт', () => {
    const merged = S('M', [replace('b0002', 'Курс триває 14 тижнів і завершується письмовим іспитом.')], { supersedes: ['A'] });
    expect(findConflicts(doc, [sA], merged)).toEqual([]);
  });
  test('вставки і різні блоки не конфліктують', () => {
    const ins = S('I', [{ op: 'insertAfter', blockId: 'b0002', newBlocks: [{ kind: 'paragraph', text: 'x' }] }]);
    expect(findConflicts(doc, [sA, del], ins)).toEqual([]);
    expect(findConflicts(doc, [sA], S('Z', [replace('b0003', 'Інше')]))).toEqual([]);
  });
});

describe('previewChanges', () => {
  test('лише змінені блоки з diff', () => {
    const doc = makeDoc();
    const { entries } = previewChanges(doc, [
      S('A', [replace('b0002', 'Курс триває 12 тижнів і завершується письмовим іспитом.')]),
      S('I', [{ op: 'insertAfter', blockId: 'b0003', newBlocks: [{ kind: 'list-item', text: 'Лідерство' }] }]),
      S('D', [{ op: 'deleteBlock', blockId: 'b0004' }]),
    ]);
    expect(entries.map((e) => [e.blockId, e.status])).toEqual([
      ['b0002', 'changed'], ['b0003+I.1', 'inserted'], ['b0004', 'deleted'],
    ]);
    expect(entries[0].diff).toContainEqual({ type: 'insert', text: '12' });
  });
});
