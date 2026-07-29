---
name: open-design-landing-deck
description: >
  Produce a single-file slide deck in the Atelier Zero visual language
  (warm-paper background, italic-serif emphasis spans, coral terminating
  dots, surreal collage plates) — Open Design's brand deck recipe.
  The deck uses **horizontal magazine-style swipe pagination** (←/→,
  wheel, swipe), a per-slide chrome strip with brand mark and slide
  counter, an ESC overview grid, a coral progress bar, and inherits
  the canonical stylesheet + 16-slot image library from the sister
  `open-design-landing` skill.
triggers:
  - slide deck
  - 演示文稿
  - pitch deck
  - keynote
  - editorial slides
  - atelier zero deck
  - open design deck
  - open design landing deck
od:
  category: brand-deck
  surface: web
  mode: deck
  scenario: marketing
  featured: 2
  audience: founders pitching, conference talks, internal reviews
  tone: editorial, restrained, premium
  scale: 6-15 viewport-locked slides
  preview:
    type: html
    entry: index.html
  craft:
    requires:
      - typographic-rhythm
      - pixel-discipline
inputs:
  - id: brand
    label: Brand identity (shared across slides)
    schema_path: ./schema.ts#BrandBlock
  - id: deck_title
    label: Kicker shown in the per-slide top chrome
    description: e.g. `'Open Design · Vol. 01 / Issue Nº 26'`.
  - id: slides
    label: Ordered list of typed slides
    description: >
      Each entry is one of seven slide kinds. Mix and match freely; the
      composer routes each by `kind`.
    schema_path: ./schema.ts#Slide
  - id: imagery
    label: Image library (defaults to sister skill's assets)
    schema_path: ../open-design-landing/schema.ts#ImageryConfig
parameters:
  slides_recommended_count:
    type: number
    default: 11
    description: 8-15 is the sweet spot. Below 6 the deck feels thin; above 18 attendees lose the thread.
outputs:
  - path: <out>/index.html
    description: Self-contained HTML deck — Atelier Zero CSS inlined, runtime script inline, images relative.
capabilities_required:
  - file-write
  - node-runtime
example_prompt: |
  Build me an 11-slide pitch deck for "Lumen Field", a focus-soundscape
  studio. Cover with hero plate, two section dividers, two product
  content slides with bullets, a stats slide showing 12 soundscapes / 4
  presets / 1 daily ritual, a customer quote, a closing CTA, and an end
  card. Reuse the open-design-landing image library.
---

# open-design-landing-deck

Sister skill to [`open-design-landing`](../open-design-landing/). Same
Atelier Zero visual system (warm paper, Inter Tight + Playfair Display,
italic-serif emphasis, coral dots), but paginated as a **horizontal
magazine-style swipe deck** instead of a long scrolling page.

The navigation model is intentionally borrowed from the
[`guizang-ppt`](../guizang-ppt/) skill — `←/→` arrow keys, wheel /
swipe, ESC for the overview grid — so it feels like a print magazine
flipping page by page rather than a web slide deck scrolling.

```text
inputs.json + ../open-design-landing/styles.css
        │
        └──────────► scripts/compose.ts
                            │
                            ▼
                   <out>/index.html
                   (one viewport per slide, horizontal swipe)
```

## What you get

- A single self-contained HTML file with N viewport-sized slides laid
  out horizontally on one transformed flex track.
- **Keyboard navigation**: `←/→` · `↑/↓` · PageUp/PageDown · Space ·
  Home/End.
- **Wheel + touch swipe** (with momentum guard so a single trackpad
  flick doesn't overshoot).
- **Per-slide chrome strip**: brand mark, deck title, location,
  Roman-numeral year, live slide counter (`01 / 11`).
- **Coral progress bar** at the bottom that fills as you advance.
- **Dot indicator** strip near the bottom; click any dot to jump.
- **ESC overview grid** — scaled thumbnails of every slide, click to
  jump. Mirrors `guizang-ppt`'s overview UX.
- Reuses the **same 16-slot image library** as the sister skill — no
  duplicate assets.

## Slide types

| Kind        | Use it for                                                    |
| :---------- | :------------------------------------------------------------ |
| `cover`     | Title plate at the start. 2-column copy + collage art.        |
| `section`   | Roman-numeral divider between chapters. Centered, full-bleed. |
| `content`   | Eyebrow + title + body + bullets + optional collage art.      |
| `stats`     | Up to 4 large stat cells (value · label · sub-label).         |
| `quote`     | Pull quote + author. Optional portrait collage on the right.  |
| `cta`       | Closing pitch + 1-2 buttons.                                  |
| `end`       | Mega italic-serif kicker word + signature footer.             |

A typical 11-slide pitch:

```
1. cover     — title plate, hero collage
2. section   — "I. The problem"
3. content   — about / manifesto, bullets
4. content   — capabilities, bullets
5. stats     — 4 numbers
6. section   — "II. How it feels"
7. content   — method, bullets
8. content   — selected work
9. quote     — customer testimonial
10. cta      — primary + secondary action
11. end      — mega kicker + signature
```

## Workflow

### 1. Author `inputs.json`

Start from [`inputs.example.json`](./inputs.example.json) (the Open
Design pitch deck). The brand block, image strategy, and assets path
mirror the sister skill — if you already filled out an
`open-design-landing` brief, copy `brand` and `imagery` over verbatim.

For each slide, pick a `kind` and fill the typed fields from
[`schema.ts`](./schema.ts). `MixedText` (sans-serif baseline +
italic-serif emphasis spans + coral terminating dot) is the same
encoding used by the sister skill — see its `inputs.example.json`.

### 2. (Optional) generate or stub imagery

This skill does **not** ship its own image generator or placeholder
script — it shares the 16-slot library from `open-design-landing`. To
regenerate or stub:

```bash
# generate via gpt-image-2 (fal.ai)
FAL_KEY=... npx tsx ../open-design-landing/scripts/imagegen.ts ../open-design-landing/inputs.example.json --out=../open-design-landing/assets/

# or paper-textured SVG placeholders
npx tsx ../open-design-landing/scripts/placeholder.ts ../open-design-landing/assets/
```

Set your deck's `inputs.imagery.assets_path` to wherever those PNGs
live (default in the example: `../open-design-landing/assets/`).

### 3. Compose the deck

```bash
npx tsx scripts/compose.ts inputs.json out/index.html
```

The composer reads `inputs.json`, loads the canonical Atelier Zero
stylesheet from `../open-design-landing/styles.css`, layers
deck-specific rules on top (horizontal flex track, slide layouts,
HUD, dot nav, ESC overview, keyboard / wheel / touch handlers), and
writes one self-contained HTML file.

### 4. Self-check

- [ ] Open the HTML in a fresh browser tab; slide 1 (cover) shows
      with chrome strip top-right showing `01 / N`.
- [ ] Press `→` (or Space, or scroll-down). Smoothly slides one
      viewport to the right; dot nav advances; the coral progress bar
      ticks forward.
- [ ] Press `End`. Jumps to the final slide.
- [ ] Press `Home`. Returns to slide 1.
- [ ] Press `Esc`. Overview grid appears with scaled thumbnails;
      click any tile to jump and dismiss the overview.
- [ ] Resize to 1080px and 640px. Cover / content slides collapse to
      a single column; dot nav still works; chrome strips shrink.
- [ ] `prefers-reduced-motion: reduce` (DevTools → Rendering): page
      transitions stay snappy and don't induce motion sickness.
- [ ] Lighthouse: contrast AA, font-display swap, no layout shift.

## Boundaries

- **Reuse the sister skill's stylesheet.** The composer reads
  `../open-design-landing/styles.css` at compile time. Do not
  maintain a duplicate copy here; if Atelier Zero tokens evolve, edit
  them once in the sister skill.
- **Reuse the sister skill's image library.** No need to re-prompt or
  re-render — the same 16 plates work for both surfaces.
- **Keep slides single-viewport.** If a slide's content does not fit
  100vh × 100vw at 1280×800 it will overflow and feel cramped. Trim
  copy or split into two slides.
- **Do not switch to vertical scroll-snap.** The horizontal swipe
  posture is what makes this skill feel like a magazine spread; a
  vertical scroller would just be a long landing page.
- **Do not add a router.** This is a single-file artifact. Multi-page
  decks are out of scope; for a multi-deck experience, render each
  deck separately and link from a parent index.

## See also

- [`open-design-landing`](../open-design-landing/) — landing page sister skill.
- [`guizang-ppt`](../guizang-ppt/) — the magazine-deck navigation
  pattern this skill borrows.
- [`design-systems/atelier-zero/DESIGN.md`](../../design-systems/atelier-zero/DESIGN.md) — token spec.
