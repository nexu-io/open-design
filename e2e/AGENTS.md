# e2e/AGENTS.md

Follow the root `AGENTS.md` first. This package owns user-level end-to-end smoke tests and Playwright UI automation only.

For the current coverage posture, recent hardening work, grouped-run status, and known intentional gaps, see [`docs/testing/e2e-coverage/status.md`](../docs/testing/e2e-coverage/status.md). For the invariants new and repaired UI tests must hold under the sharded full pool, see [UI test stability rules](#ui-test-stability-rules) below.

## Directory layout

- `specs/`: highest-ROI, long-running core business capability regressions suitable for PR or release gating. Each spec should describe one nearly orthogonal product capability chain, such as main dialog generation, Pet, Orbit, or packaged runtime. Keep this layer small and expand it only when a core capability deserves always-on signal.
- `tests/`: broader user-level end-to-end coverage and local hotspot checks that intentionally span app/package/resource boundaries. Prefer adding tests here when a repeated or high-risk local capability naturally falls out of a core spec. Do not build a speculative coverage matrix before the core spec needs it.
- `tests/scripts/`: behavior-contract coverage for root operational scripts whose regressions affect install, CI, or release flows. Keep fixtures hermetic and runnable through e2e Vitest; do not put `*.test.ts` siblings directly under root `scripts/`.
- `ui/`: flat Playwright UI automation test files only. Keep helpers, resources, and non-Playwright harnesses out of this directory.
- `resources/`: declarative resources for e2e suites, such as Playwright UI scenario lists.
- `lib/fake-agents.ts`: shared fake local agent CLI harness used by UI and pure-inspect daemon specs.
- `lib/timeouts.ts`: CI-scaled timeout constants (`T.short`, `T.medium`, `T.long`, `T.xlong`). Import as `{ T }` from `@/timeouts`. Use these instead of hardcoded millisecond values in UI tests.
- `lib/tools-dev/`: framework-neutral tools-dev runtime lifecycle. It owns namespace/path construction, port reservation, `tools-dev ... --json` execution, status/log/check reads, URL construction, and start/stop semantics. It must not import Vitest or Playwright.
- `lib/playwright/suite.ts`: Playwright-only suite assembly. It provides the worker-scoped tools-dev fixture, dynamic `baseURL`, and failure attachments. UI tests import `test`/`expect` from `@/playwright/suite`.
- `lib/vitest/suite.ts`: Vitest-only suite assembly. It composes the neutral tools-dev runtime with report creation, scratch preservation, and Vitest assertions for non-UI smoke suites.
- `lib/playwright/mock-factory.ts`: shared Playwright mock helpers. `applyStandardMocks(page)` seeds localStorage and intercepts `/api/agents` and `/api/app-config` with standard daemon/mock-agent fixtures. Use in `beforeEach` for tests that do not need a custom agent or protocol setup.
- `lib/vitest/`: Vitest-specific atomic helpers only. Helpers describe actions such as mock servers, HTTP calls, and reports; tools-dev lifecycle belongs in `lib/tools-dev/` and is only composed through `lib/vitest/suite.ts`.
- `lib/vitest/report.ts`: the report boundary. Specs save curated output through `report.save(<relpath>, <blob>)` or `report.json(<relpath>, value)`; release workflows should consume only the final report path, not its internal file layout.
- `createSmokeSuite(...).with.*`: suite-owned lifecycle composition from `@/vitest/suite`. Prefer this shape for namespace-bound resources such as `suite.with.toolsDev(...)` so specs keep business workflow code in the foreground.
- Temporary e2e Vitest env/PATH mutations, AMR fake endpoint URLs, and packaged smoke default namespaces belong behind `@/vitest/suite` helpers such as `suite.with.env(...)`, `suite.with.pathEntry(...)`, `suite.amr`, and `resolvePackagedSmokeNamespace(...)`. Do not hand-roll save/restore blocks or fixed localhost ports in individual specs.
- `lib/playwright/`: Playwright-specific fixtures, resource accessors, route helpers, and UI actions.
- `scripts/playwright.ts`: Playwright auxiliary subcommands such as artifact cleanup; it must not wrap `playwright test`.

## Spec and test model

- Start from `specs/`: define orthogonal long-form core capabilities first, then let supporting `tests/` and `lib/` grow from those chains.
- `specs/` should read as business/system workflows, for example `dialog/main.spec.ts`, `orbit/run.spec.ts`, or `pet/main.spec.ts`.
- `tests/` should pin reusable local hotspots, such as `tools-dev/inspect.test.ts`, provider mocks, report lifecycle, artifact file shape, or namespace cleanup.
- High-confidence infrastructure checks may be added to `tests/` before a full core spec exists, but most tests should be extracted only after a spec proves the local hotspot matters.
- Treat `tests/` as maintainable support material, not permanent coverage inventory. Merge, split, shrink, or delete tests as product capabilities evolve.
- Keep new non-UI e2e smoke chains pure inspect by default. Do not use Playwright for these chains; use daemon/web APIs, sidecar IPC, tools-dev/tools-pack inspect, logs, reports, and screenshots when available.
- External service dependencies must use temporary server-level mocks. Do not rely on real API keys, real provider accounts, or UI-level route patching for core e2e smoke.
- Every atomic suite must run in an isolated namespace. Successful suites should keep only curated reports and high-value artifacts, then clean process/runtime scratch. Failed suites should preserve runtime scratch, logs, mock requests, screenshots, and report pointers for diagnosis.

## UI test stability rules

These invariants complement the coverage posture in
[`docs/testing/e2e-coverage/status.md`](../docs/testing/e2e-coverage/status.md);
this section is the source of truth for how a UI test must be written to stay
green under the sharded full pool.

The `ui-extended-main` full pool (`workflow_dispatch` with `suite=full`)
executes every non-visual functional shade in one generically sharded matrix
(`visual-*.test.ts` is excluded by the config's `testIgnore` and runs in its
own lane): arbitrary P0/P1/P2 interleavings, contiguous shard slices that
start mid-file, an isolated tools-dev runtime per Playwright worker
(`nproc / 2`, so two on the `ui_hot` runner) with
`OD_PLAYWRIGHT_FULLY_PARALLEL=1`, and slow CI runners. It is the only lane
that runs the whole non-visual `ui` suite together — every P1/P2 shade, plus
the P0 cases no merge lane covers: `ci.yml`'s `ui_p0` runs only the files
listed in a `uiP0Groups` group, and `playwright_critical` only its own
`@critical` file matrix, so a `[P0]`/`@critical` tag does not enroll a new
file (the P0 cases in `automations-page.test.ts` and `home-hero-rail.test.ts`,
for instance, run nowhere but the full pool). Two order hazards then hide from
narrower runs: within-file interleaving (the tests of one file racing under
fully-parallel workers) and cross-file carry-over (the worker-scoped tools-dev
runtime — `suite.ts`, `scope: 'worker'` — retaining daemon/config/project
state between the files a worker runs in sequence). Merge lanes touch each in
part — `playwright_critical` runs fully-parallel, `ui_p0`'s single-worker
multi-file groups accumulate carry-over — but only the full pool exercises the
whole suite interleaved with mid-file shards, so treat it as the acceptance
gate. New and repaired UI tests must hold the following invariants.

- **Order independence is the contract.** Each test performs its own complete
  setup — whatever that file's model requires — and never relies on a
  predecessor's side effects; any contiguous subset of the suite must pass
  with the rest absent. There is no universal setup list, and the axis that
  matters is test-scoped browser mocks versus worker-scoped daemon state: the
  daemon/data root is shared across a worker's tests (`suite.ts`), while
  localStorage seeds and `applyStandardMocks` route interception are per-test.
  Real-daemon specs reset config and create real projects; entry-surface
  specs route-mock the same endpoints and may also create real daemon
  projects. Match the file's existing model rather than adding route stubs a
  core smoke chain forbids. Do not add
  `test.describe.configure({ mode: 'serial' })`: a serial group is atomic
  within one shard (it cannot be split across the matrix) and adds
  skip-after-failure, which floors the pool's wall time. Running a file's
  standalone halves — `--shard=1/2` and `--shard=2/2` with
  `OD_PLAYWRIGHT_FULLY_PARALLEL=1` — checks within-file split-independence, but
  each is a fresh process, so it cannot expose the cross-file, same-worker
  carry-over above; run the whole `ui` folder (one worker runtime spans the
  files) to surface that, or the full pool, which additionally stresses it
  with fully-parallel mid-file shards.
- **Treat a retry-only pass as a signal, not flake.** CI retries a failed
  functional test once (the visual config sets `retries: 0`), and the retry
  runs after the Playwright worker restarts with a fresh tools-dev runtime — so a first attempt that failed on a dirty
  predecessor state can pass on the clean retry and leave the run green. A
  test that only ever fails on its first attempt is telling you something: it
  may be carried-over predecessor state, worker-startup instability, or an
  in-test async-readiness race (the settle and readiness rules below). Don't
  wave it through — reproduce it locally (CI keeps only the failed roots' paths
  and the retry's trace, not the failed attempt's runtime) and fix the
  actual cause.
- **Settle async surfaces before interacting.** Late-resolving fetches
  re-render the home surface and a remount silently resets transient UI
  state: the projects list can remount the templates reveal container. Arm a
  best-effort response waiter before the navigation or reload that triggers the
  fetch (entry-chrome-flows's `gotoEntryHome` waits on `/api/projects`, but
  swallows its own timeout, so it only narrows the race — and the many other
  same-named helpers do not arm it at all). The load-bearing half is requiring
  the observed state to survive a settle window rather than trusting the first
  observation, as `revealHomeTemplates` does by retrying on reveal regression.
- **An enabled control is not a ready control.** A precondition that arrives
  over a stream is a distinct gate from a remount reset. Agents load through an
  incremental `/api/agents` SSE stream, and a BYOK-OpenCode run checks that
  agent's availability before it will POST: until the stream publishes,
  `ProjectView` rejects the submit with a visible unavailable error instead of
  creating a run — even though `chat-send` already reports enabled and the fake
  runtime env makes availability possible. This pre-POST check is
  BYOK-OpenCode-specific, not a universal composer invariant, but the pattern
  generalizes: when a control's readiness depends on a streamed precondition,
  wait for that signal — ideally a side-effect-free one — rather than for
  `toBeEnabled`. The BYOK spec in `ui/real-daemon-run.test.ts` instead retries
  the submit itself until the stream catches up (its `sendPrompt` reports
  whether a create-run request was issued at all); that is safe only because
  its oracle tolerates the repeated rejected attempts, and a submit that
  persisted state on each try would need an idempotent oracle or a
  non-mutating readiness wait.
- **Never force-click into gated containers.** An `inert` container swallows
  force-clicks with no error, and `isVisible()` is true for content inside a
  collapsed reveal container. Route gallery interactions through the
  reveal-aware helpers and treat actionability (hit-target), not visibility,
  as the readiness signal.
- **Hermetic dependencies only.** CI runners have no host binaries and no
  provider accounts, so agent availability must come from the harness, by one
  of two mechanisms. Route-mocked specs intercept `/api/agents` with
  `routeAgents` / `fulfillAgentsRoute` (via `applyStandardMocks`); that mock
  must serve both the JSON and the `?stream=1` SSE shape including the
  terminal `done` event — without it the streamed availability lands
  transiently and is then cleared when the client rejects the incomplete
  stream.
  Real-daemon specs instead run a fake CLI through `createFakeAgentRuntimes` +
  `agentCliEnv` — and daemon detection resolves `byok-opencode` through the
  `opencode` agent's env. A spec that only passes where a real CLI happens to
  be installed is broken.
- **Oracles assert the running product's observable behavior.** When a spec
  goes stale, realign it against the current product, not the spec's own
  history. A merged product PR is not proof its oracle is verified: what runs
  on the merge path is governed by registration, not priority tag — the
  `ui_p0` group files and the `@merge-extra` P1 subset (`playwright_critical`
  is a mutually-exclusive PR fallback — `run_playwright_critical` is
  `&& !runUiP0` — so `@critical` does not add coverage on the merge queue). A
  non-visual P1 case outside those also runs in the manual `p0p1` lane; a
  non-visual P2 case, or a P0 case in a file no group lists, runs only in the
  full pool (visual tests have their own lane). Confirm a realigned oracle in
  the lane that actually executes it, not by the PR merging.
- **Name your failure causes.** A long wait should fail with a diagnosis, not
  an opaque timeout. `sendPrompt` in `ui/real-daemon-run.test.ts` tracks
  whether the create-run request was ever issued, so its failure separates "no
  request left the page" (a composer/overlay gate) from "no accepted response
  arrived" — enough to point at the right layer in a CI-only reproduction.
  Assert gate preconditions explicitly for the same reason. A hang is usually a
  missing gate, not a too-short budget — diagnose the state the wait targets
  before raising it.

## Naming and tools

- `specs/` files must be `*.spec.ts`; `tests/` files must be `*.test.ts`.
- Prefer directory hierarchy over long file names. Basenames should normally be three words or fewer, such as `main.spec.ts`, `run.spec.ts`, `inspect.test.ts`, or `report.test.ts`.
- `ui/` files must be flat `*.test.ts` Playwright tests. Do not add subdirectories, TSX, Vitest, jsdom, Testing Library, or React harness tests under `ui/`.
- `ui/` tests must import runtime-bound `test`/`expect` from `@/playwright/suite`; use `@playwright/test` only for type imports or low-level helper modules that do not own test lifecycle.
- E2E Vitest tests use Node APIs; do not add JSX/TSX, jsdom, or browser-component tests under `specs/` or `tests/`.
- Web component/runtime tests belong in `apps/web/tests/`, not `e2e/ui/`.
- E2E tests may validate cross-app/resource consistency, but must not treat one app's private implementation as a shared helper for another app. Keep test-only helpers local to `e2e/lib/` or promote reusable logic to a pure package such as `packages/contracts`.
- E2E imports may use `@/*` for `lib/*`; keep this alias local to the e2e package.

## Commands

Run commands from this directory:

```bash
pnpm test specs/mac.spec.ts
pnpm test tests/tools-dev/inspect.test.ts
pnpm test specs
pnpm test tests
pnpm test:p0
pnpm test:p0p1
pnpm test:ui:p0
pnpm test:ui:p0p1
pnpm typecheck
pnpm exec tsx scripts/playwright.ts clean
pnpm exec playwright test -c playwright.config.ts --list
pnpm exec playwright test -c playwright.config.ts
```

Use a specific file path when validating a single case. Do not add root e2e aliases or extra package scripts for individual cases.

Case-level priority tags use test-name prefixes: `[P0]`, `[P1]`, `[P2]`.

Playwright UI runs use one tools-dev daemon/web/data root per Playwright worker. The single-worker fallback is `--workers=1` (or `OD_PLAYWRIGHT_WORKERS=1`); do not reintroduce a shared daemon/web runtime mode.
