const schemas = require('../../services/ai/review/schemas');
const { emptyStructure } = require('./fixtures');
function assertStrict(schema) {
  if (schema.type === 'object') {
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    Object.values(schema.properties).forEach(assertStrict);
  }
  if (schema.type === 'array') assertStrict(schema.items);
  if (schema.anyOf) schema.anyOf.forEach(assertStrict);
}
test.each(['structure', 'diagnosis', 'verification', 'rewrite', 'clause', 'op'])('%s schema is strict at every nested object', (name) => assertStrict(schemas[name]));
test('nullable unions and exact operation branches validate', () => {
  expect(schemas.validateSchema(schemas.structure, emptyStructure())).toEqual([]);
  for (const op of [
    { op: 'replaceBlock', blockId: 'b0001', newText: 'Full paragraph.' },
    { op: 'insertAfter', blockId: 'b0001', newBlocks: [{ kind: 'paragraph', text: 'New paragraph.' }] },
    { op: 'deleteBlock', blockId: 'b0001' },
  ]) expect(schemas.validateSchema(schemas.op, op)).toEqual([]);
  expect(schemas.validateSchema(schemas.op, { op: 'deleteBlock', blockId: 'b0001', newText: 'No' }).length).toBeGreaterThan(0);
  expect(schemas.validateSchema(schemas.structure, { ...emptyStructure(), outcomes: null }).length).toBeGreaterThan(0);
});
