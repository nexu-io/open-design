# OpenDesign repository guide

## 1. Maintaining agent guidance

- This file provides project context, repository boundaries, task entrypoints, and working methods. Read the applicable directory guides before editing their modules.
- Add root guidance only when it helps repository-wide understanding, ownership, navigation, or decisions. Cross-directory relevance alone does not justify copying a complete contract here.
- Put module implementation rules in the nearest applicable `AGENTS.md`; put cross-directory protocols and operational procedures in an owned topic document. Root indexes say **when to read** each source.
- Keep one maintained source for each detailed rule. Merge with existing guidance before adding a new document; summarize and link rather than repeat it at every layer.
- Distinguish required boundaries from default methods and conditional procedures. Identify the audience: repository contributors, product agents, and product users need different instructions.
- When behavior changes, replace obsolete guidance instead of preserving the implementation history. Use file paths and symbol names rather than source line numbers; update incoming links when moving content.
- Review guidance changes for correctness, ownership, duplication, and reading cost. Preserve useful constraints when moving them; keep decision history in PRs/issues or design records.

## 2. Project core

OpenDesign is a collaborative AI design workspace. Users start from a brief, combine an agent runtime with design templates, skills, and design systems, then preview, share, and refine artifacts in the same project. Local coding-agent CLIs and configured BYOK runtimes are supported; resources remain inspectable and extensible.

The web app owns presentation and interaction. The local privileged daemon owns HTTP/SSE APIs, agent execution, persistence, and artifacts. Electron hosts the same product; packaged and terminal carriers consume shared runtime contracts rather than creating separate product implementations.

Required cross-repository boundaries:

- Keep app-private implementations private. Apps must not import another app's `src/` or `tests/`; promote shared behavior to an owned package or use the public API.
- Put shared web/daemon DTOs, SSE unions, errors, and task shapes in `packages/contracts` before wiring consumers. Keep contracts pure TypeScript, without framework, filesystem/process, browser, SQLite, daemon-private, or sidecar control-plane dependencies.
- Keep sidecar awareness at app sidecar entries and orchestration boundaries. Business logic must not assemble process identities, discover IPC paths, or scan processes.
- Resolve daemon data once and propagate that root to consumers and subprocesses; follow [daemon storage](apps/daemon/AGENTS.md#data-ownership). Keep packaged runtime/data/log/cache paths namespace-scoped and independent of ports.
- User-facing capabilities ship through both web UI and `od` CLI against the same daemon API in the same PR. CLI output supports `--json`, and long prompt inputs support `--prompt-file <path|->` where relevant. Document genuinely inapplicable surfaces; do not defer parity as follow-up work.
- Use TypeScript for project-owned source, scripts, tests, reporters, and configs. Generated/vendor/compatibility JavaScript requires an explicit reason accepted by `pnpm guard`.

## 3. Directory conventions

Workspace membership comes from `pnpm-workspace.yaml`. Choose the owner before adding code:

| Directory | Responsibility and local guidance |
| --- | --- |
| `apps/` | Product applications; start with [apps/AGENTS.md](apps/AGENTS.md). |
| `apps/web/` | Next.js UI, presentation state, previews, and app styling; [web guide](apps/web/AGENTS.md). |
| `apps/daemon/` | Privileged local capabilities, HTTP/SSE, `od`, persistence, and agent spawning; [daemon guide](apps/daemon/AGENTS.md). |
| `apps/desktop/`, `apps/packaged/` | Electron host and thin packaged sidecar/protocol entry; app boundaries live in the apps guide. |
| `apps/closure/` | Independently distributable Closure content; [Closure guide](apps/closure/AGENTS.md). |
| `packages/` | Shared contracts and reusable primitives; [package ownership](packages/AGENTS.md). |
| `shells/` | Distribution carriers consuming standalone contracts; [shell guide](shells/AGENTS.md). |
| `tools/` | Development, packaging, fixture services, and release control planes; [tools guide](tools/AGENTS.md). |
| `e2e/` | User-level cross-boundary coverage and Playwright UI automation; [test ownership](e2e/AGENTS.md). |
| `.github/` | Workflows and workflow-owned scripts/contracts; [automation guide](.github/AGENTS.md). |
| `skills/`, `design-templates/` | Functional capabilities and rendering catalogues respectively; read their [skill](skills/AGENTS.md) or [template](design-templates/AGENTS.md) guide. |
| `design-systems/`, `craft/`, `plugins/` | Brand systems, opt-in universal craft, and portable plugins; see [resource indexes](#4-core-file-index). |
| `mocks/` | Recorded CLI replay fixtures and PATH overlays; [replay guide](mocks/README.md). |

Package/app/tool tests belong in `tests/` beside `src/`; keep `src/` source-only. Playwright UI tests belong in `e2e/ui/`. Cross-app/resource consistency checks belong in `e2e/tests/` when they observe multiple ownership boundaries. Root `scripts/` behavior tests live in `e2e/tests/scripts/`.

Keep local runtime data, `.tmp/`, reports, and scratch out of Git. Do not restore removed `apps/nextjs`, `apps/landing-page`, or `packages/shared`. Maintainer PR-duty tooling lives outside this product repository; see [tools guide](tools/AGENTS.md).

## 4. Core file index

Read the entry matching the task; follow its local references for implementation details.

| Task | Entry |
| --- | --- |
| Understand product and set up development | [README.md](README.md), [QUICKSTART.md](QUICKSTART.md), [CONTRIBUTING.md](CONTRIBUTING.md); native Windows: [troubleshooting](docs/windows-troubleshooting.md). |
| Review code or prepare a PR | [review guide](docs/code-review-guidelines.md), [PR template](.github/pull_request_template.md), [contribution policy](CONTRIBUTING.md#commits--pull-requests). |
| Change API/resource or runtime architecture | [app boundaries](apps/AGENTS.md), [contracts](packages/AGENTS.md). |
| Change data paths, persistence, or deployment storage | [daemon data ownership](apps/daemon/AGENTS.md#data-ownership), [storage configuration](QUICKSTART.md#persistent-storage); implementation starts at `resolveDataDir` in `apps/daemon/src/daemon-paths.ts`. |
| Change web UI, styles, animation, localization, or chat | [web guide](apps/web/AGENTS.md); chat work also follows [chat guide](apps/web/src/components/chat/AGENTS.md) and affected behavior tests. |
| Change prompt text in daemon, contracts, or official scenario assets | [prompt composition](apps/daemon/src/prompts/AGENTS.md). Product-agent instructions and repository-maintenance instructions have separate audiences. |
| Change runtime streams, parser behavior, or physical Runs | [daemon guide](apps/daemon/AGENTS.md), [runtime guide](apps/daemon/src/runtimes/AGENTS.md). |
| Change CI scope, omission, or workflow topology | [.github guide](.github/AGENTS.md), [scope routing and omission](.github/AGENTS.md#scope-routing-and-omission). |
| Change packaging, updater, cache keys, or release channels | [pack guide](tools/pack/AGENTS.md), [cache contract](tools/pack/CACHE.md), [release guide](tools/release/README.md). |
| Add or change extension resources | [skills protocol](docs/skills-protocol.md), [template ownership](design-templates/AGENTS.md), [design systems](design-systems/README.md), [craft](craft/README.md), [plugins](plugins/AGENTS.md). |
| Add, repair, or optimize tests | [test efficiency](e2e/AGENTS.md#test-efficiency-and-determinism), then the owning package guide; cross-boundary/UI coverage follows [e2e guide](e2e/AGENTS.md). |

## 5. Repository working methods

### Bug follow-up workflow

These are default methods; choose evidence and effort appropriate to the symptom and risk.

1. Establish an observable failure or reproduction before changing behavior. Prefer a regression test that fails before the fix and passes after it. When automation is impractical or disproportionate, record the reason and use concrete manual, replay, log, or comparison evidence.
2. Choose the narrowest layer that can observe the symptom. A difficult test seam does not by itself mean the requirement needs clarification; investigate the seam or choose another verification method.
3. Keep the fix scoped to the reported behavior. Track unrelated defects separately and explain material adjacent findings in the PR.
4. Express the invariant clearly in the implementation. Compare against the baseline before claiming a neighboring failure is pre-existing; use a separate checkout/worktree so existing work is preserved.
5. Recheck the original symptom. For visible/platform-specific behavior, include suitable visual or native-runtime evidence; a runnable before/after comparison is useful when it materially improves confidence. Use real product entrypoints for manual acceptance data.

### Validation and common commands

Use Node `~24` and the pnpm version pinned by `package.json` through Corepack. Run `pnpm install` after package manifests, workspace layout, bins, or command entrypoints change.

```bash
pnpm install
pnpm tools-dev                         # local daemon + web + desktop lifecycle
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev stop
pnpm guard
pnpm typecheck
pnpm --filter <owning-package> <command>
```

- Use `pnpm tools-dev` for all local development lifecycle operations. Do not add root `dev`, `dev:all`, `daemon`, `preview`, or `start` aliases. Tool control-plane commands stay at root; build/test commands stay package- or tool-scoped. Do not add aggregate root `build`, `test`, or e2e aliases.
- Run focused tests for changed files and affected boundaries. Do not run full daemon/web suites locally unless the user requests them; full suites run in PR CI. Run `pnpm guard` and `pnpm typecheck` before publication, plus the checks appropriate to the change. Investigate failing CI lanes and rerun relevant focused checks.
- Desktop/namespace/log validation procedures and package commands live in [tools guidance](tools/AGENTS.md); updater and packaged smoke procedures live in the [pack guide](tools/pack/AGENTS.md).

### Delivery and review

Follow [CONTRIBUTING.md](CONTRIBUTING.md#commits--pull-requests) and the PR template. Team PR titles retain a verified scope-matching Plane prefix. Fill applicable sections, explain the use case and pain, describe user-visible behavior, and report actual validation and limits. Link closing issues with `Fixes`/`Closes`/`Resolves` when appropriate. Git commits must not include co-author metadata.

Use [docs/code-review-guidelines.md](docs/code-review-guidelines.md) for review priorities, lanes, approval, and emergency-bypass policy. Review guidance changes for audience and placement as well as correctness; a locally useful fact does not automatically belong in this root guide.
