// Спільне для тестів AI v5: відповідь Responses API зі strict JSON і перевірка strict-схеми.
const respond = (value) => ({ output_text: JSON.stringify(value) });

/** Кожен object у схемі: additionalProperties:false і required = усі ключі (вимога strict json_schema / function tools). */
function assertStrictSchema(schema, path = '$') {
  if (!schema || typeof schema !== 'object') return;
  const types = [].concat(schema.type || []);
  if (types.includes('object')) {
    expect([path, schema.additionalProperties]).toEqual([path, false]);
    expect([path, [...(schema.required || [])].sort()]).toEqual([path, Object.keys(schema.properties || {}).sort()]);
    Object.entries(schema.properties || {}).forEach(([k, v]) => assertStrictSchema(v, `${path}.${k}`));
  }
  if (schema.items) assertStrictSchema(schema.items, `${path}[]`);
}

module.exports = { respond, assertStrictSchema };
