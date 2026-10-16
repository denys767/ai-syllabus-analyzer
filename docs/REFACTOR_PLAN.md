# План переробки KSE AI Syllabus Analyzer

Дата: 2026-10-14. Основа: аудит коду (`backend/services/ai/*`, `workspaceService.js`, маршрути, моделі, фронтенд) і п'ять дослідницьких звітів. Звіти лежать у `docs/research/` (A — DOCX tracked changes, B — PDF/PPTX і парсинг, C — формати правок і diff, D — якість рекомендацій, E — аудит коду). Ключові джерела наведено в додатку.

## 0. Коротко

1. **Оригінал стає першоджерелом.** Завантажений файл більше не перетворюється на markdown. Документ розбирається на блоки зі стабільними ID і прив'язкою до місця в оригіналі (абзац DOCX, shape у PPTX, сторінка+bbox у PDF). Після рішень викладача окремий writer для кожного формату збирає **той самий файл** із прийнятими змінами і **прев'ю змін**.
2. **DOCX — основний формат.** На виході два файли: DOCX зі справжніми tracked changes (`w:ins`/`w:del`, їх можна прийняти чи відхилити прямо у Word) і чистий DOCX. Прев'ю: `docx-preview` у браузері та PDF через LibreOffice. `.doc` конвертується в `.docx` через LibreOffice. PPTX редагується на рівні run-ів, прев'ю — зображення слайдів до і після. Для PDF — анотації на оригіналі та пропозиція завантажити DOCX.
3. **Line-number edits видаляються.** Модель повертає операції над блоками: `replaceBlock` (новий текст абзацу), `insertAfter`, `deleteBlock`. Мінімальний diff рахує сервер. Стан завжди перебудовується з оригіналу плюс множини прийнятих пропозицій. Конфлікти виявляються явно, а не відкидаються мовчки.
4. **Рекомендації будуються за рубрикою, а не через «знайди проблеми».** Кроки: детерміновані перевірки → вердикт моделі по кожному критерію з доказами (blockId) → verifier-фільтр (прибирає загальні, недоведені й дублікати) → ліміт кількості → переписування тільки для тих, що лишилися. Для політик є стандартні формулювання KSE (playbook). Якщо для правки потрібні дані від викладача (ваги, дати), система ставить питання, а не вигадує. Прийняття і відхилення логуються по `criterionId`, є golden set для оцінки.
5. **Чистка:** мертвий код, моделі й поля, незадіяні ролі та ендпоінти, `"latest"` у залежностях, англійські тексти в UI, баги з гонками і доступами (повний перелік у розділі 4).

---

## 1. Діагноз: чому зараз погано

### 1.1 Втрата оригіналу

- `routes/syllabus.js:83-115`: `mammoth.extractRawText` / `pdf-parse` залишають лише плоский текст. Таблиці, стилі, нумерація, колонтитули губляться, і модель бачить розплющені таблиці.
- `finalRender.js:18-53`: фінал — це markdown → HTML → PDF через Puppeteer, з двома секціями («чистий текст» і «red/green»). У файлі викладача нічого не змінюється, тож правки доводиться переносити вручну.
- `.doc` проходить фільтр за розширенням (`routes/syllabus.js:62`), але `mammoth` не читає бінарний `.doc`. Крім того, гілка вибирається за `mimetype` від клієнта, а фільтр перевіряє розширення, і ці перевірки можуть розходитися. PPTX не підтримується взагалі.

### 1.2 Крихкі line-edits: конкретні баги

| # | Де | Що не так |
|---|---|---|
| 1 | `applyEdits.js:155-170` | Якщо правка прийнятої рекомендації перетинається з уже прийнятою, вона **мовчки відкидається**, а решта правок тієї ж рекомендації застосовується. Рекомендація показана як «прийнята», хоча у фінал потрапила частково або не потрапила зовсім. `skipped` ніде не показується (`buildAcceptedState`, рядок 181). |
| 2 | `applyEdits.js:157` + `lineDoc.js:46-52` | Insert-правки не перевіряються на перетин із `replace` інших рекомендацій. Приклад: A = `replace 10-12`, B = `insertAfter 11`. Спершу застосовується B, і splice A видаляє вставлений B рядок, а оригінальний рядок 12 лишається. **Документ пошкоджено.** |
| 3 | `applyEdits.js:253-260` vs `:131-172` | Прев'ю прибирає прийняті правки, що перетинаються з поточною, а фінальна збірка відкидає пізніші за порядком масиву. Тому прев'ю може не збігатися з результатом після Confirm. |
| 4 | `lineDoc.js:6`, `applyEdits.js:139-142` | `docVersion` = sha1 від `extractedText`, а `extractedText` ніколи не змінюється. Логіка `STALE_DOC_VERSION` фактично мертва, а справжні конфлікти між рекомендаціями не обробляються. |
| 5 | `applyEdits.js:71-74` | `customText` у choice копіюється в **кожну** правку опції. Якщо правок більше однієї, текст дублюється. |
| 6 | `editGenerator.js:252-311` | Правки для всіх рекомендацій генеруються одним батчем без перевірки перетинів між рекомендаціями. Fallback іде послідовно, по одному LLM-виклику на рекомендацію, у фоні і без відстеження. |
| 7 | `editGenerator.js:234-238` | Для кейсів увімкнено web search, але без JSON-схеми. URL кейсів ніяк не перевіряються, тому можливі вигадані джерела. |
| 8 | `workspaceService.js:255-271` | Регенерація правок через LLM відбувається синхронно всередині HTTP-запиту `confirm`/`cancel`, а наступна картка будується в тому ж запиті. |

### 1.3 Чому рекомендації загальні й нерелевантні

`analyzer.js:13-62` — це один промпт «проаналізуй і дай рекомендації». У ньому:
- немає явних критеріїв, тому модель вигадує свої («додайте більше кейсів»);
- не вимагається доказ (місце в тексті), тож рекомендації не прив'язані до силабусу;
- немає варіанту «тут усе добре», і модель відчуває тиск видати N пунктів;
- немає порогу суттєвості, ліміту і дедуплікації;
- пріоритет бере LLM «на око», без таблиці severity;
- діагноз і переписування змішані, і на етапі edits модель вигадує контент (ваги, дати, політики), якого немає;
- категорії `content-quality`/`other` штучно зараховуються в блок `templateCompliance` readiness (`workspaceService.js:12-19`);
- `json_object` замість strict `json_schema`; ID на кшталт `rec_${Date.now()}_${idx}`;
- немає зворотного зв'язку: відхилення з причинами ніде не аналізуються.

### 1.4 Логіка чату і фіналу

- **Блокери мертві.** `applyDecision` вимагає причину для відхилення critical/high (`workspaceService.js:309`), тому `isBlockingRejectedIssue` (`:39-42`) для нових даних завжди `false`, і гілка повернення блокерів (`:224-232`) не виконується.
- **Reopen каскадно скидає всі пізніші рішення** (`:443-477`) і видаляє повідомлення. Оскільки всі правки рахуються від оригіналу, залежності між рішеннями немає, і викладач втрачає роботу без причини.
- `getConversationView` (`:670-673`) бере перші 200 повідомлень за зростанням часу. У довгому чаті **найновіші повідомлення обрізаються**.
- `submitSyllabus` (`:596-643`) неатомарний: між перевіркою статусу і записом іде довгий рендер, тож можливий подвійний submit.
- Readiness рахує тільки `accepted`. Обґрунтоване відхилення знижує бал, і це підштовхує приймати погані рекомендації.
- Стартові повідомлення чату англійською (`:198-199, 240, 370, 384, 655-656`), що порушує правило про українську мову UI.
- Чат (`chatReply.js`) лише відповідає текстом і не може змінити пропозицію («зроби коротше», «без дат»). ТЗ 2.1 при цьому передбачає «коментувати пропозиції».
- Re-analyze (`routes/syllabus.js:337-367`) замінює `recommendations`, але лишає старі Conversation, повідомлення, `currentIssueId`, `editedText`. Він дозволений для `submitted`, а поле `analysis.error` відсутнє в схемі.
- Увесь Syllabus з вбудованими `recommendations` зберігається через load → modify → save. Паралельні запити (подвійний клік, дві вкладки) можуть перезаписати одне одного.
- Puppeteer запускається заново на кожен рендер (`finalRender.js:126-145`).

---

## 2. Цільова архітектура

### 2.1 Потік

```
upload ─► detect format ─► (doc→docx, LibreOffice) ─► Extractor[fmt] ─► DocModel { blocks[], docVersion }
                                                             │
                                Analysis job (черга в Mongo, етапи, відновлення після рестарту)
                                   ├─ Stage 0: детерміновані перевірки (код)
                                   ├─ Stage 1: структура (outcomes, assessments, sessions, policies) → blockIds
                                   ├─ Stage 2: рубрика, паралельно по групах критеріїв → findings
                                   ├─ Stage 3: verifier + dedup + cap
                                   └─ Stage 4: rewrite → Suggestion.ops (blockId-операції)
                                                             │
                     Чат: Confirm / Cancel(причина) / Refine(коментар) / Reopen  → множина accepted
                                                             │
           applyAccepted(DocModel, accepted) ─► Writer[fmt] ─► clean file + tracked file + preview
```

### 2.2 Канонічна модель документа

Новий модуль `services/document/`:

```
services/document/
  model.js            типи Block/DocModel, docVersion = sha1(байтів оригіналу)
  extractors/docx.js  обхід word/document.xml у порядку тіла (включно з клітинками таблиць)
  extractors/pptx.js  slide → shape (cNvPr@id) → paragraph
  extractors/pdf.js   pdfjs-dist getTextContent → абзаци з page+bbox
  writers/docx.js     clean + tracked (w:ins/w:del, опційно w:comment)
  writers/pptx.js     run-level заміна тексту
  writers/pdf.js      анотації на оригіналі (strike-out, caret, note з новим текстом)
  convert.js          LibreOffice: doc→docx, docx/pptx→pdf, pdf→png (черга, concurrency 1-2)
  apply.js            applyAccepted, конфлікти, word-diff (jsdiff)
```

```ts
Block {
  id: string            // "b0001"…, присвоюється при екстракції, ніколи не перенумеровується
  kind: 'heading'|'paragraph'|'list-item'|'table-cell'|'slide-title'|'slide-text'|'notes'
  text: string          // те, що бачить модель
  level?: number
  sectionId?: string    // найближчий заголовок (для контексту і пошуку розділів шаблону)
  readOnly?: boolean    // поля, TOC, SmartArt, текст у малюнках, колонтитули (v1)
  locator: { docx: {paraIndex, paraId?} | pptx: {slide, shapeId, paraIdx} | pdf: {page, bbox, lineBoxes} }
}
DocModel { format, docVersion, blocks: Block[], sourceFileRef }
```

- Оригінальний файл зберігається незмінним, з checksum і без очищення. `cleanup-uploads` не повинен його видаляти. `extractedText` лишається як похідне поле (`blocks.map(text).join`) для пошуку і звітів.
- Модель бачить документ у вигляді `[b0042] текст…` із заголовками розділів. Номери рядків прибираються.

### 2.3 Пропозиції, застосування, конфлікти

**Формат відповіді моделі** (strict `json_schema` через `createResponse`):

```jsonc
{
  "ops": [
    { "op": "replaceBlock", "blockId": "b0042", "newText": "…повний новий текст абзацу…" },
    { "op": "insertAfter",  "blockId": "b0042", "newBlocks": [{ "kind": "paragraph", "text": "…" }] },
    { "op": "deleteBlock",  "blockId": "b0050" }
  ],
  "rationale": "…"
}
```

- Модель **не пише diff і не ставить розмітку**. Вона повертає новий текст абзацу, а сервер рахує word-diff (jsdiff) старого і нового тексту. З цього diff будуються мінімальні `w:del`/`w:ins` у DOCX і картка в чаті. Це підхід зі звіту A: модель нічого не цитує, але точність виходить на рівні слів.
- **Валідація після генерації:** blockId існує і не `readOnly`; `newText` непорожній; частка зміненого тексту в межах очікуваного (якщо змінено понад ~70% абзацу, а критерій вимагав точкової правки, це сигнал «дрейфу»); у межах однієї пропозиції немає подвійних операцій над одним блоком. Якщо валідація не пройшла, модель отримує конкретну помилку й повторює спробу, максимум двічі. Якщо й тоді не вийшло, картка лишається порадою без кнопки Confirm (так само, як зараз без `beforeAfter`).
- **Застосування** (`applyAccepted`): обхід блоків оригіналу, для кожного збираються прийняті операції. Функція чиста й ідемпотентна, як зараз `recomputeSyllabusState`. Reopen просто виймає пропозицію з множини, каскад не потрібен.
- **Конфлікти:** якщо дві прийняті `replaceBlock` зачіпають один блок, робиться 3-way merge на рівні слів (base = оригінал). Хунки, що не перетинаються, зливаються автоматично. Перетин означає конфлікт: при Confirm сервер повертає 409 `SUGGESTION_CONFLICT`, а UI пропонує «залишити попередню», «замінити попередню» або «об'єднати через AI». Останній варіант регенерує пропозицію з урахуванням уже прийнятого тексту, і нова операція отримує `supersedes: [suggestionId]`. Мовчазних відкидань більше немає.
- Ще на етапі генерації оркестратор групує знахідки, що стосуються одного блоку, в одну пропозицію. Так більшість конфліктів не виникає взагалі.
- `docVersion` = sha1 оригінального файлу. `STALE_DOC_VERSION` спрацьовує лише при заміні файлу, і тоді йде повний re-analyze з новою Conversation.

### 2.4 Що отримують викладач і директор

| Вхід | Викладач завантажує | Прев'ю в застосунку | Лист директору |
|---|---|---|---|
| DOCX | `*_tracked.docx` (зміни, які можна прийняти чи відхилити у Word, автор «KSE Syllabus Analyzer», коментар із поясненням) і `*_clean.docx` | Картка: word-diff блоку. Повний документ: `docx-preview` (`renderChanges: true`). Фінал: PDF tracked-версії через LibreOffice | tracked.docx + PDF + звіт |
| DOC | те саме, але `.docx` (із поміткою «сконвертовано з .doc») | те саме | те саме |
| PPTX | відредагований `.pptx` (run-level, форматування збережене) | слайди до і після (LibreOffice → PNG), змінені shape підсвічено | pptx + PDF до/після + звіт |
| PDF | оригінальний PDF з анотаціями (закреслення, caret, нотатка з новим текстом). Банер: «Щоб отримати відредагований файл, завантажте DOCX» | анотований PDF у pdf.js | анотований PDF + звіт |

Перевірки якості writer-ів (стануть першими автотестами):
- no-op round-trip (жодних прийнятих правок) повертає оригінал без змін;
- одна правка змінює лише свій абзац;
- Word і LibreOffice відкривають файл без «repair»;
- «Accept all» у tracked-версії дає той самий текст, що й clean.

### 2.5 Пайплайн рекомендацій

1. **Рубрика як дані** (`services/ai/rubric/`): 25–35 карток критеріїв із джерел: шаблон KSE, MBA-27, Quality Matters (вимірювані outcomes, узгодження outcomes ↔ activities ↔ assessments), AACSB AoL (пряме оцінювання кожного outcome), Bloom (вимірювані дієслова), навантаження ECTS, політики. Кожна картка містить `id`, `group`, `whatGoodLooksLike`, `doNotReportIf`, `defaultSeverity`, опційно `standardClause` (затверджене формулювання KSE, наприклад для AI-політики чи академічної доброчесності) і 1–2 приклади: хороша і погана рекомендація. Severity задає таблиця в коді. Модель може змінити її на один рівень і лише з обґрунтуванням.
2. **Stage 0 (код):** наявність розділів шаблону через заголовки, сума ваг = 100%, наявність AI-політики тощо. Дешево і детерміновано.
3. **Stage 1 (1 виклик):** структура: outcomes, assessments (вага, пов'язані outcomes), sessions, policies, cases, кожен елемент з blockIds. Матрицю «MBA-27 ↔ outcomes ↔ assessments» рахує код.
4. **Stage 2 (4 паралельні виклики, по одному на групу критеріїв):** вердикт `ok | issue | not_applicable` для **кожного** критерію з доказом (`evidenceBlockIds`), `confidence` і `materiality`. Порожній список — нормальна відповідь.
5. **Stage 3 (verifier, окремий виклик з іншими налаштуваннями):** для кожної знахідки перевіряються булеві питання: доказ підтримує твердження? це вже є деінде в документі? чи підійшла б ця порада до будь-якого силабусу? чи важливо це для академічного директора? чи можна виправити однією правкою? Знахідки, що не пройшли, відкидаються. Далі код дедуплікує за `(criterionId, blockIds)`, обмежує кількість (~10 загалом, ≤3 на групу) і сортує за severity × confidence.
6. **Stage 4 (rewrite, паралельно з лімітом конкурентності):** пропозиція за схемою з розділу 2.3. Для політик використовується `standardClause` з playbook, а кейси обирає модель. Якщо правка вимагає даних, яких немає в тексті (ваги, дати, назви кейсів викладача), створюється картка `kind: 'question'` без правки: AI ставить питання, і відповідь викладача запускає генерацію правки. Це закриває частину ТЗ 2.3 («AI-челенджер») без окремої підсистеми.
7. **Кейси:** web search лишається, але відповідь іде через JSON-схему. Кожен URL перевіряється HTTP-запитом (статус і збіг заголовка). Якщо перевірка не пройшла, URL прибирається, а картка позначається «джерело не підтверджено».
8. **Вартість:** ≈6–7 викликів на силабус замість 2–3, тобто ~60k вхідних токенів на mini-моделі. Статичну частину (шаблон, outcomes, рубрику) слід ставити на початок промпту, щоб працював prompt caching.
9. **Цикл якості:**
   - на кожній пропозиції зберігаються `criterionId`, `promptVersion`, рішення і причина відхилення з категоріями-чипами («вже є в тексті», «занадто загально», «неправильно», «не стосується курсу», «інше»);
   - метрика — частка прийнятих по кожному критерію; критерії з частиною прийнятих <25% (на ≥20 випадках) переписуються або вимикаються;
   - golden set із 15–30 анонімізованих силабусів KSE, розмічених академічним директором (включно з «чистими», щоб ловити хибні спрацювання);
   - скрипт оцінки (`npm run eval`, той самий `createResponse`) рахує precision/recall по критеріях, частку дублікатів і валідність доказів.

### 2.6 Чат

- Нова дія **Refine**: коментар викладача до поточної картки («коротше», «без дат», «додай український кейс») регенерує операції цієї пропозиції. Картка оновлюється, а попередня версія лишається в історії.
- `freeChatMessage` визначає намір: питання (як зараз) або запит змінити пропозицію (тоді Refine).
- Reopen повертає одну пропозицію в `pending` без каскаду, а повідомлення в чаті не видаляються.
- Readiness: `resolved = accepted + rejected із причиною`. Окремо показується частка прийнятих. Блокери (critical/high без причини) прибираються як мертвий стан, бо причину вже вимагає API. Gate фіналу: немає pending.

### 2.7 Дані і фонові задачі

- **`Suggestion` — окрема колекція** замість вбудованого `Syllabus.recommendations[]`: `{syllabusId, criterionId, group, severity, title, description, evidenceBlockIds, kind, ops|options|cards, status, decisionReason, rejectTag, decisionHistory, promptVersion, version}`. Рішення записуються атомарно (`findOneAndUpdate` з умовою `status: 'pending'`), тому гонки між запитами зникають, а метрики зручно агрегувати між силабусами.
- **Аналіз — це job** у Mongo (`AnalysisJob` або поля на Syllabus: `stage`, `attempt`, `leaseUntil`). In-process воркер підхоплює job, оновлює lease, а при старті сервера підбирає job-и з простроченим lease, тож статус більше не застрягає в `analyzing`. Фронтенд показує етап. Redis не потрібен (або `agenda`, якщо зручніше).
- **LibreOffice** — окремий сервіс або процес (`unoserver`) з чергою (concurrency 1–2, таймаут на job, окремий профіль на конвертацію). У Docker-образі мають бути шрифти з кирилицею і шрифти шаблону KSE. На цій машині LibreOffice зараз **не встановлено**.
- **Puppeteer** потрібен лише для звіту (або його можна прибрати повністю, якщо звіт генерується як DOCX і конвертується через LibreOffice). Принаймні один браузер має перевикористовуватися, а не запускатися на кожен рендер.

---

## 3. Що видаляється з AI-шару

| Видалити | Чим замінити |
|---|---|
| `services/ai/lineDoc.js` | `services/document/model.js` + extractors |
| `services/ai/applyEdits.js` (coalesce, overlap-хаки, три різні прев'ю) | `services/document/apply.js` (`applyAccepted`, конфлікти, diff) |
| `services/ai/revisionMarkup.js`, маркери `[[KSE_DEL]]`/`[[KSE_ADD]]` (бекенд + `ProfessorTutorWorkspace.js:60-63`, `sanitizeExtractedText`) | diff у React-компоненті (`<DiffText>`) + writers |
| `services/ai/finalRender.js` (markdown → PDF) | writers + LibreOffice PDF; звіт — окремий модуль |
| `services/ai/index.js` (фасад з обгортками `applyAcceptedDecisions`, `buildIssuePreview`), `services/aiService.js` (shim) | прямі імпорти з `services/ai/*` і `services/document/*` |
| `Syllabus.editedText`, `revisionMarkup`, `previewPdf`, `analysis.*` | похідні артефакти в `Syllabus.outputs` (шляхи і `generatedAt`); результати рубрики — у `Suggestion` і `Syllabus.rubricSummary` |
| `isBlockingRejectedIssue`, блокери, каскадний reopen | див. 2.6 |
| `MAX_AFTER_CHARS`, `clipText` для `before`/`after` | картка показує diff блоку, обрізання не потрібне |

CLAUDE.md після переробки треба оновити: правила «тільки line-edits, модель не цитує», `recomputeSyllabusState`, `STALE_DOC_VERSION` і блокери змінюються.

---

## 4. Чистка коду поза AI-шаром

Повний перелік із номерами рядків — у `docs/research/E-code-audit.md`. Найважливіші пункти (перевірено вибірково):

### 4.1 Ролі й облікові записи — зайві потоки

Ролей у коді вже лише дві (`instructor`, `admin`), залишків `manager` немає. Зайве інше: паралельні потоки акаунтів, що залишилися від самостійної реєстрації.

| Що | Рішення |
|---|---|
| **HIGH:** `sendVerificationEmail` імпортується в `routes/auth.js:9`, але не експортується з `emailService.js`. Користувачі, створені через `POST /auth/create-user` або ті, хто змінив email через `PUT /auth/profile`, **не можуть увійти** | Видалити `POST /auth/create-user` (дублює `POST /cabinet/users` з інвайтом), прибрати `email` з `PUT /auth/profile` (є правильний потік `/users/email-change/*`) |
| Верифікація email (`isVerified`, `verificationToken`, `/verify-email`, `/resend-verification`, `VerifyEmail.js`, `requireVerification`) | Видалити. Єдине джерело акаунтів — інвайт адміна, і пароль, встановлений за інвайтом, уже підтверджує email |
| Самореєстрація: `Register.js` (332 рядки, без маршруту), `AuthContext.register`, `api.auth.register` (бекенд-маршруту немає) | Видалити |
| `authorize('admin')` (лише `policies.js`) поряд з `admin` з `roles.js` | Лишити один middleware `requireRole('admin')` |
| Роль береться з JWT (`middleware/auth.js:21`), тож понижений користувач до 7 днів має стару роль | Брати `role` з БД (запит уже виконується для перевірки `isActive`) |
| `routes/auth.js` / `users.js` / `cabinet.js`: профіль, налаштування і пароль розкидані по двох роутерах. `GET /users/stats` ≈ `GET /cabinet/metrics`, `GET /syllabus/my-syllabi` ≈ `GET /cabinet/syllabi` | `auth.js`: login, forgot/reset. `account.js`: self-service. `cabinet.js`: адмін. Дублікати видалити |
| Адмін може робити `analyze`/`PUT`/`DELETE` чужого силабусу, хоча мутації чату дозволені лише власнику. Re-analyze від адміна стирає рішення викладача | `analyze` і `PUT` — тільки власник. `DELETE` — власник або адмін |
| Немає ендпоінта деактивації чи зміни ролі; можна видалити останнього адміна | `PATCH /cabinet/users/:id` (`isActive`, `role`) і захист останнього адміна |

### 4.2 Безпека

- **HIGH:** глобальний limiter пропускає будь-який запит із заголовком `Authorization` (`server.js:80`), а `authLimiter` використовує як ключ неперевірений `jwt.decode`. Тому захисту від brute-force на `/auth/login` немає. Потрібен окремий IP-limiter на `/api/auth/login|forgot-password|reset-password`.
- Fail-fast на старті без `JWT_SECRET`/`MONGODB_URI`/`OPENAI_API_KEY`. `dotenv` має бути першим рядком. `uncaughtException` має завершувати процес.
- Ліміт body 50 MB знизити до 1 MB. CORS: без `localhost` у production, `credentials: false`.
- Глобальний error handler має враховувати `err.statusCode`/`err.status`: multer → 400/413, некоректний JSON → 400. Зараз це завжди 500, і гілка `LIMIT_FILE_SIZE` у `syllabus.js` недосяжна.
- Формат файлу визначати за magic bytes або розширенням, а не за `mimetype` від клієнта.
- Токени reset/invite/email-change зберігати як SHA-256. Прибрати `console.log` у `Login.js`, `authorize` і `forgot-password`.
- Retry на 429 у `api.js` вмикати тільки для GET, бо зараз повторюються й POST (дублювання повідомлень чату).

### 4.3 Надійність і життєвий цикл

- Аналіз → job із відновленням (розділ 2.7). `/analyze` повертає 409, якщо статус `analyzing` або `submitted`. Re-analyze скидає Conversation і повідомлення. Фронтенд не опитує сервер безкінечно і має кнопку «Повторити аналіз».
- Каскадне видалення: при видаленні силабусу видаляються Conversation і Message. При видаленні акаунта — ще й файли.
- Прибирання `uploads/pdfs` (зараз не очищується ніколи). У `cleanup-uploads` додати grace period: не чіпати файли, молодші за 10 хвилин.
- Таймаути: LLM-ендпоінти чату на фронтенді мають таймаут 30 с, а на сервері 130 с. Після 504 обробник продовжує роботу, що дає «headers already sent». Важкі операції (resend-submission, рендер) винести у фон.
- Policies: `version` ніколи не збільшується (`policies.js:198` перезаписує значення до порівняння на `:221`), повторне ознайомлення неможливе. Виправити або спростити: якщо підтвердження ознайомлення нічого не блокує, тримати лише перелік документів.
- `Program`: не дозволяти видалення, якщо на програму посилаються силабуси (409).

### 4.4 Мертвий код — видалити

- **Файли:**
  - бекенд: `routes/googleForms.js` (не підключений і викликає неіснуючий `processSurveyResponse`), `services/pdfService.js` (порожній), `services/aiService.js` (shim), `models/Survey.js`, `models/StudentCluster.js`, `models/PracticalIdea.js` (Survey і StudentCluster можна винести в окрему гілку для майбутньої фази 6);
  - фронтенд: `frontend/src/components/Auth/Register.js`, `VerifyEmail.js`, `frontend/src/theme.js` (жодного імпорту).
- **Функції й ендпоінти:**
  - бекенд: `previewIssueChange` + `renderIssuePreviewPdf` (мертвий PDF-шлях, що лишає файли), `GET /syllabus/:id/status` (або використовувати його для опитування замість повного `GET /:id`), невикористані експорти `services/ai/index.js`;
  - фронтенд: ~12 невикористаних методів `api.js`, застарілі коментарі «Phase N».
- **Поля схем:** `Syllabus.vectorEmbedding`, `modifiedFile`, `editedPdf`, `editingError`, `editingStatus` (завжди `'ready'`), `version`, `analysis.*`/`structure.*` (лише записуються), `decidedVia: 'admin-override'`, `Conversation.status: 'abandoned'`, `User.openSyllabusIds`, `User.settings.language`. Міграційний `$unset` — окремим скриптом.
- **Залежності бекенду:** `adm-zip`, `csv-parser`, `csv-writer`, `exceljs`, `moment`, `natural`, `pdfkit`, `docx` (optional). Після фази 3 також `markdown-it`, `diff-match-patch` і, можливо, `puppeteer`. Jest, supertest і `mongodb-memory-server` лишаються під тести з фази 0.
- **Залежності фронтенду:** `@mui/x-charts`, `@mui/x-data-grid`, `@tanstack/react-query(-devtools)` (провайдер змонтований, але жодного `useQuery`), `@testing-library/*`, `date-fns`, `formik`, `lodash`, `react-helmet-async`, `recharts`, `web-vitals`, `yup`, `react-toastify` (жодного виклику `toast()`).
- **Репозиторій:** `git rm -r --cached frontend/build` (зараз закомічений, хоча є в `.gitignore`). Вирішити, чи має бути в репозиторії `.claude/settings.local.json`. `scripts/migrate-v2.js` видалити, коли всі БД мігровано. Env `GF_WEBHOOK_SECRET`, `BACKEND_URL`.

### 4.5 Дані та індекси

- `/cabinet/syllabi` віддає повні документи (текст, усі рекомендації з payload) по 20 штук на сторінку. Потрібна проєкція і лічильники.
- Додати індекс `{programId: 1, updatedAt: -1}` (адмін сортує за `updatedAt`). Видалити невикористаний `{course.code, course.year}` і дубль `index: true` на `Conversation.syllabusId`.
- Регулярку email (`(\.\w{2,3})+`, відкидає `.academy`/`.info`) замінити на `validator.isEmail`.
- `limit` у списках обмежити згори. Некоректний ObjectId має давати 400, а не 500.

### 4.6 Фронтенд

- **Увесь UI англійською**, хоча правило проєкту вимагає українську: Sidebar, Cabinet, Login, PolicyReader, ChatInput, IssuesPanel, EmptyState тощо. Треба один файл рядків `uk.js` і заміна ~200 літералів. Бекенд-повідомлення теж змішані.
- Розбити `MessageBubble.js` (614 рядків) на компонент для кожного `kind`, `Cabinet.js` (510) — на вкладки, логіку `ProfessorTutorWorkspace.js` (519) — у хук `useWorkspace`.
- Прибрати повторний `getSyllabus` після кожного confirm/cancel/reopen/submit: потрібні дані можна повертати з view чату.
- `Cabinet.js` показує статус `analyzing` як «Draft». `ProtectedRoute requiredRoles={['admin','instructor']}` нічого не обмежує.

### 4.7 Залежності та збірка

- 24 залежності з `"latest"` зафіксувати на `^major` за поточним lockfile. Прибрати скрипти `clean` (видаляє lockfile) і `update`.
- `pdf-parse` уже змінював API (звідси подвійний fallback у `syllabus.js:5-11`). Після фази 5 він не потрібен: PDF читає `pdfjs-dist`.
- CRA (`react-scripts`) застарілий, але міграція на Vite не терміново. Робити її, коли буде зручно.

---

## 5. Фази впровадження

Оцінки орієнтовні, для одного розробника. Кожна фаза закінчується `node -c` по змінених файлах, `npm run build` і (з фази 1) автотестами.

### Фаза 0 — Підготовка (2–3 дні)
- Зафіксувати версії замість `"latest"` (за поточним `package-lock.json`), прибрати невикористані залежності (розділ 4).
- Налаштувати Jest із `mongodb-memory-server` (обидва вже є в `package.json`).
- Зібрати фікстури: 10–20 реальних анонімізованих силабусів (DOCX, DOC, PDF, PPTX) з таблицями, списками і колонтитулами.
- Зняти базову метрику з поточної БД: частка прийнятих і відхилених рекомендацій по категоріях, найчастіші причини відхилення. Це «до» для порівняння.
- **Паралельно, не код:** академічний директор погоджує рубрику (25–35 критеріїв), стандартні формулювання політик KSE і розмічає перші 10 силабусів для golden set.

### Фаза 1 — Чистка і безпечні виправлення (3–4 дні)
- Усе з розділу 4, що не залежить від нової моделі документа: мертвий код, ролі і доступи, безпека, атомарний submit, ліміт повідомлень у `getConversationView`, українські тексти, re-analyze із скиданням Conversation.
- Оновити CLAUDE.md §8: перевірка власника в `/status` і `/download` уже є, прогалину закрито.
- Баги line-edits (1.2) **не виправляти**, бо цей код буде видалено. Виняток — якщо продакшн уже використовується: тоді тимчасово забороняти Confirm при перетині правок (409) замість мовчазного відкидання.

### Фаза 2 — Модель документа і DOCX round-trip (6–8 днів)
- Spike на 1 день: `@adeu/core` (MIT, TS) проти власної реалізації на `jszip` + `@xmldom/xmldom`, на 10 фікстурах. Критерій: частка правок, що застосувалися без помилок і без «repair» у Word.
- `extractors/docx.js`, `writers/docx.js` (clean + tracked), `convert.js` (LibreOffice: doc → docx, docx → pdf), черга конвертацій.
- Тести round-trip з розділу 2.4.
- **Готово, коли:** на всіх DOCX-фікстурах no-op дає ідентичний текст, одна правка змінює один абзац, а «Accept all» = clean.

### Фаза 3 — Пропозиції, чат, фінал на новій моделі (6–8 днів)
- Колекція `Suggestion`, `apply.js` (`applyAccepted`, 3-way merge, конфлікти), міграція `workspaceService` (confirm/cancel/reopen без каскаду, Refine).
- `editGenerator` переходить на blockId-операції зі strict-схемою і повторними спробами з помилкою.
- Фронтенд: `<DiffText>` у картках, повне прев'ю через `docx-preview`, завантаження tracked/clean, діалог конфлікту, чипи причин відхилення.
- Submit: лист директору з tracked.docx, PDF і звітом.
- Скрипт міграції: старі силабуси лишаються read-only (історичні PDF), нові йдуть новим шляхом.

### Фаза 4 — Якість рекомендацій (5–7 днів, рубрика з фази 0 має бути готова)
- Stage 0–4, verifier, cap/dedup, playbook-формулювання, `kind: 'question'`, перевірка URL кейсів.
- Analysis job з етапами і відновленням.
- Логування `criterionId`/`promptVersion`/`rejectTag`, `npm run eval` на golden set.
- **Готово, коли:** на golden set precision ≥ 0.7, у середньому ≤ 10 рекомендацій на силабус, 0 рекомендацій без доказу. Після 2–3 тижнів у продакшні частка прийнятих зростає порівняно з базовою метрикою фази 0.

### Фаза 5 — PPTX і PDF (5–7 днів)
- PPTX: extractor, run-level writer, прев'ю до і після через LibreOffice → PNG, бюджет довжини тексту (≤ ~115% оригіналу), позначки `readOnly` для SmartArt і діаграм.
- PDF: extractor на `pdfjs-dist` (абзаци з bbox), анотації на оригіналі (`pdf-lib` або підтримуваний форк; PyMuPDF дає кращий API, але має ліцензію AGPL), банер «завантажте DOCX». Конвертація PDF → DOCX — опційна бета.

### Фаза 6 — Далі (за потреби)
- Кластери студентів і опитування (ТЗ 2.1/2.3): інжектити в критерії кейсів і активностей тільки за наявності реальних даних.
- Імпорт Google Docs (експорт у DOCX через Drive API), якщо викладачі KSE працюють у Google Workspace.

---

## 6. Ризики і відкриті питання

1. **Якість екстракції PDF** обмежує все інше. Скановані PDF потребують OCR (Docling або Azure DI), тож для них можливі лише анотації.
2. **LibreOffice** — нова інфраструктурна залежність (Docker-образ, шрифти, черга). Без неї не працюють `.doc` і фінальний PDF tracked-версії. Альтернатива для прев'ю — тільки `docx-preview`, але рендер змін там позначено як experimental, і його треба перевірити на фікстурах.
3. **`docx-preview renderChanges` і експорт tracked changes у PDF через LibreOffice** не перевірялися на реальних файлах. Це частина spike у фазі 2.
4. **Ліцензії:** PyMuPDF (AGPL), Aspose/Apryse (комерційні). План обходиться без них.
5. **Продуктове рішення:** чи потрібен директору доступ у застосунок (read-only роль) замість email? ТЗ (розділ 3) згадує «адмін-доступ для менеджера та академічного директора». Зараз роль `manager` видалена, директор отримує лише лист.
6. **Рубрика і стандартні формулювання** без участі академічного директора не з'являться. Без них фаза 4 дасть лише частину ефекту.

## Додаток: ключові джерела

- Tracked changes у DOCX: Adeu (`@adeu/core`, MIT) https://github.com/dealfluence/adeu; Anthropic docx skill https://github.com/anthropics/skills; Docxodus https://github.com/JSv4/Docxodus; docx-preview https://github.com/VolodymyrBaydalka/docxjs
- PDF/PPTX: pdf.js https://github.com/mozilla/pdf.js; pdf-lib https://github.com/Hopding/pdf-lib; pptx-automizer https://github.com/singerla/pptx-automizer; Docling https://github.com/docling-project/docling; PowerPoint не має tracked changes, лише Compare (Microsoft support)
- Формати правок: Aider edit formats https://aider.chat/docs/more/edit-formats.html; Diff-XYZ https://arxiv.org/abs/2510.12487; Tiptap/ProseMirror suggest-changes
- Якість рекомендацій: Palmer, Bach & Streifer 2014 (learning-focused syllabus rubric) https://teaching.virginia.edu/resources/syllabus-rubric; Quality Matters Higher Ed Rubric; AACSB Standard 5; CheckEval https://arxiv.org/abs/2403.18771; LLM-Rubric (ACL 2024); BitsAI-CR (generate → filter) https://arxiv.org/html/2501.15134v1; Zheng et al. LLM-as-judge https://arxiv.org/abs/2306.05685; contract-review playbooks (LegalOn, Spellbook)
