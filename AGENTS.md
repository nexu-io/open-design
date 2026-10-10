# Repository entry guide

This file routes repository-wide work. Read it first, then load the nearest
path-local `AGENTS.md` before editing code. `CODING_STANDARDS.md` owns coding
and validation conventions; `CONTRIBUTING.md` owns contribution and PR policy;
the repository, package manifests, local guides, and product specs own their
facts and contracts.

## Load order

1. Read this file for repository boundaries and routing.
2. Read the nearest `AGENTS.md` for the changed path. The `.github/`, `apps/`,
   `packages/`, `tools/`, `e2e/`, `skills/`, and `design-templates/` guides
   each own their subtree.
3. Load the conditional document named by the change: `CODING_STANDARDS.md`
   for code, UI, tests, and validation; `CONTRIBUTING.md` for contribution
   policy; and the linked architecture, release, prompt, or CI document for
   those surfaces.
4. Treat executable checks and configuration as the source of truth when a
   prose copy disagrees with them. Do not copy local rules back into this file.

## Documentation map

- Product and setup: `README.md`, `QUICKSTART.md`, and `CONTRIBUTING.md`.
- Coding, UI, tests, and bug evidence: `CODING_STANDARDS.md`.
- Architecture and protocols: `docs/architecture.md`, `docs/skills-protocol.md`,
  `docs/agent-adapters.md`, and `docs/modes.md`.
- Review: `docs/code-review-guidelines.md`.
- CI scope and convergence: `specs/current/ci.md` and `.github/AGENTS.md`.
- Prompt variants: `docs/prompt-composition.md`.
- Packaged updater, release channels, and build cache: `tools/pack/AGENTS.md`
  and `tools/pack/CACHE.md`.
- Windows setup exceptions: `docs/windows-troubleshooting.md`.

## Repository topology

- Workspace roots come from `pnpm-workspace.yaml`: `apps/*`, `packages/*`,
  `shells/*`, `tools/*`, and `e2e`.
- `apps/daemon` owns REST/SSE APIs, the `od` CLI, agent runtimes, and daemon
  state. `apps/web` owns the web UI; `apps/desktop` owns the Electron shell;
  `apps/packaged` owns packaged entry glue; `apps/closure` owns Closure content.
- `packages/contracts` owns shared web/daemon DTOs. `packages/sidecar-proto`,
  `packages/sidecar`, `packages/platform`, and `packages/standalone` own their
  documented protocol and runtime boundaries.
- `tools/dev`, `tools/pack`, `tools/serve`, and `tools/release` own their
  control planes. `shells/terminal` owns the terminal carrier.
- Read the local guide before changing `apps/`, `packages/`, `tools/`, `e2e/`,
  `.github/`, `skills/`, or `design-templates/`. The retired `apps/nextjs`,
  `packages/shared`, and `apps/landing-page` paths are not active repository
  surfaces.

## Development boundaries

### Environment and lifecycle

Use the Node and pnpm versions declared in `package.json`. `QUICKSTART.md` and
`docs/windows-troubleshooting.md` own installation details and platform
exceptions. Use `pnpm tools-dev` as the local lifecycle entry point; do not add
root `dev`, `dev:all`, `daemon`, `preview`, or `start` aliases. Ports come from
`tools-dev` flags and use `OD_PORT` / `OD_WEB_PORT`.

### Daemon data directory contract

This section is the only repository-wide source of truth for daemon-managed
data paths. Every README, guide, deployment note, and operational handoff that
mentions daemon data paths must point here instead of restating the rules.

The daemon resolves `OD_DATA_DIR` once at startup as `RUNTIME_DATA_DIR`. Every
daemon-owned path must derive from that value or a constant derived from it,
including projects, artifacts, SQLite, app config, memory, MCP tokens,
automation and plugin state, connector credentials, generated files, logs, and
agent runtime homes. Imported-folder projects are the explicit exception: they
use the user-selected `metadata.baseDir`. Agent subprocesses inherit the
resolved root through `OD_DATA_DIR`.

`tools-dev` owns developer orchestration and must pass an isolated `OD_DATA_DIR`
when a run needs isolated daemon state. `tools-pack` and `apps/packaged` resolve
the final namespace-scoped root before spawning the packaged daemon. Daemon code
must not infer it from app names, Electron `userData`, ports, channel names, or
namespace names.

`OD_MEDIA_CONFIG_DIR` overrides only `media-config.json`. `OD_LEGACY_DATA_DIR`
is a migration source, not an active root. `CODEX_HOME` and other external tool
homes are integration inputs. Skill staging aliases, manifest metadata keys,
and CSS identifiers are not daemon data roots.

Do not introduce concrete data-root examples or cwd-relative fallbacks. Do not
recompute the root from `process.env.OD_DATA_DIR` in helpers that can receive
`RUNTIME_DATA_DIR`, and pass the resolved root to database helpers. If a needed
path rule is unclear, stop and request a core-maintainer decision.

### Root command boundary

Keep root scripts for `pnpm guard`, `pnpm typecheck`, `pnpm tools-dev`,
`pnpm tools-pack`, and `pnpm tools-serve`. Keep build and test commands
package-scoped or tool-scoped. E2E command ownership stays in `e2e/AGENTS.md`.

### Cross-package architecture

- Keep tests beside each package or app under `tests/`; keep `src/` source-only.
  Cross-boundary browser tests belong in `e2e/tests/` or `e2e/ui/`.
- Apps must not import another app's private `src/` or `tests/`. Cross-app
  behavior uses HTTP APIs, `packages/contracts`, or an app-local provider.
- Keep shared DTOs, SSE events, errors, task shapes, and example payloads in
  `packages/contracts`. That package stays pure TypeScript and has no app,
  filesystem, browser, SQLite, or sidecar-runtime dependencies.
- Sidecar identity uses the five-field argv stamp `channel`, `namespace`,
  `source`, `mode`, and `app`. IPC paths and process details remain opaque to
  apps and orchestrators; packaged paths stay namespace-scoped and independent
  from ports.
- TypeScript-first and file-placement rules are executable through `pnpm guard`;
  their detailed conventions live in `CODING_STANDARDS.md`.

## Capability exposure (UI/CLI dual-track)

Every user-facing capability must be reachable through both the web UI and the
`od` CLI. Both surfaces call the same daemon `/api/*` contract, with shared
DTOs in `packages/contracts`. A new capability lands its endpoint, UI surface,
and CLI subcommand together. An internal-only capability may omit a surface
only when the PR records why it is genuinely inapplicable. Read
`apps/daemon/AGENTS.md` before changing CLI or API behavior.

## Conditional workflow pointers

### GitHub automation boundary

Before changing `.github/workflows/`, `.github/scripts/`, `.github/actions/`, or
trusted follow-on automation, read `.github/AGENTS.md` and `specs/current/ci.md`.

### CI test-set orchestration guidance

For planner scope, test-set routing, or reusable-result convergence, follow the
current methodology in `specs/current/ci.md`; do not copy CI policy into this
entry guide.

### Release channel model

For channel identity, updater behavior, release validation, and packaged smoke,
read `tools/pack/AGENTS.md`, `tools/pack/CACHE.md`, and the owning release docs.

### Prompt variants (two implementations, one switch)

Before changing prompt text in daemon prompts, contract prompts, or the OD Next
scenario assets, read `docs/prompt-composition.md` and the nearest local guide.

### Agent runtime conventions

Before changing stream formats, runtime definitions, turn boundaries, or recorded
CLI fixtures, read `apps/daemon/AGENTS.md` and the fixture README it names.

### Starting a physical Run

Start physical runs through the service choke point documented by
`apps/daemon/AGENTS.md`; `pnpm guard` enforces the allowed start path.

### Asking the user questions

For question forms or answer routing, read the daemon prompt guidance, the web
artifact implementation, and the nearest local `AGENTS.md` before editing.

### Chat UI conventions

Chat rendering contracts belong to `apps/web/src/components/chat/AGENTS.md` and
the current chat specs. Load those documents before changing chat execution
records, plans, iframe bridges, or message rendering.

## Coding, validation, and review pointers

### Web CSS ownership

See `CODING_STANDARDS.md#web-css-ownership` and the nearest web `AGENTS.md`.

### Web component reuse

See `CODING_STANDARDS.md#web-component-reuse` and `packages/components` guidance.

### i18n keys

See `CODING_STANDARDS.md#i18n-keys` and `TRANSLATIONS.md` for locale maintenance.

### UI animation philosophy

See `CODING_STANDARDS.md#motion` for motion and reduced-motion conventions.

### Validation strategy

See `CODING_STANDARDS.md#validation` for the check matrix and completion bar.

### Bug follow-up workflow

See `CODING_STANDARDS.md#bug-fixes-and-review-evidence` and
`docs/code-review-guidelines.md` for review evidence.

### Git commit policy

See `CONTRIBUTING.md` for commit and contribution policy. The retired local
PR-duty tool remains documented in `tools/AGENTS.md`.

### Pull request expectations

Use `.github/pull_request_template.md`, `CONTRIBUTING.md`, and
`docs/code-review-guidelines.md`; fill every applicable template section.

### Code review guide

Use `docs/code-review-guidelines.md` as the reviewer workflow and read every
applicable local `AGENTS.md` before judging implementation details.

### Common commands

Use `QUICKSTART.md`, `CONTRIBUTING.md`, and the nearest local `AGENTS.md` for
commands. This heading remains as a stable pointer for older specifications.

