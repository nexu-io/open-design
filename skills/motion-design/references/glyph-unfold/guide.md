# Local glyph unfold

Use when a short word or phrase should unfold from a line-like compressed face
into its full readable glyphs. The browser rasterizes the actual text, builds
its distance field, and advances a local deformation front from left to right.
The whole film's story, scene position, timing and reading hold remain yours.
This is a local typography mechanism, not a product/physics or whole-film engine.

Use the `REFERENCE` directory and `RESOURCE_HASH` resolved from the current
Motion skill. First run its `prepare.ts --check --resource-hash RESOURCE_HASH`;
OD Next also supplies `--applied-snapshot` with the current recipe identity.
Unavailable, changed or unsuitable resources mean ordinary Motion authoring.

Create the film with the normal native scaffold. Prepare a **new** local module
directory inside that composition; this writes executable assets only:

```sh
"$OD_NODE_BIN" "$REFERENCE/prepare.ts" --resource-hash "$RESOURCE_HASH" --out-dir motion-source/film/glyph-assets
```

On OD Next add `--applied-snapshot '<current applied_snapshot>'`. For a font the
user may legally redistribute, add `--font-file <font> --font-license <license>`.
The JSON result identifies the actual files. Include the generated script at
`./glyph-assets/runtime.js` before the caller's author script. Engine source is
an executable asset; reading `runtime.html` or `prepare.ts` is unnecessary.

```js
// sceneBox is a positioned element with an explicit width and height.
const effect = await ODGlyphUnfold.create({
  mount: sceneBox,
  text: exactCopy, // includes all required spaces and punctuation
  box: { width: 680, height: 220 },
  font: { family: 'Chosen Font', weight: 700, localName: 'Exact Installed Name' },
  palette: { ink: '#173640', accent: '#287484', offset: [2, 1] },
  texture: { grain: .15, dots: .2 },
});
let progress = 0;
const state = {
  get progress() { return progress; },
  set progress(value) { progress = value; effect.setProgress(value); },
};
// Add to the film's ONE existing paused GSAP master, then register that master.
master.to(state, { progress: 1, duration: chosenDuration, ease: 'none' }, chosenStart);
```

`create` resolves after one font/load/layout/field preparation. `setProgress(0..1)`
is synchronous and deterministic, including backward seeking. Zero is compressed;
one is the full text. Position/scale/fade the parent scene with your existing
timeline. The module creates no clock, timeline, player, background or ending.
Multiple instances use independent canvases. `dispose()` releases one instance.

Parameters: `box` is the local drawing resolution; use the same proportions for
the mount. `font.size` is an optional initial pixel size, reduced once to fit the
complete ink. `font.url` loads an available font relative to the film HTML;
prepared font bytes are `./glyph-assets/font.<extension>`. `font.localName` loads
an exact installed name. Set `font.required: true` for an explicitly required
font and supply `url` or `localName`; load failure follows the existing missing
font path. Without a font requirement, choose an available legal family.
Palette colors are six-digit hex, with a local-pixel second-ink `offset`.
Set `texture.grain/dots` in 0..1; zero uses solid ink. Text and palette are caller
data, never the research phrase or a mandatory print style.

Keep every character visible and allow a full reading window after unfolding.
This version draws a single line. If the complete copy cannot fit readably,
choose a different scene treatment through ordinary authoring. Do not shorten
copy or change the requested film size/duration for this module. A blank
WebGL2/context failure or texture-budget error is a fallback, not a delivered video.

`effect.diagnostics(true)` reports field bounds, GPU sampling errors and font
load facts. `fonts.ready/check` and this receipt do **not** prove font coverage:
inspect the complete rendered copy and actual selected/fallback platform fonts
on the returned `effect.fontProbe` (the hidden exact-copy SVG text).
Missing explicitly required fonts must not silently substitute. Complex scripts,
small/thin glyphs and other GPUs need actual visual checks; the local field is
not a true signed distance everywhere. Initialization is not a quality result.

`reference-receipt.json` proves preparation only. Retention requires checking
the final source's runtime, actual call and parameters; delivery also requires
the normal source/MP4 link, actual export and playback evidence. Preserve the
host scaffold, pinned GSAP and shared player. Report observed failures/unknowns;
continue the normal export/repair limits, with no extra user selection step.
