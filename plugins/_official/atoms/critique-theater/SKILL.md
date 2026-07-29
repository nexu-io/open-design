---
name: critique-theater
description: 5-dimension critique panel; emits the critique.score signal that drives devloop convergence.
od:
  scenario: general
  mode: critique
---

# Critique theater

The atom that keeps the devloop honest. After each generation pass,
the agent self-critiques along five dimensions (clarity, hierarchy,
typography, motion, brand consistency — the panel is configurable per
plugin) and emits a `critique.score` signal in the 0-5 range. The
score is the variable a stage's `until` expression can read:

```jsonc
{
  "id": "critique",
  "atoms": ["critique-theater"],
  "repeat": true,
  "until": "critique.score >= 4 || iterations >= 3"
}
```

## Output shape

The agent writes the critique panel to `critique.json` in the project
cwd plus a structured event the daemon's pipeline runner reads:

```jsonc
{
  "kind": "critique-panel",
  "score": 4,
  "axes": {
    "clarity":      { "score": 4, "notes": "..." },
    "hierarchy":    { "score": 4, "notes": "..." },
    "typography":   { "score": 5, "notes": "..." },
    "motion":       { "score": 3, "notes": "needs easing pass" },
    "brand":        { "score": 4, "notes": "..." }
  }
}
```

## Convergence + escape hatches

- Critique converges at `score >= 4` per default `until`.
- Iteration cap (`OD_MAX_DEVLOOP_ITERATIONS`, default 10) always wins
  even when the score never reaches 4.
- The user can break out via `od ui respond` with action `break-loop`
  or the desktop "Stop refining" button.
