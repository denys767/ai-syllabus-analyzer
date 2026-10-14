# B. PDF, PPTX and structure-aware parsing — research report

Date: 2026-10-14. GitHub stats pulled via `gh api` on this date. Items marked **(unverified)** come from background knowledge or secondary sources and were not confirmed against a primary page.

## TL;DR
- **PDF:** don't try to edit PDFs in place. Offer two outputs: (1) the original PDF plus *annotations* (strike-out, caret, sticky-note with proposed text) as the "same document + preview"; (2) ask for the editable source (DOCX) when an accepted-changes file is needed. PDF→DOCX conversion is a best-effort fallback only.
- **PPTX:** edit the XML at *run level* inside existing shapes, so formatting survives. Use `a:r` runs in `p:sp` shapes as anchors. PowerPoint has no tracked changes, so the preview must be a rendered before/after image plus (optionally) comments.
- **Parsing:** no off-the-shelf parser gives stable anchors for all three formats. Write a thin per-format extractor that emits our own block IDs. Use Docling/Azure DI only for scanned or complex PDFs, where bbox provenance is the anchor.
- **Architecture:** canonical `Block[]` with `locator` per format, and a `Writer` per format that outputs `{editedFile, changesPreview}`.

---

## 1. PDF strategies

### 1a. Annotate the original PDF (recommended for PDF inputs)

| Tool | Lang / license | Notes |
|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | Node, MIT, 8.7k★, **last push 2024-07** (effectively unmaintained) | Low-level: can create annotation dictionaries by hand (`/Highlight`, `/StrikeOut`, `/Caret`, `/Text`), but has no high-level annotation API (**unverified** beyond README). Maintained fork: `@cantoo/pdf-lib` (**unverified**). |
| [PyMuPDF](https://github.com/pymupdf/PyMuPDF) | Python, **AGPL-3.0** (commercial licence from Artifex), 10.9k★, active | Best API: `page.search_for(text)` → quads; `add_highlight_annot`, `add_strikeout_annot`, `add_caret_annot`, `add_text_annot`/`add_freetext_annot`. AGPL matters if shipped as a network service — check with legal, or run as an isolated microservice and buy the licence. |
| [pdf.js](https://github.com/mozilla/pdf.js) | JS, Apache-2.0, 54k★, active | Great *viewer* with an annotation editor (highlight, ink, freetext, stamp) and can serialise annotations back into the PDF. Good for the frontend preview. Its editor model is not designed for programmatic "suggestion" annotations (**unverified**). |
| pdf-annotate.js | JS | Browser annotation layer. The GitHub repo path I tried returned 404, so treat as not maintained. |
| Apryse (PDFTron) / Nutrient (PSPDFKit) | Commercial | Full annotation SDKs with Node/Web viewers; real redline-style UI. Priced per deployment, typically a high-four- to five-figure sum per year (**unverified**). Overkill for this project. |

**Can an annotated PDF be "same document + preview of changes"?** Yes. Strike-out on the old text plus a caret/sticky-note carrying the proposed text is exactly how reviewers mark up PDFs, and every viewer renders it. Limits:
- The anchor is text search (`search_for`) or bbox, not a stable ID. Duplicates and hyphenated or ligature-broken text can cause misses. Mitigate by anchoring on page + bbox from the extractor (Docling / PyMuPDF `get_text("dict")`) and keeping the quad in the block's locator.
- The "accepted" file is still not edited text. It is a marked-up PDF, not a clean document.
- Pitfall: PyMuPDF `search_for` fails on text spanning lines; search per line, or use the span bboxes from extraction.

### 1b. PDF → DOCX, then use the DOCX tracked-changes pipeline

| Option | Fidelity / cost |
|---|---|
| [pdf2docx](https://pypi.org/project/pdf2docx/) (Python, built on PyMuPDF) | Free. Text-based PDFs only; rule-based, so layout is not guaranteed; OCR not supported; column/header support limited (PyPI page). |
| LibreOffice headless (`soffice --convert-to docx` with the Draw PDF import) | Free, but the PDF import yields positioned text boxes per line rather than flowing paragraphs, so the DOCX is awkward to edit (**unverified**, well-known behaviour). |
| Adobe PDF Services Export-to-DOCX API | Best commercial fidelity among cloud options (**unverified**); paid per transaction after a free tier. I could not retrieve the pricing page — check [developer.adobe.com/document-services/pricing](https://developer.adobe.com/document-services/pricing/main/). |
| ConvertAPI / Word desktop | Cloud per-conversion fee / not server-friendly. |

Verdict: usable as an *opt-in* "convert my PDF" step, shown to the professor as "this is a converted copy; layout may differ". It violates the "same document" promise, so don't make it the default.

### 1c. True in-place PDF text editing
- PyMuPDF: `add_redact_annot` + `apply_redactions` removes the old text, then `insert_htmlbox` / `insert_textbox` writes the new text in the same rect ([Artifex blog](https://artifex.com/blog/mastering-pdf-text-with-pymupdfs-insert-htmlbox-what-you-need-to-know)). Do not set a `fill` colour, or a white box is drawn on the page ([forum](https://forum.mupdf.com/t/how-to-remove-the-white-rectangle-left-after-using-add-redact-annot-apply-redactions-to-delete-text/162)). Tight line spacing can make redaction clip adjacent lines ([secondary source](https://www.technetexperts.com/pymupdf-redaction-removes-adjacent-text/amp/)).
- Hard limits: **no reflow** — longer replacement text overflows the box or shrinks; subset fonts in the PDF usually lack the glyphs for new text, so you substitute a font (visible mismatch; Cyrillic needs a font with coverage); multi-line paragraphs need manual re-wrapping; tables/columns don't move.
- Apryse ContentReplacer: same class of limits (commercial; **unverified** details).
- Feasible only for short same-length substitutions. For syllabus rewrites (adding paragraphs, new sections) it's not viable.

### 1d. Ask for the editable source (product option)
Practical and what comparable products do: contract-review and document-AI tools (e.g. Word-based redlining add-ins) work on DOCX natively; PDF-first tools (Acrobat, Adobe's AI Assistant) comment/annotate rather than rewrite (**unverified**, general market knowledge). Recommended UX:
1. PDF uploaded → analyse as usual and show the annotated PDF.
2. Banner: "To receive an edited document in the original format, upload the DOCX." Offer an optional "convert to DOCX (beta)" button using pdf2docx/Adobe.
3. Always store which route was used in `Syllabus.sourceFormat` and `outputMode` (`annotations` | `edited-source` | `converted`).

---

## 2. PPTX

### Format-preserving text edits

| Tool | Lang / licence | Fit |
|---|---|---|
| [python-pptx](https://github.com/scanny/python-pptx) | Python, MIT, 3.6k★, **last push 2024-08** | Mature. Exposes `shape.text_frame.paragraphs[].runs[]`; setting `run.text` keeps run formatting. No comments API, no rendering. |
| [pptx-automizer](https://github.com/singerla/pptx-automizer) | Node/TS, MIT, 249★, v0.9.2 (2026-08), very active | Template-driven: add slides from templates, `modifyElement` with `setText`, raw XML callbacks (xmldom), keeps template styling. It is built for *assembling* from templates, not for diffing an arbitrary user deck; formatting preservation of runs is not documented explicitly. |
| node-pptx / PptxGenJS ([6.3k★](https://github.com/gitbrent/PptxGenJS), MIT) | Node | Generate new decks only — cannot open existing ones. Not suitable. |
| Aspose.Slides | .NET/Java/Node via Java, commercial | Full API, including `ModernComment`, text-portion access, and rendering to PDF/PNG. Paid; watermark in eval mode. |
| **JSZip + xmldom (DIY)** | Node, MIT | Open the PPTX zip, edit `ppt/slides/slideN.xml` directly. Most control and no new dependency; this is what pptx-automizer does internally. |

**Recommended approach:** DIY on JSZip (or pptx-automizer's `getJSZip()` helper) for text edits. Handle:
- A paragraph's text is split across multiple `<a:r>` runs (spell-check, language, formatting changes). Put the edit in the first run, copy its `rPr`, and delete the others. Keep `a:pPr`, `a:endParaRPr`, bullets.
- Text sits in `p:sp` (placeholder or text box), table cells (`a:tbl`), group shapes (recursion), SmartArt (`diagrams/data*.xml`; hard — mark read-only), and chart text. Notes live in `notesSlides/`.
- Text can overflow after a longer rewrite. PowerPoint's autofit (`a:normAutofit`) only recalculates on open in PowerPoint, not in LibreOffice. Instruct the LLM to keep length ≈ original, and flag overflow risk using a render check.

### Comments as suggestions
PowerPoint has legacy comments (`ppt/comments/commentN.xml`) and "modern comments" (`ppt/comments/modernComment_*.xml`, authors in `ppt/authors.xml`, anchored to slide or to a shape/text range; schema in the Office2021 PowerPoint comment namespace — see [Open XML SDK docs](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-add-a-comment-to-a-slide-in-a-presentation), [Aspose ModernComment](https://reference.aspose.com/slides/net/aspose.slides/moderncomment/)). I could not fetch the exact modernComment schema, so treat the element names as **unverified**. Writing comments by hand requires adding content types and relationships; legacy comments are simpler and still shown by PowerPoint (which converts them), but older/newer versions differ in behaviour. Good use: attach the *proposed* text as a comment on the slide while leaving the slide untouched, i.e. "suggestion mode".

### Is there a tracked-changes equivalent?
No. Microsoft's own support answer is that PowerPoint has no Track Changes; the supported workflow is **Review → Compare** against a copy ([Microsoft support](https://support.office.com/en-us/article/8c204b9c-c649-4af7-ab7e-01b8f327536a), [Computer Hope](https://www.computerhope.com/issues/ch002135.htm)). Compare writes into the file as comments-like markers on the diff, but it is not generated by a library. I found no documentation about whether Copilot logs its edits; treat that as unknown. Gamma generates new decks rather than redlining uploaded ones (**unverified**). So: **the preview must be ours** — render before/after images and highlight changed shapes.

### Slide previews
LibreOffice headless → PDF → PNG (`soffice --headless --convert-to pdf`, then `pdftoppm`/PyMuPDF/pdf.js). Caveats: font substitution (install the fonts used; Cyrillic coverage), rendering differs slightly from PowerPoint, 5–20 s cold start (run a persistent `unoserver`/`soffice` listener). The repo already uses Puppeteer; PDF → PNG can reuse it via pdf.js.

For the preview, draw the diff by *generating a second PPTX* in which changed runs are coloured (red strikethrough for old text in a duplicate shape, green for new), and render that. Never ship the marked-up copy as the result.

---

## 3. Structure-aware extraction with anchors

| Tool | Formats | Lang | Licence / stats | Anchors available | Notes |
|---|---|---|---|---|---|
| [Docling](https://github.com/docling-project/docling) | PDF, DOCX, PPTX, XLSX, HTML, images | Python | MIT, 68.9k★, v2.139.0 (2026-10-14) | `DoclingDocument` items with JSON-pointer refs (`#/texts/5`), bbox "if available" ([docs](https://docling-project.github.io/docling/concepts/docling_document/)). Page/bbox provenance for PDFs (`prov`) per item is how I know it from use — the page I fetched didn't show field names, so **unverified**. | Best fit for PDF layout (layout model + tables + OCR). Slow on CPU (seconds per page); GPU helps. Run as a sidecar service (`docling-serve`). |
| [MarkItDown](https://github.com/microsoft/markitdown) | DOCX, PPTX, PDF, XLSX, HTML… | Python | MIT, 190k★, v0.1.8 (2026-09) | **None** — outputs flat Markdown only (PPTX adds `<!-- Slide number: N -->` comments). | Fast, simple; useless for mapping edits back. |
| [Unstructured](https://github.com/Unstructured-IO/unstructured) | most | Python | Apache-2.0, 15.6k★, active | Elements with `element_id` (hash of text — unstable on edit) and metadata: `page_number`, `coordinates` for PDF; no source-paragraph IDs for DOCX/PPTX. | OSS partitioners are weaker than the paid API. Heavy install. |
| [Marker](https://github.com/datalab-to/marker) | PDF, images, also DOCX/PPTX | Python | Apache-2.0 code; model weights have a separate licence with revenue limits (**unverified**, check) | JSON output with block IDs and polygons per page | Good PDF→Markdown quality; GPU-oriented. |
| LlamaParse | PDF, DOCX, PPTX… | SaaS | Proprietary SaaS (client SDK MIT); repo `llama_cloud_services` 4.3k★ | Page-level plus layout items with bbox in recent versions (**unverified**) | Per-page credit pricing; sends documents to a third party (privacy review for student/faculty data). |
| [officeParser](https://github.com/harshankur/officeParser) | DOCX, PPTX, XLSX, ODF, **PDF**, RTF… | **Node** (needs Node ≥22.13 per README) | MIT, 558★, active (2026-10) | AST with node types, heading level, list/table metadata; `bounds` on PDF nodes; **no node IDs**, slide number only in chunk metadata (README) | The only Node all-in-one. Read-only; can't write back. |
| [mammoth.js](https://github.com/mwilliamson/mammoth.js) | DOCX only | Node | BSD-2, 6.3k★, active | `convertToHtml` + style map; can't emit paragraph IDs by default — add via a custom transform (`transformDocument`) to inject `paraId`/index. | Already a dependency; DOCX-only. |
| Azure Document Intelligence (Layout) | PDF, images, DOCX/PPTX (read) | SaaS, Node SDK | Paid per page (~$10 per 1k pages for Layout, **unverified**) | `paragraphs[]` with `boundingRegions` (page + polygon), spans offsets into content, roles (title, header, footnote) | Strong OCR incl. Ukrainian; robust anchors on PDF. Data leaves infra (EU region available). |
| OpenAI native PDF input (Responses API `input_file`) | PDF (others: text only) | API | Per-token | None — the model sees extracted text + page images ([docs](https://developers.openai.com/api/docs/guides/pdf-files)); DOCX/PPTX get text only, no images. | Good for *understanding* scanned/complex PDFs, but gives no source locators. Our rule "model must not quote text" needs IDs, so pre-extract with IDs and send the blocks. |

**Answer to "which give stable anchors":**
- **PDF:** Docling or Azure DI (page + bbox + reading order). PyMuPDF `get_text("dict")` gives blocks/lines/spans with bbox for free (AGPL caveat) — sufficient for text PDFs.
- **DOCX:** none generic; use our own extractor over `word/document.xml` (`w:p` index, `w14:paraId` when present — Word writes it, other producers don't).
- **PPTX:** none; own extractor (slide index + shape `cNvPr@id` + paragraph index + run index).

Recommendation: **write our own thin extractors per format (Node) and use Docling only as an optional PDF/scan path.** Our extractor is about 150 lines per format and keeps the Node stack.

---

## 4. Recommended architecture

```
upload ─► detect format ─► Extractor[fmt] ─► Block[] (canonical)
                                               │
                                     LLM (numbered blocks, same edit ops as today)
                                               │
                                          Edit[] (by blockId)
                                               │
          professor accepts/rejects per recommendation (existing chat flow)
                                               │
                     Writer[fmt].apply(source, acceptedEdits) ─► edited file (orig. format)
                     Writer[fmt].preview(source, allEdits, decisions) ─► changes preview
```

**Canonical model**
```ts
Block {
  id: string            // stable: `${format}:${locatorHash}`; persisted, never renumbered
  kind: 'heading'|'paragraph'|'list-item'|'table-cell'|'slide-title'|'slide-text'|'notes'|'caption'
  text: string          // plain text shown to the LLM
  level?: number        // heading depth / list level
  parentId?: string     // section, table, slide
  order: number
  locator: Locator      // format specific, see below
  textHash: string      // sha1 of source text at extraction (extends the current docVersion check)
  runs?: {start,end,styleRef}[]   // char ranges per source run, needed for run-preserving edits
}
```
Locators: DOCX `{part:'word/document.xml', paraIndex, paraId?}`; PPTX `{slide, shapeId, paraIdx, tableCell?}`; PDF `{page, bbox[], lineBboxes[], spanIds[]}`.
Edit ops stay the current set (`replace`/`delete`/`insertAfter`/`appendDoc`) but target `blockId` instead of line numbers; the existing line-number validation (`lineDoc.js`) generalises to "block exists and `textHash` matches".

**Writers**

| Format | (a) edited file | (b) preview |
|---|---|---|
| DOCX | Edit `w:p` runs; emit `w:ins`/`w:del` for tracked changes (other agent's topic); accepted-only variant = apply directly | Word shows the tracked changes; render PDF via LibreOffice for in-app view |
| PPTX | Run-level XML edit (first-run style retained) | Render original and edited decks to PNG via LibreOffice; side-by-side per slide; changed shapes outlined; optional comments |
| PDF (text) | Not produced; offer DOCX-upload or conversion | Annotated original PDF (strike + caret + note with new text) |
| PDF (converted) | Convert → DOCX pipeline | As DOCX |

**Pitfalls**
1. **Run fragmentation** (DOCX and PPTX): one visible sentence is many runs. Map char offsets → runs; edit whole paragraphs where possible rather than sub-ranges; never concatenate `rPr` blindly.
2. **Offsets after multiple accepted edits:** keep operating on blocks from the original, apply in reverse document order or by block ID, never by absolute offsets. Rebuild from source + accepted set, as `recomputeSyllabusState` already does.
3. **Text the extractor can't see** (SmartArt, charts, images with text, text boxes inside shapes in DOCX, headers/footers): mark as `readOnly`, let the LLM comment but not edit.
4. **Scanned PDFs:** need OCR before anything else (Docling/Azure/Tesseract); edits are annotation-only.
5. **Fonts/Cyrillic in rendering:** install fonts used by KSE templates in the Docker image, otherwise previews differ from Word/PowerPoint.
6. **Length growth:** PPTX overflow and PDF in-place overflow; add a render-based overflow check or a length budget (`maxChars = original * 1.15`) in the prompt.
7. **LibreOffice is single-threaded and leaks:** run a queue with a concurrency of 1–2 and per-job timeouts; isolate in a container.
8. **Licensing:** PyMuPDF is AGPL; Aspose/Apryse are commercial; Marker weights licence needs checking.
9. **Privacy:** SaaS parsers (LlamaParse, Azure DI, Adobe) send faculty documents off-site; the project already uses OpenAI, so risk is comparable, but record it.
10. **Round-trip tests:** the repo has none; add fixtures per format (extract → no-op write → byte-compare text; apply one edit → diff only that block).

**Suggested rollout:** (1) refactor to `Block[]` with a DOCX extractor/writer (shared with the other agent's work); (2) PPTX extractor + writer + LibreOffice previews; (3) PDF annotation writer via a PyMuPDF sidecar (or pdf-lib if staying pure Node, accepting more manual work); (4) optional Docling/Azure for scans and PDF→DOCX conversion.
