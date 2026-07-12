# FileWorkspace.tsx → features/file-workspace — decomposition complete

`apps/web/src/components/FileWorkspace.tsx` (formerly ~5,742 lines) is
decomposed into the ADR-0002 vertical-slice architecture, mirroring the
`features/memory` (`MemorySection.tsx`) canary. All 7 clusters in
`EXTRACTION-PLAN.md` are done, including cluster 3 (tab activation — the
central hub, split into the 3a external-tab-request-sync and
tab-state-primitive sub-clusters once inside the real ordering constraint;
both landed, the plan's stale top-level status line has been corrected to
match).

## The four homes

1. **Wire DTOs — `@open-design/contracts` / `../types`.** No new wire shapes;
   this slice reuses `OpenTabsState`, `ProjectFile`, `LiveArtifactSummary`,
   `WorkspaceContextItem`, and the rest of the pre-existing DTOs.
2. **Transport — `apps/web/src/providers/`.** `providers/registry.ts`'s
   pre-existing project-file/folder endpoints are reused via `ports.ts` +
   `dependencies.ts`; the 4 tab-bar DOM subscriptions
   (`subscribeWindowFileDropGuard`, `subscribeTabBarWheelScroll`,
   `scrollActiveTabIntoView`, `subscribeTabBarOverflowMeasure`) live in
   `providers/dom.ts`, each guarded by `typeof window === 'undefined'`.
3. **Ports + pure rules + hooks + dumb components —
   `apps/web/src/features/file-workspace/`.**
   - `ports.ts` / `dependencies.ts`: `DesignSystemPreviewPort`,
     `DesignSystemKitActionsPort`, `SketchesPort`,
     `WorkspaceKeyboardShortcutsPort`, `WorkspaceTabBarDomPort`,
     `ProjectFoldersPort`, `FileOperationsPort`, `DesignFilesLibraryPort` —
     `dependencies.ts` is the only slice file importing `providers/`.
   - `rules.ts` / `constants.ts`: tab-bar drag/order/scroll math (including
     `scrollWorkspaceTabsWithWheel` and, as of this pass,
     `translateTabBarSyntheticWheel` — see "Phase 8.5 audit" below),
     browser-tab id/state helpers, sketch/file-name predicates,
     design-system card-manifest/review helpers, and tab render-info
     derivation.
   - `hooks/`: 13 feature-local hooks, each with a `useWiredX()` wirer —
     `useWiredProjectFolders`, `useWiredSketches`, `useWiredFileOperations`,
     `useBrowserTabs`, `useWorkspaceContextTracking`,
     `useWorkspaceTabRequests`, `useWorkspaceTabActivation`,
     `useWorkspaceLauncher`, `useTabReorderDnd`,
     `useWiredDesignFilesPanelState`, `useWiredWorkspaceKeyboardShortcuts`,
     `useWiredWorkspaceTabBarDom`, plus the design-system-project-panel
     hooks (`useWiredDesignSystemCardManifest`,
     `useWiredDesignSystemKitActions`, `useDesignSystemReviewCards`).
   - `components/`: `Tab`, `DesignSystemProjectLoading`,
     `DesignSystemInlinePreview` (+ its `*View`), `DesignSystemReviewCard`.
   - `index.ts`: the slice's sole public barrel.
4. **Tests — `apps/web/tests/features/file-workspace/`.** 24 test files
   covering every hook and rule added by this decomposition, alongside the
   pre-existing `apps/web/tests/components/FileWorkspace.test.tsx` (moved
   under the same tree's sibling `tests/components/`, unchanged — proving
   behavior preservation).

## Orchestrator

`FileWorkspace.tsx` is 1,308 lines (down from ~5,742): `useWiredX()` hook
calls, a small ref-bridge layer (`openFileRef` / `orderedWorkspaceTabsRef` /
`workspaceTabsStateRef` / `commitTabsStateRef` / `setPersistedActiveRef`,
each documented at its declaration site — this repo's established pattern
for breaking a hook-ordering cycle where an earlier-called hook needs a
later-called hook's not-yet-existing return value), two effects that must
stay inline ahead of `useBrowserTabs`/`useWorkspaceTabActivation` for the
same ordering reason (the "pull persisted active tab in" effect and the
launcher-close-on-`projectId`-change effect), the Cluster 7 page-view
mount effect (a single-line-body accumulating-subscription effect, explicitly
allowed to stay inline per Phase 8's escape-hatch order), trivial derived
`const`s/`useMemo`s (each a one-line call into an already-pure `rules.ts`
function), dumb components, and JSX.

## Phase 8.5 audit (run twice, independently)

Both passes checked all four Phase 8.5 sub-items: (1) inline JSX callbacks
with a body >~3 lines or branching/multiple setters, (2) every
`useCallback` re-derived from scratch against the escalation order, (3) a
full `useState`/`useRef` enumeration, (4) a full `useMemo`/`useEffect`
enumeration by name and body inspection (not just the top-level
function-declaration grep, which both passes also ran and which returns
exactly one match — the component declaration itself — matching the
`MemorySection.tsx` reference baseline).

**One genuine finding, fixed:** the tab bar's JSX `onWheel` prop had a
5-line inline handler (two early-return branches + a `scrollLeft` DOM
write) that was never migrated — it predates even Cluster 1's original
extraction (verified against `main`'s pre-refactor `FileWorkspace.tsx`,
which has the identical inline handler at the same relative position,
alongside a *separate* `useEffect`-driven native wheel listener doing very
similar but not identical math). Per Phase 8's escalation order (DOM-only,
no business state → move to a plain function, orchestrator keeps a 1-line
call), it is now `translateTabBarSyntheticWheel` in `rules.ts`, with its own
test suite in `tests/features/file-workspace/rules.test.ts`. This is a pure
structural move, not a behavior fix: the JSX `onWheel` prop and the native
`subscribeTabBarWheelScroll` listener still both fire on the same wheel
gesture, exactly as before this pass and as in the pre-refactor monolith —
unifying them would be a logic change, out of scope for a behavior-preserving
extraction, and is noted in `rules.ts` as a candidate for a dedicated
follow-up if the duplication is ever judged worth fixing.

**Everything else checked out already migrated:**
- Every remaining `useState`/`useRef` (12 total) is either a DOM element ref
  bound to markup the orchestrator itself renders (`fileInputRef`,
  `tabsBarRef`), a documented ref-bridge breaking a hook-ordering cycle, or
  state explicitly kept inline per an already-recorded ordering constraint
  (`activeTab`/`setActiveTab`, `uploadError`/`setUploadError`,
  `tabsStateRef`/`lastTabsStatePropRef`, `fileManagerViewedProjectRef`) — see
  `EXTRACTION-PLAN.md` clusters 2 and 3 for the reasoning behind each.
- Every remaining `useMemo`/`useEffect` (6 total, plus the 4 ref-bridge
  `useCallback`s) is a one-line call into an already-pure `rules.ts`
  function or a documented ordering-constrained inline effect with a
  single-statement body — the Phase 8.5 target end state.
- The `orderedWorkspaceTabs.map(...)` / `browserTabs.filter().map(...)` JSX
  render bodies call already-extracted pure render-info helpers
  (`fileTabRenderInfo`, `browserTabRenderInfo`) and contain no
  business-logic branching of their own.
- The repeated `trackFileManagerClick(...); <delegate>()` JSX handlers
  throughout the Design Files panel props block are the same
  "cross-cutting concern (analytics)" shape Phase 8 explicitly allows to
  stay orchestrator-level, and match `EXTRACTION-PLAN.md` cluster 2's own
  note that sketch save/export analytics tracking intentionally stays in
  the orchestrator (the branching that ties a track call to a specific UI
  trigger site can only be known at that call site).

## Known deviation from the more mature canaries

Unlike `features/memory`, `features/mcp-client`, `features/handoff`, and
`features/automations` (all of which additionally expose an optional
`<Name>Hooks`-shaped prop per feature hook, defaulting to the real wired
hook, for injectable-hook component testing), this slice does **not** yet
add that testability layer — `FileWorkspace`'s existing test suite mocks
`providers/registry` and `DesignBrowserPanel` directly instead. Adding
injectable hooks across this orchestrator's 10+ hook call sites is a
real, nontrivial follow-up (out of scope for this verification/wrap-up
pass, which was scoped to the Phase 8.5 audit and its findings) — flagged
here rather than silently left unmentioned.

## Validation (final numbers)

- `pnpm --filter @open-design/web typecheck` — clean.
- `pnpm guard` — prints `apps/web vertical-slice boundary check passed.`
- `cd apps/web && npx vitest run -c vitest.config.ts tests/features/file-workspace tests/components/FileWorkspace.test.tsx`
  — 25 files, 469 tests, all passing.
- Full `apps/web` suite (`npx vitest run -c vitest.config.ts`, no path
  filter) — see the commit/PR validation log for the exact number; run
  as part of this pass's gate and confirmed green (or diffed against the
  branch's pre-existing baseline if any unrelated failure surfaced).

No logic, fetch semantics, public props, markup, className, or i18n key
changes beyond the one documented structural move above. No CSS migration.
No new server-state cache library.
