const { criteriaByGroup } = require('../../services/ai/rubric');
const { makeFinding } = require('../../services/ai/review/common');
const blocks = [
  { id: 'b0001', kind: 'heading', text: 'Learning Outcomes', level: 2 },
  { id: 'b0002', kind: 'paragraph', text: 'Understand competitive strategy.' },
  { id: 'b0003', kind: 'heading', text: 'Assessment', level: 2 },
  { id: 'b0004', kind: 'paragraph', text: 'Final project: 100%.' },
];
const emptyStructure = () => ({ outcomes: [], assessments: [], sessions: [], policies: [], cases: [] });
function verdictsFor(group, issues = {}) {
  return { verdicts: criteriaByGroup()[group].filter((c) => !c.disabled).map((c) => ({
    criterionId: c.id, evidenceBlockIds: [], claim: '', rationale: '', confidence: 1, materiality: '', missingSection: false,
    suggestedAction: '', severity: null, severityReason: null, verdict: 'ok', ...issues[c.id],
  })) };
}
const issue = (overrides = {}) => ({
  evidenceBlockIds: ['b0002'], claim: 'Результат не вимірюється.', rationale: 'Дієслово understand не описує спостережувану дію.',
  confidence: 0.9, materiality: 'Неможливо перевірити результат.', missingSection: false, suggestedAction: 'Уточніть дієслово.',
  severity: null, severityReason: null, verdict: 'issue', ...overrides,
});
const finding = (criterion = 'LO-1', overrides = {}) => makeFinding(criterion, issue(overrides));
const approval = (f, overrides = {}) => ({ findingId: f.id, evidenceSupportsClaim: true, alreadyAddressed: false, generic: false, material: true, actionable: true, ...overrides });
const response = (value) => ({ output_text: JSON.stringify(value) });
module.exports = { blocks, emptyStructure, verdictsFor, issue, finding, approval, response };
