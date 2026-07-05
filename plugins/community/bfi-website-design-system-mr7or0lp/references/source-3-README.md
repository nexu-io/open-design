# BFI UI Kit — Applied Interface

A React-based interface kit demonstrating the BFI design system in a composed, product-like page. This kit provides modular, reusable components that implement the BFI visual language with real design tokens.

---

## Structure

```
ui_kits/app/
├── index.html              # Entry point — loads React, Babel, CSS, and components
├── README.md               # This file
└── components/
    ├── App.jsx             # Root shell — composes all role components
    ├── Header.jsx          # Fixed top navigation with BFI branding
    ├── Hero.jsx            # Hero section with display headline and CTA
    ├── CardGrid.jsx        # Responsive film/event card grid
    ├── Card.jsx            # Individual film/event card
    ├── Footer.jsx          # Multi-column footer with funder logos
    └── Button.jsx          # Reusable pill button component
```

---

## Component Files

| File | Role | Exposes | Source Basis |
|------|------|---------|--------------|
| `components/App.jsx` | Root shell — composes Header, Hero, CardGrid, Footer into a complete page | `window.App` | BFI homepage layout pattern |
| `components/Header.jsx` | Fixed top nav with BFI wordmark, horizontal links, hover underline animation | `window.Header` | BFI site header with mega-menu structure |
| `components/Hero.jsx` | Hero section with display headline, body text, and primary CTA button | `window.Hero` | BFI homepage hero with background imagery |
| `components/CardGrid.jsx` | Responsive grid of film/event cards with auto-fill minmax layout | `window.CardGrid` | BFI card grid (`grid_block` class) |
| `components/Card.jsx` | Individual card with image placeholder, title, description, and link CTA | `window.Card` | BFI card component — no shadows, background differentiation |
| `components/Footer.jsx` | Multi-column footer with links, funder logos, and copyright | `window.Footer` | BFI site footer with institutional funding marks |
| `components/Button.jsx` | Reusable pill button with primary (black) and secondary (white) variants | `window.Button` | BFI button system — 100% border-radius, magenta focus ring |

---

## Usage Workflow

### Quick start
Open `index.html` in any browser. The page loads:
1. React 18.3.1 + ReactDOM + Babel standalone (for JSX transpilation)
2. `../../colors_and_type.css` (design system tokens)
3. All component scripts from `components/`
4. Renders the composed `App` component into `#root`

### In a new project
1. Copy the `components/` directory to your project
2. Ensure `colors_and_type.css` is accessible (adjust the `<link>` path in `index.html`)
3. Load React, ReactDOM, and Babel via CDN (or your bundler)
4. Import the component scripts and render `<App />`

### Customization
- All components use CSS custom properties from `colors_and_type.css`
- Override tokens in a `<style>` block after loading the CSS file
- Modify component JSX directly — each file is self-contained
- Add new components by creating a JSX file that exposes itself to `window`

---

## Design Notes

### Token usage
Every component references BFI design tokens rather than hardcoded values:
- **Colours**: `var(--bfi-primary)`, `var(--bfi-text)`, `var(--bfi-bg)`, etc.
- **Typography**: `var(--bfi-font-display)`, `var(--bfi-font-body)`, `var(--bfi-text-*)` scale
- **Spacing**: `var(--bfi-space-*)` scale for padding, margins, gaps
- **Interactions**: `var(--bfi-focus-ring)`, `var(--bfi-transition-slow)` for focus/hover

### Component patterns
- **Buttons**: Pill-radius (100%), black primary with white text, white secondary with black border. Hover transitions to purple. Focus shows 4px magenta ring.
- **Cards**: Image/media top, content below, CTA link. No drop shadows — background colour differentiation only. Grid layout with `minmax(280px, 1fr)`.
- **Links**: 2px underline with animated width expansion on hover (0.3s ease-in-out).
- **Navigation**: Fixed position, white background, bold links with hover underline.
- **Footer**: Dark background (`var(--bfi-primary-dark)`), multi-column link layout, funder logos.

### Responsive behaviour
- Card grid uses CSS Grid `auto-fill` for responsive column count
- Navigation switches to hamburger at mobile breakpoints (handled by CSS media queries)
- All components respect the 1040px max-width container
- Font sizes use rem-based tokens that scale appropriately

---

## Source Basis

This kit is modelled on the BFI website (bfi.org.uk) homepage layout:

1. **Fixed navigation header** — horizontal links with BFI wordmark, mega-menu dropdowns on desktop
2. **Hero section** — background imagery with overlaid display headline and primary CTA
3. **Card grid** — film/event listings in a responsive grid layout
4. **Multi-column footer** — institutional links, funder logos, copyright

The components are simplified but faithful representations of the real BFI patterns, designed to demonstrate the design system tokens in a composed interface. They use the actual design tokens from `colors_and_type.css` and follow the component specifications in `DESIGN.md`.

---

## Relationship to Design System

| Design System File | Kit Usage |
|--------------------|-----------|
| `DESIGN.md` §6 Components | Button, Card, Navigation patterns implemented here |
| `DESIGN.md` §2 Colour | All colour tokens applied via CSS custom properties |
| `DESIGN.md` §3 Typography | Display font for headings, body font for all text |
| `DESIGN.md` §7 Motion | Hover transitions, focus ring animation |
| `colors_and_type.css` | Loaded by `index.html`, provides all tokens |
| `assets/` | Logo files referenced in Header and Footer |
| `build/` | Funder logos referenced in Footer |

---

## Reuse

This UI kit is designed for reuse by AI agents building BFI-branded interfaces. The kit provides a complete, modular foundation that can be extended or customized:

1. **Copy components/** — use the JSX files as a starting point for new BFI-style pages
2. **Read DESIGN.md** — understand the full component specification and design rules
3. **Import colors_and_type.css** — get all BFI design tokens for your project
4. **Reference preview/** — see how tokens and components render visually
5. **Check anti-patterns** — review DESIGN.md §9 before shipping

The components are composable — mix and match `Header`, `Hero`, `CardGrid`, `Footer`, and `Button` to build different page layouts while maintaining visual consistency. Each component uses BFI design tokens and follows the patterns established in the real BFI website.
