const { makeFinding } = require('./common');
const { getCriterion } = require('../rubric');

const SECTION_PATTERNS = {
  objectives: /\b(objectives?|aims?|course description|course purpose)\b/i,
  outcomes: /\b(learning outcomes?|competenc(?:y|ies)|students will be able|by the end of (?:this |the )?course)\b/i,
  schedule: /\b(schedule|syllabus calendar|course (?:structure|outline)|session\s*\d|week\s*\d|timetable)\b/i,
  assessment: /\b(grad(?:ing|es?)|assessments?|evaluation|how you will be assessed)\b/i,
  materials: /\b(readings?|course materials?|textbooks?|bibliography|resources|materials (?:are )?distributed)\b/i,
  prerequisites: /\b(pre-?requisites?|entry requirements|no prior knowledge|open to all MBA|who is this course for)\b/i,
  ai: /\b(generative AI|AI[- ](?:use|policy|tools?)|use of AI|ChatGPT|artificial intelligence policy|KSE AI policy)\b/i,
};

// Сума лише компонентних ваг. Шкали, штрафи та вкладені ваги не додаються.
function assessmentWeights(blocks) {
  const rows = [];
  const hasAssessmentHeading = blocks.some((b) => ['heading', 'slide-title'].includes(b.kind) && SECTION_PATTERNS.assessment.test(b.text));
  let active = false;
  let assessmentLevel = 6;
  let pendingLabel = null;
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'slide-title') {
      if (SECTION_PATTERNS.assessment.test(b.text)) { active = true; assessmentLevel = b.level || 2; }
      else if ((b.level || 2) <= assessmentLevel) active = false;
      pendingLabel = null;
      continue;
    }
    if (hasAssessmentHeading && !active) continue;
    const text = b.text.trim();
    if (/\b(total|pass|scale|grade\s*[A-F]|late|penalt(?:y|ies)|attendance requirement|minimum|maximum|threshold)\b/i.test(text) || /\d\s*[-–]\s*\d/.test(text)) continue;
    const assessmentName = /\b(exam|project|quiz(?:zes)?|test|participation|presentation|case|assignment|report|essay|paper|simulation|portfolio)\b/i.test(text);
    if (b.kind === 'table-cell' && active && assessmentName && !text.includes('%')) pendingLabel = b;
    const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
    if (!matches.length || !(active || assessmentName) || (!assessmentName && !pendingLabel)) continue;
    // Кілька відсотків в одному рядку можуть бути вкладеними частками: нехай перевірить LLM.
    if (matches.length !== 1 || /\b(of (?:the |this )?(?:project|exam|assessment|component|grade)|within|including|bonus|optional|extra credit)\b/i.test(text)) return null;
    rows.push({ weight: Number(matches[0][1].replace(',', '.')), ids: pendingLabel ? [pendingLabel.id, b.id] : [b.id] });
    pendingLabel = null;
  }
  // Одна вага може бути частковим описом, а не повним переліком компонентів.
  return rows.length >= 2 ? rows : null;
}

function runChecks(blocks) {
  const text = blocks.map((b) => b.text).join('\n');
  const findings = [];
  const missing = (id, claim, suggestedAction) => {
    if (getCriterion(id).disabled) return;
    const headings = blocks.filter((b) => b.kind === 'heading' || b.kind === 'slide-title');
    const anchor = headings.find((b) => id.startsWith('PO-') ? /polic|integrity|attendance/i.test(b.text) : /summary|overview|introduction/i.test(b.text)) || headings[0];
    const evidenceBlockIds = [anchor ? anchor.id : 'document'];
    findings.push(makeFinding(id, { evidenceBlockIds, confidence: 1, missingSection: true,
      claim, rationale: 'Перевірка заголовків і ключових слів у всьому документі не знайшла відповідного розділу чи формулювання.',
      materiality: 'Відсутня обов’язкова інформація за шаблоном KSE.', suggestedAction }));
  };
  for (const [section, id, label] of [
    ['prerequisites', 'T-2', 'Передумови'], ['objectives', 'T-3', 'Цілі курсу'],
    ['outcomes', 'T-4', 'Результати навчання'], ['schedule', 'T-5', 'Розклад курсу'],
    ['assessment', 'T-6', 'Оцінювання'], ['materials', 'T-7', 'Матеріали курсу'],
  ]) {
    // Не вважаємо відсутність буквального заголовка відсутністю змісту.
    let present = SECTION_PATTERNS[section].test(text);
    if (section === 'assessment') present ||= /\b(exam|project|quiz|participation)\b[^\n]*\d+\s*%/i.test(text);
    if (section === 'objectives') present ||= /\b(this course (?:aims|covers|introduces|explores)|purpose of (?:this|the) course)\b/i.test(text);
    if (!present) missing(id, `Не знайдено розділ «${label}» або відповідне формулювання.`, `Уточніть у викладача дані для розділу «${label}» і додайте їх до силабусу.`);
  }
  // Згадка AI у темі курсу сама по собі не є політикою; неоднозначність вирішує diagnose.
  if (!SECTION_PATTERNS.ai.test(text) && !/\bAI\b/.test(text)) missing('PO-1', 'Не знайдено правила використання AI або посилання на політику.', 'Оберіть варіант політики використання AI.');
  const weights = assessmentWeights(blocks);
  if (weights && !getCriterion('AS-1').disabled) {
    const sum = weights.reduce((total, row) => total + row.weight, 0);
    if (Math.abs(sum - 100) > 0.01) findings.push(makeFinding('AS-1', {
      evidenceBlockIds: weights.flatMap((row) => row.ids), confidence: 1,
      claim: `Сума ваг оцінювання становить ${Number(sum.toFixed(4))}% замість 100%.`,
      rationale: `Ваги компонентів: ${weights.map((row) => row.weight).join(' + ')}.`,
      materiality: 'Підсумкову оцінку неможливо розрахувати однозначно.',
      suggestedAction: 'Уточніть у викладача, які ваги потрібно змінити; не вигадуйте значення.',
    }));
  }
  return findings;
}
module.exports = { runChecks, assessmentWeights, SECTION_PATTERNS };
