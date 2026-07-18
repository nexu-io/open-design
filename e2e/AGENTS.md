# e2e/AGENTS.md

Follow the root `AGENTS.md` first. This package owns user-level end-to-end smoke tests and Playwright UI automation only.

For the current coverage posture, recent hardening work, grouped-run status, and known intentional gaps, see [`docs/testing/e2e-coverage/status.md`](../docs/testing/e2e-coverage/status.md).

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
