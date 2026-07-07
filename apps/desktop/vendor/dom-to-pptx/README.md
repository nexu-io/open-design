# Vendored: dom-to-pptx (browser UMD bundle)

`dom-to-pptx.bundle.js.gz` is the checked-in compressed **browser UMD build** of
[`dom-to-pptx`](https://github.com/atharva9167j/dom-to-pptx) (MIT), pinned at the
version below. `scripts/postinstall.mjs` expands it to the ignored
`dom-to-pptx.bundle.js` runtime file. The bundle is the engine behind
**editable** PowerPoint export: it walks a rendered slide's live DOM and emits
native PowerPoint shapes/text/images (not a flat screenshot) via PptxGenJS.

- **Version:** 2.0.1
- **Source file:** `dist/dom-to-pptx.bundle.js` from the npm package
- **Global:** exposes `window.domToPptx.exportToPptx(elementOrSelector, options)`

## Why vendor the compressed browser bundle instead of `npm install dom-to-pptx`?

The npm package declares `puppeteer` + `@puppeteer/browsers` as dependencies
(used only by its Node/CLI `./node` entry), whose postinstall downloads a full
Chromium (~150 MB+). We never use that path — we inject this self-contained
browser bundle into our **existing** Electron Chromium render window
(`apps/desktop/src/main/deck-capture.ts`). Keeping the gzip source in git and
materializing the runtime file during postinstall preserves the "no second
rendering engine / no install-time Chromium download" property without adding a
multi-megabyte JavaScript blob to the PR.

## Updating

Re-copy `dist/dom-to-pptx.bundle.js` from the target npm version, regenerate
`dom-to-pptx.bundle.js.gz` with `gzip -n -c`, and bump the version above. Do not
edit the bundle by hand.
