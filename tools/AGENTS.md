# tools/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `tools/`.

## Active tools

- `tools/dev` provides `@open-design/tools-dev` and the `tools-dev` bin. It is the only currently active local development lifecycle control plane.
- `pnpm tools-dev` manages daemon -> web -> desktop.
- `pnpm tools-dev run web` runs foreground daemon + web for the Playwright webServer flow.
- `pnpm tools-dev inspect desktop ...` inspects the desktop runtime through sidecar IPC.

## Placeholder tools

- `tools/pack` is the minimal placeholder for the future `tools-pack` workstream.
- Do not add a package manifest, root script, packaging command, or release/signing logic under `tools/pack` in this round.
- The package/build boundary of root `pnpm build` is intentionally unchanged in this round and should be handled by the future `tools-pack` task.

## Orchestration boundary

- Orchestration layers must consume primitives from `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform`.
- Do not hand-build `--od-stamp-*` args, process-scan regexes, runtime tokens, process roles, or duplicate namespace/source args in `tools/dev`, future `tools/pack`, or packaged launchers.
- Port flags are authoritative inputs: `--daemon-port` and `--web-port`. Internal env vars are `OD_PORT` and `OD_WEB_PORT`; do not introduce `NEXT_PORT`.

## Common tools commands

```bash
pnpm --filter @open-design/tools-dev typecheck
pnpm --filter @open-design/tools-dev build
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev check
```
