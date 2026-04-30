---
name: magazine-web-ppt
description: Generate a single-file, horizontal-swipe editorial deck with a magazine and electronic-ink aesthetic. Use this when the user asks for a polished talk deck, launch deck, keynote-style web PPT, horizontal swipe deck, editorial magazine presentation, or electronic ink presentation.
triggers:
  - "ppt"
  - "deck"
  - "slides"
  - "presentation"
  - "magazine"
  - "magazine-style deck"
  - "horizontal swipe"
  - "horizontal swipe deck"
  - "editorial magazine"
  - "e-ink presentation"
  - "web PPT"
  - "launch deck"
  - "talk deck"
od:
  mode: deck
  scenario: marketing
  featured: 9
  default_for: deck
  upstream: "https://github.com/op7418/guizang-ppt-skill"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Create a magazine-style deck about the one-person company and AI-folded organizations for a 25-minute talk to designers and founders. Recommend one direction first, then build the deck."
---

# Magazine Web PPT

Create a complete single-file HTML deck with horizontal navigation, editorial typography, restrained WebGL or CSS texture, and a strong magazine rhythm. The output should feel like an editorial feature translated into a talk deck, not a generic business presentation.

## Use When

- The user wants a keynote, launch deck, talk deck, pitch narrative, or polished web PPT.
- The user asks for a magazine-style, editorial, e-ink, Monocle/WIRED/Kinfolk/Domus/Lab-inspired direction.
- The output should be browsable as one HTML file and exportable as PDF.

Avoid this skill for dense spreadsheets, training manuals, collaborative slide editing, or dashboards that need many tiny controls.

## Workflow

1. Choose one direction before asking detailed questions:
   - Monocle Editorial: restrained international magazine style.
   - WIRED Tech: data, engineering, benchmark, product launch.
   - Kinfolk Slow: warm, quiet, literary, private salon.
   - Domus Architectural: spatial, geometric, portfolio-like.
   - Lab Reference: academic, methodical, reproducible.
2. Ask only the missing questions that materially affect the deck:
   - audience and setting
   - talk length
   - source material
   - available images
   - hard constraints
3. Copy `assets/template.html` into the project as `index.html`.
4. Replace placeholder title and metadata immediately.
5. Select layouts from `references/layouts.md`; do not invent a new deck framework.
6. Read `references/checklist.md` before final output and fix P0 issues.
7. Emit the final `<artifact>` with the complete standalone HTML.

## Production Rules

- Use English only in generated deck copy, labels, metadata, and comments unless the user explicitly provides quoted non-English source material that must be preserved.
- Use Lucide or simple line icons. Do not use emoji as content icons.
- Keep the deck on a 1920x1080 canvas or the provided scale-to-fit framework.
- Every slide needs a visible purpose: cover, act divider, evidence, quote, comparison, pipeline, proof, decision, or closing.
- Alternate hero and non-hero slides for rhythm. Avoid more than three consecutive slides with the same visual intensity.
- Use serif display type for major editorial headings, sans-serif for body, and mono for metadata.
- Keep image crops stable with standard ratios such as 16:10, 4:3, 3:2, 1:1, and 16:9.
- The final deck should be tasteful, readable, and export-ready.

## Reference Files

- `assets/template.html`: runnable deck seed.
- `assets/example-slides.html`: English example deck for preview.
- `references/styles.md`: direction guide.
- `references/themes.md`: theme presets.
- `references/layouts.md`: paste-ready slide layouts.
- `references/components.md`: component usage.
- `references/checklist.md`: final quality gates.
