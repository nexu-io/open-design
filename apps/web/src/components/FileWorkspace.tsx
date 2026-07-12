import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackFileManagerClick,
  trackPageView,
  trackTabLauncherClick,
  trackSketchSaveResult,
  trackSketchExportResult,
} from '../analytics/events';
import { useT } from '../i18n';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
import { navigate } from '../router';
import { deliverableSlideNavForActiveFile } from '../runtime/slide-nav';
import { type DesignKitEditFocusRequest } from './DesignKitView';
import { DesignSystemProjectPanel } from './DesignSystemProjectPanel';
import {
  type AgentEvent,
  type AgentInfo,
  type AppConfig,
  type ChatCommentAttachment,
  type Conversation,
  conversationIdFromSideChatTabId,
  isSideChatTabId,
  isTerminalTabId,
  terminalIdFromTabId,
  liveArtifactSummaryToWorkspaceEntry,
  type LiveArtifactSummary,
  type LiveArtifactEventItem,
  type OpenTabsState,
  type PreviewComment,
  type PreviewCommentTarget,
  type DesignSystemSummary,
  type ProjectMetadata,
  type ProjectFile,
} from '../types';
import type { ChatSessionMode, WorkspaceContextItem } from '@open-design/contracts';
import type { QuestionForm } from '../artifacts/question-form';
import { DesignFilesPanel } from './DesignFilesPanel';
import { DesignBrowserPanel } from './DesignBrowserPanel';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { APP_CHROME_FILE_ACTIONS_ID } from './AppChromeHeader';
import { FileViewer, LiveArtifactViewer } from './FileViewer';
import { Icon } from './Icon';
import { Toast } from './Toast';
import { TabLauncherMenu } from './workspace/TabLauncherMenu';
import { SideChatTab, type ActiveConversationChatState } from './workspace/SideChatTab';
import { TerminalViewer } from './workspace/TerminalViewer';
import { LibraryPicker } from './LibraryPicker';
import { QuestionsPanel } from './QuestionsPanel';
import { QuickSwitcher } from './QuickSwitcher';
import { SketchEditor } from './SketchEditor';
import { SketchEnginePrewarm } from './SketchEnginePrewarm';
import { AnimatePresence } from 'motion/react';
import type { ChatMessage } from '../types';
import {
  activeFileForTab,
  activeLiveArtifactForTab,
  browserTabRenderInfo,
  DESIGN_FILES_TAB,
  DESIGN_SYSTEM_TAB,
  fileTabRenderInfo,
  isBrowserTabId,
  isLiveArtifactImplementationPath,
  isSketchName,
  QUESTIONS_TAB,
  scrollWorkspaceTabsWithWheel,
  Tab,
  translateTabBarSyntheticWheel,
  useBrowserTabs,
  useTabReorderDnd,
  useWiredDesignFilesPanelState,
  useWiredFileOperations,
  useWiredProjectFolders,
  useWiredSketches,
  useWiredWorkspaceKeyboardShortcuts,
  useWiredWorkspaceTabBarDom,
  useWorkspaceContextTracking,
  useWorkspaceLauncher,
  useWorkspaceTabActivation,
  useWorkspaceTabRequests,
  type BrowserAttentionRequest,
  type BrowserOpenRequest,
  type BrowserWorkspaceTab,
  type DesignSystemReviewAgentTask,
  type DesignSystemReviewDecision,
  type DesignSystemReviewDetails,
  type WorkspaceOrderedTab,
} from '../features/file-workspace';
// Re-exported so `./FileWorkspace` stays a stable import path for the
// existing test suite / external consumers (e.g. `ProjectView.tsx`) now that
// these live in the slice.
export { scrollWorkspaceTabsWithWheel };
export type { BrowserOpenRequest, BrowserAttentionRequest };

interface Props {
  projectId: string;
  projectKind: TrackingProjectKind;
  // Basename of the project's chosen working directory (e.g. "openclaw").
  // Threaded to DesignFilesPanel as the breadcrumb root label. Undefined for
  // default-storage projects.
  rootDirName?: string;
  // True while a working-dir replace is reindexing; shows a loading state.
  reloading?: boolean;
  /** Absolute on-disk project directory (from GET /api/projects/:id). Used by
   * the Design Files panel's "copy absolute path" action. */
  resolvedDir?: string | null;
  files: ProjectFile[];
  liveArtifacts: LiveArtifactSummary[];
  filesRefreshKey?: number;
  onRefreshFiles: () => Promise<void> | void;
  isDeck: boolean;
  streaming?: boolean;
  commentQueueOnSend?: boolean;
  commentSendDisabled?: boolean;
  openRequest?: { name: string; nonce: number } | null;
  browserOpenRequest?: BrowserOpenRequest | null;
  // Browser tab whose <webview> must stay mounted even while another workspace
  // tab is active. Set for programmatic brand extraction: the chat "Continue
  // extraction" handler reads the live, post-wall DOM out of this tab's webview,
  // so tearing it down on a tab switch (or a refresh-driven remount) would
  // silently drop the read back to a re-walled server fetch.
  pinnedBrowserTabId?: string | null;
  // Open the named file AND surface its Share/Export menu. Drives the chat-side
  // "Share" next-step action without a dedicated share backend.
  shareRequest?: { name: string; nonce: number } | null;
  // Open the named file AND surface its Download/Export menu. Drives the
  // chat-side "Download" next-step action.
  downloadRequest?: { name: string; nonce: number } | null;
  // Flip a deck preview to a given slide when a queued chat send starts. Mirrors
  // `shareRequest`: the named file is activated (if open) and the matching
  // FileViewer consumes the nonce to navigate.
  slideNavRequest?: { name: string; slideIndex: number; nonce: number } | null;
  liveArtifactEvents?: LiveArtifactEventItem[];
  designSystemActivityEvents?: AgentEvent[];
  // Persisted set of open tabs + active tab. Owned by ProjectView so the
  // daemon's SQLite store can hold the source of truth and survive reloads.
  tabsState: OpenTabsState;
  onTabsStateChange: (next: OpenTabsState) => void;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[]) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[], images?: File[]) => Promise<boolean | void> | boolean | void;
  onBrandExtractionStopRequest?: () => void;
  onRequestBrowserUsePrompt?: (prompt: string) => void;
  onPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  preferredPreviewFile?: string | null;
  autoPreviewDesignArtifacts?: boolean;
  focusMode?: boolean;
  onFocusModeChange?: (next: boolean) => void;
  designSystemProject?: DesignSystemSummary | null;
  designSystemBrandId?: string | null;
  /** False while a brand-extraction design system is still running. */
  designSystemEditable?: boolean;
  defaultDesignSystemId?: string | null;
  onSetDefaultDesignSystem?: (id: string | null) => Promise<void> | void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onCreateDesignSystemFromProject?: () => void;
  createDesignSystemFromProjectBusy?: boolean;
  onDuplicateProject?: () => void;
  duplicateProjectBusy?: boolean;
  // Delete the backing project (and navigate away) for the design-system project
  // tab's "..." menu. Resolves to handleDeleteProject in App.
  onDeleteDesignSystemProject?: (id: string) => Promise<boolean> | boolean;
  onDesignSystemNeedsWork?: (
    sectionTitle: string,
    feedback: string,
    files: string[],
  ) => DesignSystemReviewAgentTask | void;
  designSystemReview?: ProjectMetadata['designSystemReview'];
  onDesignSystemReviewDecision?: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
  onUseDesignSystem?: (id: string, title: string) => Promise<void> | void;
  designSystemEditRequest?: DesignKitEditFocusRequest | null;
  onConnectRepo?: () => void;
  githubConnected?: boolean;
  commentPortalId?: string;
  onCommentModeChange?: (active: boolean) => void;
  // Side Chat (`chat:<conversationId>` tab) wiring. Threaded from ProjectView
  // so a secondary ChatPane can render an already-open conversation tab without
  // FileWorkspace owning any chat state. All optional: a workspace mounted
  // without these simply does not render restored side-chat tabs. There is no
  // launcher affordance to create new side chats — only persisted `chat:` tabs
  // are restored.
  chatConfig?: AppConfig;
  chatAgentsById?: Map<string, AgentInfo>;
  chatLocale?: string;
  conversations?: Conversation[];
  /** The primary chat's active conversation. */
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  onConversationSessionModeChange?: (id: string, mode: ChatSessionMode) => void;
  onNewConversation?: () => void;
  activeConversationChat?: ActiveConversationChatState;
  onActiveContextChange?: (context: WorkspaceContextItem | null) => void;
  onWorkspaceContextsChange?: (contexts: WorkspaceContextItem[]) => void;
  messages?: ChatMessage[];
  artifactHtml?: string | null;
  conversationError?: string | null;
  onRetry?: (message: ChatMessage) => void;
  // Contextual failure recovery, mirrored from the chat error card so the
  // preview surface can offer the same one-click fix (AMR authorize, terminal
  // sign-in) instead of a bare retry.
  onAuthorizeAndRetry?: (message: ChatMessage) => void;
  onLaunchTerminalAuth?: () => void;
  // Conversation id for the AMR promotion-card telemetry payload.
  conversationId?: string | null;
  // Project-level actions (settings, handoff, avatar menu) rendered at the
  // right end of the Design Files tab row. The former standalone chrome header
  // row was removed; these moved here alongside the FileViewer present/Share
  // portal that targets the same actions container.
  headerActions?: ReactNode;
  // Active discovery question form, surfaced in the right-hand Questions tab
  // instead of inline in the chat. Owned by ProjectView (derived from the
  // latest assistant message).
  questionForm?: QuestionForm | null;
  // Tolerantly-parsed form shown while the block is still streaming, so the
  // panel renders a frame and fills questions in progressively.
  questionFormPreview?: QuestionForm | null;
  // Stable per-occurrence id so the panel can remember a completed reveal
  // across the streaming→persisted remount instead of re-animating.
  questionFormKey?: string | null;
  questionFormInteractive?: boolean;
  // The turn is busy (streaming/queued) — keep Continue/Skip disabled while the
  // form itself stays editable.
  questionFormSubmitDisabled?: boolean;
  questionFormSubmittedAnswers?: Record<string, string | string[]>;
  questionsGenerating?: boolean;
  onSubmitQuestionForm?: (text: string) => void;
  // Bumped nonce that focuses the Questions tab (banner click / new form).
  focusQuestionsRequest?: { nonce: number } | null;
}

// Re-exported so `./FileWorkspace` stays a stable import path for external
// consumers (e.g. `ProjectView.tsx`) now that these live in the slice.
export { DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB };

export function FileWorkspace({
  projectId,
  projectKind,
  rootDirName,
  reloading,
  resolvedDir,
  files,
  liveArtifacts,
  filesRefreshKey = 0,
  onRefreshFiles,
  isDeck,
  streaming,
  commentQueueOnSend = false,
  commentSendDisabled = false,
  openRequest,
  browserOpenRequest,
  pinnedBrowserTabId,
  shareRequest,
  downloadRequest,
  slideNavRequest,
  liveArtifactEvents = [],
  designSystemActivityEvents = [],
  tabsState,
  onTabsStateChange,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onBrandExtractionStopRequest,
  onRequestBrowserUsePrompt,
  onPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  preferredPreviewFile = null,
  autoPreviewDesignArtifacts = false,
  focusMode = false,
  onFocusModeChange,
  designSystemProject = null,
  designSystemBrandId = null,
  designSystemEditable = true,
  defaultDesignSystemId = null,
  onSetDefaultDesignSystem,
  onDesignSystemsRefresh,
  onCreateDesignSystemFromProject,
  createDesignSystemFromProjectBusy = false,
  onDuplicateProject,
  duplicateProjectBusy = false,
  onDeleteDesignSystemProject,
  onDesignSystemNeedsWork,
  designSystemReview,
  onDesignSystemReviewDecision,
  onUseDesignSystem,
  designSystemEditRequest,
  onConnectRepo,
  githubConnected,
  commentPortalId,
  onCommentModeChange,
  chatConfig,
  chatAgentsById,
  chatLocale,
  conversations = [],
  activeConversationId = null,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onConversationSessionModeChange,
  onNewConversation,
  activeConversationChat,
  onActiveContextChange,
  onWorkspaceContextsChange,
  messages = [],
  conversationId,
  headerActions,
  questionForm = null,
  questionFormPreview = null,
  questionFormKey = null,
  questionFormInteractive = false,
  questionFormSubmitDisabled = false,
  questionFormSubmittedAnswers,
  questionsGenerating = false,
  onSubmitQuestionForm,
  focusQuestionsRequest = null,
}: Props) {
  const t = useT();
  // The chat column only shows a compact Questions banner; the form itself
  // lives here, including after submission when a banner click can reopen the
  // answered preview.
  const showQuestionsTab = Boolean(questionForm || questionFormPreview || questionsGenerating);
  const analytics = useAnalytics();
  // P1 page_view page_name=file_manager — once per project the user lands
  // inside the workspace. Re-fire when the projectId changes so a
  // project-switch session shows up as a fresh view rather than reusing
  // the previous one.
  const fileManagerViewedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (fileManagerViewedProjectRef.current === projectId) return;
    fileManagerViewedProjectRef.current = projectId;
    trackPageView(analytics.track, { page_name: 'file_manager' });
  }, [projectId, analytics.track]);
  const defaultRootTab = designSystemProject ? DESIGN_SYSTEM_TAB : DESIGN_FILES_TAB;
  // Persisted tabs come from the parent. Active tab can transiently point
  // at a pending sketch — pending sketches are not in tabsState.tabs.
  const persistedTabs = tabsState.tabs;
  // Launcher "create" actions (New Terminal / Side Chat) resolve
  // asynchronously; keep the latest committed tab state out of render
  // closures so opening the new tab appends to the freshest list instead of
  // replaying a stale closure and dropping tabs added in the meantime.
  const tabsStateRef = useRef(tabsState);
  const lastTabsStatePropRef = useRef(tabsState);
  if (lastTabsStatePropRef.current !== tabsState) {
    tabsStateRef.current = tabsState;
    lastTabsStatePropRef.current = tabsState;
  }
  const [activeTab, setActiveTab] = useState<string>(
    tabsState.active ?? defaultRootTab,
  );

  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tabsBarRef = useRef<HTMLDivElement | null>(null);
  const openFileRef = useRef<(name: string) => void>(() => {});
  // Cluster 4 (`useBrowserTabs`) needs the tab-activation cluster's derived
  // `orderedWorkspaceTabs` to anchor a newly-opened browser tab, but that
  // value is itself derived FROM `useBrowserTabs`' own `browserTabs` state —
  // a plain value param would be a hook-ordering cycle. Threaded through a
  // ref the orchestrator updates at render time right after
  // `useWorkspaceContextTracking` below, mirroring `openFileRef` above.
  const orderedWorkspaceTabsRef = useRef<WorkspaceOrderedTab[]>([]);
  // `useWorkspaceTabActivation` (below) owns `openFile`/`commitTabsState`/
  // `workspaceTabsState`/`setPersistedActive`, but it must be called AFTER
  // `useBrowserTabs`/`useWorkspaceContextTracking` (it needs their derived
  // values as plain params, not refs — see EXTRACTION-PLAN.md cluster 3).
  // `useWiredSketches`/`useWiredFileOperations`/`useBrowserTabs` are called
  // BEFORE it and still need to invoke these four primitives, so they get a
  // stable wrapper that always forwards to the latest `.current` — the same
  // ref-bridge shape as `openFileRef`, generalized to the other three.
  const workspaceTabsStateRef = useRef<
    (tabs: string[], active: string | null, nextBrowserTabs?: BrowserWorkspaceTab[]) => OpenTabsState
  >((tabs, active) => ({ tabs, active }));
  const commitTabsStateRef = useRef<(next: OpenTabsState) => void>(() => {});
  const setPersistedActiveRef = useRef<(name: string | null) => void>(() => {});
  const workspaceTabsStateStable = useCallback(
    (tabs: string[], active: string | null, nextBrowserTabs?: BrowserWorkspaceTab[]) =>
      workspaceTabsStateRef.current(tabs, active, nextBrowserTabs),
    [],
  );
  const commitTabsStateStable = useCallback(
    (next: OpenTabsState) => commitTabsStateRef.current(next),
    [],
  );
  const setPersistedActiveStable = useCallback(
    (name: string | null) => setPersistedActiveRef.current(name),
    [],
  );
  const openFileStable = useCallback((name: string) => openFileRef.current(name), []);

  const visibleFiles = useMemo(
    () => files.filter((file) => !isLiveArtifactImplementationPath(file.name)),
    [files],
  );

  const liveArtifactEntries = useMemo(
    () => liveArtifacts.map(liveArtifactSummaryToWorkspaceEntry),
    [liveArtifacts],
  );

  const { uploadDir, setUploadDir, projectFolders, refreshProjectFolders } = useWiredProjectFolders({
    projectId,
  });

  // Tab-state coordination is threaded through as params (deps-bag) rather
  // than reimplemented here: `commitTabsState`/`workspaceTabsState` are owned
  // by `useWorkspaceTabActivation`, called later in this render — reached
  // here through the stable ref-bridge wrappers declared above.
  const {
    sketches,
    setSketchScene,
    clearSketch,
    saveSketch,
    exportSketchImage,
    startNewSketch,
    discardPendingSketchEntry,
    pruneClosedSketchEntry,
    removeSketchEntry,
    removeSketchEntries,
    renameSketchEntry,
  } = useWiredSketches({
    projectId,
    uploadDir,
    activeTab,
    visibleFiles,
    t,
    setActiveTab,
    onRefreshFiles,
    refreshProjectFolders,
    onUploadError: setUploadError,
    getCurrentTabs: () => tabsStateRef.current.tabs,
    getCurrentActive: () => tabsStateRef.current.active ?? null,
    commitTabs: (nextTabs, nextActive) =>
      commitTabsStateStable(workspaceTabsStateStable(nextTabs, nextActive)),
  });

  // File-operations cluster (upload/delete/rename/new-document) is threaded
  // through as params too: `openFile`/`workspaceTabsState` are owned by
  // `useWorkspaceTabActivation`, called later in this render — reached here
  // through the stable ref-bridge wrappers declared above.
  const {
    handleFilePicked,
    uploadFiles,
    handleDelete,
    handleDeleteMany,
    handleRename,
    createMarkdownDocument,
  } = useWiredFileOperations({
    projectId,
    projectKind,
    files,
    uploadDir,
    sketches,
    activeTab,
    persistedTabs,
    tabsStateActive: tabsState.active,
    t,
    analyticsTrack: analytics.track,
    openFile: openFileStable,
    onRefreshFiles,
    refreshProjectFolders,
    onUploadError: setUploadError,
    onTabsStateChange,
    setActiveTab,
    workspaceTabsState: workspaceTabsStateStable,
    removeSketchEntry,
    removeSketchEntries,
    renameSketchEntry,
  });

  // True when the Design Files tab has nothing to attach: no files, no live
  // artifacts, no folders. Mirrors DesignFilesPanel's own empty-state gate so
  // the "Design files" composer context and the empty placeholder agree on
  // when the tab is actually empty. Reused below to suppress the auto-attached
  // workspace context for a brand-new/empty project.
  const designFilesTabIsEmpty =
    visibleFiles.length === 0
    && liveArtifactEntries.length === 0
    && projectFolders.length === 0;

  // Pull the persisted active tab in when the parent's hydration completes
  // (or on project switch). Fall back to the Design Files browser so a
  // fresh project lands in a useful place.
  useEffect(() => {
    setActiveTab(tabsState.active ?? defaultRootTab);
  }, [tabsState.active, defaultRootTab]);

  // The launcher-close-on-projectId-change reset stays inline (it must
  // register before `useWorkspaceLauncher`'s own state exists — a mount-order
  // constraint, not a missing extraction; `setLauncherOpen` itself IS owned
  // by `useWorkspaceLauncher`, called later in this render); the browser-tab
  // resets live inside `useBrowserTabs` below.
  useEffect(() => {
    setLauncherOpen(false);
  }, [projectId]);

  // Embedded browser tabs (list, navigate/attention requests, mount-alive
  // LRU, snapshot toast). Declared AFTER the "pull persisted active tab"
  // effect above so its own `browserOpenRequest`-driven `setActiveTab` call
  // registers — and therefore flushes — LATER than that effect on mount;
  // reversing this order would let the persisted-tab effect clobber a
  // freshly-opened browser tab's `activeTab` back to `tabsState.active`.
  // `commitTabsState`/`workspaceTabsState`/`setPersistedActive` are owned by
  // `useWorkspaceTabActivation` below, called AFTER this hook — reached here
  // through the stable ref-bridge wrappers declared above (same shape as
  // `openFileRef`).
  const {
    browserTabs,
    setBrowserTabs,
    browserNavigateRequests,
    browserAttentionRequests,
    mountedBrowserTabIds,
    browserSnapshotToast,
    setBrowserSnapshotToast,
    openBrowserTab,
    closeBrowserTab,
    updateBrowserTabInfo,
    handleBrowserPageSnapshotToast,
  } = useBrowserTabs({
    projectId,
    pinnedBrowserTabId,
    tabsState,
    activeTab,
    setActiveTab,
    persistedTabs,
    orderedWorkspaceTabsRef,
    onTabsStateChange,
    commitTabsState: commitTabsStateStable,
    workspaceTabsState: workspaceTabsStateStable,
    setUploadError,
    setPersistedActive: setPersistedActiveStable,
    openFileRef,
    browserOpenRequest,
    t,
  });

  const activeFile = useMemo(
    () => activeFileForTab(activeTab, visibleFiles, sketches),
    [activeTab, visibleFiles, sketches],
  );

  const activeLiveArtifact = useMemo(
    () => activeLiveArtifactForTab(activeTab, liveArtifactEntries),
    [activeTab, liveArtifactEntries],
  );

  const {
    tabNames,
    orderedWorkspaceTabs,
    workspaceTabIds,
    workspaceContexts,
  } = useWorkspaceContextTracking({
    persistedTabs,
    sketches,
    browserTabs,
    designSystemProject,
    showQuestionsTab,
    activeTab,
    designFilesTabIsEmpty,
    uploadDir,
    resolvedDir,
    t,
    conversations,
    activeFile,
    activeLiveArtifact,
    visibleFiles,
    liveArtifactEntries,
    onActiveContextChange,
    onWorkspaceContextsChange,
  });
  // Cluster 4's browser-tab open actions read this at call time (post-render,
  // never during render), so a plain render-time assignment is safe — see the
  // ref's declaration comment above.
  orderedWorkspaceTabsRef.current = orderedWorkspaceTabs;

  // The tab-activation cluster: `openFile`/`closeTab`/`focusWorkspaceTab`/
  // `activateWorkspaceTab*`/`closeActiveWorkspaceTab`/`openFileReplacing`/
  // `commitTabsState`/`workspaceTabsState`/`setPersistedActive`/
  // `activatePending`. Called here — AFTER `useBrowserTabs` and
  // `useWorkspaceContextTracking` — because it needs `browserTabs`/
  // `closeBrowserTab`/`orderedWorkspaceTabs`/`workspaceTabIds`/`sketches` as
  // plain values, not refs (see EXTRACTION-PLAN.md cluster 3). The three
  // earlier hooks that call these primitives before they exist go through
  // the stable ref-bridge wrappers declared near `openFileRef` above; the
  // refs are populated with the real functions right after this call.
  const {
    workspaceTabsState,
    commitTabsState,
    setPersistedActive,
    activatePending,
    openFile,
    focusWorkspaceTab,
    activateWorkspaceTabByOffset,
    activateWorkspaceTabByIndex,
    closeActiveWorkspaceTab,
    openFileReplacing,
    closeTab,
    handleTerminalSessionChange,
  } = useWorkspaceTabActivation({
    projectId,
    t,
    tabsState,
    tabsStateRef,
    defaultRootTab,
    persistedTabs,
    activeTab,
    setActiveTab,
    onTabsStateChange,
    setUploadError,
    browserTabs,
    setBrowserTabs,
    closeBrowserTab,
    orderedWorkspaceTabs,
    workspaceTabIds,
    sketches,
    discardPendingSketchEntry,
    pruneClosedSketchEntry,
    designSystemProject,
  });
  workspaceTabsStateRef.current = workspaceTabsState;
  commitTabsStateRef.current = commitTabsState;
  setPersistedActiveRef.current = setPersistedActive;
  openFileRef.current = openFile;

  const { slideNavDeliverableNonce } = useWorkspaceTabRequests({
    activeTab,
    setActiveTab,
    defaultRootTab,
    persistedTabs,
    browserTabs,
    setBrowserTabs,
    orderedWorkspaceTabs,
    sketches,
    designSystemProject,
    showQuestionsTab,
    setUploadError,
    setPersistedActive,
    onTabsStateChange,
    commitTabsState,
    workspaceTabsState,
    openRequest,
    shareRequest,
    downloadRequest,
    slideNavRequest,
    focusQuestionsRequest,
    designSystemEditRequest,
    questionFormSubmittedAnswers,
  });

  // Launcher ("+" menu: file search + create-new actions) and tab-bar
  // drag-reorder. `openFile`/`workspaceTabsState` are hoisted function
  // declarations further down this render — referencing them here before
  // their textual declaration point is safe, same as `useBrowserTabs` above.
  const {
    launcherOpen,
    setLauncherOpen,
    launcherToast,
    setLauncherToast,
    launcherBtnRef,
    launcherContext,
    launcherActions,
    openWorkspaceTabLauncher,
  } = useWorkspaceLauncher({
    projectId,
    openFile,
    openBrowserTab,
    startNewSketch,
    createMarkdownDocument,
    fileInputRef,
    t,
  });

  const {
    draggedTabName,
    dragOverTab,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDragLeave,
    handleTabDrop,
    handleTabDragEnd,
    handleTabBarDragLeave,
    handleTabBarDrop,
  } = useTabReorderDnd({
    persistedTabs,
    tabsStateActive: tabsState.active,
    onTabsStateChange,
    workspaceTabsState,
  });

  const {
    designFilesNavRef,
    onDesignFilesNavStateChange,
    showLibraryPicker,
    setShowLibraryPicker,
    handleLibraryPickerConfirm,
  } = useWiredDesignFilesPanelState({
    projectId,
    uploadDir,
    onRefreshFiles,
    openFile,
  });

  const { quickSwitcherOpen, setQuickSwitcherOpen } = useWiredWorkspaceKeyboardShortcuts({
    workspaceTabIds,
    openWorkspaceTabLauncher,
    closeActiveWorkspaceTab,
    activateWorkspaceTabByOffset,
    activateWorkspaceTabByIndex,
  });

  const { tabsOverflowing } = useWiredWorkspaceTabBarDom({
    tabsBarRef,
    activeTab,
    browserTabsCount: browserTabs.length,
    designSystemProject,
    tabNamesCount: tabNames.length,
  });

  const isActiveSketch = activeFile?.kind === 'sketch' && isSketchName(activeFile.name);
  const activeSketch = activeFile && isActiveSketch ? sketches[activeFile.name] : null;

  return (
    <div
      className={[
        'workspace',
        designSystemProject ? 'has-design-system-tab' : '',
      ].filter(Boolean).join(' ')}
      data-testid="file-workspace"
    >
      <SketchEnginePrewarm />
      <div className="ws-tabs-shell">
        {onFocusModeChange && focusMode ? (
          <button
            type="button"
            className="icon-only ws-focus-expand od-tooltip"
            data-testid="workspace-focus-toggle"
            aria-pressed={focusMode}
            title={t('workspace.showChat')}
            data-tooltip={t('workspace.showChat')}
            data-tooltip-placement="bottom"
            aria-label={t('workspace.showChat')}
            onClick={() => onFocusModeChange(false)}
          >
            <Icon name="chevron-right" size={15} />
          </button>
        ) : null}
        <div
          ref={tabsBarRef}
          className={`ws-tabs-bar${tabsOverflowing ? ' is-overflowing' : ''}`}
          role="tablist"
          aria-label={t('workspace.designFiles')}
          onWheel={(event) => translateTabBarSyntheticWheel(event.currentTarget, event)}
          onDragLeave={handleTabBarDragLeave}
          onDrop={handleTabBarDrop}
        >
          {designSystemProject ? (
            <button
              type="button"
              className={`ws-tab design-system-tab ${activeTab === DESIGN_SYSTEM_TAB ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === DESIGN_SYSTEM_TAB}
              tabIndex={0}
              data-testid="design-system-project-tab"
              onClick={() => setPersistedActive(DESIGN_SYSTEM_TAB)}
              title={t('dsManager.tabDesignSystem')}
            >
              <span className="tab-icon" aria-hidden>
                <Icon name="blocks" size={13} />
              </span>
              <span className="ws-tab-label">{t('dsManager.tabDesignSystem')}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`ws-tab design-files-tab ${activeTab === DESIGN_FILES_TAB ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === DESIGN_FILES_TAB}
            tabIndex={0}
            data-testid="design-files-tab"
            onClick={() => setPersistedActive(DESIGN_FILES_TAB)}
            title={t('workspace.designFiles')}
          >
            <span className="tab-icon" aria-hidden>
              <Icon name="grid" size={13} />
            </span>
            <span className="ws-tab-label">{t('workspace.designFiles')}</span>
          </button>
          {showQuestionsTab ? (
            <button
              type="button"
              className={`ws-tab questions-tab ${activeTab === QUESTIONS_TAB ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === QUESTIONS_TAB}
              tabIndex={0}
              data-testid="questions-tab"
              onClick={() => setActiveTab(QUESTIONS_TAB)}
              title={t('questions.tabLabel')}
            >
              <span className="tab-icon" aria-hidden>
                <Icon name="help-circle" size={13} />
              </span>
              <span className="ws-tab-label">{t('questions.tabLabel')}</span>
            </button>
          ) : null}
          {orderedWorkspaceTabs.map((entry) => {
            if (entry.kind === 'browser') {
              const browserTab = entry.browserTab;
              const { label, title } = browserTabRenderInfo(browserTab);
              return (
                <Tab
                  key={browserTab.id}
                  label={label}
                  title={title}
                  active={activeTab === browserTab.id}
                  onActivate={() => setPersistedActive(browserTab.id)}
                  onClose={() => closeBrowserTab(browserTab.id)}
                  kind="browser"
                />
              );
            }
            const name = entry.name;
            const { label, iconNameOverride, kind, liveArtifact, isPending } = fileTabRenderInfo(
              name,
              sketches,
              visibleFiles,
              liveArtifactEntries,
              tabNames,
              conversations,
              t,
            );
            return (
              <Tab
                key={name}
                label={label}
                iconNameOverride={iconNameOverride}
                active={activeTab === name}
                onActivate={() =>
                  isPending ? activatePending(name) : setPersistedActive(name)
                }
                onClose={() => closeTab(name)}
                kind={kind}
                liveArtifact={liveArtifact}
                draggable={persistedTabs.includes(name)}
                dragging={draggedTabName === name}
                dragOverEdge={
                  dragOverTab?.name === name && draggedTabName !== name
                    ? dragOverTab.edge
                    : null
                }
                onDragStart={(event) => handleTabDragStart(name, event)}
                onDragOver={(event) => handleTabDragOver(name, event)}
                onDragLeave={() => handleTabDragLeave(name)}
                onDrop={(event) => handleTabDrop(name, event)}
                onDragEnd={handleTabDragEnd}
              />
            );
          })}
        </div>
        <div className="ws-add-tab">
          <button
            ref={launcherBtnRef}
            type="button"
            className="icon-only ws-tab-add od-tooltip"
            data-testid="workspace-add-tab"
            aria-haspopup="dialog"
            aria-expanded={launcherOpen}
            title={t('workspace.newTab')}
            data-tooltip={t('workspace.newTab')}
            data-tooltip-placement="bottom"
            aria-label={t('workspace.newTab')}
            onClick={() => setLauncherOpen((v) => !v)}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
        {/* Pinned to the right for project/file actions; the tab launcher sits
            next to the file tabs so its spatial relationship stays clear. */}
        <div className="ws-tabs-actions">
          <div
            id={APP_CHROME_FILE_ACTIONS_ID}
            className="ws-tabs-file-actions"
            data-app-chrome-file-actions="true"
          />
          {headerActions ? (
            <div className="ws-tabs-project-actions">{headerActions}</div>
          ) : null}
        </div>
      </div>
      {launcherOpen ? (
        <TabLauncherMenu
          anchor={launcherBtnRef.current}
          files={visibleFiles}
          workspaceContexts={workspaceContexts}
          openTabNames={tabNames}
          actions={launcherActions}
          launcherContext={launcherContext}
          onOpenFile={openFile}
          onOpenTab={focusWorkspaceTab}
          onTrack={(input) =>
            trackTabLauncherClick(analytics.track, {
              page_name: 'file_manager',
              area: 'tab_launcher',
              ...(projectId ? { project_id: projectId } : {}),
              ...input,
            })
          }
          onClose={() => setLauncherOpen(false)}
        />
      ) : null}
      {browserSnapshotToast ? (
        <Toast
          message={browserSnapshotToast.message}
          details={browserSnapshotToast.details}
          actionLabel={browserSnapshotToast.actionLabel}
          className={browserSnapshotToast.className}
          onAction={browserSnapshotToast.onAction}
          role={browserSnapshotToast.role}
          tone={browserSnapshotToast.tone}
          ttlMs={browserSnapshotToast.ttlMs}
          onDismiss={() => setBrowserSnapshotToast(null)}
        />
      ) : launcherToast ? (
        <Toast
          message={launcherToast}
          role="alert"
          onDismiss={() => setLauncherToast(null)}
        />
      ) : null}
      <div className="ws-body">
        {/* Banner moved into DesignFilesPanel for the Design Files tab so
            single-click preview (which keeps activeTab on DESIGN_FILES_TAB)
            no longer leaves a stale banner mounted above the preview.
            Keep a fallback here that fires only when activeTab is not the
            Design Files tab, which preserves visibility for the
            partial-upload case where the last successful file auto-opens
            into a viewer surface. */}
        {uploadError && activeTab !== DESIGN_FILES_TAB ? (
          <div className="df-upload-banner" data-testid="upload-error-banner">
            <span>{uploadError}</span>
            <button
              type="button"
              data-testid="upload-error-dismiss"
              onClick={() => setUploadError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {browserTabs.filter((browserTab) => mountedBrowserTabIds.has(browserTab.id)).map((browserTab) => (
          <div
            key={`${projectId}:${browserTab.id}`}
            className={`ws-browser-panel ${activeTab === browserTab.id ? 'active' : ''}`}
            aria-hidden={activeTab === browserTab.id ? undefined : true}
          >
            <DesignBrowserPanel
              projectId={projectId}
              browserTabId={browserTab.id}
              resolvedDir={resolvedDir}
              initialIconUrl={browserTab.iconUrl}
              initialTitle={browserTab.title}
              initialUrl={browserTab.url}
              navigateRequest={browserNavigateRequests[browserTab.id]}
              attentionRequest={browserAttentionRequests[browserTab.id]}
              sendDisabled={Boolean(streaming)}
              previewComments={previewComments}
              onSavePreviewComment={onSavePreviewComment}
              onRemovePreviewComment={onRemovePreviewComment}
              onSendBoardCommentAttachments={onSendBoardCommentAttachments}
              onRequestBrowserUsePrompt={onRequestBrowserUsePrompt}
              onPageSnapshotToast={handleBrowserPageSnapshotToast}
              onRefreshFiles={onRefreshFiles}
              onOpenDesignFiles={() => setPersistedActive(DESIGN_FILES_TAB)}
              onOpenFile={openFile}
              onPageInfoChange={(info) => updateBrowserTabInfo(browserTab.id, info)}
            />
          </div>
        ))}
        {activeTab === QUESTIONS_TAB ? (
          <QuestionsPanel
            key={questionFormKey ?? undefined}
            projectId={projectId}
            formKey={questionFormKey}
            form={questionForm ?? questionFormPreview}
            interactive={questionFormInteractive}
            submitDisabled={questionFormSubmitDisabled}
            submittedAnswers={questionFormSubmittedAnswers}
            generating={questionsGenerating}
            onSubmit={(text) => onSubmitQuestionForm?.(text)}
          />
        ) : activeTab === DESIGN_SYSTEM_TAB && designSystemProject ? (
          <DesignSystemProjectPanel
            projectId={projectId}
            system={designSystemProject}
            brandId={designSystemBrandId}
            editable={designSystemEditable}
            files={visibleFiles}
            streaming={Boolean(streaming)}
            activityEvents={designSystemActivityEvents}
            onOpenFile={openFile}
            onUploadAssets={() => fileInputRef.current?.click()}
            onRefreshFiles={onRefreshFiles}
            defaultDesignSystemId={defaultDesignSystemId}
            onSetDefaultDesignSystem={onSetDefaultDesignSystem}
            onDesignSystemsRefresh={onDesignSystemsRefresh}
            onDeleteDesignSystemProject={onDeleteDesignSystemProject}
            onNeedsWork={onDesignSystemNeedsWork}
            designSystemReview={designSystemReview}
            onReviewDecision={onDesignSystemReviewDecision}
            onUseDesignSystem={onUseDesignSystem}
            editFocusRequest={designSystemEditRequest}
            onConnectRepo={onConnectRepo}
            githubConnected={githubConnected}
          />
        ) : activeTab === DESIGN_FILES_TAB ? (
          <DesignFilesPanel
            key={projectId}
            projectId={projectId}
            rootDirName={rootDirName}
            reloading={reloading}
            running={Boolean(streaming)}
            files={visibleFiles}
            folders={projectFolders}
            liveArtifacts={liveArtifactEntries}
            onRefreshFiles={onRefreshFiles}
            onCurrentDirChange={setUploadDir}
            navState={designFilesNavRef.current}
            onNavStateChange={onDesignFilesNavStateChange}
            onOpenFile={(name) => {
              // Re-engagement entry: opening an existing sketch from the file
              // list (new_sketch already covers fresh creation).
              if (isSketchName(name)) {
                trackFileManagerClick(analytics.track, {
                  page_name: 'file_manager',
                  area: 'file_manager',
                  element: 'open_sketch',
                });
              }
              openFile(name);
            }}
            onOpenLiveArtifact={(tabId) => openFile(tabId)}
            onRenameFile={handleRename}
            onDeleteFile={(name) => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'delete',
              });
              void handleDelete(name);
            }}
            onDeleteFiles={(names) => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'delete',
              });
              return handleDeleteMany(names);
            }}
            onUpload={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'upload',
              });
              fileInputRef.current?.click();
            }}
            onUploadFiles={(picked) => void uploadFiles(picked)}
            onPaste={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'paste',
              });
              void createMarkdownDocument();
            }}
            onNewSketch={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'new_sketch',
              });
              void startNewSketch();
            }}
            onOpenBrowser={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'new_browser',
              });
              openBrowserTab();
            }}
            onCreateDesignSystem={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'create_design_system',
              });
              setPendingDesignSystemCreateEntry('project_canvas');
              navigate({ kind: 'design-system-create' });
            }}
            onCreateDesignSystemFromProject={onCreateDesignSystemFromProject}
            createDesignSystemFromProjectBusy={createDesignSystemFromProjectBusy}
            onDuplicateProject={onDuplicateProject}
            duplicateProjectBusy={duplicateProjectBusy}
            onSelectFromLibrary={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'library',
              });
              setShowLibraryPicker(true);
            }}
            uploadError={uploadError}
            onClearUploadError={() => setUploadError(null)}
            preferredPreviewFile={preferredPreviewFile}
            autoPreviewDesignArtifacts={autoPreviewDesignArtifacts}
            onPluginFolderAgentAction={onPluginFolderAgentAction}
            activePluginActionPaths={activePluginActionPaths}
            hiddenPluginActionPaths={hiddenPluginActionPaths}
          />
        ) : isBrowserTabId(activeTab) ? (
          null
        ) : isActiveSketch && activeFile ? (
          activeSketch?.loaded ? (
            <SketchEditor
              fileName={activeFile.name}
              scene={activeSketch.scene}
              legacyItems={activeSketch.items}
              hasPreservedRawItems={
                !activeSketch.discardRawItemsOnSave && activeSketch.rawItems.length > activeSketch.items.length
              }
              onSceneChange={(scene, options) => setSketchScene(activeFile.name, scene, options)}
              onClear={() => clearSketch(activeFile.name)}
              onSave={async (scene) => {
                // Fires only on the explicit "Save" button — background
                // autosave calls saveSketch() directly and is not tracked.
                const result = await saveSketch(activeFile.name, scene);
                trackSketchSaveResult(analytics.track, {
                  page_name: 'file_manager',
                  area: 'sketch_editor',
                  result: result === false ? 'failed' : 'success',
                  project_id: projectId,
                });
                return result;
              }}
              onExportImage={async (base64, fileName) => {
                const result = await exportSketchImage(activeFile.name, base64, fileName);
                trackSketchExportResult(analytics.track, {
                  page_name: 'file_manager',
                  area: 'sketch_editor',
                  result: result === false ? 'failed' : 'success',
                  project_id: projectId,
                });
                return result;
              }}
              onOpenExportedImage={openFile}
              saving={activeSketch.saving}
              dirty={activeSketch.dirty || !activeSketch.persisted}
              savedAt={activeSketch.savedAt}
            />
          ) : (
            <div className="viewer-empty">{t('workspace.loadingSketch')}</div>
          )
        ) : isSideChatTabId(activeTab) && chatConfig && chatAgentsById ? (
          <SideChatTab
            key={`${projectId}:${activeTab}`}
            projectId={projectId}
            conversationId={conversationIdFromSideChatTabId(activeTab)}
            config={chatConfig}
            agentsById={chatAgentsById}
            locale={chatLocale ?? 'en'}
            projectFiles={visibleFiles}
            conversations={conversations}
            onSelectConversation={onSelectConversation ?? (() => {})}
            onDeleteConversation={onDeleteConversation ?? (() => {})}
            onRenameConversation={onRenameConversation}
            onSessionModeChange={onConversationSessionModeChange}
            onNewConversation={onNewConversation}
            activeConversationChat={activeConversationChat}
            onRequestOpenFile={openFile}
          />
        ) : isTerminalTabId(activeTab) ? (
          <TerminalViewer
            key={activeTab}
            projectId={projectId}
            terminalId={terminalIdFromTabId(activeTab)}
            onClose={() => closeTab(activeTab)}
            onSessionIdChange={handleTerminalSessionChange}
          />
        ) : activeLiveArtifact ? (
          <LiveArtifactViewer
            projectId={projectId}
            liveArtifact={activeLiveArtifact}
            liveArtifactEvents={liveArtifactEvents}
            onRefreshArtifacts={onRefreshFiles}
          />
        ) : activeFile ? (
          <FileViewer
            projectId={projectId}
            projectKind={projectKind}
            file={activeFile}
            filesRefreshKey={filesRefreshKey}
            isDeck={isDeck}
            streaming={streaming}
            commentQueueOnSend={commentQueueOnSend}
            commentSendDisabled={commentSendDisabled}
            previewComments={previewComments.filter((comment) => comment.filePath === activeFile.name)}
            onSavePreviewComment={onSavePreviewComment}
            onRemovePreviewComment={onRemovePreviewComment}
            onSendBoardCommentAttachments={onSendBoardCommentAttachments}
            onBrandExtractionStopRequest={
              activeFile.name === 'brand.html' ? onBrandExtractionStopRequest : undefined
            }
            onFileSaved={onRefreshFiles}
            onOpenFileReplacing={openFileReplacing}
            commentPortalId={commentPortalId}
            onCommentModeChange={onCommentModeChange}
            shareRequest={
              shareRequest && shareRequest.name === activeFile.name
                ? { nonce: shareRequest.nonce }
                : null
            }
            downloadRequest={
              downloadRequest && downloadRequest.name === activeFile.name
                ? { nonce: downloadRequest.nonce }
                : null
            }
            slideNavRequest={deliverableSlideNavForActiveFile(
              slideNavRequest,
              activeFile.name,
              slideNavDeliverableNonce,
            )}
          />
        ) : (
          <div className="viewer-empty">
            {t('workspace.openFromDesignFiles')}{' '}
            <a
              className="link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(DESIGN_FILES_TAB);
              }}
            >
              {t('workspace.designFilesLink')}
            </a>
            .
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        data-testid="design-files-upload-input"
        style={{ display: 'none' }}
        onChange={handleFilePicked}
      />
      <AnimatePresence>
        {showLibraryPicker ? (
          <LibraryPicker
            onClose={() => setShowLibraryPicker(false)}
            onConfirm={handleLibraryPickerConfirm}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {quickSwitcherOpen ? (
          <QuickSwitcher
            projectId={projectId}
            files={visibleFiles}
            workspaceContexts={workspaceContexts}
            onOpenFile={(name) => {
              openFile(name);
              setQuickSwitcherOpen(false);
            }}
            onOpenTab={(tabId) => {
              focusWorkspaceTab(tabId);
              setQuickSwitcherOpen(false);
            }}
            onClose={() => setQuickSwitcherOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}


