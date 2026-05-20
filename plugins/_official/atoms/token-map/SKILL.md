---
name: token-map
description: Map an extracted Figma / source-code token bag onto the active OD design system, producing a deterministic mapping the generate stage can consume.
od:
  scenario: figma-migration
  mode: token-map
---

# Token map

Spec §10 / §21.3.1: every figma-migration / code-migration run
crosses the same boundary — "the source has its own tokens; the
target uses the active OD design system; we need a deterministic
mapping". This atom produces that mapping.

## Inputs

- `figma/tokens.json` from `figma-extract` (figma-migration), OR
- `code/tokens.json` from `design-extract` (code-migration).
- The active design system DESIGN.md (already injected into the
  prompt; the atom reads from `.od-skills/design-system/DESIGN.md`).

## Output

```text
project-cwd/
└── token-map/
    ├── colors.json     # { source: '#hex' | 'tokenName', target: '--ds-token' }[]
    ├── typography.json # font + size + weight pairings
    ├── spacing.json    # spacing scale crosswalk
    ├── unmatched.json  # { source: ..., reason: 'no-target-equivalent' }[]
    └── meta.json       # { sourceKind: 'figma' | 'code', generatedAt, atomDigest }
```

`unmatched.json` is the audit list a human reviews; the agent must
not invent target tokens silently.

## Convergence

The atom completes when every input token is either mapped or
explicitly recorded under `unmatched.json` with a non-empty
`reason`. The `until` evaluator reads `tokens.unmatched.length === 0`
on strict mode; default is "soft converge" (proceed with
`unmatched.json` populated).

## Anti-patterns the prompt fragment forbids

- Injecting a new token into DESIGN.md without explicit user
  approval (use a `confirmation` GenUI surface for that).
- Mapping hex colours by visual proximity alone; perceptual ΔE
  thresholds belong in the visual-diff evaluator (Phase 7).
- Collapsing distinct source tokens onto the same target token
  silently; record collisions in `unmatched.json` with reason
  `target-collision`.

## Status

Reserved id, prompt-only fragment in v1. The deterministic mapping
algorithm + DESIGN.md token-extraction helper land in spec §16
Phase 6 alongside `figma-extract`.
