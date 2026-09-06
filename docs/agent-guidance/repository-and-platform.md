# Repository and platform guidance

This document contains required guidance moved from the root [AGENTS.md](../../AGENTS.md) so nested instruction chains fit the default loader budget. Read the sections selected by the root routing table before changing matching code. Paths written as code are repository-root-relative.

## Core documentation index

- Product and onboarding: `README.md`, `docs/i18n/README.zh-CN.md`, `QUICKSTART.md`.
- Contribution and environment: `CONTRIBUTING.md`, `docs/i18n/CONTRIBUTING.zh-CN.md`.
- Architecture and protocols: `docs/architecture.md`, `docs/skills-protocol.md`, `docs/agent-adapters.md`, `docs/modes.md`.
- Historical product baseline: `docs/spec.md`, `docs/roadmap.md` (both explicitly archived; do not treat their dated decisions as current behavior).
- References and current plans: `docs/references.md`, `docs/code-review-guidelines.md`, `specs/current/maintainability-roadmap.md`, `specs/current/ci.md` (CI scope confidence methodology — required before changing planner confidence, routing, or omission policy in `.github/config/scopes.json` and `.github/scripts/scopes.py`).
- Directory-level agent guidance: `.github/AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, `tools/AGENTS.md`, `e2e/AGENTS.md`.
- Packaged auto-update architecture and high-confidence local harness: read `tools/pack/AGENTS.md` section "Packaged auto-update architecture and harness" before touching packaged updater code, release-channel identity, installer behavior, or updater UI.
- Packaged build cache contract: `tools/pack/CACHE.md` (determinant rules, materialization-time parameters, confidence grading — required before changing any build-cache node key).
- Prompt composition has two independent implementations behind a rollout switch: `docs/prompt-composition.md` (fork point, variant axes, host runtime contract table, worked examples — required before changing any prompt text, in `apps/daemon/src/prompts/`, `packages/contracts/src/prompts/`, or under `plugins/_official/scenarios/od-next-strategy/`). See "Prompt variants" below.

## Workspace directories

- Workspace packages come from `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `shells/*`, `tools/*`, and `e2e`.
- Top-level content directories: `skills/` (functional skills the agent invokes mid-task — utilities, briefs, packagers; see `skills/AGENTS.md`), `design-templates/` (rendering catalogue: decks, prototypes, image/video/audio templates; see `design-templates/AGENTS.md` and `specs/current/skills-and-design-templates.md`), `design-systems/` (brand `DESIGN.md` files), `craft/` (universal brand-agnostic craft rules a skill can opt into via `od.craft.requires`), `mocks/` (replay-based mock CLIs for `opencode`/`claude`/`codex`/`gemini`/`cursor-agent`/`deepseek`/`qwen`/`grok`, the ACP family `devin`/`hermes`/`kilo`/`kimi`/`kiro`/`vibe`, and the AMR `vela` CLI (login + models + ACP), built from anonymized Langfuse traces — PATH-overlay drop-in for tests and self-validation; see `mocks/README.md`).
- `apps/web` is the Next.js 16 App Router + React 18 web runtime; do not restore `apps/nextjs`.
- `apps/daemon` is the local privileged daemon and `od` bin. It owns `/api/*`, agent spawning, skills, design systems, artifacts, and static serving.
- `apps/desktop` is the Electron shell; it consumes web/daemon status through the sidecar client boundary.
- `apps/packaged` is the thin packaged Electron runtime entry; it starts packaged sidecars and owns the `od://` entry glue only.
- `apps/closure` owns the independently distributable OpenDesign Closure content. It does not own acquisition, generation state, or shell policy.
- `packages/contracts` is the pure TypeScript web/daemon app contract layer.
- `packages/sidecar-proto` owns business DTOs and action names; `packages/sidecar` owns the complete business-agnostic sidecar client boundary and protocol implementation; `packages/platform` owns generic OS process primitives.
- `packages/standalone` owns the shell-neutral exact metadata, verification, materialization, generation, and launcher contract.
- `shells/terminal` owns the official Node carrier and terminal-facing lifecycle commands. Shells consume standalone contracts and must not import Closure app source.
- `tools/dev` is the local development lifecycle control plane.
- `tools/pack` is the local packaged build/start/stop/logs control plane, packaged updater harness, installer identity/registry validation surface, and mac beta release artifact preparation surface.
- `tools/serve` is the local fixture-service control plane; first service is `tools-serve start updater` for deterministic updater metadata and artifacts.
- `tools/release` owns release metadata, storage publishing, release reports, and notification-facing data contracts; packaged artifact construction and smoke testing remain in `tools/pack`.
- `e2e` owns user-level end-to-end smoke tests and Playwright UI automation; read `e2e/AGENTS.md` before editing its tests or commands.

## Inactive or placeholder directories

- `apps/nextjs`, `packages/shared`, and `apps/landing-page` have been removed; do not recreate or reference them.
- Local runtime data, `.tmp/`, Playwright reports, and agent scratch directories must stay out of git. For daemon-managed data paths, read and follow **Daemon data directory contract** below; do not restate or improvise path conventions elsewhere.

## Daemon data directory contract

This section is the only repository-wide source of truth for daemon-managed
data paths. Every README, guide, deployment note, and operational handoff that
mentions daemon data paths must point here instead of restating the rules.

This boundary is strict. Do not introduce concrete filesystem examples for the
daemon data directory, recommended data directory, shared data directory,
deployment mount, or example data directory. If existing code exposes a legacy
fallback, treat it as implementation detail or a known escape candidate, not as
a documentation pattern to copy. If a change needs a data-path rule that is not
covered here, request a core-maintainer decision in the PR instead of inventing
a new convention.

The daemon has one active data-root truth source:

- On daemon startup, `apps/daemon/src/server.ts` resolves `OD_DATA_DIR` into
  `RUNTIME_DATA_DIR`.
- All daemon-owned data paths must derive from `RUNTIME_DATA_DIR` or from a
  constant derived from it, such as `PROJECTS_DIR` or `ARTIFACTS_DIR`.
- `PROJECTS_DIR` is the managed-project root. Imported-folder projects are the
  explicit exception: they use `metadata.baseDir` for the user-selected
  external workspace.
- `ARTIFACTS_DIR`, SQLite, app config, memory, MCP config/tokens, automation
  state, plugin state, connector credentials, generated files, logs owned by
  sandbox mode, and agent runtime homes are daemon data and must remain under
  the resolved daemon data root unless this file names a specific exception.
- Agent subprocesses receive the resolved daemon data root as `OD_DATA_DIR`.
  They must inherit the daemon's truth source instead of guessing their own
  data path.

Development propagation:

- `tools-dev` consumes sidecar launch/discovery/lifecycle atomics and owns only developer orchestration policy.
- `tools-dev --namespace <name>` does not, by itself, define daemon data
  isolation.
- A development run that needs an isolated daemon data root must pass
  `OD_DATA_DIR` into the daemon process environment. After that, the daemon
  resolves it once and all daemon data paths flow from `RUNTIME_DATA_DIR`.

Packaged propagation:

- `tools-pack` / `apps/packaged` own packaged channel and namespace layout.
- Packaged code resolves the final namespace-scoped daemon data root before
  spawning the daemon.
- The packaged daemon receives that final data root as `OD_DATA_DIR`; daemon
  code must not infer packaged data paths from app names, Electron `userData`,
  ports, channel names, or namespace names.

Sanctioned exceptions:

- `OD_MEDIA_CONFIG_DIR` is a narrow override for `media-config.json` only. It
  is not a second daemon data root.
- `OD_LEGACY_DATA_DIR` is a migration source for legacy data import only. It is
  not an active daemon data root.
- External tool homes such as `CODEX_HOME` are integration inputs, not daemon
  data roots. The daemon must not describe them as OpenDesign runtime data.
- Agent/project-cwd skill staging aliases are not daemon data roots.
- Manifest metadata keys and CSS identifiers are semantic namespaces, not
  filesystem path conventions.

Known escape candidates that must not be reused:

- Module-level defaults that point at a cwd-relative legacy data directory.
- Helper defaults such as `defaultRegistryRoots()` that recompute a data root
  from `process.env.OD_DATA_DIR` or a cwd fallback instead of receiving
  `RUNTIME_DATA_DIR`.
- `openDatabase(projectRoot)` calls that rely on its fallback instead of
  passing the resolved data root.
- Script help text or examples that suggest concrete legacy data directories.

Do not extend these escape patterns. When a fix is obvious, route the path
through `RUNTIME_DATA_DIR` or an explicit data-root argument. When it is not
obvious, block the PR and request core-maintainer guidance.

## GitHub automation boundary

Read `.github/AGENTS.md` before editing `.github/workflows/`, `.github/scripts/`, `.github/actions/`, PR follow-on automation, `workflow_run` trusted writes, CI handoff artifacts, or the workflow topology checks that guard those surfaces.

CI-related GitHub automation uses a two-layer architecture:

- Business layer workflows own product or validation decisions. `ci.yml` is the main low-privilege PR, merge-queue, and manual validation workflow. It detects scope, runs checks, and produces typed handoff artifacts.
- Atomic capability workflows own reusable trusted operations. `comment.atom.yml` publishes pure text PR comments, `autofix.atom.yml` applies same-repository patches, and `report.atom.yml` materializes advanced comments that need trusted dependencies, secrets, or report generation before upsert.

Do not add a new business-named follow-on workflow such as `foo.comment.atom.yml` or `bar.autofix.atom.yml` without first trying to express the flow as a `ci.yml` producer plus the existing `comment`, `autofix`, or `report` capability. Keep artifact naming, storage layout, and parser behavior centralized in `.github/scripts/handoff.py`; do not let individual workflows invent parallel handoff conventions.

## CI test-set orchestration guidance

Use the following as a recommended convergence model, not a repository-wide
conformance gate. Existing workflows and coarse test lanes may remain while
their boundaries are understood. Do not block an unrelated change or require it
to repay adjacent orchestration debt solely because it touches an existing
lane. Apply these recommendations incrementally when the local scope and
measured scheduling benefit justify the migration.

Prefer one selection direction: changed paths → source units → test sets →
execution workloads. Because the `plan` job runs before and governs downstream
jobs, new omission policy should live in the planner rather than rely on a
downstream guard to justify it after scheduling has already occurred.

When a CI area is being reorganized, prefer three named responsibilities:

- **Source units** name stable ownership or behavior boundaries in production,
  test, fixture, and control-plane paths. Prefer composing repeated selectors
  under a named unit instead of copying prefixes into unrelated rules.
- **Test sets** name independently useful semantic validation groups. Their
  membership and execution contract should converge on one authoritative
  declaration instead of accumulating more matrix or file-list copies across
  planner configuration, workflow YAML, and framework-local registries.
- **Routes** map source units to the test sets required to validate them. Routes
  should express impact rather than runner mechanics; runner image, setup,
  sharding, and job packing can remain execution concerns derived after
  selection.

Good split candidates have a stable boundary, change work that can actually be
omitted, and carry enough runtime cost or diagnostic value to justify another
scheduling identity. Directory size, file count, or the ability to write a
narrower glob is weak evidence on its own. Prefer a small number of composable
semantic units over per-file mappings, exception lists, or negative-rule
forests. Treat existing duplicated or implicit declarations as migration
surfaces without requiring every nearby change to remove them.

Before promoting a new route from observation to active omission, retain
conservative behavior such as:

- unknown, mixed, unresolved, invalid, or below-threshold input selects the
  conservative full plan;
- editing a test, fixture, or suite manifest selects the test set that consumes
  it; shared harness, contract, setup, or lockfile changes fan out to every
  affected set;
- making a selected test-set identifier that the executor cannot run fail
  visibly instead of being ignored;
- direct planner tests cover representative in-bound, out-of-bound, mixed, and
  fallback inputs without reimplementing the evaluator in another language.

Keep scope routing and reusable-result convergence conceptually orthogonal:
scope answers which test sets are necessary for a change, while convergence
answers whether an identically declared workload already has a validated,
reusable successful result. New designs should not use result availability to
weaken source-to-test coverage or copy route policy into
`.github/config/convergence.json`. Prefer productless reusable workloads; when a
workload owns products, declare the complete typed reuse manifest with it.

For work whose purpose is CI orchestration, start by inventorying the current
chain from changed path to match, effect, workload, job command, and concrete
test cases. Prefer naming or removing implicit joins before making them finer.
Changes under `.github/` must also follow `.github/AGENTS.md` and the current
confidence methodology in `specs/current/ci.md`.

## Release channel model

- `beta` is the daily R&D/development validation channel. It is optimized for fast development feedback and is not part of the stable promotion gate.
- `prerelease` is the internal validation channel for stable delivery. Stable releases remain gated by validated prerelease artifacts.
- `preview` is an independent early-access channel with stable-like release rigor. It should use preview versions such as `X.Y.Z-preview.N`, publish to the `preview` R2 channel, publish updater feeds under `preview/latest`, and follow stable's platform policy including the existing optional Linux enablement.
- `stable` is the formal delivery channel. Do not make stable promotion depend on preview; stable continues to depend on prerelease only.
- Public packaged app identity must stay channel-distinct: stable uses `Open Design`, beta uses `Open Design Beta`, prerelease uses `Open Design Prerelease`, and preview uses `Open Design Preview`. Do not ship beta, prerelease, or preview mac DMGs whose drag-install app bundle is `Open Design.app`.
- Windows beta updater validation must use the real beta namespace `release-beta-win`; otherwise a local beta-like namespace can create a separate uninstall registry key while looking like the same `Open Design Beta` app. See `tools/pack/AGENTS.md` for the architecture map and high-confidence acceptance harness.

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
- Sidecar process stamps must have exactly five fields: `channel`, `namespace`, `source`, `mode`, and `app`. IPC is private implementation detail and is never a stamp field.
- Sidecar identity is argv-only. Do not create identity/state files derived from a stamp.
- Orchestration layers (`tools-dev`, `tools-pack`, packaged launchers) must call `@open-design/sidecar` client/atomic primitives; do not expose argv assembly, IPC paths, or process scans.
- Packaged runtime paths must be namespace-scoped and independent from daemon/web ports; ports are transient transport details only.
- Default runtime files live under `<project-root>/.tmp/<source>/<namespace>/...`; private IPC endpoints are derived by `@open-design/sidecar` from the five-field stamp and the current OS principal. POSIX endpoints use a principal-scoped, hashed directory under the OS temporary directory; callers must treat the concrete path as opaque.

## Capability exposure (UI/CLI dual-track)

Every user-facing capability must be reachable through both the web UI **and** the `od` CLI (`apps/daemon/src/cli.ts`). Shipping a feature with only one of the two surfaces is a regression.

- The CLI is the embeddability contract. External agents (hermes-agent, openclaw, custom Slack/Discord bots, packaged runtimes invoked from another shell) drive OpenDesign through `od` subcommands — they do not render the web UI. If a capability is UI-only, it cannot be composed into those external agents.
- Both surfaces must call the same `/api/*` endpoints; do not let the CLI talk to one shape and the UI to another. The daemon HTTP layer is the single source of truth, with `packages/contracts` carrying the shared DTOs.
- The CLI form must support `--json` for machine-readable output and accept long-form prompts via `--prompt-file <path|->`, so jobs that pipe through `xargs`, `jq`, and `<heredoc` stay clean.
- Adding a new capability is a three-step closure: HTTP endpoint in `apps/daemon/src/*-routes.ts` (with a contract type in `packages/contracts/src/api/`), UI surface in `apps/web/src/`, and `od <capability>` subcommand in `apps/daemon/src/cli.ts` registered through `SUBCOMMAND_MAP`. Land all three in the same PR; do not stage them across PRs.
- The PR template's Surface area checklist must reflect *both* surfaces. If you ticked UI, tick CLI too — and vice-versa — or explain in the PR body why the missing surface is genuinely not applicable (e.g. an internal-only daemon health probe). "I'll do the CLI later" is not a valid reason.
- Existing reference points: `od automation …` mirrors the Automations tab against `/api/routines`; `od plugin …`, `od ui …`, `od project …`, `od media …`, `od mcp …`, `od research …` follow the same shape. Copy that pattern for new capabilities.

## Prompt variants (two implementations, one switch)

A generation run is composed by ONE of two independent prompt implementations. `composeSystemPrompt` returns early at `apps/daemon/src/prompts/system.ts:905` when a run carries an OD Next recipe, so the entire legacy stack below that line is skipped. The API/BYOK mirror at `packages/contracts/src/prompts/system.ts:318` forks the same way. The two sides share no composition floor: a rule added to one holds only for the runs that take that side.

- **Legacy side**: `apps/daemon/src/prompts/` (mirrored for API/BYOK in `packages/contracts/src/prompts/`).
- **OD Next side**: `plugins/_official/scenarios/od-next-strategy/assets/**` (markdown sent to the model verbatim) plus TypeScript in `packages/contracts/src/prompts/od-next-strategy.ts`, which is where OD Next carries host runtime contracts such as `<question-form>` and the deck framework — not in the task profiles.
- **Switch**: Settings → Labs → Design Harness, app-config `odNextStrategyMode`, or `OD_NEXT_STRATEGY_ROLLOUT`. Eligibility is re-evaluated per run by `evaluateOdNextRollout` (`apps/daemon/src/strategies/od-next/rollout.ts:138`) and can be latched down mid-session by a runtime signal, so which side a run takes varies on one machine with the switch unchanged. Divergence between the sides therefore surfaces as an intermittent bug.

Before changing any prompt text — in any of those locations — read `docs/prompt-composition.md`. It carries the variant axes, a host runtime contract table naming which path carries each contract today, the asset roster and package-hash rules for the plugin side, and the known gaps. A host contract should have one source that every path consumes: `packages/contracts/src/prompts/deck-framework.ts` is the worked example, feeding classic, BYOK, and OD Next from one scaffold. Repository-maintenance notes must never be written into files under that plugin's `assets/`; they are sent to the model verbatim.

## Starting a physical Run

- Every physical Run is started through `internalRunCreation.start(run, analytics, starter)` (`apps/daemon/src/services/internal-run-service.ts`). Calling the run registry's `start` directly bypasses the Run analytics lifecycle, so the Run reports no `run_created` and no `run_finished` and nothing says so. `pnpm guard`'s "run start choke point" check enforces this; the only allowed caller of `.runs.start(` is the service itself.
- The `analytics` argument is required on purpose. A caller with no identity to attribute the Run to — a scheduled Automation, a background refresh — passes `requestAnalyticsContext: null` explicitly; the lifecycle then stays silent instead of inventing one. Stating "no identity" is a decision the code has to record, not a step a caller can skip.
- A daemon-created Run that continues an existing task inherits its analytics identity and lineage from the Run that caused it, via `inheritedRunLineageHints` (`apps/daemon/src/services/run-analytics-lifecycle.ts`). Resolve lineage through that helper rather than from the source Run's `analyticsRecovery`: the lifecycle re-reads host facts before it captures, so a short Run can hand off before its own recovery record exists.

## Reference maintenance

Keep the root routing entry aligned when a section in this document is renamed or moved.
