# API v5: силабус через діалог

Контракт між бекендом і фронтендом для v5 (ТЗ v2.1 «Силабус через діалог»; план — `docs/V5_PLAN.md`). Замінює `docs/api-v3.md`, коли v5 злито.

- **Мова.** Тексти UI, повідомлення AI в чаті, `message` помилок і зміст силабуса — англійською. Коментарі в коді — українською.
- **Помилки.** Форма `{ message, code?, retryable?, ...details }`, статус береться з `err.statusCode` (`utils/httpError.js`).
- **Доступ.** Читання — власник або admin. Мутації — тільки власник (`gateMutate`).
- **Чого більше немає.** Submit, email АД, PDF-виходи, PPTX.

## 1. Стан силабусу (`Syllabus.state`)

Єдине джерело правди. Схема лежить у `backend/services/syllabusState/schema.js` (`stateSchema`, `validateState`), реєстр слотів і пороги повноти — у `backend/services/syllabusState/slots.js`.

### Правила стану

- **Запис.** Стан пишеться лише через `syllabusState/store.mutate(syllabusId, expectedRevision, fn, ctx)`. Це атомарний `findOneAndUpdate({ _id, stateRevision }, { $set: { state }, $inc: { stateRevision: 1 } })`. Розбіжність ревізії → 409 `STATE_CONFLICT { revision }`.
- **Що робить `mutate` на кожен запис.**
  - Перераховує всі E-поля (`syllabusState/computed.js`).
  - Знімає `approved` з розділів, яких торкнулася зміна.
  - Пише `SlotChange { syllabusId, revision, path, before, after, source, suggestionId, by, at }`.
- **Провенанс.** Кожна сутність має `source` (`fixture | fixture_edited | instructor_directed | parsed | ai_draft | computed | crm`) і `evidenceBlockIds` (блоки вхідного файлу; для треку 1 — порожньо).
- **Політики.**
  - `state.policies` завжди містить усі 13 блоків довідника.
  - `locked` — текст фікстури.
  - `library` — `optionKey: null`, доки викладач не обрав. **Дефолту немає.**
  - Блок зараховано, якщо `optionKey` заповнений або `source ∈ {instructor_directed, fixture_edited}` (`slots.policyDecided`).
- **`courseKind`.** `core`, якщо `header.courseCode` або назва курсу є серед `ProgramCourse` свого `programCode`, інакше `elective`. Збіг за назвою допустимий лише як підказка для автоматичної підстановки `courseCode`, і викладач її підтверджує.
- **`header.declared`** (необов'язкове). Значення таблиці At a Glance, розпізнані у вхідному файлі: `{ assessmentTotal, contactHours, selfStudyHours, deliveryMode, term, instructor }` (`term` — текст як у файлі або `{ start, end }` ISO). Для треку 1 — `null` або відсутнє. Тіло з ним не синхронізується; перевірки `glance.*` порівнюють `declared` з тілом.

### Syllabus (нові поля)

| Поле | Значення |
|---|---|
| `programCode` | Редакція програми, напр. `MBA27`, `MBA28`; береться з `Program.editions` |
| `track` | `scratch` або `upload` |
| `state`, `stateRevision` | Стан і його ревізія |
| `baselineState` | Знімок стану після парсингу (трек 2) або створення (трек 1); основа для diff у правій панелі |
| `downloads` | Лічильник завантажень `.docx` (метрика MVP) |
| `needsRebuild` | Силабус v4, ще не перебудований у v5 |
| `plagiarismCheck.similarSyllabi` | Заготовка, `null` |

`status`: `analyzing | in_progress | error`; `submitted` прибрано. Етапи `analysisStage`: `extract | parse | checks | review | done`.

## 2. Довідники (усі за `programCode`; `null` — для всіх програм)

| Модель | Звідки сідиться (`backend/fixtures/reference/`) |
|---|---|
| `TemplateSection { programCode, key, order, docNumber, docTitle, title, required, nature, slotTypes, question, fixtureRef, computeFrom }` | `template.sections.json` |
| `ProgramOutcome { programCode, code, text, themeDraft, order }` | `learning-outcomes.json` |
| `OutcomeMapping { from, to, pairs[{ from, to, change }] }` | `learning-outcomes.json.mapping27to28` |
| `ProgramCourse { programCode, code, uk, en, ects }` | `programme-courses.json` |
| `CapstoneGuide { programCode, version, projectTypes, structure, criteria, deliverables, plagiarismThreshold }` | `capstone.criteria.json` (поки однаковий для MBA27/MBA28) |
| `Policy` з `type: 'syllabus-policy'`: `key`, `order`, `mode`, `blockRequired`, `rationale`, `titleUk`, `options[{ key, label, text }]`, `text` (locked), `libraryVersion` | `policies.library.json`. `content` — markdown з усіма варіантами для сторінки Documents |
| Каталоги `assessment-components`, `prerequisites`, `compensation`, `ai-tools` | Поки порожні stub-и. Відповідні B-слоти деградують до C |

- `Program.editions: [{ code, label }]`. Сід: MBA → MBA27, MBA28.
- Читання довідників — лише через `services/references`, а політик — через `services/references/policies.js`. Сід ідемпотентний, на старті (`services/references/seed.js`).

## 3. Перевірки (`services/checks`)

Чисті синхронні функції: `runChecks(state, refs) → Check[]`.

```js
Check = { id, severity, section, path, message, details, passed }
// severity: critical | high | medium | warning | info
// section: TemplateSection.key
// message: англійською
// passed=false — проблема
```

- Порядок: `severity` (critical → info), далі `TemplateSection.order`.
- М'які LLM-перевірки (`checks/llm.js`) мають ту саму форму, але `source: 'llm'`; кешуються за hash стану.
- `id` унікальний у межах результату: `rule` або `rule:entityId` (базове правило — `details.rule`). Перелік правил — `backend/services/checks/README.md`.

## 4. Readiness

```js
readiness = {
  score,                                  // round(approvedRequired / required × 100)
  sections: { [key]: { status: 'empty'|'draft'|'approved', complete, approved, gaps: [String], checks: { critical, high, other } } },
  counts: { approved, required, pendingSuggestions }
}
```

- Розділ затверджено, коли `complete` (пороги `slots.sectionGaps`) **і** `approved`.
- `empty` — у розділі немає жодного заповненого слота; `draft` — решта.
- Відхилені поради на Readiness не впливають.

## 5. Suggestion v5

```js
{
  _id, syllabusId,
  origin: 'reviewer'|'check'|'orchestrator'|'interviewer', checkId?, criterionId?,
  section, severity,                     // critical|high|medium|warning|info
  kind: 'edit'|'choice'|'question',
  title, description, rationale,
  target: { section, path, entityId? },  // шлях у state, напр. 'summary.shortDescription', 'assessments', 'policy.late'
  draft: {                               // kind=edit
    value,                               // нове значення слота (рядок або об'єкт/масив сутностей)
    template?,                           // текст із плейсхолдерами {{v1}} для proposedValues
    proposedValues: [{ id, label, value, path?, confirmed }],
    basisHash,                           // hash значення слота, від якого будувалась чернетка
  },
  options: [{ id, label, value?, optionKey? }],  // kind=choice (варіант політики, «Keep my text», …)
  question?, answer?,                    // kind=question
  applicable, stale,
  status: 'pending'|'accepted'|'rejected', selectedOptionId,
  decisionReason, rejectTag, decisionHistory[], versions[], sources[], order, promptVersion
}
```

- **Атомарність.** Рішення — атомарний `findOneAndUpdate` з умовою на статус. Причина обов'язкова для critical/high.
- **`proposedValues`.** Факт (число, поріг, термін, дата, назва), якого не назвав викладач і немає в довіднику, стає `proposedValues` і потребує окремого підтвердження. Сервер сам сканує чернетку й доповнює список.
- **Застаріла чернетка.** `accept`, коли hash поточного значення ≠ `basisHash` → 409 `STALE_DRAFT`.

## 6. Ендпоінти

### Силабус (`/api/syllabus`)

| Метод | Шлях | Опис |
|---|---|---|
| POST | `/` | Трек 1. body `{ title, programId, programCode, courseCode? }`. Створює порожній стан і повертає `{ syllabus }` |
| POST | `/upload` | Трек 2. multipart `file` (docx/doc/pdf; pptx → 400 `UNSUPPORTED_FORMAT`) + `programId`, `programCode` (має бути в `Program.editions`, інакше 400 `INVALID_PROGRAM_CODE`) |
| GET | `/:id/status` | `{ status, stage, error }` |
| POST | `/:id/analyze` | Повторний парсинг або перебудова v4 → v5 (`needsRebuild`) |
| DELETE | `/:id` | Видалення силабусу |

### Чат і стан (`/api/chat/:syllabusId`)

| Метод | Шлях | Опис |
|---|---|---|
| GET | `/` | **View**: `{ syllabus: { id, title, status, track, programCode, canMutate, needsRebuild }, state, revision, sections: TemplateSection[], readiness, checks: Check[], suggestions: SuggestionView[], conversation, messages }` |
| POST | `/start` | Привітання: трек 1 — перше питання інтерв'юера; трек 2 — «Here's what I found…» + картка Approve all. Повертає View |
| GET | `/document?diff=0\|1` | Права панель: `{ sections: [{ key, docNumber, title, blocks: [{ kind, text, parts?: [{ type: 'eq'\|'del'\|'ins', text }] }] }] }`. `diff=1` порівнює з `baselineState` |
| POST | `/sections/:key/approve` | Затвердити розділ. 409 `SECTION_INCOMPLETE { gaps }`, якщо пороги не пройдені |
| DELETE | `/sections/:key/approve` | Зняти затвердження |
| POST | `/sections/approve-all` | Гуртове затвердження: лише розділи без відкритих Check/Suggestion і з пройденими порогами. Повертає `{ approved: [key], skipped: [{ key, reason }] }` + View |
| POST | `/policies/:key/choose` | body `{ optionKey }` або `{ writeOwn: true }`. `writeOwn` не відкриває поле, а переводить розмову на слот («Tell me how it should be») |
| POST | `/suggestions/:sid/accept` | Confirm. body `{ optionId?, expectedRevision }`. Непідтверджені `proposedValues` → 409 `UNCONFIRMED_VALUES` |
| POST | `/suggestions/:sid/values` | «Change the value»: body `{ values: [{ id, value, confirmed }] }`; перерендер шаблону без LLM |
| POST | `/suggestions/:sid/reject` | Cancel. body `{ reason?, rejectTag? }` |
| POST | `/suggestions/:sid/refine` | Reword. body `{ feedback }` |
| POST | `/suggestions/:sid/answer` | body `{ answer }` для `kind=question` |
| POST | `/suggestions/:sid/reopen` | Відкат через `SlotChange`; поточне значення ≠ `after` → 409 `REOPEN_CONFLICT` |
| POST | `/message` | body `{ text }` — хід оркестратора з інструментами. Повертає View |
| POST | `/skip` | body `{ slotKey }` — пропустити слот (лишається порожнім і видно ліворуч) |
| GET | `/outputs/syllabus.docx` | Завантажити `.docx` на будь-якому етапі; збільшує `downloads`. Кеш за `stateRevision` |

Кожна мутація повертає View.

### Довідники

| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/references/programs` | `[{ id, code, name, editions }]` |
| GET | `/api/references/:programCode/template` | `TemplateSection[]` |
| GET | `/api/references/:programCode/outcomes` | `ProgramOutcome[]` |
| GET | `/api/references/:programCode/courses` | `ProgramCourse[]` |
| GET | `/api/references/:programCode/capstone` | `CapstoneGuide` |
| GET | `/api/policies?type=syllabus-policy` | Довідник політик (сторінка Documents) |
| GET/PUT | `/api/users/profile/lecturer` | Профіль викладача до інтеграції Lecturers CRM |

**Прибрано:** `POST /chat/:id/submit`, `GET …/slides`, `GET …/document/preview` (v3), `GET …/outputs/{tracked.docx,clean.docx,*.pdf,edited.pptx}`, `POST /cabinet/syllabi/:id/resend-submission`.

## 7. Повідомлення чату

`Message.kind`:
- `text`
- `suggestion` (`relatedSuggestionId`)
- `question` — питання інтерв'юера: `{ slotKey, question, why }`
- `approve-all` — `{ sections: [key] }`
- `policy-choice` — `{ policyKey }`

`submission-cta` прибрано.

## 8. Інструменти оркестратора (`services/ai/tools`)

| Інструмент | Дія | Обмеження в коді |
|---|---|---|
| `get_slot(key)` | Читає поточне значення | Текст документа повертається як недовірені дані |
| `set_slot(key, value)` | Записує відповідь | Лише `free`-слоти типу A/C, скаляр, значення має бути в останній репліці викладача |
| `propose_draft(key, text, instruction?)` | Створює pending Suggestion | Для політик `instruction` обов'язкова й має цитувати викладача |
| `apply_edit(draftId)` | Застосовує чернетку | Лише підтверджена чернетка без непідтверджених `proposedValues` |
| `run_checks()` | Повертає Check[] і Readiness | — |

Для `locked`-слотів усі мутуючі інструменти повертають `{ error: 'LOCKED' }`.

## 9. Спільні модулі та інтерфейси (W2)

- **`services/ai/facts.js` — серверний сканер фактів.** `scanFacts(text, { known })`, `mergeProposedValues(modelValues, scanned)`, `toTemplate`, `renderTemplate`. Застосовується до **кожної** чернетки моделі; `known` = репліки викладача + тексти довідників + поточне значення слота.
- **`services/chat/draftSuggestions.js` — створення v5-карток.** `buildDraftSuggestion(input, { syllabusId, state, refs, known })` і `createDraftSuggestions(inputs, ctx)`; `hashValue(value)` дає `basisHash`. Порядок: severity (`SEVERITY_ORDER`) × 100 + `TemplateSection.order`.
- **`target.path` — конкретний шлях стану.** Приклади: `summary.shortDescription`, `outcomes[]` (увесь масив), `assessments[as1].criteria`, `policies{policy.late}`.
  - Для політик `draft.value` — текст. Accept записує в блок `text`, `source` (`fixture_edited`, якщо був обраний варіант, інакше `instructor_directed`) і `modified: true` (якщо змінено текст довідника).
  - Вибір варіанта — картка `choice` з `options[{ id, label, optionKey }]`.
- **Інтерфейси-заготовки** (кидають 501 `NOT_IMPLEMENTED`, доки їх не реалізовано):

| Модуль | Функції | Хто реалізує |
|---|---|---|
| `services/ai/prompts/formulator.js` | `draftFromNarrative`, `reword` | F |
| `services/ai/tools/runner.js` | `runOrchestratorTurn` | F |
| `services/ai/parse/index.js` | `parseToState` | G |
| `services/ai/prompts/reviewer.js` | `reviewState` | G |
| `services/ai/prompts/interviewer.js` | `nextQuestion` | W3 |

  Маршрути й сервіси чату (H) викликають лише ці сигнатури; у тестах H їх мокає через `jest.mock`.
