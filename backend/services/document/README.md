# services/document

Модель документа з блоками, застосування прийнятих пропозицій і запис **того самого .docx**
у двох варіантах: чистий і з tracked changes (`w:ins`/`w:del`, які можна прийняти або відхилити у Word).
Модуль поки не підключений до маршрутів і чату (це наступна фаза). Тести: `backend/test/document/`, `npm test`.

## Потік

```
upload ─► loadDocument(buffer, 'docx'|'doc') ─► { buffer: docx, doc: DocModel }
                │ (.doc → .docx через LibreOffice)
LLM бачить renderForPrompt(doc) і повертає Suggestion.ops
validateSuggestion(doc, s)              ─► помилки для повтору LLM
findConflicts(doc, accepted, s)         ─► перед Confirm (409 SUGGESTION_CONFLICT)
previewChanges(doc, [s])                ─► картка: word-diff блоку
previewChanges(doc, accepted)           ─► прев'ю всього документа (лише змінені блоки)
buildOutputs(buffer, doc, accepted, { pdf: true }) ─► { clean, tracked, trackedPdf }
```

Зберігати треба `buffer`, повернений `loadDocument`. Для `.doc` це вже сконвертований `.docx`, і `doc.docVersion` = sha1 саме його байтів.

## DocModel

```js
{
  format: 'docx',
  docVersion: '<sha1 байтів .docx>',
  meta: { paragraphCount, hasTrackedChanges },
  blocks: [{
    id: 'b0042',                 // за порядком обходу, стабільний для того самого файлу
    kind: 'heading' | 'paragraph' | 'list-item' | 'table-cell',
    text: '…',                   // \t — табуляція, \n — розрив рядка (w:br)
    level: 1,                    // heading: 0 = Title, 1..9; list-item: 1..9
    listFormat: 'bullet',        // numFmt для списків
    style: 'Heading1',
    sectionId: 'b0040',          // найближчий заголовок (для заголовка — він сам)
    readOnly: true, readOnlyReason: 'field' | 'toc' | 'tracked-change' | 'locked-content-control' | 'complex-content',
    cell: { table: 0, row: 2, col: 1 },   // для table-cell (таблиці нумеруються pre-order, вкладені теж)
    locator: { docx: { paraIndex: 57, paraId: '1A2B3C4D' } },
  }],
}
```

- Обхід: усі `w:p` тіла в порядку документа, включно з клітинками і вкладеними таблицями. `paraIndex` — індекс серед **усіх** `w:p` тіла (також порожніх і з написів), тому локатори стабільні.
- Порожні абзаци поза таблицями пропускаються. Порожній абзац, що є єдиним у клітинці, лишається блоком (`text: ''`), щоб модель могла заповнити клітинку.
- Текст береться з `w:hyperlink`, `w:smartTag`, `w:sdt`, `w:fldSimple` і `w:ins`. Вміст `w:del` пропускається. Написи, колонтитули, виноски й коментарі у v1 не витягуються.
- `readOnly`: поля (`fldChar`/`instrText`/`fldSimple`), TOC, абзаци з наявними tracked changes, заблоковані контроли вмісту, формули/ruby тощо.

## Операції (формат відповіді моделі)

```jsonc
{ "id": "s_12", "rationale": "…", "supersedes": ["s_07"],   // supersedes опційне
  "ops": [
    { "op": "replaceBlock", "blockId": "b0042", "newText": "повний новий текст абзацу" },
    { "op": "insertAfter",  "blockId": "b0042", "newBlocks": [{ "kind": "list-item", "text": "…", "level": 1 }] },
    { "op": "deleteBlock",  "blockId": "b0050" }
  ] }
```

- `newBlocks[].kind`: `paragraph` | `heading` | `list-item`. Новий абзац копіює `w:pPr` (стиль, `numPr`) якоря, якщо тип збігається, інакше бере найближчий блок того ж типу, інакше Normal (для заголовка — стиль `heading N`). Вставка після клітинки лишається в тій самій клітинці.
- Кілька `insertAfter` після одного блоку йдуть у порядку пропозицій у списку `accepted`.
- `validateOps(doc, ops, { strict })` повертає `[{ index, op, blockId, code, message }]`, повідомлення англійською (для LLM). Коди: `NO_OPS`, `UNKNOWN_OP`, `UNKNOWN_BLOCK`, `READ_ONLY_BLOCK`, `EMPTY_TEXT`, `INVALID_CHARS`, `MULTI_PARAGRAPH_TEXT`, `NO_CHANGE`, `DUPLICATE_BLOCK_OP`, `BAD_BLOCK_KIND`, `BAD_LEVEL`. `strict: false` лишає тільки структурні перевірки (так їх використовує writer).
- Дозволено `replaceBlock` + `insertAfter` на одному блоці в одній пропозиції. Два однакові op або replace + delete на одному блоці — `DUPLICATE_BLOCK_OP`.

## Застосування і конфлікти (`apply.js`, без XML)

- `applyAccepted(doc, accepted)` → `{ blocks, changes, conflicts, ignored }`. Функція чиста й ідемпотентна, результат завжди будується з оригіналу. Reopen — це просто вилучення пропозиції з `accepted`.
- Кілька прийнятих `replaceBlock` на одному блоці: word-level 3-way merge (base = оригінал, `node-diff3`). Хунки, що не перетинаються, зливаються. Перетин дає `conflicts` (`overlapping-edit`), а в результаті лишається раніше прийнята пропозиція. `replaceBlock` проти `deleteBlock` — конфлікт `replace-vs-delete`.
- `supersedes: [T]`: якщо прийняті обидві, операції T над блоками, яких торкається нова пропозиція, ігноруються (`ignored`).
- `findConflicts(doc, accepted, candidate)` → `[{ suggestionId, blockId, reason }]`. Викликати перед Confirm.
- `diffBlock(old, new)` → `[{ type: 'equal'|'delete'|'insert', text }]`. Diff іде за токенами: слова (Unicode, з апострофом усередині), пробіли, знаки. Пробіл між двома замінами поглинається, щоб diff не розсипався на дрібні шматки. `changeRatio` — частка зміненого тексту (сигнал «дрейфу»).

## Запис (`writers/docx.js`)

`writeDocx(originalBuffer, doc, accepted, { mode: 'clean'|'tracked', author, date, comments })` → `Promise<Buffer>`

- Оригінальний `document.xml` патчиться на місці: змінюються лише абзаци з правками, решта XML лишається байт-у-байт. Без правок повертається копія оригіналу.
- `replaceBlock`: word-diff → мінімальні `w:del` (`w:t` → `w:delText`) і `w:ins`. Run-и розрізаються на межах змін клонуванням `w:r` + `w:rPr`. Вставка бере `rPr` першого видаленого або сусіднього run-а. Поля, малюнки, посилання на виноски й коментарі — атомарні, їх ніколи не розрізають і не змінюють.
- `deleteBlock`: у tracked усі run-и йдуть у `w:del`, і знак абзацу теж позначається видаленим (`w:pPr/w:rPr/w:del`), тож після прийняття не лишається порожнього пункту списку. Знак не видаляється, якщо після абзацу в контейнері немає іншого блоку (останній абзац клітинки чи тіла). Тоді лишається порожній абзац, і в clean теж.
- `insertAfter` у tracked: знак нового абзацу позначено як вставлений (`w:pPr/w:rPr/w:ins`), вміст загорнуто в `w:ins`.
- `w:id` ревізій унікальні: максимальний числовий `*:id` у всіх `word/*.xml` + 1. Автор за замовчуванням — `KSE Syllabus Analyzer`.
- `comments: true` (лише tracked): `w:comment` з `rationale` на першому зміненому абзаці кожної пропозиції. Створюються `comments.xml`, зв'язок у rels і content type.
- У tracked прибирається `w:revisionView`, що ховає правки. Інакше LibreOffice експортує PDF без них.
- Наявні чужі tracked changes лишаються як є. Їхні абзаци `readOnly`.
- Помилки (`Error` зі `statusCode`/`code`): `STALE_DOC_VERSION` 409 (sha1 файлу ≠ `doc.docVersion`), `SUGGESTION_CONFLICT` 409 (`err.conflicts`), `INVALID_OPS` 422 (`err.errors`), `DOC_MISMATCH` 409, `INVALID_DOCX` 422.

`acceptAllRevisions(buffer)` / `rejectAllRevisions(buffer)` — аналог «Прийняти/Відхилити всі» у Word для `document`, колонтитулів, виносок і коментарів. Гарантія тестів: текст `accept(tracked)` = текст `clean`, а текст `reject(tracked)` = текст `reject(оригінал)`.

## LibreOffice (`convert.js`)

`docToDocx(buffer)`, `toPdf(buffer, ext, { exportComments })`, `convert(buffer, inExt, 'docx'|'doc'|'pdf', { timeoutMs, exportComments })`, `isAvailable()`.
У PDF tracked-версії правки видно за замовчуванням. `exportComments: true` перетворює коментарі Word на PDF-анотації.
Черга в процесі (`SOFFICE_CONCURRENCY`, за замовчуванням 1), таймаут на задачу (`SOFFICE_TIMEOUT_MS`, 120 с; при перевищенні вбивається вся група процесів). Кожна задача має окремий профіль `-env:UserInstallation` і тимчасовий каталог, який потім видаляється. Шлях до бінарника — `SOFFICE_PATH` або пошук у стандартних місцях і `PATH`. Якщо LibreOffice немає — 503 `SOFFICE_MISSING`. Таймаут — 504 `CONVERSION_TIMEOUT` (`retryable`). Невдала конвертація — 422 `CONVERSION_FAILED`.

## Фікстури

`backend/test/fixtures/docx/generate.js` створює `syllabus.docx` (бібліотека `docx`), `tricky.docx` (XML вручну: TOC, поля, smartTag, контроли вмісту, напис, вкладена таблиця, виноска, paraId, чужі правки) і `legacy.doc` (через LibreOffice). Файли закомічені, тож генератор потрібен лише для їх зміни.
