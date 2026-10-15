// Smoke stub: лише детерміновані знахідки, без оцінювання якості LLM.
async function mockCreateResponse(params) {
  const { criteriaByGroup } = require('../services/ai/rubric');
  const name = params.text.format.name;
  let result;
  if (name === 'review_structure') result = { outcomes: [], assessments: [], sessions: [], policies: [], cases: [] };
  else if (name.startsWith('review_diagnose_')) {
    result = { verdicts: criteriaByGroup()[name.slice('review_diagnose_'.length)].filter((c) => !c.disabled).map((c) => ({
      criterionId: c.id, evidenceBlockIds: [], claim: '', rationale: '', confidence: 1, materiality: '', missingSection: false,
      suggestedAction: '', severity: null, severityReason: null, verdict: 'ok',
    })) };
  } else if (name === 'review_verify') {
    const findings = JSON.parse(params.input[1].content.match(/^Findings: (.*)\n/)[1]);
    result = { results: findings.map((f) => ({ findingId: f.id, evidenceSupportsClaim: true, alreadyAddressed: false, generic: false, material: true, actionable: true })) };
  } else throw new Error(`Mock does not implement ${name}`);
  return { output_text: JSON.stringify(result) };
}
function installMock() {
  const clientPath = require.resolve('../services/ai/client');
  require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: {
    llmModel: 'gpt-mock', createResponse: mockCreateResponse,
  } };
}
module.exports = { installMock, mockCreateResponse };
