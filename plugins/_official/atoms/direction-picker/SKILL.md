---
name: direction-picker
description: Resolves the visual direction at the plan stage from the brief and design system, without asking the user.
od:
  scenario: general
  mode: planning
---

# Direction picker

Converging work needs one committed visual direction before the build starts.
This atom owns that moment in the `plan` stage: decide the direction, state it
in one line, and lock onto it.

Resolve the direction from what you already have, in this order:

1. An active design system — its DESIGN.md palette, typography, spacing, and
   component rules **are** the direction. Bind its tokens and stop here.
2. A brand spec, reference URL, or screenshot the user supplied — parse that
   source directly.
3. Otherwise, infer the best-matching direction yourself from the brief's
   domain, audience, and tone, then bind its visual tokens. If the runtime
   provides only an index of direction ids and names, run
   `"$OD_NODE_BIN" "$OD_BIN" tools directions --id <id>` to retrieve the full
   specification — never infer colors or fonts from the name alone.

**Do not ask the user to choose a visual direction.** Not as a question-form,
not as a markdown list of options, not as a "which of these feels right?"
follow-up. The direction is yours to resolve; asking spends the user's turn on
a decision they hired the agent to make.

## Convergence

The atom completes when the plan states the chosen direction. The agent's next
turn must build against that direction — backtracking forces a fresh devloop
iteration of the plan stage.

## Anti-patterns the prompt fragment forbids

- Asking the user to pick, compare, or confirm a visual direction.
- Locking the user into a single direction with cosmetic alternates
  (a stated direction must be a defensible standalone bet).
- Inferring palette or typography from a direction's name instead of
  resolving its specification.
