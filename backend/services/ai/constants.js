const REV_DEL_OPEN = '[[KSE_DEL]]';
const REV_DEL_CLOSE = '[[/KSE_DEL]]';
const REV_ADD_OPEN = '[[KSE_ADD]]';
const REV_ADD_CLOSE = '[[/KSE_ADD]]';

const MAX_AFTER_CHARS = 1800;

const SYLLABUS_TEMPLATE = `# Syllabus Template
## 1. Summary
- Course Title & Code
- Instructor(s)
- Prerequisites
- Course Objectives
- Learning Outcomes

## 2. Course Structure & Schedule
- Table with dates and topics

## 3. Grading & Assessment
- Assessment components with weights

## 4. Course Materials
- Required Readings
- Recommended Materials

## 5. Course Policies
- Attendance
- Academic Integrity
- Use of AI`;

const LEARNING_OUTCOMES = [
  { id: 'Learning outcome 1', text: 'Leverage real-life business experiences to develop adaptive leadership and decision-making skills for managing businesses in complex and dynamic environments.' },
  { id: 'Learning outcome 2', text: 'Integrate and apply global business management practices to scale ventures, drive innovation, and enhance long-term business sustainability.' },
  { id: 'Learning outcome 3', text: 'Master advanced digital, analytical, and AI-driven decision-making tools to optimize management efficiency and strategic foresight.' },
  { id: 'Learning outcome 4', text: 'Develop innovative and resilient business strategies to foster growth, navigate uncertainty, and maintain a competitive edge in local and global markets.' },
  { id: 'Learning outcome 5', text: 'Drive the growth and scalability of Ukrainian businesses through expert strategic planning, market expansion, and cross-border business development.' },
  { id: 'Learning outcome 6', text: 'Cultivate strong ethical leadership and cultural intelligence to foster inclusive, responsible, and sustainable business practices in a complex geopolitical and intercultural environment.' },
  { id: 'Learning outcome 7', text: 'Enhance communication, negotiation, and persuasion skills to effectively influence stakeholders, build partnerships, and drive business success.' },
  { id: 'Learning outcome 8', text: 'Develop a career path to maximize individual growth, leverage MBA learning in career transitions, and strengthen professional positioning in competitive job markets.' },
  { id: 'Learning outcome 9', text: 'Strengthen leadership impact by mastering interpersonal and intercultural collaboration, fostering high-performance teams, and leading with confidence in diverse environments.' }
];

const CATEGORY_LABELS = {
  'template-compliance': 'Template Compliance',
  'learning-objectives': 'Learning Outcomes Alignment',
  'content-quality': 'Content Quality',
  'cases': 'Case Recommendations',
  'policy': 'Course Policies',
  'other': 'Other',
};

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || 'Other';
}

function buildSyllabusContextBlock() {
  const losText = LEARNING_OUTCOMES.map((lo) => `${lo.id}: ${lo.text}`).join('\n');
  return `**KSE SYLLABUS TEMPLATE (target structure for the revised sections):**
${SYLLABUS_TEMPLATE}

**MBA-27 LEARNING OUTCOMES (reference these by exact ID when relevant — do NOT invent new ones):**
${losText}`;
}

module.exports = {
  REV_DEL_OPEN,
  REV_DEL_CLOSE,
  REV_ADD_OPEN,
  REV_ADD_CLOSE,
  MAX_AFTER_CHARS,
  SYLLABUS_TEMPLATE,
  LEARNING_OUTCOMES,
  CATEGORY_LABELS,
  getCategoryLabel,
  buildSyllabusContextBlock,
};
