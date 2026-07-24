---
name: liquid-glass-card
description: |
  Apple-style "liquid glass" card and pill-button treatment from KokonutUI: an SVG
  feTurbulence + feDisplacementMap filter applied as a backdrop-filter so the content
  behind the surface bends like liquid, plus a layered inset-shadow stack for the
  glass edge highlights and a soft 2px backdrop blur. Ships a dependency-free
  HTML/CSS reference (example.html) and the original React/shadcn source
  (liquid-glass-card.tsx).
triggers:
  - "liquid glass"
  - "glass card"
  - "glassmorphism card"
  - "apple glass effect"
  - "frosted glass button"
  - "kokonutui"
od:
  mode: prototype
  platform: desktop
  scenario: design
  upstream: "https://kokonutui.com/docs/cards/liquid-glass-card"
  example_prompt: "Build a liquid-glass 'now playing' card over a warm sunset-gradient background: a frosted glass panel with a track title, artist, a progress slider, and a pill-shaped play button, so the gradient visibly bends through the glass. Then re-tokenize the --lg-* variables to my brand and verify it against references/checklist.md."
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
---

# liquid-glass-card

> Adapted from KokonutUI (MIT, @dorianbaffier) — https://kokonutui.com/docs/cards/liquid-glass-card
> Full MIT license and attribution: [`references/LICENSE`](references/LICENSE).

## What it does

Gives any card, button, dock, or panel the Apple-style **liquid glass** look. Three
stacked ingredients, all in `example.html`:

1. **Liquid distortion** — a hidden SVG filter (`feTurbulence → feGaussianBlur →
   feDisplacementMap scale 30 → feGaussianBlur`) applied to a full-bleed layer via
   `backdrop-filter: url(#liquid-glass-filter)`. This displaces whatever renders
   *behind* the surface, which is what reads as "liquid".
2. **Glass edge** — a pointer-events-none overlay carrying the layered inset
   box-shadow stack (thin bright inner rims top-left/bottom-right, wide soft inner
   glow, faint outer drop shadow).
3. **Frost** — `backdrop-filter: blur(2px) saturate(1.15)` plus a ~6% white surface
   tint on the element itself.

Buttons use the same recipe with `border-radius: 999px` and a stronger displacement
(`scale 70`, `#liquid-glass-filter-strong`).

## How to use

- **In any HTML artifact**: copy the `<svg>` filter defs once into the document, then
  apply the `.liquid-glass` / `.liquid-glass-btn` pattern from `example.html`.
  Re-tokenize the `--lg-*` custom properties to the active design system (canvas,
  foreground, accent, radius) — do NOT keep the demo's NIX-flavored defaults on
  other brands.
- **In React projects**: use `liquid-glass-card.tsx` (original source). It expects
  shadcn/ui `Button` + `Card`, `cn`, `cva`, `lucide-react`, Tailwind v4, and
  `next/image` (swap for `<img>` outside Next). Install via
  `bunx shadcn@latest add @kokonutui/liquid-glass-card` in real app repos.

## Before emitting (required gate)

Before you emit the artifact, run **every P0 gate** in
[`references/checklist.md`](references/checklist.md): distortion visible over a
non-flat background, isolated stacking context on each glass root, non-Chromium
fallback wired, WCAG-AA contrast against the effective backdrop, and `--lg-*`
tokenized to the active brand. If any P0 gate fails, fix the output and re-check —
do not ship a glass surface that fails one.

## Constraints

- The effect only reads on **busy or gradient backgrounds** — over a flat solid
  color the displacement is invisible. Place glass surfaces over imagery, auras,
  or gradients.
- `backdrop-filter: url(#…)` is **Chromium-only**; Safari/Firefox get the graceful
  fallback (blur + saturate + edge shadows) already wired in `example.html`. Never
  rely on the distortion alone to convey information.
- Keep one shared filter def per document; per-element filters at high `scale`
  are GPU-costly. Avoid animating the filter itself.
- The inset-shadow stack above is the dark-canvas variant. On light canvases use
  the light stack from the TSX (`GLASS_SHADOW_LIGHT`, black-based insets).
