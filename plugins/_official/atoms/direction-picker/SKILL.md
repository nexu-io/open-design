---
name: direction-picker
description: 3-5 direction picker that lets the user choose before final generation.
od:
  scenario: general
  mode: planning
---

# Direction picker

This atom is conditional, not a mandatory pipeline pause. The binding host
clarification gate and active mode decide whether a form may interrupt the
turn. Use the picker only when the user explicitly asks to compare or explore
directions and an active design system has not already locked the visual
direction. Otherwise infer the best direction from the brief and continue.

When active, draft 3–5 genuinely distinct visual / structural / tonal
directions and emit one inline `<question-form>` using either:

- `direction-cards` with the complete `cards` metadata required by the shared
  question-form schema; or
- a normal `radio` question when complete card metadata is unavailable.

The submitted choice returns as the next user message.

## Convergence

The atom completes when the submitted form answer contains a direction id.
The agent's next turn must lock onto that direction —
backtracking forces a fresh devloop iteration of the picker stage.

## Anti-patterns the prompt fragment forbids

- More than 5 directions on one turn (decision fatigue).
- Two directions that are minor variations of each other.
- Locking the user into a single direction with cosmetic alternates
  (every direction must be a defensible standalone bet).
