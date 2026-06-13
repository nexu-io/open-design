---
name: weekly-update
description: |
  Single-file horizontal-swipe slide deck for a weekly team update —
  shipped, in flight, blocked, metrics, asks. 6–8 slides. Use when the
  brief mentions "weekly update", "team update slides", "weekly status",
  "周报演示".
triggers:
  - "weekly update"
  - "team update slides"
  - "weekly status"
  - "weekly review"
  - "周报演示"
od:
  mode: deck
  scenario: operations
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Make a weekly update deck for the Growth squad — what shipped, in flight, blocked, metrics, asks for next week."
---

# Weekly Update Deck Skill

Produce a single-file horizontal-swipe HTML deck for a weekly team update.

## Workflow

1. Read DESIGN.md.
2. Identify squad name, week range, and audience (squad-internal vs cross-functional).
3. Slides:
   1. Cover (squad + week + author + date)
   2. Headline (one sentence + one number that matters this week)
   3. What shipped (3–5 items, link-style affordance)
   4. In flight (3–5 items, owner avatars)
   5. Blocked (1–3 items + clear ask)
   6. Metrics that matter (1–2 inline charts)
   7. Asks for next week (named owners)
   8. Closing + thanks
4. Arrow keys or click navigation. Each slide is 100vw wide.

## Output contract

```
<artifact identifier="weekly-update-w42" type="text/html" title="Weekly Update — Growth · W42">
<!doctype html>...</artifact>
```
