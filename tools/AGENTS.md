# tools/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `tools/`.

## Active tools

- `tools/dev` provides `@open-design/tools-dev` and the `tools-dev` bin. It is the only currently active local development lifecycle control plane.
- `pnpm tools-dev` exposes `desktop` as the public selector for the integrated `shells/electron` stack; its internal typed identity is `electron`.
- `tools-dev` invokes only the typed lifecycle adapter under `shells/electron/scripts`; it does not import electron-kit or launch an app-owned Electron runtime.
- `pnpm tools-dev run web` runs foreground daemon + web for the Playwright webServer flow.
- `pnpm tools-dev inspect desktop status` projects the Electron Shell status through its typed adapter.
- `tools/pack` provides `@open-design/tools-pack` and the `tools-pack` bin. This PR delivers only the macOS build/install/start/stop/logs/uninstall/cleanup/inspect surface through typed `shells/electron/scripts` adapters.
- `tools/serve` provides `@open-design/tools-serve` and the `tools-serve` bin. It owns local fixture services such as `tools-serve start updater`.
- `tools/release` provides `@open-design/tools-release` and the `tools-release` bin. It owns exact planning/control, channel-version lifecycle, metadata, immutable publication, reports, and notification-facing contracts.

## Retired tools

- `tools/pr` / `@open-design/tools-pr` / `pnpm tools-pr` has been retired from this repository. Maintainer PR-duty workflows now live outside the product workspace in `PerishCode/duty`; do not restore an OpenDesign-local PR-duty tool without a new explicit maintainer decision.

## Packaging scope

- Keep `tools-pack` as a thin request/receipt CLI. Electron assembly, identity, product handlers, updater behavior, and native platform policy belong to `electron-kit` plus `shells/electron`.
- Tool code must not import `electron-kit`; invoke the typed Shell lifecycle adapters instead.
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
pnpm --filter @open-design/tools-serve typecheck
pnpm --filter @open-design/tools-serve build
pnpm --filter @open-design/tools-release typecheck
pnpm --filter @open-design/tools-release build
pnpm --filter @open-design/tools-release test
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev check
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
pnpm tools-pack mac cleanup
pnpm tools-serve start updater
```
