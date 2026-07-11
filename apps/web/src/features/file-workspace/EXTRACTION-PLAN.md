# FileWorkspace.tsx extraction plan

Full upfront inventory (SKILL.md Phase 1 step 4), taken against the
orchestrator at commit `b45fcbc0e` (2156 lines). Work the clusters below
top-to-bottom; mark a cluster `done` in this file as part of the pass's
last commit for that cluster. If a cluster's real shape differs once inside
it, correct just that cluster's entry — keep the rest of the plan intact.

Already extracted before this plan existed (do NOT redo): Tab + tab-bar
rules, design-system-project pure helpers, design-system inline-preview URL
rewrite, `DesignSystemProjectLoading`, `DesignSystemInlinePreview`, the
card-manifest fetch hook, `DesignSystemProjectPanel` orchestrator + hooks,
sketch/tab-bar pure helpers, the sketch cluster (`useSketches`), workspace
context tracking (`useWorkspaceContextTracking`), and the keyboard-shortcuts
cluster (`useWorkspaceKeyboardShortcuts`).

## Cluster 1 — DOM-only tab-bar/global-listener effects

- **Owns**: 4 effects, no business state of their own beyond the
  `tabsOverflowing` setter:
  1. Global `window` dragover/drop guard (blocks a stray file drop from
     navigating away from the app outside an allowed drop target) — lines
     ~1213-1235.
  2. Tab-bar wheel → horizontal-scroll translation — ~1237-1246.
  3. Active-tab scroll-into-view (accounts for the sticky Design Files tab)
     — ~1248-1276.
  4. `tabsOverflowing` measurement + `ResizeObserver` + the
     `--ds-system-tab-w` CSS custom property write — ~1436-1470.
- **State/refs involved**: `tabsOverflowing` (useState), `tabsBarRef`
  (useRef, shared with cluster 2 below for `.click()`-adjacent DOM reads —
  READ ONLY here, never reassigned).
- **Coupling to other clusters**: reads `activeTab`, `browserTabs.length`,
  `designSystemProject`, `tabNames.length` (from
  `useWorkspaceContextTracking`, already extracted) as effect deps only —
  no calls back into tab-activation/browser-tab functions. Lowest coupling
  of any remaining cluster.
- **Target**: 4 new bridge exports in `apps/web/src/providers/dom.ts`
  (`subscribeWindowFileDropGuard`, `subscribeTabBarWheelScroll`,
  `scrollActiveTabIntoView`-style helper, `subscribeTabBarOverflowMeasure`)
  each guarded by `typeof window === 'undefined'`, mirroring
  `subscribeCaptureKeyDown`'s shape. New feature hook
  `useWorkspaceTabBarDom.hooks.ts` takes the port + `tabsBarRef` + the
  small set of primitive deps and returns `{ tabsOverflowing }`.
- **Extraction shape**: provider bridge (Phase 3) + feature-local hook
  (Phase 6), added to `ports.ts`/`dependencies.ts` as
  `WorkspaceTabBarDomPort`.
- **Risk**: low. Pure DOM measurement/listeners, no shared business state,
  single consumer.
- **Status**: done. Landed as `providers/dom.ts` bridges
  (`subscribeWindowFileDropGuard`, `subscribeTabBarWheelScroll`,
  `scrollActiveTabIntoView`, `subscribeTabBarOverflowMeasure`) +
  `WorkspaceTabBarDomPort` + `hooks/useWorkspaceTabBarDom.hooks.ts` +
  `useWiredWorkspaceTabBarDom` wirer, wired into the orchestrator as a
  single `useWiredWorkspaceTabBarDom({ tabsBarRef, activeTab,
  browserTabsCount, designSystemProject, tabNamesCount })` call replacing
  the 4 removed effects + the `tabsOverflowing` state. 6 new hook tests
  added. FileWorkspace.tsx: 2156 → 2063 lines.

## Cluster 2 — Upload / file CRUD

- **Owns**: `uploadError`, `uploadDir`, `projectFolders` state +
  `projectFoldersProjectIdRef` render-time reset; `refreshProjectFolders`;
  the `useEffect` that fetches folders on `projectId` change (~584-594);
  `handleFilePicked`, `uploadFiles`, `handleDelete`, `handleDeleteMany`,
  `handleRename`, `createMarkdownDocument`; `fileInputRef`.
- **Coupling to other clusters**: calls `openFile` (tab-activation cluster,
  cluster 3) after upload/create/rename; reads/writes `sketches` via
  `removeSketchEntry`/`removeSketchEntries`/`renameSketchEntry` (already
  injected from `useWiredSketches`); calls `onTabsStateChange`/`setActiveTab`
  directly in delete/rename paths (today reads `tabsState`/`persistedTabs`/
  `activeTab` props+state directly — becomes explicit params). Transport is
  already behind `providers/registry` (`deleteProjectFile`,
  `fetchProjectFolders`, `renameProjectFile`, `uploadProjectFiles`,
  `writeProjectTextFile`) — wrap those in an in-slice port per the task
  brief rather than re-implementing transport.
  Also calls `analytics.track` (`trackFileUploadResult`) and
  `deriveUploadCohort` — analytics tracking passed through as an injected
  callback (mirrors how `useSketches` takes `t`/`onUploadError` as params)
  or the hook takes the raw `trackFileUploadResult`+`analytics.track`
  pairing as a single param.
- **Target**: `ports.ts` gets `FileOperationsPort` (wraps the 5
  `providers/registry` calls above); `dependencies.ts` binds it;
  `hooks/useFileOperations.hooks.ts` owns the state/effect/handlers and
  takes `{ projectId, files, sketches, tabsState/persistedTabs accessors,
  activeTab, openFile, onTabsStateChange, setActiveTab,
  removeSketchEntry, removeSketchEntries, renameSketchEntry, analyticsTrack,
  t }` as params (deps-bag pattern per SKILL.md Phase 6).
- **Extraction shape**: port + dependencies binding + feature-local hook.
- **Risk**: medium — moderate parameter surface, but each function's body
  is already self-contained and behavior-preserving; the main hazard is
  correctly threading `tabsStateRef`-vs-`persistedTabs` freshness (mirror
  existing ref-read patterns exactly, don't "clean up" them).
- **Status**: done, split into two hooks once inside it (real ordering
  constraint the plan didn't anticipate: `refreshProjectFolders`/`uploadDir`
  must exist BEFORE `useWiredSketches` is called, since sketches takes them
  as params — but the CRUD handlers need `removeSketchEntry`/
  `renameSketchEntry` etc. FROM `useWiredSketches`, so one hook can't own
  both halves without a call-order contradiction):
  - `hooks/useProjectFolders.hooks.ts` (`ProjectFoldersPort` +
    `useWiredProjectFolders`) owns `uploadDir`/`projectFolders`/
    `refreshProjectFolders` + the render-time-reset-on-projectId-change
    pattern + the fetch-on-projectId-change effect. Called BEFORE
    `useWiredSketches`, exactly where the old inline state used to sit.
  - `hooks/useFileOperations.hooks.ts` (`FileOperationsPort` +
    `useWiredFileOperations`) owns `handleFilePicked`/`uploadFiles`/
    `handleDelete`/`handleDeleteMany`/`handleRename`/
    `createMarkdownDocument`. Called AFTER `useWiredSketches` so it can take
    `removeSketchEntry`/`removeSketchEntries`/`renameSketchEntry` as params;
    also takes the still-inline `openFile`/`workspaceTabsState` (hoisted
    `function` declarations further down the same render — hoisting makes
    referencing them before their textual declaration point safe) plus
    `onTabsStateChange`/`setActiveTab`/`onUploadError`/`analyticsTrack`/`t`.
  - `uploadError` state stayed in the orchestrator (corrected from the
    original plan): it's genuinely cross-cutting, touched by ~10+ call
    sites across the not-yet-extracted tab-activation/browser-tab/launcher
    clusters (3/4/5), not just this cluster's CRUD ops. `useFileOperations`
    takes `onUploadError` as a param (mirrors the existing
    `onUploadError: setUploadError` binding already passed to
    `useWiredSketches`).
  - Port result types (`UploadProjectFilesResult`, `ProjectUploadFailure`)
    added to `types.ts` in-slice per the guard's import-type rule, bound
    structurally in `dependencies.ts` against `providers/registry`'s
    real types.
  - Analytics tracking (`trackFileUploadResult`, `deriveUploadCohort`)
    moved INTO the hook rather than staying orchestrator-side (unlike the
    sketch-save/export tracking, which stays in the orchestrator) — the
    branching that decides which tracking call fires is inseparable from
    `uploadFiles`' control flow; splitting it out would have meant either
    duplicating that branching in the orchestrator or exposing much more
    granular result data, both worse than importing the (non-`providers/`,
    non-DOM) tracking helpers directly into the hook.
  - 17 new hook tests (`useProjectFolders.test.tsx` +
    `useFileOperations.test.tsx`). FileWorkspace.tsx: 2063 → 1900 lines.

## Cluster 3 — Tab activation / lifecycle (the central orchestration cluster)

- **Owns**: `activeTab` state; `workspaceTabsState`, `commitTabsState`,
  `setPersistedActive`, `activatePending`, `openFile` (+ `openFileRef`),
  `focusWorkspaceTab`, `activateWorkspaceTab`,
  `activateWorkspaceTabByOffset`, `activateWorkspaceTabByIndex`,
  `openWorkspaceTabLauncher`, `closeActiveWorkspaceTab`,
  `openFileReplacing`, `closeTab`; `tabsStateRef`/`lastTabsStatePropRef`
  sync-in-render; `terminalLiveSessionsRef` +
  `handleTerminalSessionChange` (terminal-close-on-tab-close needs the live
  PTY id); `slideNavDeliverableNonce` state +
  its effect (~915-920); `previousQuestionFormSubmittedAnswersRef` +
  its effect (~935-942); the tab-lifecycle response effects: persisted-tab
  fallback (~810-827), `designSystemEditRequest` (~829-834), `openRequest`
  (~839-869), `shareRequest` (~879-889), `downloadRequest` (~894-904),
  `focusQuestionsRequest` (~925-929), `showQuestionsTab` fallback
  (~946-951), `tabsState.active` sync (~609-611).
- **Coupling to other clusters**: this is the hub — calls into cluster 2's
  post-op activation only via `openFile` (so cluster 2 takes `openFile` as
  a param, not the reverse); calls into cluster 4 (browser tabs) via
  `closeBrowserTab`/browser-tab-id checks (`isBrowserTabId`,
  `browserTabs.some(...)`); reads `sketches` (pending-sketch checks in
  `closeTab`/`activateWorkspaceTab`); reads `workspaceTabIds`/
  `orderedWorkspaceTabs` from the already-extracted
  `useWorkspaceContextTracking`. Highest fan-in/fan-out of any cluster —
  extract LAST, after clusters 1/2/4/5 have shrunk the surrounding render
  body, and expect this cluster's hook to take the largest params object in
  the slice (mirrors `useEntries({ fireFlash, hydrateConfig, ... })` in the
  `MemorySection` canary).
- **Target**: `hooks/useWorkspaceTabActivation.hooks.ts` (name tentative —
  reads better once cluster 4 is out and the real remaining shape is
  clearer). No new transport — this cluster is pure state/dispatch, no
  `providers/` import needed except by delegation to already-injected pieces.
- **Extraction shape**: feature-local hook, deps-bag params.
- **Risk**: high — central hub, largest blast radius if a param is
  threaded wrong (e.g. a stale `tabsStateRef` read). Budget a dedicated pass
  with careful before/after behavior diffing, not a rushed single commit.
- **Status**: pending.

## Cluster 4 — Embedded browser tabs

- **Owns**: `browserTabs`, `browserNavigateRequests`,
  `browserAttentionRequests`, `liveBrowserTabIds` state +
  `mountedBrowserTabIds` memo; `browserTabSequenceRef`;
  `openRequestedBrowserTab`, `openBrowserTab`, `closeBrowserTab`,
  `updateBrowserTabInfo`; the browser-tab effects: reset-on-`projectId`
  (~613-618, shares the effect body with launcher-close — see note below),
  sync-from-`tabsState.browserTabs` (~620-624), promote-active-to-LRU-front
  (~790-796), drop-closed-tabs-from-LRU (~799-805),
  `browserOpenRequest` (~871-875); `browserSnapshotToast` state +
  `handleBrowserPageSnapshotToast` (the snapshot-toast callback is
  browser-panel-specific, not the generic toast primitive cluster 5 might
  own).
- **Coupling to other clusters**: calls `setActiveTab`/`commitTabsState`
  (cluster 3) on open/focus/close — takes those as params; reads
  `orderedWorkspaceTabs`/`activeTab` (cluster 3 state, read-only param).
  The `projectId`-change reset effect (~613-618) ALSO clears
  `launcherOpen` (cluster 5) — when extracting, split that effect's body:
  the browser-tab resets move into this cluster's hook, `setLauncherOpen(false)`
  stays behind (or cluster 5's hook takes a `projectId` dep too and the
  orchestrator keeps two effects instead of one). Note this explicitly so
  the split doesn't get lost.
- **Target**: `hooks/useBrowserTabs.hooks.ts`. No new provider needed —
  no transport/DOM here (webview navigation itself lives in
  `DesignBrowserPanel`, already outside this file).
- **Extraction shape**: feature-local hook, deps-bag params
  (`{ activeTab, orderedWorkspaceTabs, persistedTabs, tabsState, setActiveTab,
  commitTabsState, onTabsStateChange, t }`).
- **Risk**: medium — self-contained CRUD but the shared reset-effect split
  with cluster 5 needs care; the LRU cap logic
  (`BROWSER_KEEPALIVE_CAP`) must stay byte-identical.
- **Status**: done. Landed as `hooks/useBrowserTabs.hooks.ts` (`useBrowserTabs`,
  no port — no transport/DOM in this cluster) + barrel export. Corrections
  and gotchas the plan didn't anticipate:
  - `browserSnapshotToast`/`handleBrowserPageSnapshotToast` ARE owned by this
    hook per the plan's own note (re-read carefully — easy to miss since they
    sit textually far from the other `browserTabs` state in the original
    file); landed here as planned.
  - **Hook-ordering cycle**: `openRequestedBrowserTab`/`openBrowserTab` need
    cluster 3's derived `orderedWorkspaceTabs` (to anchor a new tab after the
    current last workspace tab), but `orderedWorkspaceTabs` is itself derived
    FROM this hook's `browserTabs` (via `useWorkspaceContextTracking`) — a
    plain value param would be a hook-ordering cycle no reordering of hook
    calls can resolve. Fixed by threading an `orderedWorkspaceTabsRef`
    (`MutableRefObject`, not `RefObject` — `useRef` with a non-undefined
    initial value returns `MutableRefObject`, and `RefObject.current` is
    typed `T | null` in this repo's `@types/react@18`, which does not match)
    that the orchestrator updates via a plain render-time assignment right
    after `useWorkspaceContextTracking`, mirroring the pre-existing
    `openFileRef` pattern in this exact file. `openFileRef` itself also had
    to become an explicit `openFileRef` param (same `MutableRefObject`
    reasoning) since `handleBrowserPageSnapshotToast`'s file-open action
    needs the always-current `openFile` despite being a `useCallback`
    memoized only on `[t]`.
  - **Effect-ordering regression (caught by the existing test suite, not by
    typecheck/guard)**: cluster 4's hook call was first placed early in the
    render (right where the old `browserTabs`/`liveBrowserTabIds` state used
    to sit), which registers its internal effects — including the
    `browserOpenRequest` effect that calls `setActiveTab` — BEFORE the
    still-inline "pull the persisted active tab in" effect
    (`useEffect(() => setActiveTab(tabsState.active ?? defaultRootTab), ...)`).
    Since React flushes a component's mount effects in hook-registration
    order, and both effects call `setActiveTab` directly (not an updater
    function) in the same initial-mount batch, the LAST one to register wins
    for that flush — so the persisted-tab effect silently clobbered a
    freshly-opened browser tab's `activeTab` back to `tabsState.active`. Fixed
    by moving the `useBrowserTabs(...)` call to AFTER that effect (and after
    the `launcherOpen` projectId-reset effect, preserving the original file's
    relative order for those). General lesson for the remaining clusters:
    when an effect inside a newly-extracted hook can race a **direct-value**
    `setState` call (not an updater fn) against an effect that stays inline,
    hook-CALL POSITION in the orchestrator — not just parameter wiring —
    is part of the extraction's correctness surface. Typecheck/guard cannot
    catch this; only the existing FileWorkspace test suite caught it (the
    `'creates and navigates a browser tab from a browser open request'` test).
    Run the FULL existing test suite after every cluster, not just the new
    hook's own tests.
  - Raw `setBrowserTabs` had to stay exposed on the controller (not just the
    higher-level actions) because the not-yet-extracted cluster 3 (`openFile`,
    the `openRequest` effect) still reanchors `browserTabs` directly via
    `reanchorBrowserTabsToCurrentOrder` — mirrors `useWiredProjectFolders`
    exposing `setUploadDir` for the identical reason.
  - 12 new hook tests (`useBrowserTabs.test.tsx`), including one that
    specifically pins the LRU-cap-vs-pinned-tab interaction and one that
    exercises the `browserOpenRequest` prop end-to-end (including
    `focusOnly`). FileWorkspace.tsx: 1900 → 1701 lines.

## Cluster 5 — Tab launcher + tab-bar drag-reorder + toasts

- **Owns**: `launcherOpen`, `launcherToast` state; `launcherBtnRef`;
  `launcherContext`/`launcherActions` construction (~1483-1505, rebuilt
  fresh every render — must stay that way, see the existing comment);
  `draggedTabName`, `dragOverTab` state; `draggedTabNameRef`;
  `reorderPersistedTab`, `clearTabDragState`; the tab-bar-ref wheel-listener
  effect is cluster 1, NOT this cluster (that one has no launcher/DnD
  coupling).
- **Coupling to other clusters**: `launcherContext.createBrowser` calls
  cluster 4's `openBrowserTab`; `createSketch`/`createDocument` call
  already-extracted `startNewSketch` / cluster 2's `createMarkdownDocument`;
  `createTerminal` calls the existing `createTerminal` project state helper
  directly (not a cluster). `reorderPersistedTab` reads `persistedTabs`/
  `tabsState.active` and calls `onTabsStateChange` (cluster 3, param).
- **Target**: `hooks/useWorkspaceLauncher.hooks.ts` for
  launcher state/toast, and `hooks/useTabReorderDnd.hooks.ts` (or fold into
  the launcher hook if small enough once isolated — decide at extraction
  time) for the drag-reorder state + handlers. `launcherContext`/
  `launcherActions` construction can move into the launcher hook's return
  value since it is pure composition over already-injected callbacks.
- **Extraction shape**: feature-local hook(s), deps-bag params.
- **Risk**: low-medium — launcher/DnD state is fairly self-contained; the
  main hazard is `launcherContext` closing over fresh `browserTabs` (per
  the existing "Built fresh each render" comment) — preserve that, don't
  memoize it.
- **Status**: done, split into two hooks exactly as the plan anticipated:
  - `hooks/useWorkspaceLauncher.hooks.ts` (`useWorkspaceLauncher`, no port)
    owns `launcherOpen`/`launcherToast`/`launcherBtnRef`/
    `openWorkspaceTabLauncher`/`launcherContext`/`launcherActions`.
    `launcherContext` stayed a plain object literal rebuilt every call (not
    memoized), preserving the "Built fresh each render" behavior the
    original comment called out. `createTerminal` (from `state/projects`)
    is called directly, not wrapped in a slice port — confirmed against the
    guard: rule 2 (only `dependencies.ts` may import `providers/`) only
    matches paths under `apps/web/src/providers/`, and `state/projects` is
    outside that, so a direct import here is not a boundary violation; the
    forbidden-globals check also only flags literal `fetch`/`window`/etc.
    identifiers written IN the slice file itself, not transitive calls
    inside an imported helper.
  - `hooks/useTabReorderDnd.hooks.ts` (`useTabReorderDnd`, no port) owns
    `draggedTabName`/`dragOverTab`/`draggedTabNameRef` and turns the
    previously-inline JSX drag arrow functions into named handlers
    (`handleTabDragStart`/`handleTabDragOver`/`handleTabDragLeave`/
    `handleTabDrop`/`handleTabDragEnd`/`handleTabBarDragLeave`/
    `handleTabBarDrop`) taking `(name, event)` — mirrors the
    `updateBrowserTabInfo(browserTab.id, info)` call-shape cluster 4 already
    established, rather than exposing raw setters/refs to JSX.
  - **Gotcha**: `RefObject<T | null>` vs `RefObject<T>` in a hook's return
    type. `launcherBtnRef` was first typed `RefObject<HTMLButtonElement |
    null>` in the controller interface (mirroring how `tabsBarRef` is typed
    as a hook PARAM elsewhere) — but typecheck failed assigning it to JSX
    `ref={launcherBtnRef}`. This repo's `@types/react@18` already defines
    `RefObject<T>.current` as `T | null`, so doubling the null
    (`RefObject<T | null>`) makes TS infer `T` itself as `HTMLButtonElement |
    null` and fails the JSX `Ref<HTMLButtonElement>` check because null
    isn't assignable to the target's bare `HTMLButtonElement` type
    parameter. This only bites when a ref is OWNED and RETURNED by a hook
    (not just threaded through as a param, where the orchestrator's own
    JSX still binds to its own un-reinterpreted local ref) — the fix is
    `RefObject<HTMLButtonElement>` (no explicit `| null`) on any hook-owned
    ref that JSX will bind `ref={...}` to directly.
  - No effect-ordering hazard here (unlike cluster 4) since neither hook has
    a `useEffect` — both are pure state/dispatch, so hook CALL POSITION in
    the orchestrator didn't need special placement.
  - 18 new hook tests (`useWorkspaceLauncher.test.tsx` +
    `useTabReorderDnd.test.tsx`). FileWorkspace.tsx: 1701 → 1634 lines.

## Cluster 6 — Design-files-panel nav-state ref + upload-picker plumbing

- **Owns**: `designFilesNavProjectIdRef`, `designFilesNavRef`,
  `onDesignFilesNavStateChange` (render-time reset mirrors the
  `projectFolders` pattern, ~495-503); `showLibraryPicker` state + the
  `LibraryPicker`/`applyLibraryAsset` JSX block (~2110-2133, currently
  inline in the orchestrator's return).
- **Coupling to other clusters**: `applyLibraryAsset`'s confirm handler
  calls `onRefreshFiles` + `openFile` (cluster 3, param) and reads
  `uploadDir` (cluster 2, param).
- **Target**: small — could fold into cluster 2 (both are "design files
  panel side-state") rather than its own hook; decide at extraction time
  based on how cluster 2 turns out. If folded, note the merge in cluster
  2's entry when done.
- **Extraction shape**: feature-local hook (small) or merged into cluster 2.
- **Risk**: low.
- **Status**: pending.

## Cluster 7 — Page-view analytics mount effect

- **Owns**: `fileManagerViewedProjectRef` + the single mount/`projectId`-change
  `trackPageView` effect (~424-428).
- **Coupling**: none beyond `projectId`/`analytics.track`.
- **Target**: trivial — either a one-line `usePageViewOnce(projectId,
  analytics.track)` hook, or leave in the orchestrator as an allowed
  "accumulating-subscription effect" per Phase 8's escape-hatch order (it
  has no branching/business logic, so Phase 8 step 1's "is it pure" test
  doesn't really apply — this is arguably already compliant). Decide at
  Phase 8.5 audit time; do not spend a dedicated commit on this alone —
  batch it with whichever neighboring cluster's commit touches this region.
- **Risk**: negligible.
- **Status**: pending (defer to Phase 8.5 audit).

## Suggested execution order

1. Cluster 1 (DOM effects) — done this pass, lowest risk, unblocks nothing
   but shrinks the file safely.
2. Cluster 2 (upload/file CRUD) — self-contained, moderate payoff.
3. Cluster 4 (browser tabs) — before cluster 3, since cluster 3's hook
   should take browser-tab callbacks as already-hook-owned params rather
   than raw setters.
4. Cluster 5 (launcher + DnD) — same reasoning as cluster 4, do before
   cluster 3.
5. Cluster 3 (tab activation) — last of the big four; by this point it's
   the only remaining hub and its param surface is as small as it can get.
6. Cluster 6 — fold into cluster 2's commit if still small when reached.
7. Cluster 7 + Phase 8.5 audit — final pass before the sentinel.

Clusters 2 and 4 do NOT share state/functions directly (only via
already-injected `openFile`/`commitTabsState` params) — they are
parallelizable per SKILL.md Phase 1 step 5 if a future pass has budget for
worktree-isolated subagents. Cluster 5 also does not share state with 2 or
4 directly. Cluster 3 must NOT be parallelized with anything — it is the
integration point for all of them.
