// Спільні перевірки нових writer-ів; apply.js лишається незалежним від формату.
const { validateOps, applyAccepted } = require('./apply');
const { computeDocVersion } = require('./model');
const { docError } = require('./ooxml');
function writerInputs(buffer, doc, accepted = [], format) {
  if (doc.format !== format) throw docError('Невідповідний формат моделі документа', 400, 'BAD_FORMAT');
  if (doc.docVersion !== computeDocVersion(buffer)) throw docError('Файл змінився після аналізу. Потрібен повторний аналіз.', 409, 'STALE_DOC_VERSION');
  const errors = accepted.flatMap((s) => validateOps(doc, s.ops, { strict: false }).map((e) => ({ suggestionId: s.id, ...e })));
  if (errors.length) throw docError('Некоректні операції в прийнятих пропозиціях', 422, 'INVALID_OPS', { errors });
  const result = applyAccepted(doc, accepted);
  if (result.conflicts.length) throw docError('Прийняті пропозиції конфліктують між собою', 409, 'SUGGESTION_CONFLICT', { conflicts: result.conflicts });
  return result;
}
module.exports = { writerInputs };
