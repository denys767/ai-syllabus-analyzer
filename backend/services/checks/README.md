# services/checks — перевірки силабуса (ТЗ §2)

`runChecks(state, refs) → Check[]` — чисті синхронні функції без БД і LLM. Форма — `docs/api-v5.md` §3:
`{ id, severity, section, path, message, details, passed }`. Повертаються лише непройдені перевірки плюс `info`;
порядок — severity (critical → info), далі `TemplateSection.order` з `refs.template`.

`runLlmChecks(state, refs, { createResponse?, model? }) → Promise<Check[]>` (`llm.js`) — м'які судження моделі,
та сама форма + `source: 'llm'`, лише `warning`/`info`, у Readiness не йдуть. Strict `json_schema` через
`services/ai/client.js`, кеш у пам'яті за hash входу. Збій моделі → `info` `llm.unavailable:<part>`.

**Суворість.** `critical` — лише де Положення чи шаблон вимагають беззастережно («must include»).
«should normally», «typically», «approximately» — `warning`/`info`, і `message` — питання до викладача.

`id` = `rule` або `rule:entityId`; базове правило — `details.rule`, сутність — `details.entityId`.

| rule | severity | section | Умова |
|---|---|---|---|
| `glance.assessment_total` | high | at_a_glance | `header.declared.assessmentTotal` ≠ Σ ваг |
| `glance.contact_hours` | high | at_a_glance | `declared.contactHours` ≠ Σ годин занять |
| `glance.self_study_hours` | high | at_a_glance | `declared.selfStudyHours` ≠ Σ Individual work |
| `glance.delivery_mode` | warning | at_a_glance | `declared.deliveryMode` не відповідає форматам занять |
| `glance.term` | warning | at_a_glance | дати розкладу поза заявленим термом (лише якщо терм розбирається на дві дати) |
| `glance.instructor` | warning | at_a_glance | ім'я в таблиці не збігається з профілем |
| `assessment.weights_total` | critical | assessment | Σ ваг ≠ 100 |
| `assessment.weight_consistency:<id>` | high | assessment | «<назва> … N%» / «N% … <назва>» у політиках, розкладі, criteria з іншою вагою |
| `assessment.row_complete:<id>` | high | assessment | бракує Weight / Performance Criteria / Deadline |
| `assessment.component_count` | critical / info | assessment | ≤ 30 год → ≥ 2 компоненти, інакше ≥ 3; немає годин → info |
| `assessment.participation_share` | warning / info | assessment | Σ participation > 30; обґрунтування в criteria → info |
| `assessment.deadline_in_term:<id>` | warning | assessment | дедлайн до початку терму або > 30 днів після кінця |
| `workload.self_study_ratio` | warning | schedule | self-study < 50 % або > 150 % від 2 × contact |
| `regulations.alternative_tasks` | critical | assessment | 2.5.6(1): немає `compensation` групи `comp` і жодна політика не згадує alternative task |
| `regulations.passing_score` | critical | (де знайдено) | 2.5.4(2): прохідний бал ≠ 60 |
| `regulations.ai_prohibitions` | info | policies | режим ШІ дозволяє ШІ і є компоненти → потрібна звірка в `llm.js` |
| `regulations.retake` | high | assessment | 2.5.6(4): згадано resit/retake (не «retake the course»), але немає ні `compensation` групи `retake`, ні згадки в політиках |
| `regulations.attendance` | high | policies | 2.4.3: `policy.attendance` не вирішено і тексту немає |
| `regulations.bonus_penalty` | medium | (де знайдено) | 2.5.4(1): bonus/penalty згадано без розміру й без описаного механізму («reduction of the … score», «receives zero», «added to the grade»); політики доброчесності й ШІ не рахуються |
| `regulations.control_mandatory:<id>` | medium | assessment | 2.4.3: «optional» біля компонента з `isControl` |
| `regulations.ai_rules` | warning | policies | `policy.ai_mode` не вирішено і `ai_place` ≠ `ai_place_assignments` |
| `regulations.language` | info | at_a_glance | 2.4.5(1): мова uk/en (passed) або не визначена/інша |
| `outcomes.clo_unassessed:<cloId>` | warning | learning_outcomes | CLO без жодного компонента |
| `plo.coverage` | high / info | learning_outcomes | core: Σ покриття (full 1, partial 0.5, max по PLO) < 1 → high; elective → info «N covered» |
| `plo.unknown_code:<code>` | warning | learning_outcomes | код не з `refs.outcomes` після нормалізації (NFC, латинські P/H → Р/Н) |
| `llm.ai_prohibition:<id>` | warning | policies | модель: компонент потрапляє в категорію розд. 3 Політики ШІ |
| `llm.component_schedule:<id>` | warning | schedule | компонент без відповідника в розкладі (спершу збіг назв, модель — для решти) |

Підсумки годин і ваг беруться з `header.computed` (E-поля), а якщо їх ще немає — рахуються з сутностей.
