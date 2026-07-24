---
name: direction-picker
description: 3-5 direction picker that lets the user choose before final generation.
od:
  scenario: general
  mode: planning
---

# Direction picker

Generative work benefits from explicit divergence before it converges.
The direction-picker atom asks the agent to draft 3-5 distinct
directions (visual / structural / tonal) and emit them in an inline
`<question-form>` with a `direction-cards` question so the user picks the
winning direction before the expensive generation pass. The submitted choice
returns as the next user message.

## Convergence

The atom completes when the submitted form answer contains a direction id.
The agent's next turn must lock onto that direction —
backtracking forces a fresh devloop iteration of the picker stage.

## Anti-patterns the prompt fragment forbids

- More than 5 directions on one turn (decision fatigue).
- Two directions that are minor variations of each other.
- Locking the user into a single direction with cosmetic alternates
  (every direction must be a defensible standalone bet).
