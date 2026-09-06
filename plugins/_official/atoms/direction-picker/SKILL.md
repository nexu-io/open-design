---
name: direction-picker
description: Optional host-owned visual catalog for users who explicitly ask to compare directions.
od:
  scenario: general
  mode: planning
---

# Direction picker

Generative work benefits from explicit divergence before it converges. This
atom lets the user compare Open Design's versioned visual-style catalog when
they explicitly ask to see or compare direction options. Only in that case,
emit one inline `<question-form>` with one `direction-cards` question. The
submitted choice returns as the next user message.

`direction-cards` is a Host-owned catalog trigger, not an invitation for the
agent to draft cards. Emit only the question's stable `id`, localized `label`,
`type: "direction-cards"`, and `required` when appropriate. Omit `options`,
`cards`, `variant`, and `defaultValue`: the Host selects the catalog, preview
images, recommendation, and stable style ids from the project kind.

The submitted answer contains three parts: the stable Host catalogue `value`,
a resolvable direction-library `foundation`, and the selected card's visual
`guidance`. Use the foundation for deterministic palette/font tokens and apply
the guidance as its refinement. Never pass the Host value to
`od tools directions`.

The presence of this atom or the `plan` stage does not trigger a picker. Do not
emit direction cards proactively. When the user has not explicitly requested
options, infer a fitting direction from the brief, active design system, and
known context, then continue.

## Convergence

When a picker was explicitly requested, the atom completes when the submitted
form answer contains a direction id. The agent's next turn must lock onto that
direction — backtracking forces a fresh devloop iteration of the picker stage.

## Anti-patterns the prompt fragment forbids

- Agent-authored direction options, card metadata, preview assets, or variants.
- Locking the user into a single direction with cosmetic alternates
  (every direction must be a defensible standalone bet).
