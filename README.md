<p align="center">
  <img src="./assets/banner.gif" alt="Z.ai Chat Exporter — 3D Animated Banner" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/md-aktaruzzman-emon/Z.ai-Chat-Exporter/releases"><img src="https://img.shields.io/badge/version-2.1.0-blue?style=flat-square" alt="Version 2.1.0" /></a>
  <img src="https://img.shields.io/badge/manifest-v3-orange?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/platform-Chrome-yellow?style=flat-square&logo=google-chrome" alt="Platform Chrome" />
  <img src="https://img.shields.io/badge/privacy-100%25%20local-green?style=flat-square" alt="100% Local Privacy" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="License MIT" /></a>
  <img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build Passing" />
  <img src="https://img.shields.io/badge/tests-61%20passed-brightgreen?style=flat-square" alt="Tests 61 Passed" />
</p>

<h3 align="center">
  High-fidelity conversation exporter for <a href="https://chat.z.ai/">Z.ai</a> (Zhipu AI) — export long threads to PDF, Word (DOCX), Markdown, HTML, JSON, CSV, TXT, and PNG with zero text overlap, virtualized DOM collection, and 100% client-side privacy.
</h3>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-supported-export-formats">Supported Formats</a> •
  <a href="#-architecture--data-pipeline">Architecture</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-usage-guide">Usage Guide</a> •
  <a href="#-privacy--security">Privacy & Security</a> •
  <a href="#-development--testing">Development & Testing</a> •
  <a href="#-known-limitations">Limitations</a> •
  <a href="#-license">License</a>
</p>

---

## 📖 Overview

Exporting AI chat sessions from modern single-page applications is notoriously difficult:
- **Virtualized DOM Containers:** Virtual scroll containers unmount off-screen messages, causing standard scrapers and browser print dialogs to truncate long conversations (>30 messages).
- **Linebreak Collapsing & Text Overlap:** Naive PDF generators collapse whitespace and miscalculate bounding boxes, rendering code blocks and multi-line responses into overlapping or unreadable text streams.
- **Lost Mathematical Notation & Tables:** Raw LaTeX formulas (`$...$`, `\[...\]`) and complex tabular data often degrade into broken plaintext characters.
- **Unprotected PII & External Relays:** Many extensions send chat transcripts to third-party cloud servers for rendering, compromising sensitive prompts and code.

**Z.ai Chat Exporter** is a production-grade Chrome Extension (Manifest V3) built to solve these issues directly on **[chat.z.ai](https://chat.z.ai/)**. It features a bi-directional virtualized collector, an offline document layout engine, mathematical typography rendering, and client-side PII sanitization — executing entirely within your browser sandbox.

---

## ✨ Key Features

| Capability | Technical Implementation |
|---|---|
| 🔄 **FullConversationCollector** | Bi-directional incremental scroll engine scans and accumulates virtualized DOM nodes into an in-memory map before they are recycled by the browser. Captures 200+ message threads without loss. |
| 🛡️ **Deterministic Message Fingerprinting** | Content identity hashing (`role:textLen:startStr:endStr`) prevents duplicate entries and guarantees exact chronological ordering. |
| 📄 **Zero-Overlap PDF Engine** | Custom `PdfLayoutEngine` pre-measures every text block, heading, table row, and code segment using vector glyph metrics before drawing, completely eliminating line collisions. |
| 🎨 **'extrention z' Visual Style** | Distinctive card styling: mint-green user prompt cards (`#f0fdf4` fill, `#86efac` border), embedded white file attachment cards with metadata badges (`PDF • 1.4 MB`), and running headers/footers with dynamic page numbering (`Page X of Y`). |
| 📝 **Native Word / DOCX Generation** | Outputs valid OpenXML `.docx` files with true heading hierarchy (`Heading 1-3`), monospaced code blocks (`Consolas`), styled XML tables, callout blocks, and `keepWithNext` orphan protection. |
| 📐 **Offline KaTeX Math Rendering** | Converts LaTeX equations offline without CDN dependencies: vector SVG paths for PDF, native Office Math Markup Language (OMML) for Word, and inline rendered math for HTML/Markdown. |
| 🧹 **Client-Side PII Anonymization** | Local regular expression engine redacts email addresses, telephone numbers, API keys (`sk-...`), bearer tokens, and JWTs prior to serialization. |
| 🌐 **100% In-Browser Privacy** | Zero external API calls, zero analytics trackers, and zero telemetry. All parsing, document compilation, and file generation run in browser memory. |
| 🌍 **Bilingual Localization** | Full UI and typography support in English (`en`) and Bengali (`bn`), including baseline-aligned font rendering for complex Indic glyph scripts. |

---

## 📤 Supported Export Formats

Z.ai Chat Exporter provides 8 dedicated export targets:

| Format | Extension | Generation Engine | Primary Characteristics |
|:---:|:---:|:---:|---|
| **PDF (Vector)** | `.pdf` | `pdf-lib` + `PdfLayoutEngine` | Searchable selectable text, crisp vector math, mint user cards, running headers & footers, zero text overlap. |
| **Word (DOCX)** | `.docx` | `docx.js` | Fully editable document with native Microsoft Word tables, callouts, and OMML mathematical equations. |
| **Markdown** | `.md` | Built-in Serializer | Clean GFM (GitHub Flavored Markdown) with Obsidian callout support and Notion-compatible table formatting. |
| **HTML** | `.html` | Built-in Renderer | Self-contained HTML file with embedded CSS, syntax-highlighted code blocks, and inlined KaTeX mathematical styles. |
| **JSON** | `.json` | Canonical Serializer | Structured schema containing raw message objects, timestamps, role metadata, and parsed block trees for archival or LLM fine-tuning. |
| **CSV** | `.csv` | Built-in Serializer | Tabular dataset format (`index`, `role`, `timestamp`, `content`) suitable for spreadsheet analysis. |
| **Plain Text** | `.txt` | Built-in Serializer | Clean, human-readable text transcript with distinct speaker dividers. |
| **PNG (Image)** | `.png` | `html2canvas` | High-resolution raster capture of the rendered thread. Large chats automatically split into sequential numbered slices. |

---

## 🏗️ Architecture & Data Pipeline

The extension adheres strictly to the **Chrome Manifest V3** security model, utilizing an isolated Shadow DOM for UI injection, a central background service worker for orchestration, and an offscreen document for heavy document rendering:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        chat.z.ai Web Page                              │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Closed Shadow DOM Layer                       │  │
│  │  ┌─────────────────────────┐     ┌────────────────────────────┐  │  │
│  │  │   Floating Action Btn   │ ──► │  Export Modal & Settings   │  │  │
│  │  └─────────────────────────┘     └────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                     │
│  ┌───────────────────────────────▼──────────────────────────────────┐  │
│  │              FullConversationCollector Engine                    │  │
│  │  • Incremental Bi-Directional Scroll (Up/Down passes)            │  │
│  │  • Content Fingerprinting (role:length:start:end)                │  │
│  │  • Recursive Rich Block Parser (code, math, tables, cards)      │  │
│  │  • Authenticated API Thread Fallback Collector                  │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │ chrome.runtime.sendMessage
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Background Service Worker                          │
│  • Manages extension lifecycle & message routing                       │
│  • Spawns & monitors the Chrome Offscreen Document                     │
│  • Dispatches generated blobs to chrome.downloads API                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ chrome.runtime.sendMessage (offscreen)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Offscreen Render Context                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Document Render Pipeline                     │  │
│  │  • PdfLayoutEngine (text wrapping, card bounds, pagination)       │  │
│  │  • docx.js (OpenXML packaging & OMML formula conversion)         │  │
│  │  • KaTeX Offline Engine (LaTeX ──► Vector SVG paths)             │  │
│  │  • PII Anonymizer (Regex sanitization on canonical AST)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Installation

### Option 1: Load from Source (Developer Mode)

> **Prerequisites:** Node.js 18+ and Google Chrome (or Chromium-based browser like Brave, Edge).

```bash
# 1. Clone the repository
git clone https://github.com/md-aktaruzzman-emon/Z.ai-Chat-Exporter.git
cd Z.ai-Chat-Exporter

# 2. Install dependencies
npm install

# 3. Build the production extension
npm run build
```

The compiled extension will be output to the `dist/` directory.

### Option 2: Load into Google Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left toolbar.
4. Select the **`dist/`** directory inside the cloned repository.
5. Confirm that **Z.ai Chat Exporter** appears in your extension list with version `2.1.0`.

---

## 🚀 Usage Guide

1. Navigate to **[chat.z.ai](https://chat.z.ai/)** and log into your account.
2. Open any conversation thread.
3. Locate the **Z.ai Chat Exporter** floating action button at the bottom-right corner of the page (or click the extension icon in your Chrome toolbar).
4. Configure your export preferences:
   - **Target Format:** PDF (Vector), DOCX, Markdown, HTML, JSON, CSV, TXT, or PNG.
   - **Privacy Redaction:** Toggle PII masking to scrub email addresses, phone numbers, and API keys.
   - **Card Design:** Choose between the modern 'extrention z' card styling or standard compact document layout.
5. Click **Export Conversation**.
6. The extension will automatically coordinate the collection pass, compile the document in the offscreen sandbox, and trigger a native download prompt in your browser.

---

## 🔒 Privacy & Security

Z.ai Chat Exporter is engineered around zero-trust client-side principles:

- **100% Local Execution:** No transcripts, user tokens, or conversation contents are ever sent to an external server. All conversion logic executes inside the browser tab and offscreen sandbox.
- **Minimal Manifest Permissions:**
  - `activeTab` / `scripting`: Required to inject the export panel and capture conversation elements on `chat.z.ai`.
  - `storage`: Retains user UI preferences (selected format, theme, redaction options) locally in `chrome.storage.local`.
  - `offscreen`: Required in Manifest V3 to parse DOM elements and generate binary files (PDF/DOCX) without blocking the main browser thread.
  - `downloads`: Saves the generated file to your local computer.
  - `host_permissions`: Strictly limited to `https://chat.z.ai/*` and official Zhipu AI domains (`*.z.ai`, `*.bigmodel.cn`).
- **No Third-Party Analytics:** The extension contains zero tracking pixels, analytics SDKs, telemetry relays, or external CDN dependencies.

---

## 🧪 Development & Testing

The repository includes a comprehensive automated test suite powered by [Vitest](https://vitest.dev/) to verify scraper reliability, layout calculations, and export formatting.

```bash
# Run unit and integration tests (61 tests)
npm test

# Run tests in continuous watch mode
npm run test:watch

# Start Vite dev server with extension hot-reloading
npm run dev

# Perform static linting checks
npm run lint

# Check code formatting with Prettier
npm run format:check

# Auto-format codebase
npm run format

# Re-generate rasterized PNG icons from vector source
npm run generate-icons

# Compile production build to dist/
npm run build
```

### Verified Test Suite

```
 ✓ tests/structural-scraper.test.js (16 tests)
 ✓ tests/exporters.test.js (27 tests)
 ✓ tests/rich-exporters.test.js (18 tests)

 Test Files  3 passed (3)
      Tests  61 passed (61)
   Duration  2.82s
```

The test suite validates:
- Recursive descent scraping on arbitrary nested React DOM elements.
- Message identity fingerprinting and duplicate suppression.
- Bi-directional scrolling across 200-message virtualized chat containers.
- PDF coordinate calculation, line-wrapping, and multi-page boundary handling.
- OpenXML DOCX structure validation and table formatting.
- Offline KaTeX formula extraction and vector representation.
- PII sanitization regex coverage for credentials and personal identifiers.

---

## 📁 Repository Structure

```
Z.ai-Chat-Exporter/
├── assets/                       # Visual assets
│   ├── banner.gif                # 3D animated GitHub banner (1280x400)
│   ├── banner.png                # High-resolution static fallback banner
│   └── icons/                    # Extension UI icon set
├── scripts/                      # Build & generation utilities
│   ├── generate-icons.js         # Canvas icon generator script
│   └── generate_animated_banner.py # 3D animated banner generator (PIL + FFmpeg)
├── src/                          # Extension source code
│   ├── background/
│   │   └── service-worker.js     # Manifest V3 service worker & message dispatcher
│   ├── content/
│   │   ├── dom-engine.js         # Chat container locator & DOM observer
│   │   ├── scraper.js            # FullConversationCollector & rich block parser
│   │   ├── index.js              # Content script orchestrator
│   │   └── ui/                   # Injected Shadow DOM interface (panel, buttons)
│   ├── core/
│   │   ├── math-renderer.js      # Offline KaTeX parser (SVG / MathML / OMML)
│   │   ├── table-layout.js       # Dynamic table cell measurement & column fitting
│   │   ├── katex-css.js          # Bundled KaTeX CSS styles
│   │   ├── pii.js                # Regular expression PII redaction engine
│   │   └── sanitize.js           # DOMPurify HTML sanitization wrapper
│   ├── exporters/
│   │   ├── pdf-vector.js         # Paged PdfLayoutEngine & pdf-lib vector generator
│   │   ├── pdf-raster.js         # html2canvas + jsPDF screenshot exporter
│   │   ├── docx.js               # Native Word document builder (docx.js)
│   │   ├── markdown.js           # GFM / Obsidian / Notion markdown generator
│   │   ├── html.js               # Self-contained standalone HTML exporter
│   │   ├── json.js               # Canonical conversation JSON serializer
│   │   ├── csv.js                # Tabular CSV generator
│   │   ├── txt.js                # Plaintext transcript exporter
│   │   └── png.js                # Multi-slice raster image exporter
│   ├── offscreen/                # Manifest V3 offscreen document sandbox
│   │   ├── offscreen.html
│   │   └── offscreen.js
│   ├── options/                  # Extension options & configuration page
│   └── popup/                    # Toolbar action popup interface
├── tests/                        # Automated Vitest test suite
│   ├── exporters.test.js         # Core exporter unit tests
│   ├── rich-exporters.test.js    # Virtualization & layout engine tests
│   └── structural-scraper.test.js # DOM parsing & AST tests
├── manifest.json                 # Chrome Extension Manifest V3 configuration
├── package.json                  # Dependencies, scripts, and package metadata
├── vite.config.js                # Vite build configuration with CRX plugin
└── LICENSE                       # MIT License
```

---

## ⚠️ Known Limitations

| Condition | Description & Workaround |
|---|---|
| **Tab Throttling on Virtualized Chats** | When exporting very long threads (200+ messages), the browser tab must remain active. Chromium throttles `requestAnimationFrame` and DOM scroll events on background tabs. |
| **Cross-Origin External Images** | Images hosted on external domains without permissive CORS headers cannot be re-fetched for raster embedding. Inline `data:` URIs and same-origin assets embed normally. |
| **Canvas Dimensions on PNG Exports** | Extremely long conversations may exceed GPU canvas texture limits when rendered to a single image. The exporter automatically segments long chats into sequential PNG slices. |

---

## 🤝 Contributing

Contributions, bug reports, and enhancements are welcome!

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/improvement-name`.
3. Ensure all tests pass: `npm test && npm run lint`.
4. Commit your changes: `git commit -m "feat: description of improvement"`.
5. Push to your branch: `git push origin feature/improvement-name`.
6. Open a Pull Request with a summary of the changes and testing steps.

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

```
MIT License
Copyright (c) 2026 Md. Aktaruzzman Emon
```

<p align="center">
  <sub>Disclaimer: Z.ai Chat Exporter is an independent open-source tool and is not affiliated with, endorsed by, or sponsored by Z.ai or Zhipu AI.</sub>
</p>