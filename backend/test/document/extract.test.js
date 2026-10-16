const { extractDocx } = require('../../services/document/extractors/docx');
const { computeDocVersion, renderForPrompt, toPlainText } = require('../../services/document/model');
const { fixture, byText, texts } = require('./helpers');

describe('extractDocx: syllabus.docx', () => {
  let doc;
  beforeAll(async () => { doc = await extractDocx(fixture('syllabus.docx')); });

  test('docVersion = sha1 оригінальних байтів, id стабільні', async () => {
    expect(doc.docVersion).toBe(computeDocVersion(fixture('syllabus.docx')));
    expect(doc.blocks[0].id).toBe('b0001');
    const again = await extractDocx(fixture('syllabus.docx'));
    expect(again).toEqual(doc);
  });

  test('заголовки, списки, таблиця, sectionId', () => {
    const title = doc.blocks[0];
    expect(title).toMatchObject({ kind: 'heading', level: 0 });
    const h1 = byText(doc, '2. Результати навчання');
    expect(h1).toMatchObject({ kind: 'heading', level: 1, sectionId: h1.id });
    expect(byText(doc, '2.1 Навички')).toMatchObject({ kind: 'heading', level: 2 });

    const numbered = byText(doc, 'Формулювати стратегію розвитку бізнесу.');
    expect(numbered).toMatchObject({ kind: 'list-item', level: 1, listFormat: 'decimal', sectionId: h1.id });
    expect(byText(doc, 'Командна робота')).toMatchObject({ kind: 'list-item', listFormat: 'bullet' });

    const cell = byText(doc, 'Аналіз галузі (Porter Five Forces)');
    expect(cell).toMatchObject({ kind: 'table-cell', cell: { table: 0, row: 2, col: 1 } });
  });

  test('розбиті run-и з форматуванням і гіперпосилання склеюються в один текст', () => {
    expect(texts(doc)).toContain('Курс триває 10 тижнів і завершується письмовим іспитом. Викладач: доц. Іваненко.');
    expect(texts(doc)).toContain('Матеріали курсу доступні на сторінці програми (English: course materials are on the program page).');
  });

  test('порожні абзаци пропускаються, але порожня клітинка лишається блоком', () => {
    expect(doc.blocks.filter((b) => b.text === '' && b.kind !== 'table-cell')).toHaveLength(0);
    const empty = doc.blocks.find((b) => b.kind === 'table-cell' && b.text === '');
    expect(empty.cell).toEqual({ table: 0, row: 3, col: 2 });
    // paraIndex рахує всі w:p, тож після пропущеного порожнього абзацу є розрив
    const idx = doc.blocks.map((b) => b.locator.docx.paraIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(doc.meta.paragraphCount).toBeGreaterThan(doc.blocks.length);
  });

  test('існуюча tracked change: вставка — текст, видалення — ні, абзац readOnly', () => {
    const b = byText(doc, 'Підсумкова оцінка складається з чотирьох компонентів.');
    expect(b).toMatchObject({ readOnly: true, readOnlyReason: 'tracked-change' });
    expect(doc.meta.hasTrackedChanges).toBe(true);
  });

  test('колонтитул з полем PAGE не витягується', () => {
    expect(texts(doc).some((t) => t.includes('Сторінка'))).toBe(false);
  });

  test('renderForPrompt і toPlainText', () => {
    const prompt = renderForPrompt(doc);
    expect(prompt).toContain('[b0001] title Силабус');
    expect(prompt).toMatch(/\[b\d{4}\] • Командна робота/);
    expect(toPlainText(doc.blocks).split('\n')).toHaveLength(doc.blocks.length);
  });
});

describe('extractDocx: tricky.docx', () => {
  let doc;
  beforeAll(async () => { doc = await extractDocx(fixture('tricky.docx')); });

  test('TOC і поля — readOnly', () => {
    expect(byText(doc, 'Зміст')).toMatchObject({ readOnly: true, readOnlyReason: 'toc' });
    expect(byText(doc, 'Вступ\t1')).toMatchObject({ readOnly: true, readOnlyReason: 'toc' });
    expect(byText(doc, 'Дата документа: 15.01.2026')).toMatchObject({ readOnly: true, readOnlyReason: 'field' });
    expect(byText(doc, 'Сторінка 1')).toMatchObject({ readOnly: true, readOnlyReason: 'field' });
  });

  test('заголовок за назвою стилю (локалізований styleId) і paraId у локаторі', () => {
    const h = doc.blocks.find((b) => b.text === 'Вступ' && b.kind === 'heading');
    expect(h).toMatchObject({ level: 1, style: 'a1', locator: { docx: { paraId: '10000003' } } });
  });

  test('smartTag, proofErr, rsid-розриви, табуляція, розрив рядка, контроли вмісту', () => {
    expect(texts(doc)).toEqual(expect.arrayContaining([
      'Методи оцінювання: Assessment та Київ.',
      'Колонка А\tКолонка Б\nДругий рядок',
      "Ім'я студента: Олена",
      'Абзац у блоковому контролі вмісту.',
      'Див. примітку щодо дедлайнів.',
    ]));
  });

  test('текст напису не потрапляє ні в окремий блок, ні в абзац-власник', () => {
    expect(texts(doc).some((t) => t.includes('Текст у написі'))).toBe(false);
    expect(texts(doc)).toContain('Текст із фігурою  після фігури.');
  });

  test('вкладені таблиці', () => {
    expect(byText(doc, 'Вкладена клітинка').cell).toEqual({ table: 1, row: 0, col: 0 });
    expect(byText(doc, 'Зовнішня клітинка').cell).toEqual({ table: 0, row: 0, col: 0 });
  });

  test('NBSP і типографські лапки зберігаються як є', () => {
    expect(texts(doc)).toContain('Final paragraph in English with “smart quotes” and a non-breaking space.');
  });
});
