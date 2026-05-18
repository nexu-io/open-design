---
name: figma-extract
description: Pull a Figma file's node tree, design tokens, and embedded assets into the project cwd as a structured snapshot.
od:
  scenario: figma-migration
  mode: extract
---

# Figma extract

Spec §10 / §21.3.1: the figma-migration scenario starts with a Figma
file URL + an OAuth token. This atom turns that pair into the
authoritative on-disk record subsequent stages (`token-map`,
`generate`, `critique`) operate on.

## Inputs

| Source | Required | Notes |
| --- | --- | --- |
| Figma file URL or `node-id` | yes | Provide via the `figma-oauth` GenUI surface or `od plugin apply --input fileUrl=…` |
| Figma OAuth token | yes | Routed through `oauth-prompt` with `oauth.route='connector'` and `connectorId='figma'`; the daemon never stores the token in SQLite |

## Output

The atom writes a deterministic, JSON-shaped extract under the
project cwd:

```text
project-cwd/
├── figma/
│   ├── tree.json        # canonical node tree (id / type / parent / children / box / fills / text)
│   ├── tokens.json      # color + typography + spacing tokens lifted off the file
│   ├── assets/          # rasterised exports of every leaf node that the file marks for export
│   │   └── <node-id>.<png|svg|webp>
│   └── meta.json        # { fileUrl, version, lastModified, exportedAt, atomDigest }
```

`figma/tree.json` is the canonical pivot for every downstream atom.
`figma/tokens.json` is the input to `token-map`. `assets/` is the
input to `generate`'s media stage.

## Convergence

The atom completes when `figma/tree.json` exists and is non-empty.
The `until` evaluator reads `figma.tree.nodes >= 1`; if the figma
file is empty or the OAuth token expired, the atom emits a clear
error event and the run aborts (the user fixes auth or picks a
different file).

## Anti-patterns the prompt fragment forbids

- Synthesising a tree from screenshots when the OAuth path failed —
  always re-prompt the user; never make up node ids.
- Dropping unsupported node types silently; record them in
  `meta.json.unsupportedNodes[]` so the human can audit gaps.
- Treating component instances as duplicates; record `componentRef`
  links so `token-map` can de-duplicate at the right boundary.

## Status

Reserved id, prompt-only fragment in v1. The Figma REST + node-walk
implementation lands in spec §16 Phase 6; until then plugins that
declare this atom rely on their bundled MCP server (typically the
community `@community/figma-mcp`) for the actual fetch.
