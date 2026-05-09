const {
  toLineDoc,
  applyEdits: applyEditsToDoc,
  validateEdits,
  primaryAnchor,
  editRange,
  normalizeEdit,
} = require('./lineDoc');
const { revisionDiffToMarkup, refineRevisionMarkup } = require('./revisionMarkup');
const {
  REV_DEL_OPEN,
  REV_DEL_CLOSE,
  REV_ADD_OPEN,
  REV_ADD_CLOSE,
} = require('./constants');

function rangesOverlap(a, b) {
  return a && b && a.from <= b.to && b.from <= a.to;
}

function mergeText(first, second) {
  return [first, second]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function coalesceKey(edit) {
  if (edit.action === 'insertAfter') return `insertAfter:${edit.afterLine}`;
  if (edit.action === 'insertBefore') return `insertBefore:${edit.beforeLine}`;
  if (edit.action === 'appendDoc') return 'appendDoc';
  if (edit.action === 'replace') return `replace:${edit.fromLine}:${edit.toLine}`;
  return null;
}

function coalesceCaseCardEdits(edits) {
  const result = [];
  const mergeable = new Map();

  for (const edit of edits) {
    const key = coalesceKey(edit);
    if (!key) {
      result.push(edit);
      continue;
    }

    const existing = mergeable.get(key);
    if (existing) {
      existing.newText = mergeText(existing.newText, edit.newText);
      continue;
    }

    const copy = { ...edit };
    mergeable.set(key, copy);
    result.push(copy);
  }

  return result;
}

function resolveEditsForRec(rec, selection) {
  const ba = rec && rec.beforeAfter;
  if (!ba || !ba.payload || ba.payload.source !== 'line-edits') return [];
  const sel = selection || ba.payload.appliedSelection || {};

  let raw = [];
  if (ba.kind === 'choice') {
    const optionId = sel.optionId || (ba.payload.options || [])[0]?.id;
    const option = (ba.payload.options || []).find((o) => String(o.id) === String(optionId));
    raw = (option && option.edits) || [];
    if (sel.customText && raw.length) {
      raw = raw.map((edit) => (
        edit.action === 'delete' ? edit : { ...edit, newText: String(sel.customText) }
      ));
    }
  } else if (ba.kind === 'case-cards') {
    const fallbackId = (ba.payload.cards || [])[0]?.id;
    const selectedIds = Array.isArray(sel.caseIds) && sel.caseIds.length
      ? sel.caseIds
      : [sel.caseId || fallbackId].filter(Boolean);
    const cardsById = new Map((ba.payload.cards || []).map((card) => [String(card.id), card]));
    const selectedCards = [];
    const seen = new Set();
    for (const id of selectedIds) {
      const key = String(id);
      if (seen.has(key)) continue;
      const card = cardsById.get(key);
      if (!card) continue;
      seen.add(key);
      selectedCards.push(card);
    }
    raw = coalesceCaseCardEdits(
      selectedCards.flatMap((card) => card.edits || []).map(normalizeEdit).filter(Boolean)
    );
    return raw;
  } else {
    raw = ba.payload.edits || [];
  }
  return raw.map(normalizeEdit).filter(Boolean);
}

function buildRevisionMarkupFromEdits(doc, edits) {
  // Splice each edit's marked-up replacement into the line list, in reverse
  // anchor order so earlier indices remain valid.
  const sorted = edits.slice().sort((a, b) => primaryAnchor(b) - primaryAnchor(a));
  const lines = doc.lines.slice();

  for (const edit of sorted) {
    if (edit.action === 'replace') {
      const beforeText = lines.slice(edit.fromLine - 1, edit.toLine).join('\n');
      const wrapped = revisionDiffToMarkup(beforeText, String(edit.newText));
      lines.splice(edit.fromLine - 1, edit.toLine - edit.fromLine + 1, wrapped);
    } else if (edit.action === 'delete') {
      const beforeText = lines.slice(edit.fromLine - 1, edit.toLine).join('\n');
      const wrapped = `${REV_DEL_OPEN}${beforeText}${REV_DEL_CLOSE}`;
      lines.splice(edit.fromLine - 1, edit.toLine - edit.fromLine + 1, wrapped);
    } else if (edit.action === 'insertAfter') {
      const wrapped = `${REV_ADD_OPEN}${String(edit.newText)}${REV_ADD_CLOSE}`;
      lines.splice(edit.afterLine, 0, wrapped);
    } else if (edit.action === 'insertBefore') {
      const wrapped = `${REV_ADD_OPEN}${String(edit.newText)}${REV_ADD_CLOSE}`;
      lines.splice(edit.beforeLine - 1, 0, wrapped);
    } else if (edit.action === 'appendDoc') {
      const wrapped = `${REV_ADD_OPEN}${String(edit.newText)}${REV_ADD_CLOSE}`;
      lines.push(wrapped);
    }
  }
  return lines.join('\n');
}

function gatherValidEdits(syllabus, predicate) {
  const original = String(syllabus.extractedText || '');
  const doc = toLineDoc(original);
  const recs = (syllabus.recommendations || []).filter(predicate);

  const validEdits = [];
  const skipped = [];
  for (const rec of recs) {
    const docVersion = rec.beforeAfter && rec.beforeAfter.payload && rec.beforeAfter.payload.docVersion;
    if (docVersion && docVersion !== doc.sha1) {
      skipped.push({ rec, reason: 'STALE_DOC_VERSION' });
      continue;
    }
    const edits = resolveEditsForRec(rec, rec.beforeAfter && rec.beforeAfter.payload && rec.beforeAfter.payload.appliedSelection);
    if (!edits.length) {
      skipped.push({ rec, reason: 'NO_EDITS' });
      continue;
    }
    const result = validateEdits(edits, doc);
    if (!result.ok) {
      skipped.push({ rec, reason: result.reason });
      continue;
    }
    // Filter out edits that overlap edits already taken from previous recs.
    const filtered = [];
    for (const edit of edits) {
      const range = editRange(edit);
      if (range) {
        const conflict = validEdits.some((existing) => {
          const r2 = editRange(existing);
          return r2 && rangesOverlap(range, r2);
        });
        if (conflict) {
          skipped.push({ rec, reason: 'CROSS_REC_OVERLAP' });
          continue;
        }
      }
      filtered.push(edit);
    }
    validEdits.push(...filtered);
  }
  return { doc, edits: validEdits, skipped };
}

/**
 * Build the canonical { editedText, revisionMarkup } from the original
 * extractedText plus all accepted recommendations' edits. Idempotent: callable
 * any time, always returns the same result for the same syllabus state.
 */
function buildAcceptedState(syllabus) {
  const { doc, edits } = gatherValidEdits(
    syllabus,
    (r) => r.decision === 'accepted' && r.beforeAfter && r.beforeAfter.payload && r.beforeAfter.payload.source === 'line-edits'
  );

  if (!edits.length) {
    return {
      editedText: String(syllabus.extractedText || ''),
      revisionMarkup: '',
    };
  }

  const editedText = applyEditsToDoc(doc, edits);
  const rawMarkup = buildRevisionMarkupFromEdits(doc, edits);
  const revisionMarkup = refineRevisionMarkup(rawMarkup);
  return { editedText, revisionMarkup };
}

/**
 * Build a one-rec preview markup: applies all accepted recs PLUS the target rec
 * (using `selectionOverride` if provided) to the original extractedText.
 */
function buildSingleRecPreviewMarkup(syllabus, targetRecId, selectionOverride = null) {
  const original = String(syllabus.extractedText || '');
  const doc = toLineDoc(original);

  const targetRec = (syllabus.recommendations || []).find((r) => r.id === targetRecId);
  if (!targetRec) {
    const err = new Error(`Recommendation ${targetRecId} not found`);
    err.statusCode = 404;
    throw err;
  }
  if (!targetRec.beforeAfter || !targetRec.beforeAfter.payload || targetRec.beforeAfter.payload.source !== 'line-edits') {
    const err = new Error('Recommendation does not have a previewable change');
    err.statusCode = 409;
    throw err;
  }

  // 1) Gather edits from already-accepted recs (excluding the target).
  const acceptedState = gatherValidEdits(
    syllabus,
    (r) => r.id !== targetRecId
      && r.decision === 'accepted'
      && r.beforeAfter
      && r.beforeAfter.payload
      && r.beforeAfter.payload.source === 'line-edits'
  );

  // 2) Resolve the target rec's edits.
  const targetSelection = selectionOverride
    || (targetRec.beforeAfter.payload.appliedSelection)
    || null;
  const targetEdits = resolveEditsForRec(targetRec, targetSelection);
  if (!targetEdits.length) {
    const err = new Error('Recommendation has no edits to preview');
    err.statusCode = 409;
    throw err;
  }
  const targetVersion = targetRec.beforeAfter.payload.docVersion;
  if (targetVersion && targetVersion !== doc.sha1) {
    const err = new Error('Syllabus text has changed since this recommendation was generated; please re-analyze');
    err.statusCode = 409;
    err.code = 'STALE_DOC_VERSION';
    throw err;
  }
  const targetCheck = validateEdits(targetEdits, doc);
  if (!targetCheck.ok) {
    const err = new Error(`Recommendation edits are invalid: ${targetCheck.reason}`);
    err.statusCode = 409;
    throw err;
  }

  // 3) Drop any accepted edit that overlaps the target's range so we visualize
  //    the target cleanly. Then build markup from the union.
  const targetRanges = targetEdits.map(editRange).filter(Boolean);
  const acceptedNonConflicting = acceptedState.edits.filter((edit) => {
    const r = editRange(edit);
    if (!r) return true;
    return !targetRanges.some((tr) => rangesOverlap(r, tr));
  });

  const allEdits = [...acceptedNonConflicting, ...targetEdits];
  const rawMarkup = buildRevisionMarkupFromEdits(doc, allEdits);
  return refineRevisionMarkup(rawMarkup);
}

/**
 * Build a target-only preview. Unlike buildSingleRecPreviewMarkup, this omits
 * all already-accepted edits so Preview shows exactly the new change under
 * review and nothing else.
 */
function buildSingleRecPreviewState(syllabus, targetRecId, selectionOverride = null) {
  const original = String(syllabus.extractedText || '');
  const doc = toLineDoc(original);

  const targetRec = (syllabus.recommendations || []).find((r) => r.id === targetRecId);
  if (!targetRec) {
    const err = new Error(`Recommendation ${targetRecId} not found`);
    err.statusCode = 404;
    throw err;
  }
  if (!targetRec.beforeAfter || !targetRec.beforeAfter.payload || targetRec.beforeAfter.payload.source !== 'line-edits') {
    const err = new Error('Recommendation does not have a previewable change');
    err.statusCode = 409;
    throw err;
  }

  const targetSelection = selectionOverride
    || (targetRec.beforeAfter.payload.appliedSelection)
    || null;
  const targetEdits = resolveEditsForRec(targetRec, targetSelection);
  if (!targetEdits.length) {
    const err = new Error('Recommendation has no edits to preview');
    err.statusCode = 409;
    throw err;
  }
  const targetVersion = targetRec.beforeAfter.payload.docVersion;
  if (targetVersion && targetVersion !== doc.sha1) {
    const err = new Error('Syllabus text has changed since this recommendation was generated; please re-analyze');
    err.statusCode = 409;
    err.code = 'STALE_DOC_VERSION';
    throw err;
  }
  const targetCheck = validateEdits(targetEdits, doc);
  if (!targetCheck.ok) {
    const err = new Error(`Recommendation edits are invalid: ${targetCheck.reason}`);
    err.statusCode = 409;
    throw err;
  }

  const rawMarkup = buildRevisionMarkupFromEdits(doc, targetEdits);
  return {
    originalText: original,
    previewText: applyEditsToDoc(doc, targetEdits),
    revisionMarkup: refineRevisionMarkup(rawMarkup),
    selection: targetSelection || {},
  };
}

/**
 * After accepting/rejecting a rec, recompute editedText + revisionMarkup from
 * the original. Mutates `syllabus` in place but does not save.
 */
function recomputeSyllabusState(syllabus) {
  const { editedText, revisionMarkup } = buildAcceptedState(syllabus);
  syllabus.editedText = editedText;
  syllabus.revisionMarkup = revisionMarkup;
}

function validateRecEdits(syllabus, rec, selection = null) {
  if (!rec || !rec.beforeAfter || !rec.beforeAfter.payload) {
    return { ok: false, reason: 'missing previewable edits' };
  }
  if (rec.beforeAfter.payload.source !== 'line-edits') {
    return { ok: false, reason: 'unsupported edit source' };
  }
  const original = String(syllabus.extractedText || '');
  const doc = toLineDoc(original);
  if (rec.beforeAfter.payload.docVersion && rec.beforeAfter.payload.docVersion !== doc.sha1) {
    return { ok: false, reason: 'stale document version', code: 'STALE_DOC_VERSION' };
  }
  const effectiveSelection = selection || rec.beforeAfter.payload.appliedSelection;
  const edits = resolveEditsForRec(rec, effectiveSelection);
  if (!edits.length) return { ok: false, reason: 'no edits' };
  const result = validateEdits(edits, doc);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, edits };
}

/**
 * Used by workspaceService to check whether a rec can still be applied.
 */
function isRecApplicable(syllabus, rec, selection = null) {
  return validateRecEdits(syllabus, rec, selection).ok;
}

module.exports = {
  resolveEditsForRec,
  validateRecEdits,
  buildRevisionMarkupFromEdits,
  buildAcceptedState,
  buildSingleRecPreviewMarkup,
  buildSingleRecPreviewState,
  recomputeSyllabusState,
  isRecApplicable,
};
