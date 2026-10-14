// DRAFT standard clauses for KSE syllabi.
// The wording below is NOT approved. The Academic Director must review and approve
// (or replace) every clause before it is shown to instructors as an official KSE text.
// Text in [square brackets] is filled in by the instructor, never by the model.

const standardClauses = [
  {
    id: 'ai-policy',
    title: 'Use of AI',
    status: 'draft',
    variants: [
      {
        id: 'restrictive',
        label: 'Restrictive: AI is not allowed',
        text: 'Use of AI. Generative AI tools (such as ChatGPT, Claude or Gemini) may not be used to produce any graded work in this course. Submitting AI-generated text, analysis or code as your own is a violation of the KSE Academic Integrity Policy. AI tools may be used only for non-graded self-study, such as explaining a concept.',
      },
      {
        id: 'permitted-with-disclosure',
        label: 'Permitted with disclosure',
        text: 'Use of AI. You may use generative AI tools to support your work on [assessments where AI is allowed]. You must state which tool you used and for what purpose at the end of each submission, and you remain fully responsible for the accuracy and originality of the result. AI may not be used during [in-class exams and quizzes]. Undisclosed use of AI is treated as a violation of the KSE Academic Integrity Policy.',
      },
      {
        id: 'integrated',
        label: 'Integrated: AI is part of the course work',
        text: 'Use of AI. This course teaches the use of generative AI in management decisions. For [AI-integrated assignments], you are expected to use AI tools and to document your prompts, the outputs you used, and how you checked them. You are graded on the quality of your judgement, including your critique of the AI output, not on the output itself. AI may not be used during [in-class exams]. Use outside the stated assignments must be disclosed.',
      },
    ],
  },
  {
    id: 'academic-integrity',
    title: 'Academic Integrity',
    status: 'draft',
    variants: [
      {
        id: 'default',
        label: 'Standard KSE statement',
        text: 'Academic Integrity. All work you submit must be your own, and sources must be cited. Plagiarism, cheating, fabricating data, and helping others to do so are violations of the KSE Academic Integrity Policy. Violations are reported to the program office and may lead to a failing grade for the assignment or the course and further disciplinary action under the Policy.',
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance',
    status: 'draft',
    variants: [
      {
        id: 'default',
        label: 'Standard attendance rule',
        text: 'Attendance. Attendance at all sessions is expected because much of the learning happens in discussion and group work. If you miss more than [number] sessions without a documented reason, your participation grade is reduced by [percentage]. If you cannot attend, inform the instructor before the session.',
      },
    ],
  },
  {
    id: 'late-submission',
    title: 'Late Submission',
    status: 'draft',
    variants: [
      {
        id: 'default',
        label: 'Standard late-submission rule',
        text: 'Late Submission. Assignments submitted after the deadline lose [percentage] of the maximum grade per day. Work submitted more than [number] days late is not accepted. In case of illness or other documented circumstances, contact the instructor before the deadline to agree on a new date or a make-up assessment.',
      },
    ],
  },
  {
    id: 'grading-scale',
    title: 'Grading Scale',
    status: 'draft',
    variants: [
      {
        id: 'default',
        label: 'Standard KSE scale (placeholder values)',
        text: 'Grading Scale. The final grade is the weighted sum of all assessment components: [90–100] = A (excellent); [82–89] = B (good); [74–81] = C (satisfactory); [60–73] = D (sufficient); below [60] = F (fail). A final score of at least [60] is required to pass the course.',
      },
    ],
  },
];

module.exports = { standardClauses };
