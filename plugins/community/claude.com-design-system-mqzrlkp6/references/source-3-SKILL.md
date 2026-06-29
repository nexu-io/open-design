---
name: Claude.com Design System
description: Warm editorial design system for the Claude.com marketing site — cream canvas, coral accent, Copernicus serif display + StyreneB/Inter body, dark navy product surfaces
user-invocable: true
---

# Claude.com Design System

Agent-usable skill package for the Claude.com (claude.ai) marketing design system. Load this skill to bind the warm cream + coral + dark-navy surface system into artifacts — landing pages, feature sections, product mockups, pricing grids, code-editor showcase cards, editorial marketing pages.

## What's inside

A complete design system package extracted from the claude.ai public marketing site. All source evidence is preserved in `context/source-context.md`.

- **`DESIGN.md`** — canonical 9-section design system rules: product context, visual theme, color, typography, spacing, layout, components, motion, voice, and anti-patterns
- **`colors_and_type.css`** — reusable CSS custom properties and component classes: all color tokens (`--color-*`), typography tokens (`--text-*`), spacing scale (`--space-*`), border radius tokens (`--radius-*`), and component class names
- **`preview/`** — 10 focused reviewable HTML cards:
  - `colors-primary.html` — brand, accent, text, and semantic color swatches
  - `colors-theme-light.html` — light surface scale (canvas → card → cream-strong) with hairline borders and band-rhythm demo
  - `colors-theme-dark.html` — dark surface tokens with code-window card and syntax-highlighted code
  - `typography-specimens.html` — every type token with specimen text and size annotations
  - `spacing-tokens.html` — spacing scale visual bar chart with usage examples
  - `spacing-radius.html` — border radius scale with visual box swatches and usage labels
  - `spacing-shadows.html` — elevation levels and surface pacing rhythm diagram
  - `components-buttons.html` — all 5 button variants with interactive disabled/hover/press states and on-dark variants
  - `components-inputs.html` — text inputs, badge pills, category tabs, cookie consent card
  - `brand-assets.html` — spike-mark and wordmark SVGs, three surface context demos, asset manifest
- **`assets/`** — brand SVG assets: `spike-mark.svg` (Anthropic 4-spoke radial asterisk glyph), `wordmark.svg` (spike-mark + "Claude" wordmark)
- **`build/`** — runtime asset placeholders (no installer or app icon assets were available from claude.ai marketing pages)
- **`fonts/`** — `README.md` with font licensing notes: Copernicus (licensed), StyreneB (licensed), JetBrains Mono (open-source), and open-source substitutes with `@import` / `@font-face` sample syntax
- **`ui_kits/app/`** — runnable applied interface example:
  - `index.html` — browser entry that loads `../../colors_and_type.css`, imports 6 React JSX components, mounts composed `App` interface
  - `components/App.jsx` — app shell composing Sidebar, AssistantsList, ChatArea, InputBar, MessageBubble
  - `components/Sidebar.jsx` — left navigation rail with conversation history
  - `components/AssistantsList.jsx` — assistant/model selector list
  - `components/ChatArea.jsx` — main chat workspace
  - `components/MessageBubble.jsx` — individual message rendering
  - `components/InputBar.jsx` — chat composer with send action

## Source context

**Evidence file**: `context/source-context.md`
**Extraction method**: Manual extraction from public marketing pages at claude.ai
**Status**: Source of truth for all tokens, components, and rules in this package

The source evidence documents the following from the claude.ai production site:

- **Product identity**: Claude.com — Anthropic's AI assistant marketing site
- **Primary surfaces**: Responsive web (marketing), three surface modes (cream canvas, cream feature cards, dark navy product mockups)
- **Color system**: 28+ extracted color tokens with hex values — brand accent (#cc785c coral), surface scale (#faf9f5 → #181715), text hierarchy (#141413 → #8e8b82), semantic colors (success #5db872, warning #d4a017, error #c64545)
- **Typography system**: 14 type tokens spanning serif display (64px–28px, weight 400, negative tracking), humanist sans body (22px–12px), monospace code (14px)
- **Component library**: Complete specs for 15+ components — top-nav, button-primary, button-secondary, button-on-dark, feature-card, product-mockup-card-dark, code-window-card, model-comparison-card, pricing-tier-card, callout-card-coral, connector-tile, text-input, badge-pill, badge-coral, category-tab, cookie-consent-card, footer
- **Spacing system**: 4px-base spacing scale (4px–96px), border radius tokens (4px–9999px), elevation philosophy (color-block depth, no shadows)
- **Fonts**: Copernicus (licensed slab serif), StyreneB (licensed humanist sans), JetBrains Mono (open-source monospace)
- **Open-source substitutes**: Cormorant Garamond for display serif (weight 500, -0.02em tracking), Inter for humanist body

## When to use this skill

Use this skill when building any artifact that should match the Claude.com / Anthropic marketing visual identity:

- **Landing pages and hero sections** — cream canvas, serif display headlines, coral CTA buttons
- **Feature showcase sections** — 3-up feature card grids with cream surface-card backgrounds
- **Product mockup pages** — dark navy code-editor cards with JetBrains Mono and syntax-highlighted code
- **Pricing pages** — tier cards with cream standard and dark navy featured variants
- **Code-editor showcase cards** — code-window card component with line numbers, status bars, dark-soft code block interior
- **Connector/integration grids** — tappable connector tiles with logo, name, description
- **Callout CTA bands** — full-bleed coral callout cards or dark developer-focused pre-footer bands
- **Editorial/technical content pages** — editorial pacing with generous whitespace, alternating surface bands, minimal motion
- **All marketing surfaces for AI products** that should position against cool-gray/cyan/blue competitor brands

Do NOT use this skill for:
- Cool-gray or pure-white brand identities that require a different palette
- Cyan, blue, or purple brand accent colors (coral is the only brand voltage)
- Gradient-heavy or shadow-heavy designs (the system is flat, color-block driven)
- Heavy animation or motion-rich interfaces (the system is intentionally still)
- Claude.ai internal product chrome (chat bubbles, tool interfaces, sidebar conversations) — those are a separate product surface with different component sets
- Android or iOS native app designs (the system is web-first)

## How to use

1. **Read the package overview** — open `README.md` for product context, package contents, preview manifest, and reuse workflow
2. **Read the full design system** — open `DESIGN.md` for all 9 sections: visual theme, color tokens, typography hierarchy, spacing scale, layout & grid, component specifications with padding/radius/type/color, motion philosophy, voice & brand, and anti-patterns
3. **Load the CSS tokens** — inline or link `colors_and_type.css` as the CSS custom property source; bind into `:root` of your artifact:
   ```css
   @import url("colors_and_type.css");
   /* or inline the :root block into your own <style> tag */
   ```
4. **Browse the preview cards** — open each file in `preview/` to visually inspect all color tokens, typography specimens, spacing tokens, radius tokens, elevation levels, button variants, input components, and brand assets; use these as reference when building new components
5. **Reference brand assets** — copy SVG assets from `assets/spike-mark.svg` and `assets/wordmark.svg` for brand-appropriate usage
6. **Study the applied example** — open `ui_kits/app/index.html` in a browser to see the design system applied as a runnable interface: sidebar, assistant list, chat area, message bubbles, input bar composed into a product-like surface
7. **Follow the anti-patterns** — DESIGN.md §9 lists every visual and content anti-pattern: no cool grays, no bold serif, no cyan accent, no gradient backgrounds, no drop shadows on cards, no emoji feature icons, no repeated same-surface consecutive bands
8. **Apply the surface pacing rule** — alternate surface modes across page bands: cream canvas → cream feature cards → dark product mockups → cream → coral callout → dark footer; no two consecutive bands share the same surface

## Design system highlights

All tokens, components, and rules below are extracted from the source evidence in `context/source-context.md` (claude.ai public marketing site).

### Visual Trinity

| Element | Token | Hex/Value | Role |
|---|---|---|---|
| Cream canvas | `--color-canvas` | #faf9f5 | Warm editorial page floor — never pure white |
| Coral accent | `--color-primary` | #cc785c | CTA buttons, callout cards, brand voltage |
| Dark navy surface | `--color-surface-dark` | #181715 | Code editors, model cards, footer |

### Typography Roles

- **Display headlines**: Copernicus serif (or Cormorant Garamond), weight 400, negative letter-spacing (-0.3px to -1.5px). Never bold. Never sans.
- **Body text**: StyreneB (or Inter), weight 400 for paragraphs, weight 500 for labels and navigation. Humanist — never geometric.
- **Code**: JetBrains Mono, weight 400, 14px.

### Surface Pacing

Alternating bands across every page:
```
cream canvas → cream feature cards → dark navy mockups → cream → coral callout → dark footer
```

No two consecutive bands share the same surface color. The cream-to-dark contrast IS the page's rhythm.

### Elevation Philosophy

Depth comes from surface color contrast, not shadows. Most cards use flat background color with no shadow. The three elevation levels are: flat (no shadow, no border), soft hairline (1px `--color-hairline` border), and dark surface card (`--color-surface-dark` background). A rare `0 1px 3px rgba(20,20,19,0.08)` drop shadow is used only for hover-elevated interactive states.

### Component Patterns (full specs in DESIGN.md §6)

- **button-primary**: 40px height, 12px × 20px padding, 8px radius, coral bg (#cc785c), white text, darkens on press
- **feature-card**: cream surface-card bg (#efe9de), 12px radius, 32px padding, flat (no shadow)
- **code-window-card**: dark surface (#181715), JetBrains Mono, 24px padding, inner dark-soft (#1f1e1b) code block
- **callout-card-coral**: full-bleed primary bg (#cc785c), white text, 48px padding, cream button variant inside
- **pricing-tier-card-featured**: dark surface bg IS the featured signal — no border, no star, no badge
- **text-input**: cream canvas bg, 40px height, 8px radius, hairline border, coral focus ring (3px 15% alpha)
- **category-tab-active**: cream surface-card bg (#efe9de), ink text, 8px × 14px padding, 8px radius

### Key Anti-patterns

- ❌ Pure white or cool gray page backgrounds (cream is the brand)
- ❌ Bold weight (700) on serif display (stay at 400)
- ❌ Cyan, blue, or purple brand accents (coral is the voltage)
- ❌ Inter/Roboto/Arial for display headlines (serif is the brand voice)
- ❌ Drop shadows on cards (depth from color contrast)
- ❌ Gradient backgrounds (the system is flat)
- ❌ Emoji as feature icons (use minimal line-art or no icon)
- ❌ Three consecutive same-surface bands (must alternate)
- ❌ Skeleton screens or spinners (instant render)
- ❌ Invented metrics or lorem ipsum (real copy only)
- ❌ Hover scale or lift on buttons (darken on press only)
