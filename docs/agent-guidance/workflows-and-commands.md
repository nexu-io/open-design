# Workflow and command guidance

This document contains required guidance moved from the root [AGENTS.md](../../AGENTS.md) so nested instruction chains fit the default loader budget. Read the matching section before using or changing repository workflows. Paths written as code are repository-root-relative.

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

## Root command boundary

- Keep root scripts reserved for true repo-level checks and tools control-plane entrypoints: `pnpm guard`, `pnpm typecheck`, `pnpm tools-dev`, `pnpm tools-pack`, and `pnpm tools-serve`.
- Do not add root aggregate `pnpm build` or `pnpm test` aliases. Build/test commands must stay package-scoped (`pnpm --filter <package> ...`) or tool-scoped (`pnpm tools-pack ...`).
- Do not add root e2e aliases; e2e package commands and ownership rules live in `e2e/AGENTS.md`.

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

## Validation strategy

- Before adding, repairing, or optimizing tests, follow
  [`docs/testing/test-efficiency.zh-CN.md`](../testing/test-efficiency.zh-CN.md)
  for completion signals, virtual-clock usage, isolation, and performance
  validation.
- After package, workspace, or command-entry changes, run `pnpm install` so workspace links and generated dist entries stay fresh.
- For agent-stream / parser changes (`apps/daemon/src/runtimes/claude-stream.ts`, `json-event-stream.ts`, `qoder-stream.ts`, etc.), replay a recorded session through the mock CLIs in `mocks/` to verify event shapes round-trip without burning provider budget. PATH-overlay activation: `export PATH="$PWD/mocks/bin:$PATH" OD_MOCKS_TRACE=<8-char-id> OD_MOCKS_NO_DELAY=1`. See `mocks/README.md` for the trace catalog and selection knobs.
- Docker image smoke/publish lives only in `.github/workflows/docker-image.yml` and is outside the core `ci.yml` / `Validate workspace` / merge queue gate.
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

Desktop queries runtime status through its sidecar client. The web URL comes from client status, not from desktop guessing ports, IPC paths, or reading web internals.

## How are sidecar-proto, sidecar, and platform split?

`@open-design/sidecar-proto` owns OpenDesign business action names and DTO/status shapes. `@open-design/sidecar` is the unique truth source for five-field argv stamps, private IPC, OS resources, process discovery, launch, invocation, and terminal lifecycle. `@open-design/platform` provides generic OS process primitives beneath sidecar and must not leak those implementation details into apps or orchestrators.

## When is `pnpm install` required?

Run `pnpm install` after changing package manifests, workspace layout, command entrypoints, bin/link-related content, or after adding/removing workspace packages.

## Can I use Node 22 instead of Node 24?

No. `package.json#engines` specifies `node: "~24"`, which is the only supported runtime. The current lockfile pins `better-sqlite3@11.10.0`; on Windows it has no prebuilt binary for Node 24 and is built from source via node-gyp (see the Windows native section). Older Node versions are not tested and may hit lockfile or dependency incompatibilities.
