# Z.ai Chat Exporter — Updated Technical Audit, Research & Readability Roadmap

**Document version:** 2.0  
**Updated:** October 16, 2026  
**Project:** [Z.ai Chat Exporter](https://github.com/md-aktaruzzman-emon/Z.ai-Chat-Exporter)  
**Target site:** [chat.z.ai](https://chat.z.ai/)  
**Based on:** The user-supplied `TECHNICAL_AUDIT_AND_ROADMAP.md`, the described exported-PDF symptoms, and online research of official technical documentation and related open-source projects.  
**Important evidence note:** This update revises the plan and adds research; it does **not** independently inspect the current local source repository or live authenticated Z.ai session. Current-code claims from the supplied audit are therefore treated as findings to reproduce/verify, not as newly verified facts.

---

## 1. Executive Summary

### 1.1 The real product goal

Z.ai Chat Exporter should turn a complete Z.ai conversation into **readable, well-structured files that people can study, reference, edit, archive, or print**. A valid PDF or DOCX file is not sufficient if it loses the writing structure that made the original conversation easy to read.

The most important quality requirement is:

> **Do not remove or collapse meaningful spacing, line breaks, indentation, paragraph boundaries, headings, lists, code structure, or table structure while converting a chat into PDF, Word/DOCX, or another format. Long content must flow to additional pages; it must not be squeezed into tiny text to fit.**

The goal is to preserve the conversation's **meaningful structure and visible writing pattern**, not to reproduce every pixel of the Z.ai website. The output should read like a clean conversation document, similar to a good dedicated chat-to-PDF exporter: clear speaker labels, readable paragraphs, distinct headings, sensible margins, formatted code blocks, native tables where possible, retained images/math/citations, and predictable page breaks.

### 1.2 Priority conclusion

The supplied audit describes several potential defects that fit the reported screenshots:

1. The live scraper may flatten structured response content—especially custom `div`-based grids and nested callouts—into a single paragraph.
2. The vector PDF engine may lose inline formatting and miscalculate vertical positions, especially inside cards and complex-script fallback rendering.
3. Whitespace handling may treat ordinary prose, explicit line breaks, and preformatted code as though they were the same kind of text.
4. The full-history collector may stop before it reaches the actual beginning of long chats and may confuse identical repeated user messages.
5. DOCX may use manually typed list symbols rather than semantic Word numbering and may handle very long code content awkwardly.

These are **reported audit findings that should be reproduced against the current code and actual exports before implementation**. Do not re-label them as fixed or fully verified merely because a unit test or build passes.

### 1.3 Updated recommended direction

Keep the existing Manifest V3 architecture and reuse working libraries unless an evidence-based comparison justifies replacement. First repair and test the data path. Then perform a measured, small proof-of-concept comparing the current vector PDF engine with a flow-layout alternative. Keep PDF and DOCX renderers separate but feed both from one semantic document model.

**Do not start by changing fonts, colors, margins, or spacing constants.** First prove the source content and semantic blocks arrive intact at the renderer. Then fix only the rendering defects that remain.

### 1.4 First five actions

| Priority | Action                                                              | Why it comes first                                          | Proof required                                                                 |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P0       | Reproduce the screenshot problem from a known real conversation     | Creates a reliable baseline                                 | Save the input sample, current PDF/DOCX, and rendered page images              |
| P0       | Trace one real message from source to renderer input                | Finds the first point where structure or whitespace is lost | Compare source, collected message, normalized blocks, PDF input and DOCX input |
| P0       | Define and test whitespace rules by content type                    | Directly addresses the user's main requirement              | Paragraph/line-break/code-indentation regression tests                         |
| P0       | Fix collection/parser defects reproduced from the live page         | Renderers cannot restore discarded content                  | Real conversation beginning/middle/end and block-count checks                  |
| P0       | Fix the existing PDF renderer or run a focused flow-engine bake-off | Addresses readability after semantic structure is proven    | Compare visual outputs with the same golden input                              |

---

## 2. User Requirements: The Readability Contract

The following requirements are not optional polish. They define whether the export is useful.

### 2.1 Preserve meaningful whitespace

The conversion must **not** globally normalize whitespace. Different kinds of content require different rules.

| Content type                   | Required behavior                                                                                                               | Forbidden behavior                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Normal prose                   | Preserve paragraph boundaries, explicit line breaks, blank-line separation where meaningful, list structure and inline emphasis | Join every paragraph into one continuous string; remove breaks to make the file shorter           |
| Headings                       | Keep heading level, readable font hierarchy, and spacing before/after                                                           | Render every heading as ordinary body text                                                        |
| User-entered multiline prompts | Preserve explicit newlines and visible indentation as represented by the source interface                                       | Replace all line breaks with spaces                                                               |
| Code blocks                    | Preserve line breaks, leading spaces, tabs where represented, blank lines, punctuation, and order exactly                       | Apply `replace(/\s+/g, ' ')`, trim indentation, or render code as a prose paragraph               |
| Inline code                    | Preserve the code span and monospaced visual treatment                                                                          | Merge into normal prose without any boundary or style                                             |
| Lists                          | Preserve list items, nesting, sequence and spacing                                                                              | Merge all items into one paragraph or type bullet symbols as a substitute for semantic DOCX lists |
| Tables                         | Preserve rows, columns, cell content, alignment and header distinction                                                          | Concatenate cells into one string or allow text to bleed across cell borders                      |
| Quotes/callouts                | Preserve their boundaries and readable visual distinction                                                                       | Merge them invisibly with adjacent paragraphs                                                     |
| Math                           | Preserve available LaTeX/MathML/structured math or a faithful visual fallback                                                   | Duplicate, truncate or corrupt formulas                                                           |
| Images/diagrams/charts         | Preserve the actual visual and aspect ratio when available; report unavailable assets                                           | Invent a replacement chart or silently drop the image                                             |
| Attachments                    | Preserve filename/type and available attachment references/metadata                                                             | Pretend an unavailable attachment was embedded                                                    |
| Links/citations                | Preserve destinations and readable link/citation text                                                                           | Export unsafe URL schemes or lose source attribution silently                                     |

**Important distinction:** HTML normally collapses incidental source-code whitespace in ordinary prose unless CSS or markup expresses a line break/preformatted area. The implementation should preserve the user's visible/semantic formatting, explicit `<br>` and paragraph boundaries, and exact preformatted/code whitespace. Do not preserve arbitrary HTML indentation that was never visible in the chat as extra blank lines.

### 2.2 Readable document style

The default output should look like a reading document, not a compressed DOM dump.

Required traits:

- A4 portrait by default, with comfortable margins.
- Consistent body typography and line spacing.
- Clear visual separation between user and assistant messages.
- Real headings and subheadings with enough size contrast to establish hierarchy.
- Consistent paragraph spacing.
- Lists with correct indentation and spacing.
- Code blocks with a monospaced font, preserved whitespace and a subtle background/border where appropriate.
- Tables with readable widths, padding, wrapping and repeated header rows on new pages when supported.
- Images and diagrams scaled proportionally.
- No overlap, clipping or text extending into adjacent table cells.
- Long paragraphs and code blocks continue across pages naturally.
- Header/footer and page numbering may remain, but must never overlap body content.
- Bengali and mixed English/Bengali text must be visually checked, not just confirmed present in a text dump.

Suggested starting typography for the **reading preset** is around 10.5–11.5 pt body text, around 1.35–1.5 line-height relative to font size, and visibly larger headings. These are defaults for testing, not universal hard-coded values. Accessibility and visual results take precedence over a rigid number.

### 2.3 Do not reduce readability to reduce page count

Never shrink a whole message or page to make a long answer fit in the remaining space. A message that occupies three pages is acceptable. A three-page message rendered as tiny text on one page is a failure.

Do not silently drop content, reduce font size based on message length, or force a table/image/code block into a box that clips it. If a block cannot be laid out safely, split it, move it to a new page, use a deliberate landscape/overflow strategy, or show a clear warning.

### 2.4 Recommended user-facing presets

Add presets only after the core format is correct:

1. **Readable (default):** Normal font size, comfortable line spacing, paragraphs and headings separated, readable code/table styling, A4.
2. **Conversation:** Clearly labels each `You` and `Z.ai` message, subtle speaker/card styling, consistent message separation and optional timestamps.
3. **Compact:** Slightly reduced spacing only, with a minimum readable font size; never globally shrink long content.
4. **Academic/Study Notes:** Clear heading hierarchy, numbered lists, readable tables, optional contents/bookmarks if supported.
5. **Faithful Content:** Prioritizes preserving source order, explicit line breaks, code whitespace, media and rich blocks over compactness.

A `Compact` option must not alter code or erase meaningful blank lines. Users should be able to choose layout, not lose data.

---

## 3. Evidence Status and Audit Corrections

### 3.1 What comes from the supplied audit

The uploaded plan reports a Manifest V3/Vite extension using `pdf-lib`, `docx`, and `turndown`, with vector PDF, raster PDF, DOCX, Markdown, HTML, JSON, CSV and PNG targets. It reports issues in the collector, recursive scraper, vector PDF layout, Unicode rendering, and DOCX numbering/pagination.

Those findings are retained as high-priority investigation targets. This updated plan has not rerun `git`, source inspection, tests, or the live website, so exact line numbers, versions, message limits and “100% verified” labels must be checked again in the implementation phase.

### 3.2 Claims that need special verification

| Claim in supplied plan                                       | Updated treatment                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/chats/:id` and `/messages/batch` are available  | Do not assume. The supplied plan itself says this path may return 404 or depend on an incorrect API assumption. Inspect actual current same-origin network requests and validate authentication, schema and policy before relying on it. |
| `maxScrollAttempts = 30` causes truncation                   | Reproduce against the current source and a long virtualized chat. Remove silent premature completion, but retain a safety timeout and explicit incomplete status.                                                                        |
| `role:length:start:end` identity removes repeated prompts    | Reproduce with repeated identical turns. Use real source IDs where available; a content fingerprint alone is not a safe unique identity.                                                                                                 |
| `marked.lexer()` fixes parsing                               | It is appropriate only when the retrieved content is Markdown. It does not turn arbitrary rendered HTML into a correct DOM interpretation. Keep explicit source adapters.                                                                |
| `pdf-lib` is automatically wrong or must be replaced         | Not established. It is a low-level drawing library; the hand-written layout is a concern. Compare a repaired current renderer with a flow-layout prototype using the same fixtures.                                                      |
| `fontkit` alone guarantees Bengali shaping                   | Not established. Font support, glyph coverage, shaping, positioning, embedding and final PDF rendering are separate concerns. Test Bengali conjuncts/diacritics end-to-end.                                                              |
| An automated `y`-coordinate check proves zero visual overlap | Insufficient by itself. Combine structural checks, PDF text/content checks, page raster visual comparison and manual inspection.                                                                                                         |
| The newest version of a dependency is necessarily best       | Incorrect. Verify latest releases and current project compatibility, then test before upgrading.                                                                                                                                         |

### 3.3 Required evidence labels

For every finding, use one of:

- **Verified in current source:** reproduced by inspecting the current source implementation.
- **Reproduced defect:** test or live export reliably demonstrates it.
- **Strong hypothesis:** consistent with the evidence but not yet reproduced.
- **Research-based option:** source-backed technology capability; project fit still needs a proof-of-concept.
- **Not tested / blocked:** requires real Z.ai login, unavailable sample, or a capability not available in the environment.

Do not use “fixed”, “complete”, “production-ready” or “100% verified” as a substitute for evidence.

---

## 4. Updated Target Architecture

### 4.1 Recommended pipeline

```text
Current Z.ai conversation
        |
        v
Conversation identity / active branch detection
        |
        v
Retrieval adapter
  |-- Current authenticated data source, ONLY if observed and validated
  `-- DOM collector fallback
        |
        v
Raw message records + captured assets
        |
        v
Source-aware parsing
  |-- Semantic HTML/DOM parser for rendered DOM
  |-- Markdown tokenizer only when the input is actually Markdown
  |-- Explicit parser for structured API message blocks, if available
        |
        v
Canonical document model
  |-- Message metadata / stable source ID / order
  |-- Block nodes
  `-- Inline runs and source whitespace metadata
        |
        v
Validation gate
  |-- First / middle / last and message counts
  |-- Structural preservation checks
  |-- Media availability and warnings
        |
        +----------+-----------+-----------+
        |          |           |           |
        v          v           v           v
       PDF        DOCX      Markdown     HTML / TXT / JSON / PNG / CSV
        |
        v
Output checks + download + clear result/warnings
```

### 4.2 Keep separate concerns separate

- **Retrieval** collects messages and assets; it should not decide typography.
- **Parsing** converts the source representation into semantic blocks; it should not invent layout.
- **Canonical model** represents content/order/structure; it should not be tied to one PDF engine.
- **Renderers** turn the same model into format-specific outputs.
- **Validation** detects omissions/unsupported content before the extension reports success.
- **UI** presents progress, format options, warnings and cancellation without silently changing content.

### 4.3 Canonical model additions to investigate

Do not blindly create a new schema version. First compare the current schema with the needs below. Add only fields that are missing.

**Document metadata:** conversation title, provider, date/time if available, source conversation ID only when appropriate, export options, warnings, renderer/version information.

**Message fields:** stable source ID when available, role, sequence/order, timestamp when available, branch/path metadata where relevant, content blocks.

**Blocks:** paragraph, heading, ordered/unordered list, quote, code, table, image, diagram/visual, math, attachment, citation/link, separator, unsupported-content placeholder.

**Inline runs:** text, bold, italic, inline code, link, strike/underline/superscript/subscript where supported, and math runs as appropriate.

**Whitespace metadata:** explicit hard breaks, code line breaks, source-preserved line endings where relevant, list depth, paragraph spacing semantics. Do not store arbitrary DOM whitespace as content unless it is meaningful.

**Assets:** media type, dimensions, aspect ratio, source/availability status, local bytes or safe local reference, alt text, and a clear missing-media state.

**Provenance:** whether a block came from source Markdown, semantic HTML, an API payload, or a visual fallback. This helps diagnose format loss and avoids parsing a representation with the wrong parser.

---

## 5. Collection and Completeness: P0

### 5.1 Validate API-backed retrieval rather than assuming endpoints

The supplied audit says the current API approach may use routes that are not valid for native Z.ai. Research and inspect the current page before making API retrieval the preferred source.

Required procedure:

1. Inspect the real conversation URL and conversation ID behavior, including route changes in the SPA.
2. Observe requests made by the authenticated page using browser developer tools or controlled local diagnostics.
3. Verify request method, endpoint, body, response shape, authentication model, pagination/batching, active branch semantics and errors.
4. Confirm no session credentials or conversation content are sent to third parties.
5. Check applicable site terms and access constraints before relying on internal endpoints.
6. Treat undocumented endpoints as unstable and isolate them behind a small adapter.
7. If no reliable data endpoint exists, use a robust DOM collector with explicit completeness checks.

Do not hardcode `/api/v1/chats/:id` or any other route based solely on a third-party example. API access must be same-origin and authorized by the user's existing session. Use minimum necessary host permissions and be transparent about network access.

### 5.2 DOM fallback requirements

If a DOM collector remains necessary:

- Locate and verify the actual scroll container.
- Incrementally collect each mounted message before it is unmounted.
- Store messages in an accumulator across scroll positions.
- Prefer native stable message IDs when available.
- Do not use text fingerprints alone as unique IDs for repeated messages.
- Use sequence and neighboring/source metadata to distinguish identical turns.
- Continue to the true top and bottom; do not report completion merely because an arbitrary attempt count expired.
- Keep a hard safety timeout, but report `incomplete` rather than silently claiming success if the boundary was not reached.
- Wait for lazy-loaded content and streams to settle, with adaptive waiting and a bounded timeout.
- Restore the user's original scroll position even when collection fails.
- Record media while its DOM/source is accessible.
- Avoid relying solely on `scrollHeight`, which may be stable in virtualized lists.

### 5.3 Completeness gate

Before export, report internally and preferably in the UI:

- source method (validated API or DOM fallback),
- detected/retrieved/unique message counts,
- user/assistant counts,
- first/middle/last message sentinel verification,
- duplicate/collision warnings,
- rich block counts,
- media found/embedded/missing counts,
- whether the beginning/end boundary or API record was actually validated.

The validator must not infer the true message count solely from visible DOM bubbles when virtualization is active.

If completeness cannot be established, show a clear warning and do not state that the export is complete. Where useful, allow the user to export a clearly labeled partial copy only after explicit confirmation.

---

## 6. Parsing and Whitespace Preservation: P0

### 6.1 Separate parsers by source type

The implementation should select a parser based on what it received:

- **Rendered DOM:** walk semantic DOM nodes and recognized site components while retaining paragraph/list/code/table/image boundaries.
- **Markdown source:** tokenize Markdown into block and inline tokens with a maintained parser.
- **Structured message/API blocks:** map the native block schema to the canonical model, preserving original ordering and metadata.
- **Visual-only content:** capture the actual rendered visual if semantic reconstruction is not reliable.

Never run Markdown parsing over arbitrary `innerText` as a shortcut to recover HTML semantics. Never turn semantic HTML into plain text and then expect the renderer to recover its structure.

### 6.2 Markdown library research

The upstream Marked release page shows version `18.0.14` dated September 22, 2026 ([Marked releases](https://github.com/markedjs/marked/releases)). The supplied audit mentions `marked` `14.1.1` in development dependencies. **This is a version-gap to inspect, not an automatic upgrade instruction.** Verify the lockfile, Node/browser compatibility, parser behavior, bundle impact and changelog before deciding.

Marked exposes tokens/lexer output that can be mapped to structured blocks. However, Markdown parsing and HTML sanitization are separate responsibilities; if HTML is generated for preview/export, sanitize untrusted content and unsafe URL schemes according to the renderer's security model.

The alternative `remark`/`unified` ecosystem is AST-oriented and plugin-based ([remark repository](https://github.com/remarkjs/remark)). It can be powerful for transformations, but may add more packages and bundle cost than needed. Compare it with a minimal Marked token adapter and the existing parser using the same golden fixtures.

### 6.3 Required paragraph rules

- Each semantic source paragraph becomes a separate paragraph block.
- Preserve explicit hard line breaks when they are part of the displayed content.
- Preserve list-item boundaries and nesting.
- Preserve headings and their hierarchy.
- Preserve meaningful blank lines between distinct blocks.
- Keep inline bold/italic/code/link runs in order.
- Do not collapse all whitespace globally.
- Do not insert blank lines solely because the DOM contains nested wrappers.
- Do not merge adjacent blocks just because both contain text.

### 6.4 Required code rules

Code must have a separate representation from prose.

- Preserve code line order and line breaks.
- Preserve leading indentation and blank lines.
- Avoid `.trim()` or whitespace replacement that alters content.
- Use monospaced font and readable padding.
- Decide whether long lines wrap or continue in a horizontally wide/landscape code view; do not cut characters silently.
- Keep code blocks out of paragraph whitespace normalization.
- Preserve language labels when the source exposes them.
- For long code blocks, paginate between lines where possible rather than shrinking the block to fit one page.

### 6.5 Required div-grid table and callout rules

The supplied audit identifies a likely failure mode: `node.textContent.trim()` may concatenate a custom grid's cells without separators when the markup does not use native `<table>`, `<tr>` and `<td>` elements.

Investigate this rather than indiscriminately converting any grid to a table. Prefer:

1. Native semantic table detection first.
2. Source metadata or known site component signals next.
3. Carefully scoped grid recognition with row/column evidence and a robust fallback.
4. Preservation of the original rendered visual when structure cannot be reliably inferred.

Add fixtures for nested callouts, grid-like tables, flex cards, comparison layouts and normal nested divs so the parser does not incorrectly turn ordinary layout into a table.

---

## 7. PDF Strategy: Readability First

### 7.1 Retain-or-replace decision

The supplied audit reports that the vector exporter uses `pdf-lib` with a custom `PdfLayoutEngine`. `pdf-lib` is a low-level PDF library and does not provide HTML/CSS layout; its official repository documents that limitation ([pdf-lib repository and limitations](https://github.com/Hopding/pdf-lib)). This means line wrapping, block flow, page splitting and rich text behavior are the application's responsibility if `pdf-lib` is retained.

There are two credible approaches:

**Option A — Repair the current vector renderer.**

Keep `pdf-lib` if the project benefits from its small, local, vector-oriented output and the team can correctly implement and test line measurement, rich runs, block splitting, coordinate handling, font fallback and table layout.

**Option B — Prototype a flow-layout engine.**

Evaluate `pdfmake` and/or PDFKit behind the current renderer interface using the same test fixtures. PDFKit documents built-in text wrapping, page flow, text-height/bounds measurement and `continued` rich text segments ([PDFKit text documentation](https://pdfkit.org/docs/text.html)). `pdfmake` offers declarative document definitions, styled text, tables with repeated headers and SVG support ([tables](https://pdfmake.github.io/docs/0.3/document-definition-object/tables/), [styling](https://pdfmake.github.io/docs/0.3/document-definition-object/styling/), [SVG](https://pdfmake.github.io/docs/0.3/document-definition-object/svgs/)).

A flow engine can reduce hand-written coordinate work, but it does not automatically solve extraction, code whitespace, arbitrary site-specific HTML, Bengali complex-script shaping or every browser extension packaging problem.

**Do not decide by library name alone.** Run a focused proof-of-concept and compare the results. The prototype should not be merged until it passes the same acceptance suite as the current engine.

### 7.2 Research update: pdfmake

The official pdfmake changelog lists `0.3.11` on June 12, 2026 and shows recent 0.3.x fixes/features ([official changelog](https://github.com/bpampuch/pdfmake/blob/master/CHANGELOG.md)). The supplied plan cites `0.2.18`, so its version note may be stale. This does **not** mean the project should immediately upgrade or migrate. Inspect installed versions and test the actual browser bundle.

The client-side custom-font documentation describes a virtual file system (VFS) for embedded files/fonts ([pdfmake VFS fonts](https://pdfmake.github.io/docs/0.3/fonts/custom-fonts-client-side/vfs/)). Remote font URLs are not appropriate if the extension promises no runtime third-party font downloads. If using pdfmake, package licensed fonts locally and measure the bundle impact before choosing it.

### 7.3 Research update: PDFKit

PDFKit's official text docs document automatic wrapping, automatic page insertion, text measurements, paragraph gaps and rich-text continuation segments ([PDFKit text documentation](https://pdfkit.org/docs/text.html)). This is relevant to the current renderer's wrapping/flow shortcomings. However, browser bundling, workers/offscreen execution, generated output, font handling, CSP, bundle size and complex-script behavior must still be validated inside this extension. PDFKit is a candidate for a proof-of-concept, not a confirmed replacement.

### 7.4 Browser-native print path as an optional alternative

Competing chat exporters demonstrate that creating a clean, isolated HTML print document and letting the browser lay it out can be a practical option. For example, the open-source [newGptTopdf project](https://github.com/Akash1xe/newGptTopdf) describes an isolated print document with selectable text and a browser print/save workflow. Another [chat exporter project](https://github.com/rashidazarang/chatgpt-chat-exporter) documents print-ready HTML and emphasizes preserving explicit line breaks, code, tables, media and math.

Investigate an optional **High-fidelity / Browser Print PDF** workflow if browser text shaping and CSS page layout materially improve results. But document the trade-off: a print dialog/manual Save as PDF may be required, and this is not the same UX as silently downloading a PDF with `chrome.downloads`. Do not request `chrome.debugger` just to make printing silent without a clear product/security decision; the supplied audit correctly flags permission and user-trust costs as important to evaluate.

### 7.5 Font and Bengali support

`pdf-lib` documents that standard PDF fonts such as Helvetica/Times/Courier have limited character coverage, and that custom fonts require `@pdf-lib/fontkit` registration ([pdf-lib font documentation](https://github.com/Hopding/pdf-lib)). `fontkit` itself describes advanced glyph substitution and positioning capabilities ([fontkit repository](https://github.com/foliojs/fontkit)), while HarfBuzz explains why complex writing systems require script-specific shaping, substitutions, mark positioning and glyph reordering ([HarfBuzz shaping concepts](https://harfbuzz.github.io/shaping-concepts.html)).

Therefore, do **not** assert that merely embedding a Bengali-capable font guarantees correct Bengali. Verify the complete path: script shaping, glyph placement, line measurement, font embedding, cell-width constraints and final PDF output.

Create a dedicated mixed-script golden sample containing common Bengali vowel signs, conjuncts, punctuation, Latin text, digits and code. Render it in every PDF mode and inspect the visual result in a real PDF viewer. Verify that table-cell text stays inside the cell and that searchable text, if promised, remains usable.

### 7.6 PDF page layout requirements

The renderer must:

- Measure text at the actual selected font, font size and available width.
- Wrap each inline run while preserving run styles.
- Calculate line and block height from the same wrapping algorithm used for drawing.
- Track per-page cursor positions without stale coordinates after a page break.
- Isolate page-local and block-local coordinate calculations.
- Split long paragraphs at line boundaries.
- Split long code blocks between lines where possible.
- Split tables by rows and repeat header rows; handle rows taller than a page explicitly.
- Use cell-specific width constraints for wrapping and Unicode/visual fallbacks.
- Preserve image aspect ratio and use controlled page placement.
- Prevent clipping and overlap.
- Avoid orphan headings where practical.
- Add page numbers/header/footer only after body flow is correctly measured.

Never draw a parent card background using an old page coordinate and then continue child content after `addPage()` without recomputing page/local positions. The supplied audit describes this as a suspected coordinate-order problem worth reproducing specifically.

### 7.7 Two PDF modes, clearly named

If the application keeps both modes, label them honestly:

- **PDF — Searchable text:** semantic/flow-oriented document; selectable and searchable where technically supported.
- **PDF — Visual snapshot:** raster-oriented fallback with higher visual fidelity to rendered content but potentially larger files and non-selectable text.

Never present raster PDF as the only answer to layout bugs. Raster can preserve appearance while sacrificing text selection, search, accessibility and smaller file sizes.

---

## 8. DOCX Strategy: Editable, Structured Word Documents

### 8.1 Retain the current DOCX library unless tests show a real limitation

The supplied audit reports that the project uses the `docx` JavaScript library. The upstream release page lists `9.7.2` as a release published September 23, 2026 ([docx releases](https://github.com/dolanmiu/docx/releases)), while the supplied plan describes `9.0.3`. Verify the package-lock and compatibility first; update only through a controlled dependency review and regression tests.

The project should prefer native Word structures:

- Heading and paragraph styles.
- Text runs for bold, italic, inline code and links.
- Native numbering/bullets.
- Native tables and appropriate row/cell options.
- Embedded images.
- Clear page-break and keep-with-next behavior.
- Code blocks with preserved newlines and indentation.

The upstream `docx` documentation describes document-level numbering configuration and reusable numbering definitions ([numbering documentation](https://github.com/dolanmiu/docx/blob/master/docs/usage/numbering.md)). Use native numbering rather than manually prefixing each paragraph with `•` or `1.` if the source structure identifies a list.

### 8.2 Avoid giant, unbreakable code rows

The supplied audit suggests a long code block is placed in one table cell. This can make page breaks awkward. Do not assume `cantSplit: true` is a universal fix: an unbreakable row that is taller than a page can itself create layout problems. Compare a monospaced sequence of code paragraphs against a lightly shaded table/container for short code blocks, and use a strategy that allows long content to continue over pages without losing whitespace.

### 8.3 DOCX acceptance requirements

- Document opens as a valid OOXML package.
- Headings use semantic Word styles.
- Numbered/bulleted lists behave as native lists.
- Paragraph gaps and explicit line breaks are retained.
- Code indentation and blank lines survive.
- Tables remain native tables with readable widths.
- Long content does not become one uneditable text blob.
- Images and math are present where supported.
- Bengali/Unicode is visually correct with common fonts and rendering environments.
- The beginning, middle and end of the conversation are present.

Do not claim visual DOCX quality just because `word/document.xml` contains expected strings. Render the DOCX to PDF in a compatible word processor or inspect it in Word/LibreOffice during end-to-end validation when available.

---

## 9. Other Export Formats

| Format                                                     | Keep / improve                                                        | Key requirements                                                                                                                                                     | Likely priority |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Markdown                                                   | Preserve as a rich source/portable archive                            | Semantic headings/lists/tables, fenced code, language labels, inline links, math syntax, meaningful newlines, safe image references                                  | P1              |
| HTML                                                       | Strong high-fidelity reading/export option                            | Standalone CSS/assets where promised, print styles, responsive screen reading, safe sanitized content, keyboard/accessibility basics                                 | P1              |
| TXT                                                        | Intentionally plain, but never join content carelessly                | Speaker labels, paragraphs, line breaks, code indentation, separators and clear missing-media placeholders                                                           | P1              |
| JSON                                                       | Treat as canonical structured archive if current schema supports it   | Versioned schema, stable order, metadata, assets/asset references, warnings, validation and backward compatibility                                                   | P1              |
| CSV                                                        | Keep intentionally tabular                                            | Quote escaping, UTF-8/BOM policy, one row per message or documented row model, separate fields for role/time/text; explain that rich formatting is not representable | P2              |
| PNG                                                        | Preserve as visual snapshot, with long-chat support                   | Split/tile long documents, consistent width, prevent browser canvas limits from silently truncating output, clear warning for very large files                       | P2              |
| EPUB (possible future format)                              | Research only after PDF/DOCX correctness                              | Semantic reading order, table/code/image support, local asset packaging and validation in common readers                                                             | P3              |
| ZIP package for Markdown + assets (possible future format) | Consider if local image attachments cannot travel with one `.md` file | Portable relative image paths, deduplicate repeated assets, manifest and clear directory structure                                                                   | P2/P3           |

Do not add more formats until core PDF/DOCX correctness is demonstrated. A growing list of output formats is not valuable if their content is damaged.

---

## 10. Competitive Research: What to Learn from Other Chat Exporters

### 10.1 ChatGPT Chat Exporter

The open-source [rashidazarang/chatgpt-chat-exporter](https://github.com/rashidazarang/chatgpt-chat-exporter) documents a shared extraction engine, long/virtualized conversation handling, preservation of explicit line breaks/indentation, code, tables, math, images and citations, and print-ready HTML for PDF. It also documents cases where the export intentionally falls back to the page because a conversation record is unavailable.

**Lessons to evaluate, not copy blindly:**

- Have one extraction/normalization path feed multiple outputs.
- Protect preformatted regions from whitespace cleanup.
- Capture media bytes when available; otherwise keep links or explicit placeholders.
- Explain which source method was used and whether completeness was verifiable.
- Keep print CSS independent from the target website's CSS.

### 10.2 newGptTopdf

The open-source [Akash1xe/newGptTopdf](https://github.com/Akash1xe/newGptTopdf) documents a provider-neutral message model, an isolated print document, structured formatting, controlled long-chat collection, and a browser print/save workflow.

**Lessons to evaluate:**

- Use an isolated rendering document rather than inheriting the target website's UI styles.
- Provide A4/Letter and layout controls.
- Treat code/math/table/image preservation and first/middle/last verification as separate features.
- Consider browser-native print as an optional high-fidelity mode, not automatically as the only PDF engine.

Before borrowing implementation ideas or code, inspect the current repository and license; do not copy code without license-compatible handling and attribution.

### 10.3 Product behavior to target

Aim for these user-visible characteristics found in readable chat-export workflows:

- Clear `You` / `Z.ai` labels.
- Consistent message separators/cards.
- Comfortable body type size and paragraph rhythm.
- Distinct heading hierarchy.
- Code blocks visually separated from prose.
- Proper lists and tables.
- Preserved references, links, math and images when available.
- Stable page layout independent of the Z.ai UI theme.
- Clear status/errors if the source content cannot be recovered.

---

## 11. Technology Comparison: Candidates, Trade-Offs, and Decision Method

### 11.1 Candidate matrix

| Candidate                                    | Strong use case                                       | Strengths supported by research                                                              | Risks / limits                                                                                                                     | Recommended next step                                                           |
| -------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Current `pdf-lib` + custom layout            | Small, local vector PDF with complete control         | Low-level PDF objects; custom font embedding through fontkit                                 | App must implement its own text flow, measurement, pagination, rich runs and table layout; verify complex-script output            | Repair a minimal path and create golden tests before deciding to retain         |
| `pdfmake` 0.3.x                              | Declarative multi-page PDF layout                     | Flow-based document definitions; table header rows; text styles; SVG support                 | Browser integration/bundle size, font VFS size, complex-script shaping and CSP must be tested                                      | Build an isolated comparison prototype with local fonts                         |
| PDFKit                                       | Text-heavy flowing PDFs with metrics/rich text        | Official docs cover auto wrapping/pages, width/height measurement and rich text continuation | Browser bundle and extension/offscreen compatibility; fonts/script shaping still need validation                                   | Prototype only if it integrates cleanly with MV3                                |
| Isolated HTML/CSS + browser print            | Faithful typography and complex browser-rendered HTML | Browser engine controls CSS layout, line wrapping, web-font shaping and print CSS            | Typically opens a print/save dialog; automated download UX differs; page-break control and offscreen behavior need browser testing | Consider as optional “High-fidelity Print PDF” mode                             |
| `html2pdf.js` / `html2canvas` raster capture | Visual snapshot of rendered content                   | Can capture complex CSS appearance                                                           | Non-selectable text, large files, canvas limits, arbitrary page slicing                                                            | Retain as fallback, not as the primary readable text PDF                        |
| Current `docx` package                       | Editable Word documents                               | Native OOXML structures, paragraphs, runs, tables, numbering                                 | Requires correct model-to-OOXML mapping and testing in real word processors                                                        | Retain and improve semantic fidelity                                            |
| Marked tokenization                          | Actual Markdown source                                | Provides Markdown tokens; upstream release 18.0.14 is listed on September 22, 2026           | Use only for real Markdown; must handle raw HTML/sanitization separately; check existing dependency and bundle compatibility       | Compare against installed version and implement a narrow adapter if appropriate |
| `remark` / `unified` AST                     | Complex Markdown transformations                      | AST and plugin-oriented processing                                                           | More components/configuration may increase bundle and maintenance cost                                                             | Consider only if transformation needs justify it                                |

### 11.2 Why no unconditional library migration is recommended

The primary symptoms combine **data fidelity, whitespace policy and layout correctness**. A new PDF package cannot recover structure discarded by the scraper. An improved parser cannot fix a PDF renderer that uses incorrect coordinates. A larger font cannot fix a table cell that is rendered wider than its column.

Therefore, decide based on a common golden corpus and end-to-end results, not a marketing comparison or a single unit test.

### 11.3 Suggested bake-off

Create two isolated renderers for the same canonical model:

- Renderer A: repaired current `pdf-lib` layout.
- Renderer B: `pdfmake` or PDFKit, selecting one after a quick packaging feasibility check.
- Optional Renderer C: isolated HTML/CSS print workflow, noting that the user may need to confirm Save as PDF.

Test identical fixtures and compare:

- paragraph spacing,
- explicit line breaks,
- heading hierarchy,
- inline bold/italic/code,
- code indentation,
- long code page splits,
- narrow and wide tables,
- Bengali in body text and table cells,
- math/SVG/image placement,
- selectable/searchable text,
- PDF size,
- time and peak memory,
- MV3 and offline behavior.

Choose the winning implementation only after the same acceptance suite passes. Keep the old engine available behind a feature flag until parity is demonstrated.

---

## 12. Product Improvements Worth Adding

These suggestions should be ranked after the correctness work.

### 12.1 P0 — Correctness and failure visibility

- **Whitespace contract:** explicit code/prose/Markdown/HTML whitespace policies, with regression tests.
- **Structure diagnostics:** display block counts and warnings for suspiciously flattened messages.
- **Completeness gate:** distinguish complete, incomplete and unverified capture.
- **Media manifest:** count embedded, linked, unavailable and failed assets.
- **Repeated-message safe IDs:** preserve identical consecutive prompts as separate turns.
- **Error details:** say what failed and what the user can try; do not show generic “export successful” if validation failed.
- **Long-content pagination:** never fit-to-page shrink arbitrary paragraphs/code/table contents.

### 12.2 P1 — Reader-quality controls

- Readable, Conversation, Compact, Academic/Study themes.
- A4/Letter and portrait/landscape option where appropriate.
- Code line wrapping setting; preserve every character even when wrapping.
- Separate style choices for user and assistant blocks.
- Optional timestamps/model labels.
- Clear citations and clickable links.
- Contents/bookmarks for long documents if the selected engine supports reliable destinations.
- Header/footer and page-number toggles.
- Table-of-contents generation only from true heading blocks.
- Accessible contrast and font sizes.

### 12.3 P1 — Export quality preview

Preview should use the same document model and style rules as the final exporter. Include:

- selected format and preset,
- message count,
- detected block counts,
- pages/page count when known,
- missing-media warnings,
- unsupported-block warnings,
- first/middle/last content sentinels in diagnostics,
- option to cancel before downloading.

Do not use a preview that renders correctly through HTML while the PDF renderer receives a flattened string without warning.

### 12.4 P2 — Productivity

- Select messages or a range of turns.
- Export last N turns or user prompts only.
- Filename templates such as `{{date}}-{{title}}-{{format}}`.
- Per-format presets.
- One-click Markdown copy.
- Batch export only if the site has a reliable, user-authorized way to select multiple conversations.
- Optional Markdown+images ZIP for portable archives.
- Progress bar, cancellation and retry for large chats.

### 12.5 P3 — Later ideas

- EPUB export for e-readers.
- Full-text local archive search.
- Custom style templates.
- Additional chat providers, only after a provider-neutral architecture and a privacy/compatibility review.
- Plugin-like renderer system if external contributor demand justifies it.

Do not start P2/P3 features before PDF/DOCX readability and completeness are proven.

---

## 13. Test Strategy: Evidence Must Match the User's Problem

### 13.1 Four separate test layers

1. **Parser/model unit tests:** prove content becomes the right block tree and inline runs.
2. **Renderer structural tests:** prove PDF/DOCX contain the expected blocks, page breaks and text/assets.
3. **Real-browser tests:** load the unpacked MV3 extension in Chromium, test UI/workflow and use a controlled real Z.ai session when available.
4. **Visual regression tests:** render PDFs to page images and compare with reviewed goldens in a pinned environment.

Playwright officially documents Chromium extension testing with a persistent context and retrieving the extension service worker ([Playwright Chrome extension testing](https://playwright.dev/docs/chrome-extensions)). It also supports screenshot comparisons with `toHaveScreenshot()` and warns that OS/browser/environment differences affect screenshots ([visual comparisons](https://playwright.dev/docs/test-snapshots)). Pin the browser/runtime for visual baselines and review legitimate differences rather than blindly updating snapshots.

### 13.2 Golden test corpus

Create sanitized fixtures for:

- short chat and long chat,
- one assistant response containing headings, paragraphs, bold, italic, lists, code, table and links,
- a response with explicit line breaks and blank lines,
- code with 2/4/8-space indentation, tabs if represented, empty lines and backslashes,
- repeated identical prompts in distinct turns,
- native HTML table and div/grid-based comparison table,
- nested card/callout layouts that must **not** become tables,
- Bengali-only and mixed Bengali/English text,
- Bengali in a narrow table cell,
- Unicode symbols and math,
- images/SVG/canvas/chart when available,
- a message with unavailable media,
- a long paragraph, long code block and table with long cells,
- missing HTML or Markdown representation in an API-derived block,
- truncated stream/incomplete retrieval.

Do not store real private conversation content in fixtures unless deliberately sanitized and explicitly intended for the repository.

### 13.3 Whitespace acceptance tests

Use exact string assertions before rendering, such as:

```text
Paragraph 1

Paragraph 2

    indented line
        nested line

last line
```

The expected normalized model must preserve:

- two distinct paragraph blocks,
- explicit blank-line semantics where present,
- indentation inside the code block,
- line order,
- text content without character loss.

Run equivalent checks for PDF text extraction where selectable text is expected, DOCX XML/run structure, and final page images. For a print/raster mode, visual checks are still required because text extraction is not sufficient.

### 13.4 Layout assertions

Do not use only a single Y-coordinate threshold and claim it proves no overlap. Prefer a combination of:

- block measurement unit tests,
- actual PDF text extraction and page bounds,
- table-cell width assertions,
- image aspect-ratio assertions,
- rendered-page visual diffs,
- manual review of all high-risk golden pages.

Use visual thresholds carefully and keep reference images reviewed.

### 13.5 Real live-site acceptance

When a logged-in Z.ai test session is available, export the same real conversation using the extension and inspect:

- first, middle and last messages;
- total and unique message counts;
- repeated prompts;
- headings, paragraphs, lists, code, tables and media;
- actual downloaded PDF/DOCX;
- browser console and extension error output.

If live credentials or access are unavailable, mark this test **BLOCKED / NOT RUN**. Do not substitute a synthetic simulation and label it a real-site test.

---

## 14. Acceptance Criteria: Definition of Done

### 14.1 Data completeness

- No silent truncation.
- Original message order preserved.
- Repeated identical messages remain distinct when they are separate turns.
- Beginning/middle/end verified.
- A failed/incomplete collection does not falsely report success.

### 14.2 Structure

- Paragraphs stay separate.
- Headings remain distinguishable and hierarchical.
- Lists preserve item order and nesting.
- Inline bold/italic/code/link remains where source data exposes it.
- Code preserves line breaks and indentation.
- Tables do not flatten into text.
- Images/diagrams/math are preserved where available or explicit warnings/placeholders are used.

### 14.3 Whitespace and typography

- No global whitespace collapse on all content.
- No arbitrary removal of blank lines/explicit line breaks.
- No code `.trim()` that removes meaningful indentation.
- Body text remains comfortably readable at normal page zoom.
- Long content adds pages instead of shrinking.
- Paragraph spacing is consistent.
- No page-wide shrink-to-fit for text.
- No clipping, collision or spillover into table cells.

### 14.4 PDF

- Selectable/searchable text where promised by that mode.
- Sensible A4/Letter layout and margins.
- Correct page breaks and page numbers.
- No broken Bengali glyph placement in the golden corpus.
- Tables repeat their headings and wrap within cell bounds where supported.
- Images preserve aspect ratio.
- PDF opens in Chrome and at least one independent PDF viewer.

### 14.5 DOCX

- Valid OOXML package.
- Editable semantic paragraphs/headings/lists/tables.
- Correct code formatting and whitespace.
- No lost beginning, middle or end content.
- Correct media and math where supported.
- Visually checked in Word or LibreOffice if available.

### 14.6 Other formats

- Each format preserves everything its format can reasonably represent.
- Unsupported rich content is documented or represented with a warning/placeholder rather than silently deleted.
- JSON schema is stable and versioned.
- CSV's loss of rich structure is explicit and expected.

### 14.7 Release evidence

A release report must differentiate:

- unit tests passed,
- production build passed,
- synthetic tests passed,
- real browser test passed,
- real Z.ai test passed,
- visual inspection passed.

These are separate results.

---

## 15. Updated Phased Development Roadmap

### Phase 0 — Reproduce and freeze the baseline (P0)

**Goal:** Prove exactly what currently breaks before modifying the code.

Tasks:

1. Record current branch, commit, working tree, dependency versions, build/test results.
2. Store one anonymized known-bad PDF and its source/fixture.
3. Render the known-bad PDF pages to images.
4. Record which page regions show tiny text, flattened paragraphs, line collisions, table bleed or missing whitespace.
5. Create a real message trace: source → raw extraction → parsed blocks → renderer input.
6. Separate reproduced defects from inherited audit hypotheses.

**Exit criteria:** Every P0 defect has a reproducible case or is clearly marked unconfirmed.

### Phase 1 — Retrieval and completeness (P0)

**Goal:** Never silently export only part of a long conversation.

Tasks:

- Verify live API availability/authentication if considering API retrieval.
- Validate active conversation/branch identification.
- Harden DOM fallback and boundary verification.
- Fix duplicate-identity collisions.
- Wait for streaming/lazy load robustly.
- Add completeness status and first/middle/last checks.
- Capture asset information before virtualized DOM removal.

**Exit criteria:** Validated API records or real DOM boundary evidence prove the complete active conversation was collected; otherwise export is marked incomplete.

### Phase 2 — Semantic parser and whitespace contract (P0)

**Goal:** Preserve the real content structure before rendering.

Tasks:

- Keep source-aware parsing paths.
- Replace brittle Markdown regex parsing with a maintained tokenizer only where input is Markdown.
- Improve semantic DOM parsing for nested content and div-based tables.
- Preserve paragraphs, explicit line breaks, lists, code and inline runs.
- Add code-specific whitespace protection.
- Preserve media and unsupported-content warnings.
- Add flattening detection and model invariants.

**Exit criteria:** Golden fixtures produce correct block trees, ordered lists, code/table structure and exact relevant whitespace. No rich response is silently reduced to one text block.

### Phase 3 — PDF proof-of-concept and renderer repair (P0)

**Goal:** Produce readable, paginated PDF without overlaps or content loss.

Tasks:

1. Fix the existing renderer's confirmed defects, including stale page/cursor coordinate use and wrong text width constraints if reproduced.
2. Add rich inline runs to PDF wrapping/drawing.
3. Use the same calculations for measurement and drawing.
4. Add block splitting for long prose/code and controlled table pagination.
5. Verify Bengali shaping/rendering end-to-end.
6. Build a small `pdfmake` or PDFKit proof-of-concept (select one based on packaging feasibility) and compare it with the repaired current renderer.
7. Optionally prototype HTML/CSS print PDF as a clearly user-driven alternate mode.
8. Measure bundle impact, export time, output size and memory.

**Exit criteria:** The selected engine wins the same golden test suite, preserves meaningful whitespace, and passes visual inspection. Do not migrate if the prototype does not materially improve quality.

### Phase 4 — DOCX fidelity (P0/P1)

**Goal:** Make Word output editable and semantically structured.

Tasks:

- Native numbering for ordered/unordered lists.
- Correct heading hierarchy and paragraph spacing.
- Inline text runs.
- Multi-page code block design.
- Native table cells, sensible widths and row split strategy.
- Media/math preservation.
- Compatibility review of installed `docx` version versus current releases.

**Exit criteria:** A representative long DOCX opens and remains readable in a real word processor; structure and whitespace tests pass.

### Phase 5 — Make other formats consistent (P1)

**Goal:** All exporters consume the same validated semantic model.

Tasks:

- Add robust fallback for missing `block.html` / source forms.
- Preserve code/list/table semantics in Markdown.
- Keep HTML export self-contained and safe.
- Preserve TXT paragraph/code breaks.
- Version JSON model and ensure assets/warnings are represented.
- Make CSV's intentionally lossy tabular representation clear.
- Add long-output slicing to PNG rather than losing tall content.

**Exit criteria:** Each exporter has a format-specific test matrix and no silent content loss for supported content.

### Phase 6 — Reader experience (P1/P2)

**Goal:** Make it easy for users to read the exported file immediately.

Tasks:

- Readable default preset.
- Conversation and Study Notes themes.
- A4/Letter and portrait/landscape controls where appropriate.
- Code wrapping option.
- Optional timestamps and model labels.
- Progress/status, cancel/retry.
- Preview using the actual renderer/model.
- Specific error and missing-media warnings.

**Exit criteria:** A new user can export and read a long mixed-content conversation without needing to fix the document manually.

### Phase 7 — Performance, privacy and security (P1/P2)

**Goal:** Keep large exports predictable and local-first.

Tasks:

- Measure memory and time for 50/100/300+ messages.
- Avoid sending very large base64 blobs through one runtime message where possible.
- Process/chunk media and large model payloads safely.
- Revoke object URLs and release resources.
- Minimize host permissions and document any authenticated endpoint access.
- Review untrusted HTML/SVG links, sanitization, dependency risks and PII options.
- Ensure sensitive conversation text is not stored in debug logs by default.

**Exit criteria:** Documented resource limits, clear errors, privacy behavior matching reality and no unnecessary permissions.

### Phase 8 — Regression suite and release process (P1)

**Goal:** Prevent the same user-facing failure from returning.

Tasks:

- Parser/unit regression tests.
- Exporter structural tests.
- Playwright MV3 extension tests where feasible.
- Repeatable real Z.ai test procedure.
- Golden rendered PDF page images and reviewed diffs.
- DOCX render/inspection workflow.
- Known limitations and release checklist.

**Exit criteria:** Test report distinguishes mock/synthetic from actual live-site evidence.

---

## 16. Actionable Implementation Tickets

### ZAI-001 — Golden reproduction fixture

- **Priority:** P0
- **Problem:** The actual user-visible PDF is dense/flattened, but prior tests did not prevent recurrence.
- **Likely areas:** `tests/`, PDF diagnostics, sanitized fixtures.
- **Work:** Create a representative long mixed-content source fixture and preserve the known-bad render as a baseline.
- **Acceptance:** Repro is deterministic and the failure is visible in the report; no private conversation data is committed.

### ZAI-002 — Trace structure through the live pipeline

- **Priority:** P0
- **Problem:** It is not known whether structure is lost during retrieval, parsing or PDF rendering.
- **Likely areas:** scraper, canonical model, export routing, vector/raster PDF, DOCX.
- **Work:** Add temporary opt-in structural diagnostics with block counts and source provenance, avoiding full message logging.
- **Acceptance:** A single real message can be compared at each stage and the first broken stage is identified.

### ZAI-003 — Whitespace preservation policy

- **Priority:** P0
- **Problem:** Meaningful spaces and line breaks disappear or become inconsistent.
- **Likely areas:** scraper, parser, canonical model, all renderers.
- **Work:** Separate prose, explicit break, code/preformatted, list and table rules; remove global normalization only where it causes loss.
- **Acceptance:** Exact model-level tests for paragraphs, blank lines, code indentation and repeated spaces pass.

### ZAI-004 — Div/grid table and callout preservation

- **Priority:** P0
- **Problem:** Non-semantic HTML grids may be concatenated as plain text.
- **Likely areas:** `parseBlocks()` and related parser helpers.
- **Work:** Recognize well-evidenced table-like layouts; retain a visual fallback when rows/cells cannot be reliably inferred.
- **Acceptance:** Tables keep rows/columns, while normal div layouts remain normal content.

### ZAI-005 — Long-chat boundary and identity correctness

- **Priority:** P0
- **Problem:** Fixed attempt ceilings and fingerprint collisions may silently omit messages.
- **Likely areas:** `FullConversationCollector`, message identity and ordering.
- **Work:** Fix verified cause; use stable source IDs where available; avoid text-only unique IDs; add explicit completeness state.
- **Acceptance:** Repeated identical messages remain distinct and long-chat first/middle/last markers survive. Real-site test is separately reported.

### ZAI-006 — Vector PDF layout correctness

- **Priority:** P0
- **Problem:** Text overlaps; card/page breaks can reuse stale coordinates; rich runs are reportedly lost.
- **Likely areas:** `pdf-vector.js` layout/draw/card/table methods.
- **Work:** Reproduce exact coordinate bug, ensure cursor/page state is recomputed after page breaks, support inline runs and consistent measure/draw calculations.
- **Acceptance:** No text collision/clipping in golden PDFs; content widths respect actual cell width.

### ZAI-007 — Bengali/complex-script layout validation

- **Priority:** P0
- **Problem:** Font embedding alone may not create correctly shaped Bengali glyphs; cells reportedly overflow.
- **Likely areas:** PDF renderer, font/Unicode helpers, visual test corpus.
- **Work:** Test shaping, mark placement, font coverage, fallback and line measurement with representative Bengali samples. Prototype browser-print rendering if the current vector path cannot meet quality requirements.
- **Acceptance:** Visual output verified in body and tables; no spill outside cells.

### ZAI-008 — PDF engine bake-off

- **Priority:** P1 after ZAI-002/003
- **Problem:** The current hand-written flow engine may be expensive to maintain.
- **Likely areas:** PDF exporter adapter, test tooling.
- **Work:** Compare repaired pdf-lib, one flow-based candidate (`pdfmake` or PDFKit) and optionally an isolated browser-print path.
- **Acceptance:** Same fixture corpus, documented trade-offs, bundle/time/size metrics, no wholesale migration without measurable benefit.

### ZAI-009 — Native DOCX numbering and code pagination

- **Priority:** P1
- **Problem:** Lists may use literal characters; long code blocks may break awkwardly.
- **Likely areas:** `docx.js` and tests.
- **Work:** Use native numbering definitions and a long-code layout that can split across pages safely.
- **Acceptance:** Lists remain editable as native lists; long code is complete and readable.

### ZAI-010 — PDF/DOCX visual regression pipeline

- **Priority:** P1
- **Problem:** Unit tests do not catch dense or visually broken output.
- **Likely areas:** tests, Playwright, PDF render tools/CI if feasible.
- **Work:** Render golden PDFs to PNG, compare reviewed visual snapshots, inspect DOCX via conversion or a supported word processor.
- **Acceptance:** A changed layout creates a reviewed diff; visual regressions cannot be hidden by a successful build alone.

### ZAI-011 — Export progress and warnings

- **Priority:** P2
- **Problem:** Users may not know whether collection/rendering is still working or content is missing.
- **Likely areas:** UI and export orchestration.
- **Work:** Display progress phase, counts, warning state, cancel/retry and final validation summary.
- **Acceptance:** Incomplete collection is not shown as normal success.

### ZAI-012 — Readability presets

- **Priority:** P2, only after correctness
- **Problem:** Users need documents that are easy to read without editing them manually.
- **Likely areas:** options/panel, canonical styles, PDF/DOCX renderers.
- **Work:** Add Readable, Conversation, Compact and Study Notes presets with stable defaults.
- **Acceptance:** Presets change presentation but never remove content, collapse meaningful whitespace or silently shrink huge blocks.

---

## 17. Research Sources and Findings (Checked October 16, 2026)

These links support the technology capability claims in this plan. They do not prove that a library is a suitable drop-in replacement for this project.

1. **pdf-lib — project and limitations**: https://github.com/Hopding/pdf-lib  
   Explains that pdf-lib does not lay out HTML/CSS; custom fonts can be embedded with fontkit. Relevant to the distinction between a PDF drawing library and a document-flow engine.

2. **PDFKit — text layout and measurement**: https://pdfkit.org/docs/text.html  
   Documents automatic wrapping/page flow, text width/height/bounds measurements, paragraph spacing, and continued rich-text segments.

3. **pdfmake — changelog**: https://github.com/bpampuch/pdfmake/blob/master/CHANGELOG.md  
   The changelog lists 0.3.11 on June 12, 2026, along with ongoing 0.3.x changes. Verify release/stability and packaging status before adoption.

4. **pdfmake — tables**: https://pdfmake.github.io/docs/0.3/document-definition-object/tables/  
   Documents declarative tables, cell spans, widths, and repeated header rows across pages.

5. **pdfmake — styling**: https://pdfmake.github.io/docs/0.3/document-definition-object/styling/  
   Documents font size, line height, text alignment, font feature and decoration options.

6. **pdfmake — SVG**: https://pdfmake.github.io/docs/0.3/document-definition-object/svgs/  
   Documents SVG nodes and proportional sizing behavior.

7. **pdfmake — browser custom fonts/VFS**: https://pdfmake.github.io/docs/0.3/fonts/custom-fonts-client-side/vfs/  
   Explains bundling fonts and other files in a client-side virtual file system. The bundle cost must be measured for this extension.

8. **docx — release history**: https://github.com/dolanmiu/docx/releases  
   The release page lists version 9.7.2 published September 23, 2026. Compare with the actual lockfile before choosing to upgrade.

9. **docx — numbering**: https://github.com/dolanmiu/docx/blob/master/docs/usage/numbering.md  
   Explains document-level numbering configuration and reusable native list definitions.

10. **Marked releases**: https://github.com/markedjs/marked/releases  
    The release page lists 18.0.14 on September 22, 2026. The project plan refers to 14.1.1; verify installed version and compatibility rather than upgrading automatically.

11. **remark**: https://github.com/remarkjs/remark  
    Describes the AST/plugin model for structured Markdown processing. Compare its complexity with the minimal parser adapter actually needed.

12. **HarfBuzz — shaping concepts**: https://harfbuzz.github.io/shaping-concepts.html  
    Explains that many scripts require substitutions, positioning, mark placement and script-specific layout; font coverage alone is not proof of correct visual shaping.

13. **fontkit**: https://github.com/foliojs/fontkit  
    Describes font parsing, glyph metrics and advanced OpenType substitution/positioning capabilities. Test the whole PDF integration rather than inferring output quality from a font library's feature list.

14. **Chrome Offscreen API**: https://developer.chrome.com/docs/extensions/reference/api/offscreen  
    Explains the offscreen-document API and limitations, including that extension APIs available in an offscreen document are restricted and `chrome.runtime` is the supported extension API there.

15. **Chrome optional permissions**: https://developer.chrome.com/docs/extensions/reference/api/permissions  
    Explains requesting optional permissions at runtime, which can reduce required install-time access and provide user control.

16. **Playwright — testing Chrome extensions**: https://playwright.dev/docs/chrome-extensions  
    Documents loading Chromium extensions in a persistent context and testing MV3 extension service workers.

17. **Playwright — visual comparisons**: https://playwright.dev/docs/test-snapshots  
    Documents screenshot-based visual regression testing and cautions that browser/OS/environment differences affect visual snapshots.

18. **ChatGPT Chat Exporter reference project**: https://github.com/rashidazarang/chatgpt-chat-exporter  
    Its README discusses preservation of explicit line breaks and indentation, code/table/math/media, long conversations, source-method fallbacks and print-ready HTML. It is a design reference, not evidence that the same approach will work unchanged on Z.ai.

19. **newGptTopdf reference project**: https://github.com/Akash1xe/newGptTopdf  
    Its README describes a normalized message model, isolated print rendering and selectable-text PDF via a browser print/save workflow. Verify its current license and code before borrowing anything.

20. **Chrome permissions guidance**: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions  
    Explains required versus optional permissions and why access should be scoped to the extension's actual functionality.

---

## 18. Final Architectural Recommendation

1. **Fix content preservation first.** The source-to-model path must retain meaningful whitespace and semantic blocks.
2. **Fix completeness second, with a real boundary or validated source record.** Do not rely on a synthetic virtualization test alone.
3. **Fix the current PDF engine's measured defects and run a controlled engine comparison.** Do not switch dependencies merely because another library has a flow API.
4. **Use a shared canonical model, but keep PDF and DOCX renderers format-specific.** They have different capabilities and layout rules.
5. **Make readable formatting the default.** Preserve paragraphs, explicit breaks, headings, lists, code, tables, visual content and page structure; never shrink whole messages to fit.
6. **Treat Bengali/complex scripts as a real rendering requirement.** Test fonts, shaping and table-cell constraints in generated output.
7. **Add preview/progress/warnings after core correctness is proven.** These features make failures visible rather than hiding them.
8. **Adopt a multi-layer regression suite.** A successful build, valid file signature or passing unit tests does not prove an export is visually readable.
9. **Document the distinction between text PDF and visual/raster PDF.** Give users an honest choice where the technical trade-offs differ.
10. **Do not call the project complete until the golden tests and real-browser results pass.** If a live Z.ai session is unavailable, report that limitation explicitly.

### Final definition of success

The same representative Z.ai conversation must retain its message order, meaningful whitespace and rich-content structure from source through model to PDF/DOCX. The output must be complete, readable at normal zoom, editable where expected, and free of avoidable overlap, clipping, lost code indentation, flattened tables, or silent media loss.

**The highest-priority objective is not fewer pages or prettier decoration. It is a complete, readable file that preserves the way the original chat is written.**
