# apps/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `apps/`.

## Active apps

- `apps/web`: Next.js 16 App Router + React 18 web runtime. Entrypoints live in `apps/web/app/`; the main client shell is `apps/web/src/App.tsx`. During local `tools-dev` web runs, `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to `OD_PORT`.
- `apps/daemon`: Express + SQLite local daemon and `od` bin. It owns REST/SSE APIs, agent CLI spawning, skills, design systems, artifact persistence, static serving, and local data under `.od/`.
- `apps/desktop`: Electron shell. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.
- `apps/packaged`: Thin packaged Electron runtime entry. It starts packaged daemon/web sidecars, registers the `od://` entry protocol, and delegates desktop host behavior to `apps/desktop`.

## Daemon layout

- `apps/daemon/src/` contains only daemon app source.
- `apps/daemon/tests/` contains daemon tests.
- `apps/daemon/sidecar/` contains the daemon sidecar entry.
- CLI/agent argument changes or stdout parser changes belong in `apps/daemon/src/agents.ts` and the matching parser tests.

## Test layout

- App tests live in each app's `tests/` directory, sibling to `src/`; preserve source-relative subpaths inside `tests/` when useful.
- Keep app `src/` directories source-only; do not add new `*.test.ts` or `*.test.tsx` files under `src/`.

## Sidecar awareness

- App business layers must not import sidecar packages or branch on `runtime.mode`, `namespace`, `ipc`, or `source`.
- Keep sidecar awareness in `apps/<app>/sidecar` or the desktop sidecar entry wrapper.

## Packaged runtime

- `apps/nextjs` has been removed; do not restore it.
- Packaged web uses Next.js SSR through the web sidecar; do not put Next output under daemon `OD_RESOURCE_ROOT`.
- Packaged `OD_RESOURCE_ROOT` is only for daemon non-Next read-only resources: `skills/`, `design-systems/`, and `frames/`.
- Packaged data/log/runtime/cache paths must be namespace-scoped and must not depend on daemon or web ports.
- Daemon↔web packaged traffic still uses an HTTP origin/port because Next.js dev server and SSR proxy paths assume HTTP origins; switching to Unix sockets would require patching Next internals. The invariant is that data/log/runtime/cache paths never embed ports.

## Common app commands

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop typecheck
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/packaged build
```
