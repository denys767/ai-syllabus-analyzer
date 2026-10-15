const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const {
  extractDocx, writeDocx, acceptAllRevisions, rejectAllRevisions, isConverterAvailable, toPdf,
} = require('../../services/document');
const { scanParagraphRanges } = require('../../services/document/ooxml');
const { fixture, documentXml, partXml, byText, texts } = require('./helpers');

const DATE = '2026-10-15T00:00:00Z';
const lo = isConverterAvailable() ? test : test.skip;

function paragraphsXml(xml) {
  return scanParagraphRanges(xml, 'w').map((r) => xml.slice(r.start, r.end));
}

function parseStrict(xml) {
  return new DOMParser({ onError(level, msg) { if (level !== 'warning') throw new Error(msg); } })
    .parseFromString(xml, 'text/xml');
}

const visibleTexts = async (buf) => texts(await extractDocx(buf));

describe('writeDocx на syllabus.docx', () => {
  let original;
  let doc;
  let id;
  beforeAll(async () => {
    original = fixture('syllabus.docx');
    doc = await extractDocx(original);
    id = (text) => byText(doc, text).id;
  });

  const sentence = 'Курс триває 10 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.';

  function suggestions() {
    return [
      { id: 's1', rationale: 'Уточнити тривалість і форму іспиту.', ops: [{ op: 'replaceBlock', blockId: id(sentence), newText: 'Курс триває 12 тижнів і завершується усним іспитом. Викладач: доц. Іваненко.' }] },
      { id: 's2', rationale: 'Додати вимірюваний результат.', ops: [{ op: 'insertAfter', blockId: id('Формулювати стратегію розвитку бізнесу.'), newBlocks: [{ kind: 'list-item', text: 'Оцінювати ризики стратегії.' }] }] },
      { id: 's3', ops: [{ op: 'deleteBlock', blockId: id('Публічні виступи') }] },
      { id: 's4', ops: [{ op: 'replaceBlock', blockId: id('Матеріали курсу доступні на сторінці програми (English: course materials are on the program page).'), newText: 'Матеріали курсу доступні на сторінці програми (English: all course materials are on the program page).' }] },
      { id: 's5', ops: [{ op: 'replaceBlock', blockId: doc.blocks.find((b) => b.kind === 'table-cell' && b.text === '').id, newText: 'Rozetka' }] },
      { id: 's6', ops: [{ op: 'insertAfter', blockId: id('4. Оцінювання'), newBlocks: [{ kind: 'paragraph', text: 'Оцінювання прозоре.' }, { kind: 'heading', level: 2, text: '4.1 Критерії' }] }] },
    ];
  }

  test('1. без правок: document.xml ідентичний, текст ідентичний', async () => {
    for (const mode of ['clean', 'tracked']) {
      const out = await writeDocx(original, doc, [], { mode });
      expect(await documentXml(out)).toBe(await documentXml(original));
      expect(await visibleTexts(out)).toEqual(texts(doc));
    }
  });

  test('2. одна replaceBlock змінює лише свій абзац, форматування навколо збережене', async () => {
    const out = await writeDocx(original, doc, [suggestions()[0]], { mode: 'clean' });
    const before = paragraphsXml(await documentXml(original));
    const after = paragraphsXml(await documentXml(out));
    expect(after).toHaveLength(before.length);
    const changed = after.map((x, i) => (x === before[i] ? null : i)).filter((i) => i !== null);
    expect(changed).toEqual([byText(doc, sentence).locator.docx.paraIndex]);
    // решта XML (sectPr, footer-посилання тощо) теж незмінна
    const strip = (xml, paras) => paras.reduce((s, p) => s.replace(p, ''), xml);
    expect(strip(await documentXml(out), after)).toBe(strip(await documentXml(original), before));

    const p = after[changed[0]];
    expect(p).toContain('<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">12</w:t></w:r>');
    expect(p).toContain('<w:rPr><w:i/><w:iCs/></w:rPr><w:t xml:space="preserve">усним</w:t>');
    expect(p).toContain('<w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve"> тижнів</w:t>');
    expect(await visibleTexts(out)).toContain('Курс триває 12 тижнів і завершується усним іспитом. Викладач: доц. Іваненко.');
  });

  test('2b. правка всередині гіперпосилання і поруч з ним', async () => {
    const out = await writeDocx(original, doc, [{ id: 'h', ops: [{ op: 'replaceBlock', blockId: id('Матеріали курсу доступні на сторінці програми (English: course materials are on the program page).'), newText: 'Матеріали доступні на офіційній сторінці програми (English: course materials are on the program page).' }] }], { mode: 'tracked', date: DATE });
    const xml = await documentXml(out);
    expect(xml).toMatch(/<w:hyperlink [^>]*><w:ins [^>]*><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr><w:t xml:space="preserve">офіційній <\/w:t><\/w:r><\/w:ins>|<w:ins [^>]*><w:r><w:t xml:space="preserve">офіційній <\/w:t><\/w:r><\/w:ins><w:hyperlink/);
    expect(await visibleTexts(await acceptAllRevisions(out))).toContain('Матеріали доступні на офіційній сторінці програми (English: course materials are on the program page).');
  });

  test('3. tracked: accept all == clean, reject all == оригінал, id унікальні, XML валідний', async () => {
    const accepted = suggestions();
    const clean = await writeDocx(original, doc, accepted, { mode: 'clean' });
    const tracked = await writeDocx(original, doc, accepted, { mode: 'tracked', date: DATE, comments: true });

    const xml = await documentXml(tracked);
    expect(() => parseStrict(xml)).not.toThrow();
    expect(() => parseStrict(xml.replace(/^<\?xml[^>]*\?>/, ''))).not.toThrow();

    const ids = [...xml.matchAll(/<w:(ins|del) w:id="(\d+)"/g)].map((m) => m[2]);
    expect(ids.length).toBeGreaterThan(6);
    expect(new Set(ids).size).toBe(ids.length);
    // існуючі ревізії фікстури (101/102) лишаються, нові id їх не повторюють
    expect(ids.filter((x) => x === '101' || x === '102')).toEqual(['101', '102']);
    expect(xml).toContain('w:author="KSE Syllabus Analyzer"');

    const accepted_ = await visibleTexts(await acceptAllRevisions(tracked));
    const cleanTexts = await visibleTexts(clean);
    // у фікстурі вже є чужа tracked change; accept приймає і її, тому порівнюємо з accept(clean)
    expect(accepted_).toEqual(await visibleTexts(await acceptAllRevisions(clean)));
    expect(cleanTexts).toContain('Оцінювати ризики стратегії.');
    expect(cleanTexts).not.toContain('Публічні виступи');
    expect(cleanTexts).toContain('Rozetka');

    expect(await visibleTexts(await rejectAllRevisions(tracked))).toEqual(await visibleTexts(await rejectAllRevisions(original)));
    // accept(tracked) і clean структурно однакові: однакова кількість абзаців
    const count = async (b) => paragraphsXml(await documentXml(await acceptAllRevisions(b))).length;
    expect(await count(tracked)).toBe(await count(clean));
  });

  test('3b. коментарі з rationale: comments.xml, rel, content type', async () => {
    const tracked = await writeDocx(original, doc, suggestions(), { mode: 'tracked', date: DATE, comments: true });
    const comments = await partXml(tracked, 'word/comments.xml');
    expect(comments).toContain('Уточнити тривалість і форму іспиту.');
    expect(comments).toContain('Додати вимірюваний результат.');
    expect(() => parseStrict(comments)).not.toThrow();
    expect(await partXml(tracked, 'word/_rels/document.xml.rels')).toContain('relationships/comments');
    expect(await partXml(tracked, '[Content_Types].xml')).toContain('/word/comments.xml');
    const xml = await documentXml(tracked);
    const commentIds = [...comments.matchAll(/<w:comment w:id="(\d+)"/g)].map((m) => m[1]);
    for (const cid of commentIds) {
      expect(xml).toContain(`<w:commentRangeStart w:id="${cid}"/>`);
      expect(xml).toContain(`<w:commentReference w:id="${cid}"/>`);
    }
    // clean ніколи не містить коментарів і ревізій
    const clean = await writeDocx(original, doc, suggestions(), { mode: 'clean', comments: true });
    expect(await partXml(clean, 'word/comments.xml')).toBeNull();
    expect(await documentXml(clean)).not.toMatch(/KSE Syllabus Analyzer/);
  });

  test('4. insertAfter у нумерованому списку зберігає numPr; deleteBlock позначає знак абзацу', async () => {
    const accepted = suggestions().filter((s) => ['s2', 's3'].includes(s.id));
    const tracked = await documentXml(await writeDocx(original, doc, accepted, { mode: 'tracked', date: DATE }));
    const paras = paragraphsXml(tracked);
    const anchor = paras.find((p) => p.includes('Формулювати стратегію'));
    const numPr = anchor.match(/<w:numPr>.*?<\/w:numPr>/)[0];
    const inserted = paras.find((p) => p.includes('Оцінювати ризики стратегії.'));
    expect(inserted).toContain(numPr);
    expect(inserted).toMatch(/<w:pPr>.*<w:rPr><w:ins w:id="\d+" w:author="KSE Syllabus Analyzer" w:date="2026-10-15T00:00:00Z"\/><\/w:rPr><\/w:pPr>/);
    expect(paras.indexOf(inserted)).toBe(paras.indexOf(anchor) + 1);

    const deleted = paras.find((p) => p.includes('Публічні виступи'));
    expect(deleted).toMatch(/<w:pPr>.*<w:rPr><w:del w:id="\d+"[^>]*\/><\/w:rPr><\/w:pPr>/);
    expect(deleted).toMatch(/<w:del [^>]*><w:r><w:delText xml:space="preserve">Публічні виступи<\/w:delText><\/w:r><\/w:del>/);
    expect(deleted).not.toMatch(/<w:t[ >]/);

    const clean = paragraphsXml(await documentXml(await writeDocx(original, doc, accepted, { mode: 'clean' })));
    expect(clean.find((p) => p.includes('Оцінювати ризики стратегії.'))).toContain(numPr);
    expect(clean.some((p) => p.includes('Публічні виступи'))).toBe(false);
    expect(clean).toHaveLength(paras.length - 1);
  });

  test('4b. вставлений абзац і заголовок беруть шаблон відповідного типу', async () => {
    const out = await writeDocx(original, doc, [suggestions()[5]], { mode: 'clean' });
    const paras = paragraphsXml(await documentXml(out));
    const para = paras.find((p) => p.includes('Оцінювання прозоре.'));
    const heading = paras.find((p) => p.includes('4.1 Критерії'));
    expect(para).not.toContain('Heading');
    expect(heading).toContain('<w:pStyle w:val="Heading2"/>');
    const after = await extractDocx(out);
    expect(byText(after, '4.1 Критерії')).toMatchObject({ kind: 'heading', level: 2 });
    expect(byText(after, 'Оцінювання прозоре.').kind).toBe('paragraph');
  });

  test('помилки: stale, конфлікти, readOnly', async () => {
    await expect(writeDocx(fixture('tricky.docx'), doc, [], {})).rejects.toMatchObject({ statusCode: 409, code: 'STALE_DOC_VERSION' });
    const a = { id: 'a', ops: [{ op: 'replaceBlock', blockId: id(sentence), newText: sentence.replace('10', '12') }] };
    const b = { id: 'b', ops: [{ op: 'replaceBlock', blockId: id(sentence), newText: sentence.replace('10', '14') }] };
    await expect(writeDocx(original, doc, [a, b], {})).rejects.toMatchObject({ statusCode: 409, code: 'SUGGESTION_CONFLICT' });
    const ro = { id: 'r', ops: [{ op: 'replaceBlock', blockId: id('Підсумкова оцінка складається з чотирьох компонентів.'), newText: 'x' }] };
    await expect(writeDocx(original, doc, [ro], {})).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_OPS' });
  });

  test('ідемпотентність: однаковий вхід — однаковий document.xml', async () => {
    const one = await writeDocx(original, doc, suggestions(), { mode: 'tracked', date: DATE, comments: true });
    const two = await writeDocx(original, doc, suggestions(), { mode: 'tracked', date: DATE, comments: true });
    expect(await documentXml(one)).toBe(await documentXml(two));
  });

  lo('3c. LibreOffice конвертує tracked-версію в PDF і показує правки', async () => {
    const tracked = await writeDocx(original, doc, suggestions(), { mode: 'tracked', date: DATE, comments: true });
    const pdf = await toPdf(tracked, 'docx');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 120000);
});

describe('writeDocx на tricky.docx', () => {
  let original;
  let doc;
  beforeAll(async () => {
    original = fixture('tricky.docx');
    doc = await extractDocx(original);
  });

  test('5. правки поруч із полями/виносками не чіпають атомарні елементи', async () => {
    const footnote = byText(doc, 'Див. примітку щодо дедлайнів.');
    const split = byText(doc, 'Методи оцінювання: Assessment та Київ.');
    const tabs = byText(doc, 'Колонка А\tКолонка Б\nДругий рядок');
    const shape = byText(doc, 'Текст із фігурою  після фігури.');
    const accepted = [
      { id: 'f', ops: [{ op: 'replaceBlock', blockId: footnote.id, newText: 'Див. примітку щодо всіх дедлайнів курсу.' }] },
      { id: 's', ops: [{ op: 'replaceBlock', blockId: split.id, newText: 'Методи оцінювання: Self-assessment та Київ.' }] },
      { id: 't', ops: [{ op: 'replaceBlock', blockId: tabs.id, newText: 'Колонка А\tКолонка В\nТретій рядок' }] },
      { id: 'd', ops: [{ op: 'deleteBlock', blockId: shape.id }] },
      { id: 'n', ops: [{ op: 'insertAfter', blockId: byText(doc, 'Другий пункт').id, newBlocks: [{ kind: 'list-item', text: 'Третій пункт' }] }] },
      { id: 'c', ops: [{ op: 'replaceBlock', blockId: byText(doc, 'Вкладена клітинка').id, newText: 'Оновлена вкладена клітинка' }] },
      { id: 'e', ops: [{ op: 'replaceBlock', blockId: byText(doc, "Ім'я студента: Олена").id, newText: "Ім'я слухача: Олена" }] },
    ];
    for (const mode of ['clean', 'tracked']) {
      const out = await writeDocx(original, doc, accepted, { mode, date: DATE });
      const xml = await documentXml(out);
      expect(() => parseStrict(xml)).not.toThrow();
      // поля і TOC незмінні байт-у-байт
      const before = paragraphsXml(await documentXml(original));
      for (const b of doc.blocks.filter((x) => x.readOnly)) expect(xml).toContain(before[b.locator.docx.paraIndex]);
      expect(xml).toContain('<w:footnoteReference w:id="1"/>');
      const resolved = mode === 'tracked' ? await acceptAllRevisions(out) : out;
      const t = await visibleTexts(resolved);
      expect(t).toEqual(expect.arrayContaining([
        'Див. примітку щодо всіх дедлайнів курсу.',
        'Методи оцінювання: Self-assessment та Київ.',
        'Колонка А\tКолонка В\nТретій рядок',
        'Третій пункт',
        'Оновлена вкладена клітинка',
        "Ім'я слухача: Олена",
      ]));
      expect(t).not.toContain('Текст із фігурою  після фігури.');
      // існуюча чужа правка лишається як є
      expect(xml).toContain('<w:ins w:id="7" w:author="Reviewer"');
    }
    const tracked = await documentXml(await writeDocx(original, doc, accepted, { mode: 'tracked', date: DATE }));
    // footnoteReference лишається поза w:del / w:ins
    expect(tracked).toMatch(/<\/w:del><\/?w:(ins|r)[^>]*>(?:(?!<w:del).)*<w:footnoteReference w:id="1"\/>|<w:r><w:rPr><w:vertAlign w:val="superscript"\/><\/w:rPr><w:footnoteReference w:id="1"\/><\/w:r>/);
    const maxExisting = 8;
    const ids = [...tracked.matchAll(/<w:(ins|del) w:id="(\d+)"/g)].map((m) => Number(m[2]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids.filter((x) => x > maxExisting))).toBeGreaterThan(maxExisting);
  });

  test('5b. readOnly-блоки (поля, TOC, чужі правки) відхиляються', async () => {
    for (const text of ['Дата документа: 15.01.2026', 'Сторінка 1', 'Вступ\t1', 'Існуюча правка: вставлено']) {
      const s = { id: 'x', ops: [{ op: 'replaceBlock', blockId: byText(doc, text).id, newText: 'Інше' }] };
      await expect(writeDocx(original, doc, [s], { mode: 'tracked' })).rejects.toMatchObject({ code: 'INVALID_OPS' });
    }
  });

  lo('LibreOffice відкриває tracked-версію tricky.docx', async () => {
    const s = [{ id: 'f', ops: [{ op: 'deleteBlock', blockId: byText(doc, 'Абзац у блоковому контролі вмісту.').id }] }];
    const pdf = await toPdf(await writeDocx(original, doc, s, { mode: 'tracked' }), 'docx');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 120000);
});

describe('кирилиця', () => {
  test('7. word-level diff у DOCX: змінюються лише змінені слова', async () => {
    const original = fixture('syllabus.docx');
    const doc = await extractDocx(original);
    const block = byText(doc, 'Академічна доброчесність: плагіат неприпустимий.');
    const out = await writeDocx(original, doc, [{ id: 'k', ops: [{ op: 'replaceBlock', blockId: block.id, newText: 'Академічна доброчесність: плагіат і списування неприпустимі.' }] }], { mode: 'tracked', date: DATE });
    const p = paragraphsXml(await documentXml(out))[block.locator.docx.paraIndex];
    const deleted = [...p.matchAll(/<w:delText[^>]*>([^<]*)<\/w:delText>/g)].map((m) => m[1]);
    const inserted = [...p.matchAll(/<w:ins [^>]*><w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    expect(deleted).toEqual(['неприпустимий']);
    expect(inserted).toEqual(['і списування неприпустимі']);
    expect(p).toContain('<w:t xml:space="preserve">Академічна доброчесність: плагіат </w:t>');
    expect(Buffer.from(p, 'utf8').toString('utf8')).toBe(p);
    expect(p).not.toMatch(/�/);
  });
});

describe('граничні випадки структури', () => {
  let original;
  let doc;
  beforeAll(async () => {
    original = fixture('syllabus.docx');
    doc = await extractDocx(original);
  });

  test('видалення останнього абзацу тіла і єдиного абзацу клітинки не ламає структуру', async () => {
    const last = byText(doc, 'Академічна доброчесність: плагіат неприпустимий.');
    const cell = byText(doc, 'Monobank');
    const accepted = [
      { id: 'a', ops: [{ op: 'deleteBlock', blockId: last.id }] },
      { id: 'b', ops: [{ op: 'deleteBlock', blockId: cell.id }] },
    ];
    const clean = await writeDocx(original, doc, accepted, { mode: 'clean' });
    const tracked = await writeDocx(original, doc, accepted, { mode: 'tracked', date: DATE });
    const cleanXml = await documentXml(clean);
    // клітинка зберігає обов'язковий w:p, тіло — останній абзац перед sectPr
    const emptyP = '(?:<w:p/>|<w:p>(?:<w:pPr>(?:(?!</w:pPr>).)*</w:pPr>)?</w:p>)';
    expect(paragraphsXml(cleanXml)[cell.locator.docx.paraIndex]).toMatch(new RegExp(`^${emptyP}$`));
    expect(cleanXml).toMatch(new RegExp(`${emptyP}<w:sectPr`));
    const trackedXml = await documentXml(tracked);
    // знак останнього абзацу клітинки/тіла не видаляється
    const cellPara = paragraphsXml(trackedXml)[cell.locator.docx.paraIndex];
    expect(cellPara).toContain('<w:delText xml:space="preserve">Monobank</w:delText>');
    expect(cellPara).not.toMatch(/<w:rPr><w:del /);
    for (const buf of [clean, await acceptAllRevisions(tracked)]) {
      const t = await visibleTexts(buf);
      expect(t).not.toContain('Monobank');
      expect(t).not.toContain(last.text);
    }
    expect(paragraphsXml(await documentXml(await acceptAllRevisions(tracked))).length)
      .toBe(paragraphsXml(cleanXml).length);
  });

  test('insertAfter у клітинці таблиці лишається в тій самій клітинці', async () => {
    const cell = byText(doc, 'Вступ до стратегії');
    const out = await writeDocx(original, doc, [{ id: 'c', ops: [{ op: 'insertAfter', blockId: cell.id, newBlocks: [{ kind: 'paragraph', text: 'Читання: HBR, глава 1' }] }] }], { mode: 'tracked', date: DATE });
    const after = await extractDocx(await acceptAllRevisions(out));
    expect(byText(after, 'Читання: HBR, глава 1')).toMatchObject({ kind: 'table-cell', cell: cell.cell });
  });

  test('видалення абзацу перед таблицею', async () => {
    const before = byText(doc, '3. Розклад занять');
    const accepted = [{ id: 'd', ops: [{ op: 'deleteBlock', blockId: before.id }] }];
    const tracked = await writeDocx(original, doc, accepted, { mode: 'tracked', date: DATE });
    const clean = await writeDocx(original, doc, accepted, { mode: 'clean' });
    expect(await visibleTexts(await acceptAllRevisions(tracked))).toEqual(await visibleTexts(clean));
    expect(await visibleTexts(clean)).not.toContain('3. Розклад занять');
  });
});
