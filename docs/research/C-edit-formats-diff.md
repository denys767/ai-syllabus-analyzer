# C. Edit representations, suggestion models, apply algorithm, diff preview

Scope: how to represent AI edits to *prose* documents, apply them robustly when a user accepts, rejects and reopens in any order, and preview them. Stack: Node/Express, OpenAI Responses API (structured JSON), React 18.

**Evidence caveat.** Searches returned mostly docs and vendor pages. Where a number comes from a vendor or third-party summary, or I could not open the primary source, I say so. I did not retrieve current Aider leaderboard tables.

## 1. Edit formats: what the evidence says

| Format | Mechanism | Evidence | Fit for prose + mid-size model |
|---|---|---|---|
| Whole-document rewrite (Aider `whole`) | Model re-emits the doc | Aider calls it the easiest for an LLM, but token-heavy and size-limited ([Aider edit formats](https://aider.chat/docs/more/edit-formats.html)) | Reliable, but loses formatting, breaks per-suggestion accept/reject, and drifts. **No.** |
| Search/replace blocks (Aider `diff`) | Exact old text, then new text | Diff-XYZ finds search-replace good for *larger* models generating diffs, weaker for smaller models ([arXiv 2510.12487](https://arxiv.org/abs/2510.12487v2), [HF dataset](https://huggingface.co/datasets/JetBrains-Research/diff-xyz/blob/main/README.md)) | Good. Needs exact quoting, which suits prose when the quote is short. |
| Unified diff (Aider `udiff`) | `@@` hunks, `-`/`+` lines | Aider's benchmark: GPT-4 Turbo went from 20% to 61% on a "lazy coding" task ([Aider udiff post](https://aider.chat/docs/unified-diffs.html)). Its gain came from reducing lazy elision, not from anchoring. | Poor for prose. Hunks are line-oriented and prose paragraphs are single long lines. |
| Anthropic text editor `str_replace` | `old_str` must match uniquely | Uniqueness is enforced by implementations: error on 0 or >1 matches, and the model must add context ([Nous FileEdit docs](https://hexdocs.pm/nous/Nous.Tools.FileEdit.html), [ExAthena Edit docs](https://hexdocs.pm/ex_athena/ExAthena.Tools.Edit.html)). Secondary sources; I could not retrieve Anthropic's official page. | **Best conceptual match.** The quote is the anchor, and failures are detectable and fixable by retry. |
| OpenAI `apply_patch` / V4A | Context-anchored diff, no line numbers; `create/update/delete_file` ([OpenAI docs](https://developers.openai.com/api/docs/guides/tools-apply-patch), [V4A explainer](https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/)) | Models are tuned for it, but it is file-oriented and you must implement the harness | Overkill. We can reuse the idea (context anchoring) without the grammar. |
| OpenAI Predicted Outputs | `prediction` param speeds up regenerating mostly-unchanged text | Chat Completions only. Supported models listed as gpt-4o and gpt-4.1 families, not the gpt-5.x line ([docs](https://developers.openai.com/api/docs/guides/predicted-outputs)). Rejected prediction tokens are billed. | Not applicable to our model and API. |
| Cursor / Morph / Relace "fast apply" | A small model merges a lazy sketch into the file | Morph claims 96–98% accuracy and 4,500–10,500 tok/s; vendor numbers only, and they conflict ([Fly.io](https://fly.io/blog/build-better-agents-with-morphllm.md), [Morph blog](https://www.morphllm.com/blog/morph-breaks-10k-barrier)). Cursor itself uses a fine-tuned apply model ([overview](https://pashpashpash.substack.com/p/fast-apply-models-are-already-dead)). I found nothing on Relace. | Solves a *code speed* problem. Our docs are short, so skip it. |
| Line numbers (current) | `fromLine/toLine` | Fragile by construction. Any prior edit shifts the numbers, which is why you have sha1 and coalescing hacks. | **No.** |

**Prose conclusion.** The best approach is **stable block IDs for coarse location plus an exact quoted span inside the block** (str_replace semantics scoped to a block). Reasons:

- Block IDs don't shift. They are assigned at extraction and never renumbered.
- A short quote is something an LLM copies reliably. Long multi-line copying is where models drop or alter text.
- Uniqueness within a block (typically one paragraph) is cheap to guarantee.
- Failures are *detectable* (0 or >1 matches) and the error is easy to feed back to the model.

Line numbers also fail at a second level: paragraphs of prose are one logical unit, but one wrapped line can contain several sentences. Block + quote gives sub-paragraph precision that line numbers can't.

## 2. How writing tools model suggestions

| Tool | Data model | Notes |
|---|---|---|
| LanguageTool | `{offset, length, message, rule, replacements:[{value}]}` against one plain-text string ([API sample](https://language-tool-python.readthedocs.io/en/latest/_modules/language_tool_python/match.html), [forum](https://forum.languagetool.org/t/api-results-for-multiple-sentences/3253)) | Offsets are only valid against the *exact* text submitted. This is a one-shot, stateless model, and it is the same fragility as line numbers. |
| Tiptap Tracked Changes | Suggestion `{id, type, userId, createdAt, from, to, text}` ([docs](https://tiptap.dev/docs/tracked-changes/usage/basic-usage.md)) | Positions are ProseMirror integers, mapped through transactions. Experimental, paid. |
| Tiptap AI Suggestion / AI Changes | Diffs old vs new content into suggestions by "rule" ([diff view](https://tiptap.dev/docs/ai/deprecated/suggestion/features/diff-view.md)) | Deprecated in favor of AI Toolkit ([overview](https://tiptap.dev/docs/content-ai/capabilities/changes/overview.md)). Shows the pattern: LLM produces new text, *the tool* computes the diff. |
| `@handlewithcare/prosemirror-suggest-changes` | Insertion/deletion/modification **marks** in the doc; `applySuggestion`, `revertSuggestion` ([README](https://cdn.jsdelivr.net/npm/@handlewithcare/prosemirror-suggest-changes@0.1.8/README.md)) | Open source. The best reusable piece **if** we adopt a ProseMirror editor. |
| CKEditor 5 Track Changes | Suggestion markers over model ranges; AI-origin marking since v48.3 ([changelog](https://cdn.jsdelivr.net/npm/ckeditor5@48.3.0/CHANGELOG.md)) | Commercial. I did not find the marker data model in my searches. |
| Google Docs / Word | Suggestions and tracked changes are stored inside the document as ranged insert/delete revisions with author | Not verified in this research; this is from general knowledge. |

**Takeaway.** Every mature system anchors to a *position in a live document model* and re-maps it through edits. We hold the original plus a set of suggestions, so we can avoid position mapping entirely (§3).

**Reusable open-source pieces.** All plain JS, so no editor is required:

- `diff` (jsdiff) for the word-level preview.
- `diff-match-patch` for fuzzy location (`match_main`).
- `prosemirror-suggest-changes` only if we later make the preview editable. It is not needed for v1.

## 3. Applying independent suggestions in any order (recommended algorithm)

**Rebuild from original + accepted set** is the correct strategy, and the existing CLAUDE.md invariant already says so. Incremental patching needs position mapping (OT or CRDT territory), and reopen then needs inverse operations. We have neither a collaborative nor a live-editing requirement, so avoid both. The one change needed is to make the *anchors* position-independent.

**Model.** The original document is a list of blocks `{id, type, text, runs?}`, immutable after extraction. Each suggestion is a set of **operations on blocks**, and each op resolves to a character range inside one block of the *original* text:

1. **Resolve once, at generation time** (not at accept time) against the original. Store `start`/`end` in block-local offsets, plus the quote and a little context. Since the original never changes, these offsets can't go stale. The sha1 problem disappears: a re-analysis creates a new document version and new suggestions.
2. **Conflict detection.** Two suggestions conflict iff their ranges in the same block overlap (or both target the same block-level op). Compute the pairwise matrix at generation time and store `conflictsWith: [suggestionId]`.
3. **Accept** of S is refused (or flagged) if an accepted suggestion conflicts. The UI shows "conflicts with #3; reopen it first". Alternatives are to auto-reject the other one or let the user pick; I recommend refusing with an explanation, as it keeps decisions explicit.
4. **Apply** walks blocks; for each block, sort accepted ops by `start` descending (or build the output left to right) and splice. Pure and idempotent.
5. **Pure inserts** use `{anchorBlockId, position: before|after}` for new blocks, and zero-length ranges for in-block inserts. Ties at the same position are ordered by suggestion priority then id, so output is deterministic.

```
function applyAccepted(doc, suggestions):            // doc = original blocks, immutable
  ops = suggestions.filter(accepted).flatMap(s => s.ops.map(o => {...o, sid: s.id}))
  byBlock = groupBy(ops, o => o.blockId)
  out = []
  for block in doc.blocks:
    for ins in byBlock[block.id] where ins.kind == 'insertBlockBefore': out.push(newBlock(ins))
    ranged = (byBlock[block.id] ?? []).filter(o => o.kind in {replace, delete, insertText})
    assert noOverlap(ranged)                         // guaranteed by accept-time conflict check
    text = block.text; cursor = 0; buf = ''
    for o in ranged sortBy start, then (zero-length first), then sid:
      buf += text.slice(cursor, o.start) + (o.kind == 'delete' ? '' : o.newText)
      cursor = o.end
    buf += text.slice(cursor)
    if any op is deleteBlock: skip block else out.push({...block, text: buf})
    for ins in byBlock[block.id] where ins.kind == 'insertBlockAfter': out.push(newBlock(ins))
  return out
```

**Resolving a quote to a range (generation time, original text).** Run in order:

1. Exact match of `quote` in `block.text`. If exactly 1, done.
2. If >1 matches, use `prefix`/`suffix` (≈20 chars each) to disambiguate. If still ambiguous, **reject and retry** (§4).
3. Whitespace/unicode-normalized match (NFC, collapse spaces, normalize quotes and dashes), with an index map back to original offsets.
4. Fuzzy fallback with diff-match-patch `match_main(text, quote, loc)` (Bitap). Accept only if `Match_Threshold ≤ 0.2` (stricter than the 0.5 default) **and** quote length ≤ 32 chars (Bitap's limit is the pattern length, `Match_MaxBits` = 32). For longer quotes, fuzzy-match the first and last 32 chars and require the span between them to be in a plausible length range. If the fuzzy match is used, mark `anchorConfidence: 'fuzzy'` and show it in the UI.
5. Otherwise fail, and send the error back to the model.

I have not benchmarked these thresholds on our data. Treat them as starting values and tune on real syllabi.

**Why not CRDT/OT.** There is a single editor per document and decisions are a *set*, not a log of concurrent edits. OT or CRDTs would solve a problem we don't have, and they make reopen harder. The only "OT-lite" we need is non-overlap at accept time.

**Reopen.** Remove the suggestion from the accepted set and rebuild. Nothing else to undo.

## 4. Validation and self-repair

1. **Structured outputs.** Use OpenAI strict JSON Schema in the Responses API (`text.format: {type:'json_schema', strict:true}`); strict mode requires `additionalProperties:false` and all fields in `required` (optional = nullable union). This guarantees *shape*, not that the quote exists. I'm stating the strict-mode constraints from general knowledge; they were not re-verified in this run.
2. **Semantic validation** (server side), for each op:
   - `blockId` exists.
   - The quote resolves to exactly one range (§3).
   - Ranges don't overlap inside the same suggestion.
   - `newText` is non-empty for replace/insert, and has no markdown artifacts if the writer is plain.
3. **Retry with error feedback.** On failure, send one follow-up turn per suggestion (not the whole analysis): the failing op plus a precise error, plus the block text. Examples: `quote not found in block B12; block text is: "…"`, or `quote matches 3 times in B12; extend it with surrounding words`. Cap at 2 retries, then drop the suggestion's applicability (the card is shown as advisory, with no Confirm button, matching the existing "no beforeAfter payload → no Confirm" rule).
4. **Prevent the model from re-quoting at all where possible.** For replacements of a whole block, `blockId` alone is enough: `{op:'replaceBlock'}` needs no quote. Use quotes only for sub-block edits.
5. **Telemetry.** Log first-try exact-match rate, retry rate and fuzzy-fallback rate. These tell you whether to change the prompt or block granularity.

## 5. Diff preview for prose

| Option | Pros | Cons |
|---|---|---|
| jsdiff `diffWords` / `diffWordsWithSpace` | Readable word-level output, small, Node + browser | No semantic cleanup, so it can show choppy fragments |
| diff-match-patch `diff_main` + `diff_cleanupSemantic` | Char-level with semantic merging of tiny equalities, so it avoids "confetti" diffs | Char-level output needs cleanup, and the API is dated |
| `redlines` (Python) | Nice markdown redlines | Wrong runtime |
| Side-by-side | Good for long rewrites | Poor on narrow chat panels |

**Recommendation.**

- **Per-suggestion card:** inline word-level diff via jsdiff (`<del>` red, `<ins>` green) computed from the block's original text vs the block text with *only that suggestion* applied. For heavy rewrites, where the change ratio is over ~60%, switch to a before/after stack rather than a confetti inline diff.
- **Whole-document preview:** render `applyAccepted(doc, accepted)` and diff each *changed block* against its original, in block order. Unchanged blocks render plainly. This is cheap since only changed blocks are diffed. Because the diff is computed by us from original and result, **the LLM never writes markup**.
- **React:** a small `<DiffText ops={...}/>` mapping jsdiff parts to `<ins>/<del>` with MUI theme colors. Memoize by `(blockId, suggestionSetHash)`. No heavy editor is needed.
- **Pending vs accepted in the same view:** optionally show accepted changes as green/red and the currently focused pending suggestion in a different color (e.g. blue), by applying it virtually.

## 6. Concrete design for our stack

### Suggestion schema (stored in Mongo, and used as the strict LLM output schema)

```jsonc
{
  "id": "s_01",                       // server-assigned
  "recommendationId": "r_12",
  "ops": [
    {
      "kind": "replaceSpan",          // replaceSpan | deleteSpan | insertText | replaceBlock | deleteBlock | insertBlockAfter | insertBlockBefore
      "blockId": "b_0042",            // stable, assigned at extraction
      "quote": "Attendance is optional",   // exact text from the block; null for block-level ops
      "prefix": "…", "suffix": "…",   // optional disambiguators (<= 24 chars)
      "newText": "Attendance is mandatory for sessions marked *",
      "newBlockType": null            // for inserts: paragraph | heading | list_item
    }
  ],
  "rationale": "…",
  "options": []                       // choice / case-cards: each option has its own ops[]
}
```

Fields the *server* adds after resolution (not requested from the model):

```jsonc
{ "resolved": [{ "blockId": "b_0042", "start": 118, "end": 140, "confidence": "exact|normalized|fuzzy" }],
  "conflictsWith": ["s_07"], "docVersion": "<hash of original, immutable>" }
```

Extraction produces `blocks[{id, type, text, runs?}]`. IDs are sequential and never reused. The LLM prompt shows `[b_0042] paragraph text…`. This replaces the `0042| ` line numbers.

### Flow

1. **Extract:** format reader produces blocks (IDs fixed).
2. **Analyze:** unchanged.
3. **Edit generation:** LLM returns ops per the schema, then `resolveOps` (§3 quote resolution), then validation, then retry-with-feedback (§4). Then `computeConflicts`.
4. **Chat:** accept/reject toggles the set. Accept calls `checkConflicts`, and reopen removes from the set.
5. **Preview/final:** `applyAccepted` yields the result blocks; the diff comes from jsdiff.

### Interface for per-format writers (DOCX and others, researched elsewhere)

```ts
interface Suggestion { id; ops: ResolvedOp[]; author: 'AI'; rationale }
interface ResolvedOp { kind; blockId; start; end; quote; newText; newBlockType? }  // offsets are into the ORIGINAL block text

interface FormatWriter {
  // clean output: apply accepted set, no markup
  renderFinal(original: Source, accepted: Suggestion[]): Buffer
  // tracked-changes output: each accepted suggestion becomes a revision
  renderTracked(original: Source, accepted: Suggestion[]): Buffer
}
// Writers locate the block via blockId -> source node map built at extraction, then act on [start,end)
// of the block's flattened text. They must map those offsets onto runs (DOCX w:r), preserving run formatting.
```

Contract: the extraction step keeps a `blockId → source node` map and the block's flattened text, so the writer receives *exact quote + offsets* and can verify `block.text.slice(start,end) === quote` before writing. A mismatch is a bug, and the writer should throw.

### Migration notes against the current code

- `lineDoc.js` → `blockDoc.js` (blocks, IDs, hash of the original). `sha1` stays only as the immutable *original* version, so `STALE_DOC_VERSION` only triggers on re-upload.
- `applyEdits.js` coalescing and overlap hacks → `computeConflicts` at generation time plus a pure `applyAccepted`.
- `editGenerator.js` prompt: swap `NNN| line` for `[b_id] text`; ask for quotes ≤ 12 words; the schema above.
- `revisionMarkup.js` → React diff from jsdiff, plus a server-side equivalent (same library) for the PDF revision report.
- Plain-text extraction of PDFs loses block structure. Block IDs there will be paragraph-ish splits, so extraction quality caps the result. This is the main risk and is outside this topic.

## Recommendation summary

1. Drop line numbers. Use **stable block IDs + exact quoted spans** (str_replace semantics scoped per block).
2. Resolve the quote **once against the immutable original**; store block-local offsets.
3. Detect overlaps at generation time and refuse conflicting accepts.
4. Always **rebuild from original + accepted set**; reopen means removing from the set.
5. Strict JSON schema, then semantic validation, then error-feedback retries (max 2), then drop the Confirm button.
6. Diff by jsdiff computed in code, never written by the LLM; inline word diff in cards and a changed-blocks-only full preview.

## Sources

- Aider: [edit formats](https://aider.chat/docs/more/edit-formats.html), [unified diffs](https://aider.chat/docs/unified-diffs.html)
- Diff-XYZ: [arXiv](https://arxiv.org/abs/2510.12487v2), [dataset](https://huggingface.co/datasets/JetBrains-Research/diff-xyz/blob/main/README.md)
- OpenAI: [apply_patch](https://developers.openai.com/api/docs/guides/tools-apply-patch), [Predicted Outputs](https://developers.openai.com/api/docs/guides/predicted-outputs), [V4A explainer](https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/)
- str_replace behavior: [Nous FileEdit](https://hexdocs.pm/nous/Nous.Tools.FileEdit.html), [ExAthena Edit](https://hexdocs.pm/ex_athena/ExAthena.Tools.Edit.html)
- Morph / Cursor: [Fly.io](https://fly.io/blog/build-better-agents-with-morphllm.md), [Morph](https://www.morphllm.com/blog/morph-breaks-10k-barrier), [overview](https://pashpashpash.substack.com/p/fast-apply-models-are-already-dead)
- LanguageTool: [match model](https://language-tool-python.readthedocs.io/en/latest/_modules/language_tool_python/match.html), [forum](https://forum.languagetool.org/t/api-results-for-multiple-sentences/3253)
- Tiptap: [tracked changes](https://tiptap.dev/docs/tracked-changes/usage/basic-usage.md), [AI changes](https://tiptap.dev/docs/content-ai/capabilities/changes/overview.md), [diff view](https://tiptap.dev/docs/ai/deprecated/suggestion/features/diff-view.md)
- ProseMirror: [prosemirror-suggest-changes](https://cdn.jsdelivr.net/npm/@handlewithcare/prosemirror-suggest-changes@0.1.8/README.md)
- CKEditor 5: [changelog 48.3.0](https://cdn.jsdelivr.net/npm/ckeditor5@48.3.0/CHANGELOG.md)

Not searched or verified: jsdiff and diff-match-patch API details (stated from general knowledge), Google Docs/Word internals, Notion AI, Lexical, Relace.
