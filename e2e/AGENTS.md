# e2e/AGENTS.md

Follow the root `AGENTS.md` first. This package owns user-level end-to-end smoke tests and Playwright UI automation only.

## Directory layout

- `specs/`: highest-ROI, long-running core business capability regressions suitable for PR or release gating. Each spec should describe one nearly orthogonal product capability chain, such as main dialog generation, Pet, Orbit, or packaged runtime. Keep this layer small and expand it only when a core capability deserves always-on signal.
- `tests/`: broader user-level end-to-end coverage and local hotspot checks that intentionally span app/package/resource boundaries. Prefer adding tests here when a repeated or high-risk local capability naturally falls out of a core spec. Do not build a speculative coverage matrix before the core spec needs it.
- `ui/`: flat Playwright UI automation test files only. Keep helpers, resources, and non-Playwright harnesses out of this directory.
- `resources/`: declarative resources for e2e suites, such as Playwright UI scenario lists.
- `lib/fake-agents.ts`: shared fake local agent CLI harness used by UI and pure-inspect daemon specs.
- `lib/shared.ts`: tiny cross-suite shared helpers only.
- `lib/vitest/`: Vitest-specific atomic helpers only. Helpers describe actions such as namespace lifecycle, mock servers, HTTP calls, tools-dev commands, inspect, logs, and reports; they should not hide core business scenario decisions.
- `lib/vitest/report.ts`: the report boundary. Specs save curated output through `report.save(<relpath>, <blob>)` or `report.json(<relpath>, value)`; release workflows should consume only the final report path, not its internal file layout.
- `createSmokeSuite(...).with.*`: suite-owned lifecycle composition. Prefer this shape for namespace-bound resources such as `suite.with.toolsDev(...)` so specs keep business workflow code in the foreground.
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
pnpm typecheck
pnpm exec tsx scripts/playwright.ts clean
pnpm exec playwright test -c playwright.config.ts --list
pnpm exec playwright test -c playwright.config.ts
```

Use a specific file path when validating a single case. Do not add root e2e aliases or extra package scripts for individual cases.
