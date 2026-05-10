# Directory guide

This file is the single source of truth for agents entering this repository. Read this file first; after entering `apps/`, `packages/`, `tools/`, or `e2e/`, read that layer's `AGENTS.md` for module-level details. Do not copy module details back into the root file; root stays focused on cross-repository boundaries, workflow, and commands.

## Core documentation index

- Product and onboarding: `README.md`, `README.zh-CN.md`, `QUICKSTART.md`.
- Contribution and environment: `CONTRIBUTING.md`, `CONTRIBUTING.zh-CN.md`.
- Architecture and protocols: `docs/spec.md`, `docs/architecture.md`, `docs/skills-protocol.md`, `docs/agent-adapters.md`, `docs/modes.md`.
- Roadmap and references: `docs/roadmap.md`, `docs/references.md`, `docs/code-review-guidelines.md`, `specs/current/maintainability-roadmap.md`.
- Directory-level agent guidance: `apps/AGENTS.md`, `packages/AGENTS.md`, `tools/AGENTS.md`, `e2e/AGENTS.md`.

## Workspace directories

- Workspace packages come from `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `tools/*`, and `e2e`.
- Top-level content directories: `skills/` (artifact-shape skills), `design-systems/` (brand `DESIGN.md` files), `craft/` (universal brand-agnostic craft rules a skill can opt into via `od.craft.requires`).
- `apps/web` is the Next.js 16 App Router + React 18 web runtime; do not restore `apps/nextjs`.
- `apps/daemon` is the local privileged daemon and `od` bin. It owns `/api/*`, agent spawning, skills, design systems, artifacts, and static serving.
- `apps/desktop` is the Electron shell; it discovers the web URL through sidecar IPC.
- `apps/packaged` is the thin packaged Electron runtime entry; it starts packaged sidecars and owns the `od://` entry glue only.
- `packages/contracts` is the pure TypeScript web/daemon app contract layer.
- `packages/sidecar-proto` owns the Open Design sidecar business protocol; `packages/sidecar` owns the generic sidecar runtime; `packages/platform` owns generic OS process primitives.
- `tools/dev` is the local development lifecycle control plane.
- `tools/pack` is the local packaged build/start/stop/logs control plane and mac beta release artifact preparation surface.
- `e2e` owns user-level end-to-end smoke tests and Playwright UI automation; read `e2e/AGENTS.md` before editing its tests or commands.

## Inactive or placeholder directories

- `apps/nextjs` and `packages/shared` have been removed; do not recreate or reference them.
- `.od/`, `.tmp/`, Playwright reports, and agent scratch directories are local runtime data and must stay out of git.

# Development workflow

## Environment baseline

- Runtime target is Node `~24` and `pnpm@10.33.2`; use Corepack so the pnpm version pinned in `package.json` is selected.
- New project-owned entrypoints, modules, scripts, tests, reporters, and configs should default to TypeScript.
- Residual JavaScript is limited to generated output, vendored dependencies, explicitly documented compatibility build artifacts, and the allowlist in `scripts/guard.ts`.

## Local lifecycle

- Use `pnpm tools-dev` as the only local development lifecycle entry point.
- Do not add or restore root lifecycle aliases: `pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, or `pnpm start`.
- Ports are governed by `tools-dev` flags: `--daemon-port` and `--web-port`.
- `tools-dev` exports `OD_PORT` for the web proxy target and `OD_WEB_PORT` for the web listener; do not use `NEXT_PORT`.

## Root command boundary

- Keep root scripts reserved for true repo-level checks and tools control-plane entrypoints: `pnpm guard`, `pnpm typecheck`, `pnpm tools-dev`, and `pnpm tools-pack`.
- Do not add root aggregate `pnpm build` or `pnpm test` aliases. Build/test commands must stay package-scoped (`pnpm --filter <package> ...`) or tool-scoped (`pnpm tools-pack ...`).
- Do not add root e2e aliases; e2e package commands and ownership rules live in `e2e/AGENTS.md`.

## Boundary constraints

- Tests under `apps/`, `packages/`, and `tools/` live in a package/app/tool-level `tests/` directory sibling to `src/`; keep `src/` source-only and do not add new `*.test.ts` or `*.test.tsx` files under `src/`. Playwright UI automation belongs to `e2e/ui/`, not app packages.
- App packages must not import another app's private `src/` or `tests/` implementation as a shared helper. In particular, `apps/web/**` must not import `apps/daemon/src/**`; web/daemon integration belongs behind HTTP APIs, `packages/contracts`, and app-local provider boundaries.
- Cross-app, cross-runtime, or repository-resource consistency checks belong in `e2e/tests/` when they need to observe more than one app/package boundary; promote reusable logic to a pure package instead of borrowing another app's private source.
- Keep shared API DTOs, SSE event unions, error shapes, task shapes, and example payloads in `packages/contracts`; update contracts before wiring divergent web/daemon request or response shapes.
- Keep `packages/contracts` pure TypeScript and free of Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, and sidecar control-plane dependencies.
- Keep project-owned entrypoints, modules, scripts, tests, reporters, and configs TypeScript-first; generated `dist/*.js` is runtime output, and source edits belong in `.ts` files.
- New `.js`, `.mjs`, or `.cjs` files need an explicit generated/vendor/compatibility reason and must pass `pnpm guard`.
- App business logic must not know about sidecar/control-plane concepts. Keep sidecar awareness in `apps/<app>/sidecar` or the desktop sidecar entry wrapper.
- Shared web/daemon app contracts belong in `packages/contracts`; that package must not depend on Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, or the sidecar control-plane protocol.
- Sidecar process stamps must have exactly five fields: `app`, `mode`, `namespace`, `ipc`, and `source`.
- Orchestration layers (`tools-dev`, `tools-pack`, packaged launchers) must call package primitives; do not hand-build `--od-stamp-*` args or process-scan regexes.
- Packaged runtime paths must be namespace-scoped and independent from daemon/web ports; ports are transient transport details only.
- Default runtime files live under `<project-root>/.tmp/<source>/<namespace>/...`; POSIX IPC sockets are fixed at `/tmp/open-design/ipc/<namespace>/<app>.sock`.

## Git commit policy

- Git commits must not include `Co-authored-by` trailers or any other co-author metadata.

## Code review guide

- Use `docs/code-review-guidelines.md` as the repository-wide review standard. That document is the operational guide; this `AGENTS.md` is the source of truth when the two disagree.
- Walk reviews top-down through `docs/code-review-guidelines.md`: Product relevance test → forbidden surfaces → ownership/scope → matching lane → checklist → comments → approval bar.
- Pick the matching review lane: default code/tests, contract and protocol changes, design-system additions, skill additions, or craft additions.
- Before reviewing changes under `apps/`, `packages/`, `tools/`, or `e2e/`, read that directory's `AGENTS.md` and apply its local boundaries.
- Blocking review feedback should focus on correctness, security/secrets, data integrity, repository boundary violations, contract/migration breakage, missing required validation, or high-risk maintainability issues.
- Only maintainers may close a PR instead of requesting changes, and only when the change is not salvageable on the existing branch (wrong target product, foreign test harness, DOM/API assumptions absent from this repo, or scripts that conflict with lifecycle rules).

## Validation strategy

- After package, workspace, or command-entry changes, run `pnpm install` so workspace links and generated dist entries stay fresh.
- Before marking regular work ready, run at least `pnpm guard` and `pnpm typecheck`, plus the package-scoped tests/builds that match the files changed. Do not use or add root `pnpm test`/`pnpm build` aliases.
- For local web runtime loops, prefer `pnpm tools-dev run web --daemon-port <port> --web-port <port>`.
- On a GUI-capable machine, validate desktop by running `pnpm tools-dev`, then `pnpm tools-dev inspect desktop status`.
- Stamp/namespace changes must validate two concurrent namespaces and run desktop `inspect eval` plus `inspect screenshot` for each namespace.
- Path/log changes must run `pnpm tools-dev logs --namespace <name> --json` and confirm log paths are under `.tmp/tools-dev/<namespace>/...`.

# Common commands

```bash
pnpm install
pnpm tools-dev
pnpm tools-dev start web
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev inspect desktop status --json
pnpm tools-dev inspect desktop screenshot --path /tmp/open-design.png
pnpm tools-dev stop
pnpm tools-dev check
```

```bash
pnpm guard
pnpm typecheck
```

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/web build
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/tools-dev build
pnpm --filter @open-design/tools-pack build
```

```bash
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
pnpm tools-pack mac cleanup
pnpm tools-pack win build --to nsis
pnpm tools-pack win install
pnpm tools-pack win cleanup
pnpm tools-pack linux build --to appimage
pnpm tools-pack linux install
pnpm tools-pack linux build --containerized
```

# FAQ

## Why is there no root `pnpm dev` / `pnpm start`?

To avoid starting daemon, web, and desktop through inconsistent env, port, namespace, or log paths. All local lifecycle flows must go through `pnpm tools-dev`.

## Why should `apps/nextjs` not be restored?

The current web runtime is `apps/web`. The historical `apps/nextjs` layout has been removed from the active repo shape; restoring it would reintroduce duplicate app boundaries and stale scripts.

## How does desktop discover the web URL?

Desktop queries runtime status through sidecar IPC. The web URL comes from `tools-dev` launch status, not from desktop guessing ports or reading web internals.

## How are sidecar-proto, sidecar, and platform split?

`@open-design/sidecar-proto` owns Open Design app/mode/source constants, namespace validation, stamp fields/flags, IPC message schema, status shapes, and error semantics. `@open-design/sidecar` provides only generic bootstrap, IPC transport, path/runtime resolution, launch env, and JSON runtime files. `@open-design/platform` provides only generic OS process stamp serialization, command parsing, and process matching/search primitives, consuming the proto descriptor.

## Where is data written?

The daemon writes `.od/` by default: SQLite at `.od/app.sqlite`, agent CWDs under `.od/projects/<id>/`, saved renders under `.od/artifacts/`, and credentials at `.od/media-config.json`. Two env vars override the storage root, in order:

1. `OD_DATA_DIR=<dir>` — relocates *all* daemon runtime data to `<dir>` (used by Playwright for test isolation, and by the packaged daemon and the Home Manager / NixOS modules to point the daemon at a writable directory when the install root is read-only). The path is resolved with `~/` expansion and relative paths anchored to `<projectRoot>`.
2. `OD_MEDIA_CONFIG_DIR=<dir>` — narrower override that relocates *only* `media-config.json`. Same resolution semantics. Most installs do not need this; it exists for setups that want to keep API credentials in a different location from the rest of the runtime data.

Default precedence is OD_MEDIA_CONFIG_DIR > OD_DATA_DIR > `<projectRoot>/.od`.

## When is `pnpm install` required?

Run `pnpm install` after changing package manifests, workspace layout, command entrypoints, bin/link-related content, or after adding/removing workspace packages.
