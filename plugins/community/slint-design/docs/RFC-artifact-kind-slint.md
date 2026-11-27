# RFC draft: ArtifactKind `slint`

**Status:** DRAFT — **not submitted** to nexu-io/open-design. Local fork preparation only.  
**Date:** 2026-09-23  
**Author:** listepo  
**Related:** https://github.com/nexu-io/open-design/issues/8405  
**Plugin path:** `plugins/community/slint-design`

## Motivation

OpenDesign today models design artifacts primarily as HTML (plus decks, images, video). Slint (`.slint`) is a declarative UI language aimed at native and embedded products. Agents can already author, check, and screenshot Slint via `slint-viewer`, and the community plugin ships that loop with `preview.type: image`.

A first-class `ArtifactKind: 'slint'` would unlock:

- Typed project files and gallery treatment for `.slint` sources (not only derived PNGs).
- A dedicated preview surface (viewer remote / MCP / optional WASM) without pretending the artifact is HTML.
- Clearer critique/export boundaries than “PNG that happens to come from Slint”.

## Non-goals (this draft)

- Immediate core merge or canvas plugin mount (OD plugin spec: plugins do not mount in the canvas).
- Full parity with HTML srcDoc bridges (DOM inspector, tweak, per-node comments).
- Requiring embedded Slint MCP as a daemon runtime dependency.
- Shipping a mandatory WASM interpreter inside the core binary.

## Proposed ArtifactKind

Add `slint` to the core artifact kind union (today hard-coded in `apps/web/src/artifacts/types.ts`), conceptually:

```ts
type ArtifactKind =
  | /* existing kinds */
  | "slint";
```

**Source of truth:** one or more `.slint` files (entry path in artifact metadata).  
**Derived preview (v1 bridge):** PNG from `slint-viewer --screenshot` (compatible with current community plugin).  
**Optional preview (v2):** interactive surface via:

- `slint-viewer --remote` / viewer MCP, or
- sandboxed HTML shell hosting `slint-wasm-interpreter` (see plugin `preview/`).

## Preview model

| Stage | Mechanism | OD bridges |
|-------|-----------|------------|
| Today (plugin) | `od.preview.type: image` + PNG | image viewer only |
| Proposed kind v1 | kind=`slint`, default render = PNG poster + link to source | same as image + source tab |
| Proposed kind v2 | interactive preview adapter (remote viewer or WASM iframe) | no HTML DOM bridges; element tree via Slint MCP if opted in |

Primary agent runtime for acceptance remains **OpenCode** under OpenDesign (`OPENCODE_CONFIG_CONTENT` MCP injection).

## Migration from PNG plugin

1. Keep `plugins/community/slint-design` working unchanged (`preview.type: image`).
2. When core adds `ArtifactKind: slint`, allow the plugin (or core importer) to register `.slint` entries with optional `poster` PNG.
3. Do not break existing workspaces that only store PNG previews.
4. Viewer MCP stays capability-gated (`mcp`, `subprocess`) and opt-in.

## Risks

- Spec tension: plugins are not canvas extensions; a new kind is a **core** change, not a plugin-only feature.
- Licensing/distribution if WASM interpreter is bundled.
- Agent runtime matrix (OpenCode primary; others secondary) and headless CI cost for `slint-viewer`.
- Expectation mismatch vs HTML tweak/inspector workflows.

## Open questions for maintainers

1. Is a new `ArtifactKind` acceptable once community PNG demand is proven, or should Slint remain image-backed indefinitely?
2. Preferred interactive preview: remote viewer, WASM iframe, or neither in-tree?
3. Should critique pipelines treat Slint posters as first-class design artifacts?
4. Any packaging constraints for shipping or downloading `slint-viewer` / WASM?

## Explicit non-submission

This file is a **draft for discussion**. It is **not** filed as an upstream RFC and **no** pull request against `nexu-io/open-design` is opened for this change set.
