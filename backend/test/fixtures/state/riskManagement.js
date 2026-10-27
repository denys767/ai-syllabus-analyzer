// Еталонний стан v5: Risk Management v.2 (заповнений приклад за шаблоном KSE), як після парсингу треку 2.
// Спільна фікстура для тестів syllabusState, checks, templateDocx, parse. Повертає новий об'єкт на кожен виклик.
// Відомі властивості прикладу (на них стоять тести перевірок):
//   contact 20 ак. год (≤ 30 → достатньо 2 компонентів), self-study 14 (< 50% від 2×20 → warning),
//   participation 35% (> 30 → warning), сума ваг 100, у MBA27 курс core (НД.4), у MBA28 — elective.
const { loadFixtureRefs } = require('../../../services/references/fixtureRefs');

const p = (source = 'parsed', evidenceBlockIds = []) => ({ source, evidenceBlockIds });

function policiesFromLibrary(overrides = {}) {
  return loadFixtureRefs('MBA28').policyLibrary.blocks.map((b) => ({
    key: b.key,
    mode: b.mode,
    optionKey: null,
    candidateOptionKey: null,
    text: b.mode === 'locked' ? b.text : null,
    fixtureRef: b.mode === 'locked' ? { key: b.key, version: '1.1' } : null,
    modified: false,
    ...p(b.mode === 'locked' ? 'fixture' : null),
    ...(overrides[b.key] || {}),
  }));
}

function riskManagementState({ programCode = 'MBA28' } = {}) {
  return {
    schemaVersion: 1,
    programCode,
    track: 'upload',
    language: 'en',
    header: {
      courseTitle: 'Risk Management', courseCode: null, department: null,
      ects: 2, totalHours: null, studyMode: null, deliveryFormat: 'hybrid', language: 'en',
      term: { start: null, end: null },
      courseKind: programCode === 'MBA27' ? 'core' : 'elective',
      computed: {
        contactHours: 20, lectureHours: null, practiceHours: null, workshopHours: null,
        selfStudyHours: 14, assessmentTotal: 100, deliveryModes: ['hybrid'],
        termFromSchedule: { start: '2026-04-25', end: '2026-05-09' },
      },
      ...p(),
    },
    summary: {
      prerequisites: { fixtureRefs: [], text: 'None', ...p() },
      shortDescription: {
        text: "In today's fast-paced world, risk is everywhere: whether you're launching a startup or steering a Fortune 500 company. This course gives you the frameworks to see risk early and act on it.",
        ...p(),
      },
      objectives: [{ id: 'obj1', text: "In this course, you'll dive into the world of risk management, mastering the essential frameworks.", ...p() }],
      capstone: {
        criteriaKeys: [], projectTypes: [],
        text: 'This course will help you anticipate what could derail your capstone project. It also gives you practical tools to identify, assess and mitigate risks.',
        ...p(),
      },
    },
    outcomes: [
      { id: 'clo1', text: 'Apply risk management frameworks to develop comprehensive risk management strategies', plo: [], assessmentIds: ['as3'], ...p() },
      { id: 'clo2', text: 'Create a risk profile for your organization and identify key risks that could impact business objectives', plo: [], assessmentIds: ['as3'], ...p() },
      { id: 'clo3', text: 'Design and implement effective risk mitigation and response strategies', plo: [], assessmentIds: ['as2'], ...p() },
      { id: 'clo4', text: 'Establish internal controls that support effective risk management', plo: [], assessmentIds: [], ...p() },
      { id: 'clo5', text: 'Cultivate a proactive, risk-aware culture', plo: [], assessmentIds: [], ...p() },
      { id: 'clo6', text: 'Use appropriate tools and techniques to continuously monitor and reassess risks', plo: [], assessmentIds: [], ...p() },
    ],
    instructors: [{
      id: 'ins1', crmId: null, name: 'Oleksii Gromyko', position: 'Associate professor in Project Management at KSE GBS',
      email: null, officeHours: null, assistants: null,
      expertise: ['Strategy execution', 'Management of projects, programs and projects portfolio', 'Operations management', 'Risk management', 'Digital Business transformation'],
      education: ['Project Management Professional (PMP®)', 'Certified Business Process Professional (CBPP®)', 'Master in Mathematics & Computer Science'],
      experience: ['Managing Partner at "Project management bureau" LLC', 'Consultant at UN agencies and other international organizations'],
      ...p(),
    }],
    sessions: [
      { id: 's1', n: 1, topic: 'Overview of Risk Management: biases behind risk management failures', type: null, hours: 4, format: 'hybrid', guest: null, additional: 'Required reading: HBR article "Managing Risks"', date: '2026-04-25', time: '13:30–16:20', ...p() },
      { id: 's2', n: 2, topic: 'Risk Management tools and techniques: case study; the role of risk', type: null, hours: 4, format: 'hybrid', guest: null, additional: 'Choose an organization (project) to apply risk management principles', date: '2026-04-25', time: '09:30–12:20', ...p() },
      { id: 's3', n: 3, topic: 'Qualitative vs. quantitative risk assessment', type: null, hours: 4, format: 'hybrid', guest: null, additional: null, date: '2026-04-26', time: '13:30–16:20', ...p() },
      { id: 's4', n: 4, topic: 'Guest speaker session. Case study from Pepsico Ukraine', type: null, hours: 4, format: 'hybrid', guest: 'Svitlana Loboda', additional: 'Required reading: case description', date: '2026-05-09', time: '09:30–12:20', ...p() },
      { id: 's5', n: 5, topic: 'Written Exam', type: null, hours: 1, format: 'hybrid', guest: null, additional: null, date: '2026-05-09', time: '13:30–14:10', ...p() },
      { id: 's6', n: 6, topic: 'Designing Effective Internal Controls', type: null, hours: 3, format: 'hybrid', guest: null, additional: 'Risk registry', date: '2026-05-09', time: '14:20–16:20', ...p() },
    ],
    individualWork: [
      { id: 'iw1', title: 'Reading of the mandatory materials', hours: 2, ...p() },
      { id: 'iw2', title: 'Assignments and preparation for written exam', hours: 4, ...p() },
      { id: 'iw3', title: 'Final project preparation', hours: 8, ...p() },
    ],
    assessments: [
      { id: 'as1', name: 'Active class participation', fixtureRef: null, weight: 35, criteria: 'The student is fully present and actively participates in class activities.', deadline: 'Throughout the course', isParticipation: true, isControl: false, outcomeIds: [], ...p() },
      { id: 'as2', name: 'Written Exam', fixtureRef: null, weight: 25, criteria: 'The score is proportional to the total number of correct answers (multiple choice).', deadline: '2026-05-09', isParticipation: false, isControl: true, outcomeIds: ['clo3'], ...p() },
      { id: 'as3', name: 'Final project', fixtureRef: null, weight: 40, criteria: 'Students work individually or in teams of 2–3 to build a risk management plan for a real organization.', deadline: '2026-05-23', isParticipation: false, isControl: true, outcomeIds: ['clo1', 'clo2'], ...p() },
    ],
    compensation: { items: [] },
    materials: {
      required: [{ id: 'm1', citation: 'HBR article "Managing Risks"', url: null, verified: false, ...p() }],
      recommended: [
        { id: 'm2', citation: 'The Deepwater Horizon Oil Spill documentary video', url: null, verified: false, ...p() },
        { id: 'm3', citation: 'COSO Internal Control Integrated Framework', url: null, verified: false, ...p() },
      ],
    },
    policies: policiesFromLibrary({
      'policy.attendance': {
        text: 'Attendance is mandatory. If a student misses more than 40% of classes, they will be required to retake the course unless explicitly agreed otherwise with the instructor.',
        candidateOptionKey: 'attendance_std', ...p('parsed'),
      },
      'policy.late': {
        text: 'Assignments submitted after the deadline may be subject to a penalty in the form of a reduction of the maximum possible score.',
        candidateOptionKey: 'late_gbs', ...p('parsed'),
      },
    }),
    sections: {},
  };
}

module.exports = { riskManagementState, policiesFromLibrary };
