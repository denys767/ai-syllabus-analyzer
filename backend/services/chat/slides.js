// Обмежений LRU у пам’яті: PNG не лишають файлів у uploads.
const fs = require('fs').promises;
const crypto = require('crypto');
const Suggestion = require('../../models/Suggestion');
const { writePptx, renderPptxPreview, previewPptxChanges } = require('../document');
const { loadSyllabus, docOf, toDocSuggestion, optionOf } = require('./state');
const { httpError } = require('../../utils/httpError');
const cache = new Map();
const inFlight = new Map();
const MAX_ENTRIES = 16;
const MAX_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0;

function remember(key, value) {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > MAX_BYTES) return;
  cache.set(key, { value, bytes }); cacheBytes += bytes;
  while (cache.size > MAX_ENTRIES || cacheBytes > MAX_BYTES) {
    const oldest = cache.keys().next().value;
    cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest);
  }
}
async function suggestionSlides(syllabusId, suggestionId, optionId) {
  const syllabus = await loadSyllabus(syllabusId);
  const doc = docOf(syllabus);
  if (doc.format !== 'pptx') throw httpError(404, 'Перегляд слайдів доступний лише для PPTX.');
  const suggestion = await Suggestion.findOne({ _id: suggestionId, syllabusId });
  if (!suggestion) throw httpError(404, 'Пропозицію не знайдено');
  const selected = optionId || suggestion.selectedOptionId;
  if (suggestion.kind === 'choice' && !selected) throw httpError(400, 'Оберіть варіант для перегляду.', { code: 'OPTION_REQUIRED' });
  if (suggestion.kind === 'choice' && !optionOf(suggestion, selected)) throw httpError(400, 'Такого варіанта немає');
  if (suggestion.docVersion && suggestion.docVersion !== doc.docVersion) throw httpError(409, 'Документ змінився. Повторіть аналіз.', { code: 'STALE_DOC_VERSION' });
  const candidate = toDocSuggestion(suggestion, selected);
  const revision = crypto.createHash('sha1').update(JSON.stringify(candidate)).digest('hex');
  const key = `${suggestionId}:${selected || ''}:${doc.docVersion}:${revision}`;
  if (cache.has(key)) {
    const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit.value;
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const render = async () => {
    const risks = new Map();
    for (const entry of previewPptxChanges(doc, [candidate]).entries) {
      risks.set(entry.meta.slide, Boolean(risks.get(entry.meta.slide) || entry.meta.overflowRisk));
    }
    if (!risks.size) return { slides: [] };
    const original = await fs.readFile(syllabus.workingFile.path);
    const edited = await writePptx(original, doc, [candidate]);
    const { slides } = await renderPptxPreview(original, edited, [...risks.keys()]);
    return { slides: slides.map(({ slide, before, after }) => ({ slide,
      before: `data:image/png;base64,${before.toString('base64')}`,
      after: `data:image/png;base64,${after.toString('base64')}`, overflowRisk: risks.get(slide) })) };
  };
  const pending = render();
  inFlight.set(key, pending);
  try {
    const result = await pending; remember(key, result); return result;
  } finally { inFlight.delete(key); }
}
module.exports = { suggestionSlides };
