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

// Валідуємо й локально: обрив відповіді або mock не повинні обійти контракт.
function validateSchema(schema, value, path = '$') {
  if (schema.allOf) {
    const errors = schema.allOf.flatMap((s) => validateSchema(s, value, path));
    if (errors.length) return errors;
  }
  if (schema.if && validateSchema(schema.if, value, path).length === 0) {
    const errors = validateSchema(schema.then, value, path);
    if (errors.length) return errors;
  }
  if (schema.anyOf) {
    return schema.anyOf.some((s) => validateSchema(s, value, path).length === 0) ? [] : [`${path}: no matching variant`];
  }
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !types.includes(type)) return [`${path}: expected ${types.join('|')}`];
  if (Object.hasOwn(schema, 'const') && schema.const !== value) return [`${path}: invalid constant`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: invalid enum value`];
  if (type === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return [`${path}: number out of range`];
  if (type === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) return [`${path}: invalid pattern`];
  if (type === 'object') {
    const properties = schema.properties || {};
    const errors = schema.additionalProperties === false ? Object.keys(value).filter((k) => !Object.hasOwn(properties, k)).map((k) => `${path}.${k}: unexpected property`) : [];
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) errors.push(`${path}.${k}: required`);
    for (const k of Object.keys(properties)) if (Object.hasOwn(value, k)) errors.push(...validateSchema(properties[k], value[k], `${path}.${k}`));
    return errors;
  }
  if (type === 'array' && value.length < (schema.minItems || 0)) return [`${path}: too few items`];
  return type === 'array' && schema.items ? value.flatMap((item, i) => validateSchema(schema.items, item, `${path}[${i}]`)) : [];
}

module.exports = { structure, diagnosis, verification, rewrite, clause, op, validateSchema };
