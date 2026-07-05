---
name: bfi-website-design-system
description: BFI website design system — purple brand palette, HelveticaNeueLTPro-Bd + Open Sans typography, pill buttons, animated underlines, cultural institution aesthetic. Extracted from bfi.org.uk.
user-invocable: true
---

# BFI Website Design System

A reusable design system package replicating the visual language of the British Film Institute website. Use this skill when building BFI-branded interfaces, cultural institution UIs, or any design requiring a purple-accented, editorial, culturally confident aesthetic.

---

## What's inside

| Path | Purpose |
|------|---------|
| `DESIGN.md` | Canonical design system rules — the source of truth for all tokens, components, and anti-patterns |
| `colors_and_type.css` | CSS custom properties, @font-face declarations, typography tokens, utility classes |
| `README.md` | Package guide with preview manifest, source references, and reuse workflow |
| `preview/` | 6 focused reviewable HTML cards (brand assets, colours, typography, components, buttons, spacing) |
| `assets/` | Preserved BFI logos (dark/white SVGs), BFI Player logo, Sight & Sound logo |
| `build/` | Funder logos (UK Government, Here for Culture, National Lottery) |
| `fonts/` | Helvetica Neue LT Pro Bold (woff2 + woff, self-hosted) |
| `source_examples/` | UI kit component source files (JSX) for reuse reference |
| `ui_kits/app/` | Applied interface kit — React-based BFI-style page with modular components |
| `context/` | Extraction evidence — source notes, CSS snapshots, provenance |

---

## Source context

- **Source URL**: https://www.bfi.org.uk
- **Extraction method**: Firecrawl scrape (website, not GitHub repo)
- **Date**: 2025-07-05
- **Evidence note**: `context/github/bfi-website.md`
- **CSS snapshot**: `context/github/bfi-website/files/css-reference.css`
- **Font files**: `fonts/helvetica-neue-bold.woff2`, `fonts/helvetica-neue-bold.woff`
- **Logo assets**: `assets/bfi-logo-dark.svg`, `assets/bfi-logo-white.svg`, `assets/bfiplayer-white.png`, `assets/sight-and-sound.png`
- **Funder assets**: `build/funded-by-uk-government.svg`, `build/here-for-culture.svg`, `build/national-lottery.svg`

The BFI website is a content-rich cultural platform for the British Film Institute. It uses a React-based frontend with self-hosted Helvetica Neue LT Pro Bold for display, Open Sans for body, and a distinctive purple (#783DF6) brand palette. All tokens in this package were extracted from live website CSS and inline styles — no tokens were invented.

---

## When to use this skill

Use this design system when building:

- **BFI-branded web pages** — landing pages, marketing materials, event listings
- **Cultural institution interfaces** — museums, galleries, arts organisations, festivals
- **Film/entertainment surfaces** — discovery platforms, streaming UIs, review sites
- **Educational platforms** — courses, training resources, learning management
- **Editorial designs** — magazine-style layouts, long-form content, reviews
- **Any design requiring** a purple-accented, editorial, culturally confident aesthetic with restrained ornament

---

## How to use

### 1. Read DESIGN.md first
`DESIGN.md` is the canonical rules document. It contains all tokens (colour, type, spacing, layout), component specifications, motion rules, voice guidelines, and anti-patterns. Read it fully before generating any artifact.

### 2. Import colors_and_type.css
Add this to the `<head>` of any HTML file:
```html
<link rel="stylesheet" href="path/to/colors_and_type.css">
```
This provides all CSS custom properties, @font-face declarations, and utility classes. Override tokens in a subsequent `<style>` block if needed.

### 3. Reference preview/ cards
Open the preview cards in a browser to see how tokens and components render visually:
- `preview/brand-assets.html` — logos, funder marks, colour swatches
- `preview/colors-theme.html` — full colour palette and theme examples
- `preview/typography-specimens.html` — type scale, weights, link styles
- `preview/components.html` — buttons, cards, navigation, focus states
- `preview/components-buttons.html` — focused button component deep-dive
- `preview/spacing-layout.html` — spacing scale, radius, breakpoints

### 4. Use assets/ and build/ for real logos
Preserved SVG and PNG files are ready to use in your designs:
- `assets/bfi-logo-dark.svg` — dark wordmark for light backgrounds
- `assets/bfi-logo-white.svg` — white wordmark for dark backgrounds
- `assets/bfiplayer-white.png` — BFI Player sub-brand
- `assets/sight-and-sound.png` — Sight & Sound magazine
- `build/*.svg` — UK Government, Here for Culture, National Lottery funder logos

### 5. Check anti-patterns before shipping
DESIGN.md §9 lists visual, typography, layout, and interaction anti-patterns. Review these before finalizing any design.

---

## Design system highlights

### Colour
- **Single accent**: Purple `#783DF6` — the only accent colour. Use sparingly.
- **Focus ring**: Magenta `#FF22C9` — 4px, always visible on keyboard focus.
- **No gradients**: Flat solid colours throughout.
- **Surface palette**: White, light grey `#F6F6F6`, purple tints, pink tints.

### Typography
- **Display**: HelveticaNeueLTPro-Bd (self-hosted, bold only) — headings only.
- **Body**: Open Sans (Google Fonts, 400/600/700) — all running text.
- **Scale**: 12-step rem-based scale from 0.8rem to 3.8rem.

### Components
- **Pill buttons**: Black primary, white secondary, 100% border-radius. The signature CTA.
- **Cards**: Grid layout, no shadows, background colour differentiation.
- **Links**: 2px underline with animated hover expansion (0.3s ease-in-out).
- **Navigation**: Fixed top, horizontal links, mega-menu dropdowns.

### Motion
- **Transitions**: 0.15s–0.3s ease-in-out for all interactive elements.
- **Link hover**: Underline width animates from 0 to full.
- **Focus**: Immediate magenta ring appearance.

### Voice
- **Tone**: Authoritative but approachable — cultural institution, not corporation.
- **Language**: British English. "Film" not "movie." "Screen" not "theater."
- **CTAs**: Direct, action-oriented — "Find out more", "Watch now".

---

## Reuse

This skill package is designed for reuse by AI agents generating BFI-branded interfaces. The package contains everything needed to build BFI-style designs:

1. **Read DESIGN.md** for the complete design system rules
2. **Import colors_and_type.css** to get all CSS custom properties and tokens
3. **Reference preview/ cards** to see how tokens render visually
4. **Use assets/ and build/** for real BFI logo files
5. **Copy from source_examples/** for reference component implementations
6. **Check anti-patterns** in DESIGN.md §9 before shipping

---

## Quick reference tokens

```css
/* Brand */
--bfi-primary: #783DF6;
--bfi-primary-dark: #310F7A;
--bfi-button-bg: black;
--bfi-button-color: white;

/* Typography */
--bfi-font-display: 'HelveticaNeueLTPro-Bd', sans-serif;
--bfi-font-body: 'Open Sans', sans-serif;

/* Layout */
--bfi-container-max: 1040px;
--bfi-radius-pill: 100%;

/* Interaction */
--bfi-focus-ring: #FF22C9;
--bfi-transition-slow: 0.3s ease-in-out;
```
