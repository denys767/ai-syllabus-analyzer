# Аудит v5 після хвилі W2

- **Дата:** 2026-10-28.
- **Гілка:** `refactor/plan-from-limewire-spec` @ 9df7203.
- **Метод:** незалежна перевірка лише читанням (два агенти-аудитори). Еталон — інваріанти з розділу 0 `CLAUDE.md` і `docs/api-v5.md`.
- **Вердикт:** блокерів немає, серйозних знахідок — 4. Виправлення — задача W3-FIX.
- **Статус:** M1–M4, m1–m13 виправлено в гілці `v5/w3-fix-audit` (m3 — лише документація); m14 — окрема задача.

## Серйозні (major)

| # | Інваріант | Проблема | Сценарій | Де виправляти | Статус |
|---|---|---|---|---|---|
| M1 | AI не пише політику з власної ініціативи | `propose_draft` для політики приймає як `instruction` будь-яку цитату ≥ 6 символів із **будь-якої** користувацької репліки. Серед них і серверні `Confirmed: …` / `Cancelled: …` / `Back to: …` (`flow.js:27`, `decisions.js:155/229/373`), які рахуються як репліки викладача (`handlers.js:86`) | Модель цитує «draft: policies» з «Confirmed: Draft: Policies» → політика стає `instructor_directed` і зараховується в Readiness | `ai/tools/handlers.js:199-204` — цитата лише з останньої репліки викладача або `currentSlotKey === key`. Серверні повідомлення позначати (`kind`/`meta`) і виключати з транскрипту (`handlers.js:86`, `flow.js:46`) | Fixed in v5/w3-fix-audit |
| M2 | Факти моделі лише через `proposedValues` | Корпус «відомого» засмічений: (a) `known.js:114` — `JSON.stringify(current)` додає id (`clo3`, `obj2`, blockIds), а `facts.js:30` витягує цифри без меж слова; (b) у транскрипт потрапляють серверні повідомлення із заголовками, які написала модель | Reword списку з 3 outcomes додає «within 2 weeks» — не підсвічується. Картка «Require 70% attendance» після Confirm легалізує «70%» назавжди | `chat/known.js:114` (`currentText`), `flow.js:46` (виключити серверні), `ai/facts.js:30` (межі слова) | Fixed in v5/w3-fix-audit |
| M3 | `apply_edit` лише після явного Confirm | Підтвердження в чаті не прив'язане до картки: досить «yes» в останній репліці | AI питає «Shall I look for readings?» → «yes» → модель застосовує неоглянуту картку ревізора | `ai/tools/handlers.js:279` — `draftId === conversation.currentSuggestionId` і картка показана до попередньої репліки AI (або лише кнопка Confirm) | Fixed in v5/w3-fix-audit |
| M4 | Зовнішні URL лише перевірені | URL у чернетках Reword / answer / Reviewer не перевіряються (захист є лише в `propose_draft`, `handlers.js:205-208`) | «add a link to the HBR case» → вигаданий `https://hbr.org/...` → Confirm → `.docx` | `chat/draftSuggestions.js` `buildDraftSuggestion`: вирізати URL, яких немає в репліках викладача і які не пройшли `caseSources.verifyUrl` (`caseSources.stripUrls`) | Fixed in v5/w3-fix-audit |

## Дрібні (minor)

| # | Проблема | Де виправляти | Статус |
|---|---|---|---|
| m1 | `set_slot` приймає число, якщо воно є в репліці окремим словом: «I run 6 sessions» → ECTS = 6 | `handlers.js:173` — число має стояти поруч із назвою слота, інакше уточнити | Fixed in v5/w3-fix-audit |
| m2 | «KSE MBA course» зашито в промпт пошуку кейсів і рідінгів | `review/caseSources.js:123,128` — назва програми з `refs` | Fixed in v5/w3-fix-audit |
| m3 | Картки LLM-перевірок блокують Approve all розділу (не score) | Відповідає контракту; лише задокументувати | Fixed in v5/w3-fix-audit (задокументовано в `docs/api-v5.md` §6) |
| m4 | Порожній довідник політик → розділ policies без прогалин | `slots.js:110` — без блоків розділ incomplete | Fixed in v5/w3-fix-audit |
| m5 | Видалення й створення карток в аналізі не атомарні з lease → можливі дублікати при перезапуску | `ai/orchestrator.js:66-96` — перевірка lease після створення / тег lease-токеном | Fixed in v5/w3-fix-audit |
| m6 | `ApproveAllCard` передає ключі, але hook і маршрут їх ігнорують | `useWorkspace.js:274`, `routes/chat.js`, `store.approveAll` (`keys`) | Fixed in v5/w3-fix-audit |
| m7 | Approve all без `expectedRevision` | `chat/sections.js:49-51` | Fixed in v5/w3-fix-audit |
| m8 | `/upload` вимагає `courseName`, а контракт про нього мовчить | `docs/api-v5.md:127` | Fixed in v5/w3-fix-audit |
| m9 | Українські `message` без `code` у `routes/syllabus.js` і `server.js:155,171` (правило §0 — англійською) | `routes/syllabus.js`, `server.js` | Fixed in v5/w3-fix-audit |
| m10 | Немає кодового захисту «двох питань поспіль» (лише промпт) | `chat/flow.js` `postNextStep`: не питати, якщо остання репліка AI — питання без відповіді | Fixed in v5/w3-fix-audit |
| m11 | Download до появи стану → 409 `NEEDS_REBUILD` з оманливим текстом; кнопка активна | `outputs.js:57-58` (`ANALYSIS_IN_PROGRESS`/`ANALYSIS_FAILED`), `ProfessorTutorWorkspace.js:93` (`canDownload={!!ws.state}`) | Fixed in v5/w3-fix-audit |
| m12 | `PUT /api/syllabus/:id` змінює `title`/`programId` без `state.header` і `programCode`, дозволений під час аналізу | `routes/syllabus.js:342-374` | Fixed in v5/w3-fix-audit |
| m13 | Текст документа в `extractSlots`/`policyMatch` без обгортки `<untrusted_document_text>` | `parse/extractSlots.js:59,225`, `parse/policyMatch.js:58,102` | Fixed in v5/w3-fix-audit |
| m14 | Мертвий код поза відомим списком W3 | `ai/chatReply.js`, `ai/suggestionBuilder.js`, `ai/review/{index,structure,checks}.js`, `ai/constants.js` + `diagnose`/`verify`/`rewrite`, писачі pptx/pdf у `services/document`, поля outputs/submit у `models/Syllabus.js` | Поза цією гілкою: видалення мертвого коду — окрема задача W3 |

## Підтверджено (OK)

- **Locked-слоти й E-поля** не змінюються ні інструментами, ні HTTP (`slotWrite.assertWritable`; `decisions.js:66,113,258,297`; `policies.js:120`).
- **Перевірки §2 — код.** LLM викликається лише в `checks/llm.js`, а Readiness рахується тільки з `runChecks`.
- **Readiness.** Порожній силабус = 0. Відхилені поради не впливають. Мутація знімає `approved`.
- **`courseKind`** визначається лише за кодом курсу (`computed.js:32-36`). Збіг за назвою дає тільки картку-підказку.
- **Записи стану** йдуть лише через `syllabusState/store` з умовою на ревізію; аналіз пише з умовою на lease.
- **Прибрані функції прибрано.** Submit, email АД, PDF-виходи, слайди, upload `.pptx` прибрано, мертвих `require` 0.
- **Мутації чату** йдуть через `gateMutate` (лише власник). Є один клієнт OpenAI, схеми й tools strict.
- **Секретів у репозиторії немає.**
- **Наявні фічі.** Approve all і його правила, перевірка дедлайнів у межах терму, CLO без компонента, статуси лівої панелі, Download не залежить від Readiness.
