# CLAUDE.md

Контекст і правила для роботи з проєктом **KSE AI Syllabus Analyzer**. Мова коментарів і повідомлень користувача — українська, код і ідентифікатори — англійською.

## 1. Призначення

AI-аналізатор силабусів MBA для Kyiv School of Economics. Викладач завантажує силабус (DOCX/DOC/PDF). Бекенд розбирає документ на блоки і перевіряє його за рубрикою (шаблон KSE, MBA-27 learning outcomes, оцінювання, практика, політики) через OpenAI. На кожну знахідку готується пропозиція правки — операції над блоками документа. Викладач проходить пропозиції в чаті по одній: Прийняти / Відхилити / Змінити (Refine) / Відповісти (для питань) / Повернутися (Reopen). Результат — той самий файл викладача з tracked changes Word (`*_tracked.docx`), чиста версія (`*_clean.docx`) і PDF tracked-версії. Після відправки Academic Director отримує tracked DOCX + PDF і звіт на email.

Контракт API чату і пропозицій — `docs/api-v3.md` (фронтенд будується за ним). План переробки — `docs/REFACTOR_PLAN.md`.

## 2. Стек

- **Backend:** Node.js, Express 4, MongoDB/Mongoose, OpenAI Responses API, Nodemailer, JWT. Документи: jszip + @xmldom/xmldom (DOCX), `diff` + `node-diff3` (word diff, 3-way merge), `docx` + `pdf-parse` (PDF → DOCX), LibreOffice `soffice` (DOC → DOCX, DOCX → PDF).
- **Frontend:** React 18 (CRA, `react-scripts`), React Router 6, MUI 5, Axios, react-markdown + remark-gfm. Proxy на `http://localhost:5000`.
- **Тести (backend):** Jest + supertest + mongodb-memory-server (системний `/usr/bin/mongod`, `MONGOMS_SYSTEM_BINARY`), каталог `backend/test/`, запуск `cd backend && npm test`. Фікстури: `test/fixtures/docx/` (DOCX/DOC, генератор `generate.js`), `test/fixtures/pdf/`. Frontend тестів немає.
- **Eval рекомендацій:** `cd backend && npm run eval` (golden set, `backend/eval/`).
- **Перевірки:** `npm test` і `node -c <file>` для змінених файлів backend, `npm run build` у `frontend/`.

## 3. Структура

```
backend/
  server.js               Express (експортує `app`, слухає порт лише при `node server.js`): fail-fast env, middleware, CORS (exposedHeaders Content-Disposition), rate limits, таймаути, DB-guard, error handler, bootstrap admin + seed програм, фонові sweepers
  middleware/auth.js      `auth` (JWT + роль і isActive з БД), `requireRole('admin')`
  utils/tokens.js         SHA-256 хеші токенів reset/invite/email-change
  utils/httpError.js      httpError(statusCode, message, { code, retryable, details }), sendError(res, err)
  utils/concurrency.js    mapLimit
  routes/                 auth, syllabus (upload/status/analyze/download), chat (пропозиції, outputs, submit), cabinet, users, policies
  models/                 User, Syllabus, Suggestion, Conversation, Message, Program, Policy
  services/document/      модель документа (див. його README): loadDocument (docx/doc/pdf), extractors/docx.js,
                          extractors/pdfToDocx.js (+ pdfText.worker.js), apply.js (validateOps, applyAccepted, findConflicts,
                          previewChanges, diffBlock, merge3), writers/docx.js (clean/tracked + коментарі), convert.js (LibreOffice)
  services/ai/
    client.js             єдина обгортка OpenAI: createResponse, safeParseJSON, clipText, supportsReasoning
    constants.js          шаблон KSE, 9 MBA-27 outcomes
    rubric/               критерії рубрики (дані), стандартні формулювання, getCriterion, SEVERITY_RANK
    review/               пайплайн рубрики: runReview (checks → structure → diagnose → verify), generateSuggestion (rewrite → ops)
    suggestionBuilder.js  знахідка + результат generateSuggestion → поля Suggestion; валідатор ops для review; пріоритет
    orchestrator.js       analyzeSyllabus: runReview → generateSuggestion на кожну знахідку (паралельно ≤ 3) → Suggestion-и → in_progress
    chatReply.js          вільна відповідь з контекстом SuggestionView; classifyIntent (question|refine, strict json_schema)
  services/analysisRunner.js  фоновий аналіз: етап extract (оригінал → робочий .docx → blocks) + orchestrator; помилка → status=error + analysisError
  services/chat/
    state.js              docOf, isLegacy/LEGACY_SYLLABUS, assertEditable, toDocSuggestion, loadAccepted(Docs), acceptedHash, invalidateOutputs, readiness
    readiness.js          ваги груп і computeReadiness
    view.js               SuggestionView (changes, options, conflictsWith, criterionTitle), GET-view, прев'ю пропозиції і документа
    flow.js               розмова з привітанням, postNextCard (наступна картка / submission-cta), лічильник збоїв AI
    decisions.js          accept / reject / reopen / refine (+mergeWithAccepted) / answer
    freeChat.js           вільне повідомлення: намір → відповідь AI або refine поточної картки
  services/workspaceService.js  фасад services/chat + outputs + submit для маршрутів
  services/outputs.js     tracked.docx / clean.docx / tracked.pdf у uploads/outputs/<id>/, кеш за docVersion + acceptedHash
  services/submission.js  submitSyllabus (gate, атомарне захоплення), звіт, лист AD (resend теж через нього)
  services/emailService.js      Nodemailer (Gmail або SMTP), sendSubmissionToAdEmail з кількома вкладеннями
  services/syllabusCleanup.js   каскадне видалення (файли, outputs, Suggestion, Conversation, Message), sweepers
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

1. **Upload** (`POST /api/syllabus/upload`): формат за розширенням І magic bytes (`.docx` PK, `.doc` OLE, `.pdf` %PDF). Syllabus створюється зі статусом `analyzing`, `analysisStage: 'extract'`, оригінал лежить у `uploads/syllabi/` незмінним. Далі все у фоні (`analysisRunner`).
2. **Extract:** `loadDocument(buffer, sourceFormat)` → робочий `.docx` (для docx — сам оригінал; для doc — LibreOffice; для pdf — синтезований, `<original>.working.docx`) → `document = { docVersion, convertedFrom, blocks }`, `workingFile.path`, похідний `extractedText`.
3. **Analyze** (`orchestrator.js`): `runReview({ blocks, meta })` → findings → `generateSuggestion` на кожну (ліміт 3, `validateOps` модуля документів передається для повторів LLM). Збій для знахідки → порада `applicable: false` без ops (не губимо). `order` = сортування за severity rank × confidence. `rubricSummary` зберігається на Syllabus. Етапи `analysisStage`: `extract|structure|diagnose|verify|rewrite|done` (`GET /syllabus/:id/status` → `{ status, stage, error }`).
4. **Chat** (`services/chat`):
   - `POST /start` створює Conversation (1:1 із силабусом) з українським привітанням (лічильники за severity) і показує першу pending-картку. До start GET-view має `conversation: null`, `readiness: null`.
   - Картка — Message `kind: 'suggestion'` з `relatedSuggestionId`; вміст фронтенд бере з `suggestions[]` (SuggestionView будується на льоту: word-diff через `previewChanges`, `conflictsWith` через `findConflicts` проти прийнятих).
   - Після кожного рішення: інвалідація outputs, `lastDecisionAt`, readiness, `postNextCard` (наступна pending за `order`; якщо остання картка в чаті вже вона — не дублюємо; немає pending → `submission-cta`).
   - Вільне повідомлення: для pending-картки `classifyIntent` → `refine` (Refine поточної картки з текстом як feedback) або `question` (`chatReply`). Збій LLM → 503 retryable, `consecutiveAiFailures` (≥ 3 → `status: 'error'`, скидається при успіху).
5. **Стан документа:** нічого не зберігається інкрементально. Будь-яке подання (прев'ю, файли) будується `applyAccepted(doc, accepted)` з оригінальних блоків плюс множини прийнятих пропозицій у порядку `acceptedAt`.
6. **Фінал:** `GET /outputs/:name` (`tracked.docx` | `clean.docx` | `tracked.pdf`) доступний будь-коли; файли `<originalBase>_tracked.docx` тощо, автор правок «KSE Syllabus Analyzer», коментарі Word з `rationale`. `submit` рендерить outputs заново (`fresh`), шле AD tracked.docx + tracked.pdf (якщо LibreOffice недоступний — лише DOCX і примітка у звіті) і звіт, ставить `status=submitted`.
7. **Readiness:** `breakdown[group]` = частка розглянутих (accepted + rejected) у групі (порожня група = 100); `score` = Σ вага × breakdown. Ваги: template 0.3, outcomes 0.25, assessment 0.2, practice 0.1, policy 0.15. `counts: { pending, accepted, rejected, total }`. Знімок — у `Conversation.readiness`; GET-view і кабінет рахують наживо.

### Ключові моделі

- **Syllabus:** `sourceFormat` (`docx|doc|pdf`), `originalFile`, `workingFile.path`, `document { docVersion, convertedFrom, blocks[] }`, `extractedText` (похідне), `outputs { clean, tracked, trackedPdf }` (кожен `{ path, generatedAt, docVersion, acceptedHash }`), `rubricSummary`, `status` (`analyzing|in_progress|submitted|error`), `analysisStage`, `analysisError`, `submitting`, `submissionEmailStatus` (`pending|sent|failed`), `legacy`, `submittedPdfPath` (лише legacy).
- **Suggestion:** `syllabusId`, `findingId`, `criterionId`, `group` (`template|outcomes|assessment|practice|policy`), `severity`, `confidence`, `kind` (`edit|choice|question`), `title`, `description`, `rationale`, `evidenceBlockIds`, `ops` (edit), `options[{ id, label, rationale, ops }]` (choice), `question`/`answer`, `applicable`, `status` (`pending|accepted|rejected`), `selectedOptionId`, `acceptedAt`, `supersedes[]`, `decisionReason`, `rejectTag` (`already_present|too_generic|incorrect|not_relevant|other`), `decisionHistory[]`, `versions[]` (попередні варіанти після Refine/Answer), `order`, `docVersion`, `finding` (знімок для перегенерації), `promptVersion`. Індекси `{syllabusId,status}`, `{syllabusId,order}`, `{criterionId,status}`.
- **Conversation:** `currentSuggestionId`, `status` (`active|submitted|error`), `readiness`, `lastDecisionAt`, `consecutiveAiFailures`.
- **Message:** `kind` ∈ `text`, `suggestion`, `submission-cta`; `relatedSuggestionId`.
- **User.role:** `instructor`, `admin`. Роль `manager` видалена (див. розділ 9). Верифікації email немає: єдине джерело акаунтів — інвайт адміна (`POST /cabinet/users`), токени reset/invite/email-change зберігаються як SHA-256.
- **Program:** `code` (unique, uppercase), `academicDirectorEmail`. Seed: MBA, EMBA, CORPORATE, INTENSIVE.

## 5. Бізнес-правила (з коду, не з ТЗ)

**Доступ**
- Чат: читання (GET-view, прев'ю, `document/preview`, `outputs`) — власник або admin; **мутації тільки для власника** (`gateMutate`). `syllabus.canMutate` у GET-view = власник, не submitted і не legacy.
- Legacy-силабуси (до v4, без `document`): чат лише читається, мутації і outputs → 409 `LEGACY_SYLLABUS` («завантажте файл ще раз»). `analyze` для legacy розбирає оригінал заново і знімає `legacy`.
- Силабус `download`/`delete`/`GET /:id`/`/status`: власник або admin. `GET /:id` не віддає серверні шляхи і `outputs`. `analyze` і `PUT /:id`: тільки власник. `analyze` → 409 для `analyzing`/`submitted`; re-analyze видаляє Suggestion-и, Conversation+Messages, outputs і `rubricSummary`, але зберігає `document`.
- Cabinet (програми, користувачі, `resend-submission`, cleanup uploads): admin. `PATCH /cabinet/users/:id` (`isActive`, `role`); 409, якщо зміна (або `DELETE /users/account`) лишає систему без активного адміна. Видалення програми з силабусами → 409. Instructor бачить тільки свої силабуси. `/cabinet/syllabi` віддає проєкцію (без `document`), `issueCounts: { pending, accepted, rejected, total }` і `readiness` (агрегація Suggestion), `limit` ≤ 100.
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
- Ліміт upload 10 MB (`MAX_FILE_SIZE`, 413). Дозволені `.docx`, `.doc`, `.pdf`; вміст має відповідати розширенню (інакше 400). Помилки розбору (`INVALID_DOCX`, `INVALID_PDF`, `PDF_NO_TEXT`, `SOFFICE_MISSING`, `CONVERSION_*`) → `status=error` з українським `analysisError`.
- Файли: `uploads/syllabi/` (оригінал, `*.working.docx`), `uploads/outputs/<syllabusId>/` (кеш фінальних файлів), `uploads/pdfs/` (лише legacy).
- Фонові задачі на старті: завислі `analyzing` (> 3×`AI_REQUEST_TIMEOUT_MS`) → `error`; знімається завислий `submitting`; `uploads/pdfs` старші 7 днів без посилань видаляються щодоби. `cleanup-uploads` не чіпає файли молодші 10 хв і файли, на які посилається силабус (оригінал, робочий, outputs).

## 6. Правила змін у коді

- **LLM-виклики** тільки через `services/ai/client.js` (`createResponse`), структуровані відповіді — strict `json_schema`. Не створювати новий OpenAI-клієнт. Модель задається `LLM_MODEL` і має починатися з `gpt-`.
- **Редагування силабусу — тільки операції над блоками** (`replaceBlock` / `insertAfter` / `deleteBlock`) через `services/document`. Модель повертає **повний новий текст абзацу**, мінімальний diff (картка, `w:del`/`w:ins`) рахує сервер. Модель не пише diff і розмітку. Ops перевіряються `validateOps`/`validateSuggestion` (при генерації — strict, при accept — `strict: false`).
- **`applyAccepted` ідемпотентний і завжди від оригіналу** (блоки `document` + множина прийнятих у порядку `acceptedAt`). Не зберігати і не мутувати «поточний текст» документа інкрементально; reopen — просто вилучення з множини.
- **Конфлікти** виявляються явно (`findConflicts` перед accept, 409 `SUGGESTION_CONFLICT`); мовчазних відкидань правок не додавати. Поради без ops не передавати у writer (`loadAcceptedDocs` їх відфільтровує).
- **Версії:** `document.docVersion` = sha1 робочого `.docx`; writer перевіряє його (409 `STALE_DOC_VERSION`). Пропозиція зберігає `docVersion`, для якого згенерована.
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

- Backend (без `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY` сервер не стартує): `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY`, `LLM_MODEL` (default `gpt-5.4-mini`), `LLM_REASONING_EFFORT` (default `medium`), `LLM_MAX_OUTPUT_TOKENS`, `FRONTEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REQUEST_TIMEOUT_MS` (20000), `AI_REQUEST_TIMEOUT_MS` (130000), `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `LOGIN_RATE_LIMIT_*`, `CHAT_MESSAGE_RATE_LIMIT` (30), `REWRITE_CONCURRENCY` (3), `GMAIL_USER`/`GMAIL_PASS` або `SMTP_*`, `SOFFICE_PATH`, `SOFFICE_CONCURRENCY` (1), `SOFFICE_TIMEOUT_MS` (120000), `PDF_EXTRACT_TIMEOUT_MS` (60000).
- Frontend: `REACT_APP_API_URL` (default `http://localhost:5000/api`).

Запуск: `cd backend && npm run dev` (порт 5000), `cd frontend && npm start` (порт 3000). Порти звільняє `npm run stop-ports` з кореня. Для `.doc` і `tracked.pdf` потрібен LibreOffice.

## 8. Відомі прогалини

- Аналіз кластерів студентів і опитування (ТЗ 2.1, 2.3) не реалізовані; частину «AI-челенджера» закривають пропозиції `kind: 'question'`.
- PDF: лише текст → синтезований DOCX (без форматування і таблиць оригіналу); скани без текстового шару не підтримуються. Повноцінний PDF/PPTX — фаза 5.
- Аналіз не є відновлюваним job-ом: після рестарту завислий `analyzing` стає `error` (sweeper), користувач запускає re-analyze. `runReview` не повідомляє проміжні етапи, тож `analysisStage` переходить `extract → structure → rewrite → done`.
- Метрики прийняття по `criterionId`/`rejectTag` збираються в Suggestion, але дашборду немає.
- Фронтенд ще має перейти на контракт `docs/api-v3.md` (паралельна задача).

## 9. Рішення щодо ролей

- Роль `manager` **видалена** з коду: enum у `User`, фронтенд (`App.js`, `Sidebar.js`, `Cabinet.js`), API `PUT /cabinet/users/:id/programs`, поле `managedProgramIds`, README.
- `scripts/migrate-v2.js` лишається історичною міграцією і далі понижує `manager` до `instructor`. Якщо в БД ще є користувачі з `role: 'manager'`, вони не пройдуть валідацію enum при збереженні. Перед будь-яким оновленням їх треба понизити до `instructor` вручну або запустити міграцію.
- Перед розгортанням v4 запустити `scripts/migrate-v4-suggestions.js` (старі силабуси → `legacy`).
