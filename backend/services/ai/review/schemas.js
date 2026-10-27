const { validateSchema } = require('../../../utils/jsonSchema');
const str = { type: 'string' };
const bool = { type: 'boolean' };
const array = (items) => ({ type: 'array', items });
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const enumeration = (values) => ({ type: 'string', enum: values });
const nullableString = { type: ['string', 'null'] };
const kinds = ['heading', 'paragraph', 'list-item', 'table-cell', 'slide-title', 'slide-text', 'notes'];
const blockIds = array(str);
const outcome = object({ id: str, text: str, mba27: array(str), blockIds });
const assessment = object({ id: str, name: str, weight: { type: ['number', 'null'] }, linkedOutcomes: array(str), direct: bool, blockIds });
const entry = object({ name: str, linkedOutcomes: array(str), blockIds });
const structure = object({ outcomes: array(outcome), assessments: array(assessment), sessions: array(entry), policies: array(entry), cases: array(entry) });
// Порядок полів: спочатку докази та обґрунтування, потім вердикт.
const verdict = object({
  criterionId: str, evidenceBlockIds: blockIds, claim: str, rationale: str,
  confidence: { type: 'number', minimum: 0, maximum: 1 }, materiality: str,
  missingSection: bool, suggestedAction: str, severity: { type: ['string', 'null'], enum: ['critical', 'high', 'medium', 'low', null] },
  severityReason: nullableString, verdict: enumeration(['ok', 'issue', 'not_applicable']),
});
const diagnosis = object({ verdicts: array(verdict) });
const verification = object({ results: array(object({
  findingId: str, evidenceSupportsClaim: bool, alreadyAddressed: bool, generic: bool, material: bool, actionable: bool,
})) });
const op = { anyOf: [
  object({ op: enumeration(['replaceBlock']), blockId: str, newText: str }),
  // Нові блоки — лише типи, які вміють вставляти writer-и (для pptx стиль береться з якоря)
  object({ op: enumeration(['insertAfter']), blockId: str, newBlocks: array(object({ kind: enumeration(['paragraph', 'heading', 'list-item']), text: str })) }),
  object({ op: enumeration(['deleteBlock']), blockId: str }),
] };
const rewrite = object({ kind: enumeration(['edit', 'question']), title: str, description: str, rationale: str, ops: array(op), question: nullableString });
const clause = object({
  title: str, description: str, rationale: str, op: enumeration(['insertAfter', 'replaceBlock']), blockId: str,
  options: array(object({ id: str, label: str, rationale: str,
    placeholders: array(object({ placeholder: str, value: nullableString })),
  })),
});

module.exports = { structure, diagnosis, verification, rewrite, clause, op, validateSchema };
