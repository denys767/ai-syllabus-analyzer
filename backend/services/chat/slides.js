// GET /suggestions/:sid/slides (лише pptx): PNG «до/після» для слайдів, які змінює пропозиція.
// Кеш — обмежений LRU у пам'яті (файлів у uploads не лишає): ключ suggestionId + optionId + docVersion
// + хеш ops (Refine змінює ops без зміни docVersion). PDF оригіналу кешується окремо за docVersion.

const fs = require('fs').promises;
const crypto = require('crypto');
const Suggestion = require('../../models/Suggestion');
const { writePptx, renderPptxPreview, previewPptxChanges, toPdf } = require('../document');
const { loadSyllabus, docOf, toDocSuggestion, optionOf } = require('./state');
const { httpError } = require('../../utils/httpError');

const MAX_ENTRIES = 32;
const MAX_BYTES = 48 * 1024 * 1024;

/** LRU за кількістю записів і сумарним розміром. */
function createLru(maxEntries, maxBytes) {
  const map = new Map();
  let bytes = 0;
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key, value, size) {
      if (size > maxBytes) return;
      if (map.has(key)) { bytes -= map.get(key).size; map.delete(key); }
      map.set(key, { value, size });
      bytes += size;
      while (map.size > maxEntries || bytes > maxBytes) {
        const [oldest, entry] = map.entries().next().value;
        bytes -= entry.size;
        map.delete(oldest);
      }
    },
    clear() { map.clear(); bytes = 0; },
  };
}

const slidesCache = createLru(MAX_ENTRIES, MAX_BYTES);
const originalPdfCache = createLru(4, 32 * 1024 * 1024);
const inFlight = new Map();

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

async function originalPdf(docVersion, original) {
  const cached = originalPdfCache.get(docVersion);
  if (cached) return cached;
  const pdf = await toPdf(original, 'pptx');
  originalPdfCache.set(docVersion, pdf, pdf.length);
  return pdf;
}

async function render(syllabus, doc, candidate) {
  // Слайди і ризик переповнення — з previewPptxChanges (для вставки — слайд якоря)
  const risks = new Map();
  for (const entry of previewPptxChanges(doc, [candidate]).entries) {
    const slide = entry.meta?.slide;
    if (slide) risks.set(slide, Boolean(risks.get(slide) || entry.meta.overflowRisk));
  }
  if (!risks.size) return { slides: [] };
  let original;
  try {
    original = await fs.readFile(syllabus.workingFile.path);
  } catch {
    throw httpError(404, 'Файл презентації не знайдено на сервері. Завантажте її ще раз.');
  }
  const edited = await writePptx(original, doc, [candidate]);
  const beforePdf = await originalPdf(doc.docVersion, original);
  const { slides } = await renderPptxPreview(original, edited, [...risks.keys()], { beforePdf });
  return {
    slides: slides.map(({ slide, before, after }) => ({
      slide, before: dataUrl(before), after: dataUrl(after), overflowRisk: risks.get(slide),
    })),
  };
}

/** → { slides: [{ slide, before, after, overflowRisk }] } */
async function suggestionSlides(syllabusId, suggestionId, optionId) {
  const syllabus = await loadSyllabus(syllabusId);
  const doc = docOf(syllabus);
  if (doc.format !== 'pptx') throw httpError(404, 'Перегляд слайдів доступний лише для презентацій PPTX.', { code: 'NOT_PPTX' });
  const suggestion = await Suggestion.findOne({ _id: suggestionId, syllabusId });
  if (!suggestion) throw httpError(404, 'Пропозицію не знайдено');
  const selected = suggestion.kind === 'choice' ? (optionId || suggestion.selectedOptionId) : null;
  if (suggestion.kind === 'choice') {
    if (!selected) throw httpError(400, 'Оберіть варіант для перегляду.', { code: 'OPTION_REQUIRED' });
    if (!optionOf(suggestion, selected)) throw httpError(400, 'Такого варіанта немає');
  }
  if (suggestion.docVersion && suggestion.docVersion !== doc.docVersion) {
    throw httpError(409, 'Документ змінився. Повторіть аналіз.', { code: 'STALE_DOC_VERSION' });
  }
  const candidate = toDocSuggestion(suggestion, selected);
  if (!candidate.ops.length) return { slides: [] };

  const opsHash = crypto.createHash('sha1').update(JSON.stringify(candidate.ops)).digest('hex');
  const key = `${suggestionId}:${selected || ''}:${doc.docVersion}:${opsHash}`;
  const hit = slidesCache.get(key);
  if (hit) return hit;
  if (inFlight.has(key)) return inFlight.get(key);

  const pending = render(syllabus, doc, candidate)
    .then((result) => {
      const size = result.slides.reduce((n, s) => n + s.before.length + s.after.length, 0);
      slidesCache.set(key, result, size);
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

function clearSlidesCache() {
  slidesCache.clear();
  originalPdfCache.clear();
}

module.exports = { suggestionSlides, clearSlidesCache, createLru };
