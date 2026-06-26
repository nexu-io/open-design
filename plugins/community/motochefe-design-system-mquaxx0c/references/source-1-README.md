# MotoChefe Design System

> A reusable Claude Design-style package for the MotoChefe electric mobility brand.
> Source: https://motochefebrasil.com.br/

## Product Overview

**MotoChefe** is Brazil's leading electric mobility brand — a national manufacturer of electric scooters, cyclomotors, tricycles, and e-bikes founded in 2019. Headquartered in the Zona Franca de Manaus, MotoChefe operates 70+ owned stores and 310+ dealer points across 20+ Brazilian states. The brand is the official sponsor of Clube de Regatas Vasco da Gama and has celebrity endorsements from Diego Ribas and Ronaldinho Gaúcho.

**Primary UI surfaces:** Marketing website (product showcase, franchise pitch, store locator), e-commerce product pages, dealer portal, customer support/Club MotoChefe app.

**Core capabilities:** Electric vehicle manufacturing, national franchise network, exclusive battery insurance program, 35+ vehicle models across 4 categories (Autopropelidos, Ciclomotor, Triciclos, E-Bikes).

## Source and Context References

| Source | Method | Notes |
|---|---|---|
| https://motochefebrasil.com.br/ | Live website fetch | Homepage, /modelos/, /sobre/ — primary evidence |
| Elementor Kit CSS | Inline `<style>` extraction | Color tokens, typography, layout variables |
| SVG logo files | Direct asset download | Ativo_blck_1.svg, Ativo_wht_1.svg |
| OG image | Direct asset download | icone_motochefe.png (528×528) |
| `context/github/motochefebrasil/files/` | Extracted snapshots | CSS tokens, font inventory, component patterns |

All color hex values extracted from Elementor kit CSS (`--e-global-color-*` variables) and inline `<style>` blocks. Typography extracted from Elementor kit global typography settings. No GitHub repository was available — all evidence sourced from the live production website.

## Package Contents

```
ds-motochefebrasil-design-system/
├── DESIGN.md                  # Canonical design rules (9 sections)
├── README.md                  # This file — package guide
├── SKILL.md                   # Agent-usable skill entry with YAML frontmatter
├── colors_and_type.css        # Reusable CSS tokens + typography (100+ properties)
├── context/
│   ├── source-context.md      # Source evidence and intake notes
│   └── github/
│       ├── github-repository.md
│       └── motochefebrasil/files/
│           ├── css-tokens.md
│           ├── font-inventory.md
│           └── component-patterns.md
├── assets/
│   ├── logo-black.svg         # Wordmark — black variant (for light bg)
│   ├── logo-white.svg         # Wordmark — white variant (for dark bg)
│   └── icon-motochefe.png     # App/OG icon (528×528, MC motorcycle)
├── build/
│   ├── logo.svg               # Runtime logo (copy of logo-black.svg)
│   └── icon.png               # Runtime icon (copy of icon-motochefe.png)
├── preview/
│   ├── colors-primary.html    # Full brand color swatches
│   ├── colors-theme-light.html # Light & dark theme comparison
│   ├── typography-specimens.html # Font families + type scale
│   ├── spacing-tokens.html    # Spacing, radius, shadow tokens
│   ├── brand-assets.html      # Logo/icon/gradient asset gallery
│   └── components-buttons.html # Buttons, cards, nav, footer, stats
├── source_examples/
│   └── (extracted component snapshots from live site)
└── ui_kits/
    └── app/
        ├── index.html         # Runnable app shell demo (React + Babel)
        ├── README.md          # Kit structure + usage guide
        └── components/
            └── App.jsx        # Full marketing page: Header → Hero → Stats → Products → Reasons → Footer
```

## Preview Manifest

| Preview Card | Path | What to Inspect |
|---|---|---|
| Brand Colors | `preview/colors-primary.html` | Gold palette (`#DBB42C`), neutrals (`#090909`, `#1F1F1F`, `#2E2E2E`), functional colors (`#3D9CD2`, `#D63939`, `#FFBC7D`), dark mode overlays |
| Theme Comparison | `preview/colors-theme-light.html` | Light vs dark mode side-by-side with real MotoChefe content — shows how tokens adapt across themes |
| Typography | `preview/typography-specimens.html` | 5 font families (Bebas Neue, Be Vietnam Pro, Outfit, Playfair Display, Roboto Slab), full type scale h1–small, weight/size/line-height |
| Spacing & Radius | `preview/spacing-tokens.html` | 8-step spacing scale (4px–100px), 5 radius values (8px–9999px), 4 shadow levels (sm–glass) |
| Brand Assets | `preview/brand-assets.html` | Logo SVGs (black/white variants loaded via `<img>`), app icon PNG, gold gradient, stat badge |
| Components | `preview/components-buttons.html` | Buttons (primary/secondary/ghost), badges, product cards, stat cards, nav bar, footer — all using `--mc-*` tokens |

## Preserved Assets

- `assets/logo-black.svg` — MotoChefe wordmark, black variant for light backgrounds (downloaded from WordPress media uploads)
- `assets/logo-white.svg` — MotoChefe wordmark, white variant for dark backgrounds
- `assets/icon-motochefe.png` — App/OG icon, 528×528px, motorcycle illustration
- `build/logo.svg` — Runtime copy of logo-black.svg for downstream projects
- `build/icon.png` — Runtime copy of icon-motochefe.png for downstream projects

## UI Kit

The `ui_kits/app/` directory contains a runnable marketing page demo built with React + Babel:

- **Entry**: `ui_kits/app/index.html` — loads React 18.3.1, ReactDOM, Babel standalone, `../../colors_and_type.css`, and all component scripts
- **Components**: `ui_kits/app/components/App.jsx` — 6 components (Header, Hero, Stats, ProductCategories, SixReasons, Footer) exposed as `window.*` globals
- **Design notes**: All components use `--mc-*` CSS custom properties, gold pill buttons, 24px radius cards, Bebas Neue display stats, alternating light/dark sections
- **Source basis**: Components modeled directly after the live production site at motochefebrasil.com.br

## Reuse Workflow

1. **Read `DESIGN.md`** for the full visual system rules, anti-patterns, and voice guidelines — this is the canonical source of truth
2. **Import `colors_and_type.css`** into any HTML/React project — it provides all CSS custom properties (`--mc-*`), Google Fonts imports, base resets, heading styles, dark mode overrides, and utility classes
3. **Check `preview/`** cards for visual reference on how tokens render in practice
4. **Use `assets/`** for logo SVGs (`logo-black.svg`, `logo-white.svg`) and app icon (`icon-motochefe.png`)
5. **Use `build/`** for runtime copies when downstream projects expect a `build/` directory
6. **Refer to `source_examples/`** for real component implementation patterns extracted from the live site
7. **Refer to `ui_kits/app/`** for an applied marketing page example using the token system
8. **Consult `context/`** for source evidence notes, CSS token extraction details, and component pattern documentation

## Quick Start

```html
<link rel="stylesheet" href="colors_and_type.css">

<style>
  .my-component {
    background: var(--mc-gold);
    color: var(--mc-black);
    border-radius: var(--mc-radius-pill);
    font-family: var(--mc-font-heading);
    padding: var(--mc-space-md) var(--mc-space-xl);
  }
</style>
```

## Design System Highlights

- **Gold + Black palette**: `#DBB42C` (gold accent) + `#090909` (near-black) + `#FFFFFF` — premium automotive feel
- **5 font families**: Bebas Neue (display), Be Vietnam Pro (headings/body), Outfit (UI), Playfair Display (accent italic), Roboto Slab (serif)
- **24px radius cards**, 9999px pill buttons, glassmorphism on dark surfaces only
- **1280px max container**, Bootstrap grid, 576/768/1024px breakpoints
- **Alternating light/dark sections** for visual rhythm
- **Motion**: 150ms micro / 300ms standard / 600ms dramatic, all respecting `prefers-reduced-motion`

## Provenance Notes

- All color hex values extracted from Elementor kit CSS (`--e-global-color-*` variables) and inline `<style>` blocks on the live site.
- Typography extracted from Elementor kit global typography settings and heading declarations.
- Spacing, radius, and shadow values observed from component CSS across homepage, models, and about pages.
- Logo SVGs downloaded directly from WordPress media uploads (wp-content/uploads/2025/10/).
- No GitHub repository was available — all evidence sourced from the live production website.
