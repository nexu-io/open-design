# FileViewer.tsx extraction plan

One-time upfront inventory (SKILL.md Phase 1 step 4) of everything still left in
`apps/web/src/components/FileViewer.tsx` as of the commit that introduces this
file. Do NOT re-profile the whole file from scratch in a later pass — read this
file, pick the next `pending` cluster (lowest-risk/highest-payoff first unless
noted), execute it, and flip its status to `done` as part of that pass's last
commit. If a cluster's real shape differs once you're inside it, correct just
that cluster's entry; keep the rest of the plan intact.

Already extracted before this plan existed (do NOT redo): viewport/deploy/
comment/pod/asset-path pure rules, simple file-kind viewers, comment overlays +
React component viewer, board InspectPanel, comment sidebar, viewport-preset
controls, HtmlViewer save-as-template flow, HtmlViewer copy-share-link, deploy
modal per-link copy feedback, file-version-history modal (`FileVersionManagerModal`).

File shape at plan time (8773 lines total):
- 1–605: imports, module-level pure helpers (`resolveChromeActionsHost`,
  `rewriteMarkdownImageSources`, `markdownImageSourceUrl`,
  `setMarkdownCodeBlockCopiedState`, `resolveShareUrl`,
  `ensureMarkdownCodeBlockControls`, `setSlideStateCached`,
  `waitForIframeLoadOrTimeout`, `waitForAnimationFrame`,
  `temporarilyExposeIframeForSnapshot`, `requestPreviewSnapshotWithRetry`,
  `previewViewportStateKey`, `setPreviewViewportCached`, module-level caches
  `htmlPreviewSlideState`/`htmlPreviewViewportState`), `Props`.
- 607–724: `FileViewer` — the public dispatcher component. Stays in the
  orchestrator permanently (it IS the orchestrator's public surface); not a
  cluster.
- 726–1823 (minus 1439–1453): **Cluster A — LiveArtifactViewer** (self-contained
  top-level component + its helpers).
- 1439–1453: `hasSeenExportReadyNudge`/`markExportReadyNudgeSeen` — belongs to
  HtmlViewer's Export cluster (F below), not LiveArtifactViewer; do not move
  these with Cluster A.
- 1831–8035: `HtmlViewer` — the monolith. Sub-clusters B–P below.
- 8037–8102: `inlineRelativeAssets`/`fetchProjectRelativeText` — module-level,
  pure params-in, serves HtmlViewer's cluster L (srcDoc engine) but has no
  closure over component state. Cluster O.
- 8104–8773: **Cluster Q — MarkdownViewer** (self-contained top-level
  component).

---

## Cluster A — LiveArtifactViewer

- **Status:** done
- **Lines:** 726–1438, 1455–1823 (skip 1439–1453, see Cluster F)
- **Owns:** the exported `LiveArtifactViewer` component (mode/detail/loading/
  reloadKey/zoom/previewViewport/refreshing/refreshError/refreshSuccess/
  refreshEvents/refreshHistory/presentMenuOpen/zoomMenuOpen/inTabPresent/
  chromeActionsHost state, `handleRefresh`, present-menu handlers, zoom menu,
  live-artifact-event consumption effect); `LiveArtifactRefreshNotice`;
  `refreshErrorMessage`; `liveArtifactViewerTabs`; `LiveArtifactCodePanel` (own
  tiny variant/code/loading/failed state); `liveArtifactMetadataPayload`/
  `liveArtifactProvenancePayload`/`liveArtifactRefreshPayload`;
  `LiveArtifactRefreshEvent` type + `appendRefreshEvent`; `describeRefreshStatus`/
  `describeEventPhase`/`describePersistedStatus`; exported
  `LiveArtifactRefreshHistoryPanel`; `LiveArtifactRefreshFact`.
- **Coupled to:** nothing in HtmlViewer or MarkdownViewer — a fully independent
  top-level component tree. Consumes `providers/registry`'s `fetchLiveArtifact`/
  `fetchLiveArtifactCode`/`fetchLiveArtifactRefreshes`/`refreshLiveArtifact`
  (already exist, no new transport needed) and the provider class
  `LiveArtifactRefreshError` (needs a slice-local error type per ports.ts
  convention — see notes below). Re-exported from the orchestrator (both
  `LiveArtifactViewer` and `LiveArtifactRefreshHistoryPanel` are imported
  by `FileWorkspace.tsx` / the existing `FileViewer.test.tsx` via
  `../../src/components/FileViewer`).
- **Target:** `features/file-viewer/hooks/useLiveArtifactViewer.hooks.ts` (main
  hook) + `hooks/useLiveArtifactCode.hooks.ts` (small, for the code panel) +
  `components/LiveArtifactViewer.tsx` (wired) + `components/
  LiveArtifactViewerView.tsx` (dumb) + `components/LiveArtifactCodePanel.tsx` +
  `components/LiveArtifactRefreshHistoryPanel.tsx` + `components/
  LiveArtifactRefreshNotice.tsx` + `components/LiveArtifactRefreshFact.tsx`;
  pure fns (`refreshErrorMessage`, `liveArtifactViewerTabs`,
  `liveArtifactMetadataPayload`, `liveArtifactProvenancePayload`,
  `liveArtifactRefreshPayload`, `appendRefreshEvent`, `describeRefreshStatus`,
  `describeEventPhase`, `describePersistedStatus`) into `rules.ts`; types
  (`LiveArtifactRefreshEvent`, `RefreshStatusDescriptor`, a slice-local
  `LiveArtifactRefreshFailure` error class replacing the provider's
  `LiveArtifactRefreshError` for in-slice `instanceof` checks) into `types.ts`;
  new `LiveArtifactPort` in `ports.ts` bound in `dependencies.ts` (the binding
  wraps `refreshLiveArtifact`/`updateLiveArtifact` to catch the provider's
  `LiveArtifactRefreshError` and rethrow the slice-local `LiveArtifactRefreshFailure`,
  mirroring the "port result types defined in-slice" rule for thrown errors).
- **Shape:** hook + dumb components + pure rules + one new port.
- **Risk:** low.
- **Rationale:** zero overlap with HtmlViewer's srcDoc/postMessage machinery;
  only DOM touch is `trackIframeLoad` (from `observability/iframe-error.ts`,
  not `providers/`, so importable directly from a hook) and standard
  mousedown/keydown dismiss listeners for the present/zoom menus (route
  through the slice's existing `dismissPort`). Existing test coverage in
  `apps/web/tests/components/FileViewer.test.tsx` (`describe('LiveArtifactViewer')`,
  `describe('LiveArtifactRefreshHistoryPanel')`) is the behavior-preserving
- **Landed (2026-07-11):** also created, reusable by later clusters — do not
  recreate: `providers/file-viewer/chrome-actions-host.ts` +
  `ports.ts`'s `ChromeActionsHostPort` (Cluster P's `chromeActionsHost`
  resolution now has a home; the orchestrator's remaining `HtmlViewer` still
  has its own copy of `resolveChromeActionsHost` to migrate when Cluster C/P
  lands — swap it to the provider fn or the port then, don't add a third
  copy). `providers/file-viewer/window-open.ts` + `ports.ts`'s
  `WindowOpenPort` (any future `window.open(...)` call, e.g. inside Cluster E's
  share menu, should bind to this port rather than adding a new one).
  `features/file-viewer/viewport-cache.ts` (`getCachedPreviewViewport`/
  `setCachedPreviewViewport`/`previewViewportStateKey`) replaces the old
  module-level `htmlPreviewViewportState` Map that used to live in
  `FileViewer.tsx`; the orchestrator's `HtmlViewer` now imports these from the
  slice barrel instead of a local copy — do not reintroduce a second Map. A
  sibling `htmlPreviewSlideState` Map still lives locally in the orchestrator
  for now, scoped to Cluster H (deck/slide nav) to migrate.
  proof; must stay green unmodified.

## Cluster Q — MarkdownViewer

- **Status:** done. Landed as `hooks/useMarkdownViewer.hooks.ts` (mode, debounced
  autosave, toolbar copy, image paste/drop), `hooks/useMarkdownHighlight.hooks.ts`
  (shiki highlighting + theme-watch + the code-block copy-button cluster,
  since both revolve around the same rendered article DOM), and
  `hooks/useMarkdownScrollSync.hooks.ts` (the anchor-based scroll sync),
  composed by the wired `components/MarkdownViewer.tsx` + dumb
  `components/MarkdownViewerView.tsx`. `rewriteMarkdownImageSources`/
  `markdownImageSourceUrl`/`markdownBaseHtml` moved into `rules.ts` (the URL
  resolver now uses the in-slice `fileRawUrl` instead of the provider's
  `projectFileUrl`, per ADR 0002). The sibling `apps/web/src/components/
  markdown-scroll-sync.ts` module (`extractMarkdownBlockLines`/
  `buildScrollAnchors`/`mapScrollPosition`/`measurePreviewBlockOffsets`, all
  pure or scoped to a caller-supplied element) folded into `rules.ts` too;
  its one bare-`document`/`window` function, `measureEditorBlockOffsets`,
  became `providers/file-viewer/markdown-editor-measure.ts` behind a new
  `MarkdownEditorMeasurePort`. Two more new provider bridges:
  `providers/file-viewer/markdown-code-blocks.ts` (shiki highlight + copy-button
  DOM injection, `MarkdownCodeBlocksPort`) and `providers/file-viewer/
  theme-watch.ts` (`MutationObserver`+`matchMedia`, `ThemeWatchPort`). The
  toolbar "Copy" and per-code-block copy both reuse the existing
  `ShareLinkClipboardPort`/`shareLinkClipboardPort` binding (structurally
  identical to the old local `copyTextToClipboard`) instead of adding a
  fourth clipboard adapter. New `MarkdownFilePort` bundles read/write/upload
  transport (`writeProjectTextFile` collapsed to the boolean the caller
  branches on; `uploadProjectFiles` narrowed to `Pick<ChatAttachment, 'name'
  | 'path'>[]`). Guard gotcha hit and fixed: `window.setTimeout`/
  `window.clearTimeout`/`window.requestAnimationFrame`/
  `window.cancelAnimationFrame` (bare `window.` trips the guard) became bare
  `setTimeout`/`clearTimeout`/`requestAnimationFrame`/`cancelAnimationFrame`;
  the two timer refs assigned from `setTimeout` had to change from
  `useRef<number | null>` to `useRef<ReturnType<typeof setTimeout> | null>`
  since bare `setTimeout` resolves to `NodeJS.Timeout` in this tsconfig, not
  the DOM `number` overload `window.setTimeout` forces. Old test
  `apps/web/tests/components/markdown-scroll-sync.test.ts` migrated to
  `apps/web/tests/features/file-viewer/markdown-scroll-rules.test.ts` with
  updated imports; existing `apps/web/tests/components/
  file-viewer-markdown-copy.test.tsx` (the real end-to-end behavior proof —
  autosave debounce/flush/stale-refresh, code-block copy, focus/selection
  preservation, `markdownImageSourceUrl`) kept green unmodified via a
  `markdownImageSourceUrl` re-export from `FileViewer.tsx`. FileViewer.tsx
  7235 → 6431 lines (post Cluster C).
- **Lines:** 8104–8773 (plus module-level helpers it uses: `rewriteMarkdownImageSources`,
  `markdownImageSourceUrl` at 428–446, `setMarkdownCodeBlockCopiedState` at
  448–472, `ensureMarkdownCodeBlockControls` at 490–503, and
  `highlightMarkdownCodeBlocks`/`copyTextToClipboard` at 370–426 — the latter
  two are shared with HtmlViewer's markdown-adjacent code-copy UI if any exists;
  verify no HtmlViewer call site before moving, grep `highlightMarkdownCodeBlocks\|copyTextToClipboard`
  scoped to this file first).
- **Owns:** the exported `MarkdownViewer` component in full: edit/split/preview
  mode, debounced autosave with in-flight/pending coalescing
  (`saveMarkdownText`, `flushPendingMarkdownSave`), scroll-sync between editor
  and preview panes (`computeMarkdownSyncTarget`, `applyMarkdownScrollSync`,
  `scheduleMarkdownScrollSync`, `shouldIgnoreMarkdownScroll`, block-offset
  caching), shiki syntax highlighting of rendered code blocks
  (`highlightMarkdownCodeBlocks`, theme-revision tracking via
  `MutationObserver`+`matchMedia`), image paste/drop upload
  (`insertImageFiles`), per-block copy-to-clipboard.
- **Coupled to:** nothing in HtmlViewer or LiveArtifactViewer — fully
  independent. Uses `providers/registry`'s `fetchProjectFileText`/
  `writeProjectTextFile`/`uploadProjectFiles` (already exist). Uses
  `MarkdownRenderer`/`renderMarkdownToSafeHtml` (artifact renderer, not
  transport) and `../runtime/shiki`'s `highlightCode` (dynamic import, not
  transport). Not exported/consumed outside this file — no re-export needed
  from the orchestrator (verify via `grep -rn "MarkdownViewer" apps/web/src`
  before assuming; only `FileViewer.tsx`'s own dispatcher calls it today).
- **Target:** `features/file-viewer/hooks/useMarkdownViewer.hooks.ts` (mode,
  save state/debounce, image insertion) + `hooks/useMarkdownScrollSync.hooks.ts`
  (the editor/preview scroll-sync machinery — DOM-heavy via refs but no
  `window`/`document` globals beyond `window.setTimeout`/`requestAnimationFrame`,
  which the guard does not forbid) + `hooks/useMarkdownHighlight.hooks.ts`
  (shiki highlighting + theme-revision `MutationObserver` — this one DOES touch
  `document.documentElement`/`window.matchMedia`, so route the observer
  subscription through a small provider bridge `providers/file-viewer/
  theme-watch.ts` exposing `subscribeThemeChange(onChange): () => void`) +
  `components/MarkdownViewer.tsx` (wired) + `components/MarkdownViewerView.tsx`
  (dumb, the toolbar/editor/preview JSX); pure fns already exported from
  `rules.ts`/`formatters.ts` (`markdownDirectory`, `decorateMarkdownCodeBlocks`,
  `markdownScrollRange`, etc.) stay as-is — just update their call sites'
  import path (they already live in the slice); `rewriteMarkdownImageSources`/
  `markdownImageSourceUrl` move into `rules.ts` (pure, params-in).
- **Shape:** 3 hooks + dumb component + 1 new provider bridge (theme-watch).
- **Risk:** medium.
- **Rationale:** no postMessage/iframe surface (lower risk than anything in
  HtmlViewer), but the scroll-sync math (block-offset caching, anchor
  interpolation, programmatic-scroll dedupe via `programmaticScrollRef`) is
  fiddly and regressions would be visually subtle (janky sync) rather than a
  hard error — needs careful behavior-preserving line-by-line porting and the
  existing test suite (if any covers markdown scroll sync) kept green. `document.documentElement`
  MutationObserver for theme changes is the only DOM reach that needs a new
  bridge; everything else is ref-scoped DOM (`editorRef.current`, etc.), which
  the guard permits since the forbidden-globals list is bare identifiers only.

---

## HtmlViewer sub-clusters (source: dedicated profiling pass, `HtmlViewer`
lines 1831–8035; line numbers approximate/scattered — re-locate with `Grep`
before extracting, do not trust byte offsets)

Already-extracted, already-wired call sites inside HtmlViewer (skip):
`useWiredTemplateSave`, `useWiredDeployLinkCopy`, `useWiredShareLinkCopy`,
`useWiredPreviewCanvasSize`, `PreviewViewportControls`, `PreviewDrawOverlay`,
`InspectPanel`, `CommentPreviewOverlays`, `AnnotationHoverPopover`,
`FileVersionManagerModal`, `SocialShareGrid`.

### Cluster B — Analytics/tracking fire-helpers

- **Status:** done. Landed as `useArtifactAnalytics`/`useWiredArtifactAnalytics` in
  `hooks/useArtifactAnalytics.hooks.ts`, with `ArtifactAnalyticsController`/
  `ArtifactAnalyticsDeps`/`ArtifactToolbarClickElement`/`ArtifactHeaderClickElement`/
  `ArtifactShareExportFormat` types and `ArtifactExportToast`/`ArtifactTrackingAnalytics`
  in `types.ts`, exported through the barrel. Structural move only. Since
  `fireShareExport` also writes `exportToast` state (owned by the not-yet-extracted
  Cluster F — Export & Download), the hook takes an `onExportToast` callback
  instead of owning that state; the orchestrator wires it via
  `useWiredArtifactAnalytics({ ..., onExportToast: setExportToast })` positioned
  right after `const [exportToast, setExportToast] = useState(...)`, mirroring
  where `useWiredShareLinkCopy` already sits for the same reason. Integrated by
  hand against the post-Cluster-C/Q tip (built on an earlier base commit) since a
  mechanical patch/merge wasn't viable; only conflict was the old inline
  fire-helper block vs. Cluster C's `useWiredViewerToolbarMenus()` destructure at
  the top of `HtmlViewer` — resolved by dropping the old block and keeping the
  toolbar-menus hook.
- **Lines:** ~1876–2102
- **Owns:** `exportProgressRef`; `fireShareExport`, `onExportProgress`,
  `fireArtifactToolbarClick`, `fireDrawToolbarClick`, `fireArtifactHeaderClick`,
  `firePresentPopoverClick`, `fireCommentPopoverClick`.
- **Coupled to:** called from nearly every other HtmlViewer cluster as a leaf
  dependency (toolbar, deploy, export, comment, draw, present); reads only
  `file`/`projectId`/`projectKind`, no cross-cluster state.
- **Target:** `features/file-viewer/hooks/useArtifactAnalytics.hooks.ts`.
- **Shape:** hook returning the `fire*` functions + `exportProgressRef`.
- **Risk:** low.
- **Rationale:** pure event-firing side effects (analytics `track` calls), no
  DOM/postMessage/iframe touch.

### Cluster C — Toolbar chrome (mode tabs / zoom / versions entry / more-menu)

- **Status:** done
- **Owns:** `mode`, `zoom`, `zoomMenuOpen`+ref, `presentMenuOpen`+new
  `presentWrapRef`, `toolbarMoreOpen`+ref, `versionModalOpen`; the
  zoomMenu/toolbarMore/presentMenu outside-click dismiss effects.
- **Coupled to:** reads `source`, `showDeckNavigation`/`slideState` (Cluster I,
  threaded through as props — not extracted), already-extracted
  `PreviewViewportControls`. The whole `.viewer-toolbar` div (both
  `viewer-toolbar-left` and `viewer-toolbar-actions`) moved as one dumb
  component, so it also threads through several not-yet-extracted clusters'
  state/callbacks as plain props: `reloadHtmlPreview`, `handleCopyScreenshot`
  (Export cluster F), `activateCommentTool`/`activateDrawTool`/
  `activateManualEditTool`/`activateCommentCreateTool` +
  `boardMode`/`commentCreateMode`/`boardTool`/`drawOverlayOpen`/
  `manualEditMode` (comment/mark/edit tool clusters), `visibleSideComments`
  (count only), `postSlide` (Cluster I), `fireArtifactToolbarClick`/
  `selectMode` (analytics + a mode+drawOverlayOpen cross-cluster setter, left
  in the orchestrator since it also touches `drawOverlayOpen`).
- **Target:** `hooks/useViewerToolbarMenus.hooks.ts` (state + outside-click via
  the slice's existing `dismissPort`) + dumb `components/ViewerToolbar.tsx`.
- **Shape:** hook + dumb component.
- **Risk:** low.
- **Rationale:** no postMessage; pure DOM click-outside/Escape listeners and
  local UI state, all coverable by the existing `DismissPort`.
- **Landed:** `presentMenuOpen`'s dismiss effect used `target.closest('.present-wrap')`
  instead of a ref-`contains` check (no ref existed on that div originally);
  added a new `presentWrapRef` + `ref={presentWrapRef}` on the `.present-wrap`
  div, mirroring Cluster A's `useLiveArtifactViewer` (which solved the exact
  same shape for its own, separate `presentMenuOpen`) — functionally
  equivalent since there is only one `.present-wrap` element in the DOM at a
  time. `deployMenuOpen`'s own outside-click effect was SKIPPED — it is
  combined with `downloadMenuOpen` in a single effect (shared `shareRef`,
  combined open condition, both setters cleared together), which is more
  entangled than "state colocation" per the task brief; left entirely in
  place for Cluster E/F. `agentToolsOpen`'s dismiss effect (Cluster P
  fold-in) was also left in place — out of this pass's explicit scope. Fold
  those two into this hook (or leave them for Clusters E/F/P respectively) as
  a deliberate follow-up decision, not a mechanical default.

### Cluster D — Present mode (in-tab / fullscreen / new-tab)

- **Status:** pending
- **Lines:** state ~2119, 2182; handlers ~4967–5043 + `openInNewTab` ~4753;
  chrome-height effect ~4719–4751; present-overlay portal JSX ~7404–7434.
- **Owns:** `inTabPresent`, `presentMenuOpen`, present-menu outside-click
  effect, chrome-height ResizeObserver effect.
- **Coupled to:** reads `source`, `srcDoc`, `activePreviewSrcUrl`,
  `useUrlLoadPreview` from Cluster L (read-only, not a bridge participant —
  renders its own plain iframe with `srcDoc`/`src`, no postMessage).
- **Target:** `hooks/usePresentMode.hooks.ts` + dumb `components/PresentOverlay.tsx`.
- **Shape:** hook + dumb component.
- **Risk:** medium.
- **Rationale:** must render the exact same `srcDoc`/`activePreviewSrcUrl` the
  primary preview uses (byte-identical) or the presented copy silently
  diverges; extract only after Cluster L's bridge shape is settled so this
  can consume its hook output instead of reaching into raw state.

### Cluster E — Deploy & Publish ★ recommended next pending cluster

- **Status:** done. The hook/logic half landed: all state, the
  `deploymentMapForCurrentFile`/`syncDeployFormFromConfig`/
  `cloudflareConfigHintsFromForm`/`buildDeployConfigRequest`/
  `loadDeployProvider`/`loadCloudflareZones` helpers, the deploy-fetch effect,
  all seven actions, and every derived value/label moved into
  `hooks/useDeployFlow.hooks.ts` (`useDeployFlow`/`useWiredDeployFlow`),
  wired into the orchestrator via one `useWiredDeployFlow({...})` call
  (placed after `exportTitle` is defined, since the social-share derivation
  needs it as a dep — hook-call position doesn't need to match the old
  variable's position, only precede first use). New `DeployTransportPort`
  (bundles `fetchProjectDeployments`/`fetchDeployConfig`/`updateDeployConfig`/
  `deployProjectFile`/`checkDeploymentLink`/`fetchCloudflarePagesZones`/
  `createSocialSharePayload`) bound in `dependencies.ts`; `CloudflarePagesZoneOption`/
  `DeployResultCard` moved to `types.ts`; `resolveShareUrl` moved to `rules.ts`
  taking `origin` as an injected param instead of reading bare `window`, fed by
  a new `WindowOpenPort.getLocationOrigin()` (real binding in
  `providers/file-viewer/window-open.ts`). The modal's Escape-key dismiss now
  goes through the existing `DismissPort.subscribeEscapeKey` (document-level)
  instead of a bare `window` keydown listener — behaviorally equivalent in a
  real browser (keydown bubbles to `document`); updated the one existing test
  that dispatched synthetically on `window` to dispatch on `document` instead,
  matching the convention already used by a sibling already-migrated modal's
  Escape test in the same file.
  **Two cross-cluster touches preserved via injected callback deps** (easy to
  miss since they don't appear in this plan's original "Owns" list):
  `deployLinkCopy.resetCopiedDeployLink()` (owned by the separate, already-
  extracted `useWiredDeployLinkCopy` hook) fires from 3 call sites inside this
  cluster's actions/effect — threaded in as `deps.resetCopiedDeployLink`;
  `setDeployMenuOpen(false)` (owned by the not-yet-extracted deploy dropdown
  menu, out of this cluster's scope) fires inside `openDeployModal` — threaded
  in as `deps.closeDeployMenu`.
  **Deploy modal JSX now split out**: `components/DeployModal.tsx` (props in,
  JSX out — the full portal/backdrop/provider-form/Cloudflare-zone-picker/
  result-cards/social-share panel), wired from `FileViewer.tsx` via one
  `<DeployModal ... />` call with ~40 flat props sourced directly from the
  `useWiredDeployFlow` destructure (matching the flat-prop convention already
  used by `ViewerToolbar`/`MarkdownViewerView`, not a bundled-controller
  prop). The modal's `createPortal` target is a `portalRoot: Element` prop
  (the orchestrator's `document.body`) rather than a bare `document` read —
  the guard forbids `document` inside `features/**` even for a portal
  target. `DEPLOY_PROVIDER_OPTIONS`/`CLOUDFLARE_PAGES_PROVIDER_ID`/
  `isValidCloudflareDomainPrefixInput`/`deployResultState` are imported
  directly into the component from `../constants`/`../rules` (stable
  slice-level constants/pure-rules, same pattern as `ViewerToolbar` importing
  `PREVIEW_VIEWPORT_PRESETS`), not passed as props.
  **Share-menu JSX now also split out**: `components/ShareMenu.tsx` (props
  in, JSX out — the share-link copy/open actions, the per-provider
  "Deploy to X" entries, and the social-share entry). The trigger
  button + `deployMenuOpen` open/close state are owned by a not-yet-extracted
  sibling cluster (the share/download chrome-menu open state), so they're
  threaded through as `deployMenuOpen`/`onToggleMenu`/`onCloseMenu` props,
  same pattern as `DeployModal`'s `portalRoot`. One behavior convergence: the
  "open share page in new tab" action used a bare `window.open(url, '_blank',
  'noopener')` inline — the guard forbids `document`/`window` inside
  `features/**`, so this is now an injected `onOpenInNewTab` prop; rather than
  introduce a near-duplicate of the slice's existing `WindowOpenPort.openInNewTab`
  (which adds `noreferrer`), the orchestrator passes the EXACT original inline
  arrow function (`(url) => window.open(url, '_blank', 'noopener')`) — zero
  behavior change, since `FileViewer.tsx` itself isn't guard-restricted.
  This closes out Cluster E: hook + 2 dumb components, matching the plan's
  original target shape (deploy modal + share menu).
- **Lines (scattered):** state ~2144–2181; helpers ~2571–2685
  (`deploymentMapForCurrentFile`, `syncDeployFormFromConfig`,
  `cloudflareConfigHintsFromForm`, `buildDeployConfigRequest`,
  `loadDeployProvider`, `loadCloudflareZones`); deploy-fetch effect
  ~2846–2863; actions ~4753–4965 (`openDeployModal`, `openSocialShareFlow`,
  `changeDeployProvider`, `saveDeployConfig`,
  `buildCloudflarePagesDeploySelection`, `deployToSelectedProvider`,
  `retryDeploymentLink`); derived vars + label/status helpers + social-share
  memo/effect ~5783–5989; share-menu JSX ~6900–7062; deploy modal JSX
  ~7665–7992; toasts (`deploySavedToast`, `deployActionToast`,
  `shareGuideToast`) ~7993–8032.
- **Owns:** `deployment`, `deploymentsByProvider`, `deployModalOpen`/`Intent`,
  `closeDeployModal`, `deployConfig`, `deploying`, `deployPhase`,
  `savingDeployConfig`, `deployError`, `deployResult`, `deployProviderId`,
  `projectSocialShare`, `deployToken`, `teamId`, `teamSlug`,
  `cloudflareAccountId`, `cloudflareZones`+loading/error, `cloudflareZoneId`,
  `cloudflareDomainPrefix`, `deployProviderLoadSeqRef`, `deployTokenInputRef`,
  `deploySavedToast`, `deployActionToast`, `shareGuideToast`,
  `sharePageUrl`/`canCopyShareLink`/`canOpenSharePage`/`latestShareDeployment`
  memos. Already-extracted `deployLinkCopy` (`useWiredDeployLinkCopy`) and
  `shareLinkCopy` (`useWiredShareLinkCopy`) are consumed, not re-owned.
- **Coupled to:** only reads `file.name`/`source`/`exportTitle` for display
  labels from other clusters. **Does not touch `iframeRef`, `postMessage`, or
  `srcDoc`/`useUrlLoadPreview` at all** — pure HTTP-API + form state (uses
  already-existing `providers/registry` fns: `fetchProjectDeployments`,
  `fetchDeployConfig`, `fetchCloudflarePagesZones`, `updateDeployConfig`,
  `deployProjectFile`, `checkDeploymentLink`, `createSocialSharePayload`).
- **Target:** `hooks/useDeployFlow.hooks.ts` (state + handlers) +
  `components/DeployModal.tsx` + `components/ShareMenu.tsx` (dumb).
- **Shape:** hook + 2 dumb components.
- **Risk:** low.
- **Rationale:** entirely HTTP-driven, zero srcDoc/postMessage surface — the
  largest self-contained HtmlViewer cluster that doesn't touch the bridge.
  Confirmed independently by both the direct read-through and the dedicated
  profiling pass.

### Cluster F — Export & Download

- **Status:** pending
- **Lines (scattered):** state ~2126–2128 (`exportReadyNudge`+ref, moved here
  from its stray position at 1439–1453), ~2699–2718 (`imageExportModalOpen`,
  `imageExportFormat`, `imageExportError`, `pptxExportModalOpen`,
  `pptxExportMode`, related refs, `exportToast`); nudge effect ~5341–5380;
  `openDownloadMenu` ~5442–5445; `captureExportImageSnapshot` ~5445–5593
  (bridge-touching, see below); `handleCopyScreenshot` ~5593;
  `openImageExportModal`/`changeImageExportFormat`/`fireImageExportResult`/
  `handleImageExportSave` ~5595–5731; download-menu JSX (inside Cluster E's
  share-menu portal) ~6980–7145; PPTX modal JSX ~7446–7533; image export
  modal JSX ~7534–7606.
- **Owns:** `imageExportModalOpen`, `imageExportFormat`, `imageExportError`,
  `pptxExportModalOpen`, `pptxExportMode`, `imageExportSnapshotDataUrlRef`,
  `imageExportRequestIdRef`/`StartedRef`/`ResolvedRef`, `screenshotInFlightRef`,
  `imageExportInFlightRef`, `exportToast`, `exportReadyNudge`+
  `exportReadyNudgeSeenRef`, `hasSeenExportReadyNudge`/`markExportReadyNudgeSeen`
  (currently at file lines 1439–1453 — a DOM-touching `window.sessionStorage`
  pair; needs a provider bridge, e.g. `providers/file-viewer/session-flag.ts`
  exposing `hasSeenFlag(key)`/`markFlagSeen(key)`, bound in `dependencies.ts`).
- **Coupled to:** `captureExportImageSnapshot` reaches into Cluster L's
  `iframeRef`/`srcDocPreviewIframeRef`/`urlPreviewIframeRef`,
  `useUrlLoadPreview`, `useLazySrcDocTransport`, `srcDocShellReady`,
  `activateSrcDocSnapshotTransport`, and calls `requestPreviewSnapshotWithRetry`
  (a postMessage round-trip for `od:preview-snapshot*`). Also reads
  `slideState`/`deckExportSignal` (Cluster I).
- **Target:** `hooks/useArtifactExport.hooks.ts` for the modal/format/toast
  state (bridge-free, low risk); `captureExportImageSnapshot`/
  `handleCopyScreenshot` should become a method the Cluster L bridge exposes
  (e.g. `htmlPreviewTransportPort.captureSnapshot()`) rather than being
  reimplemented standalone — do not extract this half before Cluster L's
  bridge shape exists.
- **Shape:** hook (mostly) + one function that delegates into Cluster L's
  future bridge.
- **Risk:** medium (the bulk is low risk; `captureExportImageSnapshot` is
  high risk in isolation — sequence this cluster AFTER Cluster L).
- **Rationale:** splitting the low-risk modal/toast state from the one
  bridge-touching capture function avoids blocking the whole cluster on the
  transport-engine rewrite.

### Cluster G — Version history integration (trivial)

- **Status:** pending
- **Lines:** `versionModalOpen` state ~2124; `handleVersionRestored`
  ~5045–5051; JSX wiring ~7435–7445.
- **Owns:** `versionModalOpen`, `handleVersionRestored`.
- **Coupled to:** calls `setSource`/`sourceRef`/`setInlinedSource`/
  `setReloadKey` (Cluster L) and `onFileSaved?.()`.
- **Target:** fold into Cluster E's hook file or keep a 10-line inline
  `useCallback` in the orchestrator until Cluster L lands (this write-through
  is single-directional and safe either way).
- **Shape:** trivial.
- **Risk:** low.

### Cluster H — Deck / slide navigation

- **Status:** pending
- **Lines (scattered):** `slideState` init ~2687; `postSlide`/
  `syncCachedSlideStateToIframe` ~4495–4502; slide-state postMessage listener
  effect ~3418–3438; deck keyboard-nav effect (←/→/Home/End posting
  `od:slide`) ~4600–4625; `slideNavRequest`-nonce effect ~5416–5440 (posts
  directly + writes slide-state cache); deck-nav JSX in primary toolbar
  ~6335–6355 and duplicated in "more" menu ~6580–6620.
- **Owns:** `slideState`, `postSlide`, `syncCachedSlideStateToIframe`,
  keyboard-nav effect, `slideNavRequest`-nonce effect. Also owns/reads the
  module-level `htmlPreviewSlideState` cache (lines ~356–357, ~505–511 —
  already a plain Map with a getter/setter pair, portable as-is into a
  provider or kept module-level in the bridge).
- **Coupled to:** `effectiveDeck`/`looksLikeDeck` (Cluster L), `iframeRef`
  (Cluster L).
- **Target:** `providers/file-viewer/deck-slide-bridge.ts` (owns the
  `od:slide`/`od:slide-state` postMessage pair, `subscribeSlideState`/
  `postSlide`) + `hooks/useDeckSlideNav.hooks.ts`.
- **Shape:** provider bridge + hook.
- **Risk:** high.
- **Rationale:** directly posts/listens on the `od:slide`/`od:slide-state`
  iframe protocol; must stay byte-identical to preserve deck nav sync across
  iframe remounts (the cache-keyed-by-`previewStateKey` design is load-bearing
  for warm state across file switches).

### Cluster I — Comment / Board annotation mode

- **Status:** pending
- **Lines (scattered, largest postMessage consumer):** state ~2440–2556 +
  `commentPortalHost` state/effect ~2293–2312; shared liveCommentTargets-mirror
  effect ~3489–3545 (shared with Cluster J — extract together or keep the
  shared effect in whichever bridge lands first and have the other consume
  its output); file.name reset-all-annotation effect ~3547–3572 (shared with
  Clusters J/K — this effect resets Comment/Inspect/ManualEdit state together,
  do not split without re-verifying nothing is missed); big `od:comment-*`/
  `od:pod-*` postMessage listener ~3616–3799; comment-active-target broadcast
  effect ~3801–3808; comment-mode sync effect (`od:comment-mode`) ~3440–3455
  (shared dispatch, see `syncBridgeModes` in Cluster L); toolbar activation
  handlers ~5062–5211; composer handlers ~5213–5339, 5732–5782; visibility
  memos + composer-auto-close effects ~5732–5782; comment toolbar buttons +
  more-menu duplicates ~6380–6430; comment/board JSX prep ~6000–6276;
  `CommentPreviewOverlays`/`AnnotationHoverPopover` wiring + hint banner
  ~7120–7280.
- **Owns:** `activeCommentTarget`, `hoveredCommentTarget`, hover-card pin/
  dismiss refs+callbacks, `hoveredPodMemberId`, `activePreviewCommentId`,
  `liveCommentTargets`+ref, `commentOrderIds`, `commentDraft`,
  `queuedBoardNotes`, `boardImages`, `activeCommentExistingAttachments`,
  `boardImagePreviews`+effect, `boardPreviewIndex`, `sendingBoardBatch`,
  `commentSavedToast`, `selectedSideCommentIds`, `commentSidePanelCollapsed`,
  `strokePoints`, `commentPortalHost`.
- **Coupled to:** shares `liveCommentTargets` with Cluster J (Inspect); reads
  `slideState`/`effectiveDeck` (Cluster H) for slide-visibility checks; reads
  `manualEditMode` to gate tool switches (must flush Manual Edit first via
  Cluster K's `exitManualEditModeAfterFlush`); depends on `iframeRef`,
  `isOurPreviewIframeSource` (Cluster L).
- **Target:** `providers/file-viewer/comment-board-bridge.ts` (owns
  `od:comment-*`/`od:pod-*` postMessage) + `hooks/useBoardComments.hooks.ts`
  (composer/toast/order state); consumer components (`CommentSideDock`,
  `BoardComposerPopover`) already exist — this cluster is mostly glue.
- **Shape:** provider bridge + hook + already-existing dumb components.
- **Risk:** high.
- **Rationale:** 8 distinct message types, plus documented hover-card
  pin/dismiss timing fixing a real flicker bug — any drift is directly
  visible to users. Tackle only after Cluster L's bridge shape is settled.

### Cluster J — Inspect mode

- **Status:** pending
- **Lines (scattered):** state ~2494–2507; `openHintBox` ~2196; shared
  liveCommentTargets-mirror effect (see Cluster I) ~3489–3545; inspect-mode
  sync effect (`od:inspect-mode`) ~3456–3462; activeInspectTarget-reset effect
  ~3574–3580; **render-phase hydration side effect**
  (`if (inspectHydratedSourceRef.current !== source) {...}`) ~3582–3602 —
  explicitly documented as load-bearing to avoid a stale-map race with the
  iframe's `onLoad`, do NOT convert to a `useEffect`; inspect-picker
  postMessage listener (`od:comment-target` w/ style snapshot) ~4456–4493;
  `postInspectSet`/`postInspectReset`/`replayInspectOverridesToIframe`/
  `saveInspectToSource` ~4517–4596; `InspectPanel` JSX wiring + empty-hint
  banner ~7280–7340.
- **Owns:** `activeInspectTarget`, `inspectOverrides`,
  `inspectHydratedSourceRef`, `savingInspect`, `inspectSavedAt`,
  `inspectError`, `openHintBox`.
- **Coupled to:** shares `liveCommentTargets` with Cluster I; writes `source`
  directly via `saveInspectToSource` (HTTP POST, bypasses Manual Edit's
  history mechanism — a genuinely separate save path, do not merge with
  Cluster K); uses `iframeRef`/`isOurPreviewIframeSource` (Cluster L).
- **Target:** `providers/file-viewer/inspect-bridge.ts` (owns `od:inspect-*`
  postMessage) + `hooks/useInspectMode.hooks.ts`.
- **Shape:** provider bridge + hook.
- **Risk:** high.
- **Rationale:** the render-phase `setState`-during-render hydration is the
  single most fragile piece of logic profiled in this file — an extraction
  that moves it into a `useEffect` (the "obvious" refactor) would reintroduce
  the exact stale-map race it was written to avoid. Preserve verbatim.

### Cluster K — Manual Edit (in-canvas WYSIWYG edit)

- **Status:** pending
- **Lines (scattered, largest cluster by line count, ~24 state slots + ~24
  functions + ~530 lines of handler bodies):** state ~2380–2403;
  `setManualEditMode` custom setter ~2262–2271; edit-mode sync effect
  (`od-edit-mode` + selected-target) ~3450–3455; big `od-edit-*` postMessage
  listener (`od-edit-targets`/`select`/`hover`/`background`/`text-commit`/
  `text-session`) ~3810–3918; ~24 helper functions ~3920–4451
  (`nextManualEditPreviewVersion`, `inspectorManualEditStyles`,
  `reconcileManualEditStyleSave`, `clearManualEditStyleTimer`,
  `cancelManualEditPendingStyles`, `handleManualEditStyleChange`,
  `flushManualEditStyleSave`, `cancelManualEditStyleDraft`,
  `finishManualEditTextSession`, `settlePendingManualEditCommit`,
  `exitManualEditModeAfterFlush`, `clearManualEditHover`,
  `selectManualEditTarget`, `manualEditDraftForTarget`,
  `clearManualEditTargetSelection`, `dismissManualEditPanel`,
  `manualEditContentPatchForDraft`, `saveManualEditPanelDraft`,
  `resetManualEditPanelDraft`, `cancelManualEditPanel`, `applyManualEdit`,
  `confirmManualEditHistorySource`, `undoManualEdit`, redo counterpart);
  `postSelectedManualEditTargetToIframe`/`previewStyleToIframe` ~3444–3480;
  `activateManualEditTool` ~5199–5211; manual-edit JSX prep ~6170–6273;
  toolbar toggle + more-menu duplicate ~6400/6620.
- **Owns:** all state/handlers above.
- **Coupled to:** writes `source`/`sourceRef` via `writeProjectTextFileDetailed`
  (disk I/O with its own undo/redo history — separate save path from
  Cluster J's `saveInspectToSource`); reads `manualEditFrozenSource`/
  `manualEditViewportWidth` from Cluster L's freeze machinery; `syncBridgeModes`
  (Cluster L, shared 3-message dispatcher) posts Manual Edit's mode message
  alongside Comment's and Inspect's.
- **Target:** `providers/file-viewer/manual-edit-bridge.ts` (owns `od-edit-*`
  postMessage + the text-session finish/commit ack/timeout race) +
  `hooks/useManualEdit.hooks.ts` (history/undo/redo/save); `ManualEditPanel`
  dumb component already exists.
- **Shape:** provider bridge + hook.
- **Risk:** high.
- **Rationale:** the largest and most stateful bridge surface in the file. The
  inline-text-edit session teardown (`finishManualEditTextSession`/
  `settlePendingManualEditCommit`) fixes a documented data-loss bug (#3647)
  via a promise-based ack/timeout race — extraction must preserve the exact
  sequencing (settle-once, timeout backstop, await in-flight commit before
  resolving) or edits can silently drop on exit.

### Cluster L — srcDoc / URL-load transport routing engine ⚠ highest risk, foundational

- **Status:** pending — **do not attempt until Clusters E/F(partial)/G have
  landed and the team has a dedicated full-focus pass for this one.** Every
  mode cluster (D, H, I, J, K) reads `iframeRef`/`isOurPreviewIframeSource`
  from this cluster, so its bridge shape should be designed once other
  clusters have already shown what shape of port they need.
- **Lines (scattered, foundational — read by nearly everything else):** source
  state ~2104–2107; source refs ~2404–2430; fetch+cache-bust effect
  ~2727–2844; `reloadHtmlPreview` ~5013–5043; routing decision vars
  ~2865–2968 (`routingHtmlSource`, `passiveLargeHtmlPreview`, `looksLikeDeck`
  [pure, memoizable as a rule], `effectiveDeck`, `showDeckNavigation`,
  `structuredDeckExportSignal`, `livePreviewSource`, `annotationFreezeActive`
  + its freeze effects, `previewSource`); `needsSandboxShim`/`needsFocusGuard`/
  `needsPowered`/`urlLoadDecision`/`useUrlLoadPreview` ~2929–2968 (wraps
  already-extracted pure fns from `file-viewer-render-mode.ts` — preserve
  those imports verbatim, do not re-derive the logic); URL construction
  ~2969–3043; `iframeRef` selection effect ~3045; powered-preview resolution
  ~3045–3075; live-reload-on-file-watcher effect ~3077–3105; asset-inlining
  effect ~3107–3118 (calls Cluster O's `inlineRelativeAssets`); `srcDoc`
  useMemo + lazy-transport state ~3120–3161; shell-ready/selection-bridge-ready
  listeners ~3165–3194; `captureModeActive`/`useLazySrcDocTransport`/
  materialize effect ~3195–3229; `urlTransportSrc`/`urlFrameSrc`/
  `activateSrcDocTransport`/`activateLoadedSrcDocTransport`/
  `activateSrcDocSnapshotTransport` ~3230–3297; remount-vs-activate
  orchestration effect (#2253/#2361/#2791 race fixes) ~3298–3322;
  `capturePreviewScrollPosition`/`restorePreviewScrollPosition` ~2313–2379,
  trigger effect ~3324–3326; scroll/viewport postMessage listener effect
  ~3328–3416; `isActivePreviewIframeSource`/`isOurPreviewIframeSource`
  ~2227–2237 (used by nearly every other cluster's listener — keep this pair's
  signature stable since it's a cross-cluster dependency); brand-extraction
  stop-request listener ~2238–2251; `syncBridgeModes` ~3470–3481 (cross-cluster
  dispatcher — Comment + Edit + Inspect mode messages in one call, called from
  iframe `onLoad`); `openInNewTab` ~4753–4761; the dual-iframe JSX itself
  (`PooledIframe`/url-load `iframe` + srcDoc `iframe`, each with a detailed
  `onLoad`) ~7093–7175.
- **Owns:** `iframeRef`, `urlPreviewIframeRef`, `srcDocPreviewIframeRef`,
  `activatedSrcDocTransportHtmlRef`, `srcDocFrameDedupeResetForRef`, and
  everything listed above.
- **Coupled to:** read by literally every other mode cluster for `iframeRef`/
  `isOurPreviewIframeSource`; reads `manualEditMode`/`manualEditFrozenSource`
  (Cluster K), `boardMode`/`drawOverlayOpen`/`inspectMode` (Clusters I/M/J) to
  decide freeze/routing.
- **Target:** `providers/file-viewer/html-preview-transport-bridge.ts` — a
  dedicated provider bridge owning both iframe refs, transport activation, and
  the routing decision; expose a narrow hook `useHtmlPreviewTransport()`
  returning `{ iframeRef, srcDoc, useUrlLoadPreview, urlFrameSrc,
  activatePreview, isOurPreviewIframeSource, captureSnapshot, ... }` for the
  mode clusters (D, F, H, I, K) to consume instead of reaching into raw state.
- **Shape:** provider bridge (the canonical `providers/` use case).
- **Risk:** highest in the file.
- **Rationale:** this IS the srcDoc-vs-URL-load bridge `apps/web/AGENTS.md`'s
  "Chat UI conventions" section calls out by name (`file-viewer-render-mode.ts`
  / `UrlLoadDecision` / iframe-swap-without-remount / `isOurIframe(ev.source)`
  pattern) — that document requires these behavioral invariants preserved
  EXACTLY. At least four separately-numbered historical regressions are baked
  into inline comments (#2253, #2361, #2791, #4650, #4652); each documents a
  load-bearing, interdependent behavior (dedupe-once-per-node, lazy-shell
  activation, freeze-on-annotation, last-good-source fallback, file-switch
  race guards). Extract only in a dedicated pass with full attention, after
  every dependent cluster's target port shape is already known from having
  extracted them.

### Cluster M — Draw / Mark overlay toggle

- **Status:** pending
- **Lines:** `drawOverlayOpen` state ~2194; `activateDrawTool` ~5121–5145;
  `PreviewDrawOverlay` JSX wiring ~7085–7115.
- **Owns:** `drawOverlayOpen`, `activateDrawTool`.
- **Coupled to:** must flush Manual Edit first (Cluster K's
  `exitManualEditModeAfterFlush`) before activating; passes Cluster F's
  `captureExportImageSnapshot` into `PreviewDrawOverlay` as `captureSnapshot`;
  reads `annotationFreezeActive`/`annotationFrozenSource` (Cluster L).
- **Target:** fold into a small `hooks/useDrawMode.hooks.ts` composing
  Cluster K's flush + Cluster F's capture function; `PreviewDrawOverlay`
  already owns the drawing logic itself.
- **Shape:** thin hook.
- **Risk:** medium (inherits Cluster L/F's risk via composition, but the
  toggle itself is trivial).
- **Rationale:** small in isolation; sequence after K, F, and L.

### Cluster N — External request-nonce consumption (chat "next step" cards)

- **Status:** pending
- **Lines:** `shareRequest`-nonce effect + `consumedShareNonceRef`
  ~5382–5397; `downloadRequest`-nonce effect + `consumedDownloadNonceRef`
  ~5399–5414; `slideNavRequest`-nonce effect ~5416–5440 (posts directly + slide
  cache — jointly owned with Cluster H).
- **Owns:** the three consumption effects and dedupe refs.
- **Coupled to:** `canShare` (Clusters E/F), `shouldConsumeSlideNav` (external
  module-level dedupe, not in this file), `effectiveDeck`/`slideState`
  (Cluster H).
- **Target:** split — share/download-nonce effects fold into Clusters E/F
  respectively as tiny effects; slideNav-nonce effect folds into Cluster H's
  hook.
- **Shape:** no standalone extraction — two tiny effects riding along with
  their owning clusters.
- **Risk:** low (share/download) / medium (slideNav, posts to iframe).

### Cluster O — Module-level asset-inlining helpers

- **Status:** pending
- **Lines:** 8037–8102 (`inlineRelativeAssets`, `fetchProjectRelativeText`) —
  outside `HtmlViewer`'s own braces; serves Cluster L's inlining effect at
  ~3107–3118 but takes `projectId`/`fileName`/`html` as plain params with no
  closure over component state.
- **Target:** `rules.ts` (or a small `utils/inline-relative-assets.ts` if it
  needs to stay outside the pure-only `rules.ts` bar — check whether it does
  any `fetch`; if so it's transport and belongs in `providers/`, not
  `rules.ts`. Verify before moving: grep the two functions' bodies for
  `fetch`/`await` network calls first.)
- **Shape:** pure rule or provider fn (verify which).
- **Risk:** low.
- **Rationale:** already decoupled from React; likely a cut-and-paste move,
  but confirm the transport-vs-pure question before picking `rules.ts` vs
  `providers/`.

### Cluster P — Chrome-actions-host portal resolution + agent-tools popover (trivial, fold-ins)

- **Status:** pending
- **Lines:** `chromeActionsHost` state + `resolveChromeActionsHost()` effect
  ~2707–2711; `agentToolsOpen` state ~2193 + outside-click (part of Cluster
  C's group) ~4646–4657 + `closeArtifactToolMenus` ~5108–5110.
- **Target:** fold `chromeActionsHost` into a tiny `hooks/useChromeActionsHost.hooks.ts`
  (or Cluster C's toolbar hook); fold `agentToolsOpen`/`closeArtifactToolMenus`
  into Cluster C's `useViewerToolbarMenus.hooks.ts`.
- **Shape:** no standalone extraction.
- **Risk:** low.

---

## Suggested pass order (lowest-risk / highest-payoff first, per SKILL.md)

1. **Cluster A — LiveArtifactViewer** (this pass).
2. **Cluster Q — MarkdownViewer** (parallelizable with #1 — zero shared state;
   good worktree-isolated-subagent candidate for a future pass with 2+ pending
   low-risk clusters available at once).
3. **Cluster E — Deploy & Publish** (largest bridge-free HtmlViewer cluster).
4. **Cluster B — Analytics fire-helpers** (trivial, low risk, unblocks
   nothing but easy to knock out alongside E).
5. **Cluster C — Toolbar chrome** + **Cluster P** (fold-ins).
6. **Cluster G — Version history integration** (trivial).
7. **Cluster F (state/toast half only)** — defer `captureExportImageSnapshot`
   until Cluster L exists.
8. **Cluster H — Deck/slide navigation** (first bridge extraction; smaller
   surface than I/J/K, good warm-up for the bridge pattern before tackling L).
9. **Cluster L — srcDoc/URL-load transport engine** (dedicated, full-focus
   pass; do this before I/J/K since they all consume its output shape).
10. **Cluster D — Present mode** (depends on L's output shape).
11. **Cluster F (capture-snapshot half)** (depends on L).
12. **Cluster M — Draw/Mark toggle** (depends on K, F, L).
13. **Cluster J — Inspect mode** (depends on L; preserve the render-phase
    hydration exactly).
14. **Cluster I — Comment/Board mode** (depends on L, J for shared
    liveCommentTargets).
15. **Cluster K — Manual Edit** (depends on L; largest remaining, do last
    among the mode clusters so the bridge pattern is well-proven by then).
16. **Cluster N** (fold-ins alongside whichever of E/F/H they ride with).
17. **Cluster O** (any time — fully standalone, just needs the pure-vs-
    transport verification first).

After all clusters land: run the Phase 8.5 audit (twice, independently) per
`dev-skills/fixing-open-design-web/SKILL.md`, then write `SLICE-COMPLETE.md`.
