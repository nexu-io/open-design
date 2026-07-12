# ProjectView.tsx Extraction Plan — Remaining Clusters

One-time full inventory of `apps/web/src/components/ProjectView.tsx`, produced before any
further extraction so hourly passes can pick up a cluster instead of re-profiling the file.
Already-landed clusters (project-actions, Continue-in-CLI/Finalize toolbar, plugin/design-system
context-chip, GitHub connect-repo CTA, BYOK model-override, chat-panel resize, 3
localStorage/sessionStorage provider bridges, conversation-management, design-system-review,
share-to-open-design) are excluded below — do not redo them.

No `features/project-view/components/` directory exists yet — **zero dumb JSX components have
been split out**. That shows up below as Cluster 22, the single largest remaining item by line
count.

Process: pick the next `pending` cluster (lowest-risk/highest-payoff first per the recommended
order below unless a later pass's judgment differs), execute it, mark it `done` in this file as
part of that pass's last commit. If a cluster's real shape differs once inside it, correct just
that cluster's entry — keep the rest of the plan intact. Line numbers are a snapshot at plan-time
and will drift as earlier clusters are extracted — re-locate by symbol name, not by line number,
once prior clusters have landed.

---

## 1. Module-scope pure helpers & brand-snapshot types
- **Lines:** 353–544
- **Owns:** `BrandBrowserSnapshot` / `BrandBrowserSnapshotExtractionResult` types; module constants (`BRAND_KIT_FILE`, `BRAND_EMPTY_TRANSCRIPT_RETRY_DELAYS_MS`, `COMMENT_INSPECTOR_PANEL_WIDTH`, `BYOK_OPENCODE_UNAVAILABLE_MESSAGE`, `BEDROCK_BYOK_UNSUPPORTED_MESSAGE`, `TAB_PERSIST_DEBOUNCE_MS`, `liveArtifactEventSequence`); pure functions `brandExtractionPreviewFileName`, `byokOpenCodeProviderFromConfig`, `selectedKnownProviderForConfig`, `isOpenCodeByokChatProtocol`, `projectEventToAgentEvent`, `artifactWithHtml`.
- **Coupling:** Consumed throughout Clusters 14, 16, 17 (send/reattach/brand paths). No React state.
- **Target:** `features/project-view/rules.ts` (functions) + `features/project-view/types.ts` (the two result types) + `features/project-view/constants.ts` (the string/number constants).
- **Shape:** pure rule
- **Risk:** low
- **Status:** done. Landed in `rules.ts`/`types.ts`/`constants.ts`. Found the dead `let liveArtifactEventSequence = 0;` in `ProjectView.tsx` was orphaned — an already-extracted counter of the same name already lives in `rules.ts` (used by `appendLiveArtifactEventItem`) — so it was simply deleted, not moved. `ProjectEvent`'s type (needed by `projectEventToAgentEvent`) comes from `providers/project-events.ts`, so it was re-declared in-slice as `ProjectLiveEvent` in `types.ts` (structurally identical, sourced from the same `@open-design/contracts` SSE payload types) rather than imported, per the guard's port-result-type-in-slice rule. Found `artifactWithHtml` was ALREADY duplicated into `rules.ts` (unexported) by a prior pass that never removed the `ProjectView.tsx` original or exported the moved copy — exported the existing `rules.ts` copy instead of adding a second one (would have been a duplicate-function-implementation compile error). `BRAND_KIT_FILE` turned out to be dead in `ProjectView.tsx` (only referenced in its own comment, never read) — moved anyway for parity with its constants siblings; harmless if it stays unused.

## 2. Mount lifecycle / tracked-timeout utility
- **Lines:** 636–664
- **Owns:** `mountedRef`, `trackedTimeoutsRef`, `scheduleProjectTimeout`, `clearProjectTimeout`.
- **Coupling:** Consumed pervasively by Clusters 16 and 17 (every retry/backoff timer routes through these two functions).
- **Target:** `features/project-view/hooks/useProjectTimeouts.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** low — self-contained, but extract early since it's a foundational dependency of the two highest-risk clusters.
- **Status:** done. Landed as `useProjectTimeouts()` — no injected port needed (pure `setTimeout` bookkeeping, no transport). The orchestrator destructures `{ mountedRef, scheduleProjectTimeout, clearProjectTimeout }` from the hook in place of the three inline `useRef`/`useCallback` declarations.

## 3. Onboarding entry & first-loop funnel wiring
- **Lines:** 584–635, 1852–1861, 4088–4115, 4668–4689, 6256–6349, 6731–6794
- **Owns:** `onboardingEntryInitRef`, `onboardingEntryRef`, `onboardingSeedPromptRef`, `chatPanelPageViewFiredRef`, `firstLoopViewedRef`, `autoSentRef`, `autoSendSeedRef`, `autoSendAttachmentsRef`, `autoSendContextRef`, `autoSendFirstMessageRef`, `autoSendAmrGateOkRef`, `initialDraft` state, `onboardingPrefilledFiredRef`; effects: page_view tracking, first-loop `artifact_viewed`, `onboarding_prompt_prefilled` tracking, pendingPrompt→initialDraft sync, auto-send-first-message effect.
- **Coupling:** HIGH — the auto-send effect calls `handleSend` (Cluster 17) and reads `messagesInitialized`/`streaming`/`messages.length` from Cluster 4. The onboarding completion trackers are embedded inside `handleSend`'s body itself (4088-4115, 4668-4689), so full extraction requires either callback injection or accepting a light coupling back into 17.
- **Target:** `features/project-view/hooks/useOnboardingFunnel.hooks.ts` (new). Session-storage reads/writes already mostly route through `providers/project-view/auto-send-session.ts` — only the raw flag-presence checks remain inline (see provider-bridge gaps below).
- **Shape:** feature hook
- **Risk:** medium
- **Status:** done. Landed as FOUR exported hooks in one file, not one hook, because three of the six original effects each depend on a value owned by a different not-yet-extracted part of the render and hooks can only be called once per render at a fixed position: `useOnboardingEntry`/`useWiredOnboardingEntry` (called early — owns `onboardingEntryInitRef`/`onboardingEntryRef`/`onboardingSeedPromptRef`/`chatPanelPageViewFiredRef` + the consume-once block + page_view effect, PLUS `autoSendSeedRef`/`autoSendAttachmentsRef`/`autoSendContextRef`/`autoSendFirstMessageRef`/`autoSendAmrGateOkRef` + `initialDraft` state + the pendingPrompt-sync effect, since none of that needs anything defined later in the render); `useFirstLoopViewedTracking` (called where Cluster 9's `hasPreviewableArtifact` becomes available); `useOnboardingPromptPrefilledTracking` (called where the orchestrator's `chatInitialDraft` — mixing in Cluster 14/15's `chatSeed` — becomes available); `useAutoSendFirstMessage`/`useWiredAutoSendFirstMessage` (called AFTER `handleSend`'s `useCallback` definition, since the auto-send effect calls it — the ONE place in this cluster where the plan's predicted Cluster-17 coupling was real, resolved by taking `handleSend` as a param rather than waiting for Cluster 17). Added `hasAutoSendFirstMessageFlag`/`readAmrGateOkFlag` to `providers/project-view/auto-send-session.ts` and the port, replacing the two direct `window.sessionStorage.getItem` calls the plan flagged as a provider-bridge gap. The onboarding completion trackers actually embedded inside `handleSend`'s body (`hasSentFirstOnboardingPrompt`/`markFirstOnboardingPromptSent`/etc., Cluster 17) and inside the reattach-recovery block (Cluster 16) needed ZERO changes — they read `onboardingEntryRef`/`onboardingSeedPromptRef` by closure, and since those are now `const`s destructured from `useWiredOnboardingEntry` at the top of the orchestrator (before `handleSend`'s own definition), every existing closure capture still resolves to the same ref object. Verified with the FULL existing `ProjectView.*` test suite (453 tests / 34 files, not just the touched slice tests) given this cluster's real coupling into still-inline `handleSend`/reattach code.

## 4. Conversation & message core (state + CRUD)
- **Lines:** 691–736 (partial), 981–1056, 1217–1300, 1306–1374, 2056–2131, 2382–2425
- **Owns:** `conversations`/`conversationsRef`, `activeConversationId`, `activeConversation`/`activeSessionMode` memos, `messagesConversationId`, `failedMessagesConversationId`, `conversationLoadError`, `messageLoadRetryNonce`, `messages`/`messagesRef`, `persistMessage`, `persistMessageById`, `updateMessageById`, `appendConversationMessage`, `replaceConversationMessage`, `refreshConversationMessagesFromServer`, `scheduleConversationMessageRefresh`; effects: load conversations on project switch, routed-conversation-id sync, load messages on conversation change.
- **Coupling:** EXTREME — this is the shared substrate nearly every other cluster reads or writes (`messages`, `updateMessageById`, `persistMessage*` are dependency-array entries in Clusters 3, 5, 6, 12, 14, 15, 16, 17, 18, 22).
- **Target:** `features/project-view/hooks/useConversationMessages.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** high — central state; any behavioral drift here breaks everything downstream. Do this early and in isolation.
- **Status:** done. Landed as `useConversationMessages(...)` / `useWiredConversationMessages(...)`. Re-derived the real shape once inside: `conversations`/`activeConversationId`/`messages`/`messagesInitialized` and every piece of cross-cutting UI state their loads reset (`previewComments`, `attachedComments`, `streaming`, `streamingConversationId`, `artifact`, `error`) stay `useState` in the orchestrator exactly like the already-landed `useConversationManagement` sibling cluster — they're read/written by many still-inline clusters (16, 17). The hook owns only the three effects (project-switch conversation load, routed-conversation-id sync, message load on conversation change) and the message-persistence functions (`persistMessage`/`persistMessageById`/`updateMessageById`/`appendConversationMessage`/`replaceConversationMessage`/`refreshConversationMessagesFromServer`/`scheduleConversationMessageRefresh`), taking all cross-cutting state and its setters as params — same shape as `useConversationManagement`. `lastSeenRouteConversationIdRef` moved fully into the hook (only ever read/written by the routed-sync effect); `lastSyncedConversationIdRef` stays orchestrator-owned (written by the not-yet-extracted URL-sync cluster 8) and is passed in. Added `listMessages`/`saveMessage`/`fetchPreviewComments` to `ProjectViewTransportPort` (new provider file `providers/project-view/messages.ts`) since the hook's effects can't call `fetch`-backed `state/projects`/registry functions directly under the guard; ProjectView.tsx keeps its own direct imports of those same transport functions for the many OTHER call sites in not-yet-extracted clusters (14, 16, 17) that still live inline. Added `SaveMessageOptions` and `findActiveConversation` (a one-line pure rule replacing the inline `.find()` for `activeConversation`) to the slice. The new provider file imports its `SaveMessageOptions` type from `state/projects` rather than the slice's own copy — a deep slice-import from `providers/` fails the boundary guard; the two types are structurally identical and duck-type across the port boundary, matching the existing `BufferedTextFlushHandlers` pattern (provider declares/imports its own shape, slice keeps its own copy in-slice per ADR 0002).

## 5. Question-form derivation & Questions-tab focus
- **Lines:** 1057–1195
- **Owns:** `lastAssistantIndex`/`lastAssistantContent`/`lastAssistantMessageId` memos, `questionForm`, `questionFormSubmittedAnswers`, `questionsGenerating`, `questionFormPreview`, `questionFormActive`, `hasQuestions`, `questionFormKey`, `manualQuestionFormRequest` state + 2 effects, `displayedQuestionForm*` derived values, `questionsFocusNonce` state + effect, `focusQuestionsRequest`, `submittedAnswersForQuestionFormRequest`, `openQuestionsTab`.
- **Coupling:** reads `messages`/`activeConversationId` from Cluster 4; otherwise self-contained pure derivation. `buildQuestionFormKey` is already imported from `features/project-view`.
- **Target:** `features/project-view/hooks/useQuestionFormPanel.hooks.ts` (new).
- **Shape:** feature hook (mostly pure computation over `messages`)
- **Risk:** low-medium — good unit-test candidate, well isolated.
- **Status:** done. Landed as `useQuestionFormPanel(messages, activeConversationId, currentConversationStreaming, projectId)` — no port needed (pure derivation). Only the final `displayed*`/`focusQuestionsRequest`/`openQuestionsTab` values are consumed outside this cluster (verified via grep before extracting) — the intermediate `questionForm`/`lastAssistantIndex`/etc. stay hook-internal, so the controller interface is small. Imports `parseSubmittedAnswers` from `components/QuestionForm.tsx` and `QuestionFormOpenRequest` from `components/AssistantMessage.tsx` directly — these are plain component-file exports, not providers/ or cross-slice features/**, so the guard doesn't restrict them (flagged here since it's a slightly unusual features→components import direction, but ADR 0002 doesn't forbid it and moving those two exports out of scope is a bigger change than this cluster warrants).

## 6. Preview comments management
- **Lines:** 729–736, 2662–2745
- **Owns:** `previewComments`/`previewCommentsRef`, `attachedComments` state; `refreshPreviewComments`, `savePreviewComment`, `removePreviewComment`, `attachPreviewComment`, `detachPreviewComment`, `patchAttachedStatuses`.
- **Coupling:** medium — consumed by `handleSend` (Cluster 17) for comment attachments and by FileWorkspace/ChatPane props (Cluster 22).
- **Target:** `features/project-view/hooks/usePreviewComments.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** medium
- **Status:** done. Landed as `usePreviewComments(...)` / `useWiredPreviewComments(...)` — the six CRUD functions only. `previewComments`/`attachedComments`/`previewCommentsRef` stay `useState`/`useRef` in the orchestrator, mirroring `useConversationManagement`'s already-established precedent for this exact pair of state: they're reset by Cluster 4's conversation-switch effects and read/written directly by the not-yet-extracted chat-send pipeline (Cluster 17) at several call sites (inside `handleSend`/`handleStop`), so the hook takes them and their setters as params instead of owning them. Added `uploadPreviewCommentImages`/`savePreviewComment`/`patchPreviewCommentStatus`/`deletePreviewComment` to `ProjectViewTransportPort` (new provider file `providers/project-view/preview-comment-actions.ts`; `fetchPreviewComments` already existed on the port from Cluster 4). The upload port method returns `PreviewCommentAttachment[]` (just the succeeded uploads, mapped from the registry's richer `ChatAttachment[]`) rather than the registry's full `{uploaded, failed, error}` shape, since the hook only ever needed the succeeded list and a length comparison against the input. `patchPreviewCommentStatus`/`uploadProjectFiles` (the raw `providers/registry` imports) stay imported directly in `ProjectView.tsx` — they're still called from 3 other not-yet-extracted sites (Cluster 17's `handleSend`, Cluster 18's plugin-folder-agent action) that don't go through this cluster. `mergeAttachedComments`/`mergePreviewCommentAttachments`/`removeAttachedComment` (pure helpers from `../comments`, not a `providers/` module) moved into the hook file as direct imports — the guard only restricts `providers/` imports, so this is fine per ADR 0002.

## 7. Run-completion notifications
- **Lines:** 1211–1213, 1442–1505
- **Owns:** `activeCompletionNotificationRunsRef`, `completedNotificationRunsRef`, `notifyCompletedRun`, the completion-detection effect over `messages`.
- **Coupling:** low-medium — reads `messages` (Cluster 4) and `config.notifications`; calls `playSound`/`showCompletionNotification` (already-abstracted utils).
- **Target:** `features/project-view/hooks/useRunCompletionNotifications.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** low
- **Status:** done. Landed as `useRunCompletionNotifications(messages, notificationsConfig, t, onRunSettled, port)` + `useWiredRunCompletionNotifications(...)`. `document.hidden`/`document.hasFocus()`/`window.focus()` moved to a new provider bridge `providers/project-view/document-visibility.ts` (`isDocumentHidden`/`isDocumentFocused`/`focusWindow`, added to the port). The hook returns `{ activeCompletionNotificationRunsRef }` since `handleSend` (Cluster 17, not yet extracted) optimistically marks a new assistant message id active before this hook's own effect would observe it — the orchestrator destructures the ref back out. `setDesignMdRefreshKey` is passed in as an `onRunSettled` callback param rather than owned by this hook (that state belongs to `useDesignMdState`, a different pre-existing hook, out of scope for this cluster). `t` is typed `ReturnType<typeof useT>` (not a bare `(key: string) => string`) to match the real i18n `Dict`-keyed signature, and held in a ref per the repo's stated infinite-loop gotcha even though this specific effect's ref-based dedup means it wasn't actually at risk here — cheap to do defensively.

## 8. Open-tabs state & URL sync
- **Lines:** 892–947 (`openTabsState`, `headerArtifact` memo, workspace-context state), 1507–1583 (tabs load/save + debounced daemon-persist), 1585–1596 (`handleActiveWorkspaceContextChange`/`handleWorkspaceContextsChange`), 1659–1675 (initial-primary-open effect), 2019–2050 (URL sync effect).
- **Coupling:** medium — reads `projectFiles` (Cluster 9) and `routeFileName` prop; writes drive `navigate()`.
- **Target:** `features/project-view/hooks/useOpenTabsSync.hooks.ts` (new). (`cacheTabsLocally`/`persistTabsToDaemonNow`/`loadTabs` already live in `state/projects.ts` — this cluster is only the React-side orchestration around them.)
- **Shape:** feature hook
- **Risk:** medium
- **Status:** done. Landed as `useOpenTabsSync(...)` / `useWiredOpenTabsSync(...)` — owns `openTabsState`, `headerArtifact` (memo), `activeWorkspaceContext`/`workspaceContexts` + their two handlers, the tabs hydrate-on-project-switch effect, the debounced local-cache+daemon-PUT persistence (`persistTabsState`/`flushTabsDaemonSave`), the initial-primary-open effect, and the URL <-> active-tab/conversation sync effect. `projectFiles`/`projectFileNames` (Cluster 9, still inline) and `activeConversationId` (Cluster 4) are taken as params since the hook only reads them. `lastSyncedConversationIdRef` stays declared in the orchestrator (unchanged) and is passed in as a param rather than moved into the hook and returned — `useWiredConversationMessages` (Cluster 4, already landed) reads it and is wired up earlier in the render than this hook's natural call position (which has to come after `projectFileNames` is computed), so moving ownership would have forced reordering an already-stable call site; passing the existing ref in avoids that risk entirely. The tiny `routeFileName -> requestOpenFile` effect (one-liner gluing the URL's file segment to Cluster 9's not-yet-extracted `requestOpenFile`) was deliberately LEFT INLINE in `ProjectView.tsx` — it doesn't own any Cluster-8 state and depends entirely on a Cluster-9 function, so pulling it in would have added coupling for no isolation benefit. Added `loadOpenTabs`/`cacheOpenTabsLocally`/`persistOpenTabsToDaemon` to `ProjectViewTransportPort` (new provider file `providers/project-view/open-tabs.ts`, wrapping `state/projects.ts`) for architectural consistency with Cluster 4's precedent, even though the guard's AST check wouldn't have literally caught a direct `state/projects` import here (the `localStorage`/`fetch` calls live inside `state/projects.ts`, not inside the feature file itself). While validating this cluster, discovered 7 existing slice test files (`useChatPanelResize`, `useConversationManagement`, `useConversationMessages`, `useDesignSystemReview`, `useGithubConnectRepo`, `usePluginContextDetails`, `useProjectFinalizeActions`) had fallen out of sync with the port interface after Cluster 6 added its 4 preview-comment methods — their local `makePort()`/harness fakes hadn't been updated, and this had gone unnoticed because the prior pass's typecheck/guard gates were accidentally run from the main checkout instead of this worktree (so they validated stale code and reported false-green). Fixed all 7 fakes here and reconfirmed both gates from the correct working directory.

## 9. Project files, live artifacts & artifact persistence
- **Lines:** 930–947 (`openRequest`/`browserOpenRequest`/`shareRequest`/`downloadRequest`/`designSystemEditRequest`/`slideNavRequest` state), 1597–1657 (`refreshProjectFiles`, `refreshLiveArtifacts`, `refreshWorkspaceItems`), 1677–1680 (`requestOpenFile`), 1713–1834 (`persistArtifact`, `artifactFromStandaloneHtml`), 1612–1626 (`htmlContentCacheRef` + `readProjectHtml`), 1836–1869 (`projectFileNames`, `hasPreviewableArtifact`, `activeProjectFileName` memos).
- **Coupling:** HIGH-fan-out — `requestOpenFile`/`refreshProjectFiles`/`persistArtifact`/`readProjectHtml` are called from Clusters 14, 16, 17.
- **Target:** `features/project-view/hooks/useProjectFilesAndArtifacts.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** medium-high
- **Status:** done. Landed as `useProjectFilesAndArtifacts(...)` / `useWiredProjectFilesAndArtifacts(...)` — owns `projectFiles`/`projectFilesRef`/`liveArtifacts` state, the six open-request states (`openRequest`/`browserOpenRequest`/`shareRequest`/`downloadRequest`/`designSystemEditRequest`/`slideNavRequest`), `htmlContentCacheRef`, `refreshProjectFiles`/`refreshLiveArtifacts`/`refreshWorkspaceItems`, `requestOpenFile`, `readProjectHtml`, `persistArtifact`, and `artifactFromStandaloneHtml`. **Corrected from the original plan**: `projectFileNames`/`hasPreviewableArtifact`/`activeProjectFileName` stay as plain `useMemo`s in the orchestrator rather than moving into this hook — `activeProjectFileName` needs `openTabsState.active` (Cluster 8's output), and Cluster 8's hook itself needs `projectFileNames` as an input param, so folding all three memos into Cluster 9 would create a circular hook-call-order dependency between Clusters 8 and 9. The two derived memos are cheap and have a single clean dependency each; leaving them as orchestrator-level derivations threading between two hooks' outputs is the correct shape, matching how `activeConversationChatState` is already a plain orchestrator `useMemo`. `projectDesignSystemId` (a derived value) and `savedArtifactRef`/`setError`/`setFilesRefresh` (cross-cutting state written by several other not-yet-extracted clusters) are taken as params rather than owned by the hook. Added `fetchProjectFiles`/`fetchLiveArtifacts`/`writeProjectTextFile` to `ProjectViewTransportPort` (new provider file `providers/project-view/project-files.ts`). `requestOpenFile` has ~39 call sites across the file (brand extraction, run reattach, chat-send pipeline, plugin-folder agent) — all untouched, since they just read the same function reference from the new hook's return instead of an inline `useCallback`. Also fixed the same 7 slice test fakes touched by Clusters 6/8 to add these 3 additional port methods.

## 10. Live project events / file-change SSE handling
- **Lines:** 1899–1962
- **Owns:** `handleProjectEvent`, `refreshFilesAndDesignMd`, `coalescedFileChangedRefresh` (via `useCoalescedCallback`); wires the existing `useProjectFileEvents` provider hook.
- **Coupling:** medium — calls Cluster 9's refresh functions and Cluster 4's `setConversations` (for `conversation-created` events).
- **Target:** `features/project-view/hooks/useProjectLiveEvents.hooks.ts` (new) — thin wrapper around the already-provider-owned `useProjectFileEvents`.
- **Shape:** feature hook
- **Risk:** medium
- **Status:** done. Landed as `useProjectLiveEvents(...)` / `useWiredProjectLiveEvents(...)`. **Deviation from the original plan's "thin wrapper around `useProjectFileEvents`"**: that hook lives in `providers/project-events.ts` and is itself a React hook (not a plain async/subscribe function), so a feature file importing it directly would trip the slice-boundary guard's "only `dependencies.ts` may import `providers/`" rule. Instead, added a `subscribeProjectFileEvents(projectId, onEvent): () => void` port method backed by a new provider bridge (`providers/project-view/project-live-events.ts`) wrapping the already-standalone-testable `createProjectEventsConnection` (the pure connection manager `useProjectFileEvents` itself calls internally) — the feature hook drives its own `enabled`/`projectId`-gated `useEffect` calling `port.subscribeProjectFileEvents` instead of delegating that lifecycle to the provider's hook. `iframeKeepAlivePool` (a component-level hook value from `./IframeKeepAlivePool`, not a `providers/` adapter), `conversationsRefreshTokenRef`/`projectIdRef`, `setConversations`, `onProjectsRefresh`, `refreshLiveArtifacts` (Cluster 9), and `setLiveArtifactEvents`/`setFilesRefresh`/`setDesignMdRefreshKey` are taken as params. `listConversations` now goes through `port.listConversations` (already on the port since Cluster 4) instead of the direct `state/projects` import. Updated the 7 `ProjectView.*.test.tsx` files that `vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }))` — that mock replaces the whole module, so once the new provider bridge started importing `createProjectEventsConnection` from the same module, those mocks needed `createProjectEventsConnection: vi.fn(() => ({ close: () => {} }))` added alongside the existing stub (143 tests went red until this was fixed).

## 11. Prompt-context signature / iframe eviction
- **Lines:** 1964–1999
- **Owns:** `activePromptContextSignature` memo, `previousPromptContextSignatureRef`, the eviction effect calling `iframeKeepAlivePool.evictProject`.
- **Coupling:** low — reads `project`, `skills`, `designTemplates`, `designSystems` props only.
- **Target:** fold into Cluster 9's hook, or a tiny `features/project-view/hooks/useIframeEvictionOnContextChange.hooks.ts` if kept separate.
- **Shape:** pure rule + tiny effect
- **Risk:** low (low-payoff to extract standalone — recommend merging into Cluster 9).
- **Status:** done. Landed as a standalone `useIframeEvictionOnContextChange(...)` hook (Cluster 9 was already committed by the time this was picked up, so folding in would have reopened that commit). The signature derivation moved to `promptContextSignature` in `rules.ts` (pure); the hook owns only `previousPromptContextSignatureRef` + the eviction effect. No port needed — no transport, just props/derived values and the `iframeKeepAlivePool` component-hook value passed in.

## 12. AMR balance gate
- **Lines:** 853–877 (state/refs), 4002–4087 (gate-check block **embedded inside** `handleSend`), 5477–5538 (`pendingAmrRetry` state + poll effect + `handleSwitchToAmrAndRetry`), 7243–7273 (dialog JSX).
- **Owns:** `amrBalanceGateBlock`, `amrLowBalanceWarn`, `amrGateInFlightConversationsRef`, `amrGatePausedQueueConversationsRef`, `pendingAmrRetry`.
- **Coupling:** HIGH with Cluster 17 — the gate-check `await` sits mid-control-flow inside `handleSend`, before message construction. Extracting cleanly requires either (a) a pure `checkAmrBalanceGate`-wrapping helper that `handleSend` calls and awaits, keeping only the two dialog states in a small hook, or (b) accepting this stays partially inline.
- **Target:** pure gate-decision helper → `features/project-view/rules.ts`; dialog state → `features/project-view/hooks/useAmrBalanceGate.hooks.ts` (new); dialogs (`AmrBalanceDialog`/`AmrLowBalanceDialog`) are already separate components, just need prop wiring moved into Cluster 22's render component.
- **Shape:** mixed — pure rule + feature hook + already-existing dumb components
- **Risk:** high (embedding inside `handleSend`'s control flow)
- **Status:** pending

## 13. Brand-browser-assist snapshot IO
- **Lines:** 2133–2380
- **Owns:** `readLocalBrowserPageArchiveSnapshot`, `readBrandBrowserSnapshot`, `downloadBrandBrowserPageArchive`, `readBrandBrowserSnapshotWithRetry`, `handleBrandBrowserAssistConfirm`, `selectedAssistantIdentity` memo, `injectedAssistRef` + the assist-injection effect.
- **Coupling:** medium-high — calls into Cluster 9 (`requestOpenFile`), Cluster 4 (`appendConversationMessage`), and is itself called by Cluster 14.
- **Target:** `features/project-view/hooks/useBrandBrowserSnapshot.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** medium-high — multiple `Promise.race` timeout races and retry loops around `runtime/brand-browser-bridge.ts`.
- **Status:** done. Landed as `useBrandBrowserSnapshot(...)`/`useWiredBrandBrowserSnapshot(...)`. Project-file-text transport routed through a new `providers/project-view/project-file-text.ts` provider + port method rather than a direct `state/projects` import. 7 sibling hook test files' port fakes updated for the new port method. Full existing ProjectView-related test suite (453 tests across 34 files) green, typecheck clean, guard passing.

## 14. Brand extraction workflow (continue / agent-fallback / enrichment)
- **Lines:** 816–841 (`brandExtractionStatusOverride` effect), 1376–1399 (empty-transcript retry effect), 1639–1657 (terminal-brand-preview refresh effect), 1682–1711 (brand-ready design-system-open effect), 6150–6185 (pending/auto-opened design-system-tab effects), 6363–6636 (`handleContinueBrandExtraction`, `handleBrandAgentExtraction`, `handleBrandEnrichment` + their state: `brandEnrichmentPromptSeedCache`, `brandEnrichmentStarting`, `brandAgentExtractionStarting`, `brandProgrammaticContinueStarting`/`Ref`).
- **Coupling:** medium-high to Cluster 17 (`handleSend`), Cluster 9 (file refresh/`requestOpenFile`), Cluster 13 (browser snapshot fallback chain), Cluster 4 (`activeConversationId`).
- **Target:** `features/project-view/hooks/useBrandExtractionWorkflow.hooks.ts` (new) — this is the single largest new hook needed besides Cluster 17.
- **Shape:** feature hook
- **Risk:** high — `handleContinueBrandExtraction` alone is a 5-branch async fallback chain (local snapshot → daemon continue → live browser DOM → downloaded archive → manual "needs input"), easy to regress silently.
- **Status:** pending

## 15. Design-system workspace audit & picker
- **Lines:** 2560–2660 (`auditDesignSystemWorkspaceAfterRun`), 6001–6193 (`handleChangeDesignSystemId` + analytics, `projectTypeLabel`, `activeDesignSystemSummary`, `designSystemProject`/`designSystemProjectFromRegistry` memos + their refresh effect).
- **Coupling:** medium — `auditDesignSystemWorkspaceAfterRun` is called from Clusters 16 and 17 after every run terminates; `designSystemProject` feeds Cluster 22's JSX (design system picker, chat context chip).
- **Target:** `features/project-view/hooks/useDesignSystemWorkspace.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** medium
- **Status:** done. Landed as `useDesignSystemWorkspace(...)` / `useWiredDesignSystemWorkspace(...)` — owns `auditDesignSystemWorkspaceAfterRun`, `handleChangeDesignSystemId`, `projectTypeLabel`, `activeDesignSystemSummary`, `designSystemProject`/`designSystemProjectFromRegistry`, and their `missingDesignSystemRefreshRef` refresh effect (that ref moved fully into the hook — nothing else read it). The OTHER two effects that also read `designSystemProject` (`pendingBrandDesignSystemOpenRef`'s open-on-ready effect and `autoOpenedBrandDesignSystemRef`'s auto-open effect) were deliberately left inline in `ProjectView.tsx` per the plan — they belong to Clusters 8/14, not 15, and now just read `designSystemProject` off the hook's return instead of a local memo. **Repointed Clusters 16/17's still-inline callers**: `auditDesignSystemWorkspaceAfterRun` is called from 8 call sites inside the not-yet-extracted run-reattach/chat-send-pipeline code (both direct calls and `useCallback` dependency arrays) — none needed edits since the hook call was placed at the exact spot the old inline `useCallback` occupied and the destructured name is identical, so every downstream reference resolved unchanged. Added `finalizeBrandProject`/`fetchDesignSystemPackageAudit`/`patchProjectDesignSystemId` to `ProjectViewTransportPort` (new provider file `providers/project-view/design-system-workspace.ts`, wrapping `runtime/brands`' `finalizeBrandProject`, `providers/registry`'s `fetchProjectDesignSystemPackageAudit`, and `state/projects`' `patchProject` respectively — same "architectural consistency" rationale as Clusters 6/8/9/18). `FinalizeBrandProjectOutcome` is a structural in-slice mirror of `runtime/brands`' `ExtractBrandFromHtmlOutcome` in `types.ts` (its `.result` field types as the real `BrandFinalizeResponse` contract DTO since the audit code never reads it, only `.ok`/`.error`). **Bug caught by the hook's own test suite before commit**: the ported `auditDesignSystemWorkspaceAfterRun` initially called the hardcoded `projectViewTransportPort` singleton (imported directly) for `consumeDesignSystemAuditAutoRepair`/`clearDesignSystemAuditAutoRepair` instead of the hook's injected `port` param — copy-pasted verbatim from the orchestrator, where that singleton call was correct because the orchestrator has no injected port. A test asserting the fake port's `consumeDesignSystemAuditAutoRepair` mock controlled the auto-repair-arming branch caught it immediately (mock never fired because the real singleton ran instead) — fixed to call `port.consumeDesignSystemAuditAutoRepair`/`port.clearDesignSystemAuditAutoRepair` (both already existed on the port from an earlier cluster). `buildDesignSystemPackageAuditRepairPrompt`/`summarizeDesignSystemPackageAudit` (from `runtime/design-system-package-audit`, not a `providers/` module) are imported directly into the hook, matching the established features→non-providers-module import precedent (Cluster 5's `components/QuestionForm` import). Removed now-dead imports from `ProjectView.tsx`: `fetchProjectDesignSystemPackageAudit`/`finalizeBrandProject`/`buildDesignSystemPackageAuditRepairPrompt`/`summarizeDesignSystemPackageAudit`/`trackDesignSystemApplyResult`/`projectKindToTracking`/the three `TrackingDesignSystemApply*` types/`fallbackDesignSystemSummaryForProject` (all fully absorbed into the hook). Added the 3 new port methods to all 9 existing slice test files' local `makePort()` fakes (same sync-drift risk flagged in Clusters 8/9/18's notes) plus a new `useDesignSystemWorkspace.test.tsx` (19 tests) covering `projectTypeLabel`'s branches, the three design-system-summary derivations + the missing-registry refresh effect (including a no-double-fire-per-id regression), `handleChangeDesignSystemId`'s no-op/clear/select paths with their analytics events, and `auditDesignSystemWorkspaceAfterRun`'s not-a-workspace no-op, brand-finalize success/failure, audit-unavailable early-return, findings-with-eligible-auto-repair, and thrown-error paths.

## 16. Run reattach / recovery on reload
- **Lines:** 2747–3843 (`attachRecoverableRuns` effect, ~900 lines, and `recoverArtifacts` effect, ~150 lines) plus their refs: `reattachControllersRef`, `reattachCancelControllersRef`, `completedReattachRunsRef`, `transientFailedRetriesRef`, `genericDisconnectRetriesRef`, `genericDisconnectBackoffUntilRef`, `transientRetryTimersRef`, `recoveryTick` state, `recoveredArtifactMessagesRef`, `MAX_TRANSIENT_RETRIES` const.
- **Coupling:** HIGH — reads/writes `messages` (Cluster 4), shares `abortRef`/`cancelRef`/`streamingConversationIdRef` with Cluster 17, calls `persistArtifact`/`refreshProjectFiles` (Cluster 9), `auditDesignSystemWorkspaceAfterRun` (Cluster 15).
- **Target:** `features/project-view/hooks/useRunReattachRecovery.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** high — one of the two most dangerous clusters in the file. Extremely detailed retry/backoff state machine (transient-null-status retries, generic-disconnect backoff, spuriously-failed-pending detection) with many interleaved early-return branches. Needs a strong regression-test net (see `ProjectView.reattach-restore.test.tsx`, `ProjectView.run-cleanup.test.tsx`) before touching.
- **Status:** pending

## 17. Chat send pipeline (queue + handleSend + handleStop + retry/resume/switch-AMR)
- **Lines:** 948–980 (abort/cancel/queue refs), 3845–3951 (`commitQueuedChatSends`, `enqueueChatSend`, `removeQueuedChatSend`, `updateQueuedChatSend`, `prioritizeQueuedChatSend`, `reorderCurrentConversationQueuedChatSends`, `queueChatSendForCurrentConversation`), 3953–5247 (`handleSend` itself — ~1300 lines), 5249–5314 (`handleStop`), 5316–5389 (`sendQueuedChatSendNow`), 5391–5447 (auto-drain-queue effect), 5449–5613 (`handleRetry`, `handleResumeRun`, `handleContinueRemainingTasks`, `handleSendBoardCommentAttachments`, `commentQueueOnSend`).
- **Coupling:** EXTREME — the highest-risk cluster in the file. Depends on Cluster 4 (messages/conversations), Cluster 6 (comment attachments), Cluster 9 (`persistArtifact`, `requestOpenFile`, `refreshProjectFiles`), Cluster 12 (AMR gate, embedded mid-function), Cluster 15 (`auditDesignSystemWorkspaceAfterRun`), Cluster 19 (`createBufferedTextUpdates`). `handleSend`'s own `useCallback` dependency array has 30+ entries.
- **Target:** `features/project-view/hooks/useChatSendPipeline.hooks.ts` (new). At actual-extraction time this will likely need to be split further into a queue-management sub-hook and a send/stop core sub-hook, but the closures are tightly interdependent enough that planning them as one cluster is honest about the real risk.
- **Shape:** feature hook (largest by far)
- **Risk:** high — recommend a single-owner, single-session extraction with the full existing test suite (`ProjectView.run-isolation.test.tsx`, `ProjectView.api-empty-response.test.tsx`, `ProjectView.run-cleanup.test.tsx`, `buffered-text-pending.test.tsx`) green before and after every intermediate commit.
- **Status:** pending

## 18. Plugin folder agent action
- **Lines:** 709–711 (`activePluginActionPaths`, `hiddenAssistantPluginActionPaths`, `forceStreamingPluginMessageIds` state), 5615–5879 (`selectedPluginActionAgent`/`pluginWorkflowAgentName` memos, `handlePluginFolderAgentAction`).
- **Coupling:** medium — calls `appendConversationMessage`/`replaceConversationMessage` (Cluster 4); otherwise a fairly self-contained long-poll workflow (`waitGeneratedPluginShareTask`).
- **Target:** `features/project-view/hooks/usePluginFolderAgentAction.hooks.ts` (new).
- **Shape:** feature hook
- **Risk:** medium
- **Status:** done. Landed as `usePluginFolderAgentAction(...)` / `useWiredPluginFolderAgentAction(...)` — owns the three `Set<string>` busy-state pieces, the `selectedPluginActionAgent`/`pluginWorkflowAgentName` plain-`const` derivation (unmemoized, matching the original), and `handlePluginFolderAgentAction` verbatim. `activeConversationId`/`currentConversationActionDisabled`/`config`/`agentsById`/`appendConversationMessage`/`replaceConversationMessage`/`setConversations` are taken as params — all cross-cutting state owned by Cluster 4 (landed) or not-yet-extracted clusters (12/17's `config`-adjacent derivations, `currentConversationActionDisabled` itself). Added `installGeneratedPluginFolder`/`startGeneratedPluginShareTask`/`waitGeneratedPluginShareTask` to `ProjectViewTransportPort` (new provider file `providers/project-view/plugin-folder-agent-action.ts`, wrapping the existing `state/projects.ts` transport, same "architectural consistency" rationale as Clusters 6/8/9) — `PluginShareTaskStart`/`PluginShareTaskResult`/`PluginShareTaskError`/`PluginShareTaskSnapshot` are structural in-slice mirrors in `types.ts` (the provider file itself imports the real `state/projects` types directly, per the `messages.ts` precedent, so it never deep-imports the slice). `pluginWorkflow*` formatters (already living in `formatters.ts` from an earlier pass) and `PluginFolderAgentAction` (from `components/design-files/pluginFolderActions`) are now dead in `ProjectView.tsx` and were removed from its import list, along with the 3 plugin transport functions previously imported directly from `state/projects`. Added a 3-method fake to the 7 existing slice test files' local `makePort()`s (the same sync-drift risk flagged in Cluster 8/9's notes) plus a new `usePluginFolderAgentAction.test.tsx` covering the daemon/non-daemon agent-name derivation, the install success/failure paths, the share-task start failure, and the full publish/contribute long-poll happy and failure paths.

## 19. Streaming text-buffer & terminal-endedAt utilities
- **Lines:** 7318–7502 (module scope, after the component): `RunStatusSnapshot` type, `resolveTerminalEndedAt`, `createBufferedTextUpdates`.
- **Owns:** no component state — pure utilities, but `createBufferedTextUpdates` is stateful internally (closures over `flushFrame`/`flushTimer`).
- **Coupling:** used by Clusters 16 and 17 exclusively.
- **Target:** `features/project-view/streaming-text-buffer.ts` (new, or add to `dependencies.ts`/`rules.ts` if better fits existing taxonomy). **Note:** `createBufferedTextUpdates` is imported directly by `apps/web/tests/components/buffered-text-pending.test.tsx` — keep a re-export in `ProjectView.tsx` or update that test's import path in the same PR.
- **Shape:** pure rule (with an internal micro-state-machine)
- **Risk:** low — good candidate to extract very early since Clusters 16/17 will need to import it either way.
- **Status:** done. Landed in `features/project-view/streaming-text-buffer.ts`. `resolveTerminalEndedAt` takes an injected `fetchRunStatus` param (bound to `fetchChatRunStatus` via a new `ProjectViewTransportPort.fetchRunStatus`) instead of importing the daemon provider directly — `isActiveRunStatus` is imported in-slice from `rules.ts` since it's already a slice rule, not transport. `createBufferedTextUpdates`'s `document`/`window` listeners (visibilitychange/pagehide) moved to a new provider bridge `providers/project-view/buffered-text-flush-triggers.ts` (`subscribeBufferedTextFlushTriggers`), injected as a `subscribeFlushTriggers` param — timers (`requestAnimationFrame`/`setTimeout`) stayed inline since the guard only forbids `window`/`document` bare globals, not timer APIs. Found and fixed a SECOND consumer not listed in the original profiling pass: `apps/web/src/components/workspace/useConversationChat.ts` also calls `createBufferedTextUpdates` (via the `ProjectView.tsx` re-export) — updated its call site too. `ProjectView.tsx`'s compat re-export block gained `createBufferedTextUpdates` so the existing `buffered-text-pending.test.tsx` and `useConversationChat.ts` keep importing from `components/ProjectView` unchanged.

## 20. Project rename & misc project-actions glue
- **Lines:** 5371–5391 (pre-extraction snapshot)
- **Owns:** `handleProjectRename`.
- **Coupling:** low — trivial, calls `onProjectChange`/`patchProject`.
- **Target:** fold into the existing `features/project-view/hooks/useProjectActions.hooks.ts` (already landed) as an additional export, rather than a new file.
- **Shape:** feature hook (tiny addition to an existing one)
- **Risk:** low
- **Status:** done. Folded `handleProjectRename` into `useProjectActions` as an additional export — the hook now also takes `onProjectChange` and the slice's `port: ProjectViewTransportPort`. Added a narrow `patchProjectName(projectId, { name, metadata? })` transport function alongside the existing `patchProjectMetadata` in `providers/project-view/patch-project-metadata.ts` (same file, same `patchProject` narrowing pattern) since the existing `patchProjectMetadata` port method only patches `metadata`, not `name`. Wired into `ports.ts`/`dependencies.ts`/the provider barrel. `ProjectView.tsx`'s inline `handleProjectRename` `useCallback` was deleted; the orchestrator now destructures it from `useProjectActions(...)` and passes `onProjectChange`/`projectViewTransportPort` as the two new trailing args. `patchProject` (the raw `state/projects` import) stays imported in `ProjectView.tsx` — it's still used by 3 other not-yet-extracted call sites (Clusters 14/17-adjacent design-system-id patch, brand-extraction status patches).

## 21. Execution controls (avatar/agent-picker bar)
- **Lines:** 6812–6863 (`executionControls` JSX)
- **Owns:** JSX only — no state, wraps `AvatarMenu` with inline analytics-tracking callbacks.
- **Coupling:** low.
- **Target:** `features/project-view/components/ExecutionControls.tsx` (new — first dumb component in the slice).
- **Shape:** dumb component
- **Risk:** low
- **Status:** done. Landed as the slice's first `components/` file — props in, JSX out (`config`/`agents`/`daemonLive`/`projectId`/`track`/the six `on*` callbacks), wrapping `AvatarMenu` with the same inline `trackComposerBarClick` analytics calls. Dropped the original's wrapping `<>...</>` Fragment (single child, no markup change). `track: ReturnType<typeof useAnalytics>['track']` is passed in as a prop rather than the component calling `useAnalytics()` itself, keeping it presentational per ADR 0002.

## 22. Top-level render composition
- **Lines:** 6865–7316 (the entire `return (...)` JSX tree)
- **Owns:** JSX only, but threads together nearly every hook's output. Sub-sections:
  - Split container + resize handle: 6874–7085
  - `ChatPane` element: 6890–7059 (~170 lines, ~80 props)
  - `projectHeader` inline JSX (editable title + type chip): 7027–7051 — good candidate for its own `EditableProjectTitle.tsx`
  - `designSystemPicker` inline JSX: 7052–7058
  - `FileWorkspace` element: 7086–7216 (~130 lines, ~70 props)
  - `headerActions` inline JSX (`HandoffButton` + `EntrySettingsMenu`): 7171–7201
  - `PluginDetailsModal` / `DesignSystemPreviewModal` conditionals: 7218–7234
  - `FirstArtifactHint` conditional: 7240–7242
  - `AmrBalanceDialog` / `AmrLowBalanceDialog`: 7243–7273 (ties to Cluster 12)
  - `Toast` + `BrandReadyPrompt` in `AnimatePresence`: 7274–7313
  - `activeConversationChatState` memo (5959–5999) feeding `FileWorkspace`'s side-chat prop
- **Coupling:** depends on virtually every other cluster's hook output — this must be done last.
- **Target:** `features/project-view/components/ProjectChatPaneSlot.tsx`, `features/project-view/components/ProjectFileWorkspaceSlot.tsx`, `features/project-view/components/ProjectViewModals.tsx`, `features/project-view/components/EditableProjectTitle.tsx` (all new). Define the large prop bags as named types in `features/project-view/types.ts` rather than inline object literals.
- **Shape:** dumb components (mostly prop pass-through, but the sheer prop count — 80 and 70 respectively — means a typo in wiring is easy to miss since most props are optional)
- **Risk:** medium — mechanical but huge; regressions here are silent UI/behavior bugs, not compile errors, since most props are optional.
- **Status:** pending

---

## Cross-cutting state that doesn't cleanly belong to one cluster

- **`workspaceFocused`** (line 754, reset effect 1302–1304) — pure layout toggle consumed by both Cluster 6/22 (chat pane hidden) and `FileWorkspace`'s `focusMode` prop. Recommend keeping in Cluster 22's shell or a tiny `useWorkspaceFocus` hook.
- **`commentInspectorActive`/`commentInspectorPortalId`/`leftInspectorActive`** (755–757) — spans Cluster 6 (comments) and Cluster 22 (render branch that swaps the chat pane for the comment-inspector portal).
- **`composerDraftSignal`** (6195) — written by both the already-extracted GitHub-connect-repo hook's callback (`handleConnectRepoConnected`) and by Cluster 22-adjacent `handleBrowserUsePrompt` (6237–6243). Needs a single owner when extracted (recommend the connect-repo hook, since it originated there).
- **`designSystemEditRequest`** (938) — written by `BrandReadyPrompt.onEditManually` (Cluster 22 JSX) and consumed by `FileWorkspace`. Lives naturally in Cluster 9.
- **`chatSeed`** (852) — cleared inside `handleSend` (Cluster 17), set by the design-system audit-repair path (Cluster 15) and by `initialDraft`/onboarding wiring (Cluster 3). A genuinely shared piece of state between three clusters; whichever hook owns it must expose both a setter and be imported by the other two.

## JSX sections still inlined in the render body (not yet split into `components/`)

Largest remaining category since `features/project-view/components/` doesn't exist yet. Full list, in render order: split container + resize handle; `ChatPane` invocation; the `projectHeader` and `designSystemPicker` inline JSX passed as `ChatPane` props; `FileWorkspace` invocation; the `headerActions` inline JSX passed as a `FileWorkspace` prop; `PluginDetailsModal`; `DesignSystemPreviewModal`; `FirstArtifactHint`; `AmrBalanceDialog`; `AmrLowBalanceDialog`; `Toast`; `BrandReadyPrompt`; and the `executionControls` (`AvatarMenu`) block. All captured under Clusters 21–22 above.

## window/EventSource/SSE/timer/fetch usage not yet behind a provider bridge

- Raw `window.setTimeout`/`setInterval`/`clearTimeout` calls scattered across: brand empty-transcript retry effect (1385–1389), `hasRunningBrandTranscriptRow` poll interval (2443–2446), `recoverArtifacts` poll interval (3821–3827), `pendingAmrRetry` poll interval + timeout (5519–5537), `readBrandBrowserSnapshotWithRetry` backoff delay (2273–2278), `handleContinueBrandExtraction`'s local `delay()` helper (6411–6414), and the two `Promise.race` read-timeouts in `readBrandBrowserSnapshot`/`downloadBrandBrowserPageArchive` (2189–2197, 2240–2247). None of these route through a provider — they'll move into whichever hook owns Clusters 13/14/16/17.
- Direct `document.hidden`/`document.hasFocus()`/`window.focus()` access in `notifyCompletedRun` (1461–1477) — Cluster 7.
- **Provider-bridge gap:** `window.sessionStorage.getItem` is called directly (not through `providers/project-view/auto-send-session.ts`) in two places — the `isAutoSend`/`amrGateOk` flag reads at 6276–6285 and the repeated flag read inside the auto-send effect at 6749–6754 — even though the sibling read/clear helpers for the *same* key family (`readAutoSendAttachments`, `readAutoSendContext`, `clearAutoSendSession`) are already wrapped in that provider. Worth adding `hasAutoSendFirstMessageFlag()`/`readAmrGateOkFlag()` to the port during Cluster 3's extraction so the abstraction boundary is consistent.
- `getBrandBrowser(...)`/`.executeJavaScript(...)` webview calls (2170–2224) already go through `runtime/brand-browser-bridge.ts` — that's the existing abstraction boundary — but the retry/race/backoff orchestration wrapped around them lives in `ProjectView.tsx`, not in a provider (Cluster 13).
- `htmlContentCacheRef` (1612) — an in-memory `Map`, not persisted; fine to keep as a hook-local ref, no provider needed.

## Props / consumers (fragility check)

- **Sole production consumer:** `apps/web/src/App.tsx` (~line 2314), one call site passing the full `Props` bag.
- **Test consumers that mount `ProjectView` directly** (regression safety net, will need to keep passing through every extraction): `ProjectView.tabs-navigation.test.tsx`, `ProjectView.reattach-restore.test.tsx`, `ProjectView.run-isolation.test.tsx`, `ProjectView.api-empty-response.test.tsx`, `ProjectView.deleteConversation.test.tsx`, `ProjectView.previewKeepAlive.test.tsx`, `ProjectView.pendingPrompt.test.tsx`.
- **Test consumers that import re-exported pure helpers straight from `ProjectView.tsx`** (lines 329–351 is a deliberate compatibility shim from a prior pass): `mergeSavedPreviewComment` (`ProjectView.run-isolation.test.tsx`), `projectSplitClassName`/`projectSplitStyle` (`ProjectView.tsx` itself **and** — slightly fragile — `apps/web/tests/components/FileWorkspace.test.tsx`, a FileWorkspace test depending on ProjectView's re-export rather than importing from `features/project-view` directly), `createBufferedTextUpdates` (`buffered-text-pending.test.tsx`), question-form-key helpers (`ProjectView.questionFormKey.test.ts`), and whatever `ProjectView.run-cleanup.test.tsx` pulls in. Any future move of a still-resident helper (notably Cluster 19's `createBufferedTextUpdates`/`resolveTerminalEndedAt`) must either keep the re-export list current or update these test imports in the same PR — flagged as a one-line follow-up: point `FileWorkspace.test.tsx` at `features/project-view` directly instead of `components/ProjectView`.

---

## Recommended extraction order

**Phase 1 — independent, low-risk, fully parallelizable (no shared state):**
1. Cluster 19 (streaming text-buffer / terminal-endedAt) — Clusters 16/17 will need this either way.
2. Cluster 1 (module-scope pure helpers/types)
3. Cluster 2 (mount lifecycle/timeout hook)
4. Cluster 7 (completion notifications)
5. Cluster 5 (question-form derivation)
6. Cluster 21 (execution controls JSX)

**Phase 2 — foundational state hooks (parallelizable among themselves except where noted):**
7. Cluster 4 (conversation & message core) — do this **alone/first** within the phase; nearly everything downstream imports its exports.
8. Cluster 6 (preview comments) — parallel with 9, 10 once 4 lands.
9. Cluster 8 (open tabs/URL sync) — parallel with 6, 10.
10. Cluster 9 (project files & artifacts) — parallel with 6, 8.
11. Cluster 10 (live project events) — must follow 9 (depends on its refresh functions); can run parallel with 6/8.
12. Cluster 11 (prompt-context signature) — fold into 9 rather than standalone.
13. Cluster 20 (project rename) — trivial, fold into existing `useProjectActions` anytime after 4.

**Phase 3 — mid-tier features depending on Phase 2 (parallelizable):**
14. Cluster 18 (plugin folder agent action) — depends on 4.
15. Cluster 15 (design-system workspace) — depends on 4, 9.
16. Cluster 13 (brand-browser-assist IO) — depends on 9.

**Phase 4 — high-risk core, must be SERIAL (single owner recommended):**
17. Cluster 12 (AMR balance gate) — extract the pure gate-decision helper first.
18. Cluster 16 (run reattach/recovery) — depends on 4, 9; shares refs with 17-below.
19. Cluster 17 (chat send pipeline) — the big one; depends on 4, 6, 9, 12, 15, 19. Do this only once 4/9/15 exist as importable hooks so `handleSend` can call their exports instead of closing over inline state.
20. Cluster 3 (onboarding funnel) — the auto-send effect calls `handleSend`, so finish after 17 (or land the state/refs now and wire the `handleSend` call in a follow-up commit within the same PR).
21. Cluster 14 (brand extraction workflow) — depends on 17 (calls `handleSend`), 9, 13. Do last among the high-risk group.

**Phase 5 — final assembly:**
22. Cluster 22 (top-level render composition into `components/`) — must be last; it only wires already-extracted hooks' outputs into JSX. Do this once every hook above exists, not incrementally alongside them, so the diff stays reviewable as "swap inline JSX for a typed prop bag" rather than mixing logic moves with JSX moves.

### Parallelization summary
- **Safe to parallelize:** all of Phase 1; within Phase 2, Clusters 6/8/9 (but not 4, which should land alone first, and not 10 before 9); within Phase 3, Clusters 14/15/16.
- **Must be serial:** Phase 4 in its listed order (12 → 16 → 17 → 3 → 14), and Phase 5 must follow everything else. This is the highest-risk chunk of the whole file — recommend one session/owner rather than splitting it across parallel agents, given how many `useRef`s and closure-captured locals interlock between `handleSend`, `handleStop`, the reattach effect, and the AMR gate.
