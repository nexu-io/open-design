# Directory guide

This file is the single source of truth for agents entering this repository. Read this file first; after entering `apps/`, `packages/`, `tools/`, or `e2e/`, read that layer's `AGENTS.md` for module-level details. Do not copy module details back into the root file; root stays focused on cross-repository boundaries, workflow, and commands.

## Required guidance routing

The rules below always apply. The linked documents are required instructions, not optional background. Before changing a matching area, read every named section and the closest directory-level `AGENTS.md`; more specific instructions override broader ones.

- For repository navigation, top-level ownership, inactive paths, and onboarding references, read [Core documentation index](docs/agent-guidance/repository-and-platform.md#core-documentation-index), [Workspace directories](docs/agent-guidance/repository-and-platform.md#workspace-directories), and [Inactive or placeholder directories](docs/agent-guidance/repository-and-platform.md#inactive-or-placeholder-directories).
- Before changing daemon-managed paths or storage, read [Daemon data directory contract](docs/agent-guidance/repository-and-platform.md#daemon-data-directory-contract).
- Before changing GitHub automation or CI planning, read [GitHub automation boundary](docs/agent-guidance/repository-and-platform.md#github-automation-boundary), [CI test-set orchestration guidance](docs/agent-guidance/repository-and-platform.md#ci-test-set-orchestration-guidance), `.github/AGENTS.md`, and `specs/current/ci.md`.
- Before changing releases, packaged channels, updater identity, or build-cache keys, read [Release channel model](docs/agent-guidance/repository-and-platform.md#release-channel-model), `tools/pack/AGENTS.md`, and `tools/pack/CACHE.md`.
- Before changing app/package ownership, contracts, sidecars, or user-facing capability exposure, read [Boundary constraints](docs/agent-guidance/repository-and-platform.md#boundary-constraints) and [Capability exposure](docs/agent-guidance/repository-and-platform.md#capability-exposure-uicli-dual-track).
- Before changing prompt text or prompt composition, read [Prompt variants](docs/agent-guidance/repository-and-platform.md#prompt-variants-two-implementations-one-switch) and `docs/prompt-composition.md`.
- Before starting Runs from daemon code, read [Starting a physical Run](docs/agent-guidance/repository-and-platform.md#starting-a-physical-run).
- Before changing agent input, stream parsing, or turn completion, read [Agent runtime conventions](docs/agent-guidance/runtime-and-ui.md#agent-runtime-conventions).
- Before changing clarification artifacts or analytics, chat rendering, previews, iframe bridges, task lists, CSS, shared components, i18n, or animation, read the matching section in [Runtime and UI guidance](docs/agent-guidance/runtime-and-ui.md): [questions](docs/agent-guidance/runtime-and-ui.md#asking-the-user-questions), [chat UI](docs/agent-guidance/runtime-and-ui.md#chat-ui-conventions), [CSS](docs/agent-guidance/runtime-and-ui.md#web-css-ownership), [components](docs/agent-guidance/runtime-and-ui.md#web-component-reuse), [i18n](docs/agent-guidance/runtime-and-ui.md#i18n-keys), or [animation](docs/agent-guidance/runtime-and-ui.md#ui-animation-philosophy).
- Before changing environment support, lifecycle commands, root scripts, git/PR/review policy, PR-duty automation, tests, or bug fixes, read the matching section in [Workflow and command guidance](docs/agent-guidance/workflows-and-commands.md): [environment](docs/agent-guidance/workflows-and-commands.md#environment-baseline), [Windows](docs/agent-guidance/workflows-and-commands.md#windows-native), [local lifecycle](docs/agent-guidance/workflows-and-commands.md#local-lifecycle), [root commands](docs/agent-guidance/workflows-and-commands.md#root-command-boundary), [git commits](docs/agent-guidance/workflows-and-commands.md#git-commit-policy), [pull requests](docs/agent-guidance/workflows-and-commands.md#pull-request-expectations), [reviews](docs/agent-guidance/workflows-and-commands.md#code-review-guide), [PR-duty tooling](docs/agent-guidance/workflows-and-commands.md#pr-duty-tooling), [validation](docs/agent-guidance/workflows-and-commands.md#validation-strategy), or [bug follow-up](docs/agent-guidance/workflows-and-commands.md#bug-follow-up-workflow).
- Before choosing development, validation, packaging commands, or diagnosing an onboarding issue, read [Common commands](docs/agent-guidance/workflows-and-commands.md#common-commands) and [FAQ](docs/agent-guidance/workflows-and-commands.md#faq).

## Repository-wide invariants

- Use Node `~24` and the Corepack-selected `pnpm@10.33.2`. New project-owned code defaults to TypeScript.
- Use `pnpm tools-dev` for local lifecycle. Do not add root `dev`, `start`, aggregate `build`/`test`, or e2e aliases.
- Daemon-owned data derives from the startup-resolved `RUNTIME_DATA_DIR`. Do not invent or document another active data root.
- Keep tests outside `src/`, Playwright UI tests in `e2e/ui/`, shared web/daemon DTOs in pure `packages/contracts`, and app business logic free of sidecar control-plane details.
- Every user-facing capability must ship through both the web UI and `od` CLI against the same `/api/*` contract.
- Prompt rules must cover both the legacy and OD Next implementations behind the rollout switch.
- Every physical Run must start through `internalRunCreation.start(run, analytics, starter)`.
- Clarifying questions use the inline `<question-form>` artifact. The typed dictionary has 19 locale files.
- Git commits must not include co-author metadata.
- Before marking work ready, run at least `pnpm guard` and `pnpm typecheck`, plus checks matching the changed package. Run `pnpm install` after package, workspace, command-entry, bin/link, or workspace-package changes.
