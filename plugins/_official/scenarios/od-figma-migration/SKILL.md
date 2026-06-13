---
name: od-figma-migration
description: Default reference pipeline for the figma-migration taskKind — figma-extract → token-map → generate → critique.
od:
  scenario: figma-migration
  mode: scenario
---

# od-figma-migration (scenario)

Spec §1 / §10.1 / §21.3.1 / §23.3.3: the canonical figma-migration
flow. The pipeline is sequenced so each stage's output is the next
stage's input — `figma-extract` writes `figma/tree.json`,
`token-map` writes `token-map/colors.json` (etc.), and `generate`
reads both before producing the HTML artifact.

## Default pipeline

```jsonc
{
  "stages": [
    { "id": "extract",  "atoms": ["figma-extract"] },
    { "id": "tokens",   "atoms": ["token-map"] },
    { "id": "generate", "atoms": ["file-write", "live-artifact"] },
    {
      "id": "critique", "atoms": ["critique-theater"],
      "repeat": true,
      "until": "critique.score>=4 || iterations>=3"
    }
  ]
}
```

## Required GenUI surfaces

The scenario expects two `oauth-prompt` / `form` surfaces from the
plugin layer:

  - `figma-oauth` — `oauth.route='connector'`, `connectorId='figma'`,
    persists at the project tier so multi-conversation work doesn't
    re-prompt.
  - `file-pick` — `kind='form'`, captures the Figma file URL on the
    first turn so `figma-extract` knows where to read.

The daemon auto-derives the `figma-oauth` surface when
`od.connectors.required[].id='figma'` is declared and the connector
isn't yet authorised (spec §10.3.1 implicit oauth-prompt rule).
