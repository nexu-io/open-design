---
name: MotoChefe Design System
description: Reusable design tokens, typography, colors, components, and brand assets for the MotoChefe electric mobility brand (motochefebrasil.com.br). Gold + black palette, Be Vietnam Pro + Bebas Neue typography, 24px radius cards, 1280px container.
user-invocable: true
---

# MotoChefe Design System Skill

## What is inside

This package provides a complete, reusable design system for building MotoChefe-branded UI artifacts. Everything is grounded in evidence extracted from the live production site at motochefebrasil.com.br.

| File | Purpose |
|---|---|
| `DESIGN.md` | Canonical design rules — visual theme, color, typography, spacing, layout, components, motion, voice, anti-patterns |
| `colors_and_type.css` | 100+ CSS custom properties (`--mc-*`), Google Fonts imports, base resets, heading styles, dark mode, utility classes |
| `README.md` | Package guide — product overview, source references, preview manifest, reuse workflow |
| `SKILL.md` | This file — agent-usable skill entry for future design work |
| `preview/` | 6 focused HTML review cards (colors, themes, typography, spacing, assets, components) |
| `assets/` | Logo SVGs (black/white), app icon PNG — downloaded from live site |
| `build/` | Runtime copies of logo + icon for downstream projects |
| `context/` | Source evidence — intake notes, CSS token extraction, font inventory, component patterns |
| `source_examples/` | Real CSS snapshots from the live site: header, footer, stats-bar, product-card |
| `ui_kits/app/` | Runnable marketing page kit — React components + token system + own README |

## Source context

- **Product**: MotoChefe — Brazil's leading electric mobility manufacturer (scooters, cyclomotors, tricycles, e-bikes)
- **Founded**: 2019, Zona Franca de Manaus, Brazil
- **Scale**: 200K+ products sold, 70+ owned stores, 310+ dealer points across 20+ states
- **Website**: https://motochefebrasil.com.br/ — WordPress + ArchHub theme + Elementor page builder + MotionPage animations
- **No GitHub repo** — all design evidence extracted directly from the live production website
- **Extraction method**: Direct website fetch, CSS/asset extraction from live HTML, SVG/PNG download from WordPress media uploads
- **Key pages analyzed**: Homepage (hero, stats, models, reasons, testimonials, footer), Models (product categories), About (company story, factory, timeline)
- **Evidence snapshots**: `context/github/motochefebrasil/files/` — CSS token extraction, font inventory, component patterns
- **Source component CSS**: `source_examples/` — header.css, footer.css, stats-bar.css, product-card.css

## When to use this skill

Use this skill when:

- Building pages, prototypes, or decks for **MotoChefe** or **motochefebrasil.com.br**
- Matching the MotoChefe visual style: **gold + black, automotive premium feel**
- Using MotoChefe brand tokens: `#DBB42C` (gold), `#090909` (near-black), Bebas Neue display font, Be Vietnam Pro headings/body
- Creating marketing materials, landing pages, product pages, or franchise pitch decks for electric mobility in Brazil
- Designing dealer portals, store locators, or customer-facing surfaces for the MotoChefe franchise network

## How to use

### Step-by-step workflow

1. **Read `DESIGN.md`** — the canonical source of truth for color, typography, spacing, layout, components, motion, voice, and anti-patterns
2. **Import `colors_and_type.css`** — provides all `--mc-*` CSS custom properties, Google Fonts imports, base resets, heading styles, dark mode overrides, and utility classes
3. **Check `preview/`** — 6 focused cards showing how tokens render in practice
4. **Use `assets/`** — logo SVGs (`logo-black.svg`, `logo-white.svg`) and app icon (`icon-motochefe.png`)
5. **Use `build/`** — runtime copies when downstream projects expect a `build/` directory
6. **Refer to `source_examples/`** — real CSS patterns extracted from the live site
7. **Refer to `ui_kits/app/`** — full applied marketing page example with React components

### Quick start

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

## Design system highlights

### Color palette

| Token | Hex | Role |
|---|---|---|
| `--mc-gold` | `#DBB42C` | Primary accent — CTAs, highlights, gradients, focus rings |
| `--mc-gold-dark` | `#B18D11` | Hover states on gold, gradient stop |
| `--mc-gold-bar` | `#B7A45F` | Header top accent bar |
| `--mc-black` | `#000000` | Heading text (light mode) |
| `--mc-near-black` | `#090909` | Dark backgrounds, hero sections |
| `--mc-charcoal` | `#1F1F1F` | Footer background, dark cards |
| `--mc-white` | `#FFFFFF` | Light surfaces, text on dark |

### Typography

| Role | Font | Usage |
|---|---|---|
| Display / Hero | Bebas Neue | Hero headlines, large stats, all-caps impact text |
| Headings / Body | Be Vietnam Pro | h1–h6, body copy, primary workhorse font |
| Secondary / UI | Outfit | Captions, labels, secondary UI elements |
| Accent / Decorative | Playfair Display (italic) | Decorative quotes, editorial moments |
| Serif Accent | Roboto Slab | Occasional serif contrast |

### Spacing and layout

- **8-step spacing scale**: 4px (xs) → 8px (sm) → 16px (md) → 24px (lg) → 40px (xl) → 60px (2xl) → 80px (3xl) → 100px (4xl)
- **Border radius**: 8px (sm) → 16px (md) → 24px (lg) → 9999px (pill) → 50% (full circle)
- **Max container**: 1280px boxed layout, Bootstrap-derived responsive grid
- **Breakpoints**: 576px (sm), 768px (md), 1024px (lg)

### Key component patterns

- **Buttons**: Gold `#DBB42C` background, black text, pill radius (9999px), padding 12px 32px; hover darken to `#B18D11`
- **Cards**: 24px radius, full-bleed image with gradient overlay (bottom), text overlay with category + model name
- **Stats**: Bebas Neue display font, large numbers with "+" prefix, small uppercase labels, on dark backgrounds
- **Navigation**: Fixed white header, gold accent bar on top, shrinks on scroll; mobile fullscreen dark overlay
- **Product cards**: 24px radius, image overlay at 65% opacity, hover scale 1.02 + shadow intensify

### Motion

- **Default easing**: cubic-bezier(0.25, 0.46, 0.45, 0.94)
- **Micro**: 150ms — hover states, focus rings
- **Standard**: 300ms — card hovers, nav transitions
- **Dramatic**: 600ms — page transitions, scroll reveals
- All animations respect `prefers-reduced-motion: reduce`

### Anti-patterns (avoid)

- Purple/violet gradients — the palette is gold + black + white
- Inter/Roboto/Arial as display fonts
- Gradient text (`background-clip: text`)
- Warm beige/cream/pink backgrounds
- Emoji as feature icons
- Lorem ipsum — always use real Portuguese copy
- Glassmorphism on light surfaces (reserved for dark surfaces only)
- Generic stock photography of "business people in meetings"
