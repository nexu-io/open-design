---
name: rewrite-plan
description: Author a long-running multi-file rewrite plan that subsequent patch-edit + diff-review + build-test stages will execute, with explicit ownership boundaries and patch-safety guarantees.
od:
  scenario: code-migration
  mode: planning
---

# Rewrite plan

Spec §20.3 / §21.3.2: scenario 4 (design → deliverable production
code) requires a contract-shaped rewrite plan before the agent
starts editing files. The plan is **the audit trail** every
subsequent stage references; without it the patch path slides into
"refactor everything that looks wrong" and the build breaks in
unreviewable ways.

## Inputs

- `code/index.json` from `code-import`.
- `token-map/*.json` from `token-map`.
- The active design system DESIGN.md (already in prompt).
- The user's tune intent (typically a short brief).

## Output

```text
project-cwd/
└── plan/
    ├── plan.md           # human-readable narrative
    ├── ownership.json    # { file: '...', layer: 'leaf' | 'shared' | 'route' | 'shell' }
    ├── steps.json        # ordered { id, files[], rationale, risk: 'low' | 'medium' | 'high' }[]
    └── meta.json         # { generatedAt, atomDigest, tokenMapDigest }
```

`steps.json` is the input `patch-edit` reads one entry per
iteration. `ownership.json` is the source of truth for "which
files belong to a single component vs. shared infrastructure";
`patch-edit` refuses to touch a `shell`-tier file unless the
matching step has `risk: 'high'` and the user explicitly confirmed.

## Convergence

The atom completes when `plan.md` is non-empty AND `steps.json`
contains at least one step.

## Anti-patterns the prompt fragment forbids

- Plans that include "rewrite the whole component library" as a
  single step. Break into per-component steps.
- Plans that don't classify ownership.
- Plans that don't list a `build-test` step at the end.

## Status

Reserved id, prompt-only fragment in v1. The component-mapping
heuristic + ownership classifier land in spec §16 Phase 7.
