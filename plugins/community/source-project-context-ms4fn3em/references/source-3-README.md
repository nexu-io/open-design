# The Compression Company — Design System (reference guide)

Reusable design language extracted from the **Website Clone** project (homepage fidelity clone of [thecompressioncompany.com](https://www.thecompressioncompany.com)).

**id:** `user:website-clone-design-system`  
**Mood:** Black canvas · chalk type · paper bento cells · sensor accent palette  
**Surface:** Responsive marketing web

> **Plugin note:** This file is a **shipped reference** inside `source-project-context-ms4fn3em`. Paths below describe the *intended full package layout* when you materialize the system in a consumer project. Inside this plugin, use only the sibling `references/source-*.md` files plus the plugin root `SKILL.md`.

## Product Overview

The Compression Company is an edge-AI compression product for high-volume **sensor data** (earth observation, AVs, robotics, medical imaging). This design system packages the marketing homepage language: a black bento grid, white paper cells, stencil display type, mono telemetry labels, and a five-color sensor palette used only as high-signal accents. The primary surface is a responsive web marketing site with sticky nav, hero + benchmark panels, tickers, modality switchers, FAQ, and funnel CTAs.

## Source Context

| Item | Value |
|------|--------|
| Source project | Website Clone (`528b2514-393c-4868-bead-278ab096b20f`) |
| Live reference | https://www.thecompressioncompany.com |
| Plugin evidence | `source-1-source-context.md`, `source-2-DESIGN.md`, this file, `source-4-SKILL.md`, `source-5-README.md`, `provenance.json` |
| Rules surface | `source-2-DESIGN.md` (canonical) |

Source-backed tokens and components were extracted from the copied homepage HTML and brand-spec (2026-07-28), not invented.

## Evidence map (this plugin)

| Shipped reference | Maps to full-package role |
|-------------------|---------------------------|
| `source-2-DESIGN.md` | `DESIGN.md` — authoritative visual rules |
| `source-3-README.md` | `README.md` — this package guide |
| `source-4-SKILL.md` | `SKILL.md` — agent skill contract |
| `source-5-README.md` | `ui_kits/app/README.md` — applied kit notes |
| `source-1-source-context.md` | `context/source-context.md` — handoff |

Not shipped in the plugin (generate in the consumer when needed): `colors_and_type.css`, `fonts/`, `assets/`, `preview/*.html`, `examples/`, live `ui_kits/app/*.html`.

## Review workflow (plugin-safe)

1. Read **`source-2-DESIGN.md`** for palette, type, spacing, components, and anti-patterns.  
2. Read **`source-4-SKILL.md`** for agent usage order and build checklist.  
3. Read **`source-5-README.md`** for marketing-shell composition (nav, hero/benchmark, strip, funnel, FAQ).  
4. When generating consumer artifacts, **emit** tokens CSS, preview cards, and kit HTML from those rules — do not look for them inside the plugin folder.  
5. Prefer semantic deliverable filenames; reserve `index.html` for launchers and kit entry points.

## Full-package contents (when materializing)

| Path | Purpose |
|------|---------|
| `DESIGN.md` | Authoritative visual rules (from `source-2-DESIGN.md`) |
| `README.md` | Human package overview (from this file) |
| `SKILL.md` | Agent skill contract (from `source-4-SKILL.md`) |
| `colors_and_type.css` | Color, type, spacing, radius tokens — generate from DESIGN |
| `fonts/` / `assets/` | Self-hosted faces and brand media — only if consumer has them |
| `preview/` | Focused review HTML cards — generate as needed |
| `ui_kits/app/` | Applied interface kit — structure in `source-5-README.md` |
| `context/` | Handoff + provenance |

## Voice (one line)

Technical, product-led compression language; mono `+` CTAs; no hype gradients.

## Provenance

See `provenance.json`. Clone evidence is for local learning/prototype use; replace brand assets before public redistribute.
