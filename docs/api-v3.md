# API v3: пропозиції, чат і фінальні файли

Контракт між бекендом і фронтендом для фази 3 (`docs/REFACTOR_PLAN.md` §2.3–2.7). Усі тексти для користувача — українською. Помилки мають форму `{ message, code?, ...details }` зі статусом із `err.statusCode`.

## Модель даних

### Syllabus (зміни)
- `sourceFormat`: `'docx' | 'doc' | 'pdf'` — формат, який завантажив викладач.
- `document`: `{ docVersion, convertedFrom: null | 'doc' | 'pdf', blocks: Block[] }` — результат `services/document.loadDocument`. Робочий `.docx` (для `doc`/`pdf` — сконвертований або синтезований) зберігається поруч з оригіналом: `workingFile.path`.
- `outputs`: `{ clean, tracked, trackedPdf }`, кожен `{ path, generatedAt, docVersion, acceptedHash }` — кеш фінальних файлів; інвалідовується при кожному рішенні (`acceptedHash` = хеш множини прийнятих пропозицій).
- `rubricSummary`: зведення рубрики (вердикти по критеріях, лічильники) з `runReview`.
- Видаляються: `extractedText` (лишається лише як похідне `document.blocks.map(b => b.text).join('\n')` для пошуку, необов'язково), `editedText`, `revisionMarkup`, `previewPdf`, `recommendations[]`, `structure`, `analysis`.
- Старі силабуси без `document` отримують `legacy: true` (міграція). Для них чат лише читається, а мутації повертають 409 `LEGACY_SYLLABUS` з пропозицією завантажити файл знову.

### Suggestion (нова колекція)
```js
{
  _id, syllabusId, findingId, criterionId, group,          // group: template|outcomes|assessment|practice|policy
  severity,                                                // critical|high|medium|low
  kind,                                                    // 'edit' | 'choice' | 'question'
  title, description,                                      // українською
  evidenceBlockIds: [String],
  ops: [Op],                                               // kind=edit
  options: [{ id, label, rationale, ops: [Op] }],          // kind=choice
  question: String,                                        // kind=question
  applicable: Boolean,                                     // false → порада без кнопки «Прийняти»
  status: 'pending' | 'accepted' | 'rejected',
  selectedOptionId: String | null,
  supersedes: [ObjectId],
  decisionReason, rejectTag,                               // rejectTag: already_present|too_generic|incorrect|not_relevant|other
  decisionHistory: [{ action, at, by, reason, rejectTag, optionId, feedback }],
  versions: [{ ops, options, question, feedback, at }],    // попередні варіанти після Refine
  order: Number,                                           // порядок показу (severity × confidence)
  promptVersion, createdAt, updatedAt
}
```
`Op` = `{ op: 'replaceBlock', blockId, newText }` | `{ op: 'insertAfter', blockId, newBlocks: [{ kind, text, level? }] }` | `{ op: 'deleteBlock', blockId }`.

Рішення змінюються атомарно: `findOneAndUpdate({ _id, status: 'pending' }, …)`.

### Message.kind
`text` | `suggestion` (`relatedSuggestionId`, payload формується на льоту з Suggestion, у повідомленні зберігається лише id) | `submission-cta`.

## Ендпоінти

Читання: власник або admin. Мутації: тільки власник (`gateMutate`). Префікс `/api/chat/:syllabusId`.

| Метод | Шлях | Опис |
|---|---|---|
| GET | `/` | `{ conversation, messages, suggestions: SuggestionView[], readiness, syllabus: { id, title, status, sourceFormat, convertedFrom, legacy, canMutate } }`. `canMutate` = поточний користувач є власником, силабус не submitted і не legacy. До `/start` `conversation` і `readiness` дорівнюють `null`. |
| POST | `/start` | Створити розмову, якщо її немає. Показати першу pending-пропозицію. Повертає те саме, що GET. |
| GET | `/suggestions/:sid/preview?optionId=` | `{ suggestionId, changes: BlockChange[] }` — diff тільки цієї пропозиції відносно оригіналу |
| POST | `/suggestions/:sid/accept` | body `{ optionId?, conflictResolution?: 'replacePrevious' }`. Конфлікт → 409 `{ code: 'SUGGESTION_CONFLICT', conflicts: [{ suggestionId, title }] }`. З `replacePrevious` конфліктні прийняті пропозиції стають `rejected` з `rejectTag: 'other'` і причиною «Замінено пропозицією …». Повертає GET-view. |
| POST | `/suggestions/:sid/accept` (порада) | Для `applicable:false` `accept` дозволений без `optionId`: статус `accepted`, жодних змін у документі (UI: «Зрозуміло»). |
| POST | `/suggestions/:sid/reject` | body `{ reason?, rejectTag? }`. Для critical/high потрібен `reason` (400 без нього). Повертає GET-view. |
| POST | `/suggestions/:sid/refine` | body `{ feedback?, mergeWithAccepted?: boolean }`. Регенерує ops або options (LLM). `mergeWithAccepted` враховує текст уже прийнятих конфліктних пропозицій і ставить `supersedes`. Попередній варіант іде в `versions`. Повертає GET-view. |
| POST | `/suggestions/:sid/answer` | body `{ answer }` для `kind=question`. Генерує edit-пропозицію з відповіддю. Та сама Suggestion змінює `kind` на `edit` (питання і відповідь ідуть у `versions`), тож `SuggestionView` для неї повертається вже як edit-картка. Повертає GET-view. |
| POST | `/suggestions/:sid/reopen` | accepted/rejected → pending. Без каскаду, повідомлення не видаляються. 409 для submitted. Повертає GET-view. |
| POST | `/message` | body `{ text }`. Вільне питання → відповідь AI. Якщо це запит змінити поточну пропозицію («коротше», «без дат»), сервер робить refine поточної картки. Повертає GET-view. |
| GET | `/document/preview` | `{ blocks: [{ blockId, kind, level, parts: [{ type: 'eq'\|'del'\|'ins', text }] , status: 'unchanged'\|'changed'\|'inserted'\|'deleted' }] }` — весь документ з усіма прийнятими змінами |
| GET | `/outputs/:name` | (CORS: `exposedHeaders: ['Content-Disposition']`) |
| GET | `/outputs/:name` | `name` ∈ `tracked.docx` \| `clean.docx` \| `tracked.pdf`. Файл з оригінальним ім'ям (`<name>_tracked.docx` тощо). Доступно будь-коли до і після submit; кешується до наступного рішення. |
| POST | `/submit` | Gate: немає pending (409 зі списком). Рендерить outputs заново. Лист директору містить tracked.docx, tracked.pdf і звіт. Повторний submit → 409. |

### SuggestionView
```js
{
  id, kind, status, severity, group, criterionId, title, description, question,
  applicable, selectedOptionId, decisionReason, rejectTag, order,
  changes: BlockChange[],                         // для kind=edit
  options: [{ id, label, rationale, changes: BlockChange[] }],   // для kind=choice
  conflictsWith: [{ suggestionId, title }],       // з уже прийнятими (обчислюється на льоту для pending)
  requiresReason: Boolean                         // critical/high
}
BlockChange = { blockId, op, kind, before, after, parts: [{ type: 'eq'|'del'|'ins', text }] }
// op ∈ 'replaceBlock' | 'insertAfter' | 'deleteBlock'. Для insertAfter кожен новий блок — окремий BlockChange
// (blockId = якір, before = '', after = текст нового блоку). Для deleteBlock after = ''.
```

### readiness
`{ score, breakdown: { template, outcomes, assessment, practice, policy }, counts: { pending, accepted, rejected, total } }`. `resolved` = accepted + rejected. Ваги: template 0.3, outcomes 0.25, assessment 0.2, practice 0.1, policy 0.15. Блок без пропозицій = 100.

## Upload і аналіз
- `POST /api/syllabus/upload` приймає `.docx`, `.doc`, `.pdf` (magic bytes). `.doc` конвертується через LibreOffice. `.pdf` розбирається на абзаци, з яких синтезується простий `.docx` (`convertedFrom: 'pdf'`). Інтерфейс показує банер «Для збереження оригінального форматування завантажте DOCX».
- Аналіз запускається у фоні. `runReview` (`services/ai/review`) → для кожної знахідки `generateSuggestion` (паралельно, з лімітом) → Suggestion-и → `status: 'in_progress'`.
- `GET /api/syllabus/:id/status` → `{ status, stage, error }`. `stage` — один з `extract|structure|diagnose|verify|rewrite|done`.

## Доповнення реалізації (бекенд, фаза 3)

Усе нижче — розширення контракту, наявні поля не змінювались.

- **SuggestionView** додатково містить: `criterionTitle` (назва критерію з рубрики, англійською, або `null`), `rationale`, `answer`, `evidenceBlockIds`, `supersedes: [id]`, `versionsCount`. Кожен елемент `options[]` має ще `applicable` (`false`, якщо у варіанта немає ops — його не можна прийняти) і `conflictsWith`. Верхньорівневий `conflictsWith` для choice — об'єднання по всіх варіантах. Для `kind=question` поле `applicable` = `true`: дія — `/answer`, `accept` повертає 409 `ANSWER_REQUIRED`.
- **GET-view `syllabus`** додатково: `analysisStage`, `submittedAt`, `submissionEmailStatus`.
- **GET `/suggestions/:sid/preview`** для choice без `optionId` і без вибраного варіанта повертає зміни всіх варіантів підряд.
- **GET `/document/preview`** додатково повертає `conflicts` (з `applyAccepted`); у вставлених блоків є `suggestionIds`, `blockId` вставки — синтетичний (`b0005+<suggestionId>.1`).
- **`/message`** для submitted силабусу лише відповідає (refine неможливий). Намір класифікується тільки коли поточна картка pending.
- **Rate limit** `CHAT_MESSAGE_RATE_LIMIT` (за користувачем, 429) діє на `/message`, `/refine`, `/answer`.
- **Коди помилок** (`{ message, code, ...details }`): 400 `REASON_REQUIRED`, `OPTION_REQUIRED`; 409 `NOT_PENDING`, `NOT_DECIDED`, `ANSWER_REQUIRED`, `NOT_APPLICABLE` (варіант choice без ops), `NOT_A_QUESTION`, `SUGGESTION_CONFLICT`, `STALE_DOC_VERSION`, `ALREADY_SUBMITTED`, `ANALYSIS_IN_PROGRESS`, `ANALYSIS_FAILED`, `LEGACY_SYLLABUS`, `PENDING_SUGGESTIONS` (`pending: [{ suggestionId, title, severity }]`), `SUBMIT_IN_PROGRESS`; 422 `INVALID_OPS` (`errors`); 503 з `retryable: true` при збої LLM.
- **Legacy**: `GET /outputs/:name` і `GET /document/preview` теж повертають 409 `LEGACY_SYLLABUS`.
- **Submit без LibreOffice**: лист іде лише з `tracked.docx`, у звіті примітка; `GET /outputs/tracked.pdf` → 503 `SOFFICE_MISSING`.
- **Upload**: розбір документа (конвертація `.doc`, синтез з `.pdf`) — фоновий етап `extract`; помилки розбору дають `status: 'error'` з українським `error` у `/status`, а не 4xx на upload. `stage` проходить `extract → structure → rewrite → done` (пайплайн review не повідомляє проміжних етапів `diagnose`/`verify`).
- **Cabinet `/cabinet/syllabi`**: `issueCounts: { pending, accepted, rejected, total }`, `readiness: { score, breakdown }` (рахується з Suggestion; для `analyzing`/`error` — `{ score: 0, breakdown: {} }`), а також `sourceFormat`, `convertedFrom`, `legacy`, `analysisStage`.
