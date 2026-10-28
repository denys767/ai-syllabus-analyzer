# services/document

У v5 модуль робить дві речі: **розбирає вхідний файл викладача на блоки** (`loadDocument`) і **генерує вихідний `.docx` за шаблоном KSE** зі `Syllabus.state` (`writers/templateDocx.js`). Файл викладача не редагується і не повертається: джерело правди — `Syllabus.state`, див. `docs/api-v5.md`.

Писачі tracked/clean `.docx`, PPTX і анотований PDF, застосування прийнятих правок до блоків (`apply`, 3-way merge, `revisions`), мапінг PDF-блоків, прев'ю і синтез `.docx` з PDF видалено у W3-J. Word-diff тепер у `services/syllabusState/diff.js`.

## Вхід

```
upload ─► loadDocument(buffer, 'docx'|'doc'|'pdf') ─► { doc: DocModel, convertedFrom: null|'doc' }
            ├─ docx: extractors/docx.js (обхід word/document.xml)
            ├─ doc:  convert.docToDocx (LibreOffice) → extractors/docx.js; docVersion = sha1 сконвертованого .docx
            └─ pdf:  extractors/pdf.js (pdf.js у worker thread: pdfRuntime.js + pdfWorker.js);
                     з локатора лишається лише { page } — bbox і рядки не потрібні й роздувають документ у БД
blocks ─► services/ai/parse (extractSlots → toState)
```

Робочого файлу немає: після `loadDocument` потрібні лише `doc.blocks`, `doc.docVersion`, `doc.meta` (зберігаються в `Syllabus.document`). Інші формати → 415 `UNSUPPORTED_FORMAT` (PPTX відхиляє ще маршрут upload, 400).

Помилки (`docError`, коди для `analysisRunner.PARSE_ERRORS`): `INVALID_DOCX` (422), `INVALID_PDF` (422), `PDF_NO_TEXT` (422, скан без текстового шару; OCR немає), `PDF_TIMEOUT` (504, `PDF_EXTRACT_TIMEOUT_MS`, 120 с), `SOFFICE_MISSING` (503), `SOFFICE_FAILED`, `CONVERSION_TIMEOUT` (504), `CONVERSION_FAILED` (422).

## DocModel

```js
{
  format: 'docx' | 'pdf',
  docVersion: '<sha1 байтів файлу, з якого розібрано блоки>',
  meta: { paragraphCount, hasTrackedChanges } | { pageCount },
  blocks: [{
    id: 'b0042',                 // за порядком обходу, стабільний для того самого файлу
    kind: 'heading' | 'paragraph' | 'list-item' | 'table-cell',
    text: '…',                   // \t — табуляція, \n — розрив рядка (w:br)
    level: 1,                    // heading: 0 = Title, 1..9; list-item: 1..9
    listFormat: 'bullet',        // numFmt для списків
    style: 'Heading1',           // лише docx
    sectionId: 'b0040',          // найближчий заголовок (для заголовка — він сам)
    readOnly, readOnlyReason,    // лише docx: поле, TOC, tracked change, locked контроль, складний вміст
    cell: { table, row, col },   // лише docx, для table-cell
    locator: { docx: { paraIndex, paraId? } } | { page },
  }],
}
```

- docx: усі `w:p` тіла в порядку документа, включно з клітинками і вкладеними таблицями; порожні абзаци поза таблицями пропускаються; текст береться з `w:hyperlink`, `w:smartTag`, `w:sdt`, `w:fldSimple`, `w:ins`, вміст `w:del` пропускається. Написи, колонтитули, виноски й коментарі не витягуються.
- pdf: абзаци з рядків pdf.js за евристиками (розмір шрифту → заголовок, відступ і міжрядковий інтервал → продовження абзацу, великі горизонтальні проміжки → окремі клітинки/колонки). Евристики можуть зливати сусідні абзаци чи колонки.

## Вихід (`writers/templateDocx.js`)

`renderSyllabusDocx(state, refs, { programLabel })` → `Buffer` `.docx` на бібліотеці `docx`: порядок і назви розділів — з `TemplateSection[]` програми (`refs.template`), стилі — `writers/templateStyles.js`, текст політик — зі стану. Кеш за `stateRevision` і перелік файлів — `services/outputs.js` + `services/outputFormats.js`. Тест: `test/document/templateDocx.test.js`.

## Інші файли

- `model.js` — `computeDocVersion` (sha1), `formatBlockId`, `toPlainText`.
- `ooxml.js` — читання WordprocessingML для екстрактора (парсинг, абзаци тіла, стилі, нумерація, «сплющення» тексту).
- `convert.js` — LibreOffice headless для `.doc → .docx` (профіль і тимчасовий каталог на задачу, черга `SOFFICE_CONCURRENCY`, `SOFFICE_TIMEOUT_MS`). LibreOffice потрібен лише для `.doc`.

Тести: `backend/test/document/` (`extract`, `pdf`, `convert`, `templateDocx`), `npm test`.
