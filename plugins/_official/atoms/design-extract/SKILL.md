---
name: design-extract
description: Extract design tokens (color / typography / spacing) from imported source code, screenshots, or Figma exports into the canonical token bag token-map consumes.
od:
  scenario: code-migration
  mode: extract
---

# Design extract

Spec §10 / §21.3.2: tokens scattered across a repo's CSS / theme
files / Tailwind config / styled-components helpers / SCSS partials
need to be lifted into one bag before `token-map` can crosswalk
them onto the active OD design system. This atom does the lifting;
the input shape is intentionally generic so the same atom serves
both code-migration and figma-migration when fed different sources.

## Inputs

- `code/index.json` from `code-import` (code-migration), OR
- `figma/tree.json` from `figma-extract` (figma-migration), OR
- A folder of screenshot images (tune-collab quick-tune flows).

## Output

```text
project-cwd/
└── code/
    └── tokens.json     # { colors[], typography[], spacing[], radius[], shadow[] }
```

Each token entry carries:

```jsonc
{
  "kind":     "color",
  "name":     "primary-500",     // optional source name
  "value":    "#5b8def",          // canonical value
  "sources": ["styles/global.css:42", "tailwind.config.js:24"],
  "usage":   ["Header.tsx", "Footer.tsx"]
}
```

`sources[]` and `usage[]` are the audit trail `token-map.unmatched.json`
references when a target token can't be found.

## Convergence

The atom completes when `code/tokens.json` exists. Empty token bags
emit a warning event but do not abort — `token-map` handles the
empty case by skipping its mapping pass.

## Anti-patterns the prompt fragment forbids

- Hard-coded hex values inside JSX literals (`color: '#fff'`) are
  tokens for this atom's purposes; record them with `kind:'color'`
  and a synthetic name so they don't disappear into the noise.
- Tailwind utility scans must dedupe palette references against the
  active theme — never list `bg-blue-500` and `bg-blue-600` as one
  token.

## Status

Reserved id, prompt-only fragment in v1.
