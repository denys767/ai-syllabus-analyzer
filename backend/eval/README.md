# Оцінка рекомендацій

З каталогу `backend`:

```sh
npm run eval -- --golden backend/eval/golden --docs backend/eval/docs --mock
npm run eval -- --golden /path/to/golden --docs /path/to/blocks --output /tmp/review-results.json
```

Шляхи можуть бути абсолютними, від поточного каталогу або від кореня репозиторію. Без параметрів використовуються `eval/golden`, `eval/docs`; JSON записується у `/tmp/kse-review-eval-<timestamp>.json`, або за `--output`. Без `--mock` потрібен API-ключ у середовищі або `backend/.env`; усі запити йдуть через спільний `client.createResponse`.

Формат golden-анотацій уже визначений у [golden/README.md](golden/README.md) та [golden/annotation.schema.json](golden/annotation.schema.json): `file`, `annotator`, 34 критерії; для issue потрібні severity і evidence. Harness перевіряє схему, унікальність і повноту критеріїв. Базова назва `file` визначає JSON документа: `sample.docx` → `sample.blocks.json`. Документ — `{ "blocks": [...], "meta": { "title": "…" } }` або масив блоків. Анотації без відповідного документа пропускаються з повідомленням і переліком `skipped` у результаті. Якщо жодного збігу немає, запуск завершується помилкою.

Для issue бажано вказати `evidenceBlockIds`. Без них підтримуються дослівні заголовки/короткі цитати, що містяться в блоках, або `evidence: ["document-level"]` для відсутнього розділу. Вільний переказ цитати потрібно вручну прив’язати до blockIds. Ілюстративний `example.annotation.json` не входить у smoke, бо відповідного документа немає.

Рахуються precision/recall по критеріях, кількість знахідок загалом і по документах, duplicate rate та evidence-validity rate. Одна анотація issue — одна очікувана знахідка. Зіставлення взаємно однозначне за критерієм і перетином evidenceBlockIds; для document-level допускається якір-заголовок. Повторний прогноз не збільшує recall. `ok` і `not_applicable` є негативними прикладами: знахідка для них — false positive. Нульовий знаменник дає `null`, а не штучний 100%.

Duplicate rate — частка повторів ключа `(criterionId, відсортована множина evidenceBlockIds)`. Evidence validity перевіряє **існування ID**, не семантичну релевантність; document дозволений лише для анотованої відсутності. Семантику перевіряють verifier і експерти. Після caps ці метрики оцінюють саме фінальний результат; сирі вердикти доступні через `runReview.rubricSummary`, але не рахуються як показані знахідки.

`synthetic.annotation.json` + `docs/synthetic.blocks.json` — крихітний технічний smoke зі сумою ваг 90%. `--mock` підміняє тільки `createResponse`: структура порожня, diagnose повертає ok, verifier пропускає checks. Це перевірка наскрізного запуску без ключа, не вимірювання якості моделі й не експертний golden set. JSON містить `mock: true`, promptVersion, фінальні findings і stats.
