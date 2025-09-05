# Документація: Дані для рекомендацій, генерація оновленого силабусу (DOCX) та інтеграція Google Forms

## 1. Джерела даних для AI-рекомендацій
AI модуль формує рекомендації на основі таких груп даних:

1. Завантажений силабус викладача (повний текст — поле `extractedText`).
2. Статичний шаблон MBA силабусу та інструктивні вимоги (в `aiService.syllabusTemplate`).
3. Навчальні цілі програми (MBA-27 Learning Objectives — `aiService.mbaLearningObjectives`).
4. Кластери студентів (модель `StudentCluster`, метод `getCurrentClusters()`; оновлюються періодично). Використовуються для формування адаптацій та релевантних прикладів.
5. Результати опитувань студентів (Google Forms → webhook → `Survey` + `SurveyResponse`). Звідти витягуються частотні теми: `commonChallenges`, `decisionTypes`, `learningPreferences`.
6. Схожі силабуси в системі (перевірка плагіату через просту косинусну схожість TF‑IDF embedding).
7. Динамічна дискусія AI-челенджера (масив `practicalChallenge.discussion`) — з відповідей генеруються додаткові короткі рекомендації.

### Як це впливає на рекомендації
- Структурні прогалини → рекомендації категорії `structure`.
- Відсутність або слабке покриття Learning Objectives → категорія `objectives`.
- Кластери студентів та кейси → категорії `cases` та `methods`.
- Відгуки з опитувань (болі, типи рішень) → уточнення практичних інтерактивних ідей.

## 2. Генерація оновленого файла силабусу (DOCX)
Ендпоінт: `GET /api/syllabus/:id/download-modified`

Логіка:
1. Перевіряється доступ (власник / менеджер / адміністратор).
2. Якщо файл вже згенерований і існує — повертається кешована версія.
3. Збираються всі прийняті рекомендації (`status === 'accepted'`).
4. Формується DOCX (якщо доступний пакет `docx`). Структура:
   - Заголовок
   - Оригінальний текст силабусу (кожен абзац окремо)
   - Розділ "Коментарі та впроваджені рекомендації"
   - Для кожної прийнятої: номер, назва, опис, за потреби коментар викладача.
5. Якщо пакет `docx` відсутній → fallback у TXT.
6. Один раз збережений файл (метадані у `syllabus.modifiedFile`), наступні запити віддають той самий файл.

Примітка: справжній режим Track Changes Word не підтримується бібліотекою `docx` — реалізовано секцію з маркерами.

## 3. AI Challenger (Практичність викладання)
- Початкове запитання генерується після аналізу (`startPracticalChallenge`).
- Викладач відповідає → AI дає зворотній зв'язок + 2–3 ідеї + запитання для поглиблення.
- Після кожної відповіді виконується спроба екстракції 1–2 коротких actionable рекомендацій (додаються у `recommendations` зі статусом `pending`).
- Після досягнення ліміту раундів (`maxRounds`) викликається `finalize` (стислі пропозиції у `practicalChallenge.aiSuggestions`).

## 4. Інтерактивні рекомендації за темою
Ендпоінт: `POST /api/ai/recommendations/interactive`
Параметри: `topic`, `difficulty`, `studentClusters[]` (витяг з аналізу силабусу). Повертає масив ідей з типом, описом, релевантністю та джерелами.

## 5. Інтеграція Google Forms
### 5.1. Структура
- Webhook: `POST /api/google-forms/survey-webhook`
- Інформаційний ендпоінт: `GET /api/google-forms/survey-info`
- Сек'юрність: заголовок `x-webhook-secret` (значення з `.env` → `GF_WEBHOOK_SECRET`).

### 5.2. Налаштування Google Form через Apps Script
1. Створіть форму з питаннями зі `survey-info` (ідентичний текст важливий для мапінгу).
2. В Apps Script додайте функцію `onFormSubmit(e)` (код видає ендпоінт `survey-info.instructions.script`).
3. Замініть `webhookUrl` та секрет якщо потрібно.
4. Увімкніть тригер (Triggers → Add Trigger → onFormSubmit → Event type: On form submit).
5. В `.env` додайте:
```
GF_WEBHOOK_SECRET=your_secret_here
BACKEND_URL=https://your-backend
```

### 5.3. Потік даних
Google Form → Apps Script → JSON POST → `survey-webhook` → створення/оновлення `Survey` → запис `SurveyResponse` → агреговані інсайти (`getSurveyInsights`) використовуються в аналізі силабусу.

### 5.4. Поля, що витягуються
- Питання про виклики, рішення, ситуацію, досвід, стиль навчання.
- Частотний аналіз (простий підрахунок слів) → топ-10 тем.

## 6. Модель Syllabus (ключові поля)
- `extractedText`: оригінальний текст.
- `recommendations[]`: масив структурованих рекомендацій (id, category, title, description, priority, status, instructorComment, aiResponse).
- `modifiedFile`: метадані згенерованої версії.
- `practicalChallenge`: initialQuestion, discussion[], aiSuggestions[], status.
- `analysis`: templateCompliance, learningObjectivesAlignment, studentClusterAnalysis, plagiarismCheck, surveyInsights.

## 7. Локалізація
Поточний UI переважно українською. Англомовні залишки замінені (AI Челенджер, інтерактивні модулі). Якщо потрібно подальше i18n → можна винести рядки у окремий JSON словник.

## 8. Відповідність instructions.txt (витяг 2.1–2.4)
- 2.1 Формування силабусу / перевірка відповідності шаблону: реалізовано (`analyzeSyllabus`).
- Зіставлення з Learning Objectives: так (`learningObjectivesAlignment`).
- Перевірка збігів з попередніми силабусами: так (`plagiarismCheck`).
- Аналіз кластерів студентів та адаптацій: так (`studentClusterAnalysis`).
- Інтерактивні рекомендації з опитувань: інсайти враховуються (surveyInsights → впливають на аналіз / challenger / інтерактивні ідеї).
- 2.2 База документів (політики) – потребує окремої перевірки (у цій версії не детально представлено, можна додати як статичні сторінки / колекцію). **TODO**.
- 2.3 Практичність викладання – AI Challenger + interactive recommendations: реалізовано.
- 2.4 Аналітичний звіт – зараз замінено спрощеною моделлю перегляду + каталог, включає: прийняті/відхилені, відповідність цілям (alignment), практичність (через challenger & suggestions), пропозиції (recommendations). Можна додати окремий зведений JSON ендпоінт. **Рекомендація:** створити `/api/reports/:id/manager-summary` для структурованого блоку даних.

## 9. Відомі обмеження / TODO
- Немає Word "track changes" – лише секція підсумку.
- Не реалізовано повноцінний менеджерський звіт як окремий DOCX / PDF.
- Відсутня централізована система i18n.
- Не додано CRUD для статичних документів (політики) – потрібно додати маршрут або статичний сервіс.
- Embedding / схожість примітивні (можна замінити на sentence-transformers або OpenAI embeddings).

## 10. Швидкий чек інтеграції
| Компонент | Статус |
|-----------|--------|
| Аналіз силабусу | OK |
| Learning Objectives alignment | OK |
| Плагіат (схожість) | OK (базово) |
| Кластери студентів | OK (динамічне читання) |
| Опитування Google Forms | OK (webhook + парсинг) |
| AI Challenger | OK |
| Інтерактивні ідеї | OK |
| DOCX генерація оновленого файла | OK (fallback TXT) |
| Локалізація основних UI фрагментів | OK |
| Менеджерський повний звіт 2.4 | Частково (потрібен окремий агрегатор) |
| Політики / база документів | Частково / TODO |

## 11. Приклад запиту до webhook (тест локально)
```
POST /api/google-forms/survey-webhook
Headers: {
  "Content-Type": "application/json",
  "x-webhook-secret": "<GF_WEBHOOK_SECRET>"
}
Body:
{
  "firstName": "Anna",
  "lastName": "K.",
  "Describe ONE of the biggest challenges you're facing at work right now that you believe could be solved through MBA knowledge. Be as specific as possible.": "Scaling product team",
  "What are 2–3 types of decisions you make most frequently in your work? What makes these decisions particularly challenging?": "Budget allocation; hiring; feature roadmap",
  "Think of a situation from the past month when you thought: 'I should have known something from management/economics/strategy to handle this better.' What was that situation?": "Pricing mismatch",
  "In which area or function do you have experience that you could share with colleagues? And conversely - what industry/function experience would be most interesting for you to learn from?": "Tech leadership / want finance modeling",
  "How do you typically learn most effectively - through case studies, discussions, hands-on practice, or something else? And what prevents you from applying new knowledge at work?": "Hands-on; time constraints"
}
```

---
За потреби можна розширити цей файл секцією про деплой та змінити структуру звітів.
