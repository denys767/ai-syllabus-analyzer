# CLAUDE.md

Контекст і правила для роботи з проєктом **KSE AI Syllabus Analyzer**. Мова коментарів і повідомлень користувача — українська, код і ідентифікатори — англійською.

> **v5 у роботі (ТЗ v2.1 «Силабус через діалог»).** План — `docs/V5_PLAN.md`, контракт — `docs/api-v5.md`. Нова робота ведеться за правилами розділу 0. Розділи 1–9 описують v4 і переписуються наприкінці v5 (хвиля W3); якщо вони суперечать розділу 0, перемагає розділ 0.

## 0. Правила v5 (мають пріоритет над розділами 1–9)

- **Мова.** UI, повідомлення AI в чаті, `message` помилок API і зміст силабуса — англійською. Коментарі в коді — українською. Промпти LLM — англійською.
- **Джерело правди — `Syllabus.state`** (`services/syllabusState/schema.js`), не файл викладача.
  - Пише його лише `syllabusState/store.mutate` (умова на `stateRevision`, перерахунок E-полів, зняття `approved`, запис `SlotChange`).
  - Вхідний файл тільки розбирається в слоти (`services/document` → blocks → `services/ai/parse`).
- **Реєстр слотів** — `services/syllabusState/slots.js`: тип A–E, `locked|library|free`, пороги повноти. Не дублювати ці правила в промптах чи маршрутах.
- **Нічого не прив'язувати до MBA в коді.**
  - Шаблон, ПРН, нормативні курси, Capstone — записи з `programCode` (`services/references`). Фікстури лежать у `backend/fixtures/reference/`, сід ідемпотентний.
  - Силабус перевіряється проти свого `programCode`; core/elective — лише за `ProgramCourse` своєї програми.
- **Перевірки з ТЗ §2 — код, не промпт** (`services/checks`, чисті функції). LLM — лише для суджень (якість формулювань, мапінг PLO, кейси, компонент ↔ заборони ШІ), і результат іде в чат, не в Readiness.
- **Політики.**
  - Текст — лише з довідника (`Policy` `type: 'syllabus-policy'`) або за прямою вказівкою викладача.
  - AI ніколи не заповнює політику з власної ініціативи.
  - Library-блоки не мають дефолту.
  - Зміна тексту довідника → `modified: true` + `source: 'fixture_edited'`.
- **Факти від моделі** (числа, пороги, терміни, дати, назви кейсів/рідінгів) потрапляють у стан лише через `proposedValues` з окремим підтвердженням. `apply_edit` ніколи не викликається без явного Confirm. Для `locked` мутуючі інструменти заборонені.
- **Readiness** = затверджені обов'язкові розділи / обов'язкові. Затверджено = пороги `slots.sectionGaps` пройдені **і** `approved`. Відхилена порада Readiness не знижує.
- **Вихід** — один `.docx` за шаблоном (`services/document/writers/templateDocx.js`), доступний будь-коли.
  - Submit, email АД, PDF-виходи і PPTX видаляються.
  - На вході — docx/doc/pdf.
- **Без змін:** правила LLM-викликів (лише `services/ai/client.js`, strict `json_schema` / strict function tools), `httpError`/`sendError`, `gateMutate`, атомарні переходи Suggestion, обов'язкова причина для critical/high, перевірені URL (`caseSources.verifyUrl`), lease аналізу, міграції в `scripts/` з `--dry-run` і тестом.
- **Перевірки перед закриттям задачі:** `cd backend && npm test`, `node -c` для змінених файлів, `cd frontend && npm run build`.

## 1. Призначення

AI-аналізатор силабусів MBA для Kyiv School of Economics. Викладач завантажує силабус (DOCX/DOC/PDF/PPTX). Бекенд розбирає документ на блоки і перевіряє його за рубрикою (шаблон KSE, MBA-27 learning outcomes, оцінювання, практика, політики) через OpenAI. На кожну знахідку готується пропозиція правки — операції над блоками документа. Викладач проходить пропозиції в чаті по одній: Прийняти / Відхилити / Змінити (Refine) / Відповісти (для питань) / Повернутися (Reopen). Результат — той самий файл викладача з tracked changes Word (`*_tracked.docx`), чиста версія (`*_clean.docx`) і PDF tracked-версії; для PDF ще й оригінальний PDF з примітками (`*_annotated.pdf`), для PPTX — презентація з правками (`*_edited.pptx`) і її PDF (`*_preview.pdf`). Після відправки Academic Director отримує файли формату і звіт на email.

Контракт API чату і пропозицій — `docs/api-v3.md` (фронтенд будується за ним; хвиля 5 — розділ «Фаза 5» і «Доповнення реалізації (бекенд, хвиля 5)»). План переробки — `docs/REFACTOR_PLAN.md`.

## 2. Стек

- **Backend:** Node.js, Express 4, MongoDB/Mongoose, OpenAI Responses API, Nodemailer, JWT. Документи: jszip + @xmldom/xmldom (DOCX, PPTX), `diff` + `node-diff3` (word diff, 3-way merge), `pdfjs-dist` (текст PDF у worker thread) + `docx` (синтез DOCX з PDF), `@cantoo/pdf-lib` (анотації PDF), LibreOffice `soffice` (DOC → DOCX, DOCX/PPTX → PDF), `pdftoppm` з poppler-utils (PNG слайдів).
- **Frontend:** React 18 (CRA, `react-scripts`), React Router 6, MUI 5, Axios, react-markdown + remark-gfm. Proxy на `http://localhost:5000`.
- **Тести (backend):** Jest + supertest + mongodb-memory-server (системний `/usr/bin/mongod`, `MONGOMS_SYSTEM_BINARY`), каталог `backend/test/`, запуск `cd backend && npm test`. Фікстури: `test/fixtures/docx/` (DOCX/DOC, генератор `generate.js`), `test/fixtures/pdf/`, `test/fixtures/pptx/`. Мережі в тестах немає (`fetch`/DNS для перевірки URL — mock). Frontend тестів немає.
- **Eval:** golden set v4 видалено (W3-J); eval парсингу й перевірок v5 — TBD (`backend/eval/README.md`). Команди `npm run eval` немає.
- **Перевірки:** `npm test` і `node -c <file>` для змінених файлів backend, `npm run build` у `frontend/`.

## 3. Структура

```
backend/
  server.js               Express (експортує `app`, слухає порт лише при `node server.js`): fail-fast env, middleware, CORS (exposedHeaders Content-Disposition), rate limits, таймаути, DB-guard, error handler, bootstrap admin + seed програм, фонові sweepers
  middleware/auth.js      `auth` (JWT + роль і isActive з БД), `requireRole('admin')`
  utils/tokens.js         SHA-256 хеші токенів reset/invite/email-change
  utils/httpError.js      httpError(statusCode, message, { code, retryable, details }), sendError(res, err)
  utils/concurrency.js    mapLimit
  routes/                 auth, syllabus (upload/status/analyze/download), chat (пропозиції, слайди, outputs, submit), cabinet, users, policies
  models/                 User, Syllabus, Suggestion, Conversation, Message, Program, Policy
  services/document/      модель документа (див. його README): loadDocument (docx/doc/pdf/pptx), extractors/docx.js, pptx.js,
                          pdf.js (pdf.js у worker thread: pdfRuntime.js + pdfWorker.js), pdfToDocx.js (синтез DOCX 1:1 з блоків PDF),
                          pdfMapping.js (прийняті → блоки PDF), apply.js (validateOps, applyAccepted, findConflicts, previewChanges,
                          diffBlock, merge3), writers/docx.js (clean/tracked + коментарі), writers/pptx.js (edited + overflowRisk),
                          writers/pdfAnnotations.js (annotatePdf), preview.js (pdfToPng, renderPptxPreview), convert.js (LibreOffice)
  services/ai/
    client.js             єдина обгортка OpenAI: createResponse, safeParseJSON, clipText, supportsReasoning
    constants.js          шаблон KSE, 9 MBA-27 outcomes
    rubric/               критерії рубрики (дані), стандартні формулювання, getCriterion, SEVERITY_RANK
    review/               пайплайн рубрики: runReview (checks → structure → diagnose → verify, onStage), generateSuggestion (rewrite → ops);
                          caseSources.js — опційний веб-пошук кейсів і перевірка URL (CASE_WEB_SEARCH=1)
    suggestionBuilder.js  знахідка + результат generateSuggestion → поля Suggestion; валідатор ops для review; пріоритет
    orchestrator.js       analyzeSyllabus: runReview → generateSuggestion на кожну знахідку (паралельно ≤ 3) → Suggestion-и → in_progress
    chatReply.js          вільна відповідь з контекстом SuggestionView; classifyIntent (question|refine, strict json_schema)
  services/analysisRunner.js  фоновий аналіз: захоплення lease, етап extract (оригінал → робочий файл → blocks) + orchestrator; помилка → status=error + analysisError
  services/analysisLease.js   lease аналізу (LEASE_MS, MAX_ATTEMPTS, ownedAnalysis, assertLease)
  services/chat/
    state.js              docOf, isLegacy/LEGACY_SYLLABUS, assertEditable, toDocSuggestion, loadAccepted(Docs), acceptedHash, invalidateOutputs, readiness
    readiness.js          ваги груп і computeReadiness
    view.js               SuggestionView (changes з slide для pptx, options, conflictsWith, criterionTitle, sources), GET-view, прев'ю пропозиції і документа
    slides.js             PNG «до/після» змінених слайдів картки (pptx), LRU-кеш у пам'яті
    flow.js               розмова з привітанням, postNextCard (наступна картка / submission-cta), лічильник збоїв AI
    decisions.js          accept / reject / reopen / refine (+mergeWithAccepted) / answer
    freeChat.js           вільне повідомлення: намір → відповідь AI або refine поточної картки
  services/workspaceService.js  фасад services/chat + outputs + submit для маршрутів
  services/outputFormats.js  перелік файлів за форматом і станом силабусу (outputNames/outputList), вкладення submit
  services/outputs.js     рендер файлів за ключем у uploads/outputs/<id>/, кеш за docVersion + acceptedHash
  services/submission.js  submitSyllabus (gate, атомарне захоплення), звіт, лист AD (resend теж через нього)
  services/emailService.js      Nodemailer (Gmail або SMTP), sendSubmissionToAdEmail з кількома вкладеннями
  services/syllabusCleanup.js   каскадне видалення (файли, outputs, Suggestion, Conversation, Message), sweepers (lease аналізу, submitting, старі PDF)
  services/userService.js       isLastActiveAdmin
../scripts/migrate-v2.js, migrate-v3-cleanup.js, migrate-v4-suggestions.js  одноразові міграції (idempotent, --dry-run)
frontend/src/
  App.js                маршрути і захист за ролями
  services/api.js       Axios: Bearer з localStorage.token, 401 → auth_logout, 429 retry
  contexts/             AuthContext, ThemeContext
  pages/                ProfessorTutorWorkspace (чат), Cabinet, Profile, Settings, PoliciesPage, ConfirmEmailChange
  components/Workspace/ чат: MessageBubble, IssuesPanel, ChatInput, EmptyState
  components/Auth/, components/Layout/, components/PolicyReader.js
instructions.txt        ТЗ українською (розділи 2.1–4)
```

## 4. Архітектура і потік даних

1. **Upload** (`POST /api/syllabus/upload`): формат за розширенням І вмістом (`.docx` — zip з `word/document.xml`, `.pptx` — zip з `ppt/presentation.xml`, `.doc` OLE, `.pdf` %PDF). Syllabus створюється зі статусом `analyzing`, `analysisStage: 'extract'`, оригінал лежить у `uploads/syllabi/` незмінним. Далі все у фоні (`analysisRunner`).
2. **Extract:** `loadDocument(buffer, sourceFormat)` → робочий файл (docx і pptx — сам оригінал; doc — `.docx` з LibreOffice; pdf — синтезований `<original>.working.docx`, блоки 1:1 з PDF) → `document = { docVersion, format, meta, convertedFrom, blocks }` (для pdf ще `sourceBlocks`, `sourceDocVersion`, `pdfBlockMap`), `workingFile.path`, похідний `extractedText`. Re-analyze пропускає extract, якщо document повний (PDF без `sourceDocVersion` розбирається заново).
   **Job:** `runAnalysis` атомарно захоплює lease (`analysisLeaseToken`, `analysisLeaseUntil`, `analysisAttempts += 1`), продовжує його кожну третину `ANALYSIS_LEASE_MS`; усі записи етапів — з умовою на свій токен (`ownedAnalysis`), втрата lease зупиняє запуск без запису (`ANALYSIS_LEASE_LOST`). Sweeper (старт і кожні 5 lease): прострочений lease і `analysisAttempts < 2` → перезапуск, інакше `error`.
3. **Analyze** (`orchestrator.js`): `runReview({ blocks, meta })` → findings → `generateSuggestion` на кожну (ліміт 3, `validateOps` модуля документів передається для повторів LLM). Збій для знахідки → порада `applicable: false` без ops (не губимо). `order` = сортування за severity rank × confidence. `rubricSummary` зберігається на Syllabus. Етапи `analysisStage`: `extract|structure|diagnose|verify|rewrite|done` (`runReview` повідомляє `onStage`; `GET /syllabus/:id/status` → `{ status, stage, error }`). З `CASE_WEB_SEARCH=1` для знахідок про кейси (PR-1..3) `generateSuggestion` шукає джерела в інтернеті й перевіряє URL (див. README `review/`); `Suggestion.sources`.
4. **Chat** (`services/chat`):
   - `POST /start` створює Conversation (1:1 із силабусом) з українським привітанням (лічильники за severity) і показує першу pending-картку. До start GET-view має `conversation: null`, `readiness: null`.
   - Картка — Message `kind: 'suggestion'` з `relatedSuggestionId`; вміст фронтенд бере з `suggestions[]` (SuggestionView будується на льоту: word-diff через `previewChanges`, `conflictsWith` через `findConflicts` проти прийнятих; для pptx кожен BlockChange має `slide`). Для pptx `GET /suggestions/:sid/slides` дає PNG «до/після» змінених слайдів (LibreOffice + pdftoppm, LRU-кеш).
   - Після кожного рішення: інвалідація outputs, `lastDecisionAt`, readiness, `postNextCard` (наступна pending за `order`; якщо остання картка в чаті вже вона — не дублюємо; немає pending → `submission-cta`).
   - Вільне повідомлення: для pending-картки `classifyIntent` → `refine` (Refine поточної картки з текстом як feedback) або `question` (`chatReply`). Збій LLM → 503 retryable, `consecutiveAiFailures` (≥ 3 → `status: 'error'`, скидається при успіху).
5. **Стан документа:** нічого не зберігається інкрементально. Будь-яке подання (прев'ю, файли) будується `applyAccepted(doc, accepted)` з оригінальних блоків плюс множини прийнятих пропозицій у порядку `acceptedAt`.
6. **Фінал:** `GET /outputs/:name` доступний будь-коли для імен з `syllabus.outputs` (`outputFormats.js`): docx/doc — `tracked.docx`, `clean.docx`, `tracked.pdf`; pdf — ще `annotated.pdf` (анотації на оригіналі через `pdfMapping`); pptx — `edited.pptx`, `preview.pdf`. Файли `<originalBase>_tracked.docx` тощо, автор правок «KSE Syllabus Analyzer», коментарі Word з `rationale`. `submit` рендерить outputs заново (`fresh`), шле AD головні файли формату (`tracked.docx` / `annotated.pdf` + `tracked.docx` / `edited.pptx`) і PDF LibreOffice (`tracked.pdf` / `preview.pdf`; якщо недоступний — без нього, з приміткою у звіті) і звіт, ставить `status=submitted`.
7. **Readiness:** `breakdown[group]` = частка розглянутих (accepted + rejected) у групі (порожня група = 100); `score` = Σ вага × breakdown. Ваги: template 0.3, outcomes 0.25, assessment 0.2, practice 0.1, policy 0.15. `counts: { pending, accepted, rejected, total }`. Знімок — у `Conversation.readiness`; GET-view і кабінет рахують наживо.

### Ключові моделі

- **Syllabus:** `sourceFormat` (`docx|doc|pdf|pptx`), `originalFile`, `workingFile.path`, `document { docVersion, format, meta, convertedFrom, blocks[], sourceBlocks?, sourceDocVersion?, pdfBlockMap? }`, `extractedText` (похідне), `outputs { clean, tracked, trackedPdf, annotated, edited, previewPdf }` (кожен `{ path, generatedAt, docVersion, acceptedHash }`), `rubricSummary`, `status` (`analyzing|in_progress|submitted|error`), `analysisStage`, `analysisError`, `analysisLeaseUntil`, `analysisLeaseToken` (select: false), `analysisAttempts`, `submitting`, `submissionEmailStatus` (`pending|sent|failed`), `legacy`, `submittedPdfPath` (лише legacy).
- **Suggestion:** `syllabusId`, `findingId`, `criterionId`, `group` (`template|outcomes|assessment|practice|policy`), `severity`, `confidence`, `kind` (`edit|choice|question`), `title`, `description`, `rationale`, `evidenceBlockIds`, `ops` (edit), `options[{ id, label, rationale, ops }]` (choice), `question`/`answer`, `applicable`, `status` (`pending|accepted|rejected`), `selectedOptionId`, `acceptedAt`, `supersedes[]`, `decisionReason`, `rejectTag` (`already_present|too_generic|incorrect|not_relevant|other`), `decisionHistory[]`, `versions[]` (попередні варіанти після Refine/Answer), `sources[{ title, publisher, year, url, verified }]` (кейси з веб-пошуку), `order`, `docVersion`, `finding` (знімок для перегенерації), `promptVersion`. Індекси `{syllabusId,status}`, `{syllabusId,order}`, `{criterionId,status}`.
- **Conversation:** `currentSuggestionId`, `status` (`active|submitted|error`), `readiness`, `lastDecisionAt`, `consecutiveAiFailures`.
- **Message:** `kind` ∈ `text`, `suggestion`, `submission-cta`; `relatedSuggestionId`.
- **User.role:** `instructor`, `admin`. Роль `manager` видалена (див. розділ 9). Верифікації email немає: єдине джерело акаунтів — інвайт адміна (`POST /cabinet/users`), токени reset/invite/email-change зберігаються як SHA-256.
- **Program:** `code` (unique, uppercase), `academicDirectorEmail`. Seed: MBA, EMBA, CORPORATE, INTENSIVE.

## 5. Бізнес-правила (з коду, не з ТЗ)

**Доступ**
- Чат: читання (GET-view, прев'ю, `document/preview`, `outputs`) — власник або admin; **мутації тільки для власника** (`gateMutate`). `syllabus.canMutate` у GET-view = власник, не submitted і не legacy.
- Legacy-силабуси (до v4, без `document`): чат лише читається, мутації і outputs → 409 `LEGACY_SYLLABUS` («завантажте файл ще раз»). `analyze` для legacy розбирає оригінал заново і знімає `legacy`.
- Силабус `download`/`delete`/`GET /:id`/`/status`: власник або admin. `GET /:id` не віддає серверні шляхи і `outputs`. `analyze` і `PUT /:id`: тільки власник. `analyze` → 409 для `analyzing`/`submitted`; re-analyze видаляє Suggestion-и, Conversation+Messages, outputs і `rubricSummary`, але зберігає `document`.
- Cabinet (програми, користувачі, `resend-submission`, cleanup uploads): admin. `PATCH /cabinet/users/:id` (`isActive`, `role`); 409, якщо зміна (або `DELETE /users/account`) лишає систему без активного адміна. Видалення програми з силабусами → 409. Instructor бачить тільки свої силабуси. `/cabinet/syllabi` віддає проєкцію (без `document`), `issueCounts: { pending, accepted, rejected, total }`, `readiness` (агрегація Suggestion) і `outputs`, `limit` ≤ 100.
- Роль береться з БД на кожен запит (не з JWT).
- Rate limits: суворий per-IP на `/api/auth/login|forgot-password|reset-password` (`LOGIN_RATE_LIMIT_*`), загальний per-IP на сайт і на `/api`, per-user `CHAT_MESSAGE_RATE_LIMIT` на `message`, `refine`, `answer`.
- Policies: створення/зміна/видалення — admin; `acknowledge` — будь-який авторизований.
- Дефолтний маршрут: admin → `/cabinet`, інші → `/workspace`.

**Рішення в чаті** (усі — 409, якщо силабус submitted/analyzing/error)
- Кожна зміна статусу — атомарний `findOneAndUpdate` з умовою на поточний статус; повторне рішення → 409 `NOT_PENDING`.
- `accept`: `kind=question` → 409 `ANSWER_REQUIRED`; `applicable:false` (порада) → `accepted` без змін документа; choice потребує `optionId` (400), варіант без ops → 409 `NOT_APPLICABLE`; `docVersion` пропозиції ≠ документа → 409 `STALE_DOC_VERSION`; некоректні ops → 422 `INVALID_OPS`; конфлікт з прийнятими → 409 `SUGGESTION_CONFLICT` `{ conflicts: [{ suggestionId, title }] }`, з `conflictResolution: 'replacePrevious'` конфліктні стають `rejected` (`rejectTag: 'other'`, «Замінено пропозицією «…»»). Після захоплення конфлікти перевіряються ще раз (гонка двох вкладок) і accept відкочується.
- `reject`: для critical/high потрібна причина (400 `REASON_REQUIRED`), `rejectTag` з enum. Блокерів немає: відхилення з причиною — повноцінне рішення.
- `reopen`: одна пропозиція → `pending`, без каскаду, повідомлення не видаляються (картка постається знову).
- `refine`: лише pending; `feedback` і/або `mergeWithAccepted`. Попередній варіант → `versions`. З `mergeWithAccepted` модель бачить поточний текст блоків, змінених конфліктними прийнятими пропозиціями, а нова пропозиція отримує `supersedes` (тоді `applyAccepted` ігнорує операції заміненої на спільних блоках).
- `answer`: лише `kind=question`; та сама Suggestion стає `kind=edit` (питання і відповідь — у `versions`). Якщо модель знову не дала правки — порада `applicable:false` з уточненням в описі.

**Фінал**
- `submit` дозволений лише коли немає pending (409 `PENDING_SUGGESTIONS` зі списком `pending`). Атомарне захоплення прапорцем `submitting`; повторний submit → 409.
- Email не налаштований або не відправився → `submissionEmailStatus=failed`, у чаті повідомлення про необхідність звернутися до офісу програми.

**Файли**
- Ліміт upload 10 MB (`MAX_FILE_SIZE`, 413). Дозволені `.docx`, `.doc`, `.pdf`, `.pptx`; вміст має відповідати розширенню (інакше 400). Помилки розбору (`INVALID_DOCX`, `INVALID_PDF`, `PDF_NO_TEXT`, `SOFFICE_MISSING`, `CONVERSION_*`) → `status=error` з українським `analysisError`.
- Файли: `uploads/syllabi/` (оригінал, `*.working.docx`), `uploads/outputs/<syllabusId>/` (кеш фінальних файлів), `uploads/pdfs/` (лише legacy).
- Фонові задачі на старті: `analyzing` з простроченим lease → перезапуск (до 2 спроб) або `error` (також кожні 5×`ANALYSIS_LEASE_MS`); знімається завислий `submitting`; `uploads/pdfs` старші 7 днів без посилань видаляються щодоби. `cleanup-uploads` не чіпає файли молодші 10 хв і файли, на які посилається силабус (оригінал, робочий, outputs).

## 6. Правила змін у коді

- **LLM-виклики** тільки через `services/ai/client.js` (`createResponse`), структуровані відповіді — strict `json_schema`. Не створювати новий OpenAI-клієнт. Модель задається `LLM_MODEL` і має починатися з `gpt-`.
- **Редагування силабусу — тільки операції над блоками** (`replaceBlock` / `insertAfter` / `deleteBlock`) через `services/document`, однакові для docx/pdf/pptx. Для PDF ops адресують блоки синтезованого DOCX; на PDF їх переводить лише `pdfMapping.js`. Модель повертає **повний новий текст абзацу**, мінімальний diff (картка, `w:del`/`w:ins`) рахує сервер. Модель не пише diff і розмітку. Ops перевіряються `validateOps`/`validateSuggestion` (при генерації — strict, при accept — `strict: false`).
- **`applyAccepted` ідемпотентний і завжди від оригіналу** (блоки `document` + множина прийнятих у порядку `acceptedAt`). Не зберігати і не мутувати «поточний текст» документа інкрементально; reopen — просто вилучення з множини.
- **Конфлікти** виявляються явно (`findConflicts` перед accept, 409 `SUGGESTION_CONFLICT`); мовчазних відкидань правок не додавати. Поради без ops не передавати у writer (`loadAcceptedDocs` їх відфільтровує).
- **Версії:** `document.docVersion` = sha1 робочого `.docx`; writer перевіряє його (409 `STALE_DOC_VERSION`). Пропозиція зберігає `docVersion`, для якого згенерована.
- **Перелік фінальних файлів** — лише `services/outputFormats.js` (GET-view, кабінет, `GET /outputs/:name`, submit). Не хардкодити імена файлів у маршрутах.
- **Аналіз:** записи фонового аналізу — лише з фільтром `ownedAnalysis(id, leaseToken)`; запуск — лише через `runAnalysis`/`runAnalysisInBackground` (атомарне захоплення lease).
- **Зовнішні URL** у тексті пропозицій — лише перевірені сервером (`caseSources.verifyUrl`); неперевірені вирізаються з позначкою «Джерело не підтверджено». У тестах мережі немає.
- **Інвалідація кешу:** після будь-якого рішення чату (accept/reject/reopen/refine/answer) викликати `invalidateOutputs` (через `afterDecision`). Кеш outputs додатково валідується ключем `docVersion + acceptedHash`.
- **Мутації чату** завжди через `gateMutate`. Не послаблювати перевірку власника для admin. Зміни статусу Suggestion — лише атомарні `findOneAndUpdate` з умовою на статус.
- **Причини:** не обходити правило обов'язкової причини для critical/high і gate фіналу (немає pending).
- **Пайплайн рекомендацій** (`services/ai/review`) не знає про БД і формат файлу; інтеграція — лише через `orchestrator.js`/`suggestionBuilder.js`. У HTTP-тестах його мокати (`jest.mock('../services/ai/review')`).
- **Помилки з `statusCode`:** сервіси кидають `httpError` зі `statusCode`/`code`/`retryable`/`details`, маршрути віддають через `sendError` (`{ message, code?, retryable?, ...details }`).
- **Секрети:** не комітити `.env`, ключі, SMTP-паролі. Шаблон — `backend/example.env`.
- **`frontend/build/`:** не змінювати і не комітити хеш-шум без потреби. Збірка потрібна лише для перевірки.
- **Мова UI:** користувацькі тексти в бекенді і фронтенді — українською. Промпти LLM — англійською, тексти для викладача від моделі — українською.
- **Міграції даних:** окремий скрипт у `scripts/` (idempotent, `--dry-run`), з тестом у `backend/test/`.
- **Перевірки перед закриттям задачі:** `cd backend && npm test`; `node -c` для змінених backend-файлів; `cd frontend && npm run build`.

## 7. Конфігурація (ключові env)

- Backend (без `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY` сервер не стартує): `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY`, `LLM_MODEL` (default `gpt-5.4-mini`), `LLM_REASONING_EFFORT` (default `medium`), `LLM_MAX_OUTPUT_TOKENS`, `FRONTEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REQUEST_TIMEOUT_MS` (20000), `AI_REQUEST_TIMEOUT_MS` (130000), `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `LOGIN_RATE_LIMIT_*`, `CHAT_MESSAGE_RATE_LIMIT` (30), `REWRITE_CONCURRENCY` (3), `GMAIL_USER`/`GMAIL_PASS` або `SMTP_*`, `SOFFICE_PATH`, `SOFFICE_CONCURRENCY` (1), `SOFFICE_TIMEOUT_MS` (120000), `PDF_EXTRACT_TIMEOUT_MS` (120000), `ANALYSIS_LEASE_MS` (60000), `CASE_WEB_SEARCH` (`1` — увімкнути веб-пошук кейсів; за замовчуванням вимкнено).
- Frontend: `REACT_APP_API_URL` (default `http://localhost:5000/api`).

Запуск: `cd backend && npm run dev` (порт 5000), `cd frontend && npm start` (порт 3000). Порти звільняє `npm run stop-ports` з кореня. Для `.doc`, `tracked.pdf`, `preview.pdf` і прев'ю слайдів потрібен LibreOffice; для прев'ю слайдів ще `pdftoppm` (poppler-utils).

## 8. Відомі прогалини

- Аналіз кластерів студентів і опитування (ТЗ 2.1, 2.3) не реалізовані; частину «AI-челенджера» закривають пропозиції `kind: 'question'`.
- PDF: правки — анотації на оригіналі (`annotated.pdf`, не редагований PDF); синтезований DOCX без форматування і таблиць оригіналу; евристики абзаців pdf.js можуть зливати сусідні абзаци чи колонки; скани без текстового шару не підтримуються (OCR немає).
- PPTX: `overflowRisk` — евристика довжини тексту, не реальне розміщення; LibreOffice може рендерити шрифти інакше, ніж PowerPoint. SmartArt, діаграми і нотатки не редагуються.
- Аналіз відновлюється після рестарту (lease, до 2 спроб), але починається з початку: проміжні результати не зберігаються.
- Кеш прев'ю слайдів — у пам'яті процесу (не спільний між інстансами, губиться при рестарті).
- Метрики прийняття по `criterionId`/`rejectTag` збираються в Suggestion, але дашборду немає.
- Фронтенд ще має перейти на контракт `docs/api-v3.md` (паралельна задача).

## 9. Рішення щодо ролей

- Роль `manager` **видалена** з коду: enum у `User`, фронтенд (`App.js`, `Sidebar.js`, `Cabinet.js`), API `PUT /cabinet/users/:id/programs`, поле `managedProgramIds`, README.
- `scripts/migrate-v2.js` лишається історичною міграцією і далі понижує `manager` до `instructor`. Якщо в БД ще є користувачі з `role: 'manager'`, вони не пройдуть валідацію enum при збереженні. Перед будь-яким оновленням їх треба понизити до `instructor` вручну або запустити міграцію.
- Перед розгортанням v4 запустити `scripts/migrate-v4-suggestions.js` (старі силабуси → `legacy`).
