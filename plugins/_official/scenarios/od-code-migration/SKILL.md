---
name: od-code-migration
description: Default reference pipeline for the code-migration taskKind — code-import → design-extract → token-map → rewrite-plan → patch-edit ↔ build-test devloop → diff-review → handoff.
od:
  scenario: code-migration
  mode: scenario
---

# od-code-migration (scenario)

Spec §1 / §10.1 / §20.3 / §21.3.2 / §23.3.3: the canonical
code-migration flow. The pipeline cannot ship an `accept` decision
without a passing build — the patch-edit ↔ build-test devloop is
the convergence engine.

## Default pipeline

```jsonc
{
  "stages": [
    { "id": "import",    "atoms": ["code-import"] },
    { "id": "tokens",    "atoms": ["design-extract", "token-map"] },
    { "id": "plan",      "atoms": ["rewrite-plan"] },
    {
      "id": "verify",
      "atoms": ["patch-edit", "build-test"],
      "repeat": true,
      "until": "(build.passing && tests.passing) || iterations>=8"
    },
    { "id": "review",    "atoms": ["diff-review"] },
    { "id": "handoff",   "atoms": ["handoff"] }
  ]
}
```

The scenario uses `build.passing && tests.passing` as the
convergence signal — promoted into the spec §22.4 vocabulary by
the `build-test` atom.

## Required user inputs

A plugin built on this scenario typically declares `od.inputs`:

  - `repoPath` (string, required): pulled from `od project import`.
  - `targetStack` (form): collected by `rewrite-plan`.
  - `testCommand` / `buildCommand` (string, optional): overrides
    the inferred package.json scripts in the `build-test` atom.
