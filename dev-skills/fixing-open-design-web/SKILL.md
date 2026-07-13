---
name: fixing-open-design-web
description: Rigorous, reproducible template for decomposing an Open Design (nexu-io/open-design) apps/web god-component into the ADR-0002 machine-enforced vertical-slice architecture. Uses apps/web/src/features/memory (the MemorySection canary) as the canonical reference implementation. Splits a multi-thousand-line component into four homes — wire DTOs in packages/contracts, transport adapters (+ browser bridges) in apps/web/src/providers, and ports + pure rules + feature-local hooks + dumb components in apps/web/src/features/<slice> — bound by an injected dependencies.ts DI seam, enforced by the check-web-slice-boundaries guard, behavior-preserving, then validates and commits. Trigger words fixing-open-design-web, decompose a web god-component, apply the vertical-slice pattern, vertical-slice refactor, slice this component, frontend god-file refactor. This is the FRONTEND counterpart to fixing-open-design (which is backend/daemon capability-barrels only and does NOT apply to apps/web).
triggers:
  - fixing-open-design-web
  - decompose a web god-component
  - apply the vertical-slice pattern
  - vertical-slice refactor
  - slice this component
  - frontend god-file refactor
audience: contributor
---

# fixing-open-design-web — vertical-slice refactor template

Decompose an `apps/web` god-component of `nexu-io/open-design` into the **ADR-0002 vertical-slice architecture**, using `apps/web/src/features/memory/` (the **MemorySection** canary) as the proven reference implementation, then validate and commit.

> **This is the FRONTEND skill.** The sibling `fixing-open-design` skill is backend/daemon capability-barrels only and self-scopes OUT of `apps/web` — do not use it here. Frontend god-files (`apps/web/src/components/*.tsx`) follow the vertical-slice pattern below, which is a *different* architecture (four homes + DI ports, not core/ + subdir barrels).

> **Agent-agnostic.** This is a plain `SKILL.md` — any agent (Claude Code, Codex, Gemini, Cursor, OpenCode) can follow it. It names *capabilities* ("track progress", "run this command"), never a tool API.

**The reference is the spec.** Everything this skill asks for already exists, done correctly, in the two canary slices:
- **Primary: `apps/web/src/features/memory/` + `apps/web/src/providers/memory/` + `apps/web/tests/features/memory/`** — the MemorySection decomposition. When an instruction here is ambiguous, open that slice and copy its shape exactly.
- Secondary: `apps/web/src/features/mcp-client/` + `apps/web/src/providers/mcp/` — the McpClientSection decomposition (includes OAuth browser-bridge examples).

Read `docs/adr/0002-frontend-vertical-slice-decomposition.md` (the WHY) and `apps/web/AGENTS.md` before you start. The guard you must pass is `scripts/check-web-slice-boundaries.ts`.

> ⚠️ As of this writing ADR 0002, the guard, and the canaries live on the `refactor/web-memory-slice` / `refactor/web-mcp-client-slice` branches, NOT on `main`. If they are absent from your checkout, base your branch off one of those, or fetch the ADR/guard/canary in first — do not reinvent the pattern.

---

## The architecture in one screen — the four homes

1. **Wire DTOs + SSE event unions → `packages/contracts/src/api/<resource>.ts`.** Never redeclared in a slice; the daemon is a second consumer, so a slice-local copy would drift. Most resources already have a contract file — reuse it.
2. **Transport adapters (`fetch`/SSE/OAuth browser bridges) → `apps/web/src/providers/`.** Single-adapter resource = a flat `providers/<resource>.ts`; multi-adapter resource = a folder `providers/<resource>/` with one `index.ts` barrel. **Any browser subscription (`window`/`EventSource`/`BroadcastChannel`/timers) becomes a provider BRIDGE** (see `providers/memory/connector-auth.ts` and `providers/mcp/oauth-bridge.ts`) exposing `subscribeX(onEvent): () => void`, so the slice stays DOM-free.
3. **Ports + pure rules + UI types + hooks + dumb components → `apps/web/src/features/<slice>/`.** The slice owns its **port** (`ports.ts`) and reaches transport ONLY through `dependencies.ts` (the one file allowed to import `providers/`). Feature files depend on the port, never the adapter; slices never import each other's internals.
4. **Tests → `apps/web/tests/features/<slice>/`** (source stays source-only, per `AGENTS.md`).

Barrels mark boundaries, not folders: an `index.ts` at the slice root (public API), at a multi-adapter `providers/<resource>/`, and at a sub-slice boundary. `hooks/` and `components/` get NO barrel — direct relative imports.

Hooks are **feature-local and component-specific — no shared/app-level hook layer.** Each is `useX(port)` + a `useWiredX()` wirer that binds the real provider port. Duplication across slices is welcome; share only what *correctness* forces (DTOs, adapters). Components are **dumb/presentational** — props in, JSX out; small local disclosure state (`expanded`) is acceptable, but section/business state belongs in a hook. The slimmed **orchestrator** (the original `components/<Name>.tsx`) keeps only composition + any `forwardRef` handle + cross-cutting concerns (analytics), importing the slice through its **barrel only**.

---

## Guardrails (read before touching code)

1. **Behavior-preserving.** Preserve exact JSX markup, `className` strings, and i18n keys. Do NOT migrate CSS (that is a separate isolated PR). Do NOT change fetch semantics or public props.
2. **No logic changes in the same PR.** This is a structural move. Spotted a bug or a tempting cleanup? Note it for a follow-up; do not fold it in.
3. **Orchestrator public surface stays identical.** External importers (e.g. `SettingsDialog`, `IntegrationsView`) must not notice. Same exported names, same props, same handle.
4. **No new server-state cache library** (TanStack Query / SWR). Existing hand-rolled caching stays; ride cross-cutting caches in a context/dependency.
5. **The guard must pass.** A slice whose `pnpm guard` is red is incomplete — the boundaries would rot immediately.

Track the phases below as a task list so progress stays visible.

---

## The guard — what `check-web-slice-boundaries.ts` enforces

In any `features/**` file:
- **No transport/DOM globals:** `fetch`, `EventSource`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `window`, `document`. Move them behind a provider adapter/bridge reached via the port.
- **No `providers/` imports except in `dependencies.ts`.** ⚠️ This catches `import type` too — the check is AST-level, not type-aware. So a port's result types (e.g. an OAuth start-result) must be **DEFINED IN-SLICE** (in `types.ts`) and bound structurally in `dependencies.ts`, NOT imported from the provider. (See `features/mcp-client/types.ts` `McpOAuthStartResult`.)
- **No cross-slice deep imports.** A slice is reachable only through its public `index.ts` barrel — from other slices AND from outside `features/**` (the orchestrator included). Both relative and `@/*`-aliased deep imports are rejected.
Plus: one transport home per route (a route may live in only one `providers/<resource>/` folder).

---

## Phases

### Phase 0 — Confirm target and green baseline
1. Identify the god-component (`apps/web/src/components/<Name>.tsx`). Confirm with the user if unstated.
2. **Capture a green baseline before editing:** run the component's existing tests + `pnpm --filter @open-design/web typecheck` and record numbers. If red at baseline, stop and surface it. (First-time setup: `corepack enable && pnpm install`, then `pnpm --filter @open-design/contracts build` — a stale contracts dist breaks typecheck.)
3. `git status` — if the tree is dirty with unrelated work, plan to `git add <specific paths>` at commit time.

### Phase 1 — Profile and design the layout
1. Read the whole file. Inventory: every `useState`/`useEffect`, every subcomponent, every `forwardRef`/imperative handle, every endpoint it fetches, and every consumer that imports it (`grep -rn "<Name>" apps/web/src` — check BOTH quote styles; a single-quote grep misses double-quote imports).
2. Classify: is it **transport-heavy** (many endpoints → the payoff is a `providers/<resource>/` folder + hooks) or **state/UI-heavy** (many `useState`/subcomponents, ≤1 endpoint → the payoff is hooks + `rules.ts` + splitting subcomponents, NOT a big provider layer)? MemorySection is transport-heavy; McpClientSection mixes both; a composer is state/UI-heavy.
3. Sketch the slice tree (mirror the canary): `types.ts`, `constants.ts`, `rules.ts` (+ `formatters.ts` if needed), `ports.ts`, `dependencies.ts`, `hooks/*.hooks.ts`, `components/*.tsx`, `index.ts`; plus any `providers/<resource>/` additions.
4. **Produce the full cluster-by-cluster extraction plan before extracting anything.** For every remaining cluster, write down: the state/functions it owns, its coupling to other clusters, the proposed target file, the extraction shape, and a risk rating — then work the plan top to bottom. Do NOT plan one cluster, extract it, re-profile the file, plan the next cluster, repeat: that reactive loop re-reads the file and re-runs the full validation cycle after every single cluster, which burns tokens and wall-clock on repeated serial passes that a single upfront pass avoids. If a cluster's real shape differs from the plan once you're inside it, correct that cluster's plan entry — don't abandon the plan for the rest. See `ADS-project-knowledge/.local-artifacts/handoff/20260710T220440Z-chatcomposer-handoff.md`'s "Extraction Plan" section for the reference format (one numbered subsection per cluster, DONE/pending status, line-number snapshot caveat).
5. **Decide which clusters can run in parallel.** A cluster is parallelizable if it doesn't share state/functions with another cluster you're about to run alongside it. For each parallel cluster, cut one worktree-isolated subagent from the same base commit; brief it with the established pattern (the canary + the most recently landed cluster as reference), its target file, and an explicit instruction to FLAG — not fix — anything that reaches outside its assigned cluster (subagent worktrees have no `node_modules`, so they cannot run typecheck/tests/guard themselves; the reviewing session validates after merge). **This defers integration cost, it does not eliminate it**: expect real merge conflicts even between clusters whose diffs both look additive, and watch for one specific silent-failure shape — two clusters that each independently delete their own adjacent function from the same source region can produce a 3-way-merge conflict block where NEITHER side's deletion/replacement survives; a plain conflict-resolution pass won't catch this without understanding both clusters' intent, so re-grep for both clusters' expected new call sites after resolving, not just for the absence of conflict markers. Measured on `ChatComposer.tsx`: 3 parallel clusters landed faster wall-clock than serial, but the reviewing session still did ~100% of the merge/reconciliation work — plan for that cost up front, don't expect the parallel run to make it disappear.

### Phase 2 — Contracts (usually a no-op)
Check `packages/contracts/src/api/<resource>.ts` for the wire DTOs. Reuse them; add only genuinely new wire shapes. Never redeclare a DTO in the slice.

### Phase 3 — Providers + bridges
Move each `fetch`/SSE call into `providers/<resource>/` (folder + `index.ts` for multi-adapter; flat file otherwise). Turn each browser subscription into a `subscribeX(onEvent): () => void` **bridge** guarded by `typeof window === 'undefined'`. Re-home consumers of any deleted transport module (e.g. an old `state/<x>.ts`) onto the new provider barrel.

### Phase 4 — Ports + dependencies (the DI seam)
Define `ports.ts` — one interface per cluster the slice needs from the outside. Define port result types IN-SLICE (`types.ts`), not imported from `providers/`. `dependencies.ts` (the ONLY feature file allowed to import `providers/`) binds real adapters to each port; bindings are structural, so the provider's own types need not match the port's nominal types.

### Phase 5 — Pure rules
Move all pure logic (validation, mapping, inference, grouping, formatting, dirty-signatures) into `rules.ts`/`formatters.ts`/`constants.ts`. No React, no transport, no DOM — these test with zero doubles.

### Phase 6 — Feature-local hooks
One `useX(port): XController` per cluster + a `useWiredX()` wirer. Hooks hold state + call the injected port + import pure `rules` directly. Move even ephemeral UI state (picker query, expanded) into a hook or a small leaf component. **INFINITE-LOOP GOTCHA:** if a hook calls `useT()` (i18n) and puts `t` in a `useEffect`/`useCallback` dep array, it infinite-loops in a *bare* render (no `<I18nProvider>` → `t` is a fresh fn each render → effect refires → setState → re-render). Hold `t` in a `useRef`, drop it from deps, run load effects once (`[port]` or `[]`).

**A hook should own its own deps-bag callbacks, not just its state.** When a cluster's `actions.ts` functions are too entangled to be pure (Phase 5) but the cluster still has ONE natural owning hook, that hook should take the cross-cluster pieces it needs (other clusters' state/setters, the shared editor/DOM primitives) as PARAMS and build the deps bag + `useCallback`-wrap the bound functions INTERNALLY, returning them from its controller — the orchestrator just destructures ready-to-use callbacks, exactly like `MemorySection.tsx`'s `useEntries({ fireFlash, hydrateConfig, openEditor, closeEditor })` takes other hooks' outputs as params instead of the orchestrator composing them. Validated on `ChatComposer.tsx`'s `useMentionPopover`, which took the slash-popover cluster's state, the shared editor's mention-insert primitive, and several other clusters' staging setters as params, and returned `handleEditorTrigger`/`handlePopoverKey`/the `insertXMention` family bound and ready. Only fall back to assembling the deps bag in the orchestrator (Phase 8) when the callback genuinely has no single owning cluster (e.g. `submit`, which touches nearly everything).
- **Ordering**: moving deps-bag assembly into a hook usually means the hook's call site has to move later in the render (it now needs other clusters' state/deps-bag objects as params, which may not exist yet at the hook's original call position). This is safe — just move the call, and move its accumulating-subscription-adjacent effects (if any) with it.
- **Watch for orphaned plain-object references left behind**: a plain `const someDeps = { ...; setXFromMovedHook, ... }` built earlier in the render (not deferred inside an effect/callback) will throw a real TDZ `ReferenceError` at runtime if it reads a value the relocated hook now returns later in the render. `tsc` will NOT catch this (types are structurally fine) — only a test that actually renders the component will. Grep every setter/value the moved hook returns for earlier plain-object usages before calling it done, and re-run the render-driving test suite, not just typecheck.

**Injectable hooks (do this once the slice is otherwise done).** Mirror `MemorySection.tsx`'s pattern: define an orchestrator-local `<Name>Hooks` interface listing each feature hook as an optional prop (`useX?: (params) => XController`), destructure it in the component signature with each prop defaulting to the real wired hook (`useModals = useComposerModals`), and change `forwardRef<Handle, Props>` to `forwardRef<Handle, Props & <Name>Hooks>` if the orchestrator uses a handle. This lets a test inject a fake hook and render the orchestrator directly instead of mocking modules. **GOTCHA**: the prop name must differ from the identifier it defaults to (`useComments = useCommentAttachments`, never `useCommentAttachments = useCommentAttachments`) — a destructuring parameter default that references its own binding name throws a TDZ error, because the new parameter-scope binding shadows the outer one from the start of the parameter list.

### Phase 7 — Dumb components
Split subcomponents into `components/*.tsx`: props in, JSX out. A component that internally needs a hook (e.g. a per-item OAuth control) splits into a wired wrapper + a presentational `*View` (see `McpOAuthControl` + `McpOAuthControlView`). Preserve exact markup/classNames/i18n keys.

### Phase 8 — Orchestrator
Slim the original `components/<Name>.tsx` to composition only: `useWiredX()` hooks, dumb components, `forwardRef`/handle, analytics. Import the slice through its `index.ts` barrel ONLY. Keep its public export surface identical; re-export any handle type the barrel now owns.

**End-state target: zero standalone `function`/named-`const`-arrow declarations in the orchestrator.** Validated end-to-end on `ChatComposer.tsx` (5569 → 1853 lines across a 9-cluster decomposition + a user-driven testability pass, `MemorySection.tsx` was the original reference). After every cluster has landed, the orchestrator's render body should contain only: `useWiredX()` hook calls (each hook returns its own bound callbacks — the canonical shape, see `MemorySection.tsx`), the accumulating-subscription `useEffect`s that must stay per the effect-placement rule, trivial derived-value `const`s/`useMemo`/`useCallback`, the `forwardRef` handle, and JSX. This repo's deps-bag architecture (a slice's cross-cluster orchestration functions take an explicit `deps` parameter instead of closing over component scope — see `actions.ts` in any already-decomposed slice) means the orchestrator still has to bridge deps-bag objects to hook-returned setters; that bridging is what forces callbacks to exist in the orchestrator at all. Before reaching for a local `useCallback`, check the escape hatches in order:
0. **Does this callback have one natural owning hook?** Move the deps-bag assembly + `useCallback` into that hook instead (Phase 6) — this is the default, not the exception. Only the genuinely cross-cutting callbacks (nothing owns them — `submit`, an event-listener payload handler like the Mark draw-overlay's `ANNOTATION_EVENT`) stay orchestrator-level.
1. **Is it pure** (no transport, no DOM, only reads primitives/arrays it's given)? Move it to `rules.ts` as a plain function even if it currently reads 5+ pieces of orchestrator state — bundle them into one params object. Gating booleans and derived UI state (`hasComposerPayload`-style) count; don't leave these as scattered `const`s in the orchestrator when they're really one derivation.
2. **Is it DOM-only** (querySelector/focus/requestAnimationFrame, no business state)? Move it to `providers/dom.ts` (or a similar shared provider) as a plain SSR-guarded function; the orchestrator keeps a 1-line `useCallback` calling it.
3. **Does an effect's callback body contain real branching/business logic** (e.g. a `window.addEventListener` payload handler with upload/queue/send branches)? Extract the LOGIC into a deps-bag `actions.ts`/`attachment-actions.ts` function taking the event payload as an explicit arg — only the `addEventListener`/`removeEventListener` registration itself has to stay in the orchestrator's effect.
4. Only after 0–3 are exhausted: wrap what's left in `useCallback`, following these two rules —
   - A callback whose deps-bag object (e.g. `designToolboxApplyDeps`, `sendActionDeps`) is rebuilt fresh every render should wrap in `useCallback(fn, [thatDepsBagObject])` — since the deps-bag object itself is a new reference each render, the callback is too, exactly matching a plain function declaration's "always latest closure" behavior, just via the idiomatic hook.
   - A callback referenced by only 1–2 JSX call sites can be inlined directly into the JSX prop instead of kept as a named `useCallback` — prefer this when it doesn't hurt readability (see `onRemoveWorkspace`/`onDuplicate`-style inline arrows).
- A callback needed by an accumulating-subscription effect declared *earlier* in the render than the deps-bag object it needs does NOT require hoisting a named `function` for ordering — the effect's callback body only executes after the full render completes, by which point the deps-bag `const` (declared later in the same render) is already assigned. Call the actions.ts `*Impl` function directly inside the effect body with that deps-bag object; no wrapper needed.
- A ref-bridge pattern (`someRef.current = someCallback;`, "always points at the latest closure for an imperative handle") is correctly served by `useCallback` too, precisely because the deps-bag it closes over is itself unmemoized and fresh each render — do NOT try to "fix" this into a real memoized callback; the whole point is picking up the latest render's context.

### Phase 8.5 — Audit, don't just grep for named functions
"Zero standalone functions" (Phase 8) is a **symptom check**, not the audit. A grep for `^\s*function \|^\s*const \w+ = (` at the top level has three blind spots that let real orchestrator-owned logic hide in plain sight:
1. **It never looks inside JSX.** An inline `onSomething={(x) => { ...real branching, multiple setter calls... }}` never matches a top-level grep — it's nested, not top-level — so it silently reads as "already compliant" when it may just have never been extracted in the first place (pre-dating the refactor entirely). Enumerate every JSX prop assigned an inline arrow function with a body longer than ~3 lines or containing branching/multiple setter calls, and run each one through the same Phase 8 escalation order as a named function would get.
2. **"Wrapped in `useCallback`" is not the same as "audited."** When converting a function declaration to `useCallback`, don't just convert the syntax — re-derive from scratch which escalation-order step it actually belongs to: does it have one owning hook? Is the logic inside pure enough for `rules.ts`? What's the real call-site count (grep it — 1 site should inline directly into the JSX/ref-assignment, not stay a named wrapper)?
3. **Bare `useState`/`useRef` left in the orchestrator needs its own enumeration pass**, separate from working the cluster list. A cluster list built once at the start (Phase 1) will miss state that never got assigned to any cluster — cross-cutting state used by 3+ other clusters' deps bags but never itself given a home. List every `useState`/`useRef` call remaining in the orchestrator by name at the end and account for each one: which hook owns it, or is it an orphan that needs a new one (mirroring an already-extracted analog, e.g. `stagedSkills`/`stagedMcpServers`/`stagedConnectors` needing a `useStagedRunContext` hook the same way `stagedWorkspaceContexts` got `useWorkspaceContextLinking`)?
4. **The zero-functions grep does not match `useMemo`/`useEffect` bodies either** — `const x = useMemo(() => { ...multi-line derivation... }, [deps])` is a `const \w+ = useMemo(` call, not a `const \w+ = (` function declaration, so it never trips the Phase 8 grep and reads as "already compliant" even when it has real multi-line logic that belongs in `rules.ts`. Caught live on `ChatPane.tsx`'s `nextUserContentByAssistantId` (a multi-line loop building a `Map`, sitting unextracted after the rest of the file already looked clean) — the user caught it by reading the file directly, not by re-running the grep. Enumerate every remaining `useMemo`/`useEffect` in the orchestrator by name and check its body: a one-liner calling an already-pure `rules.ts` function (`useMemo(() => xFor(a, b), [a, b])`) is the target end state and needs no further work; anything with a loop, multiple branches, or inline object/Map construction should have its body extracted into a named `rules.ts` function first, leaving the `useMemo` as the trivial wrapper.

Do this pass once, after Phase 8 looks done, before moving to Phase 9.

### Phase 9 — Tests
In `apps/web/tests/features/<slice>/`: pure `rules` tests (no doubles); hooks via `renderHook` + a hand-written fake port (wrap in `<I18nProvider initial="en">` if the hook uses `useT`); dumb components under `@testing-library/react`; provider adapters mock global `fetch`; add a `// @vitest-environment node` companion for any `typeof window === 'undefined'` SSR guard (genuine coverage, no source change). Target ≥98% on all 4 metrics (statements/branches/functions/lines), both aggregate and per file — see Phase 9.5 for the loop that gets you there honestly.

### Phase 9.5 — Coverage-driven refactor loop (repeat until ≥98% on all 4 metrics)
Coverage is a floor, not a target to game. Run with `json-summary`+`json` reporters (the v8 text table drops rows) and read the real per-file numbers. While any of statements/branches/functions/lines sits below 98% (aggregate or per file):
1. **Classify every uncovered line/branch before touching anything** — do not add a test or delete code speculatively:
   - **Genuinely reachable, just untested** → write the test. This is the common case and should be most of the loop's work.
   - **Dead branch** (a condition that can no longer occur, an `else` left over from a removed caller, a defensive check duplicated by an earlier guard) → **refactor it away** behaviorally-safely rather than write a contrived test to hit it. Deleting the branch is the fix, not padding the suite.
   - **SSR-only guard** (`typeof window === 'undefined'`) → add a `// @vitest-environment node` companion test that exercises the guard for real.
   - **TS-required fallback with no real runtime path** (a `??`/non-null assertion satisfying the type checker) → a non-null assertion with a one-line comment explaining why it's safe, not a test.
2. **Badly-wired code and endless nesting are refactor signals, not coverage problems.** If hitting a branch requires threading 4+ levels of conditional setup, or a function has grown enough responsibility that its branches multiply combinatorially, the fix is to flatten/extract (guard clauses, early returns, splitting the function by responsibility per the escalation order in Phase 8) — not to write an equally convoluted test that mirrors the nesting. A function that's hard to cover is usually also hard to reason about; treat the coverage gap as the symptom and the tangle as the disease.
3. **Never fake the number.** `/* v8 ignore */` (or any coverage-suppression comment) is not a valid outcome of this loop under any classification above. If a branch truly cannot be justified by any of the four classifications, that's a signal the branch shouldn't exist — refactor it out.
4. Re-run coverage after each batch of fixes; repeat from step 1 until every metric clears 98% aggregate and per file. Record the final numbers (aggregate + any file that needed a specific call-out) in the handoff/PR body.

### Phase 10 — Validate (nothing is done until green)
Run and record real numbers:
1. `pnpm --filter @open-design/web typecheck`
2. New slice tests: `cd apps/web && npx vitest run -c vitest.config.ts tests/features/<slice>` — **write output to a file and check the real exit code; do NOT pipe through `tail`** (the pipe returns tail's status and masks vitest's exit code). jsdom files are slow to transpile; allow several minutes. (macOS has no `timeout` binary.)
3. Re-run the component's EXISTING tests unchanged — they must still pass (the behavior-preserving proof).
4. `pnpm guard` from the repo root — must print `apps/web vertical-slice boundary check passed.`

### Phase 11 — Commit / PR
1. Commit ONLY the refactor's files (`git add <paths>`). **No `Co-authored-by` trailer** (repo policy).
2. If opening a PR, cross-repo PRs push to the contributor's **fork** remote, not `origin` (upstream 403s). Body: **Why** (use case + the pain: unenforceable boundaries / testability), **What users will see** (nothing; internal refactor, public API identical; name the QA regression surface), **What this does**, **Surface area** (a pure refactor is `None` unless a new contract file was added), **Validation** (the real Phase 10 numbers).
3. For a very large target (SettingsDialog-class), a fully-validated PARTIAL (one section fully sliced + any leaked-helper consolidation) that keeps typecheck+guard+existing-tests green beats a broken whole — commit the rest as a clear `WIP:` commit. Never leave typecheck or guard red on the committed HEAD.

---

## Definition of done

- [ ] Green baseline captured before edits.
- [ ] Wire DTOs sourced from `packages/contracts` (not redeclared); transport in `providers/` (+ bridges for browser subscriptions).
- [ ] Slice owns `ports.ts` (result types in-slice) + `dependencies.ts` (the only provider importer); pure logic in `rules.ts`; feature-local `useX(port)` + `useWiredX()` hooks; dumb `components/`; one public `index.ts` barrel.
- [ ] Orchestrator slimmed, composes via the barrel only, public export surface identical (except for the optional injectable-hook props below, which are additive and don't change existing callers).
- [ ] Orchestrator has zero standalone `function`/named-`const`-arrow declarations left (grep `^\s*function \|^\s*async function \|^\s*const \w+ = (` at the component's top level) — only hook calls, accumulating-subscription effects, trivial derived `const`/`useMemo`/`useCallback`, the handle, and JSX. Before landing here, check each remaining callback against Phase 8's escape-hatch order (owning hook → pure rule → DOM provider → deps-bag action → last-resort `useCallback`). **Verify "zero" literally against the reference, not by feel**: run the same grep against `MemorySection.tsx` first (it returns exactly one match — the component declaration itself) so you know what a true pass looks like, then run it against your orchestrator and confirm every match is either the component or nested inside an allowed accumulating-subscription effect. The bar is stricter than it sounds until checked against the real example — "looks pretty clean" is not the same as zero.
- [ ] Each feature hook call is injectable: an optional `<Name>Hooks` prop per hook, defaulting to the real wired hook (see Phase 8 "Injectable hooks").
- [ ] Exact markup / className / i18n keys preserved; no logic changes; no CSS migration; no TanStack/SWR.
- [ ] Coverage ≥98% on all 4 metrics (statements/branches/functions/lines), aggregate and per file, reached via the Phase 9.5 classify-then-fix loop (test the reachable, refactor away the dead/tangled, node-companion the SSR guards, non-null-assert the type-required fallbacks) — never `/* v8 ignore */`.
- [ ] `pnpm --filter @open-design/web typecheck`, new slice tests, existing component tests, and `pnpm guard` (vertical-slice boundary check) all green — numbers recorded.
- [ ] Committed with no co-author trailer; PR (if any) pushed to the fork with the full body.
