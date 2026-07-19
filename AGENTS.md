# Directory guide

This file is the single source of truth for agents entering this repository. Read this file first; after entering `apps/`, `packages/`, `tools/`, or `e2e/`, read that layer's `AGENTS.md` for module-level details. Do not copy module details back into the root file; root stays focused on cross-repository boundaries, workflow, and commands.

## Core documentation index

- Product and onboarding: `README.md`, `docs/i18n/README.zh-CN.md`, `QUICKSTART.md`.
- Contribution and environment: `CONTRIBUTING.md`, `docs/i18n/CONTRIBUTING.zh-CN.md`.
- Architecture and protocols: `docs/architecture.md`, `docs/skills-protocol.md`, `docs/agent-adapters.md`, `docs/modes.md`.
- Historical product baseline: `docs/spec.md`, `docs/roadmap.md` (both explicitly archived; do not treat their dated decisions as current behavior).
- References and current plans: `docs/references.md`, `docs/code-review-guidelines.md`, `specs/current/maintainability-roadmap.md`.
- Directory-level agent guidance: `.github/AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, `tools/AGENTS.md`, `e2e/AGENTS.md`.
- Packaged auto-update architecture and high-confidence local harness: read `tools/pack/AGENTS.md` section "Packaged auto-update architecture and harness" before touching packaged updater code, release-channel identity, installer behavior, or updater UI.

## Workspace directories

- Workspace packages come from `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `tools/*`, and `e2e`.
- Top-level content directories: `skills/` (functional skills the agent invokes mid-task — utilities, briefs, packagers; see `skills/AGENTS.md`), `design-templates/` (rendering catalogue: decks, prototypes, image/video/audio templates; see `design-templates/AGENTS.md` and `specs/current/skills-and-design-templates.md`), `design-systems/` (brand `DESIGN.md` files), `craft/` (universal brand-agnostic craft rules a skill can opt into via `od.craft.requires`), `mocks/` (replay-based mock CLIs for `opencode`/`claude`/`codex`/`gemini`/`cursor-agent`/`deepseek`/`qwen`/`grok`, the ACP family `devin`/`hermes`/`kilo`/`kimi`/`kiro`/`vibe`, and the AMR `vela` CLI (login + models + ACP), built from anonymized Langfuse traces — PATH-overlay drop-in for tests and self-validation; see `mocks/README.md`).
- `apps/web` is the Next.js 16 App Router + React 18 web runtime; do not restore `apps/nextjs`.
- `apps/daemon` is the local privileged daemon and `od` bin. It owns `/api/*`, agent spawning, skills, design systems, artifacts, and static serving.
- `apps/desktop` is the Electron shell; it discovers the web URL through sidecar IPC.
- `apps/packaged` is the thin packaged Electron runtime entry; it starts packaged sidecars and owns the `od://` entry glue only.
- `apps/landing-page` is the standalone static Astro marketing and public catalog site. It reads repository content at build time and is not part of the daemon/web product runtime.
- `packages/contracts` is the pure TypeScript web/daemon app contract layer.
- `packages/sidecar-proto` owns the Open Design sidecar business protocol; `packages/sidecar` owns the generic sidecar runtime; `packages/platform` owns generic OS process primitives.
- `tools/dev` is the local development lifecycle control plane.
- `tools/pack` is the local packaged build/start/stop/logs control plane, packaged updater harness, installer identity/registry validation surface, and mac beta release artifact preparation surface.
- `tools/serve` is the local fixture-service control plane; first service is `tools-serve start updater` for deterministic updater metadata and artifacts.
- `tools/release` owns release metadata, storage publishing, release reports, and notification-facing data contracts; packaged artifact construction and smoke testing remain in `tools/pack`.
- `e2e` owns user-level end-to-end smoke tests and Playwright UI automation; read `e2e/AGENTS.md` before editing its tests or commands.

## Inactive or placeholder directories

- `apps/nextjs` and `packages/shared` have been removed; do not recreate or reference them.
- Local runtime data, `.tmp/`, Playwright reports, and agent scratch directories must stay out of git. For daemon-managed data paths, read and follow **Daemon data directory contract** below; do not restate or improvise path conventions elsewhere.

# Development workflow

## Environment baseline

- Runtime target is Node `~24` and `pnpm@10.33.2`; use Corepack so the pnpm version pinned in `package.json` is selected.
- New project-owned entrypoints, modules, scripts, tests, reporters, and configs should default to TypeScript.
- Residual JavaScript is limited to generated output, vendored dependencies, explicitly documented compatibility build artifacts, and the allowlist in `scripts/guard.ts`.

## Windows native

- macOS, Linux, and WSL2 are the primary supported paths. Windows native is best-effort — file an issue if it doesn't work.
- Historical Windows-specific friction is documented in closed issues #10, #96, #100, #203, and #315; check the issue tracker for the current state before filing new reports.
- Install Node 24. Either `winget install OpenJS.NodeJS.LTS` (currently Node 24.x) or download from https://nodejs.org. After install, verify with `node --version` — the WinGet LTS pointer rolls to the next major in October 2026, so re-verify if you re-run the install command later. Do not use Node 22 — see FAQ.
- `corepack enable` fails with EPERM on Windows (cannot write shims to `Program Files`). Use `npm install -g pnpm@10.33.2` instead.
- `better-sqlite3` has no prebuilt binary for win32/Node 24; `pnpm install` will compile it from source via node-gyp (~2 min). Requires Visual Studio Build Tools 2022 or newer. This is expected — not a sign of version incompatibility.
- For `tools-dev` start/stop/status usage, see "Local lifecycle" below.

## Local lifecycle

- Use `pnpm tools-dev` as the only local development lifecycle entry point.
- Do not add or restore root lifecycle aliases: `pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, or `pnpm start`.
- Ports are governed by `tools-dev` flags: `--daemon-port` and `--web-port`.
- `tools-dev` exports `OD_PORT` for the web proxy target and `OD_WEB_PORT` for the web listener; do not use `NEXT_PORT`.

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

- `tools-dev` owns sidecar runtime/log/ipc namespacing.
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
  data roots. The daemon must not describe them as Open Design runtime data.
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

## Root command boundary

- Keep root scripts reserved for true repo-level checks and tools control-plane entrypoints: `pnpm guard`, `pnpm typecheck`, `pnpm tools-dev`, `pnpm tools-pack`, and `pnpm tools-serve`.
- Do not add root aggregate `pnpm build` or `pnpm test` aliases. Build/test commands must stay package-scoped (`pnpm --filter <package> ...`) or tool-scoped (`pnpm tools-pack ...`).
- Do not add root e2e aliases; e2e package commands and ownership rules live in `e2e/AGENTS.md`.

## GitHub automation boundary

Read `.github/AGENTS.md` before editing `.github/workflows/`, `.github/scripts/`, `.github/actions/`, PR follow-on automation, `workflow_run` trusted writes, CI handoff artifacts, or the workflow topology checks that guard those surfaces.

CI-related GitHub automation uses a two-layer architecture:

- Business layer workflows own product or validation decisions. `ci.yml` is the main low-privilege PR, merge-queue, and manual validation workflow. It detects scope, runs checks, and produces typed handoff artifacts.
- Atomic capability workflows own reusable trusted operations. `comment.atom.yml` publishes pure text PR comments, `autofix.atom.yml` applies same-repository patches, and `report.atom.yml` materializes advanced comments that need trusted dependencies, secrets, or report generation before upsert.

Do not add a new business-named follow-on workflow such as `foo.comment.atom.yml` or `bar.autofix.atom.yml` without first trying to express the flow as a `ci.yml` producer plus the existing `comment`, `autofix`, or `report` capability. Keep artifact naming, storage layout, and parser behavior centralized in `.github/scripts/handoff.py`; do not let individual workflows invent parallel handoff conventions.

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
- Sidecar process stamps must have exactly five fields: `app`, `mode`, `namespace`, `ipc`, and `source`.
- Orchestration layers (`tools-dev`, `tools-pack`, packaged launchers) must call package primitives; do not hand-build `--od-stamp-*` args or process-scan regexes.
- Packaged runtime paths must be namespace-scoped and independent from daemon/web ports; ports are transient transport details only.
- Default runtime files live under `<project-root>/.tmp/<source>/<namespace>/...`; POSIX IPC sockets are fixed at `/tmp/open-design/ipc/<namespace>/<app>.sock`.

## Capability exposure (UI/CLI dual-track)

Every user-facing capability must be reachable through both the web UI **and** the `od` CLI (`apps/daemon/src/cli.ts`). Shipping a feature with only one of the two surfaces is a regression.

- The CLI is the embeddability contract. External agents (hermes-agent, openclaw, custom Slack/Discord bots, packaged runtimes invoked from another shell) drive Open Design through `od` subcommands — they do not render the web UI. If a capability is UI-only, it cannot be composed into those external agents.
- Both surfaces must call the same `/api/*` endpoints; do not let the CLI talk to one shape and the UI to another. The daemon HTTP layer is the single source of truth, with `packages/contracts` carrying the shared DTOs.
- The CLI form must support `--json` for machine-readable output and accept long-form prompts via `--prompt-file <path|->`, so jobs that pipe through `xargs`, `jq`, and `<heredoc` stay clean.
- Adding a new capability is a three-step closure: HTTP endpoint in `apps/daemon/src/*-routes.ts` (with a contract type in `packages/contracts/src/api/`), UI surface in `apps/web/src/`, and `od <capability>` subcommand in `apps/daemon/src/cli.ts` registered through `SUBCOMMAND_MAP`. Land all three in the same PR; do not stage them across PRs.
- The PR template's Surface area checklist must reflect *both* surfaces. If you ticked UI, tick CLI too — and vice-versa — or explain in the PR body why the missing surface is genuinely not applicable (e.g. an internal-only daemon health probe). "I'll do the CLI later" is not a valid reason.
- Existing reference points: `od automation …` mirrors the Automations tab against `/api/routines`; `od plugin …`, `od ui …`, `od project …`, `od media …`, `od mcp …`, `od research …` follow the same shape. Copy that pattern for new capabilities.

## Git commit policy

- Git commits must not include `Co-authored-by` trailers or any other co-author metadata.

## Pull request expectations

- Opening a PR uses `.github/pull_request_template.md`; fill every section, not just the title.
- "Why" must answer both the author's use case (what made you write this PR) and the pain being addressed (user problem, technical debt, prod issue, or unblocker), not just a one-line restatement of the title.
- "What users will see" describes the change from a user's perspective — what they click, what new thing appears, what default behavior changed — not from a code perspective.
- The Surface area checklist must reflect actual surfaces touched; check every box that applies, including extension points (`skills/`, `design-systems/`, `design-templates/`, `craft/`), CLI flags, env vars, i18n keys, and new root `package.json` dependencies.
- If any UI surface is checked, attach screenshots showing the entry point — where users discover the change — not just the feature in isolation; before/after is best for behavior changes.
- For bug-fix PRs, link the red-spec test that reproduces the bug and confirm it went red on `main` and green on the branch, per the `Bug follow-up workflow` section above.
- `CONTRIBUTING.md` covers PR scope, title format, dependency policy, and the issue-first rule for non-trivial features; `docs/code-review-guidelines.md` is the reviewer-facing complement.

## Code review guide

- Use `docs/code-review-guidelines.md` as the repository-wide review standard. That document is the operational guide; this `AGENTS.md` is the source of truth when the two disagree.
- Walk reviews top-down through `docs/code-review-guidelines.md`: Product relevance test → forbidden surfaces → ownership/scope → matching lane → checklist → comments → approval bar.
- Pick the matching review lane: default code/tests, contract and protocol changes, design-system additions, skill additions, or craft additions.
- Before reviewing changes under `apps/`, `packages/`, `tools/`, or `e2e/`, read that directory's `AGENTS.md` and apply its local boundaries.
- Blocking review feedback should focus on correctness, security/secrets, data integrity, repository boundary violations, contract/migration breakage, missing required validation, or high-risk maintainability issues.
- Only maintainers may close a PR instead of requesting changes, and only when the change is not salvageable on the existing branch (wrong target product, foreign test harness, DOM/API assumptions absent from this repo, or scripts that conflict with lifecycle rules).

## PR-duty tooling

This repository no longer ships a maintainer PR-duty control plane. The former
`pnpm tools-pr` workflow has moved to the standalone `PerishCode/duty` project
so personal review-lane automation does not become product workspace
maintenance surface. Do not recreate `tools/pr`, `@open-design/tools-pr`, or a
root `pnpm tools-pr` script without a new explicit maintainer decision.

## Agent runtime conventions

- `RuntimeAgentDef.promptInputFormat` selects how the daemon writes the prompt to a child's stdin. The default `'text'` writes the composed prompt and ends stdin immediately. `'stream-json'` wraps the prompt as one JSONL `user` message and KEEPS stdin open so the daemon can stream further user messages back in mid-turn. Claude (`apps/daemon/src/runtimes/defs/claude.ts`) ships `'stream-json'` together with `--input-format stream-json` as generic mid-turn input infrastructure; the daemon closes stdin once the turn terminates cleanly. Every other agent stays on `'text'`.
- `apps/daemon/src/server.ts` tracks `run.stdinOpen` on the run object. `applyClaudeStreamJsonRunBookkeeping` closes stdin (and records `turnCompletedCleanly`) when a `turn_end` (or `usage`) event arrives with a non `tool_use` `stop_reason`. The `tool_use` stop reason means the model paused mid tool (waiting on claude-code's internal runner); closing stdin there would truncate the follow up response.
- `claude-stream.ts` emits the `turn_end` event AFTER iterating the assistant message's content blocks, not before, so the daemon sees the final `stop_reason` and every tool_use of the turn before deciding whether to close stdin.
- The host asks the user clarifying questions through the `<question-form>` artifact (see "Asking the user questions" below), NOT through a stdin-injected `tool_result`. There is no `AskUserQuestion` tool wiring, no `/api/runs/:id/tool-result` endpoint, and no host-answer return path; the stream-json input skeleton is retained only as generic infrastructure.

## Asking the user questions

- There is exactly one mechanism for clarifying user intent: the `<question-form>` markdown artifact the model emits inline. `AssistantMessage.tsx` renders `QuestionFormView` directly inside the originating assistant message, and answers flow back as the next user message (`formatFormAnswers` in `apps/web/src/artifacts/question-form.ts` → `POST /api/chat`). There is no separate Questions tab or native tool card.
- `<question-form>` is valid on ANY turn, not just turn-1 discovery. Use it for turn-1 discovery briefs AND for mid-conversation clarification (e.g. an ambiguous annotation). The system-prompt guidance lives in `apps/daemon/src/prompts/system.ts` and `discovery.ts`; the API/BYOK-mode wording is mirrored through `packages/contracts/src/prompts/system.ts`.
- `run-artifacts.ts:runAskedUserQuestion` powers the `run_finished.asked_user_question` analytics signal by scanning the run's streamed text for a `<question-form` marker (reassembled across `text_delta` chunks), not by detecting any tool call.

## Chat UI conventions

- `apps/web/src/components/file-viewer-render-mode.ts` decides URL-load vs srcDoc for HTML previews. Bridges (deck, comment/inspect selection, palette, edit, tweaks) can ONLY inject through the srcDoc path. Add a new disqualifier to `UrlLoadDecision` whenever a feature needs a srcDoc-only bridge; pass it from `FileViewer.tsx` based on a source-content heuristic where appropriate (e.g. `hasTweaksTemplate`). The host keeps both iframes mounted simultaneously and swaps CSS visibility so toggling render mode does not cause an iframe reload flash; `iframeRef.current` stays aligned with the active iframe via `useEffect`. Receive filters use `isOurIframe(ev.source)` to accept messages from either iframe but signals that should ONLY come from the active iframe (e.g. `od:tweaks-available`) re-check `ev.source === iframeRef.current?.contentWindow`.
- TodoWrite UI pins one canonical task list above the chat composer via `PinnedTodoSlot` in `ChatPane.tsx`. The slot reads the latest TodoWrite snapshot across the conversation through `latestTodoWriteInputFromMessages` (`apps/web/src/runtime/todos.ts`). `AssistantMessage.stripTodoToolGroups` removes any TodoWrite tool groups from per message rendering so there is exactly one TodoCard on screen. The progress count includes both `completed` and `in_progress` items (1/4 reads "one underway" not "zero finished"). Dismissal via the Done button is keyed on the snapshot's JSON, so a fresh TodoWrite from the agent automatically re shows the card. `PinnedTodoSlot` sits OUTSIDE the `.chat-log` scroll container, so auto-scroll requires explicit coverage: `ChatPane`'s `ResizeObserver` accepts a `containerRef` from `PinnedTodoSlot` and observes that element directly, and a pane-level `MutationObserver` (`childList: true` on the chat pane ancestor) re-syncs that observation whenever the slot mounts or unmounts as new TodoWrite snapshots arrive.
- Clarifying questions render through the `<question-form>` artifact directly inside the chat — see "Asking the user questions" above.
- Tool group rendering uses `dedupeSnapshotToolRetries` to collapse `TodoWrite` snapshots (only the most recent call survives, since each call is a state replace). `SNAPSHOT_TOOL_NAMES` lists the snapshot-style tools; non-snapshot tools pass through untouched.

## Web CSS ownership

- `apps/web/src/index.css` is an import-only cascade entrypoint. Do not add selectors or declarations there; add imports only when a truly global stylesheet is needed, and keep import order intentional.
- Shared global styles belong in `apps/web/src/styles/`: design tokens, base/reset rules, primitives, app-shell layout, and legacy cross-component selectors that cannot safely be scoped yet. Keep domain-level global files grouped by owner (for example `styles/viewer/` and `styles/workspace/`) instead of adding more large files directly under `styles/`.
- New component-owned UI styles should default to CSS Modules next to the component (`Component.module.css`) instead of expanding global stylesheets. This is preferred for isolated components, panels, menus, drawers, toolbars, cards, and form sections.
- When touching an existing component with nearby global styles, prefer migrating that component's local selectors to a CSS Module as part of the change if it is small and testable. Do not mix a large mechanical move with behavior/styling changes in the same patch.
- Keep global class names only for deliberate shared contracts: reusable primitives, theme hooks, third-party/content styling, cross-component layout, or selectors that rely on global cascade/specificity. Document any new global selector group with its owning feature.
- CSS refactors must preserve cascade semantics. For mechanical splits, verify expanded import content/order matches the previous stylesheet; for CSS Module migrations, validate the affected UI path with `pnpm --filter @open-design/web typecheck` and a focused build/test or visual check when practical.

## Web component reuse

- New `apps/web` UI should reuse shared primitives from `@open-design/components` when one exists instead of styling plain HTML elements directly. For example, use `Button` for app buttons and `VisuallyHidden` for screen-reader-only text/status content.
- Do not add new raw primitive classes such as `primary`, `primary-ghost`, `ghost`, `subtle`, `icon-btn`, or `sr-only` for new UI. Those classes are legacy compatibility surface for existing markup until it is migrated.
- If a needed primitive is missing, prefer adding a small focused primitive to `packages/components` with colocated CSS Modules, then consume it from the app. Keep product-specific layout and workflow styling in the app, not in `packages/components`.
- Keep semantic plain HTML when it is content markup or a specialized control that the shared package does not model yet; do not force a migration that would hide native behavior or make a custom widget harder to reason about.
- `apps/web` transpiles `@open-design/components` from source during dev, so component and CSS Module edits should work through the normal web dev loop without rebuilding the package.

## i18n keys

- `apps/web/src/i18n/types.ts` is the typed `Dict`; every key must be defined in all 19 locale files under `apps/web/src/i18n/locales/*.ts` (`ar`, `de`, `en`, `es-ES`, `fa`, `fr`, `hu`, `id`, `it`, `ja`, `ko`, `pl`, `pt-BR`, `ru`, `th`, `tr`, `uk`, `zh-CN`, `zh-TW`). Add the key to `types.ts` first; missing translations produce a typecheck error.

## UI animation philosophy

- Default ease-out for UI transitions: `cubic-bezier(0.23, 1, 0.32, 1)`. Built-in `ease` is too weak; `ease-in` is forbidden for UI elements because it feels sluggish.
- Asymmetric durations: enter around 200ms, exit around 140ms. Exit reads as decisive because the user has already chosen to dismiss.
- Accordion expand and collapse uses `grid-template-rows: 0fr -> 1fr` (modern auto height pattern). Pair with opacity fade and the easing above. The shared `.accordion-collapsible` + `.accordion-collapsible-inner` class pair (defined in `apps/web/src/index.css`) is the canonical implementation; reuse it for new disclosure UI.
- Never animate from `transform: scale(0)`. Start from `scale(0.9)` or higher with `opacity: 0`.
- For elements that show conditionally, keep them mounted and toggle a CSS class (e.g. `.chat-jump-btn-active`). React unmounts skip the exit transition entirely.

## Validation strategy

- After package, workspace, or command-entry changes, run `pnpm install` so workspace links and generated dist entries stay fresh.
- For agent-stream / parser changes (`apps/daemon/src/runtimes/claude-stream.ts`, `json-event-stream.ts`, `qoder-stream.ts`, etc.), replay a recorded session through the mock CLIs in `mocks/` to verify event shapes round-trip without burning provider budget. PATH-overlay activation: `export PATH="$PWD/mocks/bin:$PATH" OD_MOCKS_TRACE=<8-char-id> OD_MOCKS_NO_DELAY=1`. See `mocks/README.md` for the trace catalog and selection knobs.
- Treat every `pnpm-lock.yaml` change that affects Nix packaging as requiring a Nix pnpm deps hash refresh when you maintain the flake. `nix/pnpm-deps.nix` is a generated lock artifact; use `pnpm nix:update-hash` then re-run `nix flake check --print-build-logs --keep-going` locally. Standalone `.github/workflows/nix.yml` runs flake check when nix/lock inputs change; it is **not** part of core `ci.yml` / `Validate workspace` / merge queue. Docker image smoke/publish lives only in `.github/workflows/docker-image.yml` and is likewise outside the merge gate.
- Before marking regular work ready, run at least `pnpm guard` and `pnpm typecheck`, plus the package-scoped tests/builds that match the files changed. Do not use or add root `pnpm test`/`pnpm build` aliases.
- For local web runtime loops, prefer `pnpm tools-dev run web --daemon-port <port> --web-port <port>`.
- For e2e tests that need a tools-dev daemon/web runtime, use the shared tools-dev harness under `e2e/lib/tools-dev/` and the framework suite adapters (`e2e/lib/playwright/suite.ts`, `e2e/lib/vitest/suite.ts`). Do not hand-spawn `tools-dev` from test cases or duplicate lifecycle helpers under framework-specific folders.
- Playwright UI tests must import `test`/`expect` from `@/playwright/suite`, not directly from `@playwright/test`; type-only imports from `@playwright/test` remain fine. The suite owns one isolated tools-dev daemon/web/data root per Playwright worker. Do not add a shared-runtime fallback; set Playwright workers to `1` when constrained.
- Playwright suite code must not own workspace prebuild policy. CI and callers keep the existing prebuild steps; `tools-dev` daemon freshness checks are only a fallback guard.
- On a GUI-capable machine, validate desktop by running `pnpm tools-dev`, then `pnpm tools-dev inspect desktop status`.
- Stamp/namespace changes must validate two concurrent namespaces and run desktop `inspect eval` plus `inspect screenshot` for each namespace.
- Path/log changes must run `pnpm tools-dev logs --namespace <name> --json` and confirm log paths are under `.tmp/tools-dev/<namespace>/...`.

## Bug follow-up workflow

The following is a working playbook for routine bug follow-ups, distilled from recent practice. Treat it as a default action shape, not a contract — production reality always has edges these bullets can't anticipate, so use judgment when the situation doesn't fit cleanly.

- **Lead with a red spec.** Default to encoding the bug as a falsifiable test that goes red before any source change, so the fix is anchored in observable behavior rather than source-code intuition. If a red spec can't be written cheaply, that's usually a signal to clarify scope rather than push forward on a guess.
- **Try the cheapest layer first.** Reach for the lightest test layer that can still see the symptom (e2e Vitest at the daemon HTTP boundary → app-local Vitest → Playwright UI → platform-native harnesses), and drop down only when the cheaper layer can't.
- **Hold the spec's scope.** Defects discovered outside the bug's described boundary belong in a follow-up — their own red spec, their own PR — not in this fix. List them in the PR body's "Adjacent issues" section with the rationale and move on.
- **Let the fix read as an invariant.** Prefer a named helper whose docblock describes what must hold over a bolt-on `if` guard with apologetic history-comments. The call site should read as intent.
- **Diff against the baseline.** When neighboring suites have pre-existing failures, stash or check out upstream before claiming "no new failures."
- **Link the issue from the PR body.** Use `Fixes #N` / `Closes #N` / `Resolves #N` so the issue auto-closes on merge and the release-time reverse lookup (`gh issue view N --json closedByPullRequestsReferences` → `git tag --contains <merge sha>`) actually has a chain to follow. The repo's PR template prompts for this; deleting the prompt is fine when the PR genuinely closes nothing.
- **Stage human verification for visible bugs.** When the symptom needs an eye to confirm — UI, platform-native behavior, animations, race conditions a unit test can't see — green specs alone aren't acceptance. Stand up a buggy-vs-fix comparison the reviewer can drive themselves (typical shape: two namespaced runtimes, one on `main`, one on the fix branch), and seed any required data only through production HTTP APIs; source-level test backdoors invalidate the verification because they prove a fake flow rather than the real one.

For a worked example of one full loop (red e2e spec → fix → green), see `e2e/tests/dialog/stop-reconciles-message.test.ts` (issue #135).

# Common commands

```bash
pnpm install
pnpm nix:update-hash
pnpm tools-dev
pnpm tools-serve start updater
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
pnpm --filter @open-design/tools-serve build
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

## When is `pnpm install` required?

Run `pnpm install` after changing package manifests, workspace layout, command entrypoints, bin/link-related content, or after adding/removing workspace packages.

## Can I use Node 22 instead of Node 24?

No. `package.json#engines` specifies `node: "~24"`, which is the only supported runtime. The current lockfile pins `better-sqlite3@11.10.0`; on Windows it has no prebuilt binary for Node 24 and is built from source via node-gyp (see the Windows native section). Older Node versions are not tested and may hit lockfile or dependency incompatibilities.
