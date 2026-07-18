# Open Design Web Clipper (MV3 — Chrome · Edge · Firefox)

The **Open Design Web Clipper**: a browser extension that captures images,
screenshots, and page content from any site straight into your Open Design
**Library** (the global asset registry).

This is a **standalone subproject** — it is intentionally *not* part of the pnpm
workspace and has **no build step**. The files here load directly as an unpacked
extension. The daemon/web TypeScript boundaries are unaffected.

## Load it

1. Start Open Design locally (`pnpm tools-dev`) so the daemon is listening on
   `http://127.0.0.1:7456` (the default; change it under **Advanced** in the
   popup if you used a different `--daemon-port`).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select this `clipper/` directory.
   - **Edge:** same steps at `edge://extensions`.
   - **Firefox:** `about:debugging` → *This Firefox* → *Load Temporary Add-on* →
     pick `manifest.json` (or run `npx web-ext run --source-dir clipper`).

That's it — **no pairing, no codes, no tokens**. The popup shows
**● Connected** as soon as it detects Open Design running, and you can capture
right away.

> The manifest carries a cross-browser background block
> (`service_worker` for Chrome/Edge, `scripts` for Firefox) plus
> `browser_specific_settings.gecko` for AMO. Chrome logs a harmless
> "unrecognized key `background.scripts`" warning on dev load — it runs normally,
> and store users never see it. Store/ASO assets and per-store copy live in
> [`store/`](store/LISTING.md).

### Why no login?

The daemon only listens on loopback (`127.0.0.1`), so only programs on your own
machine can reach it, and a web page can't impersonate this extension's
`chrome-extension://` origin. The daemon auto-trusts that origin for the
`/api/library/*` routes, which is everything the clipper uses. Zero setup,
nothing to misconfigure.

## Capture

- **Popup** → *Capture page → Library* (a self-contained, high-fidelity HTML
  snapshot — readable stylesheets inlined, images inlined as data URIs, scripts
  stripped), *Extract design system* (a programmatic design-system HTML capture saved
  as a `design-system` Library asset), *Download Figma (.json)* (a structured
  Figma import JSON for the OD Figma plugin — see `../figma-plugin/`), *Pick
  element → capture*, *Pick images*, or *Capture screenshot* (visible tab).
- **Pick element** → a DevTools-style picker: hover to highlight any element,
  click to save it as a **single self-contained HTML snapshot of that element**.
  The page's stylesheets are kept (so the element's cascade resolves and it stays
  styled), the element's own images are inlined as data URIs, and the rest of the
  page is pruned away — leaving the element where it sat, ready to open. Esc
  cancels. The saved Library card is **one HTML file** you can open, share, or
  distribute as the element; its preview shows the live element with its
  selector + size (tag, selector, dimensions) noted beneath. No separate
  screenshot-plus-markup pair — just the HTML.
- **Pick images** → an on-page overlay grid of every image on the page with
  checkboxes, *Select all* / *Clear*, and *Save N to Library* — so you choose
  exactly which images to save instead of grabbing them all.
- **On-page toolbar** → an optional floating page / design-system / Figma JSON /
  screenshot / image / element launcher
  anchored **top-center** of the page (Figma-style), with a gap from the edge so
  it reads as a deliberate surface. It's **hidden by default**; turn it on with
  *Show on-page bar* in the popup (the preference is remembered, and the bar's
  ✕ hides it again). Each control shows a **hover tooltip** naming what it does.
  Grab the dotted **handle** on its left edge to drag the bar anywhere on the
  page — its position is remembered across reloads. The launcher is automatically
  pulled out of frame while a capture is taken, so it never ends up inside the
  snapshot.
- **Right-click an image** → *Save image to Open Design Library*.

### Page → design system

*Extract design system* is intentionally separate from full-page capture. It reads
the live page with JavaScript and fills a stable design-system HTML template with:

- logo/app-icon candidates and representative images;
- computed typography, font-family usage, and readable `@font-face` rules;
- weighted palette tokens and light/dark theme variables;
- title, product description, headings, and keywords;
- a small component kit (buttons, fields, cards, navigation samples) rendered
  from the extracted tokens.

The result is saved to the Library as `kind: "design-system"` with `text/html`
bytes, so it previews like an HTML asset but filters as a design-system asset in the
Library and *Select from library* picker.

### Page → Figma JSON

*Capture page → Library* also computes an **OD Figma capture** (a JSON node-tree
of frames / text / images with live geometry, fills, strokes, corner radii and
shadows) from the live page and stores it alongside the HTML asset. From the
Library you can later **Download Figma JSON** for that asset, or use *Download Figma
(.json)* in the clipper to grab it directly without saving to the Library.

> ### ⚠️ The `.od-figma.json` is opened by a Figma plugin, not by dragging it in
>
> Figma only imports its own binary `.fig`/`.jam` files, so dragging an
> `.od-figma.json` into Figma (or **Drafts**) shows **“Unsupported file format”** —
> that is expected. Open it in **two steps** instead:
>
> 1. **Install the OD Figma Import plugin once** — in the Figma *desktop* app:
>    **Plugins → Development → Import plugin from manifest…** → pick
>    `figma-plugin/manifest.json`. (Same model as web-to-figma / html.to.design,
>    which are also plugins.)
> 2. **Run the plugin and open the file** — **Plugins → Development → OD Figma
>    Import**, then drop in the downloaded `.od-figma.json`.
>
> Full instructions: [`../figma-plugin/README.md`](../figma-plugin/README.md).

> A native binary `.fig` can't be produced outside Figma, so this is an import
> JSON node-tree rebuilt as editable layers by the OD Figma plugin.
> Fidelity is best-effort: cross-origin stylesheets that block reads, web-component
> shadow DOM, and tainted canvases may degrade. Image fills in any web format
> (SVG, WebP, GIF, …) are supported — the plugin re-encodes the ones Figma's image
> API can't read (everything but PNG/JPEG) to PNG on import.

Everything you capture appears in the Library tab (live, via SSE) with a
**Clipper** source badge and a back-link to its source page.

The **Capture options** (under *Advanced*) include *Inline images* — on by
default for the highest fidelity; turn it off for smaller, faster captures that
reference images by URL instead of embedding them.

Very large, image-heavy pages are captured at reduced fidelity rather than
failing — the capture is built to always fit the daemon's ingest limit:

1. Large raster images are re-encoded smaller (downscaled + WebP) before being
   embedded, so most pages embed everything at a fraction of the size.
2. If the page is still over budget, images are embedded smallest-first and the
   largest are left as live URLs (the HTML structure and styles are kept intact).
3. As a last resort the secondary Figma layout capture is dropped so the HTML
   page itself always saves.

The popup/on-page toast notes when any of these kicked in (e.g. "some images
left as links").

## Permissions

- `host_permissions: <all_urls>` — needed to screenshot/read images on any page,
  fetch+inline cross-origin page resources, and reach the loopback daemon.
  Standard for web clippers (Evernote, Figma).
- `scripting`, `tabs` — capture the active tab, harvest images, and run the
  page-capture runtime (`capture.js`) on demand.
- `contextMenus` — the right-click "Save image" entry.
- `downloads` — save the *Download Figma (.json)* import file to disk.
- `storage` — remember the daemon URL locally (only needed if you changed it).
