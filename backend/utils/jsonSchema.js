// Мінімальний валідатор підмножини JSON Schema (strict-схеми LLM, фікстури, стан силабусу).
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

module.exports = { validateSchema };
