// Rubric criteria cards for the recommendation pipeline (plain data, no logic).
// Each card is ONE yes/no question that a model answers from the syllabus text alone.
// Default severity is fixed here; the model may move it by one level with a stated reason.
// Status: draft — wording of cards must be reviewed by the Academic Director.

const LO = (n) => `Learning outcome ${n}`;

const criteria = [
  // ───────────── template: KSE template sections present and substantive ─────────────
  {
    id: 'T-1', group: 'template', title: 'Summary: course title, code and instructor',
    check: 'Does section 1 (Summary) state the course title, the course code and at least one instructor name?',
    whatGoodLooksLike: 'Title, code and instructor name(s) appear at the top of the syllabus, ideally with a contact email.',
    doNotReportIf: ['the information is in a header, title page or table instead of a heading "Summary"', 'the code is absent but the title and instructor are present and the program does not use codes (report only the missing part)'],
    defaultSeverity: 'critical', evidence: 'Title page / first lines / Summary heading', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'Line 3 gives the title but no course code and no instructor name: ask the instructor for the code and the instructor list, then insert them under "1. Summary".',
      bad: 'Improve the course summary section.',
    },
  },
  {
    id: 'T-2', group: 'template', title: 'Summary: prerequisites',
    check: 'Does the syllabus state prerequisites (or explicitly say there are none)?',
    whatGoodLooksLike: 'A "Prerequisites" line naming required courses or knowledge, or "None".',
    doNotReportIf: ['the text says "no prerequisites" or "open to all MBA students"', 'prerequisites are listed under another heading such as "Requirements" or "Who is this course for"'],
    defaultSeverity: 'medium', evidence: 'Summary section', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'No prerequisites are stated. Ask whether any prior course or skill is required and insert a "Prerequisites" line after the course code.',
      bad: 'Consider clarifying the course requirements.',
    },
  },
  {
    id: 'T-3', group: 'template', title: 'Summary: course objectives',
    check: 'Does the syllabus contain course objectives (what the course aims to do) separate from learning outcomes?',
    whatGoodLooksLike: 'A short paragraph or list of 2–5 course objectives stating the purpose and scope of the course.',
    doNotReportIf: ['a "Course description" or "Aims" paragraph plays the same role', 'objectives and outcomes are merged in one list that is clearly outcome-formulated'],
    defaultSeverity: 'critical', evidence: 'Summary section / course description', fix: 'insertAfter',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'There is no objectives list. Insert 3 objectives after the course description, derived from the topics in the schedule (lines 20–45), phrased as course aims.',
      bad: 'The course objectives could be more detailed.',
    },
  },
  {
    id: 'T-4', group: 'template', title: 'Summary: learning outcomes present',
    check: 'Does the syllabus list learning outcomes (what students will be able to do after the course)?',
    whatGoodLooksLike: 'A numbered list of 3–7 learning outcomes, usually under "Learning Outcomes" or "By the end of the course students will…".',
    doNotReportIf: ['outcomes are given under a different heading ("Competencies", "Students will be able to")', 'outcomes are embedded in a table together with assessments'],
    defaultSeverity: 'critical', evidence: 'Learning outcomes list or its absence', fix: 'insertAfter',
    standardClauseId: null, mba27: null, source: 'KSE template; QM 2.1',
    examples: {
      good: 'No outcomes list exists. Insert a "Learning Outcomes" list of 4–5 items after the objectives, built from the schedule topics and assessments, for the instructor to confirm.',
      bad: 'Add learning outcomes.',
    },
  },
  {
    id: 'T-5', group: 'template', title: 'Course Structure & Schedule table',
    check: 'Is there a session-by-session schedule that gives a date (or week/session number) and a topic for every session?',
    whatGoodLooksLike: 'A table or list covering all sessions with date/week and topic; readings or activities per session are a plus.',
    doNotReportIf: ['the schedule is a list rather than a table but has dates and topics', 'dates are given as "Week N" or "Session N" because the calendar is not fixed yet'],
    defaultSeverity: 'critical', evidence: 'Schedule section; rows with missing date or topic', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'Sessions 6–8 in the schedule table (lines 52–54) have topics but no dates. Ask for the dates and fill the "Date" column.',
      bad: 'The schedule could be more detailed.',
    },
  },
  {
    id: 'T-6', group: 'template', title: 'Grading & Assessment section present',
    check: 'Does the syllabus have a grading section listing assessment components, each with a weight?',
    whatGoodLooksLike: 'A list or table of components (e.g. case write-up, exam, participation) each with a percentage or point weight.',
    doNotReportIf: ['the section exists under a different heading such as "Evaluation" or "How you will be assessed"', 'weights are given per component in a table'],
    defaultSeverity: 'critical', evidence: 'Grading section or its absence', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'Assessments are named in lines 61–63 but have no weights. Ask the instructor for the weights of the group project, the exam and participation.',
      bad: 'Make the grading section clearer.',
    },
  },
  {
    id: 'T-7', group: 'template', title: 'Course Materials: required and recommended',
    check: 'Does the syllabus list required readings or materials, and distinguish them from recommended ones (or state that there are none of one kind)?',
    whatGoodLooksLike: 'Two labelled lists, or one list where each item is marked required/recommended, with enough detail to find each item (author, title, year or link).',
    doNotReportIf: ['materials are listed per session in the schedule and flagged as required/optional', 'the syllabus states that no textbook is used and materials are distributed in class'],
    defaultSeverity: 'critical', evidence: 'Course Materials section or per-session reading entries', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'Readings are listed only as "see Moodle". Ask for 2–3 required items with author and year and insert them under "Required Readings".',
      bad: 'Add more reading materials.',
    },
  },
  {
    id: 'T-8', group: 'template', title: 'Course Policies section present',
    check: 'Does the syllabus have a Course Policies section (or equivalent) covering attendance, academic integrity and use of AI?',
    whatGoodLooksLike: 'One section with three labelled sub-parts: Attendance, Academic Integrity, Use of AI.',
    doNotReportIf: ['each policy exists under its own heading elsewhere in the document', 'the missing item is already reported by PO-1, PO-3 or PO-4 (report the section only if all three are absent)'],
    defaultSeverity: 'critical', evidence: 'Policies section or its absence', fix: 'insertAfter',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'No policies section. Insert "5. Course Policies" at the end with the approved Attendance, Academic Integrity and Use of AI clauses.',
      bad: 'Add course policies.',
    },
  },
  {
    id: 'T-9', group: 'template', title: 'No placeholders or leftover template text',
    check: 'Is the syllabus free of unfilled placeholders (e.g. "[insert]", "TBD", "XXX", "Lorem ipsum", or copied template instructions)?',
    whatGoodLooksLike: 'All fields contain real content. "TBD" is acceptable only for items that cannot be known yet, such as a guest speaker.',
    doNotReportIf: ['"TBD" refers to a future guest or date that the instructor cannot fix yet', 'brackets are part of normal text (citations, links)'],
    defaultSeverity: 'high', evidence: 'Quote the line with the placeholder', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template',
    examples: {
      good: 'Line 14 still reads "[Instructor name]". Ask for the name and replace the line.',
      bad: 'Some parts of the syllabus look incomplete.',
    },
  },

  // ───────────── outcomes: measurable verbs, MBA-27 mapping, each claimed outcome assessed ─────────────
  {
    id: 'LO-1', group: 'outcomes', title: 'Outcomes use measurable verbs',
    check: 'Does every learning outcome start with an observable, measurable action verb (not "understand", "know", "be familiar with", "appreciate", "learn")?',
    whatGoodLooksLike: 'Outcomes use Bloom verbs such as analyze, evaluate, design, negotiate, justify, build.',
    doNotReportIf: ['the vague verb is followed by a measurable verb in the same outcome ("understand and apply")', 'the vague verb appears in course objectives or description, not in learning outcomes'],
    defaultSeverity: 'high', evidence: 'Each outcome line using a vague verb', fix: 'replaceBlock',
    standardClauseId: null, mba27: null, source: 'QM 2.1; Bloom (Anderson & Krathwohl 2001)',
    examples: {
      good: 'Outcome 2 (line 18) "Understand pricing strategies" is not measurable. Replace with "Evaluate pricing strategies for a given market and justify the choice with unit-economics data".',
      bad: 'Use stronger verbs in learning outcomes.',
    },
  },
  {
    id: 'LO-2', group: 'outcomes', title: 'One observable result per outcome',
    check: 'Is every outcome a single result that a student could demonstrate in one assessment (not a topic list or several unrelated results in one sentence)?',
    whatGoodLooksLike: 'Each outcome is verb + content + context ("Design a go-to-market plan for a Ukrainian SME").',
    doNotReportIf: ['two verbs describe one connected task ("analyze and present")', 'the outcome is long but has one verb and one result'],
    defaultSeverity: 'medium', evidence: 'Outcome line that bundles several results or only names a topic', fix: 'replaceBlock',
    standardClauseId: null, mba27: null, source: 'QM 2.1; Biggs',
    examples: {
      good: 'Outcome 1 (line 17) bundles finance, marketing and HR. Split it into three outcomes, each with one verb and one result.',
      bad: 'Make the outcomes more specific.',
    },
  },
  {
    id: 'LO-3', group: 'outcomes', title: 'Outcomes mapped to MBA-27',
    check: 'Does the syllabus say which MBA-27 learning outcome(s) each course outcome contributes to, or can at least one MBA-27 outcome be named with clear textual support?',
    whatGoodLooksLike: 'A mapping line or table (course outcome → MBA-27 outcome number), or course outcomes that clearly restate MBA-27 wording.',
    doNotReportIf: ['a mapping table exists anywhere in the document', 'the syllabus is for a course outside the MBA-27 program (not applicable)'],
    defaultSeverity: 'high', evidence: 'Outcomes list; mapping table or its absence', fix: 'insertAfter',
    standardClauseId: null, mba27: [LO(1), LO(2), LO(3), LO(4), LO(5), LO(6), LO(7), LO(8), LO(9)], source: 'KSE MBA-27',
    examples: {
      good: 'No mapping to MBA-27. Insert a table after the outcomes: course outcome 1 → Learning outcome 3 (analytical and AI-driven tools), 2 → Learning outcome 7 (negotiation).',
      bad: 'Align the course better with MBA-27 outcomes.',
    },
  },
  {
    id: 'LO-4', group: 'outcomes', title: 'Each claimed MBA-27 outcome is assessed',
    check: 'For every MBA-27 outcome that the syllabus claims (explicitly or through the mapping), does at least one graded assessment demonstrably measure it?',
    whatGoodLooksLike: 'Every claimed MBA-27 outcome can be traced to a graded component that requires the student to show that skill.',
    doNotReportIf: ['the outcome is only mentioned as background context and not claimed', 'a graded component that clearly requires the skill exists even if not named as linked'],
    defaultSeverity: 'high', evidence: 'Claim line + list of assessment lines checked', fix: 'replaceBlock',
    standardClauseId: null, mba27: [LO(1), LO(2), LO(3), LO(4), LO(5), LO(6), LO(7), LO(8), LO(9)], source: 'AACSB Std 5; QM 3.1',
    examples: {
      good: 'Learning outcome 7 (negotiation) is claimed on line 22, but no graded item involves negotiation. Add a graded negotiation simulation (15%) or drop the claim.',
      bad: 'Make sure all outcomes are assessed.',
    },
  },
  {
    id: 'LO-5', group: 'outcomes', title: 'MBA-27 mapping is plausible',
    check: 'Is each stated MBA-27 mapping supported by the content of the outcome (not a stretch such as mapping a finance-formula outcome to "ethical leadership")?',
    whatGoodLooksLike: 'The wording of the course outcome overlaps with the wording of the mapped MBA-27 outcome.',
    doNotReportIf: ['no mapping is stated (LO-3 covers it)', 'the connection is indirect but explained in the text'],
    defaultSeverity: 'medium', evidence: 'Mapping line + the outcome it maps', fix: 'replaceBlock',
    standardClauseId: null, mba27: [LO(1), LO(2), LO(3), LO(4), LO(5), LO(6), LO(7), LO(8), LO(9)], source: 'KSE MBA-27',
    examples: {
      good: 'Course outcome 3 (cash-flow modelling) is mapped to Learning outcome 6 (ethical leadership). Re-map it to Learning outcome 3 (analytical tools).',
      bad: 'Check the outcome mapping.',
    },
  },
  {
    id: 'LO-6', group: 'outcomes', title: 'Outcome count and distinct from objectives',
    check: 'Does the syllabus have between 3 and 8 learning outcomes, and are they phrased as student results rather than copies of the instructor-focused course objectives?',
    whatGoodLooksLike: '3–7 outcomes phrased "Students will be able to…"; objectives describe the course, outcomes describe the student.',
    doNotReportIf: ['the course is short (fewer than 4 sessions) and has 2 clear outcomes', 'objectives and outcomes overlap but the outcomes are student-focused'],
    defaultSeverity: 'low', evidence: 'Outcomes list; objectives list', fix: 'replaceBlock',
    standardClauseId: null, mba27: null, source: 'QM 2.1; Biggs',
    examples: {
      good: 'There are 14 outcomes (lines 15–28). Merge them into 5–6 outcomes grouped by assessed skill.',
      bad: 'Reduce the number of outcomes.',
    },
  },
  {
    id: 'LO-7', group: 'outcomes', title: 'Outcomes are taught in the schedule',
    check: 'Does each learning outcome have at least one session or activity in the schedule that plausibly teaches it?',
    whatGoodLooksLike: 'Schedule topics and activities cover every outcome; no outcome appears only in the outcomes list.',
    doNotReportIf: ['the schedule is missing entirely (T-5 covers it)', 'a session topic is phrased differently but clearly covers the outcome'],
    defaultSeverity: 'high', evidence: 'Outcome line + schedule rows checked', fix: 'question',
    standardClauseId: null, mba27: null, source: 'Biggs & Tang (constructive alignment); QM 2.4',
    examples: {
      good: 'Outcome 4 (build a financial model) has no session on modelling. Ask whether a modelling session exists, or add one to the schedule.',
      bad: 'Align the schedule with the outcomes.',
    },
  },

  // ───────────── assessment: weights, linkage, alignment, scale, workload ─────────────
  {
    id: 'AS-1', group: 'assessment', title: 'Weights sum to 100',
    check: 'Do the stated assessment weights add up to exactly 100%?',
    whatGoodLooksLike: 'Component weights sum to 100 and are easy to add up (a table with a total row).',
    doNotReportIf: ['the sum is 100 after summing sub-components', 'weights are in points and the total points are stated (e.g. 100 points)', 'no weights are given at all (T-6 covers it)'],
    defaultSeverity: 'critical', evidence: 'Every line containing a weight and the computed sum', fix: 'question',
    standardClauseId: null, mba27: null, source: 'KSE template; QM 3.x',
    examples: {
      good: 'Weights on lines 61–64 sum to 90% (30+30+20+10). Ask which component should carry the missing 10%.',
      bad: 'Check that the grading weights are correct.',
    },
  },
  {
    id: 'AS-2', group: 'assessment', title: 'Each assessment linked to outcomes',
    check: 'Does each graded assessment state, or clearly imply, which learning outcome(s) it measures?',
    whatGoodLooksLike: 'An outcome column, or a sentence per assessment naming the outcomes it measures.',
    doNotReportIf: ['an alignment matrix exists elsewhere in the document', 'the course has a single assessment that obviously covers all outcomes'],
    defaultSeverity: 'high', evidence: 'Assessment lines without outcome reference', fix: 'insertAfter',
    standardClauseId: null, mba27: null, source: 'QM 2.4, 3.1; AACSB Std 5',
    examples: {
      good: 'The group project (line 62) names no outcomes. Add "Measures outcomes 2 and 4" after its description, to be confirmed by the instructor.',
      bad: 'Link assessments to outcomes.',
    },
  },
  {
    id: 'AS-3', group: 'assessment', title: 'Assessment level matches outcome verb level',
    check: 'Is each outcome assessed by a task at the same or higher cognitive level as its verb (e.g. an "evaluate" outcome is not assessed only by recall multiple-choice)?',
    whatGoodLooksLike: 'Apply/analyze/evaluate/create outcomes are assessed by cases, projects, defences or open-ended analysis, not only by recall tests.',
    doNotReportIf: ['the assessment type is not described well enough to judge its level', 'recall questions are only one part of a mixed exam that also has analysis tasks'],
    defaultSeverity: 'high', evidence: 'Outcome line + assessment line, both cited', fix: 'replaceBlock',
    standardClauseId: null, mba27: null, source: 'Biggs & Tang; Bloom',
    examples: {
      good: 'Outcome 3 (evaluate) is measured only by a 40-question multiple-choice test (line 63). Replace 20% of the test with a written case evaluation.',
      bad: 'Make the assessments more challenging.',
    },
  },
  {
    id: 'AS-4', group: 'assessment', title: 'Direct measure for each outcome',
    check: 'Is every learning outcome measured by at least one direct, graded product (exam, case write-up, project, presentation with criteria), and not only by participation or attendance?',
    whatGoodLooksLike: 'Each outcome has a graded artifact; participation may support but not be the only measure.',
    doNotReportIf: ['participation is graded against stated observable criteria', 'the course has one outcome measured by the final project'],
    defaultSeverity: 'high', evidence: 'Outcome line + assessments checked', fix: 'question',
    standardClauseId: null, mba27: null, source: 'AACSB Std 5 (direct measures)',
    examples: {
      good: 'Outcome 5 (present a market-entry plan) is covered only by "participation 20%". Ask whether a graded presentation exists and add it with a weight.',
      bad: 'Add direct assessment methods.',
    },
  },
  {
    id: 'AS-5', group: 'assessment', title: 'Grading scale stated',
    check: 'Does the syllabus state how the total score converts to a final grade (scale, thresholds or pass mark)?',
    whatGoodLooksLike: 'A scale such as 90–100 = A, … with a minimum pass mark.',
    doNotReportIf: ['the syllabus refers to a named official KSE scale with a link', 'the scale is in a separate "Grading" subsection'],
    defaultSeverity: 'medium', evidence: 'Grading section', fix: 'clause',
    standardClauseId: 'grading-scale', mba27: null, source: 'QM 1.x, 3.x; KSE template',
    examples: {
      good: 'No grade scale. Insert the approved KSE grading-scale clause at the end of the grading section.',
      bad: 'Explain how grades are assigned.',
    },
  },
  {
    id: 'AS-6', group: 'assessment', title: 'Late submission and retake rule',
    check: 'Does the syllabus state what happens to late submissions and missed assessments (penalty, deadline extension, or retake rule)?',
    whatGoodLooksLike: 'A rule such as "-10% per day late, no submissions after 5 days; missed exam can be retaken once with approval".',
    doNotReportIf: ['the rule is stated within the policies section', 'the syllabus refers to a named KSE regulation'],
    defaultSeverity: 'medium', evidence: 'Grading or policies section', fix: 'clause',
    standardClauseId: 'late-submission', mba27: null, source: 'QM 1.x',
    examples: {
      good: 'No late rule. Insert the approved late-submission clause after the assessment list.',
      bad: 'Specify the deadline policy.',
    },
  },
  {
    id: 'AS-7', group: 'assessment', title: 'Workload plausible for ECTS credits',
    check: 'Where the syllabus gives credits, contact hours and numbers of assignments or readings, does the total student workload fit about 30 hours per ECTS credit?',
    whatGoodLooksLike: 'Contact hours + self-study + assessment load is close to credits × 30 hours.',
    doNotReportIf: ['credits or hours are not stated, so no numbers can be compared', 'the gap is under 25% of the expected workload'],
    defaultSeverity: 'medium', evidence: 'Lines with credits, hours, number of cases/readings/assignments', fix: 'question',
    standardClauseId: null, mba27: null, source: 'ECTS Users’ Guide; Ukrainian ECTS practice (30 h/credit)',
    examples: {
      good: 'The course is 3 ECTS (about 90 h) but has 5 sessions, 12 cases and 3 papers (lines 30–60). Ask whether to reduce cases or increase credits.',
      bad: 'The workload seems heavy.',
    },
  },
  {
    id: 'AS-8', group: 'assessment', title: 'Criteria for major assessments',
    check: 'For each assessment worth 20% or more, does the syllabus give its format and at least one evaluation criterion or rubric reference?',
    whatGoodLooksLike: 'Format (length, individual/group), due date or session, and 3–4 criteria or a link to a rubric.',
    doNotReportIf: ['a rubric is linked or attached', 'the component is a standard exam with a stated format'],
    defaultSeverity: 'medium', evidence: 'Assessment descriptions with weight ≥ 20%', fix: 'question',
    standardClauseId: null, mba27: null, source: 'QM 3.3; Palmer et al. 2014',
    examples: {
      good: 'The final project (35%, line 63) has no format or criteria. Ask for length, group size and 3 criteria and insert them.',
      bad: 'Describe assessments in more detail.',
    },
  },

  // ───────────── practice: cases, local context, interactive methods ─────────────
  {
    id: 'PR-1', group: 'practice', title: 'Cases are identifiable',
    check: 'Is every case named in the syllabus identifiable by title and source (author/publisher or company) and year?',
    whatGoodLooksLike: 'Each case has a title, company or publisher, and year, e.g. "Nova Poshta: scaling logistics, HBS 2022".',
    doNotReportIf: ['the syllabus names no cases (PR-2 covers it)', 'the case is an in-class exercise written by the instructor and described briefly'],
    defaultSeverity: 'medium', evidence: 'Case lines missing source or year', fix: 'question',
    standardClauseId: null, mba27: null, source: 'MBA case-method practice; instructions.txt 2.3',
    examples: {
      good: 'The case on line 40 is named "a retail case". Ask for the title, publisher and year.',
      bad: 'Provide more details about the cases.',
    },
  },
  {
    id: 'PR-2', group: 'practice', title: 'Cases tied to sessions and outcomes',
    check: 'Is each case or practical task linked to a specific session and to a learning outcome it develops?',
    whatGoodLooksLike: 'The schedule shows which case is discussed in which session; the case purpose is tied to an outcome.',
    doNotReportIf: ['the course has no cases and states that it uses lectures and exercises only (then check PR-4)', 'the link to the session is implied by position in the schedule table'],
    defaultSeverity: 'medium', evidence: 'Schedule rows + case list', fix: 'insertAfter',
    standardClauseId: null, mba27: null, source: 'Biggs & Tang; instructions.txt 2.3',
    examples: {
      good: 'Session 4 (line 48) covers pricing but names no case. Add a pricing case from the list on lines 70–72 and note outcome 2.',
      bad: 'Add more cases to the course.',
    },
  },
  {
    id: 'PR-3', group: 'practice', title: 'Ukrainian / CEE context',
    check: 'Does at least one case, example or assignment use a Ukrainian or Central/Eastern European company, market or regulation?',
    whatGoodLooksLike: 'A visible share (around a third) of cases and examples comes from Ukraine or CEE, and wartime or EU-integration context is used where it fits the topic.',
    doNotReportIf: ['the course is explicitly global (e.g. cross-border or international) and includes at least one Ukrainian example', 'the course is purely technical and no cases are named'],
    defaultSeverity: 'medium', evidence: 'Case and example lines (list the ones checked)', fix: 'replaceBlock',
    standardClauseId: null, mba27: [LO(5)], source: 'instructions.txt 2.1, 2.3; MBA-27',
    examples: {
      good: 'All 6 cases (lines 70–75) are US companies. Replace the case for session 5 with a Ukrainian company in the same sector (e.g. a logistics or agri-tech firm) and keep the learning goal.',
      bad: 'Include more Ukrainian context.',
    },
  },
  {
    id: 'PR-4', group: 'practice', title: 'Interactive methods stated',
    check: 'Does the syllabus name at least one interactive method (case discussion, group task, simulation, peer feedback) and say where it is used?',
    whatGoodLooksLike: 'Sessions or the course description state which activities are discussion, group work or peer learning, and roughly how much time they take.',
    doNotReportIf: ['the schedule table has an "activity" column with interactive items', 'the course is a self-paced online course where activities are forums or peer reviews'],
    defaultSeverity: 'medium', evidence: 'Schedule and description lines checked', fix: 'insertAfter',
    standardClauseId: null, mba27: [LO(7), LO(9)], source: 'instructions.txt 2.3',
    examples: {
      good: 'All sessions are lectures (lines 48–60). Add a 30-minute group case discussion with peer feedback to sessions 3 and 5.',
      bad: 'Make the course more interactive.',
    },
  },
  {
    id: 'PR-5', group: 'practice', title: 'Group work has individual accountability',
    check: 'If group work is graded, does the syllabus say how individual contribution is assessed (peer evaluation, individual component, or role logs)?',
    whatGoodLooksLike: 'Group grade is combined with a peer-evaluation or individual component, with the share stated.',
    doNotReportIf: ['no group work is graded', 'the group task has a separate individual report counted in the grade'],
    defaultSeverity: 'medium', evidence: 'Group assessment line', fix: 'insertAfter',
    standardClauseId: null, mba27: [LO(9)], source: 'Team-assessment practice; instructions.txt 2.3',
    examples: {
      good: 'The group project (line 62, 30%) has one shared grade. Add a peer evaluation that adjusts 20% of the project grade.',
      bad: 'Make group grading fairer.',
    },
  },

  // ───────────── policy: AI use, academic integrity, attendance ─────────────
  {
    id: 'PO-1', group: 'policy', title: 'AI-use policy present',
    check: 'Does the syllabus contain a statement on the use of generative AI by students?',
    whatGoodLooksLike: 'An explicit AI-use statement: what is allowed, what is not, and what must be disclosed.',
    doNotReportIf: ['AI use is addressed inside the academic-integrity section', 'the syllabus refers to the KSE AI policy by name or link'],
    defaultSeverity: 'critical', evidence: 'Policies section or its absence', fix: 'clause',
    standardClauseId: 'ai-policy', mba27: [LO(3)], source: 'KSE template (Use of AI)',
    examples: {
      good: 'No AI-use policy. Offer three approved variants (restrictive, permitted with disclosure, integrated) for the instructor to choose and insert under Course Policies.',
      bad: 'Add an AI policy.',
    },
  },
  {
    id: 'PO-2', group: 'policy', title: 'AI policy specific to assessment types',
    check: 'Where an AI policy exists, does it say what is allowed for each type of graded work (e.g. exam, written case, group project) rather than one blanket sentence?',
    whatGoodLooksLike: 'A short list or table: for each assessment, AI is forbidden, allowed with disclosure, or required.',
    doNotReportIf: ['the course has only one type of assessment', 'the policy is a blanket ban that clearly covers all work'],
    defaultSeverity: 'medium', evidence: 'AI policy lines + assessment list', fix: 'clause',
    standardClauseId: 'ai-policy', mba27: [LO(3)], source: 'KSE AI policy; university AI-course-design guidance',
    examples: {
      good: 'The policy says "AI use is discouraged" (line 80). Replace with per-assessment rules: exam – no AI; case write-up – allowed with disclosure; project – AI-assisted analysis required.',
      bad: 'Make the AI policy more specific.',
    },
  },
  {
    id: 'PO-3', group: 'policy', title: 'Academic integrity statement',
    check: 'Does the syllabus contain an academic integrity statement (plagiarism, cheating, consequences) or a reference to the KSE academic integrity policy?',
    whatGoodLooksLike: 'A statement defining violations and naming consequences or the policy it refers to.',
    doNotReportIf: ['a link or named reference to the KSE academic integrity policy is given', 'the statement is under a heading like "Honesty" or "Ethics"'],
    defaultSeverity: 'critical', evidence: 'Policies section or its absence', fix: 'clause',
    standardClauseId: 'academic-integrity', mba27: [LO(6)], source: 'KSE template; AACSB Std 1',
    examples: {
      good: 'No integrity statement. Insert the approved KSE academic integrity clause under Course Policies.',
      bad: 'Mention academic integrity.',
    },
  },
  {
    id: 'PO-4', group: 'policy', title: 'Attendance policy with a rule',
    check: 'Does the syllabus state an attendance rule (required or not, how absences are counted, and any effect on the grade)?',
    whatGoodLooksLike: 'A concrete rule, e.g. "Attendance is mandatory; more than 2 unexcused absences lower the participation grade".',
    doNotReportIf: ['the rule is in the grading section as part of a participation component', 'the text says attendance is not graded and not required'],
    defaultSeverity: 'critical', evidence: 'Policies or grading section', fix: 'clause',
    standardClauseId: 'attendance', mba27: null, source: 'KSE template',
    examples: {
      good: 'Attendance is mentioned only as "important" (line 82). Replace with the approved attendance clause that gives the absence limit and the effect on the participation grade.',
      bad: 'Clarify the attendance policy.',
    },
  },
  {
    id: 'PO-5', group: 'policy', title: 'AI policy consistent with assignments',
    check: 'Is the AI policy consistent with the assignments (no assignment requires AI while the policy bans it, and no AI-exposed take-home task is left without a disclosure rule)?',
    whatGoodLooksLike: 'The policy and the assignment descriptions give the same rule for each assessment.',
    doNotReportIf: ['the syllabus has no AI policy (PO-1 covers it)', 'the assignments do not mention AI at all and the policy gives per-assessment rules'],
    defaultSeverity: 'high', evidence: 'AI policy line + conflicting assignment line', fix: 'replaceBlock',
    standardClauseId: 'ai-policy', mba27: [LO(3)], source: 'KSE AI policy',
    examples: {
      good: 'The policy bans AI (line 80) but the analytics assignment (line 63) asks students to "use ChatGPT for the market scan". Change the policy to "permitted with disclosure" for this assignment.',
      bad: 'Make the AI policy consistent.',
    },
  },
];

module.exports = { criteria };
