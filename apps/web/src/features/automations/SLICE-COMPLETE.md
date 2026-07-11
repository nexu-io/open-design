# Automations slice — decomposition complete

`apps/web/src/components/TasksView.tsx`, `apps/web/src/components/NewAutomationModal.tsx`,
and `apps/web/src/components/routineScheduleLabels.ts` are decomposed into the
ADR-0002 vertical-slice architecture, mirroring the `features/memory` canary.

## Shape

- **Providers** (`apps/web/src/providers/routines/`): `routines.ts` (dashboard
  snapshot fetch + run/pause/delete), `runs.ts` (run history + crystallize),
  `proposals.ts` (evolution-proposal review), `submit.ts` (create/update
  routine), `dom-bridge.ts` (Escape key, body-scroll lock, timers, confirm
  dialog — the only DOM-touching surface in the whole slice), all re-exported
  through one `index.ts` barrel.
- **Ports + DI seam** (`features/automations/ports.ts` + `dependencies.ts`):
  `RoutinesDashboardPort`, `RoutineHistoryPort`, `AutomationCapabilitiesPort`,
  `AutomationSubmitPort`, `AutomationDomPort` — `dependencies.ts` is the only
  feature file that imports `providers/`.
- **Pure rules** (`rules.ts` + `formatters.ts`): template catalog building/
  filtering, routine/proposal labeling and sorting, the automation-modal form
  <-> wire-schedule mapping, capability selection, and all
  date/time/schedule formatting. `routineScheduleLabels.ts` folded in here.
- **Feature-local hooks** (`hooks/*.hooks.ts`): `useAutomationsDashboard` (the
  saved-routine list, proposal review queue, template catalog),
  `useAutomationHistory` (a routine row's expanded run history),
  `useAutomationCapabilities` (the "@mention" picker's plugin/MCP data),
  `useAutomationModalForm` (the create/edit modal's form, template picker,
  schedule picker, and capability picker state), `useAutomationAnalytics`
  (page-view + click tracking) — each with a `useWiredX()` wirer.
- **Dumb components** (`components/*.tsx`): `AutomationsHero`,
  `AutomationsSavedSection`, `AutomationRow`, `AutomationRunHistory`,
  `ProposalsSection`, `TemplatesSection`, `StatusPill`, `Metric`,
  `ScheduleSummary`, `NewAutomationModal` (+ its `TemplatePopover`,
  `SchedulePopover`, `PillButton`/`PopoverMenu`/`PopoverItem`,
  `MentionSection`/`MentionItem`).
- **Barrel** (`index.ts`): the slice's sole public surface.

## Orchestrator

`apps/web/src/components/TasksView.tsx` stays at its original path (its only
external consumer, `EntryShell.tsx`, imports it unchanged) and imports the
slice through its barrel only. It composes `useWiredAutomationsDashboard` plus
the slice's dumb components — zero standalone `function`/`const`-arrow
declarations, zero bare `useState`/`useRef`/`useMemo`/`useEffect` (verified
against the `MemorySection.tsx` canary reference, which returns the same
single match: the component declaration itself). `NewAutomationModal` is a
slice-internal component (no consumer besides `TasksView`) with the identical
zero-standalone-declarations property. Both were audited twice, independently,
per Phase 8.5 (inline JSX callbacks, `useCallback`-wrapped logic, orphaned
`useState`/`useRef`, and `useMemo`/`useEffect` bodies) — no dead-code
findings; the audit itself surfaced and fixed three inline-derivation spots
(`buildModalInitial`, `routineTargetLabel`, `isContextSelected`), now pure
`rules.ts` functions.

## Tests

Moved to `apps/web/tests/features/automations/` and adapted (not rewritten
thin): the original `TasksView.*.test.tsx` and `NewAutomationModal.*.test.tsx`
integration suites (import paths updated; the `NewAutomationModal` mock in
`TasksView.routines.test.tsx` now targets the slice barrel via
`vi.importActual`), plus new suites for every pure/hook/provider/component
seam: `rules.test.ts`, `formatters.test.ts`, `providers-routines.test.ts`,
`providers-runs.test.ts`, `providers-proposals.test.ts`,
`providers-submit.test.ts`, `providers-dom-bridge.test.ts` (+ a node-env SSR
companion), `useAutomationsDashboard.test.tsx`, `useAutomationHistory.test.ts`,
`useAutomationCapabilities.test.ts`, `useAutomationModalForm.test.tsx`,
`SchedulePopover.test.tsx`, `TemplatePopover.test.tsx`,
`MentionPickerParts.test.tsx`, `AutomationRow.test.tsx`,
`AutomationRunHistory.test.tsx`, `ProposalsSection.test.tsx`,
`NewAutomationModal.interactions.test.tsx`,
`NewAutomationModal.renderStates.test.tsx`.

299 tests, 27 files, all green.

## Validation (final numbers)

- `pnpm --filter @open-design/web typecheck` — clean.
- `cd apps/web && npx vitest run -c vitest.config.ts tests/features/automations`
  — 299 passed, 0 failed.
- `pnpm guard` — prints `apps/web vertical-slice boundary check passed.`
  (plus the pre-existing, non-blocking, informational note about 5 inline
  fetches of provider-owned routes in out-of-scope files:
  `MemoryModelInline.tsx`, `OdCard.tsx`, `RoutinesSection.tsx` x2,
  `state/projects.ts` — none of them part of this cluster).
- Full `apps/web` suite (`npx vitest run -c vitest.config.ts`, no path
  filter): 450/451 files, 4628/4636 tests pass. The one failure
  (`FileWorkspace.design-system.test.tsx`) is pre-existing on the branch
  baseline (confirmed by stashing this slice's changes and re-running that
  file in isolation before starting this work) and untouched by this
  decomposition.
- Coverage (`--coverage.reporter=json-summary` + `json`, scoped to
  `src/features/automations/**` and `src/providers/routines/**`): **100%
  statements, 99.66% branches, 100% functions, 100% lines** aggregate; every
  individual file clears 98% on all four metrics (the Phase 9.5 bar). Reached
  via the classify-then-fix loop: the large majority of gaps were genuinely
  reachable branches closed with real tests (provider mocks, `renderHook`
  against fake ports, injected-fake-controller component renders, node-env
  SSR bridge companions); two branches were reclassified as dead
  (`readContextMention`'s two regex-capture-group `?? ''` fallbacks — both
  groups are mandatory in the pattern, so match[1]/match[2] are always
  defined whenever `match` is non-null) and replaced with non-null assertions
  plus a one-line comment; one `part?.value ?? 'GMT'` fallback was refactored
  into an explicit `if (part === undefined)` for a clearer, correctly-
  instrumented branch shape (its test had also been silently degraded by a
  `vi.spyOn(...).mockReturnValue(...)` that vitest ignores when the mocked
  constructor is invoked with `new` — fixed with a proper class-based
  `mockImplementation`).

Behavior-preserving throughout: exact markup/className/i18n keys, no
fetch/analytics-semantics changes, `TasksView`'s public export surface
unchanged.
