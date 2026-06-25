# OD Figma capture IR

The intermediate representation produced by the **OD Clipper** (`clipper/capture.js`)
and exported by the **OD Library** (`/api/library/assets/:id/figma`), consumed by the
**OD Figma Import** plugin (`code.js`). This file is the canonical contract; the clipper
producer and the plugin consumer must stay in sync with it.

A native binary `.fig` cannot be produced outside Figma, so the capture is a structured
JSON node-tree that the plugin rebuilds into editable Figma layers via the Plugin API.

## Top level

```jsonc
{
  "version": 1,
  "source": {
    "url": "https://example.com/",
    "title": "Example",
    "capturedAt": 1718524800000,        // Unix ms
    "viewport": { "width": 1280, "height": 800 },
    "dpr": 2
  },
  "fonts": [
    { "family": "Inter", "styles": ["Regular", "Bold"] }
  ],
  "root": { /* Node — see below */ }
}
```

`fonts` lists every (family, styles) pair the TEXT nodes reference, so the plugin can
`loadFontAsync` them up front. Unavailable fonts fall back to `Inter Regular`.

## Node

Coordinates `x`/`y` are **absolute document pixels** (page top-left origin). The plugin
converts them to parent-relative positions when nesting. `width`/`height` are CSS pixels.

Discriminated by `type`:

### `FRAME` (an element box)
```jsonc
{
  "type": "FRAME",
  "name": "div#hero",
  "x": 0, "y": 0, "width": 1280, "height": 640,
  "fills":   [Paint, ...],        // optional: SOLID background or IMAGE
  "strokes": [Paint, ...],        // optional: uniform border only
  "strokeWeight": 1,              // optional, with strokes
  "cornerRadius": 8,              // optional: uniform radius
  "rectangleCornerRadii": {       // optional: non-uniform radii (mutually exclusive)
    "topLeft": 8, "topRight": 8, "bottomRight": 0, "bottomLeft": 0
  },
  "effects": [Effect, ...],       // optional: drop shadows
  "opacity": 0.9,                 // optional: < 1 only
  "clipsContent": true,           // optional: overflow:hidden
  "children": [Node, ...]         // optional
}
```

### `TEXT` (a run of text)
```jsonc
{
  "type": "TEXT",
  "name": "Hello world",          // first 40 chars, for the layer name
  "x": 24, "y": 24, "width": 200, "height": 28,
  "characters": "Hello world",
  "fontFamily": "Inter",
  "fontStyle": "Bold",            // Figma style name (Regular/Medium/Bold/…/Italic)
  "fontSize": 20,
  "lineHeight": 28,               // optional, PIXELS
  "letterSpacing": 0.2,           // optional, PIXELS
  "textAlign": "LEFT",            // LEFT | CENTER | RIGHT | JUSTIFIED
  "color": { "r": 0.1, "g": 0.1, "b": 0.1 },
  "opacity": 1
}
```

### `RECTANGLE` (a leaf box, no children)
Same box properties as `FRAME` but never has `children`. Emitted for leaf image boxes.

## Paint

```jsonc
{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1 }, "opacity": 1 }
```
```jsonc
// In the stored/exported IR, image fills carry an inlined data URI:
{ "type": "IMAGE", "scaleMode": "FILL", "dataUri": "data:image/png;base64,…" }
```
> The clipper emits image fills with a `url` placeholder; the clipper's service worker
> fetches the bytes and rewrites `url` → `dataUri` before the IR is stored or downloaded.
> The plugin only ever sees `dataUri`.
>
> The `dataUri` may carry any web image format the page used (PNG, JPEG, **SVG, WebP,
> GIF, AVIF, …**). `figma.createImage()` only decodes PNG and JPEG, so the plugin UI
> (`ui.html`, a Chromium iframe) re-encodes every non-PNG/JPEG fill to PNG — vectors
> rasterized at 2× their box, rasters at their own pixel size — before the IR reaches
> the main thread. A fill whose bytes can't be decoded is dropped rather than aborting
> the import. Producers therefore do **not** need to pre-convert formats.

`r`/`g`/`b`/`a` are 0–1 floats.

## Effect

```jsonc
{
  "type": "DROP_SHADOW",
  "color": { "r": 0, "g": 0, "b": 0, "a": 0.2 },
  "offset": { "x": 0, "y": 2 },
  "radius": 8,
  "spread": 0
}
```

Inset shadows are skipped in v1.
