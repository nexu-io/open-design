---
name: od-wireframe
description: Default wireframe scenario for lo-fi screens, greybox flows, annotated UI structure, and clickable wireframe HTML.
triggers:
  - wireframe
  - greybox
  - flow sketch
  - 线框图
  - 低保真
od:
  scenario: wireframe
  mode: wireframe
---

# Wireframe Scenario

Create a structure-first HTML wireframe. The goal is not visual polish; the goal is a clear product flow that a product team can critique quickly.

## Workflow

1. Read `assets/template.html` and `references/layouts.md`.
2. Identify the main flow from `screenFlow`. If it is broad, default to 4-6 screens.
3. Build one `index.html` by copying the seed and replacing the screen sections.
4. Use only greyscale surfaces, dashed zones, numbered annotations, and sparse accent strokes.
5. End with a short self-check against `references/checklist.md`.

## Hard Rules

- Keep it lo-fi: no gradients, no decorative imagery, no polished marketing hero.
- Every screen needs a title, purpose annotation, primary action, and at least one edge case or empty/error state when relevant.
- Show hierarchy through spacing, grouping, and line weight rather than color.
- Mobile-like wireframes must use constrained phone frames; desktop wireframes must use full-width app frames.
