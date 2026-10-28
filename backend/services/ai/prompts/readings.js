// Рідінги й кейси (етап 8 ТЗ): обгортка над review/caseSources.js (веб-пошук + серверна перевірка URL).
// Пропонується лише знайдене з перевіреним URL; назви моделлю не вигадуються і йдуть у proposedValues на підтвердження.
// Єдине місце, де чат користується веб-пошуком (docs/V5_PLAN.md).
const caseSources = require('../review/caseSources');
const { getPath } = require('../../syllabusState/paths');

const MAX_READINGS = 3;
const PATH = 'materials.recommended[]';

const citation = (c) => [c.title, [c.publisher, c.year].filter(Boolean).join(', ')].filter(Boolean).join(' — ');

function nextIds(existing, count) {
  const taken = new Set(existing.map((m) => m.id));
  const ids = [];
  for (let n = 1; ids.length < count; n += 1) if (!taken.has(`m${n}`)) ids.push(`m${n}`);
  return ids;
}

/**
 * @param {{ state, refs, query: string }} input
 * @returns {Promise<Array<object>>} 0 або 1 вхід для createDraftSuggestions (materials.recommended[] = наявні + знайдені).
 *   Порожній, якщо CASE_WEB_SEARCH != 1, запит порожній або жодне джерело не пройшло перевірку URL.
 */
async function suggestReadings({ state, refs, query } = {}) {
  const q = String(query || '').trim();
  if (!q || !caseSources.caseSearchEnabled()) return [];
  const found = await caseSources.findCaseSources({
    finding: { claim: q, suggestedAction: 'Recommend suitable readings or published cases for this topic' },
    meta: { courseName: state?.header?.courseTitle || '' },
  });
  const verified = (found || []).filter((c) => c.verified && c.url && c.title).slice(0, MAX_READINGS);
  if (!verified.length) return [];

  const existing = getPath(state, PATH) || [];
  const ids = nextIds(existing, verified.length);
  const entities = verified.map((c, i) => ({
    id: ids[i], citation: citation(c), url: c.url, verified: true, source: 'ai_draft', evidenceBlockIds: [],
  }));
  return [{
    kind: 'edit',
    severity: 'medium',
    title: `Add recommended ${verified.length === 1 ? 'reading' : 'readings'}`,
    description: verified.map((c) => `${citation(c)}${c.relevance ? ` — ${c.relevance}` : ''}`).join('\n'),
    rationale: 'Found by web search; the links were checked by the server. Confirm the titles before they are added.',
    target: { path: PATH, entityId: null },
    value: [...existing, ...entities],
    // Назви — факти: підтверджуються окремо
    proposedValues: verified.map((c) => ({ label: 'Reading title', value: c.title })),
    sources: verified.map(({ title, publisher, year, url, verified: v }) => ({ title, publisher, year, url, verified: v })),
  }];
}

module.exports = { suggestReadings, MAX_READINGS };
