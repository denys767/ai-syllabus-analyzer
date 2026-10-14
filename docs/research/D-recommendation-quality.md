# D. How to produce specific, relevant, high-value AI recommendations for a syllabus

Scope: research only. Read `backend/services/ai/analyzer.js` (one "find all problems" prompt: template + 9 outcomes + whole syllabus → free-form recommendations in 6 loose categories, no evidence, no cap, no confidence). Constants/editGenerator were not re-read in depth.
Source reliability note: items marked (V) were confirmed in search results; items marked (K) are from my background knowledge and not re-verified here.

## 0. Diagnosis of the current design
The current prompt asks the model to "analyze and provide recommendations", so a mini model fills the space with plausible generic advice ("add more cases", "clarify assessment"). Causes: (1) no explicit criteria → model invents them; (2) no requirement to quote evidence → recommendations aren't tied to the text; (3) no "nothing wrong here" option → pressure to emit N items; (4) no materiality threshold or dedup; (5) diagnosis and rewrite fused; (6) no feedback loop from accept/reject data.

## 1. Domain rubrics worth encoding (checkable from text)

**Palmer, Bach & Streifer (2014), Learning-focused syllabus rubric** (V). Published in *To Improve the Academy* 33(1); UVA guide: https://teaching.virginia.edu/resources/syllabus-rubric (also https://wp-misc.lifesci.ucla.edu/ceils-test/wp-content/uploads/sites/2/2016/10/Syllabus-Rubric-Guide-11-24-141.pdf). ~16 components in criteria: learning goals/objectives, assessment activities, schedule, learning activities, classroom environment; each rated by strength of evidence (strong/moderate/low), weighted score; includes six annotated example syllabi (usable as few-shot / golden set). Key idea for us: rate *quality level per component*, not "missing/present".

**Quality Matters Higher Ed Rubric, 7th ed.** (V) https://qualitymatters.org/qa-resources/rubric-standards/higher-ed-rubric, summary https://teachingonline.iu.edu/quality-matters/qm-rubric.html. 8 general / 44 specific standards. Directly checkable: 2.1 course objectives measurable; 2.2 module objectives measurable and consistent with course-level; 2.4 relationship objectives↔activities↔assessments is made clear; 3.1 assessments measure stated objectives; 1.x grading policy/expectations stated. Essential (3-pt) standards = natural "critical" severity.

**Cullen & Harris (2009)** (K). "Assessing learner-centredness through course syllabi", *Assessment & Evaluation in HE* – scores syllabus on community, power/control, evaluation, learning outcomes; learner-centredness. Useful for tone/policy items (rationale for assignments, flexibility, rubrics visible), lower priority for MBA.

**AACSB Assurance of Learning (Std. 5)** (V) https://www.aacsb.edu/educators/accreditation/business-accreditation/ai-use-cases-for-accreditation/standard-5 : direct + indirect measures; competencies vs. learning goals; "not check-the-box". Checkable: each course learning goal maps to ≥1 *direct* assessment (exam, case write-up, project with rubric), not only "participation".

**Constructive alignment (Biggs & Tang)** (K). Intended learning outcome (verb + content + context) ↔ teaching/learning activity ↔ assessment task use the same cognitive verb level. Checks: outcome verb level vs. assessment verb level (outcome says "evaluate", exam is multiple-choice recall = misalignment).

**Bloom revised (Anderson & Krathwohl 2001)** (K). Outcome-verb checks: banned/vague verbs ("understand", "know", "be familiar with", "appreciate"); verb level distribution for an MBA course (expect apply–create dominance); each outcome single, observable, measurable.

**Workload/credit checks** (K). ECTS ≈ 25–30 h/credit (Ukraine: 30 h/ECTS) — compare contact hours + reading + assessment load from the schedule; flag only when numbers are in the text (e.g., 12 cases + 3 papers in 5 sessions).

**MBA good practice** (K). Case method (pre-reading, discussion questions, cold calls), application assignments (live company project), guest practitioners, team-work assessment with peer evaluation, Ukrainian/CEE context (war-time resilience, EU integration, local companies, regulatory env.), AI-use policy with *assessment-specific* rules.

### Criteria checkable from text only (candidate rubric ids)
| id | check | evidence type |
|---|---|---|
| T-xx | each KSE template section present / filled / non-placeholder | heading lines |
| LO-1 | each course outcome uses a measurable Bloom verb | outcome line |
| LO-2 | outcomes map to ≥1 MBA-27 outcome (state which, with line) | outcome line |
| LO-3 | each MBA-27 outcome claimed by the course is assessed somewhere | outcome + assessment line |
| AL-1 | each assessment names which outcomes it measures | assessment line |
| AL-2 | weights sum to 100%; grading scale stated; late/retake rule | numbers |
| AL-3 | verb level of outcome ≈ assessment type | both lines |
| SC-1 | every session has topic, readings, activity; coverage of outcomes | schedule rows |
| WL-1 | workload plausible vs. credits | numbers |
| CS-1 | cases: author/source/date, link to session & outcome, local-context share | case lines |
| PO-1 | AI-use policy specific per assessment; integrity; attendance | policy lines |

Each criterion should have 1–3 sentences of "what good looks like" and a *non-finding condition* ("do not report if…").

## 2. LLM techniques with evidence

1. **Rubric/checklist evaluation instead of open "find problems".** CheckEval (V; Lee et al., EMNLP 2025) https://arxiv.org/abs/2403.18771 — decomposes criteria into boolean questions; improves inter-evaluator agreement and lowers variance vs. Likert scoring. LLM-Rubric (V; Hashemi et al., ACL 2024) https://aclanthology.org/2024.acl-long.745 — multi-question rubric + calibration to human judges halves RMS error vs. uncalibrated. Transfer: one boolean/ordinal question per criterion, then *code* aggregates; calibrate thresholds on professor accept/reject data.
2. **Grounding via evidence quotes** (K, widely used practice): require `evidence` = line number(s) from our lineDoc (we already number lines → no free quoting; verify code-side that cited lines exist and the claim is consistent). Findings without valid line refs are dropped; "absent" findings cite the nearest heading/line or "document-level".
3. **Generate → verify (critic) filter.** Production code-review systems do this: ByteDance BitsAI-CR (V) https://arxiv.org/html/2501.15134v1 uses RuleChecker (recall) then ReviewFilter (precision), 75% precision; Atlassian RovoDev (V) https://arxiv.org/html/2601.01129v1 adds *factual-correctness* and *actionability* checks after generation. "Too Noisy To Learn" (V) https://arxiv.org/html/2502.02757v2: LLM validity filtering 66–85% precision. Direct analog: our professors rejecting noise = Atlassian's noise problem.
4. **Self-Refine** (V) https://arxiv.org/abs/2303.17651 — generate→critique→revise, ~20% avg gain across tasks; use for rewriting proposals, 1 iteration (later gains diminish – secondary source).
5. **LLM-as-judge caveats** (V) Zheng et al. https://arxiv.org/abs/2306.05685 — >80% agreement with humans but position/verbosity/self-enhancement bias; GPT-4 swap consistency only 65% on default prompt. Mitigate: swap order in pairwise evals, use boolean criteria, different model family or temperature for judge than generator, calibrate vs. human labels.
6. **Severity calibration** (K): define severity by *rubric consequence*, not LLM impression: critical = QM "Essential"-type / template-mandatory missing / accreditation-relevant; high = outcome-assessment misalignment; medium = clarity; low = polish. Hard-code mapping criterion→default severity; let LLM only downgrade/upgrade with a stated reason.
7. **Thresholds, caps, dedup** (K): emit only if `confidence ≥ 0.7` and `materiality` ("would a Programme Director care?"); cap ≈ 8–12 total, ≤3 per category; cluster by (criterionId, line range) in code, merge duplicates; an explicit `"no_issue"` verdict per criterion removes the pressure to produce items.
8. **Few-shot from experts** (K): 3–6 pairs of (syllabus excerpt, accepted recommendation) and (excerpt, *bad* recommendation + why rejected), taken from the Palmer annotated syllabi and from our own accepted/rejected history. Use as in-prompt exemplars or retrieval of nearest-k per criterion.
9. **Retrieval of exemplars**: store 5–10 exemplary KSE syllabus sections (good outcomes, assessment table, AI policy) and retrieve by criterion for rewrite step ("fallback clause" – see §3).
10. **Personalization with student data** (K): spec items (clusters, surveys) are currently unimplemented; inject cluster summary only into case/activity criteria, and require the finding to name which cluster/need it addresses; otherwise omit. Do not fabricate cluster data.
11. **Separate diagnosis from rewrite**: diagnosis (cheap, many criteria, structured) → verify → rewrite only for survivors. Better quality per call and lets the professor see *why* before *what*.
12. **Education-feedback quality frameworks.** Aalto study of LLM programming feedback (V, via summaries) uses expert ratings of *completeness, perceptivity (≥1 real issue), selectivity (no non-existent issues)* — good three metrics for us; selectivity is our main failure. Calgary study (V) of ChatGPT constructive alignment: tool maps outcomes→assessments but "lacks specificity and contextual awareness" — confirms need for grounding. QM conference session on a custom GPT checking modules against QM standards (V) https://ftp.qualitymatters.org/qa-resources/resource-center/conference-presentations/design-smarter-not-harder-leveraging-ai. No controlled GPT-vs-QM-reviewer study was found.

## 3. Existing products / patterns that transfer
- **Contract-review "playbooks"** (V): LegalOn https://legalontech.com/post/ai-ready-playbooks, Spellbook https://spellbook.com/learn/automate-contract-playbook. A playbook = per-clause *preferred position + ≥2 fallbacks + escalation rule*; AI flags deviation and proposes the approved language as redline. LegalOn recommends starting with ~8 high-impact clauses. Transfer 1:1: our "playbook" = list of ~25–35 criteria, each with `expectedPosition`, `acceptableVariants`, `standardClause` (approved KSE wording for AI policy, attendance, grading scale, academic integrity), and `escalation` (critical/blocking). This also fits the existing line-edit machinery: standard clause → `insert` edit, no hallucinated policy text. Caveat: vendor marketing, no head-to-head accuracy data.
- **QM course-review AI assistants / custom GPTs** (V, above): checklists keyed to rubric standards, human reviewer decides.
- **University guidance** (V) https://teaching-resources.delta.ncsu.edu/ai-course-design/ — LLM good for drafting outcomes/alignment maps, weak on context.
- **Code review bots** (V, above): comment ranking, actionability filter, acceptance-rate metrics (resolution rate) — the best-documented analogue of our feedback loop.
- Not found in search: a mature open-source "AI syllabus checker"; treat as a gap (K: most are prompt templates by teaching centers).

## 4. Evaluation loop
1. **Instrument now**: log per recommendation `criterionId, severity, confidence, decision, decisionReason, decidedVia` (already have decision/reason in Syllabus). Metric: *acceptance rate per criterion* and per category; reasons for rejection tagged (irrelevant / already in text / generic / wrong / not applicable). Target e.g. ≥60% overall; criteria <25% over ≥20 samples get disabled or rewritten. Atlassian-style "resolution rate" is the same idea (V).
2. **Golden set**: 15–30 real KSE syllabi (anonymised) annotated by an Academic Director / 1–2 experts: per criterion verdict + issue lines + acceptable rewrite. Seed with Palmer's 6 annotated syllabi (V) for generic criteria. Include "clean" syllabi to measure false positives.
3. **Metrics**: per-criterion precision/recall vs. annotations (primary: precision, i.e. selectivity), duplicate rate, evidence-validity rate (cited line exists and is relevant), actionability score (1–3, judge), count per syllabus.
4. **Pairwise comparison** of prompt versions A/B by LLM judge with order swap (V Zheng et al.) plus 10–20% human spot check; judge with boolean rubric questions ("does the recommendation cite a specific line? could the professor act without further info? is it generic?").
5. **Tooling**: promptfoo (K, not verified in this search) https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/ — YAML test cases over golden syllabi, deterministic asserts (JSON schema, lines exist, count ≤ cap) + `llm-rubric` asserts; run in CI on prompt change. Alternative: small Node script using the same `createResponse` client.
6. **Iterate**: weekly review of rejected-with-reason items → add to the criterion's "do not report if…" or as negative few-shot; version prompts (`promptVersion` stored on each recommendation) to compare acceptance across versions.

## 5. Recommended pipeline for KSE

**Stage 0 (code, no LLM)**: parse lineDoc; detect headings/sections against KSE template (regex/heading match), numbers (weights sum, hours), outcome list. Cheap deterministic findings (missing section, weights ≠ 100) need no LLM or only evidence confirmation.

**Stage 1 – Structure extraction (1 call, mini)**: input numbered text; output outcomes[], assessments[{name, weight, linkedOutcomes?, lines}], sessions[], policies[], cases[] — each with line refs. This gives the later steps a normalized model and fixes alignment-matrix reasoning (code can compute coverage of MBA-27 and outcome↔assessment gaps).

**Stage 2 – Per-criterion-group diagnosis (4 parallel calls, one per block: template / outcomes+alignment / assessment+workload / cases+policy)**: each receives numbered syllabus + stage-1 JSON + only that block's criteria cards (what good looks like, do-not-report conditions, default severity, 2 few-shot). Returns a verdict for *every* criterion (so no criterion is silently skipped and "ok" is allowed).

**Stage 3 – Verify/critic (1 call, or 1 per finding batch)**: receives findings + cited lines; for each, answers booleans: evidence supports claim? already addressed elsewhere in the document? generic (would apply to any syllabus)? material? actionable in ≤1 edit? Drop failures; code dedups by (criterionId, lines), caps at ~10, orders by severity×confidence.

**Stage 4 – Rewrite (existing editGenerator, per surviving finding)**: receives finding + criterion's standardClause/exemplar + target lines; returns line-edits (keep existing rules: line numbers, no model-quoted text). Optional one Self-Refine pass for text insertions.

### Finding schema sketch
```json
{
  "criterionId": "AL-3",
  "verdict": "issue | ok | not_applicable",
  "severity": "critical|high|medium|low",
  "confidence": 0.0,
  "materiality": "why a programme director would care (≤25 words)",
  "evidence": [{"line": 42, "note": "outcome uses 'evaluate'"}, {"line": 77, "note": "final exam: MCQ recall"}],
  "claim": "Outcome 3 requires evaluation but is assessed only by recall MCQ",
  "rationale": "Constructive alignment: assessment verb level < outcome verb level",
  "mba27Outcome": 4,
  "suggestedAction": "Replace final MCQ with case-based written analysis (30%)",
  "proposedEditHint": {"op": "replace", "lines": [77, 78]},
  "dedupKey": "AL-3:42-77"
}
```
Verdicts of `ok` are stored (not shown) – they power coverage stats and prove the check ran.

### Prompt-design guidelines
- Criteria cards in the prompt, not prose instructions; one criterion = one decision.
- "Report nothing unless you can cite line numbers; absence of a criterion's content is a finding only if no line satisfies it (list lines searched)." "An empty list is a valid, good answer."
- State the audience: a senior professor who rejects generic advice; forbid phrases like "consider adding more…" without a specific object (name the case type, the outcome, the line).
- Ask for reasoning/evidence *before* the verdict field (field order in JSON schema), use Structured Outputs/JSON schema (`strict`) rather than `json_object`.
- Put static material (template, outcomes, criteria) first and the syllabus last → prompt-cache friendly; keep temperature/effort low for verify (judge ≠ generator settings).
- Numeric severity from table in code; LLM may only propose a one-level change with justification.
- Cap per-category output (≤3) in prompt *and* in code.

### Cost / calls (gpt-5.4-mini-class, medium effort)
Typical syllabus 3–8k tokens. Stage 1: ~1 call (8k in, 1.5k out). Stage 2: 4 calls × (8k + 2k criteria in, ~1.5k out). Stage 3: 1 call (~4k in, 1.5k out). Total ≈ 6–7 calls, ~55–65k input / ~10k output tokens per syllabus — pennies at mini pricing (order of $0.05–0.15; check current price list) and ~30–60 s wall-clock with Stage 2 parallel. Rewrite stage stays per surviving finding (≤10). A 2× increase vs. today's single call is acceptable given that noise is the actual cost (professor attention). Keep a single-call fallback if stage failures occur.

### Rollout order (highest value first)
1. Rubric/criteria cards + `ok/issue` verdicts + evidence lines + cap/dedup (Stage 2 only).
2. Add verify pass (Stage 3).
3. Add logging of criterionId/acceptance and build a 15-syllabus golden set + promptfoo.
4. Add stage-1 structure model and code-side alignment matrix.
5. Playbook standard clauses for policies; exemplar retrieval; cluster/survey personalization when data exists.
