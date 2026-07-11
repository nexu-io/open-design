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
- **Status**: pending.

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
- **Status**: pending.

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
- **Status**: pending.

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
