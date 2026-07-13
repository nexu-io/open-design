---
name: wireframe-sketch
description: |
  A hand-drawn wireframe exploration — graph-paper background, marker /
  pencil tone, multiple tab labels for variants, sticky-note annotations,
  scribbled chart placeholders, hatched fills. Reads like a designer's
  whiteboard before any pixels are committed. Use when the brief asks for
  "wireframe", "sketch wireframe", "hand-drawn", "lo-fi", "whiteboard",
  "草稿", or "手绘原型".
triggers:
  - "wireframe"
  - "sketch wireframe"
  - "lo-fi mockup"
  - "hand drawn"
  - "whiteboard sketch"
  - "low fidelity"
  - "手绘原型"
  - "草图"
  - "线框图"
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
  example_prompt: "Sketch a hand-drawn wireframe v0.1 for a portal — four tabbed variants on graph paper, marker headlines, sticky-note annotations, hatched chart placeholders."
---

# Wireframe Sketch Skill

Produce a single hand-drawn wireframe page. The whole point is "this is a
sketch" — looseness is the brand. Lean into pencil/marker tones, hatched
fills, dashed borders, slight rotations.

## Workflow

1. **Skip the DESIGN.md** if it pushes for finished UI. This skill explicitly
   wants a low-fidelity look. Only honor type tokens loosely (system serif
   for headlines, mono for annotations, marker font fallback).
2. **Pick the screen variants** from the brief — typically 3–4 tab labels
   like "01 · A · ORGANIZED", "02 · B · DASHBOARD", etc. One is "active",
   the rest are inactive sketch tabs.
3. **Layout**, in order:
   - **Page header** — bold serif title with a fake "WIREFRAME v0.1" tag
     pinned next to it (dashed border, slight rotation). Below: one-line
     subtitle in marker italic + a date / device / fidelity dateline on
     the right in mono.
   - **Tab strip** — 4–5 labels with marker check-square glyphs. The active
     one has a highlighter swipe behind it (yellow / orange tint + slight
     skew).
   - **Sketch canvas** — a graph-paper card (background: 24px × 24px grid
     drawn with `linear-gradient` lines), with a thick rounded border drawn
     to look like a sharpie line.
   - **Browser chrome row** — three sketched circles + a fake URL bar with
     a hand-written-style URL.
   - **Sidebar nav** — sketched checkbox + label for each nav item, marker
     italic. One has a highlighter line through it (active).
   - **KPI tiles** — 3–4 boxes, each with a chunky scribbled number in a
     marker-style stroke, a tiny accent stamp, and a one-line label.
   - **Chart placeholder** — a card with a hand-drawn axis and a wobbly
     polyline. Add 3–4 dot markers.
   - **Bar chart placeholder** — a card with hatched-fill rectangles of
     varying heights.
   - **Sticky notes** — 1–2 yellow / pink notes with marker text, taped
     with a slightly rotated band, pinned over key regions to call out
     "next step", "page-1", or "needs review".
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - Use the system's available "Caveat", "Patrick Hand", or "Architects
     Daughter" fonts via Google Fonts; otherwise fall back to italic serif.
   - Slight rotations everywhere (`transform: rotate(-0.6deg)`) to break
     the grid and feel hand-drawn.
   - `data-od-id` on header, tabs, sidebar, KPIs, chart, bar-chart,
     sticky notes.
5. **Self-check**:
   - The page should *not* look pixel-perfect. If it does, you over-rendered.
   - Marker / pencil + graph paper + hatched fills + sticky notes are all
     present; if any is missing, add it.
   - The active tab has the highlighter swipe; the others don't.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="wireframe-slug" type="text/html" title="Wireframe — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
