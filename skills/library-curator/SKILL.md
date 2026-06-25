---
name: library-curator
description: |
  Search the OD Library (the global asset registry) and apply matching assets
  into the current project mid-task. Use when the user asks to reuse an image
  they captured/uploaded earlier, "pull a logo/screenshot from my library", or
  to find and drop a stored asset into the page being built.
triggers:
  - "from my library"
  - "library asset"
  - "use the image I captured"
  - "insert from library"
od:
  mode: utility
  category: assets
---

# library-curator

Reuse assets that already live in the user's OD Library — images captured with
the OD Clipper, manual uploads, agent-generated media, and design-system
material — without asking the user to re-upload them.

## When to use

- The user references an asset they already have ("the screenshot I clipped",
  "my logo", "that hero image from earlier").
- You need an image for the page you're building and the user prefers their own
  library over freshly generated media.

## Tools (tool-token track)

Both endpoints authenticate with the run's tool token (`OD_TOOL_TOKEN`, injected
by the daemon) and operate on the project the run belongs to.

### Search

`POST /api/tools/library/search`

```json
{ "query": "blue hero background", "kind": "image", "limit": 20 }
```

Returns `{ "results": [{ "asset": { "id": "...", "kind": "image", "sourceTitle": "...", "width": 1600, "height": 900, "sources": [...] }, "score": 0 }], "semantic": false }`.

`semantic: false` means keyword/metadata matching (no embedding model
configured). Filter and rank the results yourself from the asset metadata.

### Apply

`POST /api/tools/library/apply`

```json
{ "assetId": "<id from search>", "dir": "assets" }
```

Copies the asset into the project (default subdir `library/`, or the `dir` you
pass) and returns `{ "relPath": "assets/<hash>.png" }`. Reference that
`relPath` from the HTML/CSS you write (e.g. `<img src="assets/ab12cd34ef.png">`).

## Recipe

1. Search with a tight query for the kind you need.
2. Pick the best result by dimensions / title / source.
3. Apply it to get a project-relative path.
4. Wire that path into the artifact you're editing.

If search returns nothing, fall back to media generation rather than guessing a
path — never invent a `relPath` that `apply` did not return.
