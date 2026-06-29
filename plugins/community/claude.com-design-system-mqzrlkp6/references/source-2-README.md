# Claude.com Design System

> Warmest, most editorial interface in the AI-product category. Cream canvas, coral accent, Copernicus serif headlines + StyreneB/Inter body.

**Surface**: Responsive web (marketing)
**Status**: Live (claude.ai)
**Package version**: 1.0.0

---

## Product Overview

Claude.com is Anthropic's AI assistant marketing site. The visual identity is anchored on a warm cream canvas (#faf9f5) — a deliberate counter-positioning against every other AI brand's cool slate or pure white. Brand voltage comes from coral (#cc785c), used on primary CTAs and full-bleed callout cards. Headlines run a slab-serif display face (Copernicus, weight 400, negative tracking) paired with a humanist sans body (StyreneB/Inter). Dark navy surfaces (#181715) carry product chrome — code editor mockups, model comparison cards, and the footer.

### Primary UI Surfaces

| Surface | Token | Hex | Role |
|---|---|---|---|
| Canvas | `--color-canvas` | #faf9f5 | Default page floor |
| Feature cards | `--color-surface-card` | #efe9de | Content cards, feature grids |
| Product mockups | `--color-surface-dark` | #181715 | Code editors, model cards, footer |
| Coral callout | `--color-primary` | #cc785c | CTA bands, primary buttons |

### Core Capabilities

- **Editorial typography**: Serif display headlines + humanist sans body. No bold weights on display.
- **Surface pacing**: Alternating cream → card → dark → cream → coral → dark band rhythm.
- **Color-block elevation**: Depth comes from surface contrast, not shadows.
- **Code-first hero treatment**: Product mockups show real code editor chrome, not marketing illustrations.
- **Minimal interaction**: Primary buttons darken on press; no lift, scale, or animation.

---

## Package Contents

```
.
├── DESIGN.md                  # Canonical design system rules (9 sections)
├── README.md                  # This file — package guide
├── SKILL.md                   # Agent-usable skill with YAML frontmatter
├── colors_and_type.css        # Reusable CSS tokens and component classes
├── context/
│   └── source-context.md      # Source evidence from claude.ai
├── assets/
│   ├── spike-mark.svg         # Anthropic radial spike-mark glyph
│   └── wordmark.svg           # Claude wordmark with spike-mark prefix
├── build/
│   └── README.md              # Runtime asset placeholder (no installer assets from source)
├── fonts/
│   └── README.md              # Font licensing notes and open-source substitutes
├── preview/
│   ├── colors-primary.html    # Brand, accent, text, and semantic color swatches
│   ├── colors-theme-light.html# Light surface scale + hairline borders + surface demo
│   ├── colors-theme-dark.html # Dark surface scale + code window card + dark text hierarchy
│   ├── typography-specimens.html # Every type token with specimen text and size info
│   ├── spacing-tokens.html    # Spacing scale visualization + usage examples
│   ├── spacing-radius.html    # Border radius scale with visual swatches
│   ├── spacing-shadows.html   # Elevation levels + surface pacing rhythm demo
│   ├── components-buttons.html# All button variants with interactive states
│   ├── components-inputs.html # Text inputs, badges, tabs, cookie consent card
│   └── brand-assets.html      # Spike-mark, wordmark, surface context demos
├── source_examples/           # No source code available for this package
└── ui_kits/
    └── app/
        ├── README.md          # App kit structure and usage guide
        ├── index.html         # Runnable browser entry — loads components + renders app
        └── components/
            ├── Sidebar.jsx
            ├── AssistantsList.jsx
            ├── ChatArea.jsx
            ├── MessageBubble.jsx
            ├── InputBar.jsx
            └── App.jsx
```

---

## Preview Manifest

| Preview | Path | What to inspect |
|---|---|---|
| Brand & accent colors | `preview/colors-primary.html` | Full color palette: brand, accent, text, semantic tokens with hex values |
| Light surfaces | `preview/colors-theme-light.html` | Light surface scale (canvas → card → cream-strong), hairlines, and the alternating band demo |
| Dark surfaces | `preview/colors-theme-dark.html` | Dark surface tokens, code-window card with syntax-highlighted code, dark text hierarchy |
| Typography specimens | `preview/typography-specimens.html` | Every type token rendered with specimen text: display-xl through caption, code, nav-link |
| Spacing scale | `preview/spacing-tokens.html` | Visual bar-chart of every spacing token, usage examples for card paddings |
| Border radius | `preview/spacing-radius.html` | Every radius token with visual box + usage label |
| Elevation & shadows | `preview/spacing-shadows.html` | All elevation levels, surface pacing rhythm diagram |
| Button components | `preview/components-buttons.html` | All 5 button variants + disabled/hover states + on-dark + text links + spec table |
| Input components | `preview/components-inputs.html` | Text inputs, badges, category tabs, cookie consent card + spec table |
| Brand assets | `preview/brand-assets.html` | Spike-mark SVG, wordmark SVG, three surface context demos, asset manifest |

---

## Reuse Workflow

### For agents (via SKILL.md)
Load `SKILL.md` as the skill entry point. It directs agents to README.md → DESIGN.md → colors_and_type.css → preview/ → ui_kits/app/.

### For designers
1. Read `DESIGN.md` for the full visual system.
2. Open `preview/` cards in-browser for visual reference.
3. Copy `colors_and_type.css` into your project and bind CSS custom properties.
4. Reference component specs from DESIGN.md §6 for correct padding, radius, type, and color tokens.
5. Use `assets/spike-mark.svg` and `assets/wordmark.svg` for brand usage.

### For developers
1. Load `colors_and_type.css` as a stylesheet in your entry HTML.
2. Use the CSS custom properties (`--color-*`, `--text-*`, `--space-*`, `--radius-*`) directly.
3. Use the component classes (`.button-primary`, `.feature-card`, `.text-input`, etc.) for common components.
4. For custom components, follow the token system defined in DESIGN.md.

---

## Source & Attribution

- **Design system extracted from**: claude.ai public marketing site
- **Typefaces**: Copernicus and StyreneB are licensed Anthropic typefaces. Open-source substitutes documented in DESIGN.md §3 and fonts/README.md.
- **Brand marks**: The Anthropic radial spike-mark is a brand asset of Anthropic.
- **Evidence file**: `context/source-context.md` contains the full extracted specification.

---

## Design System Highlights

- **Warm cream canvas** (#faf9f5) — never pure white or cool gray
- **Coral accent** (#cc785c) — scarce on individual elements, generous on callout cards
- **Copernicus serif display** — weight 400, negative letter-spacing. Never bold. Never sans.
- **StyreneB/Inter body** — humanist, weight 400 paragraphs / 500 labels
- **Dark navy surfaces** (#181715) — code editors, model cards, footer
- **Surface pacing** — alternating bands: cream → card → dark → cream → coral → dark
- **Color-block elevation** — depth from surface contrast, not shadows
- **Restrained interaction** — primary darkens on press, no scale/lift
- **Three surface modes** — canvas (warm cream), card (slightly darker cream), dark (navy)
- **One accent per screen rule** — coral used at most twice per page
