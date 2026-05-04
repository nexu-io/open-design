---
name: editorial-collage-deck
description: >
  Produce a single-file slide deck in the Atelier Zero visual language
  (warm-paper background, italic-serif emphasis spans, coral terminating
  dots, surreal collage plates). The deck uses scroll-snap pagination,
  arrow-key + space navigation, a live HUD with slide counter and
  progress bar, and inherits the canonical stylesheet + 16-slot image
  library from the sister `editorial-collage` skill.
triggers:
  - slide deck
  - 演示文稿
  - pitch deck
  - keynote
  - editorial slides
  - atelier zero deck
od:
  category: brand-deck
  surface: web
  audience: founders pitching, conference talks, internal reviews
  tone: editorial, restrained, premium
  scale: 6-15 viewport-locked slides
  craft:
    requires:
      - typographic-rhythm
      - pixel-discipline
inputs:
  - id: brand
    label: Brand identity (shared across slides)
    schema_path: ./schema.ts#BrandBlock
  - id: deck_title
    label: Kicker shown in the HUD top bar
    description: e.g. `'Open Design · Vol. 01 / Issue Nº 26'`.
  - id: slides
    label: Ordered list of typed slides
    description: >
      Each entry is one of seven slide kinds. Mix and match freely; the
      composer routes each by `kind`.
    schema_path: ./schema.ts#Slide
  - id: imagery
    label: Image library (defaults to sister skill's assets)
    schema_path: ../editorial-collage/schema.ts#ImageryConfig
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
  card. Reuse the editorial-collage image library.
---

# editorial-collage-deck

Sister skill to [`editorial-collage`](../editorial-collage/). Same
Atelier Zero visual system (warm paper, Inter Tight + Playfair Display,
italic-serif emphasis, coral dots), but paginated as a slide deck
instead of a long landing page.

```text
inputs.json + ../editorial-collage/styles.css
        │
        └──────────► scripts/compose.ts
                            │
                            ▼
                   <out>/index.html
                   (one viewport per slide, scroll-snap)
```

## What you get

- A single self-contained HTML file with N viewport-height slides.
- **Keyboard navigation**: ←/→ · ↑/↓ · PageUp/PageDown · Space · Home/End.
- **HUD top bar**: brand mark, deck title, key hint, live slide counter.
- **Coral progress bar** at the bottom that fills as you advance.
- **Scroll-snap pagination** with `scroll-snap-stop: always` so each
  slide settles cleanly.
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
`editorial-collage` brief, copy `brand` and `imagery` over verbatim.

For each slide, pick a `kind` and fill the typed fields from
[`schema.ts`](./schema.ts). `MixedText` (sans-serif baseline + italic-serif
emphasis spans + coral terminating dot) is the same encoding used by
the sister skill — see its `inputs.example.json` for examples.

### 2. (Optional) generate or stub imagery

This skill does **not** ship its own image generator or placeholder
script — it shares the 16-slot library from `editorial-collage`. To
regenerate or stub:

```bash
# generate via gpt-image-2 (fal.ai)
FAL_KEY=... npx tsx ../editorial-collage/scripts/imagegen.ts ../editorial-collage/inputs.example.json --out=../editorial-collage/assets/

# or paper-textured SVG placeholders
npx tsx ../editorial-collage/scripts/placeholder.ts ../editorial-collage/assets/
```

Set your deck's `inputs.imagery.assets_path` to wherever those PNGs
live (default in the example: `../editorial-collage/assets/`).

### 3. Compose the deck

```bash
npx tsx scripts/compose.ts inputs.json out/index.html
```

The composer reads `inputs.json`, loads the canonical Atelier Zero
stylesheet from `../editorial-collage/styles.css`, layers deck-specific
rules (scroll-snap container, slide layout grid, HUD, keyboard nav)
on top, and writes one self-contained HTML file.

### 4. Self-check

- [ ] Open the HTML in a fresh browser tab; slide 1 (cover) shows
      with HUD `01 / N` in the corner.
- [ ] Press `→` (or Space). Smoothly advances to slide 2 with
      `02 / N` in the counter and the coral progress bar filling.
- [ ] Press `End`. Jumps to the final slide.
- [ ] Press `Home`. Returns to slide 1.
- [ ] `prefers-reduced-motion: reduce` (DevTools → Rendering): smooth
      scroll still works, but page transitions are instant.
- [ ] Resize to 1080px and 640px. Slides stack appropriately; no
      horizontal scrollbar; HUD shrinks gracefully.
- [ ] Lighthouse: contrast AA, font-display swap, no layout shift.

## Boundaries

- **Reuse the sister skill's stylesheet.** The composer reads
  `../editorial-collage/styles.css` at compile time. Do not maintain a
  duplicate copy here; if Atelier Zero tokens evolve, edit them once
  in the sister skill.
- **Reuse the sister skill's image library.** No need to re-prompt or
  re-render — the same 16 plates work for both surfaces.
- **Keep slides single-viewport.** If a slide's content does not fit
  100vh at 1280×800 it will overflow and feel cramped. Trim copy or
  split into two slides.
- **Do not add a router.** This is a single-file artifact. Multi-page
  decks are out of scope; for a multi-deck experience, render each
  deck separately and link from a parent index.

## See also

- [`editorial-collage`](../editorial-collage/) — landing page sister skill.
- [`design-systems/atelier-zero/DESIGN.md`](../../design-systems/atelier-zero/DESIGN.md) — token spec.
