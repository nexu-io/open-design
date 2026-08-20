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
  prompt; the atom reads from the staged design-system context).

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

## Semantic token inference

Figma often exports anonymous source names such as `color-3`,
`paint/17`, or raw `#5B8DEF`. Do not ask the user to rename those
before mapping. First infer the semantic role from usage evidence:

- Node path, component name, instance overrides, variant/state labels,
  frame name, layer name, and nearby text such as `Primary`,
  `Selected`, `Link`, `Error`, `Focus`, `Nav`, `Button`, or `CTA`.
- CSS-like position in the rendered tree: background fill, foreground
  text/icon, border, divider, overlay, shadow tint, focus ring, status
  badge, chart series, or brand/accent treatment.
- Contrast relationships: a color paired repeatedly with the main
  canvas is likely foreground; one paired with foreground inside CTA
  components is likely primary/accent background; a thin outline around
  interactive elements is likely border or focus-ring.
- Reuse topology: a value that appears across primary buttons,
  selected tabs, and active nav items is stronger evidence for
  `--ds-color-primary` than a value that appears once in an illustration.

Use that role evidence to choose among existing active design-system
tokens and to decide whether an anonymous token should be renamed or
left unmatched before the executable mapping pass. Keep the on-disk
token-map contract unchanged: the atom still writes the existing bucket
files, `unmatched.json`, and `meta.json` only.

For example, this is a useful reasoning note for deciding whether
`color-3` should map to the active primary token:

```jsonc
{
  "source": "color-3",
  "value": "#5B8DEF",
  "role": "primary",
  "targetCandidates": ["--ds-color-primary", "--ds-color-link"],
  "evidence": [
    "Button/Primary fill",
    "Selected tab indicator",
    "Link text in Settings frame"
  ]
}
```

Then map to an active design-system token only when the evidence is
role-based, not value-only. If the top candidates are too close to
call, or if the evidence points to conflicting roles (`primary` vs
`link` vs `focus-ring`), leave the source token unmatched using the
existing `no-target-equivalent` reason and include the competing
candidates in the hint. This keeps automation useful for common
anonymous-token cases while preserving human review for ambiguous
brand decisions.

### Before / after expectation

Without semantic inference, an anonymous Figma token can only produce
an uncertain value-level mapping:

```jsonc
{
  "source": "color-3",
  "value": "#5B8DEF",
  "target": null,
  "reason": "no-target-equivalent"
}
```

With semantic inference, the same token should carry role evidence
before it is accepted:

```jsonc
{
  "source": "color-3",
  "value": "#5B8DEF",
  "target": "--ds-color-primary",
  "via": "name"
}
```

This deterministic v1 atom does not claim a measured accuracy lift by
itself. Treat the expected improvement as coverage of previously
manual anonymous-token cases when the Figma tree contains enough role
evidence. Real accuracy numbers require a fixture suite with known
source tokens, expected semantic roles, and a before/after agent run.
See `examples/semantic-inference-before-after.json` for a deterministic
same-token-batch simulation that compares the old value-level output
with the semantic inference output.

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

Implemented by the daemon runner in
`apps/daemon/src/plugins/atoms/token-map.ts`. It parses design-system tokens,
performs deterministic mapping, and writes the mapped and unmatched outputs.
