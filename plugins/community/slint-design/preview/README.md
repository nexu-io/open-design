# Experimental WASM preview scaffold (S3)

**Status:** scaffold + documentation only. Full `slint-wasm-interpreter` binary is **deferred**.

## Why deferred

- Upstream crate `slint-wasm-interpreter` ships with `publish = false` and must be built with `wasm-pack` from the Slint monorepo.
- Build is heavy (toolchain, WebGL/femtovg), and redistribution requires an explicit Slint license choice (GPLv3 / Royalty-free / commercial).
- OpenDesign v1 acceptance for this plugin is **PNG via `slint-viewer --screenshot`**, not interactive WASM.
- Maintainer guidance on #8405: screenshot + `--check` is the lower-risk starting point.

## Intended approach (when resumed)

1. Build `api/wasm-interpreter` from https://github.com/slint-ui/slint with `wasm-pack build --target web`.
2. Place `slint_wasm_interpreter_bg.wasm` + JS glue next to `index.html`.
3. Load the HTML as a normal OpenDesign HTML artifact in a sandboxed iframe (`sandbox="allow-scripts"`).
4. `fetch` the project's `.slint` from `/api/projects/:id/raw/...` (daemon allows `Origin: null` for raw GET).
5. Call `compile_from_string` → `create(canvas_id)` → `run_event_loop`.

This is **Slint inside HTML preview**, not a native `ArtifactKind`. OD srcDoc bridges (inspector, tweak) still will not apply to the canvas.

## This folder

- `index.html` — placeholder shell documenting the iframe approach and pointing agents back to PNG workflow.
