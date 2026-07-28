# The Compression Company — Design System

Reusable Open Design / Claude Design package extracted from the **Website Clone** project (homepage fidelity clone of [thecompressioncompany.com](https://www.thecompressioncompany.com)).

**id:** `user:website-clone-design-system`  
**Mood:** Black canvas · chalk type · paper bento cells · sensor accent palette  
**Surface:** Responsive marketing web

## Product Overview

The Compression Company is an edge-AI compression product for high-volume **sensor data** (earth observation, AVs, robotics, medical imaging). This design system packages the marketing homepage language: a black bento grid, white paper cells, stencil display type, mono telemetry labels, and a five-color sensor palette used only as high-signal accents. The primary surface is a responsive web marketing site with sticky nav, hero + benchmark panels, tickers, modality switchers, FAQ, and funnel CTAs. The package enables agents and designers to build matching prototypes, section artifacts, and applied UI kits without re-deriving tokens from the live site.

## Source Context

| Item | Value |
|------|--------|
| Source project | Website Clone (`528b2514-393c-4868-bead-278ab096b20f`) |
| Live reference | https://www.thecompressioncompany.com |
| Evidence | `context/source-context.md`, `context/provenance.md`, `NOTES.md`, `brand-spec.md` |
| HTML clones | root `index.html`, `examples/homepage-*.html` |
| Assets preserved | `assets/` icons, logos, images, benchmarks; `fonts/` faces |

Source-backed tokens and components were extracted from the copied homepage HTML and brand-spec (2026-07-28), not invented.

## Package Contents

| Path | Purpose |
|------|---------|
| `DESIGN.md` | Authoritative visual rules |
| `README.md` | This package guide |
| `SKILL.md` | Agent skill contract |
| `colors_and_type.css` | Color, type, spacing, radius tokens |
| `brand-spec.md` | Compact brand extract |
| `fonts/` | Self-hosted Roboter, Inter, Fragment Mono, Instrument Serif |
| `assets/` | Preserved brand icons, logos, imagery, benchmarks |
| `preview/` | Focused review HTML cards |
| `ui_kits/app/` | Applied interface kit |
| `examples/` | Preserved full homepage source examples |
| `context/` | Handoff + provenance notes |

Preserved runtime brand assets and fonts live under `assets/` and `fonts/` (source-backed), not only in prose.

## Preview Manifest

Inspect these focused cards in the Design System tab:

1. `preview/colors-primary.html` — semantic + sensor palette  
2. `preview/typography-specimens.html` — stencil / serif / mono / sans  
3. `preview/spacing-tokens.html` — fluid space, bento gap, radius  
4. `preview/radius-shadows.html` — hairlines, glows, rings  
5. `preview/components-buttons.html` — pill CTAs  
6. `preview/components-cards.html` — platform, strip, benchmark  
7. `preview/brand-assets.html` — logos, icons, photography  
8. `preview/applied-surface.html` — mini bento marketing surface  

## Review Workflow

1. Open **preview/colors-primary.html** and **preview/typography-specimens.html** to lock palette and type.  
2. Read **DESIGN.md** anti-patterns and component rules.  
3. Load **colors_and_type.css** + **fonts/fonts.css** into new artifacts.  
4. Compose from **ui_kits/app/index.html** and modular **ui_kits/app/components/**.  
5. Reuse **assets/** and **fonts/** by relative path; inspect **examples/** for full-page density.  
6. Review applied kit, then ship semantic filenames (not always `index.html`).

## How to use

```html
<link rel="stylesheet" href="fonts/fonts.css" />
<link rel="stylesheet" href="colors_and_type.css" />
```

Copy component markup from `ui_kits/app/` or `preview/`. Bind only documented tokens.

## Voice (one line)

Technical, product-led compression language; mono `+` CTAs; no hype gradients.

## Provenance

See `context/provenance.md`. Clone is for local learning/prototype use; replace brand assets before public redistribute.
