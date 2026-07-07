---
name: "Design System Extract"
description: "Claude design system prompt skill for Design System Extract"
triggers:
  - "claude design system extract"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Design System Extract: Pull Tokens from Sources

Extract design tokens (color, typography, spacing, radii, shadow) from a brand reference, codebase, or screenshots, and emit a structured tokens file. Use this when starting design work that should match an existing visual language. Once tokens exist, future designs reference them — keeping the system consistent without re-asking the user for values.

## Phase 1: Identify sources

The user may provide a codebase (read theme files: `theme.ts`, `tokens.css`, `_variables.scss`, `tailwind.config.js`, design system source), a live site or screenshots, a brand guide (PDF, Figma, doc), or an existing UI kit project. If unspecified, ask — invented tokens defeat the point.

## Phase 2: Extract by category

Capture concrete values from the source — never guess.

### Colors

- **Brand primary and accent** (with dark/light variants where defined)
- **Semantic** — success, warning, error, info (plus their light backgrounds where defined)
- **Neutral scale** — typically 9–11 steps from near-white to near-black, consistent tone (warm / cool / neutral)
- **Surfaces** — background, foreground, card, overlay, border

For each: the hex (or oklch) value, its name in the source, and its documented usage. Flag inconsistencies — multiple slightly different blues, neutrals on different tones — as findings for the user. Don't silently merge them; the inconsistency itself is information.

### Typography

- **Families** — sans, serif, mono, with full fallback stacks
- **Sizes** — the actual scale in use, not a generic one
- **Weights** — only those actually loaded
- **Line heights** — at minimum tight (~1.1) for headlines, normal (~1.5) for body, loose (~1.7) for long-form
- **Letter spacing** — usually only matters for all-caps labels
- **Named text styles** ("Heading 1", "Body Large", "Caption") if the source defines them

### Spacing

The actual scale in use (common bases: 4px or 8px, typically running to 64–128px). If the source has separate scales for inset / inline / block / between-components, capture all of them.

### Radii and shadows

Corner-radius values (typically 3–5 distinct: `0 / 4 / 8 / 12 / 9999`) and the elevation scale with full CSS values (offset, blur, spread, color, opacity).

### Other tokens, if present

Z-index scale, animation durations and easings, breakpoints, container widths.

## Phase 3: Emit the tokens file

Write a `tokens.css` — or match the source's format and naming convention (`tokens.ts` with typed exports, `tokens.json`, a Tailwind config extension). Group by category with clear names:

```css
:root {
  /* Brand */
  --color-primary: #...;   --color-accent: #...;
  /* Semantic */
  --color-success: #...;   --color-error: #...;
  /* Neutrals */
  --color-gray-50: #...;   /* … through --color-gray-900 */
  /* Surfaces */
  --color-bg: #...;   --color-surface: #...;   --color-border: #...;

  --font-sans: "...", -apple-system, sans-serif;
  --text-base: 16px;       /* full size scale as found */
  --weight-regular: 400;   /* only loaded weights */
  --leading-normal: 1.5;

  --space-1: 4px;          /* full spacing scale as found */
  --radius-md: 8px;
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

## Phase 4: Document findings

Summarize: **sources used**; **categories extracted**; **gaps** — token sets the source doesn't define (these are the user's decisions to make; don't fill them silently); **inconsistencies** — near-duplicate values or off-scale outliers worth consolidating; **recommended next steps** — typically review the file with the user, then use it in subsequent designs.
