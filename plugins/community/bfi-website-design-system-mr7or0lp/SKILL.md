# BFI Website Design System

> **Source**: https://www.bfi.org.uk  
> **Category**: Custom · Web  
> **Extracted**: 2025-07-05

A reusable design system package replicating the visual language of the British Film Institute website — colours, typography, spacing, components, and interaction patterns.

---

## Product Overview

The **British Film Institute (BFI)** is the UK's lead organisation for film, television and the moving image. Its public website (bfi.org.uk) serves as the primary digital surface for:

- **Film discovery & streaming** — BFI Player, curated collections, recommendations
- **Event listings** — BFI Southbank screenings, IMAX, festivals
- **Learning & training** — courses, resources, educational programmes
- **Funding & industry** — film fund applications, industry support
- **Editorial** — Sight & Sound magazine, reviews, features
- **Membership & shop** — BFI membership, physical media shop

The website is a content-rich cultural platform built with a modern React-based frontend, self-hosted typography, and a distinctive purple brand palette.

### Product Context

This design system captures the visual language of bfi.org.uk for reuse in:
- BFI-branded web pages and marketing materials
- Cultural institution or arts organisation interfaces
- Film/entertainment discovery or streaming surfaces
- Educational or training platform UIs
- Any design requiring a purple-accented, editorial, culturally confident aesthetic

---

## Source References

| Source | Method | Evidence File | What Was Captured |
|--------|--------|---------------|-------------------|
| https://www.bfi.org.uk | Firecrawl scrape (full HTML) | `context/github/bfi-website.md` | Page structure, inline styles, component patterns |
| CSS: `main.91accebbcdc09556dc84.css` | Direct fetch | `context/github/bfi-website/files/css-reference.css` | Font-face declarations, base styles, CSS custom properties |
| CSS: `header.91accebbcdc09556dc84.css` | Direct fetch | (duplicate of main) | Shared reset styles |
| CSS: `928.4df1ead7dac43992743c.css` | Direct fetch | (referenced in context) | Font Awesome 4.7.0 icon font |
| Inline `<style>` blocks | Parsed from raw HTML | Included in `context/github/bfi-website.md` | All component-level styling, colour tokens, layout rules |
| BFI logo SVGs | Downloaded from site | `assets/bfi-logo-dark.svg`, `assets/bfi-logo-white.svg` | Brand wordmarks |
| BFI Player logo | Downloaded from site | `assets/bfiplayer-white.png` | Player sub-brand |
| Sight & Sound logo | Downloaded from site | `assets/sight-and-sound.png` | Editorial sub-brand |
| Funder logos | Downloaded from site | `build/funded-by-uk-government.svg`, `build/here-for-culture.svg`, `build/national-lottery.svg` | Institutional funding marks |
| Font files | Self-hosted from site | `fonts/helvetica-neue-bold.woff2`, `fonts/helvetica-neue-bold.woff` | Display typeface (HelveticaNeueLTPro-Bd) |

---

## Package Contents

```
bfi-website-design-system/
├── DESIGN.md                  # Canonical design system rules (source of truth)
├── README.md                  # This file — package guide
├── SKILL.md                   # Agent-usable skill entry
├── colors_and_type.css        # CSS custom properties, @font-face, tokens
├── context/
│   ├── source-context.md      # Intake instructions and provenance
│   └── github/
│       ├── bfi-website.md     # Extraction evidence notes
│       └── bfi-website/
│           └── files/
│               └── css-reference.css   # Original CSS reference
├── assets/
│   ├── bfi-logo-dark.svg      # BFI wordmark (dark)
│   ├── bfi-logo-white.svg     # BFI wordmark (white)
│   ├── bfiplayer-white.png    # BFI Player logo
│   └── sight-and-sound.png    # Sight & Sound magazine logo
├── build/
│   ├── funded-by-uk-government.svg   # UK Government funder mark
│   ├── here-for-culture.svg          # Here for Culture funder mark
│   └── national-lottery.svg          # National Lottery funder mark
├── fonts/
│   ├── helvetica-neue-bold.woff2     # Display typeface (woff2)
│   └── helvetica-neue-bold.woff      # Display typeface (woff)
├── preview/
│   ├── brand-assets.html       # Logo, colour, and typography asset viewer
│   ├── colors-theme.html       # Colour palette and theme usage examples
│   ├── typography-specimens.html  # Type scale, weights, link styles
│   ├── components.html         # Buttons, cards, navigation, focus states
│   ├── components-buttons.html # Focused button component deep-dive
│   └── spacing-layout.html     # Spacing scale, radius, breakpoints, container
├── source_examples/
│   └── (UI kit component JSX files — see ui_kits/app/components/)
└── ui_kits/
    └── app/
        ├── index.html           # Applied interface entry point
        ├── README.md            # Kit documentation
        └── components/
            ├── App.jsx          # Root component — composes all role components
            ├── Header.jsx       # Fixed top navigation with BFI branding
            ├── Hero.jsx         # Hero section with headline and CTA
            ├── CardGrid.jsx     # Film/event card grid
            ├── Card.jsx         # Individual film/event card
            ├── Footer.jsx       # Multi-column footer with funder logos
            └── Button.jsx       # Reusable pill button component
```

---

## Preview Manifest

| Preview Card | Path | What to Inspect | Demonstrates |
|-------------|------|-----------------|--------------|
| Brand Assets | `preview/brand-assets.html` | Logos, funder marks, colour swatches, typography specimens | Real preserved SVGs/PNGs from `assets/` and `build/`, brand colour tokens, font stacks |
| Colours & Theme | `preview/colors-theme.html` | Colour palette, surface colours, theme usage examples | All 14 colour tokens, dark/purple/pink/light theme blocks |
| Typography | `preview/typography-specimens.html` | Display font, body font, weights, link styles, full type scale | HelveticaNeueLTPro-Bd display, Open Sans body, 12-step type scale, animated underlines |
| Components | `preview/components.html` | Buttons, cards, navigation, focus states, inline links | Pill button CTAs, grid cards, nav bar, magenta focus ring |
| Buttons | `preview/components-buttons.html` | Primary, secondary, size variants, disabled, on-dark, focus, token reference | Full button system with states, sizes, dark-surface variants, implementation code |
| Spacing & Layout | `preview/spacing-layout.html` | Spacing scale, border radius, breakpoints, container, shadows | 8-step spacing, pill radius, 4 breakpoints, 1040px container |

---

## Preserved Assets

### Brand Assets (`assets/`)
| File | Type | Description |
|------|------|-------------|
| `bfi-logo-dark.svg` | SVG | BFI wordmark for light backgrounds |
| `bfi-logo-white.svg` | SVG | BFI wordmark for dark backgrounds |
| `bfiplayer-white.png` | PNG | BFI Player sub-brand logo |
| `sight-and-sound.png` | PNG | Sight & Sound magazine logo |

### Build Assets (`build/`)
| File | Type | Description |
|------|------|-------------|
| `funded-by-uk-government.svg` | SVG | UK Government funder mark |
| `here-for-culture.svg` | SVG | Here for Culture funder mark |
| `national-lottery.svg` | SVG | National Lottery funder mark |

### Fonts (`fonts/`)
| File | Format | Description |
|------|--------|-------------|
| `helvetica-neue-bold.woff2` | WOFF2 | Display typeface — primary format |
| `helvetica-neue-bold.woff` | WOFF | Display typeface — fallback format |

---

## Source Examples

The `source_examples/` directory contains the original UI kit component source files (JSX) that can be reused as reference implementations:

- `App.jsx` — Root shell composing Header, Hero, CardGrid, Footer
- `Header.jsx` — Fixed top nav with BFI wordmark and horizontal links
- `Hero.jsx` — Hero section with display headline and primary CTA
- `CardGrid.jsx` — Responsive grid of film/event cards
- `Card.jsx` — Individual card with image, title, description, link
- `Footer.jsx` — Multi-column footer with funder logos
- `Button.jsx` — Reusable pill button (primary/secondary variants)

These are the same files found in `ui_kits/app/components/` and can be imported directly into new projects.

---

## UI Kit (`ui_kits/app/`)

An applied interface kit demonstrating the design system in a composed BFI-style page:

- **Entry point**: `ui_kits/app/index.html` — loads React, Babel, CSS tokens, and all components
- **Components**: 7 modular JSX files in `ui_kits/app/components/`
- **Documentation**: `ui_kits/app/README.md` — kit structure, component files, usage workflow

The kit renders a complete BFI-style page with fixed navigation, hero section, film card grid, and multi-column footer — all using design system tokens from `colors_and_type.css`.

---

## Design System Highlights

### Colour
- **Primary purple** `#783DF6` — single accent, used for CTAs, active states, links
- **Dark purple** `#310F7A` — deep accent, footer, hover states
- **Focus ring** `#FF22C9` — magenta, 4px, always visible on keyboard focus
- **Surface palette** — white, light grey, purple tints, pink tints
- **No gradients** — flat solid colours throughout

### Typography
- **Display**: HelveticaNeueLTPro-Bd (self-hosted, bold only)
- **Body**: Open Sans (Google Fonts, 400/600/700)
- **Secondary**: Roboto (Google Fonts, 400/500)
- **Scale**: 12-step rem-based scale from 0.8rem to 3.8rem

### Components
- **Buttons**: Pill-radius (100%), black primary, white secondary
- **Cards**: Grid layout, no shadows, background colour differentiation
- **Links**: 2px underline with animated hover expansion
- **Navigation**: Fixed top, horizontal links, mega-menu dropdowns

### Motion
- **Transitions**: 0.15s–0.3s ease-in-out
- **Link hover**: Underline width animates from 0 to full
- **Focus**: Immediate magenta ring appearance

---

## Reuse Workflow

### For agents generating BFI-branded artifacts:

1. **Read `DESIGN.md`** for the complete design system rules, tokens, and anti-patterns
2. **Import `colors_and_type.css`** to get all CSS custom properties, font-face declarations, and utility classes
3. **Reference `preview/` cards** to see how tokens and components render visually
4. **Use `assets/` and `build/`** for real BFI logo files in your designs
5. **Copy from `source_examples/`** when you need reference component implementations
6. **Check anti-patterns** in DESIGN.md §9 before shipping any design

### Quick Start

```html
<link rel="stylesheet" href="colors_and_type.css">
<style>
  .my-component {
    font-family: var(--bfi-font-body);
    color: var(--bfi-text);
    background: var(--bfi-bg);
    padding: var(--bfi-space-lg);
  }
  .my-heading {
    font-family: var(--bfi-font-display);
    font-size: var(--bfi-text-5xl);
    font-weight: var(--bfi-weight-bold);
  }
  .my-button {
    background: var(--bfi-button-bg);
    color: var(--bfi-button-color);
    border-radius: var(--bfi-radius-pill);
    padding: 12px 30px;
    font-weight: var(--bfi-weight-bold);
  }
</style>
```

### Key Rules

- **One accent**: Purple `#783DF6` is the only accent. Do not add secondary accents.
- **Pill buttons**: Black background, white text, 100% border-radius. The signature CTA.
- **No gradients, no shadows**: Flat solid colours, background differentiation.
- **Magenta focus ring**: 4px `#FF22C9` on all interactive elements.
- **Self-hosted display font**: HelveticaNeueLTPro-Bold is bundled in `fonts/`.
- **British English**: "Film" not "movie." "Screen" not "theater."

## Provenance

Formalized by Open Design from candidate 6f7b5b9c-9a31-4fbe-ac51-563b69cc6a2f.
