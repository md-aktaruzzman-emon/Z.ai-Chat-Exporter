<p align="center">
  <img src="./assets/banner.jpg" alt="Z.ai Chat Exporter Banner" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/md-aktaruzzman-emon/Z.ai-Chat-Exporter/releases"><img src="https://img.shields.io/badge/version-2.1.0-blue?style=flat-square" alt="Version" /></a>
  <img src="https://img.shields.io/badge/manifest-v3-orange?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/platform-Chrome-yellow?style=flat-square&logo=google-chrome" alt="Chrome" />
  <img src="https://img.shields.io/badge/privacy-100%25%20local-green?style=flat-square" alt="Local Only" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build" />
  <img src="https://img.shields.io/badge/tests-56%20passed-brightgreen?style=flat-square" alt="Tests" />
</p>

<h3 align="center">Export complete Z.ai conversations to PDF, DOCX, Markdown, HTML, and more — with zero text overlap, virtualized long-chat support, and high-fidelity 'extrention z' card styling. 100% local, zero external network calls.</h3>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🎨 'extrention z' Visual Card Styling](#-extrention-z-visual-card-styling)
- [🔄 Full-Chat Virtualized Collector Engine](#-full-chat-virtualized-collector-engine)
- [📤 Supported Export Formats](#-supported-export-formats)
- [🏗️ Architecture](#️-architecture)
- [⚙️ Installation](#️-installation)
- [🧪 Development](#-development)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [⚠️ Known Limitations](#️-known-limitations)
- [📅 Changelog](#-changelog)
- [🤝 Contributing](#-contributing)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔒 **100% Local & Private** | All rendering, parsing, and conversion runs entirely inside your browser. Zero telemetry, zero analytics, zero CDN calls. |
| 🔄 **Full Conversation Collector** | Incremental bi-directional scrolling collector handles virtualized DOM lists. Captures 200+ long chats without missing or truncated messages. |
| 🛡️ **Message Fingerprinting & Deduplication** | Deterministic content fingerprinting (`role:textLen:startStr:endStr`) prevents lost messages during virtualization unmounting. |
| 🎨 **'extrention z' Card Layout** | Mint-green rounded user prompt cards (`#f0fdf4`), white inner file attachment cards with file size badges (`PDF 1.4 MB`), and `👤 You` headers. |
| 📄 **Paged PDF Layout Engine** | Zero text overlap using `PdfLayoutEngine`. Pre-measures block heights before drawing. Includes running headers (`extrention z`) and running page footers (`Exported: Date \| Page X of Y`). |
| 📝 **Native Word / DOCX** | Structured DOCX with proper headings, native tables, monospaced code blocks (`Consolas`), attachment cards, and `keepWithNext: true` orphan header protection. |
| 📐 **Math / LaTeX** | KaTeX rendered offline — vector SVG equations in PDF, native OMML in Word, inline HTML for HTML/Markdown. |
| 📊 **Graphs & Diagrams** | SVG and canvas-rendered charts (Mermaid, Chart.js, etc.) are rasterized and embedded in original sequence order. |
| ⬇️ **Markdown (3 presets)** | GitHub-flavored (GFM), Obsidian callouts/wikilinks, and Notion paste-safe Markdown. |
| 🌐 **HTML Export** | Standalone self-contained HTML file with all styles and KaTeX math inlined. |
| 🧹 **PII Anonymizer** | Locally redacts emails, phone numbers, API keys, bearer tokens, and JWT credentials before export. |
| 🌍 **Multi-Language** | Fully localized in English (`en`) and Bengali (`bn`). Baseline alignment ensures clean Bengali rendering without collisions. |

---

## 🎨 'extrention z' Visual Card Styling

The exporter features the high-fidelity **`extrention z`** visual design language across PDF and DOCX:

- 🟢 **User Message Cards**: Soft mint-green fill (`#f0fdf4`), 1pt emerald border (`#86efac`), 8pt rounded corners, and bold `👤 You` header.
- 📄 **File Attachment Cards**: Rendered inside user cards with `#ffffff` fill, `#cbd5e1` border, 📄/🎯/📎 file icon, bold filename, and `PDF • 1.4 MB` metadata badge.
- 📐 **Running Page Header**: `extrention z` title with top divider line at `y = pageHeight - 28`.
- 🏷️ **Running Page Footer**: Centered `Exported: Sep 26, 2026 | Page X of Y` with bottom divider line at `y = margin + 14`.
- 💻 **Code Accent Box**: Left accent bar (3pt primary color) with subtle box border and monospaced font indentation.

---

## 🔄 Full-Chat Virtualized Collector Engine

To solve truncation in long Z.ai conversations (e.g., 200+ messages), the exporter uses an **incremental bi-directional collector**:

```
[START EXPORT]
     │
     ▼
Find Scroll Container (e.g. #messages-container, [class*="scroll-area"], main)
     │
     ▼
Wait for AI Stream Completion (waitForStreamEnd)
     │
     ▼
Scan Mounted DOM Nodes ──► Generate Stable Fingerprint (role:textLen:startStr:endStr)
     │                     Parse Rich Blocks (code, tables, math, images, attachments)
     │                     Store in In-Memory Map (collectedMap) BEFORE unmounting!
     ▼
Upward Incremental Scroll Pass (Scroll up ~350px ──► Wait 200ms ──► Accumulate ──► Repeat)
     │  (Continues until scrollTop === 0 and top boundary is confirmed)
     ▼
Downward Incremental Scroll Pass (Scroll down ~350px ──► Wait 200ms ──► Accumulate ──► Repeat)
     │  (Continues until bottom boundary is confirmed)
     ▼
Relative DOM Sequence Ordering (Sorts messages into exact 1..N chronological conversation flow)
     │
     ▼
Completeness Validation Check (Verifies userCount, assistantCount, firstPreview, lastPreview)
     │
     ▼
Restore Original Scroll Position (User viewport returns untouched)
```

---

## 📤 Supported Export Formats

<p align="center">

| Format | Engine | Highlights |
|:---:|:---:|---|
| **PDF (Vector)** | `pdf-lib` + `PdfLayoutEngine` | Selectable text, zero overlap, mint user cards, running headers/footers |
| **PDF (Raster)** | `html2canvas` + `jsPDF` | Pixel-perfect, preserves all visual CSS states |
| **DOCX** | `docx.js` | Editable Word document with native tables, OMML math, and callout boxes |
| **Markdown** | Built-in | GFM / Obsidian / Notion presets |
| **HTML** | Built-in | Self-contained, styles + KaTeX inlined |
| **TXT** | Built-in | Plain text, no formatting |
| **JSON** | Built-in | Raw conversation data structure |
| **PNG** | `html2canvas` | Full-page image, auto-split for large chats |
| **CSV** | Built-in | Spreadsheet-compatible message table |

</p>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              chat.z.ai (Page)               │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │        Closed Shadow DOM             │   │
│  │  ┌──────────┐  ┌─────────────────┐  │   │
│  │  │   FAB    │  │   Export Panel  │  │   │
│  │  │ (button) │  │  + History      │  │   │
│  │  └──────────┘  └─────────────────┘  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  FullConversationCollector                  │
│   ├── Bi-directional incremental scroll     │
│   ├── Stable content fingerprinting          │
│   └── Rich block parser (14 block kinds)    │
└──────────────┬──────────────────────────────┘
               │ chrome.runtime.sendMessage
               ▼
┌─────────────────────────────────────────────┐
│         Background Service Worker           │
│   Routes messages, calls chrome.downloads   │
└──────────────┬──────────────────────────────┘
               │ sendMessage (target: offscreen)
               ▼
┌─────────────────────────────────────────────┐
│           Offscreen Document                │
│   PdfLayoutEngine · docx.js · HTML          │
│   KaTeX math · Prism code · Canvas SVG      │
└─────────────────────────────────────────────┘
```

---

## ⚙️ Installation

### Quick Install (Unpacked Extension)

> **Requirements:** Google Chrome 116+ with Developer Mode enabled.

```bash
# 1. Clone the repository
git clone https://github.com/md-aktaruzzman-emon/Z.ai-Chat-Exporter.git
cd Z.ai-Chat-Exporter

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build
```

Then load it in Chrome:

1. Open `chrome://extensions` in your browser
2. Enable **Developer mode** (toggle at top-right)
3. Click **Load unpacked**
4. Select the **`dist/`** folder inside the project directory
5. Navigate to [chat.z.ai](https://chat.z.ai) — the export button appears automatically 🎉

---

## 🧪 Development

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev

# Run all unit & integration tests (56 tests)
npm test

# Lint source code
npm run lint

# Check code formatting
npm run format:check

# Generate icon assets
npm run generate-icons

# Production build → dist/
npm run build
```

### Project Structure

```
Z.ai-Chat-Exporter/
├── src/
│   ├── background/       # MV3 Service Worker (router only, no DOM)
│   ├── content/          # Content script injected into chat.z.ai
│   │   ├── ui/           # Panel, FAB, modals (Shadow DOM)
│   │   ├── dom-engine.js # Robust DOM locator & SPA watcher
│   │   └── scraper.js    # FullConversationCollector & block parser
│   ├── exporters/        # PDF, DOCX, MD, HTML, JSON, CSV renderers
│   │   ├── pdf-vector.js # PdfLayoutEngine (pre-measurement & cards)
│   │   └── docx.js       # Native Word exporter with tables & cards
│   ├── offscreen/        # Hidden render document
│   └── core/             # Shared utilities (i18n, math, tables, image)
│       ├── math-renderer.js  # Offline KaTeX → SVG / MathML / OMML
│       ├── table-layout.js   # Column width distribution & cell wrapping
│       └── katex-css.js      # Bundled KaTeX CSS (offline, no CDN)
├── assets/               # Static assets (banner, icons)
├── dist/                 # Built extension (load this in Chrome)
├── tests/                # Vitest test suite (56 tests passing)
│   ├── exporters.test.js
│   └── rich-exporters.test.js
└── manifest.json         # Chrome Extension MV3 manifest
```

---

## 🛠️ Troubleshooting

### ❓ Long chat exported partially

**Cause:** Virtualized DOM list unmounted older messages during scrolling.

**Fix:** Version `v2.1.0` includes the `FullConversationCollector` engine which automatically scrolls bi-directionally, captures unmounted nodes into an in-memory map, and validates completeness before rendering.

---

### ❓ Clicking "Export Now" does nothing

**Cause:** Extension was reloaded via `chrome://extensions` while the tab was open.

**Fix:** Refresh the `chat.z.ai` page (F5 or Ctrl+R) to reconnect the content script.

---

## ⚠️ Known Limitations

| # | Limitation | Reason |
|---|---|---|
| 1 | **Tab must remain active during long export** | Background tabs throttle scroll events. Keep the Z.ai tab focused while exporting multi-hundred message chats. |
| 2 | **Cross-origin images may not embed** | Chrome MV3 blocks re-fetching external images without CORS headers. Inline `data:` URIs and same-origin images embed correctly. |
| 3 | **PNG export on huge chats** | Browser canvas memory limits apply. Large chats are automatically split into sequential image slices. |

---

## 📅 Changelog

### v2.1.0 — Full-Chat Collector & 'extrention z' Styling
- ✅ **FullConversationCollector** — bi-directional incremental scrolling for virtualized DOM lists (200+ messages without truncation)
- ✅ **Message Fingerprinting** — deterministic content identity (`role:textLen:startStr:endStr`) prevents unmounting loss
- ✅ **'extrention z' Visual Style** — mint-green rounded user cards (`#f0fdf4`), file attachment inner cards (`PDF 1.4 MB`)
- ✅ **Paged Document Layout Engine** — pre-measures block heights before drawing; zero text line overlapping
- ✅ **Running Headers & Footers** — top `extrention z` header, bottom `Exported: Date | Page X of Y` footer with dividers
- ✅ **56 automated tests** — includes virtualized 200-message DOM container simulation and sentinel verification

### v2.0.0 — High-Fidelity Exporter Upgrade
- ✅ **Offline KaTeX math** — SVG equations in PDF, OMML in Word
- ✅ **Full code block wrapping** — preserved indentation and monospaced font
- ✅ **Dynamic table rendering** — multiline cells, repeated headers at page breaks
- ✅ **Bengali / Unicode** — baseline-aligned high-DPI SVG rendering

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!

1. **Fork** this repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and run `npm test` and `npm run lint`
4. Submit a **Pull Request** with a clear description

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/md-aktaruzzman-emon">md-aktaruzzman-emon</a>
  <br/>
  <sub>Z.ai Chat Exporter is not affiliated with or endorsed by Z.ai / Zhipu AI.</sub>
</p>