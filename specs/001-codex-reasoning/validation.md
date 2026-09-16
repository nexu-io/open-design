# Validation and completion

Upstream target: `nexu-io/open-design:main` / `c5ae6292c`.
Node 24.11.1, Corepack pnpm 10.33.2. The implementation was initially validated
against the workspace fork baseline `2dfb3b9aa`, then adapted and revalidated
against upstream before submission.

## Spec Kit analysis

The specify → clarify → plan → tasks → analyze → implement sequence covers all
eight requirements. Root/module AGENTS.md remains the constitution. No Spec Kit
commands or hooks are installed, so the official command sequence was followed
using the reviewable documents in this directory.

| Requirement | Tasks | Evidence |
| --- | --- | --- |
| FR-001–003 | T002–004 | Catalogue parser fixtures, real installed catalogue |
| FR-004 | T005 | Inline/avatar/settings tests and browser screenshots |
| FR-005 | T006 | Preference reconciliation, model switch and reload |
| FR-006 | T007–008 | Production HTTP and actual executable fixture argv |
| FR-007 | T009–010 | CLI file/stdin, existing MCP run/workspace behavior |
| FR-008 | T002, T007–008 | Legacy/malformed/custom/empty metadata and clamp tests |

Coverage: 8/8 requirements. Upstream's service-tier, workspace-scoping, MCP
idempotency and redesign implementations are preserved. Fresh discovery and strict
reasoning validation apply to Codex; other runtimes keep their existing behavior.

## Red specification

Four catalogue/clamp tests from
`apps/daemon/tests/runtimes/reasoning.test.ts` were run in a detached worktree at
upstream `c5ae6292c` against the unchanged upstream Codex implementation. All four
failed, demonstrating missing model metadata and the stale GPT-5.6 minimal clamp.
The same assertions pass on this branch.

The original fork-baseline work also recorded red picker, CLI and MCP tests before
implementation. Local logs are in `.context/reasoning-5402/red-*.log`; the upstream
reproduction is in `.context/reasoning-5402/upstream-red.log`.

## Passing checks

- `pnpm install --frozen-lockfile`; no lockfile changes relative to upstream.
- `pnpm guard` and workspace `pnpm typecheck`.
- `pnpm --filter @open-design/daemon build`.
- `pnpm --filter @open-design/web build`.
- Daemon runtime/CLI/MCP suite: 1,044 passed, two existing skips.
- Web picker/preferences/settings suite: 154 passed; final picker/preferences
  rerun including BYOK isolation: six passed.
- Adjacent web model selection/App suite: 91 passed.
- Daemon connection/chat/reasoning suite: 242 passed.
- HTTP e2e and Playwright UI: one passed each.

Commands:

```sh
pnpm --filter @open-design/daemon test tests/runtimes tests/run-reasoning-cli.test.ts tests/mcp-run-reasoning.test.ts tests/mcp-runs.test.ts
pnpm --filter @open-design/web test tests/components/model-reasoning.test.tsx tests/runtime/agent-reasoning.test.ts tests/components/SettingsDialog.execution.test.tsx
pnpm --filter @open-design/daemon test tests/runtimes/reasoning.test.ts tests/connection-test.test.ts tests/chat-route.test.ts
pnpm --filter @open-design/web test tests/components/InlineModelSwitcher.test.tsx tests/components/InlineModelSwitcher.compact-model-click.test.tsx tests/components/AvatarMenu.test.tsx tests/components/agentModelSelection.test.ts tests/App.test.ts
pnpm --dir e2e test tests/codex/reasoning.test.ts
pnpm --dir e2e exec playwright test -c playwright.config.ts codex-reasoning.test.ts --workers=1
```

## Execution and visual evidence

The HTTP test starts an isolated tools-dev namespace and configures an executable
fixture through production `/api/app-config`. Without a preceding model-picker
request, an Astra run forwards `model_reasoning_effort="deep-v2"` to the child.
GPT-5.5/ultra fails without spawning that model. A Sol/max connection test forwards
the requested effort; GPT-5.5/ultra reports `invalid_reasoning`.

The browser test uses the repository worker-runtime fixture and production HTTP
configuration. It opens the current home model picker with Astra/Ultra, switches
to GPT-5.5, waits for the configuration PUT to succeed, then verifies Default
survives reload. Screenshots capture the entry point and were visually inspected:

- [Astra/Ultra in the home picker](images/astra-reasoning.png)
- [Unsupported selection reconciled to Default](images/model-switch-default.png)

The installed Codex CLI 0.153.4 advertises low/medium/high/xhigh/max/ultra for
GPT-5.6 Sol and GPT-6 Astra, with defaults low and medium respectively. The requester
manually accepted the original fork-baseline implementation on 2026-09-07; the
screenshots and automated results above reflect the newer upstream implementation.
No paid model generation or user-global Codex configuration change was required.

## Compatibility limits

Old CLIs, unknown custom models and unusable metadata retain the compatibility
fallback. Explicit empty model capabilities stay authoritative. Default delegates
to CLI configuration; the advertised default is descriptive metadata, not a forced
override. Existing non-Codex picker defaults and runtime validation remain intact.
