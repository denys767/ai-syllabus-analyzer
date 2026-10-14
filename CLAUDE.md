# CLAUDE.md

Контекст і правила для роботи з проєктом **KSE AI Syllabus Analyzer**. Мова коментарів і повідомлень користувача — українська, код і ідентифікатори — англійською.

## 1. Призначення

AI-аналізатор силабусів MBA для Kyiv School of Economics. Викладач завантажує силабус (PDF/DOC/DOCX). Бекенд перевіряє його за шаблоном KSE та MBA-27 learning outcomes через OpenAI. Викладач проходить рекомендації в чаті по одній: Confirm / Cancel / Preview / Reopen. Далі формується фінальний PDF, який відправляється Academic Director-у на email.

## 2. Стек

- **Backend:** Node.js, Express 4, MongoDB/Mongoose, OpenAI Responses API, Nodemailer, Mammoth, pdf-parse, Puppeteer, JWT.
- **Frontend:** React 18 (CRA, `react-scripts`), React Router 6, MUI 5, Axios, react-markdown + remark-gfm. Proxy на `http://localhost:5000`.
- **Тестів немає.** Перевірки: `node -c <file>` для змінених файлів backend і `npm run build` у `frontend/`.

## 3. Структура

```
backend/
  server.js               Express: middleware, rate limits, таймаути, DB-guard, маршрути, bootstrap admin + seed програм
  middleware/auth.js      auth (JWT + перевірка існування/isActive), authorize(...roles), requireVerification
  middleware/roles.js     admin
  routes/                 auth, syllabus, chat, cabinet, users, policies, googleForms (НЕ підключений у server.js)
  models/                 User, Syllabus (вбудовані recommendations), Conversation, Message, Program, Policy, Survey, StudentCluster, PracticalIdea
  services/workspaceService.js  логіка чату: nextIssue, confirm/cancel/reopen, gate фіналу, preview, submit
  services/emailService.js      Nodemailer (Gmail або SMTP)
  services/aiService.js         shim → ./ai
  services/pdfService.js        порожній, не використовується
  services/ai/
    orchestrator.js     analyzeSyllabus: аналіз → рекомендації → edits → статус in_progress
    analyzer.js         LLM (JSON) → structure + recommendations
    editGenerator.js    LLM → line-number edits для кожної рекомендації (choice / case-cards / before-after)
    lineDoc.js          нумерація рядків, sha1-версія документа, валідація edits
    applyEdits.js       resolve/validate edits, recomputeSyllabusState, preview-стан
    revisionMarkup.js   red/green розмітка змін
    finalRender.js      PDF (Puppeteer), revision PDF, submission-звіт
    chatReply.js        вільний чат з контекстом поточної картки
    client.js           обгортка OpenAI: createResponse, safeParseJSON, clipText
    constants.js        шаблон KSE, 9 MBA-27 outcomes, мітки категорій
  scripts / ../scripts/migrate-v2.js  одноразова міграція даних (idempotent, --dry-run)
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

1. **Upload** (`POST /api/syllabus/upload`): текст витягується, Syllabus зі статусом `analyzing`, `analyzeSyllabus` запускається у фоні.
2. **Analyze** (`orchestrator.js`): `analyzer` повертає рекомендації → `editGenerator` для кожної рекомендації будує line-edits → статус `in_progress`. Помилка → статус `error`.
3. **Chat** (`workspaceService.js`):
   - `getOrCreateConversation` створює Conversation (1:1 з силабусом) і стартове повідомлення.
   - `nextIssueMessage` вибирає pending-рекомендацію з найвищим пріоритетом (critical > high > medium > low). Якщо кеш `beforeAfter` відсутній або застарів (`isRecApplicable`), регенерує його через LLM.
   - `applyDecision` при Confirm валідує edits, встановлює `decision`, викликає `recomputeSyllabusState`, інвалідовує preview-PDF і перераховує readiness.
4. **Стан документа:** `editedText` і `revisionMarkup` **перебудовуються** з `extractedText` плюс усі прийняті рекомендації. Не накопичуються інкрементально.
5. **Фінал:** `previewFinalPdf` кешує PDF до наступного рішення. `submitSyllabus` завжди рендерить PDF заново, відправляє його з звітом на `academicDirectorEmail`, ставить `status=submitted`.
6. **Readiness:** score = Σ вага × відсоток прийнятих рекомендацій у блоці. Ваги: templateCompliance 0.4, learningOutcomes 0.3, cases 0.15, policies 0.15. Категорії мапляться в блоки через `CATEGORY_TO_BLOCK`.

### Ключові моделі

- **Syllabus:** `recommendations[]` з `decision` (`pending`/`accepted`/`rejected`/`skipped`), `decidedVia`, `decisionReason`, `decisionHistory[]`, `beforeAfter` (`kind`: `before-after`/`choice`/`case-cards`, `payload` з `docVersion`, `options`/`cards`, `appliedSelection`). Статуси: `analyzing`/`in_progress`/`submitted`/`error`. `submissionEmailStatus`: `pending`/`sent`/`failed`.
- **Conversation:** `currentIssueId`, `status` (`active`/`submitted`/`abandoned`/`error`), `readiness`, `consecutiveAiFailures` (після 3 збоїв → `status=error`).
- **Message:** `kind` ∈ `text`, `before-after`, `choice`, `case-cards`, `submission-cta`; `relatedIssueId`.
- **User.role:** `instructor`, `admin`, `manager` (див. розділ 9).
- **Program:** `code` (unique, uppercase), `academicDirectorEmail`. Seed: MBA, EMBA, CORPORATE, INTENSIVE.

## 5. Бізнес-правила (з коду, не з ТЗ)

**Доступ**
- Чат: читання для власника або admin; **мутації тільки для власника** (`gateMutate`). Admin має read-only доступ до чату.
- Силабус `analyze`/`download`/`delete`: власник або admin (`isOwnerOrAdmin`).
- Cabinet (програми, користувачі, `resend-submission`, cleanup uploads): admin.
- Policies: створення/зміна/видалення — admin; `acknowledge` — будь-який авторизований.
- Створення користувачів: ролі `instructor` або `admin` (`routes/auth.js` `create-user`).

**Рішення в чаті**
- `Confirm` доступний лише якщо рекомендація має `beforeAfter.payload`; інакше 409.
- `Cancel` для `critical`/`high` вимагає причину (інакше 400). Причина опційна для `medium`/`low`.
- Відхилена critical/high **без причини** є **блокером**. Коли pending немає, блокери повертаються в pending, і фінал заблокований.
- `Reopen` (`reopenIssue`): видаляє повідомлення після якірного, скидає пізніші вирішені рекомендації, перераховує стан. Заборонено для submitted.
- Stale версія документа (`sha1`) → 409 з `STALE_DOC_VERSION`, користувачу пропонується re-analyze.

**Фінал**
- `preview` і `submit` дозволені лише коли немає pending і немає блокерів (409 з переліком).
- Повторний submit → 409 `Already submitted`.
- Email не налаштований або не відправився → `submissionEmailStatus=failed`, у чаті повідомлення про необхідність звернутися до офісу програми.

**Файли**
- Ліміт upload 10 MB (повідомлення в `routes/syllabus.js`). Типи: PDF/DOC/DOCX (фільтр не перевірявся детально).

## 6. Правила змін у коді

- **LLM-виклики** тільки через `services/ai/client.js` (`createResponse`). Не створювати новий OpenAI-клієнт. Модель задається `LLM_MODEL` і має починатися з `gpt-`.
- **Редагування силабусу** тільки через line-edits (`replace`/`delete`/`insert*`/`appendDoc`) з номерами рядків. Модель не має цитувати текст силабусу.
- **Версії:** кожна зміна `extractedText`/`editedText` має оновлювати `sha1` або явно обробляти `STALE_DOC_VERSION`.
- **`recomputeSyllabusState`** має залишатися ідемпотентним (перебудова з `extractedText`). Не додавати інкрементальні мутації `editedText` поза ним.
- **Інвалідація кешу:** після будь-якого рішення чату викликати `invalidatePreviewPdf` і ставити `editingStatus='ready'`.
- **Мутації чату** завжди через `gateMutate`. Не послаблювати перевірку власника для admin.
- **Блокери і причини:** не обходити правило обов'язкової причини для critical/high і gate фіналу.
- **Помилки з `statusCode`:** сервіси кидають `Error` з `statusCode`/`retryable`, маршрути повертають їх як є.
- **Секрети:** не комітити `.env`, ключі, SMTP-паролі. Шаблон — `backend/example.env`.
- **`frontend/build/`:** не змінювати і не комітити хеш-шум без потреби. Збірка потрібна лише для перевірки.
- **Мова UI:** користувацькі тексти в бекенді і фронтенді — українською (як у поточних повідомленнях помилок і чату).
- **Перевірки перед закриттям задачі:** `node -c` для змінених backend-файлів; `cd frontend && npm run build`.

## 7. Конфігурація (ключові env)

- Backend: `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY`, `LLM_MODEL` (default `gpt-5.4-mini`), `LLM_REASONING_EFFORT` (default `medium`), `LLM_MAX_OUTPUT_TOKENS`, `FRONTEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REQUEST_TIMEOUT_MS` (20000), `AI_REQUEST_TIMEOUT_MS` (130000), `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `CHAT_MESSAGE_RATE_LIMIT` (30), `GMAIL_USER`/`GMAIL_PASS` або `SMTP_*`, `PUPPETEER_EXECUTABLE_PATH`, `GF_WEBHOOK_SECRET`.
- Frontend: `REACT_APP_API_URL` (default `http://localhost:5000/api`).

Запуск: `cd backend && npm run dev` (порт 5000), `cd frontend && npm start` (порт 3000). Порти звільняє `npm run stop-ports` з кореня.

## 8. Відомі прогалини

- Аналіз кластерів студентів, опитування (`Survey`, `StudentCluster`), `PracticalIdea` і AI-челенджер (ТЗ 2.1, 2.3) у пайплайні **не реалізовані**. Категорії `student-clusters` і `plagiarism` є в enum, але аналізатор їх не генерує. Перевірка подібності вимкнена (`skipped: true`).
- `routes/googleForms.js` не підключений у `server.js`.
- `services/pdfService.js` порожній, `services/aiService.js` — лише shim.
- Більшість залежностей у `package.json` із `"latest"`. Збірка не відтворювана.
- Немає автоматичних тестів для `applyEdits`/`workspaceService` (стан, reopen, gate).
- Не перевірено права доступу в `GET /api/syllabus/:id/status` і `/:id/download` на предмет перевірки власника. Перевірити перед змінами.

## 9. Відкриті питання

- **Роль `manager`:** README описує її як читача програм, `App.js` дає їй доступ до кабінету, а `scripts/migrate-v2.js` понижує manager до instructor. Потрібно вирішити: зберегти роль чи прибрати з enum і фронтенду.
