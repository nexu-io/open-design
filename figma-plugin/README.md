# OD Figma Import (Figma plugin)

Rebuilds an **OD Figma capture** — the JSON node-tree the OD Clipper produces from a live
web page — into editable Figma layers (frames, text, images, fills, strokes, corner radii,
shadows).

> ### ⚠️ You cannot open `.od-figma.json` by dragging it into Figma
>
> Figma's file importer only accepts its own binary `.fig` / `.jam` files. Dragging an
> `.od-figma.json` into Figma (or into **Drafts**) shows **“Unsupported file format”** —
> that is expected, not a bug. A native `.fig` can't be produced outside Figma, so the
> capture is a JSON node-tree that **this plugin** rebuilds through the Figma Plugin API.
>
> The flow is two steps: **(1) install this plugin once** (below), then **(2) open the
> `.od-figma.json` from inside the plugin**. This is the same model as web-to-figma /
> BuilderIO figma-html / html.to.design — they are all plugins, for the same reason.

This is a **standalone subproject** — intentionally *not* part of the pnpm workspace and
with **no build step**. The files load directly as a Figma development plugin.

## 1. Get a capture file

Produce an `.od-figma.json` either way:

- **OD Clipper** popup → *Download Figma (.json)* — captures the current page and downloads
  the file directly.
- **OD Library** → open an `html` asset captured with the clipper → *Download Figma JSON*
  (or the CLI: `od library figma <assetId> --out page.od-figma.json`).

## 2. Install the plugin (one time)

You only do this once per machine. It requires the Figma **desktop** app — development
plugins do not work in the browser.

1. Open the Figma **desktop** app and open (or create) any file.
2. Menu → **Plugins → Development → Import plugin from manifest…**
3. Select this folder's **`manifest.json`**
   (this repo: `figma-plugin/manifest.json`).

The plugin now appears under **Plugins → Development → OD Figma Import** in every file.

## 3. Import a capture

1. Run **Plugins → Development → OD Figma Import**.
2. In the plugin window, **drop or choose** the `.od-figma.json` file — or paste the JSON.
3. Click **Import**.

The capture is rebuilt as a single frame named after the page, selected and zoomed into
view. After the first install, importing future captures is just this step 3.

## Fidelity notes

- Layout uses the page's live geometry, so positions/sizes match what was captured.
- Fonts are loaded when available and otherwise fall back to **Inter Regular**.
- Best-effort: complex CSS (gradients beyond the first layer, blend modes, transforms,
  pseudo-elements, SVG internals) is simplified; tainted/cross-origin images that the
  clipper couldn't inline are dropped.
- Images in any web format (SVG, WebP, GIF, AVIF, …) are supported: Figma's image API
  only accepts PNG/JPEG, so the plugin re-encodes the rest to PNG on import (SVGs are
  rasterized, not kept as editable vectors). The status line reports how many were
  converted.

The capture schema is documented in [`IR.md`](./IR.md) and must stay in sync with
`clipper/capture.js`.
