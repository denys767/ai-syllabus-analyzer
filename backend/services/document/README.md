# services/document

Модель документа з блоками, застосування прийнятих пропозицій і запис **того самого .docx**
у двох варіантах: чистий і з tracked changes (`w:ins`/`w:del`, які можна прийняти або відхилити у Word).
Підключений до upload (`services/analysisRunner.js`), чату (`services/chat/`) і фінальних файлів (`services/outputs.js`). Тести: `backend/test/document/`, `npm test`.

## Потік

```
upload ─► loadDocument(buffer, 'docx'|'doc'|'pdf'|'pptx') ─► { buffer, doc: DocModel, convertedFrom }
                │ (.doc → .docx через LibreOffice; .pdf → синтезований .docx 1:1 з блоками PDF; .pptx — як є)
LLM бачить renderForPrompt(doc) і повертає Suggestion.ops
validateSuggestion(doc, s)              ─► помилки для повтору LLM
findConflicts(doc, accepted, s)         ─► перед Confirm (409 SUGGESTION_CONFLICT)
previewChanges(doc, [s])                ─► картка: word-diff блоку
previewChanges(doc, accepted)           ─► прев'ю всього документа (лише змінені блоки)
buildOutputs(buffer, doc, accepted, { pdf: true }) ─► { clean, tracked, trackedPdf }
```

Зберігати треба `buffer`, повернений `loadDocument`. Для `.doc`/`.pdf` це вже сконвертований `.docx`, і `doc.docVersion` = sha1 саме його байтів.

## PDF → DOCX (`extractors/pdfToDocx.js`)

`loadDocument(buffer, 'pdf')`: `extractPdf` (pdf.js, див. «PDF» нижче) → `pdfBlocksToParagraphs` → `synthesizeDocx` (бібліотека `docx`: Title/Heading N, bullet, нумерація з рестартом на кожну серію) → `extractDocx`. Кожен PDF-блок стає рівно одним абзацом, тож блоки синтезованого DOCX і PDF відповідають 1:1 за порядком (кількість блоків перевіряється, інакше 422 `PDF_BLOCK_MISMATCH`). Крім звичайного DocModel повертаються:

- `doc.sourceBlocks` — блоки PDF з локаторами сторінок, `doc.sourceDocVersion` — sha1 оригінального PDF;
- `doc.pdfBlockMap: { [docxBlockId]: pdfBlockId }`.

`pdfMapping.js`: `sourcePdfDoc(document)` відновлює DocModel PDF зі збереженого `Syllabus.document`, `mapPdfSuggestions(document, accepted)` переводить `blockId` операцій на PDF-блоки (для синтетичних id вставок `b0005+<sid>.1` — за якорем). Так `annotatePdf` будує анотації на оригінальному PDF з тих самих прийнятих пропозицій, що й tracked/clean DOCX. Форматування і таблиці оригіналу в DOCX не зберігаються. Скан без тексту — 422 `PDF_NO_TEXT`, пошкоджений файл — 422 `INVALID_PDF`, таймаут читання (`PDF_EXTRACT_TIMEOUT_MS`, 120 с) — 504 `PDF_TIMEOUT`.

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

## PPTX і PDF (фаза 5)

`loadDocument(buffer, 'pptx'|'pdf')` повертає той самий контракт `{ buffer, doc, convertedFrom: null }`.
`buffer` — оригінальні байти; `docVersion` — їхній SHA-1. Гілки `docx`/`doc` та `buildOutputs` не змінені.
`applyAccepted`, `findConflicts`, `validateOps` і `previewChanges` спільні для всіх форматів;
операції `replaceBlock`, `insertAfter`, `deleteBlock` мають той самий JSON-синтаксис.

### PPTX

- `extractPptx(buffer)` → `Promise<DocModel>`, `format: 'pptx'`, `meta: { slideCount }`.
- Слайди обходяться через `presentation.xml/sldIdLst` і relationships, незалежно від імен файлів.
  На кожному слайді спочатку йдуть title/ctrTitle placeholders (`slide-title`), далі інші
  непорожні `a:p` (`slide-text`), клітинки таблиць (`table-cell`), рекурсивно групи; потім нотатки (`notes`).
  ID `b0001…` стабільні для однакових байтів. `sectionId` усіх блоків слайду — ID першого title;
  без title не встановлюється. `notes` і абзаци з полями — `readOnly`.
- Локатор PPTX без додаткової обгортки:
  `{ slide, slidePart, shapeId, paraIndex, cell?: { table, row, col }, notesPart? }`.
  `slide` починається з 1; `paraIndex` — індекс серед **усіх** `a:p` конкретного text body
  (у shape або клітинці), включно з порожніми; `table`, `row`, `col` починаються з 0;
  індекс `table` локальний для graphicFrame, який визначений через `shapeId`.
- SmartArt, chart і зображення не витягуються. Placeholder-стилі з layout/master не розгортаються;
  title розпізнається за явним `p:ph@type` у самому слайді.
- `writePptx(originalBuffer, doc, accepted)` → `Promise<Buffer>`. Перевіряє SHA-1, операції,
  readOnly і конфлікти. Word-diff зберігає незмінні run-и та їхнє `a:rPr`; новий текст бере
  `a:rPr` першого run-а. Зберігаються `a:pPr`, bullets та `a:endParaRPr`.
  Вставки копіюють стиль і bullets **якоря**, незалежно від `newBlocks[].kind`;
  вставка в клітинку лишається в ній. Видалення останнього абзацу text body залишає порожній `a:p`.
  Незачеплені ZIP-частини мають ідентичні байти вмісту, no-op повертає оригінальні байти файлу.
- `overflowRisk(oldText, newText)` → `boolean`, true при зростанні понад 115% символів.
  `previewPptxChanges(doc, accepted)` розширює стандартне прев’ю:
  `entries[].meta = { slide, overflowRisk }`. Для вставки ризик завжди true.
  Це попередження, а не перевірка реального розміщення; autofit не вмикається автоматично.
- `renderPptxPreview(originalBuffer, editedBuffer, changedSlides, { beforePdf? })` →
  `Promise<{ slides: [{ slide, before: Buffer, after: Buffer }] }>`.
  Обидві презентації конвертуються через існуючий `convert.js` (та сама черга LibreOffice),
  потім `pdftoppm -png -r 80 -f N -l N` створює PNG лише запитаних слайдів.
  Слайди нумеруються з 1; дублікати прибираються, результат відсортований.
  Порожній список повертає `{ slides: [] }` без конвертацій. Контурів змінених shapes немає.

### PDF

- `extractPdf(buffer)` → `Promise<DocModel>`, `format: 'pdf'`, `meta: { pageCount }`.
  Використовує `getTextContent` з `pdfjs-dist/legacy/build/pdf.mjs` через dynamic import
  у Node worker thread (ізоляція ресурсу й сумісність із CommonJS/Jest без ESM VM flags).
  На виклик — окремий worker з таймаутом 120 с (`PDF_TIMEOUT`, 504).
- Текстові items групуються в рядки за baseline/y tolerance, у абзаци — за вертикальним
  проміжком, відступом і розміром шрифту. Збільшений шрифт дає `heading`, прості маркери —
  `list-item`; решта — `paragraph`. Багаторядковий абзац з’єднується пробілом.
  Широкі горизонтальні проміжки розділяють клітинки/колонки; структура таблиці не реконструюється.
- Локатор PDF без додаткової обгортки:
  `{ page, bbox: [x0,y0,x1,y1], lineBoxes: [{ bbox, text, start, end, spans: [{ bbox, text, start, end }] }] }`.
  `page` починається з 1; координати — **PDF user space**, до viewport rotation/scale,
  початок зазвичай знизу ліворуч. `start/end` — UTF-16 offsets у `block.text`.
- Відсутність тексту в усьому PDF дає 422 `PDF_NO_TEXT` з українським повідомленням про OCR.
  Image-only сторінки змішаного PDF пропускаються. OCR не реалізовано. Некоректний PDF — 422 `INVALID_PDF`.
- `pdfBlocksToParagraphs(doc)` → `[{ kind, level, listFormat, text }]` для **всіх** блоків (1:1): заголовки
  й списки зберігають тип, інші блоки стають `paragraph`. Вхід для `synthesizeDocx` (див. «PDF → DOCX»).
- `annotatePdf(originalBuffer, doc, accepted, { author = 'KSE Syllabus Analyzer' })` → `Promise<Buffer>`.
  `replaceBlock` додає StrikeOut на рядки зі зміненими словами та Text note з новим текстом
  і rationale; якщо слово має окремий pdf.js item, використовується точніший bbox цього item.
  За відсутності деталізації — bbox усього блоку; заміна лише зі вставкою теж позначає весь блок.
  `deleteBlock` — StrikeOut + note «Видалити» з rationale;
  `insertAfter` — Caret наприкінці останнього рядка + Text note з новими абзацами й rationale.
  `T` і `Contents` — UTF-16 PDFHexString для кирилиці; автор перевизначається опцією.
  Наявні анотації зберігаються. Content streams, ресурси та текст сторінок не змінюються;
  структура/серіалізація PDF може змінитися. No-op повертає оригінальні байти.

### Артефакти та інтеграція

`buildOutputsFor(format, originalBuffer, doc, accepted, opts)`:

| format | результат |
| --- | --- |
| `docx` | існуючий `buildOutputs`: `{ clean, tracked, trackedPdf? }` |
| `pptx` | `{ edited: Buffer, previewPdf: Buffer }` — edited PPTX і його PDF |
| `pdf` | `{ annotated: Buffer }` — оригінальний PDF з анотаціями |

Для вхідного `.doc` викликати dispatch з `doc.format` (`docx`) після `loadDocument`.
Невідомий format → 415 `UNSUPPORTED_FORMAT`; writer-и повертають ті самі коди stale/invalid/conflict,
що DOCX. Рекомендації передавати вже відфільтрованими за `accepted`; `supersedes` і merge обробляє `apply.js`.

Інтеграція (хвиля 5): upload приймає `.pptx`/`.pdf`; `services/outputs.js` рендерить файли за ключем
(`writeDocx`, `writePptx` + `toPdf`, `annotatePdf` з `pdfMapping.js`), перелік файлів за форматом —
`services/outputFormats.js`; прев'ю слайдів картки — `services/chat/slides.js` (`previewPptxChanges` для номерів
слайдів і `overflowRisk`, `renderPptxPreview` з опцією `beforePdf` — уже сконвертований оригінал).

`pdfToPng(pdfBuffer, pages, { timeoutMs = 120000 })` → `Promise<[{ page, png: Buffer }]>`.
Список сторінок відсортований і унікальний; власна черга `createQueue(1)` з convert.js,
окремий tmp-каталог і cleanup; таймаут на сторінку вбиває групу процесів.
Помилки: `BAD_PAGES` 400, `PDF_RENDER_MISSING` 503, `PDF_RENDER_TIMEOUT` 504,
`PDF_RENDER_FAILED` 422. Потрібні `soffice` та `pdftoppm`; `pdftotext` використовується тестами.

Обмеження: LibreOffice може підміняти відсутні шрифти й інакше рендерити PowerPoint;
бюджет символів не гарантує відсутності overflow; PDF paragraph/heading heuristics можуть
зливати сусідні абзаци без відступів або помилятися у колонках, складних таблицях і повернутому тексті.
PDF-анотації пропонують зміни, але не переписують текст і не дають editable clean PDF.

Фікстури: `test/fixtures/pptx/generate.js` → `syllabus.pptx` (4 слайди, таблиця, група, нотатки);
`test/fixtures/pdf/generate.js` → `source.docx`, `syllabus.pdf` (3 сторінки), `slides.pdf`, `scanned.pdf`.
Генератори запускаються з backend; PDF-генератор потребує LibreOffice і poppler.
Закомічені виходи дозволяють тестувати екстракцію й анотації без LibreOffice;
тести живої конвертації/прев’ю PPTX пропускаються лише за відсутності soffice.
