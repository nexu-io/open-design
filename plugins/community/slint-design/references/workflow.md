# Detailed agent checklist (OpenCode primary)

1. Confirm `slint-viewer` is available (`slint-viewer --version`). Record the version.
2. Copy a template if useful (`templates/desktop-window/ui.slint` or `settings-form`).
3. Implement the brief in `.slint` with named components and clear properties.
4. `slint-viewer --check <file>` until exit 0.
5. Screenshot:
   - **≥ 1.18:** `slint-viewer --screenshot <out.png> --size <WxH> <file>`
     - Desktop default: `1280x800`
     - Mobile / compact: `390x844` (second PNG)
   - **1.17.x:** omit `--size`; use `slint-viewer --screenshot <out.png> <file>` and note intrinsic size.
6. If optional viewer MCP connected: `get_element_tree` / `click_element` / `take_screenshot` for states.
7. Hand paths of `.slint` + PNG back to the user; note gaps vs HTML preview bridges.

## Multi-size screenshots

Prefer two PNGs when `--size` exists (1.18+): desktop + mobile. On 1.17.x the flag is absent — do not fail the run; document the limitation and continue with a single default-size PNG.

Committed reference PNGs (generated with **slint-viewer 1.18.1**):

- `examples/hello-window.png` — preferred size 480×320 (also valid on 1.17)
- `examples/hello-window-1280x800.png` — desktop
- `examples/hello-window-390x844.png` — mobile / compact

**Rule:** if `slint-viewer --help` shows `--size`, use it; otherwise omit and keep one PNG.

`scripts/smoke.sh` honors `SLINT_VIEWER=...` and, when `--size` exists, also writes temp multi-size screenshots (best-effort; never fails smoke on 1.17).

## Docs MCP

Manifest declares `slint-docs` → `https://docs.slint.dev/mcp` (`search` / `fetch`). Under OpenDesign + OpenCode this is injected via `OPENCODE_CONFIG_CONTENT`.

## Viewer MCP (opt-in)

Exact CLI flags for MCP mode depend on Slint **1.18+** (`mcp` Cargo feature on `slint-viewer`). Do **not** treat viewer MCP as required for plugin apply or CI smoke. If the server fails to start, continue with check/screenshot CLI only and report the MCP error.

## Local / CI smoke

```bash
./scripts/smoke.sh
```

See also `.github/workflows/slint-design-smoke.yml`.
