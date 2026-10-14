# A. Format-preserving DOCX editing with tracked changes

Research date: 2026-10-14. GitHub/npm numbers were pulled live via `gh api` / `npm view`. Anything marked **[unverified]** comes from general knowledge or a thin search result, not from a primary source.

## TL;DR

- **Edit the original OOXML in place** (unzip → patch `word/document.xml` → rezip). Do not go through text → markdown → PDF.
- Emit **real `w:ins` / `w:del`** (plus optional `w:comment`) at *run* level, one revision group per accepted recommendation. This is what Anthropic's docx skill and Adeu do.
- **Node can do all of it.** `@adeu/core` (MIT, TypeScript) already implements text-anchored tracked edits; alternatively, write ~300 lines on `jszip` + an XML parser. No .NET or Python is required for *applying* edits.
- A **LibreOffice sidecar is worth it anyway**, for `.doc → .docx` conversion and for a faithful PDF of the redline. Neither has a good pure-Node substitute.
- **Preview:** `docx-preview` (`renderChanges: true`) is the cheapest in-browser option. A LibreOffice-rendered PDF is the faithful one.
- **PPTX is a separate problem.** PowerPoint has no w:ins/w:del-style tracked changes (only comments and "Compare"). **[unverified, general knowledge]** Treat PPTX as a later phase.

## 1. Editing an existing .docx while preserving formatting

**Structure that matters.** Body = `w:p` → `w:r` (runs, each with `w:rPr`) → `w:t`. Tables are `w:tbl/w:tr/w:tc/w:p`. Headers, footers and footnotes are separate parts. Lists are plain paragraphs with `w:numPr`, so no text is lost by editing their runs.

**Addressing strategies** (from most to least robust for our case):

| Strategy | Used by | Notes |
|---|---|---|
| Paragraph ID + replacement text for that paragraph; the server diffs old vs. new word-by-word | common practice **[unverified for products]**; matches our existing numbered-line design | The model never quotes text. Fits CLAUDE.md rule "edits only by line numbers". Server computes minimal `del`/`ins`. |
| Quoted anchor (`target_text` → `new_text`), reject if ambiguous | Adeu ([README](https://github.com/dealfluence/adeu)) | Model must quote exactly. Adeu has a "safety gate" for ambiguous matches. |
| Direct XML edits by the agent | Anthropic docx skill ([SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md)) | Model edits `document.xml` itself. Costly and fragile for a product. |
| Full rewrite of the document + automated compare | python-redlines, Docxodus | Easy for the model, but over-reports changes and has no per-suggestion accept/reject. |

**Text split across runs.** Word splits runs on formatting, spellcheck, rsid and proofing marks, so "30 days" may be 3 runs.
1. Build, per paragraph, a flat string plus an array of `{run, startOffset, endOffset}` segments.
2. Map the diff range onto those segments. Split the boundary runs by cloning the `w:r` with its `w:rPr`. Wrap the middle in `w:del` (turn `w:t` into `w:delText`), and insert a `w:ins` run that copies the `w:rPr` of the first deleted run.
3. Anthropic's skill pre-merges adjacent runs with the same formatting (`merge_runs.py`) so text is searchable. Adeu merges them virtually in its projection and never rewrites untouched runs ([FIDELITY.md](https://github.com/dealfluence/adeu/blob/main/docs/FIDELITY.md)).
4. Treat runs holding `w:br`, `w:tab`, `w:fldChar`, `w:drawing` and `w:footnoteReference` as atomic boundaries.

## 2. Libraries for tracked changes: comparison

| Tool | What it does | Maturity (verified) | License | Node-friendly? |
|---|---|---|---|---|
| **Adeu** [GitHub](https://github.com/dealfluence/adeu) | LLM-oriented: docx → markdown/CriticMarkup projection; apply `modify` edits as tracked changes + comments; accept/reject by ID | 168★, pushed today; `@adeu/core` 3.0.7 on npm (2026-10-05) | MIT | **Yes** (pure TS `@adeu/core`, plus an MCP server and an n8n node) |
| **Docxodus** [GitHub](https://github.com/JSv4/Docxodus) / [npm](https://www.npmjs.com/package/docxodus) | .NET docx comparer (WmlComparer successor): emits native tracked changes, moves, format changes; accept/reject; revisions as JSON; HTML render with `<ins>/<del>` | 99★, v13.0.0 on npm (2026-10-12), very active | MIT | **Yes**: .NET compiled to WASM, `docxodus/core` usable from Node. (I did not test it.) |
| **python-redlines** [GitHub](https://github.com/JSv4/Python-Redlines) | `run_redline(author, original, modified)` → docx with tracked changes. Default engine is Docxodus; the old WmlComparer engine is deprecated | 133★, pushed 2026-09; prebuilt wheels, no .NET needed at runtime | MIT | Needs a Python sidecar (or call the Docxodus npm directly) |
| **Open-XML-PowerTools WmlComparer** [GitHub](https://github.com/OpenXmlDev/Open-Xml-PowerTools) | Original .NET comparer ([Eric White](https://www.ericwhite.com/blog/?p=3676)) | 640★, **last push 2024-11**, effectively superseded by Docxodus | MIT | No (.NET) |
| **docx-revisions** [GitHub](https://github.com/balalofernandez/docx-revisions) | python-docx extension: `find_and_replace_tracked`, `add_tracked_insertion/deletion`, accept/reject all | 18★, 24 commits, small | MIT | No (Python) |
| **python-docx** [GitHub](https://github.com/python-openxml/python-docx) | Good run/paragraph access, **no** tracked-change API | 5.7k★, active | MIT | No |
| **`docx` (dolanmiu)** [GitHub](https://github.com/dolanmiu/docx) | Generates *new* docs; has `InsertedTextRun` / `DeletedTextRun`, but cannot open and edit an existing file | 6k★, active | MIT | Yes, but wrong tool (create-only) |
| **docxtemplater** [GitHub](https://github.com/open-xml-templating/docxtemplater) | Placeholder templating; run-splitting-aware, but no tracked changes | 3.6k★ | Core is a custom/NOASSERTION license; paid modules | Yes, wrong tool |
| **LibreOffice (UNO)** | Writer's Compare Documents feature produces a redline from two files. `unoserver` ships `unocompare` ([PyPI](https://pypi.org/project/unoserver)) | Mature; the compare feature is not headless-friendly out of the box | MPL-2.0 **[unverified]** | Via a sidecar process |
| **Aspose.Words** (Node via .NET) | `Document.compare`, full tracked-change API | Commercial. A reseller lists about $1.2k (1 dev, 1 location) to $3.5k (OEM) per [ComponentSource](https://www.componentsource.com/product/aspose-words-for-node-js-via-net/prices); not checked against Aspose's own page | Commercial | Yes (Node via .NET) |
| **Apryse / Syncfusion** | Commercial SDKs with track-changes APIs | I did not find pricing or docs; skipped | Commercial | – |

Notes:
- A docx→docx "compare" tool (Docxodus, LibreOffice) is the right choice only if the edit is expressed as a *full new document*. For our per-suggestion flow it is a fallback, not the primary path (see §6).
- `safe-docx` (UseJunior) also offers a TypeScript `compare_documents` ([page](https://www.usejunior.ai/engineering/safe-docx/compare-documents/compares-two-docx-files-and-writes-redline)). I could not confirm its license, so I'd skip it.

## 3. How AI products do it

- **Anthropic docx skill** ([SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md), repo has 181k★). Workflow: unzip → `merge_runs.py` → edit `document.xml` → zip → `validate.py --author`. It validates that every changed text sits inside `w:ins`/`w:del` by the given author, plus XSD checks. Rules: replace = `[unchanged][w:del][w:ins][unchanged]`, only the changed words are marked, `w:delText` inside deletions, and `w:del` must be the first child of `rPr` for a deleted paragraph mark. `comment.py` writes the comment parts and prints the `commentRangeStart/End/Reference` markers to place. The model edits XML directly; the product-grade variants are below.
- **Adeu**: the model sees a markdown projection and returns `{target_text, new_text, comment}`; Adeu finds the anchor, rejects ambiguous ones, and writes tracked changes. Both a Python and a Node implementation exist.
- **Spellbook, Harvey, Wordsmith** ([Spellbook](https://www.spellbook.legal/learn/redline-contracts), [Harvey](https://www.harvey.ai/en-US/blog/improved-word-experience), [Wordsmith](https://www.wordsmith.ai/articles/how-to-redline-a-word-document-a-guide-for-in-house-legal-teams)): all write native Word tracked changes under the user's name inside a Word add-in. **I found no public description of their edit representation**, so I won't claim one. Likewise for Microsoft Copilot in Word, Robin AI and LegalOn: nothing verified. Add-ins presumably use Office.js. **[unverified]**
- **Pattern across what is documented:** the model returns small, anchored edits and deterministic code produces the OOXML. Nobody lets the model emit raw revision XML in a product, and the full-rewrite-then-diff approach appears only in the compare tools.

## 4. Legacy .doc → .docx

`soffice --headless --convert-to docx --outdir out in.doc` works and is the standard route. Fidelity is "usually good, not identical to Word"; the searches surfaced bug reports for lost images, borders, header sizing and metadata in some versions ([example 1](https://bugs.freedesktop.org/show_bug.cgi?id=46026), [example 2](https://www.libreoffice.org/bugzilla/show_bug.cgi?id=104605)). Most are old; I did not benchmark current versions. Mitigations:
1. Pin a recent LibreOffice in the Docker image.
2. Test on 10–20 real KSE syllabi (tables, numbered lists, headers).
3. Show the professor a notice: "Converted from .doc, the output is a .docx".
4. Use a per-conversion `-env:UserInstallation=file:///tmp/lo-<uuid>` profile and a queue, because concurrent soffice instances crash.
5. Fallback if conversion loses content: ODT as an intermediate step (suggested in one of the bug threads).

## 5. Previewing a DOCX with tracked changes in the browser

| Option | Tracked changes shown? | Fidelity | Cost |
|---|---|---|---|
| **docx-preview** ([docxjs](https://github.com/VolodymyrBaydalka/docxjs), Apache-2.0, 2.1k★, v0.4.1 on 2026-09-21) | `renderChanges: true` renders `w:ins`/`w:del`/`w:delText` as `<ins>`/`<del>` (I checked `html-renderer.ts`: `renderInserted/renderDeleted/renderDeletedText` are gated on that option). README labels it "experimental". `renderComments` is also experimental | Good for plain text, tables and lists; approximate pagination, fonts and fields | Free, client-side |
| **LibreOffice → PDF** | Writer exports tracked changes in the PDF if changes are displayed **[unverified, test it]** | Highest available in OSS | Free, server CPU. Needed for the email report anyway |
| **ONLYOFFICE Document Server** ([AGPL-3.0](https://github.com/ONLYOFFICE/DocumentServer)) / **Collabora** ([repo](https://github.com/CollaboraOnline/online)) | Real review UI with accept/reject | Highest, a full editor | Heavy infrastructure; AGPL / MPL implications |
| Docxodus HTML render | `<ins>/<del>` with author info | Unknown | Free |
| Aspose / Apryse viewers | Yes | High | Commercial |

**Cheapest faithful path:** docx-preview with `renderChanges` for the live per-card preview, plus a LibreOffice PDF for the "final preview" step that already exists (`previewFinalPdf`). Test docx-preview on real syllabi first, because its changes rendering is flagged experimental.

## 6. Recommended architecture for our stack

**Do not go full compare-based.** Keep the per-recommendation edit model, but switch the target from "line of plain text" to "paragraph of the original DOCX".

1. **Upload:** `.docx` is stored as-is. `.doc` goes through soffice → `.docx` (sidecar). PDF stays on the current path (read-only text; export is the existing PDF render). PPTX is deferred.
2. **Index:** walk `document.xml` in body order, including table cells. Produce `[{id: 'P17', text, location}]` with ids by traversal index (not `w14:paraId`, which is not always present). Send these numbered paragraphs to the LLM, exactly as numbered lines are sent today. Store `docVersion` = sha1 of the zip's `document.xml` (keeps the STALE_DOC_VERSION logic).
3. **Edit schema** (model output): `{paraId, op: 'replace'|'delete'|'insertAfter', newText}`. `replace` carries the whole new paragraph text, and the server computes a word-level diff, so the model never quotes the syllabus. Headers/footers are read-only in v1.
4. **State rebuild** (idempotent, like `recomputeSyllabusState`): `finalDoc = apply(originalDocx, acceptedEdits, mode)`, with `mode ∈ {tracked, clean}`. Never mutate incrementally.
5. **Outputs:** `tracked` (one `w:ins`/`w:del` set per accepted recommendation, author "KSE AI Syllabus Analyzer", optionally a `w:comment` with the rationale) and `clean` (same edits applied without revision marks). Offer both for download. The professor can still reject any single change inside Word.
6. **Sidecar:** a small container with LibreOffice for (a) `.doc → .docx`, (b) `docx → pdf` for the preview and the email. A Python or .NET sidecar is **not** needed.

**Pseudo-code**

```js
// applyEdits(zip, edits, {tracked, author, date})
const doc = parseXml(await zip.file('word/document.xml').async('string'));
const paras = indexParagraphs(doc);                  // id → w:p node (body order)
let revId = maxRevisionId(doc) + 1;
for (const e of sortDescendingByParaIndex(edits)) {   // bottom-up so ids stay valid
  const p = paras.get(e.paraId);
  const { text, segs } = flatten(p);                 // segs: [{run, start, end, atomic}]
  if (e.op === 'replace') {
    for (const h of wordDiff(text, e.newText)) {     // {type:'eq'|'del'|'ins', start,end, text}
      if (h.type === 'del') {
        const runs = splitRunsAt(p, segs, h.start, h.end);   // clones w:r + w:rPr
        tracked ? wrapIn(runs, el('w:del', meta(revId++)), {t2delText: true})
                : runs.forEach(r => r.remove());
      } else if (h.type === 'ins') {
        const run = cloneRunFormat(segs, h.at);              // copy rPr of neighbouring text run
        tracked ? insertAt(p, h.at, el('w:ins', meta(revId++), run(h.text)))
                : insertAt(p, h.at, run(h.text));
      }
    }
  } else if (e.op === 'delete') {
    // mark paragraph mark deleted too: <w:pPr><w:rPr><w:del .../></w:rPr></w:pPr>
  } else if (e.op === 'insertAfter') {
    // new w:p copying pPr (style, numPr) of anchor; paragraph mark <w:ins> in pPr/rPr
  }
}
zip.file('word/document.xml', serialize(doc));
return zip.generateAsync({ type: 'nodebuffer' });
```

**Pitfalls**
- **Numbering and lists:** inserted paragraphs must copy `w:pPr` (including `w:numPr`) from a neighbour, otherwise they lose bullets and numbers. A deleted list item leaves an empty auto-numbered bullet unless the paragraph mark is also marked deleted. Anthropic's skill documents exactly this failure for pandoc and for its own accept script.
- **Fields / TOC / page numbers:** runs with `fldChar` / `instrText` / `fldSimple` are atomic. Never split or diff inside them. Reject edits that overlap them (Adeu does the same, and omits field codes from its projection).
- **Hyperlinks, bookmarks, smart tags, content controls (`w:sdt`):** text lives inside wrapper elements, so `flatten` must descend into `w:hyperlink`, `w:smartTag` and `w:sdtContent`. Tracked-change wrappers inside a hyperlink are legal, but keep `w:ins`/`w:del` as direct children of `w:p` or of the permitted container.
- **Revision ids:** `w:id` on `ins`/`del`/comments must be unique per document. Take the maximum existing id + 1. If the source already contains tracked changes, either refuse or accept them first.
- **rsid:** not needed for validity, so omit it. Untouched runs keep their original rsids, which keeps the diff small.
- **Schema order:** inside `rPr`, `w:del`/`w:ins` marks have a fixed position, and `w:delText` needs `xml:space="preserve"`. Validate with the XSD checks in Anthropic's `validate.py` ([skill repo](https://github.com/anthropics/skills)). **[I did not check whether its license allows reuse; the GitHub API reports none.]**
- **Tables:** a table-cell paragraph is still a `w:p`, so edits work. Inserting or deleting rows/columns is not expressible via paragraph text, so out of scope.
- **Text boxes, drawings, footnotes, headers:** skip, and say so in the UI.
- **Unicode / smart quotes / NBSP:** normalize for the diff, but keep the original characters in untouched segments.
- **Comments:** adding `w:comment` needs `comments.xml`, a rel, and a content-type override, plus the range markers in the body. Skip in v1 if the schedule is tight.

**Fallback worth keeping:** if paragraph-level mapping fails (e.g. a scanned PDF), keep today's text→PDF pipeline for PDFs. For PDFs, a true "same format" output is not feasible; say so in the product.

**Build-vs-buy decision:** (a) `@adeu/core` (MIT, active, Node) if its `target_text` anchoring is acceptable, e.g. we resolve paragraph + sentence into a unique quote on the server. This avoids writing the run-splitting code. (b) Own implementation on `jszip` + `@xmldom/xmldom` (about 300–500 lines plus tests), and full control over the paragraph-id schema. I recommend a one-day spike on (a) with 10 real syllabi, and fall back to (b) if too many edits are rejected as ambiguous or touch fields.

## Source list

- Adeu: https://github.com/dealfluence/adeu · https://github.com/dealfluence/adeu/blob/main/docs/FIDELITY.md
- Anthropic docx skill: https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md
- Docxodus: https://github.com/JSv4/Docxodus · Python-Redlines: https://github.com/JSv4/Python-Redlines
- WmlComparer: https://github.com/OpenXmlDev/Open-Xml-PowerTools · https://www.ericwhite.com/blog/?p=3676
- docx-revisions: https://github.com/balalofernandez/docx-revisions
- docx-preview: https://github.com/VolodymyrBaydalka/docxjs
- Spellbook / Harvey / Wordsmith (marketing only): links in §3
- unoserver: https://pypi.org/project/unoserver
- LibreOffice bugs: https://bugs.freedesktop.org/show_bug.cgi?id=46026 · https://www.libreoffice.org/bugzilla/show_bug.cgi?id=104605
- Aspose pricing (reseller): https://www.componentsource.com/product/aspose-words-for-node-js-via-net/prices
