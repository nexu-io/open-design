---
name: wireframe-annotated
description: |
  An annotated / redline lo-fi wireframe — a desktop landing/marketing page
  drawn as flat greyboxes inside a browser chrome frame, overlaid with numbered
  annotation pins (①②③④⑤) in a single accent color, paired with a right-hand
  SPEC PANEL that lists each numbered pin with a short engineering / UX note.
  This is the "wireframe + redline spec" style — clean, flat, low-fidelity, NOT
  hand-drawn. Use when the brief asks for "annotated wireframe", "redline
  wireframe", "wireframe with spec", "lo-fi landing wireframe", "low fidelity",
  "线框图", "标注线框", or "redline".
triggers:
  - "annotated wireframe"
  - "redline"
  - "wireframe spec"
  - "lo-fi landing"
  - "wireframe"
  - "low fidelity"
  - "标注线框图"
  - "redline 标注"
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
  example_prompt: "Draw an annotated redline wireframe for a desktop landing page — greybox nav, hero, logo strip, 3-up feature grid and footer, numbered pins ①–⑤ and a right-hand spec panel with one engineering note per pin."
---

# Wireframe Annotated Skill

Produce a single flat, low-fidelity landing-page wireframe with a redline spec.
The whole point is "structure + handoff notes, not pixels" — greyboxes carry
the layout, numbered pins call out regions, and a right-hand spec panel turns
each pin into a short engineering / UX note. Keep it clean and flat; never
hand-drawn or scribbly.

## Workflow

1. **Skip finished UI.** This skill explicitly wants a low-fidelity greybox
   look. Honor type tokens only loosely (one clean sans like Inter / system-ui
   for labels, one mono like IBM Plex Mono for the spec notes and pin numbers).
   Use medium-grey fills with defined darker borders so the page reads as a
   thumbnail — avoid near-white-on-white, which renders blank.

2. **Set the two-column shell.** LEFT is the wireframe canvas: a browser-chrome
   framed greybox page. RIGHT is a narrow "ANNOTATIONS / SPEC" panel. Pick ONE
   accent color (coral or blue) and use it ONLY for the numbered pins and the
   matching spec numbers — everything else stays greyscale.

3. **Lay out the canvas**, top to bottom, each block a greybox with a numbered
   pin absolutely positioned on it:
   - **Top nav** — logo greybox + nav lorem-bars + a primary button block. Pin ①.
   - **Hero** — big headline lorem bars + subhead + two CTA button blocks on the
     left; a large image placeholder (rect with a diagonal X) on the right. Pin ②.
   - **Logo strip** — a row of 5 small greybox partner logos. Pin ③.
   - **Feature grid** — 3 cards, each an icon square + title bar + 2 text bars. Pin ④.
   - **Footer** — columns of lorem link-bars. Pin ⑤.

4. **Mirror every pin in the spec panel.** Each spec row = the circled number in
   the accent color + a short mono/sans note, e.g. "① Sticky nav, 64px, condenses
   on scroll", "② Hero H1 48/56, CTA pair primary+ghost", "③ 5 partner logos,
   greyscale", "④ 3-up at ≥960px → 1-up mobile", "⑤ 4-col footer, legal row".
   Mark the panel and each row with `data-od-id`.

5. **Self-check**:
   - Every numbered pin on the canvas has exactly one matching spec row.
   - The accent color appears ONLY on pins + spec numbers; the rest is greyscale.
   - The page should read clearly at thumbnail size; if blocks vanish into the
     background, darken the fills/borders.
   - It must NOT look pixel-perfect or hand-drawn — flat greyboxes only.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="wireframe-slug" type="text/html" title="Annotated Wireframe — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
