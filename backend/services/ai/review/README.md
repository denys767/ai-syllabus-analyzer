# `services/ai/review`

Пайплайн рубрики v4 (`runReview`, `generateSuggestion`, `diagnose`, `verify`, рубрика) видалено у v5 (W3-J): перевірки з ТЗ §2 — код у `services/checks`, чернетки формулює `services/ai/prompts`. Лишилося два спільні модулі.

- `common.js` — `requestJSON(name, schema, system, document, { effort, stats, validate })`: виклик `createResponse` зі strict `json_schema`, до двох повторів для тимчасових збоїв (мережа, 408/429/5xx) і невалідних відповідей (точні помилки схеми додаються до user-повідомлення), одна семантична корекція через `validate`. Використовують `parse/`, `prompts/*` і `caseSources.js`.
- `caseSources.js` — веб-пошук реальних кейсів/рідінгів (`CASE_WEB_SEARCH=1`, за замовчуванням вимкнено) і перевірка URL. Єдиний споживач — `prompts/readings.js` (інструмент `suggest_readings`).

## `caseSources.js`

1. `findCaseSources({ finding, meta, feedback })` робить виклик `createResponse` з `tools: [{ type: 'web_search_preview' }]` (вільний текст + `url_citation`);
2. окремим викликом `requestJSON('case_sources', …)` зводить знайдене до ≤ 3 кейсів `{ title, publisher, year, url, relevance }`;
3. кожен URL перевіряється сервером (`verifyUrl`): http(s) без облікових даних, доменне ім'я з літерним TLD, порт 80/443, DNS лише в публічні адреси; `HEAD`, при відмові/обриві — `GET`, `redirect: 'manual'`, таймаут 5 с; підтверджено = 2xx/3xx. Для неперевірених `url: null`, `verified: false`.

У тестах `fetch` і `dns.promises.lookup` замінені mock-ами (`test/review/caseSources.test.js`).
