# 0002. Frontend vertical-slice decomposition for large `apps/web` components

## Status

Proposed (tracking: [#5201](https://github.com/nexu-io/open-design/issues/5201))

## Context

Several `apps/web` component files have grown into god-components that are hard to test and change: `SettingsDialog.tsx` (~8,500 lines; ~30 `useState` in its main component), `FileViewer.tsx` (~12.8k), `ProjectView.tsx` (~8.7k), `ChatComposer.tsx` (~5,555 lines, 48 `useState`), and `MemorySection.tsx` (~2,636 lines — a single ~1,900-line function with 39 `useState`). Some also leak into accidental utility modules (other files import runtime helpers out of `SettingsDialog.tsx`).

The root problem is not file length; it is **state that leaked upward**. Section-scoped state (e.g. a settings section's BYOK/provider/AMR state) piled into the parent because the section was never given its own home. `MemorySection` demonstrates that extraction *alone* is cosmetic: it was pulled into its own file and is still a monolith, because the JSX moved but the state was never decomposed.

This repo is already coarsely layered — `packages/contracts/src/api/` holds wire DTOs shared web↔daemon, `apps/web/src/providers/` holds transport adapters, `apps/web/src/features/` exists as an (empty) app-local home — and boundaries are enforced by hand-rolled guard scripts wired into `pnpm guard`. The decomposition should extend those existing seams, not import a new framework. Repository boundary rules (test placement, contracts purity, cross-app import limits) live in `AGENTS.md`; this ADR MUST NOT restate them.

## Decision

Decompose large `apps/web` components using **vertical slicing** — one `features/<capability>/` folder owns everything for a capability — mapped onto four homes:

1. **Wire DTOs and SSE event unions → `packages/contracts/src/api/`.** Never redeclared in a slice; the daemon is a proven second consumer, so a slice-local copy would drift.
2. **Transport adapters (`fetch`, `EventSource`/SSE, OAuth browser bridges) → `apps/web/src/providers/`.** Placed here where there is a real multi-consumer seam (e.g. `/api/memory` is fetched from ~6 components, `/api/mcp/install-info` from 2). A single-adapter resource is a flat `providers/<resource>.ts`; a multi-adapter resource is a folder `providers/<resource>/` with one `index.ts` barrel.
3. **Ports, pure rules, UI-only types, state hooks, components → `apps/web/src/features/<slice>/`.** The slice owns its **port** (`ports.ts`) — the interface it depends on — and reaches transport only through a small `dependencies.ts` that binds a provider to that port. Pure/feature files may not import `providers/` directly, and slices may not import another slice's internals.
4. **Tests → `apps/web/tests/features/<slice>/`** (source stays source-only, per `AGENTS.md`).

Barrels mark boundaries, not folders: an `index.ts` exists at the slice root (public API), at a multi-adapter `providers/<resource>/`, and at a sub-slice boundary (e.g. `features/memory/connectors/`); `hooks/` and `components/` use direct relative imports and get no barrel.

Hooks are **feature-local and component-specific; there is no shared or app-level hook layer.** When two slices need similar logic, each owns its own hook rather than importing a shared one — reuse is explicitly not a goal, because slices tend to need highly specific behavior and duplicated wiring is cheap to write and safe to let diverge. The sharing rule is **asymmetric by intent**: share only what *correctness* requires — wire DTOs (where divergence is a wire break) and transport adapters (where divergence is a retry/auth bug) — and duplicate what is mere convenience, since a hook is just the composition of an injected port and pure rules. Components stay presentational: props in, JSX out, no state/logic/constants/fetch, so they test by rendering with props and asserting output.

Cross-cutting shell state (e.g. `SettingsConfigProvider` for `cfg`/autosave) is lifted into a context so sections stop prop-drilling. No server-state cache library (TanStack Query/SWR) is introduced; existing caching stays hand-rolled and behavior-preserving.

Rollout is **behavior-preserving and file-by-file**, not a repo-wide migration. Each PR takes **one god-component and makes it internally sane in a single complete pass** — all of that file's seams (wire DTOs → `contracts`, transport → a provider home, pure rules, feature-local hooks in `*.hooks.ts`, and a split into dumb sub-components) land together, because they are one coherent refactor of one file and are cheaper to review as a whole than as an artificially fragmented sequence. The bound is the file, not the seam: a canary PR must **not** sprawl outward into unrelated cleanup (broad `SettingsDialog` work, repo-wide framework reshaping, or new abstractions the slice does not yet need). `MemorySection` is the first canary (self-contained, single consumer, existing test), and its PR body calls out each seam — ports, providers, hooks, sub-components, rules — so reviewers see the refactor shape up front. Boundaries are checked by a hand-rolled, best-effort static-analysis guard added to `pnpm guard` (no `fetch`/`EventSource`/`window`/`localStorage` in feature or pure files; one transport home per route; a slice's internals are reachable only through its root `index.ts` barrel — this holds for cross-slice imports **and** for the orchestrator and any other file outside `features/**`, so the boundary a slice publishes is the boundary every consumer sees); orphaned provider exports are swept by `ts-prune`. This guard is not an adversarial security boundary — see its own header comment (`scripts/check-web-slice-boundaries.ts`) for the exact scope statement. It is hardened against realistic, non-adversarial gaps as they're found; a newly-discovered theoretical bypass is a follow-up to extend the guard, not a blocking finding against a PR that isn't the one introducing or exploiting it.

## Alternatives considered

- **Adapters in-slice, promoted on a second consumer.** More self-contained for single-consumer endpoints, but these endpoints are already multi-consumer, so an in-slice adapter forces other consumers to reach into the slice or duplicate the `fetch` (drift on retry/error/auth). A hand-rolled guard cannot detect a freshly-authored duplicate `fetch` in another slice. Rejected for shared endpoints; the slice keeps self-containment at the port layer instead.
- **Full Feature-Sliced Design** (`app`/`pages`/`widgets` layers + `steiger` linter). The `app`/`pages` layer names collide with the Next.js App Router's reserved `app/`, and the linter duplicates this repo's hand-rolled guards. Adopt the vertical-slice *principle*, not the branded taxonomy.
- **Colocated `components/settings/{lib,hooks}/`** (nest everything under `components/`). Smallest diff, but names a folder for components while it holds logic/state, and ignores the `contracts`/`providers` seams that already exist.
- **A shared / app-level hook layer for cross-slice logic.** Rejected: it reintroduces cross-slice coupling and "semi-global" hooks. Slices need specific behavior, duplicated wiring is cheap and safe to diverge, and pure rules (the only correctness-bearing part) can still be shared as plain functions if genuinely identical.
- **Introduce a server-state cache (TanStack Query / SWR).** Rejected here: that is a repo-wide framework migration and changes fetch semantics, which breaks behavior-preservation. It can be proposed separately later.
- **Leave the files as-is.** Rejected: testability and change-safety keep degrading, and the extraction is already half-started inconsistently.

## Consequences

Slice logic becomes testable against a hand-written fake implementing the in-slice port — no global `fetch` mocking, no module-path mocks; pure `rules.ts` tests need zero doubles; fixtures typed against `contracts` fail at compile time on a wire change. Transport gets a single source of truth per resource. The cost is that a small transport wrapper no longer sits physically inside the slice (mitigated: the port does, and `ts-prune` sweeps orphans), and a new guard script must be maintained. Because rollout is one-file-per-PR and behavior-preserving, each PR is independently reviewable and reversible.

### Testing & coverage strategy for a slice

A slice is expected to reach high coverage (the `MemorySection` canary lands at ≥95% statements/branches/functions/lines per file). The seams make this natural: hooks test through their injected fake port with `renderHook`; dumb components render under `@testing-library/react` + `I18nProvider(initial="en")`; providers mock global `fetch`; pure `rules`/`formatters` take no doubles. Tests live in `apps/web/tests/features/<slice>/`, not colocated.

Closing the final few percent surfaces "unreachable" branches. Do **not** reach for `/* v8 ignore */` or contort tests — classify the cause, because each has a clean, honest fix:

- **SSR / environment guards** (`if (typeof window === 'undefined') …`) in a `providers/` browser bridge: add a companion test with `// @vitest-environment node` at the top. Under the node env `window` genuinely doesn't exist, so the guard executes for real — genuine coverage, no source change, no mock.
- **Redundant or over-broad guards**: simplify the source behavior-preservingly. A component that re-checks a condition its formatter already gates on should render off the formatter's result directly; a private helper typed to accept `null` for a parameter its only caller never passes null should tighten that parameter. The dead branch disappears or becomes reachable, and the code reads better.
- **Type-required fallbacks the runtime guarantees** (e.g. `regExpMatch[1] ?? ''` where the pattern guarantees the group): use a non-null assertion with a one-line comment stating the guarantee, and tighten optional interface fields (`action?: string` → `action: string`) when a value's sole producer always sets it.

Measurement: the v8 text table silently drops rows — use `--coverage.reporter=json-summary` (per-file %s, authoritative) plus `--coverage.reporter=json` (`coverage-final.json`, for per-line/branch uncovered detail). Enforce the bar via a `coverage.thresholds` block only as a follow-up once the tests land, since it changes CI behavior for the whole package.
