// Промпт «Мапінг LO → PLO» (ТЗ §7): для кожного CLO 2–3 ймовірні ПРН своєї програми з поясненням.
// AI не ставить відповідність сам: результат — pending-картки з confirmed: false, які підтверджує викладач.
const { requestJSON } = require('../review/common');
const { normalizePloCode } = require('../../references');
const { renderText, renderState } = require('../../syllabusState/render');
const { buildPreamble, untrusted } = require('./preamble');

const PROMPT_VERSION = 'lo-mapping-v1';
const MIN_PLO = 2;
const MAX_PLO = 3;

const str = { type: 'string' };

function mappingSchema(outcomeIds, ploCodes) {
  return {
    type: 'object',
    properties: {
      mappings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            outcomeId: { type: 'string', enum: outcomeIds },
            plo: {
              type: 'array',
              items: {
                type: 'object',
                properties: { code: { type: 'string', enum: ploCodes }, coverage: { type: 'string', enum: ['full', 'partial'] }, reason: str },
                required: ['code', 'coverage', 'reason'],
                additionalProperties: false,
              },
            },
          },
          required: ['outcomeId', 'plo'],
          additionalProperties: false,
        },
      },
    },
    required: ['mappings'],
    additionalProperties: false,
  };
}

/**
 * @param {{ state, refs, outcomeIds?: string[] }} input  outcomeIds — id CLO зі state.outcomes; без них — усі CLO з текстом
 * @returns {Promise<Array<object>>} входи для createDraftSuggestions: target.path 'outcomes[<id>].plo', kind 'edit',
 *   value [{ code, coverage, confirmed: false }]. Порожній масив, якщо немає CLO або ПРН програми.
 */
async function suggestPlo({ state, refs, outcomeIds } = {}) {
  const codes = (refs?.outcomes || []).map((o) => normalizePloCode(o.code));
  const wantedIds = new Set((outcomeIds || []).filter(Boolean));
  const clos = (state?.outcomes || []).filter((o) => o.text && String(o.text).trim() && (!wantedIds.size || wantedIds.has(o.id)));
  if (!clos.length || !codes.length) return [];

  const system = [
    buildPreamble({ refs, state }),
    `Task: for each course learning outcome (CLO) below, suggest ${MIN_PLO} to ${MAX_PLO} programme learning outcomes (PLO) from the list above that it most plausibly supports, strongest first.`,
    'Use only PLO codes from the list. coverage: "full" when the CLO clearly delivers the PLO, "partial" when it contributes to it. reason: one short sentence explaining why this CLO supports this PLO, based on the wording of both.',
    'You only suggest. The instructor decides which mappings are right, so never claim a mapping is settled.',
  ].join('\n\n');
  const document = [
    `Course context (data):\n${untrusted(renderText(renderState(state, refs)).slice(0, 8000))}`,
    `CLOs to map (data):\n${untrusted(clos.map((o) => `${o.id}: ${o.text}`).join('\n'))}`,
    `Return one mapping per CLO id: ${clos.map((o) => o.id).join(', ')}.`,
  ].join('\n\n');

  const parsed = await requestJSON('lo_plo_mapping', mappingSchema(clos.map((o) => o.id), codes), system, document, {
    validate: (out) => {
      const seen = out.mappings.map((m) => m.outcomeId);
      return [
        ...clos.filter((o) => !seen.includes(o.id)).map((o) => `${o.id}: missing mapping`),
        ...(new Set(seen).size === seen.length ? [] : ['each CLO must be mapped exactly once']),
        ...out.mappings.flatMap((m) => {
          const distinct = new Set(m.plo.map((p) => normalizePloCode(p.code)));
          const min = Math.min(MIN_PLO, codes.length);
          return distinct.size < min || distinct.size > MAX_PLO || distinct.size !== m.plo.length
            ? [`${m.outcomeId}: ${min} to ${MAX_PLO} distinct PLO codes required`] : [];
        }),
      ];
    },
  });

  return clos.map((clo, i) => {
    const mapping = parsed.mappings.find((m) => m.outcomeId === clo.id);
    const picked = [];
    for (const p of mapping.plo) {
      const code = normalizePloCode(p.code);
      if (codes.includes(code) && !picked.some((x) => x.code === code)) picked.push({ code, coverage: p.coverage, reason: p.reason });
    }
    return {
      kind: 'edit',
      severity: 'medium',
      title: `Map LO${(state.outcomes.findIndex((o) => o.id === clo.id) + 1) || i + 1} to programme outcomes`,
      description: picked.map((p) => `${p.code}${p.coverage === 'partial' ? ' (partial)' : ''}: ${p.reason}`).join('\n'),
      rationale: 'Suggested from the wording of the learning outcome; confirm or change before it is saved.',
      target: { path: `outcomes[${clo.id}].plo`, entityId: clo.id },
      value: picked.map((p) => ({ code: p.code, coverage: p.coverage, confirmed: false })),
      promptVersion: PROMPT_VERSION,
    };
  });
}

module.exports = { suggestPlo, PROMPT_VERSION };
