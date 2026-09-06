# Chat panel design demo — source

`docs/design/chat-panel-next.html` and `docs/design/chat-panel-scene.html` are
**generated**. This directory is where they come from. Edit the sources here and
run the build; do not hand-edit the two HTML files.

- **chat-panel-next.html** — 对话面板组件全集. Every card kind in the transcript,
  each shown in all of its states, with the reasoning for each decision written
  next to it.
- **chat-panel-scene.html** — 对话面板场景稿. One continuous run rendered inside
  the panel shell, so the same components can be read in sequence rather than
  as a catalogue.

## Build

```sh
cd docs/design/chat-panel
node build.mjs            # rewrites both pages in docs/design/
python3 serve.py          # optional, serves docs/design/ at 127.0.0.1:8977
```

No install step and no dependencies — `build.mjs` uses only Node's standard
library. `serve.py` exists because the pages are UTF-8 and most one-line static
servers omit the charset, which makes every Chinese string render as mojibake.

## Why the output is almost self-contained

Fonts, component CSS and JS are inlined. Two constraints drive this:

1. The pages have to work when opened by double-click over `file://`. Browsers
   block cross-origin `url()` font loads there, so a linked font never arrives.
2. They may be reviewed inside sandboxed artifact viewers whose CSP blocks
   remote requests.

The four placeholder preview images are the one exception. They stay in
`src/visual-samples.css` and the generated pages link that local stylesheet so
each tracked HTML file remains below the repository's 1 MB blob limit. Opening
the page through `serve.py` or directly over `file://` still loads them. The
stylesheet contains only data URLs and makes no network request.

## Source map

| File | What it is |
| --- | --- |
| `build.mjs` | Concatenates the sources into the two pages. Also mirrors the page's `body` rules onto the wrapper element, and pins `data-theme="light"` on `<html>`. |
| `src/tokens.css` | **Verbatim snapshot** — see below. |
| `src/components.css` | The core: every component in both pages. This is the file to edit. |
| `src/scene-shell.css` | Panel shell used only by the scene page. |
| `src/body-components.html` | Markup + prose of the catalogue page. |
| `src/body-scene.html` | Markup of the scene page. |
| `src/thinking-orb.{css,js}` | The orb at the head of a thinking row. |
| `src/thinking-stream.{css,js}` | The reasoning stream: fixed height, auto-scroll, top/bottom fade. |
| `src/plan-todo.{css,js}` | Plan card step icons and the progress demo. |
| `src/visual-fan.{css,js}` | Visual-direction cards: stacked ⇄ grid layouts. |
| `src/visual-samples.css` | **Placeholder** preview images — see below. |
| `src/pixel-liquid.{css,js}` | The not-yet-generated state of an image tile. |
| `src/audio-wave.{css,js}` | Audio artifact: waveform + playback. |
| `src/text-reveal.js` | Per-character entrance for the summary line. |
| `src/interactions.js` | The few behaviours a static page can't show otherwise (retry spin, copy, volume drag). |
| `src/att-placeholder.svg`, `src/tick.svg` | Source of truth for two icons that ship inlined as data URIs. |

## `tokens.css` is a snapshot, not a copy to edit

It is taken unchanged from the app, so the demo cannot drift from the product's
palette:

- `apps/web/src/styles/tokens.css` — whole file, verbatim
- `apps/web/src/styles/base.css` — only the `--font-size-*` ladder
- `apps/web/public/fonts/AlbertSans-VariableFont_wght.ttf`
- `apps/web/public/fonts/JiduMonoPro-Regular.otf` — both inlined as base64

Snapshot commit: `34ad192de9e9656ecb02b901319aeb202c896070`. To resync, re-take
those four from the app and replace that section.

Colours the product specified for this design but that do not exist as tokens
yet are declared in a short override block at the top of `components.css`, each
with the reason it was chosen. Everything else resolves to a token.

## Placeholder assets

`src/visual-samples.css` holds four base64 images used as the visual-direction
previews. They were supplied for review only. When the real curated previews
land, replace those four base64 strings — the selectors do not change.

## Borrowed components

Each is credited in a comment at the point of use, together with what was
changed and why. Summary:

| Piece | Source | How it was adapted |
| --- | --- | --- |
| Thinking orb | `thinking-orbs@0.3.1` (MIT, Jakub Antalik) | Only the `thinking-orbs/engine` entry — plain 2D canvas, no React. Its 80-line React mount is rewritten as a native one; the geometry and paint tables are untouched. |
| Reasoning stream auto-scroll | hextaui `blocks/ai/ai-thinking` | Same mechanism, driven by rAF instead of a 5 ms `setInterval`. |
| Plan / todo transitions | beui.dev `agents/todo-list` | Same state choreography without motion/react. |
| Image stack | 21st.dev `@tonyzebastian/image-stack` | The four layout numbers carried over as-is. |
| Chain-of-thought rule | 21st.dev `@elements-` | Each step draws its own segment. |
| Text reveal | motion-primitives `TextEffect` (`per="char"`) | Entrance half only; the exit half is dropped on purpose. |
| Audio row | beui.dev `blocks/file-upload` | The `kind="audio"` row. |
| Pixel liquid | 21st.dev `pixel-liquid-bg` (@unlumen) | Its `color_frag` (pixelation, 4×4 Bayer dither, palette, grain, alpha) ported line-for-line to 2D canvas; the WebGL Navier-Stokes solver is replaced by a curl-noise field, which is divergence-free by construction — the property the solver's projection step exists to guarantee. Reasons are in `pixel-liquid.js`. |

## Scope

This directory is a design document. It ships no application code and nothing
here is imported by `apps/web`; the reskin that consumes it lives in
`apps/web/src/styles/viewer/chat-cards-next.css`.
