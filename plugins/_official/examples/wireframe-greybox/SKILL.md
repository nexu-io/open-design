---
name: wireframe-greybox
description: |
  A crisp greybox / blueprint lo-fi wireframe — neutral grey blocks on a
  pale page, image placeholders drawn as a rectangle with a diagonal X,
  text shown as solid "lorem bars" of varying widths, sharp 1.5–2px
  borders, and a single monospace redline accent for annotations. Reads
  like a structural blueprint before any visual design is applied. Use
  when the brief asks for "greybox", "blueprint wireframe", "lo-fi
  dashboard", "low fidelity", "线框图", or "灰盒原型".
triggers:
  - "greybox"
  - "grey box wireframe"
  - "blueprint wireframe"
  - "lo-fi dashboard"
  - "low fidelity"
  - "wireframe"
  - "线框图"
  - "灰盒"
od:
  mode: prototype
  platform: desktop
  scenario: design
  fidelity: wireframe
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
    sections: [color, typography, layout, components]
  example_prompt: "Greybox a lo-fi blueprint wireframe for a desktop SaaS dashboard — app bar, sidebar nav, a 4-up KPI row, a schematic chart panel, and a list/table with image-placeholder thumbnails, all in neutral grey with monospace redline annotations."
---

# Wireframe Greybox Skill

Produce a single crisp greybox wireframe page. The whole point is
*structure, not skin* — communicate hierarchy and layout with neutral
grey blocks, never with real color, copy, or imagery. Everything is a
placeholder: text is grey "lorem bars", images are rectangles with a
diagonal cross, numbers are big solid blocks. The only color on the page
is the single redline accent reserved for monospace annotations.

## Workflow

1. **Stay structural.** Ignore any DESIGN.md that pushes finished UI —
   this is deliberately low fidelity. Use a clean system sans (Inter /
   system-ui) for shape and a mono (IBM Plex Mono / JetBrains Mono) for
   the redline annotations only. No hand-drawn fonts, no brand color.
2. **Set the greybox palette.** Page is a pale neutral (`#f7f7f8`),
   blocks are medium grey (`#e3e3e6`), borders are crisp and defined
   (`#c9c9cf` for soft edges, `#1c1b1a` for emphasis), and exactly one
   accent (a blue or coral redline) carries every monospace annotation.
   Keep contrast high enough to read as a small thumbnail — never
   near-white-on-white.
3. **Lay out the dashboard**, in order, each on its own `data-od-id`:
   - **App bar** — a logo greybox, a row of nav lorem-bars, and an
     avatar circle on the right.
   - **Sidebar nav** — icon squares + lorem-bar labels; mark one item
     active with a filled/inverted block.
   - **KPI row** — four greyboxes, each a small label bar above a big
     solid "number" bar.
   - **Chart panel** — an inline SVG greybox: axes plus a few
     hatched/grey bars or a schematic line. No real data.
   - **List / table panel** — a header row plus ~5 rows of lorem bars,
     with one column of image-placeholders drawn as a box with a
     diagonal X.
   - **Annotations** — one or two small monospace redlines pinned to the
     canvas (e.g. `01 · 12-col grid`, `max-width 1280`).
4. **Write** one self-contained HTML document — `<!doctype html>`
   through `</html>`, CSS inline, no external JS or images. SVG and CSS
   draw every placeholder. A `max-width` container plus a media query
   collapses columns under ~1000px.
5. **Self-check.** It should read as a blueprint at thumbnail size: grey
   blocks, X-crossed image boxes, lorem bars, and exactly one accent
   color on the monospace redlines. If any greybox is missing, the page
   looks colored, or it disappears as a blank thumbnail, fix it.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="wireframe-slug" type="text/html" title="Wireframe — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
