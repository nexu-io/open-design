# tools/pack

Follow the root `AGENTS.md` and `tools/AGENTS.md` first.

This tool owns only the repo-external macOS package build and smoke-lifecycle
command surface. Keep it a thin request/receipt adapter over
`shells/electron/scripts`.

## Boundaries

- Do not import `@open-design/electron-kit` or Electron.
- Do not implement Shell identity, distribution assembly, product handlers,
  Sidecar convergence, or channel publication here.
- Build delegates to `electron.pack.build`; runtime control delegates to the
  Shell runtime adapter. Treat returned physical paths and private process
  details as opaque receipt data.
- CDP inspection discovers the native Electron endpoint selected by the Shell
  launch argument. It must not invent a parallel debug bridge.
- Namespace controls local output/install/runtime paths. Ports are transient
  transport details and never path identity.
- Tests use the test-only `@/*` alias and live under `tests/`.

## Supported slice

Only macOS is exposed in this PR. Do not add Linux delivery from the symmetric
`electron-kit/src/platform/linux/index.ts` declaration. Windows local tooling
returns only when a separately accepted tools-pack boundary is designed.

## Checks

```sh
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-pack build
pnpm --filter @open-design/tools-pack test
```
