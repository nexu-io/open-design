# tools/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `tools/`.

## Active tools

- `tools/dev` provides `@open-design/tools-dev` and the `tools-dev` bin. It is the only currently active local development lifecycle control plane.
- `pnpm tools-dev` manages daemon -> web -> desktop.
- `pnpm tools-dev run web` runs foreground daemon + web for the Playwright webServer flow.
- `pnpm tools-dev inspect desktop ...` inspects the desktop runtime through sidecar IPC.
- `tools/pack` provides `@open-design/tools-pack` and the `tools-pack` bin. The active slice is packaged artifact build/install/start/stop/logs/uninstall/cleanup/list/reset plus beta release artifact preparation for mac and Windows lanes, plus a Linux AppImage lane with optional containerized builds.
- `tools/pr` provides `@open-design/tools-pr` and the `tools-pr` bin. It is the maintainer PR-duty control plane: a thin `gh` wrapper that encodes this repo's review-lane derivation, forbidden-surface flags, per-lane checklists, and validation-command suggestions. It must not perform side effects (approve / request changes / merge / close / push); those stay in explicit `gh` calls the maintainer runs.

## Packaging scope

- Keep `tools-pack` focused on packaging/runtime control and release artifact preparation. Runtime updater product integration remains a later phase.
- Pack-specific Electron builder resources belong under `tools/pack/resources/`; do not reference app/docs/download assets directly from pack logic.
- Namespace controls packaged data/log/runtime/cache paths. Ports are transient transport details and must not participate in path decisions.
- There is no root `pnpm build` aggregate. Use package-scoped builds for source packages and `pnpm tools-pack ...` for packaged artifact build/install/release flows.

## Orchestration boundary

- Tool tests live in each tool's `tests/` directory, sibling to `src/`; keep `src/` source-only and do not add new `*.test.ts` or `*.test.tsx` files under `src/`.
- Orchestration layers must consume primitives from `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform`.
- Do not hand-build `--od-stamp-*` args, process-scan regexes, runtime tokens, process roles, or duplicate namespace/source args in `tools/dev`, future `tools/pack`, or packaged launchers.
- Port flags are authoritative inputs: `--daemon-port` and `--web-port`. Internal env vars are `OD_PORT` and `OD_WEB_PORT`; do not introduce `NEXT_PORT`.

## Common tools commands

```bash
pnpm --filter @open-design/tools-dev typecheck
pnpm --filter @open-design/tools-dev build
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-pack build
pnpm --filter @open-design/tools-pr typecheck
pnpm --filter @open-design/tools-pr build
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev check
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
pnpm tools-pack mac cleanup
pnpm tools-pack win build --to nsis
pnpm tools-pack win install
pnpm tools-pack win inspect --expr "document.title"
pnpm tools-pack win cleanup
pnpm tools-pack linux build --to appimage
pnpm tools-pack linux install
pnpm tools-pack linux install --headless
pnpm tools-pack linux start --headless
pnpm tools-pack linux stop --headless
pnpm tools-pack linux build --containerized
pnpm tools-pr list
pnpm tools-pr list --bucket=merge-ready,approved-blocked
pnpm tools-pr view <num>
pnpm tools-pr view <num> --json
```
