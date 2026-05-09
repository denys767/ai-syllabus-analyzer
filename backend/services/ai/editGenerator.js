const { createResponse, safeParseJSON, clipText, llmModel } = require('./client');
const {
  buildSyllabusContextBlock,
  MAX_AFTER_CHARS,
} = require('./constants');
const {
  toLineDoc,
  renderLineNumbered,
  normalizeEdit,
  validateEdits,
  joinBeforeText,
  joinAfterText,
} = require('./lineDoc');

const MAX_NUMBERED_DOC_CHARS = 350_000;

const EDIT_PROTOCOL = `EDIT PROTOCOL — read carefully:
- Each recommendation must produce one or more "edits". Edits reference syllabus lines by NUMBER (the prefix before "|" on each numbered line).
- Allowed actions: "replace", "delete", "insertAfter", "insertBefore", "appendDoc".
  - "replace": { "action": "replace", "fromLine": N, "toLine": M, "newText": "..." } — replaces lines N..M (inclusive) with newText.
  - "delete":  { "action": "delete",  "fromLine": N, "toLine": M } — deletes lines N..M.
  - "insertAfter":  { "action": "insertAfter",  "afterLine": N,  "newText": "..." } — inserts newText after line N (use 0 to insert at the very top).
  - "insertBefore": { "action": "insertBefore", "beforeLine": N, "newText": "..." } — inserts newText before line N.
  - "appendDoc": { "action": "appendDoc", "newText": "..." } — appends newText at the end of the document.
- DO NOT quote syllabus text in your output. Use line numbers only — the system reconstructs the original text from those lines.
- Make sure changes don't conflict with each other. For example, if you replace lines 10-12 with new text, you cannot have another edit that also modifies lines 10-12 or inserts text at line 10, 11, or 12.
- newText is the FINAL text the syllabus should contain (not a diff). Multi-line newText is allowed via "\\n".
- Edit ranges within ONE recommendation must NOT overlap.
- Do NOT invent dates, instructor names, grading weights, required readings, or case titles unless implied by the syllabus or recommendation.
- newText must conform to the KSE syllabus template structure.`;

function buildIssueListBlock(recs) {
  return recs.map((rec, idx) => [
    `RECOMMENDATION ${idx + 1}`,
    `recommendationId: ${rec.id}`,
    `category: ${rec.category || 'other'}`,
    `priority: ${rec.priority || 'medium'}`,
    `title: ${rec.title || ''}`,
    `description: ${rec.description || ''}`,
  ].join('\n')).join('\n\n');
}

/**
 * Map a kind-specific result from the LLM into a stored beforeAfter payload.
 */
function buildBeforeAfterPayload({ rec, doc, parsed }) {
  const docVersion = doc.sha1;
  const kind = (parsed && parsed.kind) || (
    rec.category === 'policy' ? 'choice'
      : rec.category === 'cases' ? 'case-cards'
      : 'before-after'
  );

  if (kind === 'choice') {
    const rawOptions = Array.isArray(parsed.options) ? parsed.options.slice(0, 3) : [];
    const options = [];
    for (let i = 0; i < rawOptions.length; i += 1) {
      const o = rawOptions[i];
      const edits = (Array.isArray(o.edits) ? o.edits : []).map(normalizeEdit).filter(Boolean);
      const v = validateEdits(edits, doc);
      if (!v.ok) continue;
      options.push({
        id: String(o.id || `option_${i + 1}`).trim(),
        label: String(o.label || `Option ${i + 1}`).trim(),
        rationale: String(o.rationale || '').trim(),
        edits,
      });
    }
    if (!options.length) return null;
    const primary = options[0];
    return {
      kind: 'choice',
      before: clipText(joinBeforeText(doc, primary.edits), MAX_AFTER_CHARS),
      after: clipText(joinAfterText(primary.edits), MAX_AFTER_CHARS),
      payload: {
        source: 'line-edits',
        docVersion,
        options,
        appliedSelection: null,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  if (kind === 'case-cards') {
    const rawCards = Array.isArray(parsed.cards) ? parsed.cards.slice(0, 5) : [];
    const cards = [];
    for (let i = 0; i < rawCards.length; i += 1) {
      const c = rawCards[i];
      const edits = (Array.isArray(c.edits) ? c.edits : []).map(normalizeEdit).filter(Boolean);
      const v = validateEdits(edits, doc);
      if (!v.ok || !String(c.title || '').trim()) continue;
      cards.push({
        id: String(c.id || `case_${i + 1}`).trim(),
        title: String(c.title || '').trim(),
        sourceLabel: String(c.sourceLabel || c.source || '').trim(),
        sourceUrl: String(c.sourceUrl || c.url || '').trim(),
        fitLabel: String(c.fitLabel || 'Good fit').trim(),
        summary: clipText(c.summary || '', MAX_AFTER_CHARS),
        previewText: clipText(c.previewText || c.summary || '', MAX_AFTER_CHARS),
        edits,
      });
    }
    if (!cards.length) return null;
    const primary = cards[0];
    return {
      kind: 'case-cards',
      before: clipText(joinBeforeText(doc, primary.edits), MAX_AFTER_CHARS),
      after: clipText(joinAfterText(primary.edits), MAX_AFTER_CHARS),
      payload: {
        source: 'line-edits',
        docVersion,
        week: parsed.week || null,
        cards,
        appliedSelection: null,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // before-after
  const edits = (Array.isArray(parsed.edits) ? parsed.edits : []).map(normalizeEdit).filter(Boolean);
  const v = validateEdits(edits, doc);
  if (!v.ok) return null;
  return {
    kind: 'before-after',
    before: clipText(joinBeforeText(doc, edits), MAX_AFTER_CHARS),
    after: clipText(joinAfterText(edits), MAX_AFTER_CHARS),
    payload: {
      source: 'line-edits',
      docVersion,
      edits,
      appliedSelection: null,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Build a batched prompt for non-case recommendations.
 */
function buildStandardPrompt(recs, doc) {
  return `You are Professor's Tutor — generate line-anchored edits to a KSE MBA syllabus for every recommendation below.

${buildSyllabusContextBlock()}

${EDIT_PROTOCOL}

KIND-SPECIFIC OUTPUT REQUIREMENTS:
- For category "policy": kind = "choice"; produce exactly 3 distinct options. Each option carries its own "edits" array (typically a single insertAfter or replace) representing the drop-in policy text.
- For all other categories: kind = "before-after"; produce one "edits" array containing the change(s) for that recommendation.

If the recommendation concerns a section that is missing from the syllabus, use insertAfter / insertBefore / appendDoc to add it at an appropriate location. Pick the line number that makes sense topically (e.g. add policies near other policies).

LINE-NUMBERED SYLLABUS (lines are prefixed by their number followed by "|"):
${renderLineNumbered(doc)}

RECOMMENDATIONS:
${buildIssueListBlock(recs)}

Return ONLY a JSON object of the form:
{
  "results": [
    {
      "recommendationId": "<id from input>",
      "kind": "before-after" | "choice",
      "rationale": "one sentence",
      "edits": [ /* for kind=before-after */ ],
      "options": [ /* for kind=choice; 3 entries with id,label,rationale,edits */ ]
    }
  ]
}

There must be exactly one result per recommendationId.`;
}

function buildCasePrompt(recs, doc, syllabusTitle) {
  return `You are Professor's Tutor — recommend practical business cases for an MBA syllabus, using live web search.

${buildSyllabusContextBlock()}

${EDIT_PROTOCOL}

KIND-SPECIFIC REQUIREMENTS for category "cases":
- kind = "case-cards".
- Use web search to find concrete published case studies (Harvard Business Publishing, Ivey, INSEAD, Stanford, MIT Sloan, Berkeley Haas, or reputable open business school collections). Provide a real source URL when available. Do not use cases from syllabus
- Produce 3-5 case cards per recommendation.
- Each card includes: id, title, sourceLabel, sourceUrl, fitLabel, summary, previewText, AND its own "edits" array. The card's edits insert (insertAfter / appendDoc) syllabus-ready text describing the case in the relevant week/session.

Course context: ${syllabusTitle || 'Untitled course'}

LINE-NUMBERED SYLLABUS (lines are prefixed by their number followed by "|"):
${renderLineNumbered(doc)}

RECOMMENDATIONS:
${buildIssueListBlock(recs)}

Return ONLY a JSON object of the form:
{
  "results": [
    {
      "recommendationId": "<id>",
      "kind": "case-cards",
      "rationale": "one sentence",
      "week": "Week label or null",
      "cards": [
        {
          "id": "case_1",
          "title": "Case title",
          "sourceLabel": "Publisher",
          "sourceUrl": "https://...",
          "fitLabel": "Good fit",
          "summary": "Why this case fits",
          "previewText": "Readable summary",
          "edits": [ /* insertAfter or appendDoc with the syllabus-ready insertion text */ ]
        }
      ]
    }
  ]
}

There must be exactly one result per recommendationId.`;
}

async function callBatch({ prompt, system, useWebSearch }) {
  const params = {
    model: llmModel,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  };
  if (useWebSearch) {
    params.tools = [{ type: 'web_search_preview' }];
  } else {
    params.text = { format: { type: 'json_object' } };
  }
  const resp = await createResponse(params);
  return safeParseJSON(resp.output_text || '{}') || {};
}

function tooLargeForBatch(doc) {
  return renderLineNumbered(doc).length > MAX_NUMBERED_DOC_CHARS;
}

/**
 * Generate beforeAfter payloads for an array of recommendations. Mutates
 * `recs` in place by setting `rec.beforeAfter` for each successfully generated
 * recommendation. Returns the same array.
 */
async function generateEditsForRecs(syllabus, recs) {
  if (!Array.isArray(recs) || !recs.length) return recs || [];

  const original = String(syllabus.extractedText || '');
  const doc = toLineDoc(original);
  if (!doc.totalLines) return recs;

  const standardRecs = recs.filter((r) => r.category !== 'cases');
  const caseRecs = recs.filter((r) => r.category === 'cases');

  if (tooLargeForBatch(doc)) {
    // Per-rec fallback when the doc is too large for a batched prompt.
    for (const rec of recs) {
      try {
        await regenerateForRec(syllabus, rec);
      } catch (err) {
        console.error(`generateEditsForRecs: per-rec generation failed for ${rec.id}:`, err.message);
      }
    }
    return recs;
  }

  if (standardRecs.length) {
    try {
      const parsed = await callBatch({
        system: 'You generate line-anchored syllabus edits. Return ONLY valid JSON.',
        prompt: buildStandardPrompt(standardRecs, doc),
        useWebSearch: false,
      });
      applyBatchResults(parsed.results, standardRecs, doc);
    } catch (err) {
      console.error('generateEditsForRecs standard batch failed:', err.message);
    }
  }

  if (caseRecs.length) {
    try {
      const parsed = await callBatch({
        system: 'You generate grounded case recommendations with line-anchored syllabus edits. Use web search and return ONLY valid JSON. No markdown.',
        prompt: buildCasePrompt(caseRecs, doc, syllabus.title || syllabus.course?.name),
        useWebSearch: true,
      });
      applyBatchResults(parsed.results, caseRecs, doc);
    } catch (err) {
      console.error('generateEditsForRecs case batch failed:', err.message);
    }
  }

  // Per-rec fallback for anything still missing.
  for (const rec of recs) {
    if (rec.beforeAfter) continue;
    try {
      await regenerateForRec(syllabus, rec);
    } catch (err) {
      console.error(`generateEditsForRecs fallback failed for ${rec.id}:`, err.message);
    }
  }

  return recs;
}

function applyBatchResults(results, recs, doc) {
  if (!Array.isArray(results)) return;
  const byId = new Map();
  for (const r of results) {
    const id = String(r.recommendationId || r.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, r);
  }
  for (const rec of recs) {
    const parsed = byId.get(String(rec.id));
    if (!parsed) continue;
    const payload = buildBeforeAfterPayload({ rec, doc, parsed });
    if (payload) rec.beforeAfter = payload;
  }
}

/**
 * Generate a single rec's beforeAfter payload. Mutates `rec` in place.
 */
async function regenerateForRec(syllabus, rec) {
  const doc = toLineDoc(String(syllabus.extractedText || ''));
  if (!doc.totalLines) {
    throw new Error('Syllabus has no extracted text');
  }

  const isCases = rec.category === 'cases';
  const params = isCases
    ? {
      system: 'You generate grounded case recommendations with line-anchored syllabus edits. Use web search and return ONLY valid JSON. No markdown.',
      prompt: buildCasePrompt([rec], doc, syllabus.title || syllabus.course?.name),
      useWebSearch: true,
    }
    : {
      system: 'You generate line-anchored syllabus edits. Return ONLY valid JSON.',
      prompt: buildStandardPrompt([rec], doc),
      useWebSearch: false,
    };

  const parsed = await callBatch(params);
  const result = Array.isArray(parsed.results) && parsed.results[0];
  if (!result) {
    throw new Error('LLM returned no result for recommendation');
  }
  const payload = buildBeforeAfterPayload({ rec, doc, parsed: result });
  if (!payload) {
    throw new Error('LLM returned invalid edits');
  }
  rec.beforeAfter = payload;
  return rec;
}

module.exports = {
  generateEditsForRecs,
  regenerateForRec,
};
