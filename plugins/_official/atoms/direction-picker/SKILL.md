---
name: direction-picker
description: Optional 3-5 direction picker for users who explicitly ask to compare visual directions.
od:
  scenario: general
  mode: planning
---

# Direction picker

Generative work benefits from explicit divergence before it converges.
This atom defines how to present 3–5 distinct visual / structural / tonal
directions when the user explicitly asks to see or compare direction options.
Only in that case, emit one inline `<question-form>` with a `direction-cards`
question. The submitted choice returns as the next user message.

The presence of this atom or the `plan` stage does not trigger a picker. Do not
emit direction cards proactively. When the user has not explicitly requested
options, infer a fitting direction from the brief, active design system, and
known context, then continue.

## Convergence

When a picker was explicitly requested, the atom completes when the submitted
form answer contains a direction id. The agent's next turn must lock onto that
direction — backtracking forces a fresh devloop iteration of the picker stage.

## Anti-patterns the prompt fragment forbids

- More than 5 directions on one turn (decision fatigue).
- Two directions that are minor variations of each other.
- Locking the user into a single direction with cosmetic alternates
  (every direction must be a defensible standalone bet).
