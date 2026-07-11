import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { Button } from '@open-design/components';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackFileManagerClick,
  trackFileUploadResult,
  trackPageView,
  trackTabLauncherClick,
  trackSketchSaveResult,
  trackSketchExportResult,
} from '../analytics/events';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { useT } from '../i18n';
import { isMacPlatform } from '../utils/platform';
import {
  deleteProjectFile,
  fetchProjectFileText,
  fetchProjectFolders,
  applyLibraryAsset,
  createProjectFolder,
  deleteProjectFolder,
  renameProjectFile,
  type UploadProjectFilesResult,
  uploadProjectFiles,
  writeProjectBase64File,
  writeProjectTextFile,
} from '../providers/registry';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
import { navigate } from '../router';
import { deliverableSlideNavForActiveFile, isSlideNavDeliverableNow } from '../runtime/slide-nav';
import { type DesignKitEditFocusRequest } from './DesignKitView';
import { DesignSystemProjectPanel } from './DesignSystemProjectPanel';
import {
  type AgentEvent,
  type AgentInfo,
  type AppConfig,
  type ChatAttachment,
  type ChatCommentAttachment,
  type Conversation,
  conversationIdFromSideChatTabId,
  isSideChatTabId,
  isTerminalTabId,
  terminalIdFromTabId,
  liveArtifactSummaryToWorkspaceEntry,
  type LiveArtifactSummary,
  type LiveArtifactEventItem,
  type LiveArtifactWorkspaceEntry,
  type OpenTabsState,
  type ProjectBrowserWorkspaceTab,
  type PreviewComment,
  type PreviewCommentTarget,
  type DesignSystemSummary,
  type ProjectMetadata,
  type ProjectFile,
  type ProjectFolder,
} from '../types';
import type { ChatSessionMode, WorkspaceContextItem } from '@open-design/contracts';
import { createTerminal, killTerminal } from '../state/projects';
import type { QuestionForm } from '../artifacts/question-form';
import { DesignFilesPanel, type DesignFilesNavState } from './DesignFilesPanel';
import {
  DesignBrowserPanel,
  labelFromUrl,
  normalizeBrowserAddress,
  type BrowserPageSnapshotToastEvent,
  type BrowserPageInfo,
} from './DesignBrowserPanel';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { APP_CHROME_FILE_ACTIONS_ID } from './AppChromeHeader';
import { FileViewer, LiveArtifactViewer } from './FileViewer';
import { Icon, type IconName } from './Icon';
import { Toast } from './Toast';
import { TabLauncherMenu } from './workspace/TabLauncherMenu';
import { buildLauncherActions, type LauncherContext } from './workspace/tab-launcher';
import { SideChatTab, type ActiveConversationChatState } from './workspace/SideChatTab';
import { TerminalViewer } from './workspace/TerminalViewer';
import { LibraryPicker } from './LibraryPicker';
import { QuestionsPanel } from './QuestionsPanel';
import { QuickSwitcher } from './QuickSwitcher';
import { SketchEditor } from './SketchEditor';
import { SketchEnginePrewarm } from './SketchEnginePrewarm';
import {
  emptySketchScene,
  isSketchJsonFileName,
  parseSketchWorkspaceDocument,
  serializeExcalidrawSketchScene,
  type ExcalidrawSketchScene,
  type SketchItem,
} from './sketch-model';
import { AnimatePresence } from 'motion/react';
import type { ChatMessage } from '../types';
import {
  arraysEqual,
  browserTabIndex,
  browserTabsFromState,
  BROWSER_TAB_PREFIX,
  colorHexFromBrandJson,
  colorHexFromDesignMd,
  DESIGN_FILES_TAB,
  DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS,
  DESIGN_SYSTEM_GUIDANCE_FILES,
  DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS,
  DESIGN_SYSTEM_TAB,
  designSystemBasename,
  designSystemFallbackReviewSections,
  designSystemFileOpBelongsToSection,
  designSystemGuidanceSort,
  designSystemHasSourceContext,
  designSystemManifestCardError,
  designSystemPathMatchesSection,
  designSystemRelatedFilesForCategory,
  designSystemReviewArtifactSort,
  designSystemReviewCategoryRank,
  designSystemReviewSubtitle,
  designSystemReviewTitleFromPath,
  designSystemSectionActivityLabel,
  designSystemSectionPhaseLabel,
  designSystemSectionTodo,
  designSystemTodoActivityPhase,
  designSystemTodoBelongsToSection,
  designSystemTodoRank,
  designSystemTodoSearchText,
  documentTemplateScenarioKey,
  formatWorkspaceSnapshotElapsed,
  inferDesignSystemReviewCategory,
  initialMarkdownDocument,
  isBrowserTabId,
  isDesignSystemAssetFile,
  isDesignSystemEvidenceFile,
  isDesignSystemGuidanceFile,
  isDesignSystemPreviewFile,
  isDesignSystemRawAssetFile,
  isDesignSystemReviewArtifactFile,
  isDesignSystemReviewableAssetArtifact,
  isDesignSystemTokenFile,
  isDesignSystemUiKitEntryPage,
  isDesignSystemUiKitFile,
  isLiveArtifactImplementationPath,
  isSketchName,
  joinProjectFilePath,
  lastWorkspaceTabId,
  maxBrowserTabSequence,
  nextMarkdownDocumentPath,
  normalizeProjectFilePath,
  optionalDesignSystemManifestString,
  orderWorkspaceTabs,
  parentDirForProjectFile,
  preferPreviewArtifactsOverRawAssets,
  reanchorBrowserTabsToCurrentOrder,
  sameFileName,
  scrollWorkspaceTabsWithWheel,
  Tab,
  tabDropEdgeFromEvent,
  truncateDesignSystemActivityText,
  type BrowserWorkspaceTab,
  type DesignSystemReviewAgentTask,
  type DesignSystemReviewDecision,
  type DesignSystemReviewDetails,
  type DesignSystemReviewEntry,
  type TabDropEdge,
  type TranslateFn,
  type WorkspaceOrderedTab,
} from '../features/file-workspace';
// Re-exported so `./FileWorkspace` stays a stable import path for the
// existing test suite now that this helper lives in the slice.
export { scrollWorkspaceTabsWithWheel };

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

interface SketchState {
  version: number;
  rawItems: unknown[];
  discardRawItemsOnSave: boolean;
  items: SketchItem[];
  scene: ExcalidrawSketchScene;
  sourceKey?: string;
  dirty: boolean;
  persisted: boolean;
  loaded: boolean;
  saving: boolean;
  savedAt?: number;
}

function defaultSketchState(name: string, scene: ExcalidrawSketchScene = emptySketchScene(name)): SketchState {
  return {
    version: 2,
    rawItems: [],
    discardRawItemsOnSave: false,
    items: [],
    scene,
    dirty: false,
    persisted: false,
    loaded: true,
    saving: false,
  };
}

function loadedSketchStateFromDocument(
  doc: ReturnType<typeof parseSketchWorkspaceDocument>,
  sourceKey: string,
): SketchState {
  return {
    version: doc.version,
    rawItems: doc.rawItems,
    discardRawItemsOnSave: false,
    items: doc.items,
    scene: doc.scene,
    sourceKey,
    dirty: false,
    persisted: true,
    loaded: true,
    saving: false,
  };
}

function sketchFileSourceKey(projectId: string, file: Pick<ProjectFile, 'name' | 'path' | 'size' | 'mtime'>): string {
  return `${projectId}:${file.path ?? file.name}:${file.size}:${file.mtime}`;
}

function shouldKeepCurrentSketchState(
  current: SketchState | undefined,
  name: string,
  sourceKey: string,
  saveInFlight: Set<string>,
): boolean {
  if (!current) return false;
  if (!current.persisted) return true;
  if (current.dirty || current.saving || saveInFlight.has(name)) return true;
  return current.loaded && current.sourceKey === sourceKey;
}

// Re-exported so `./FileWorkspace` stays a stable import path for external
// consumers (e.g. `ProjectView.tsx`) now that these live in the slice.
export { DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB };
const QUESTIONS_TAB = '__questions__';
// Keep at most this many embedded-browser `<webview>`s mounted at once. Each is
// a full out-of-process Chromium guest (timers, JS, network, a GPU surface), so
// mounting every open browser tab made memory/CPU grow linearly with tab count.
// We keep an LRU of the most-recently-activated browser tabs live and unmount
// the rest; switching back to an evicted tab remounts (reloads) it.
const BROWSER_KEEPALIVE_CAP = 3;
const QUICK_SWITCHER_DOCUMENT_CLASS = 'od-quick-switcher-open';
const SKETCH_AUTOSAVE_DELAY_MS = 800;

// Stable empty folder list so the render-phase project-switch reset is
// idempotent (passing a fresh `[]` each render would re-trigger the reset).
const EMPTY_PROJECT_FOLDERS: ProjectFolder[] = [];
export interface BrowserOpenRequest {
  tabId?: string;
  url: string;
  nonce: number;
  /** Request a transient in-tab affordance after opening/focusing. */
  attentionAction?: 'download-page';
  /** Only foreground an EXISTING browser tab — do not navigate it. Used to wake
   *  a background-throttled webview before reading its DOM (brand browser
   *  assist) WITHOUT reloading the page and re-triggering an anti-bot wall. */
  focusOnly?: boolean;
}
export interface BrowserAttentionRequest {
  action: 'download-page';
  nonce: number;
}
interface SaveSketchOptions {
  activate?: boolean;
  refreshFiles?: boolean;
  showSaving?: boolean;
}

interface PendingSketchSave {
  scene: ExcalidrawSketchScene;
  revision: number;
  options: SaveSketchOptions;
  resolvers: Array<(value: boolean | undefined) => void>;
}

interface QueuedSketchAutosave {
  scene: ExcalidrawSketchScene;
  revision: number;
  options: SaveSketchOptions;
}

function mergeSketchSaveOptions(a: SaveSketchOptions, b: SaveSketchOptions): SaveSketchOptions {
  return {
    activate: a.activate !== false || b.activate !== false,
    refreshFiles: a.refreshFiles !== false || b.refreshFiles !== false,
    showSaving: a.showSaving !== false || b.showSaving !== false,
  };
}

function consumeFileWorkspaceTabShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function formatBrowserTabUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!path || path === '/') return host || url;
    return `${host}${path}`;
  } catch {
    return url;
  }
}

function joinDisplayPath(root: string, child: string): string {
  const cleanRoot = root.replace(/[\\/]+$/u, '');
  const cleanChild = child.replace(/^[\\/]+/u, '');
  return cleanChild ? `${cleanRoot}/${cleanChild}` : cleanRoot;
}

function createDefaultDesignFilesNavState(): DesignFilesNavState {
  return {
    kindFilter: new Set(),
    currentDir: '',
    page: 0,
    pageSize: 30,
  };
}


type WorkspaceToastTone = 'default' | 'success' | 'error' | 'loading';

interface WorkspaceActionToast {
  actionLabel?: string | null;
  className?: string;
  details?: string | null;
  message: string;
  onAction?: () => void;
  role?: 'status' | 'alert';
  tone?: WorkspaceToastTone;
  ttlMs?: number;
}

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

  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The folder the Design Files panel is currently viewing (synced via
  // onCurrentDirChange). New files — uploads, pastes, sketches, dropped files —
  // are created under this folder instead of the project root.
  const [uploadDir, setUploadDir] = useState<string>('');
  const [sketches, setSketches] = useState<Record<string, SketchState>>({});
  const sketchesRef = useRef<Record<string, SketchState>>({});
  sketchesRef.current = sketches;
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;
  const sketchAutosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sketchAutosaveDraftsRef = useRef<Map<string, QueuedSketchAutosave>>(new Map());
  const sketchSceneRevisionRef = useRef<Map<string, number>>(new Map());
  const sketchSaveInFlightRef = useRef<Set<string>>(new Set());
  const pendingSketchSavesRef = useRef<Map<string, PendingSketchSave>>(new Map());
  const flushPendingSketchAutosavesRef = useRef<() => void>(() => {});
  const sketchPreloadInFlightRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>(EMPTY_PROJECT_FOLDERS);
  // Reset the folder list during render — NOT in an effect — when the project
  // changes. DesignFilesPanel is keyed by `projectId`, so an effect-based reset
  // would let the new panel mount once with the previous project's folders and
  // briefly suppress the new project's empty state (the exact regression this
  // fix removes). Adjusting state during render discards this render before the
  // child commits, so the new panel never sees stale folders. Mirrors the
  // designFilesNav ref reset above. The stable empty constant keeps this
  // idempotent (no re-entrant render loop).
  const projectFoldersProjectIdRef = useRef(projectId);
  if (projectFoldersProjectIdRef.current !== projectId) {
    projectFoldersProjectIdRef.current = projectId;
    setProjectFolders(EMPTY_PROJECT_FOLDERS);
  }
  const [browserTabs, setBrowserTabs] = useState<BrowserWorkspaceTab[]>(
    () => browserTabsFromState(tabsState.browserTabs),
  );
  const [browserNavigateRequests, setBrowserNavigateRequests] = useState<
    Record<string, { url: string; nonce: number }>
  >({});
  const [browserAttentionRequests, setBrowserAttentionRequests] = useState<
    Record<string, BrowserAttentionRequest>
  >({});
  // "+" launcher (file search + registry-driven create-new actions:
  // Side Chat, Terminal, Browser).
  const [launcherOpen, setLauncherOpen] = useState(false);
  // Transient feedback when a launcher "create" action (e.g. New Terminal)
  // fails on the daemon side, so the click is never a silent no-op.
  const [launcherToast, setLauncherToast] = useState<string | null>(null);
  const [browserSnapshotToast, setBrowserSnapshotToast] = useState<WorkspaceActionToast | null>(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [draggedTabName, setDraggedTabName] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<{
    name: string;
    edge: TabDropEdge;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const launcherBtnRef = useRef<HTMLButtonElement | null>(null);
  const tabsBarRef = useRef<HTMLDivElement | null>(null);
  const draggedTabNameRef = useRef<string | null>(null);
  const browserTabSequenceRef = useRef(0);
  const openFileRef = useRef<(name: string) => void>(() => {});
  const designFilesNavProjectIdRef = useRef(projectId);
  const designFilesNavRef = useRef<DesignFilesNavState>(createDefaultDesignFilesNavState());
  if (designFilesNavProjectIdRef.current !== projectId) {
    designFilesNavProjectIdRef.current = projectId;
    designFilesNavRef.current = createDefaultDesignFilesNavState();
  }
  const onDesignFilesNavStateChange = useCallback((state: DesignFilesNavState) => {
    designFilesNavRef.current = state;
  }, []);

  // Maps a terminal tab's original session id (the `terminal:<id>` suffix) to
  // the PTY session it is CURRENTLY bound to. Restart rebinds the surface to a
  // fresh session while the tab id stays constant, and the surface is unmounted
  // whenever its tab isn't active — so this ref (which survives the child's
  // unmount) is the only place that knows which PTY to kill on an explicit
  // Close. `<TerminalViewer onSessionIdChange>` keeps it current.
  const terminalLiveSessionsRef = useRef<Map<string, string>>(new Map());
  const handleTerminalSessionChange = useCallback(
    (originalId: string, sessionId: string) => {
      terminalLiveSessionsRef.current.set(originalId, sessionId);
    },
    [],
  );

  // LRU of browser tab ids whose `<webview>` is currently mounted (most-recent
  // first). A browser tab is mounted only after it has been activated; we cap
  // the live set at BROWSER_KEEPALIVE_CAP and unmount the rest.
  const [liveBrowserTabIds, setLiveBrowserTabIds] = useState<string[]>([]);

  // The set actually rendered. The activation LRU governs ad-hoc browser tabs,
  // but a pinned brand-extraction tab must stay mounted even when it was never
  // activated this session (a refresh can remount the workspace with brand.html
  // active and the LRU empty). Keeping its <webview> alive is what lets the chat
  // "Continue extraction" handler read the live, post-wall DOM instead of
  // silently degrading to a re-walled server fetch.
  const mountedBrowserTabIds = useMemo(() => {
    const ids = new Set(liveBrowserTabIds);
    if (pinnedBrowserTabId && browserTabs.some((tab) => tab.id === pinnedBrowserTabId)) {
      ids.add(pinnedBrowserTabId);
    }
    return ids;
  }, [liveBrowserTabIds, pinnedBrowserTabId, browserTabs]);

  const visibleFiles = useMemo(
    () => files.filter((file) => !isLiveArtifactImplementationPath(file.name)),
    [files],
  );

  const sketchFiles = useMemo(
    () => visibleFiles.filter((file) => isSketchName(file.name)),
    [visibleFiles],
  );

  const loadSketchFile = useCallback((file: ProjectFile): Promise<boolean> => {
    const sourceKey = sketchFileSourceKey(projectId, file);
    const startedRevision = sketchSceneRevisionRef.current.get(file.name) ?? 0;
    const current = sketchesRef.current[file.name];
    if (shouldKeepCurrentSketchState(current, file.name, sourceKey, sketchSaveInFlightRef.current)) {
      return Promise.resolve(true);
    }
    const existing = sketchPreloadInFlightRef.current.get(sourceKey);
    if (existing) return existing;

    const inFlight = { promise: null as Promise<boolean> | null };
    const promise = (async () => {
      try {
        const text = await fetchProjectFileText(projectId, file.name);
        const doc = parseSketchWorkspaceDocument(text);
        if (activeProjectIdRef.current !== projectId) return false;
        setSketches((curr) => {
          const activeRevision = sketchSceneRevisionRef.current.get(file.name) ?? 0;
          if (activeRevision !== startedRevision) return curr;
          const existingState = curr[file.name];
          if (shouldKeepCurrentSketchState(existingState, file.name, sourceKey, sketchSaveInFlightRef.current)) {
            return curr;
          }
          sketchSceneRevisionRef.current.set(file.name, 0);
          return {
            ...curr,
            [file.name]: loadedSketchStateFromDocument(doc, sourceKey),
          };
        });
        return true;
      } catch (err) {
        console.warn('[FileWorkspace] sketch load failed', file.name, err);
        return false;
      } finally {
        if (sketchPreloadInFlightRef.current.get(sourceKey) === inFlight.promise) {
          sketchPreloadInFlightRef.current.delete(sourceKey);
        }
      }
    })();
    inFlight.promise = promise;
    sketchPreloadInFlightRef.current.set(sourceKey, promise);
    return promise;
  }, [projectId]);

  const liveArtifactEntries = useMemo(
    () => liveArtifacts.map(liveArtifactSummaryToWorkspaceEntry),
    [liveArtifacts],
  );

  const refreshProjectFolders = useCallback(async (): Promise<ProjectFolder[]> => {
    const next = await fetchProjectFolders(projectId);
    setProjectFolders(next);
    return next;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    // The synchronous clear happens during render (see projectFoldersProjectIdRef
    // above); here we only fetch the new project's folders.
    void fetchProjectFolders(projectId).then((next) => {
      if (!cancelled) setProjectFolders(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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

  useEffect(() => {
    setBrowserTabs([]);
    setBrowserNavigateRequests({});
    browserTabSequenceRef.current = 0;
    setLauncherOpen(false);
    sketchPreloadInFlightRef.current.clear();
  }, [projectId]);

  useEffect(() => {
    return () => {
      flushPendingSketchAutosavesRef.current();
      sketchSceneRevisionRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const flush = () => flushPendingSketchAutosavesRef.current();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const file of sketchFiles) {
        if (cancelled) return;
        await loadSketchFile(file);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSketchFile, sketchFiles]);

  useEffect(() => {
    const nextBrowserTabs = browserTabsFromState(tabsState.browserTabs);
    setBrowserTabs(nextBrowserTabs);
    browserTabSequenceRef.current = maxBrowserTabSequence(nextBrowserTabs);
  }, [tabsState.browserTabs]);

  function workspaceTabsState(
    tabs: string[],
    active: string | null,
    nextBrowserTabs = browserTabs,
  ): OpenTabsState {
    const state: OpenTabsState = { tabs, active };
    if (nextBrowserTabs.length > 0) state.browserTabs = nextBrowserTabs;
    return state;
  }

  // Single entry point for committing tab state: mirror it into the ref so
  // async launcher actions read the freshest tabs, then notify the parent.
  function commitTabsState(next: OpenTabsState) {
    tabsStateRef.current = next;
    onTabsStateChange(next);
  }

  function setPersistedActive(name: string | null) {
    const nextActive = name ?? defaultRootTab;
    setActiveTab(nextActive);
    commitTabsState(workspaceTabsState(persistedTabs, name));
  }

  function openRequestedBrowserTab(request: BrowserOpenRequest) {
    const requestedTabId = request.tabId?.trim();
    const normalizedUrl = normalizeBrowserAddress(request.url);
    const tabId =
      requestedTabId && isBrowserTabId(requestedTabId)
        ? requestedTabId
        : `${BROWSER_TAB_PREFIX}${browserTabSequenceRef.current + 1}`;
    const requestedIndex = browserTabIndex(tabId);
    if (requestedIndex > 0) {
      browserTabSequenceRef.current = Math.max(browserTabSequenceRef.current, requestedIndex);
    }
    // Focus-only: the tab already exists and is parked on the (cleared) page —
    // just foreground it so its webview un-throttles, without issuing a navigate
    // request that would reload and re-trigger the anti-bot wall.
    if (request.focusOnly && browserTabs.some((tab) => tab.id === tabId)) {
      setUploadError(null);
      setActiveTab(tabId);
      const attentionAction = request.attentionAction;
      if (attentionAction) {
        setBrowserAttentionRequests((current) => ({
          ...current,
          [tabId]: { action: attentionAction, nonce: request.nonce },
        }));
      }
      commitTabsState(workspaceTabsState(persistedTabs, tabId, browserTabs));
      return;
    }
    const browserTitle = normalizedUrl && normalizedUrl !== 'about:blank'
      ? labelFromUrl(normalizedUrl)
      : undefined;
    let found = false;
    const nextTabs = browserTabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      found = true;
      return {
        ...tab,
        ...(browserTitle ? { title: browserTitle, url: normalizedUrl } : {}),
      };
    });
    if (!found) {
      const anchor = lastWorkspaceTabId(orderedWorkspaceTabs) ?? activeTab;
      const label = requestedIndex > 1 ? `Browser ${requestedIndex}` : 'Browser';
      nextTabs.push({
        id: tabId,
        insertAfter: anchor,
        label,
        ...(browserTitle ? { title: browserTitle, url: normalizedUrl } : {}),
      });
    }
    setUploadError(null);
    setBrowserTabs(nextTabs);
    setBrowserNavigateRequests((current) => ({
      ...current,
      [tabId]: { url: normalizedUrl, nonce: request.nonce },
    }));
    const attentionAction = request.attentionAction;
    if (attentionAction) {
      setBrowserAttentionRequests((current) => ({
        ...current,
        [tabId]: { action: attentionAction, nonce: request.nonce },
      }));
    }
    setActiveTab(tabId);
    commitTabsState(workspaceTabsState(persistedTabs, tabId, nextTabs));
  }

  function openBrowserTab() {
    setUploadError(null);
    const nextIndex = browserTabSequenceRef.current + 1;
    browserTabSequenceRef.current = nextIndex;
    const anchor = lastWorkspaceTabId(orderedWorkspaceTabs) ?? activeTab;
    const nextTab: BrowserWorkspaceTab = {
      id: `${BROWSER_TAB_PREFIX}${nextIndex}`,
      insertAfter: anchor,
      label: nextIndex === 1 ? 'Browser' : `Browser ${nextIndex}`,
    };
    const nextTabs = [...browserTabs, nextTab];
    setBrowserTabs(nextTabs);
    setActiveTab(nextTab.id);
    commitTabsState(workspaceTabsState(persistedTabs, nextTab.id, nextTabs));
  }

  function closeBrowserTab(tabId: string) {
    const closingIndex = browserTabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = browserTabs.filter((tab) => tab.id !== tabId);
    setBrowserTabs(nextTabs);
    const nextActive =
      activeTab === tabId
        ? nextTabs[Math.min(Math.max(closingIndex, 0), nextTabs.length - 1)]?.id ?? DESIGN_FILES_TAB
        : tabsState.active === tabId
          ? DESIGN_FILES_TAB
          : tabsState.active;
    if (activeTab === tabId) {
      setActiveTab(nextActive ?? DESIGN_FILES_TAB);
    }
    onTabsStateChange(workspaceTabsState(persistedTabs, nextActive, nextTabs));
  }

  const updateBrowserTabInfo = useCallback((tabId: string, info: BrowserPageInfo) => {
    const nextUrl = info.url.trim();
    const nextIconUrl = info.iconUrl?.trim() ?? '';
    let changed = false;
    const nextTabs = browserTabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const nextTitle = nextUrl
        ? info.title.trim() || labelFromUrl(nextUrl)
        : tab.label;
      const normalizedUrl = nextUrl === 'about:blank' ? '' : nextUrl;
      if (
        tab.title === nextTitle
        && (tab.url ?? '') === normalizedUrl
        && (tab.iconUrl ?? '') === nextIconUrl
      ) {
        return tab;
      }
      changed = true;
      const nextTab: BrowserWorkspaceTab = {
        ...tab,
        title: nextTitle,
        url: normalizedUrl,
      };
      if (nextIconUrl) {
        nextTab.iconUrl = nextIconUrl;
      } else {
        delete nextTab.iconUrl;
      }
      return nextTab;
    });
    if (!changed) return;
    setBrowserTabs(nextTabs);
    onTabsStateChange(workspaceTabsState(persistedTabs, activeTab, nextTabs));
  }, [activeTab, browserTabs, onTabsStateChange, persistedTabs]);

  function activatePending(name: string) {
    // Pending sketches are not in tabsState.tabs — flip the local
    // activeTab without round-tripping through the parent.
    setActiveTab(name);
  }

  // Promote the active browser tab to the front of the keep-alive LRU (and cap
  // it). Activating a browser tab is the only thing that mounts its webview.
  useEffect(() => {
    if (!isBrowserTabId(activeTab)) return;
    setLiveBrowserTabIds((prev) => {
      if (prev[0] === activeTab) return prev;
      return [activeTab, ...prev.filter((id) => id !== activeTab)].slice(0, BROWSER_KEEPALIVE_CAP);
    });
  }, [activeTab]);

  // Drop closed browser tabs from the live set so their webview unmounts.
  useEffect(() => {
    setLiveBrowserTabIds((prev) => {
      const existing = new Set(browserTabs.map((tab) => tab.id));
      const next = prev.filter((id) => existing.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [browserTabs]);

  // When the persisted tab list changes and the active tab is gone, fall
  // back to the last remaining tab. Skip transient activeTab values
  // (DESIGN_FILES_TAB, pending sketches) since those aren't in persistedTabs.
  useEffect(() => {
    if (
      activeTab === DESIGN_FILES_TAB
      || activeTab === DESIGN_SYSTEM_TAB
      || activeTab === QUESTIONS_TAB
    ) return;
    if (isBrowserTabId(activeTab)) {
      if (!browserTabs.some((tab) => tab.id === activeTab)) {
        setActiveTab(DESIGN_FILES_TAB);
      }
      return;
    }
    if (sketches[activeTab] && !sketches[activeTab]!.persisted) return;
    if (!persistedTabs.includes(activeTab)) {
      setPersistedActive(persistedTabs[persistedTabs.length - 1] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedTabs, activeTab]);

  useEffect(() => {
    if (!designSystemEditRequest) return;
    setUploadError(null);
    setPersistedActive(designSystemProject ? DESIGN_SYSTEM_TAB : DESIGN_FILES_TAB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designSystemEditRequest?.nonce]);

  // External open requests from chat (tool cards, produced-file chips,
  // deep-linked URL, or the parent's auto-open after an agent Write) —
  // add the file to the open-tabs set and focus it.
  useEffect(() => {
    if (!openRequest) return;
    const name = openRequest.name;
    if (!name) return;
    if (name === DESIGN_FILES_TAB || name === DESIGN_SYSTEM_TAB) {
      const nextActive =
        name === DESIGN_SYSTEM_TAB && !designSystemProject
          ? DESIGN_FILES_TAB
          : name;
      onTabsStateChange(workspaceTabsState(persistedTabs, nextActive));
      setActiveTab(nextActive);
      return;
    }
    if (isBrowserTabId(name) && browserTabs.some((tab) => tab.id === name)) {
      onTabsStateChange(workspaceTabsState(persistedTabs, name));
      setActiveTab(name);
      return;
    }
    const isNewTab = !persistedTabs.includes(name);
    const nextBrowserTabs = isNewTab
      ? reanchorBrowserTabsToCurrentOrder(orderedWorkspaceTabs, browserTabs)
      : browserTabs;
    if (nextBrowserTabs !== browserTabs) setBrowserTabs(nextBrowserTabs);
    onTabsStateChange(workspaceTabsState(
      isNewTab ? [...persistedTabs, name] : persistedTabs,
      name,
      nextBrowserTabs,
    ));
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  useEffect(() => {
    if (!browserOpenRequest) return;
    openRequestedBrowserTab(browserOpenRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserOpenRequest]);

  // Share request: ensure the target file is open + active so the FileViewer
  // below receives the matching `shareRequest` and opens its Share menu.
  useEffect(() => {
    if (!shareRequest) return;
    const name = shareRequest.name;
    if (!name) return;
    commitTabsState(workspaceTabsState(
      persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      name,
    ));
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareRequest]);

  // Download request: same as shareRequest, but the FileViewer opens its
  // Download/Export menu. Without this, Download did nothing whenever the target
  // artifact was not already the active tab (it forwards only on a name match).
  useEffect(() => {
    if (!downloadRequest) return;
    const name = downloadRequest.name;
    if (!name) return;
    commitTabsState(workspaceTabsState(
      persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      name,
    ));
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadRequest]);

  // Slide-nav request: decide deliverability once, at fire time. Only if the
  // named deck is already an open tab do we mark this nonce deliverable and
  // bring it forward so the matching FileViewer is mounted and flips. We never
  // open a closed file — auto-flipping is a follow-along, not a reason to yank
  // the user into a tab they never opened. Recording the deliverable nonce in
  // state (not a ref) also means a request for a closed deck stays undeliverable
  // forever: opening that file later matches the name but not the nonce, so the
  // stale request can't resurface and jump the preview.
  const [slideNavDeliverableNonce, setSlideNavDeliverableNonce] = useState<number | null>(null);
  useEffect(() => {
    if (!isSlideNavDeliverableNow(slideNavRequest, persistedTabs)) return;
    setSlideNavDeliverableNonce(slideNavRequest!.nonce);
    setActiveTab(slideNavRequest!.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideNavRequest]);

  // Focus the Questions tab when the parent bumps the nonce (banner click in
  // chat, or a freshly generated form). The tab is transient — not added to
  // the persisted tab list.
  useEffect(() => {
    if (!focusQuestionsRequest) return;
    setActiveTab(QUESTIONS_TAB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusQuestionsRequest?.nonce]);

  // Submitting from the right-hand panel should close the preview once. The
  // answered form remains available, so a later chat-banner click can reopen
  // the same Questions tab without this effect immediately closing it again.
  const previousQuestionFormSubmittedAnswersRef = useRef(questionFormSubmittedAnswers);
  useEffect(() => {
    const wasAnswered = previousQuestionFormSubmittedAnswersRef.current !== undefined;
    const isAnswered = questionFormSubmittedAnswers !== undefined;
    previousQuestionFormSubmittedAnswersRef.current = questionFormSubmittedAnswers;
    if (activeTab === QUESTIONS_TAB && !wasAnswered && isAnswered) {
      setActiveTab(defaultRootTab);
    }
  }, [activeTab, defaultRootTab, questionFormSubmittedAnswers]);

  // If the Questions tab is active but the form is gone because a new assistant
  // turn has no form, fall back to the default root tab.
  useEffect(() => {
    if (activeTab === QUESTIONS_TAB && !showQuestionsTab) {
      setActiveTab(defaultRootTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, showQuestionsTab]);

  function openFile(name: string) {
    setUploadError(null);
    // Read from the ref, not the `persistedTabs` prop closure: this path is
    // reached asynchronously from launcher "create" actions (after the daemon
    // resolves a new terminal/side-chat id), so the closure could be stale and
    // clobber tabs added in the meantime.
    const currentTabs = tabsStateRef.current.tabs;
    const isNewTab = !currentTabs.includes(name);
    const nextBrowserTabs = isNewTab
      ? reanchorBrowserTabsToCurrentOrder(orderedWorkspaceTabs, browserTabs)
      : browserTabs;
    const nextTabs = currentTabs.includes(name) ? currentTabs : [...currentTabs, name];
    if (nextBrowserTabs !== browserTabs) setBrowserTabs(nextBrowserTabs);
    commitTabsState(workspaceTabsState(nextTabs, name, nextBrowserTabs));
    setActiveTab(name);
  }
  openFileRef.current = openFile;

  const handleBrowserPageSnapshotToast = useCallback((event: BrowserPageSnapshotToastEvent) => {
    const details = event.elapsedSeconds == null
      ? null
      : `${t('homeHero.footer.duration')}: ${formatWorkspaceSnapshotElapsed(event.elapsedSeconds)}`;
    const tone: WorkspaceToastTone =
      event.status === 'loading'
        ? 'loading'
        : event.status === 'success'
          ? 'success'
          : event.status === 'error'
            ? 'error'
            : 'default';
    const actionLabel = event.status === 'loading'
      ? t('common.cancel')
      : event.actionLabel;
    const onAction = event.status === 'loading'
      ? event.onCancel
      : event.actionTarget === 'design-files'
        ? () => {
            setPersistedActive(DESIGN_FILES_TAB);
            setBrowserSnapshotToast(null);
          }
        : event.actionFileName
          ? () => {
              openFileRef.current(event.actionFileName!);
              setBrowserSnapshotToast(null);
            }
          : undefined;
    setBrowserSnapshotToast({
      actionLabel,
      details,
      className: 'od-toast-browser-snapshot',
      message: event.message,
      onAction,
      role: event.status === 'error' ? 'alert' : 'status',
      tone,
      ttlMs: event.ttlMs,
    });
  }, [t]);

  function focusWorkspaceTab(tabId: string) {
    setUploadError(null);
    if (tabId === DESIGN_SYSTEM_TAB) {
      setPersistedActive(designSystemProject ? DESIGN_SYSTEM_TAB : DESIGN_FILES_TAB);
      return;
    }
    if (tabId === DESIGN_FILES_TAB) {
      setPersistedActive(DESIGN_FILES_TAB);
      return;
    }
    if (isBrowserTabId(tabId)) {
      if (!browserTabs.some((tab) => tab.id === tabId)) return;
      commitTabsState(workspaceTabsState(persistedTabs, tabId, browserTabs));
      setActiveTab(tabId);
      return;
    }
    openFile(tabId);
  }

  function activateWorkspaceTab(tabId: string) {
    if (tabId === QUESTIONS_TAB) {
      setUploadError(null);
      setActiveTab(tabId);
      return;
    }
    const sketchEntry = sketches[tabId];
    if (sketchEntry && !sketchEntry.persisted) {
      setUploadError(null);
      activatePending(tabId);
      return;
    }
    focusWorkspaceTab(tabId);
  }

  function activateWorkspaceTabByOffset(offset: number) {
    if (workspaceTabIds.length === 0) return;
    const activeIndex = workspaceTabIds.indexOf(activeTab);
    const startIndex = activeIndex >= 0 ? activeIndex : 0;
    const targetIndex =
      (startIndex + offset + workspaceTabIds.length) % workspaceTabIds.length;
    activateWorkspaceTab(workspaceTabIds[targetIndex]!);
  }

  function activateWorkspaceTabByIndex(index: number) {
    if (index < 0 || index >= workspaceTabIds.length) return;
    activateWorkspaceTab(workspaceTabIds[index]!);
  }

  function openWorkspaceTabLauncher() {
    setLauncherOpen(true);
    launcherBtnRef.current?.focus();
  }

  function closeActiveWorkspaceTab() {
    if (!workspaceTabIds.includes(activeTab)) return;
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB) return;
    if (activeTab === QUESTIONS_TAB) {
      setActiveTab(defaultRootTab);
      return;
    }
    if (isBrowserTabId(activeTab)) {
      closeBrowserTab(activeTab);
      return;
    }
    closeTab(activeTab);
  }

  // Open `openName` (focusing it) and close `closeName` in a single tab-state
  // update. Used by the React module pointer (issue #2744): once the user
  // jumps to the HTML entry that renders a module, the dead-end module tab is
  // dropped. Done atomically because calling openFile() then closeTab() would
  // each read the same stale `persistedTabs` prop and the second would clobber
  // the first.
  function openFileReplacing(openName: string, closeName: string) {
    setUploadError(null);
    const withoutClosed = persistedTabs.filter((tabName) => tabName !== closeName);
    const nextTabs = withoutClosed.includes(openName)
      ? withoutClosed
      : [...withoutClosed, openName];
    onTabsStateChange(workspaceTabsState(nextTabs, openName));
    setActiveTab(openName);
  }

  function closeTab(name: string) {
    // Terminal tabs own a daemon PTY that now outlives unmount (so tab switches
    // reattach cheaply). An explicit Close is the one place we terminate it —
    // kill the LIVE session (which may differ from the tab's original id after
    // a Restart), falling back to the tab id when the surface never reported.
    if (isTerminalTabId(name)) {
      const originalId = terminalIdFromTabId(name);
      const liveId = terminalLiveSessionsRef.current.get(originalId) ?? originalId;
      void killTerminal(projectId, liveId, { keepalive: true });
      terminalLiveSessionsRef.current.delete(originalId);
    }
    const sketchEntry = sketches[name];
    const isPending = sketchEntry && !sketchEntry.persisted;
    const hasUnsavedStrokes = sketchEntry && (sketchEntry.dirty || !sketchEntry.persisted);
    if (hasUnsavedStrokes && !confirm(t('sketch.closeConfirm'))) return;
    if (isPending) {
      setSketches((curr) => {
        const next = { ...curr };
        clearSketchAutosave(name);
        sketchSceneRevisionRef.current.delete(name);
        delete next[name];
        return next;
      });
      if (activeTab === name) {
        setPersistedActive(persistedTabs[persistedTabs.length - 1] ?? null);
      }
      return;
    }
    const nextTabs = persistedTabs.filter((n) => n !== name);
    const nextActive =
      tabsState.active === name
        ? nextTabs[nextTabs.length - 1] ?? null
        : tabsState.active;
    onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
    setActiveTab(nextActive ?? DESIGN_FILES_TAB);
    setSketches((curr) => {
      const next = { ...curr };
      const entry = next[name];
      if (entry && !entry.persisted) {
        clearSketchAutosave(name);
        delete next[name];
      }
      return next;
    });
  }

  function reorderPersistedTab(
    draggedName: string,
    targetName: string,
    edge: TabDropEdge,
  ) {
    if (draggedName === targetName) return;
    if (!persistedTabs.includes(draggedName)) return;
    if (!persistedTabs.includes(targetName)) return;

    const nextTabs = persistedTabs.filter((name) => name !== draggedName);
    const targetIndex = nextTabs.indexOf(targetName);
    if (targetIndex === -1) return;
    nextTabs.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedName);
    if (arraysEqual(nextTabs, persistedTabs)) return;
    onTabsStateChange(workspaceTabsState(nextTabs, tabsState.active));
  }

  function clearTabDragState() {
    draggedTabNameRef.current = null;
    setDraggedTabName(null);
    setDragOverTab(null);
  }

  async function handleFilePicked(ev: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    await uploadFiles(picked);
  }

  async function uploadFiles(picked: File[]) {
    if (picked.length === 0) return;

    setUploadError(null);
    // Cohort math is shared across all three upload surfaces; see
    // `analytics/upload-tracking.ts` for the per-file → batch reduction.
    const cohort = deriveUploadCohort(picked);
    let result: UploadProjectFilesResult;
    try {
      result = await uploadProjectFiles(projectId, picked, uploadDir);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setUploadError(`Upload failed for ${picked.length} file(s) (${detail}).`);
      trackFileUploadResult(analytics.track, {
        page_name: 'file_manager',
        area: 'file_manager',
        project_id: projectId,
        ...cohort,
        result: 'failed',
        error_code: detail,
      });
      return;
    }
    if (result.uploaded.length > 0) {
      await onRefreshFiles();
      const lastUploaded = result.uploaded[result.uploaded.length - 1];
      if (lastUploaded?.path) openFile(lastUploaded.path);
    }

    if (result.failed.length > 0) {
      const failedCount = result.failed.length;
      const uploadedCount = result.uploaded.length;
      const detail = result.error ? ` (${result.error})` : '';
      setUploadError(
        uploadedCount > 0
          ? `Uploaded ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
          : `Upload failed for ${failedCount} file(s)${detail}.`,
      );
      console.warn('Project upload had failures', result.failed);
      trackFileUploadResult(analytics.track, {
        page_name: 'file_manager',
        area: 'file_manager',
        project_id: projectId,
        ...cohort,
        result: 'failed',
        ...(result.error ? { error_code: result.error } : {}),
      });
    } else if (result.uploaded.length > 0) {
      trackFileUploadResult(analytics.track, {
        page_name: 'file_manager',
        area: 'file_manager',
        project_id: projectId,
        ...cohort,
        result: 'success',
      });
    }
  }

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const isAllowedDropTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('.df-panel, .composer'));
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e) || isAllowedDropTarget(e.target)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || isAllowedDropTarget(e.target)) return;
      e.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      scrollWorkspaceTabsWithWheel(tabBar, event);
    };
    tabBar.addEventListener('wheel', onWheel, { passive: false });
    return () => tabBar.removeEventListener('wheel', onWheel);
  }, []);

  // Browser-style tab bar: when the active tab changes (open from a chat
  // file chip, switch via Cmd+P, etc.), scroll it into view so the user
  // can always see what they have selected even when the strip overflows.
  // The Design Files entry is already sticky-pinned, so we only scroll
  // for real workspace tabs. Issue #775.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB || activeTab === QUESTIONS_TAB) return;
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;
    const el = tabBar.querySelector<HTMLElement>('.ws-tab.active');
    if (!el) return;
    // The Design Files tab is sticky-pinned to the scrollport's left
    // edge (index.css:.ws-tab.design-files-tab), so a naive scrollIntoView
    // with inline: 'nearest' would slide a leftward-jumped active tab
    // flush with that edge and leave it hidden underneath the sticky
    // panel. Compute scrollLeft manually instead, treating the sticky
    // tab's right edge as the effective visible-left boundary.
    const tabRect = el.getBoundingClientRect();
    const barRect = tabBar.getBoundingClientRect();
    const stickyEl = tabBar.querySelector<HTMLElement>('.ws-tab.design-files-tab');
    const stickyWidth = stickyEl ? stickyEl.getBoundingClientRect().width : 0;
    const visibleLeft = barRect.left + stickyWidth;
    const visibleRight = barRect.right;
    if (tabRect.left < visibleLeft) {
      tabBar.scrollLeft += tabRect.left - visibleLeft;
    } else if (tabRect.right > visibleRight) {
      tabBar.scrollLeft += tabRect.right - visibleRight;
    }
  }, [activeTab]);

  // Browser-style shortcuts for the high-frequency Design Files workspace
  // tabs. Capture phase prevents the host browser/Electron shell from opening
  // or closing its own top-level tab before the workspace handles the command.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const key = e.key;
      const lowerKey = key.toLowerCase();
      const primaryModifier = (e.metaKey || e.ctrlKey) && !e.altKey;
      const ctrlWithoutPlatformModifiers = e.ctrlKey && !e.metaKey && !e.altKey;
      const commandOption = e.metaKey && e.altKey && !e.ctrlKey;

      if (primaryModifier && !e.shiftKey && lowerKey === 't') {
        consumeFileWorkspaceTabShortcut(e);
        openWorkspaceTabLauncher();
        return;
      }

      if (primaryModifier && !e.shiftKey && lowerKey === 'w') {
        consumeFileWorkspaceTabShortcut(e);
        closeActiveWorkspaceTab();
        return;
      }

      if (ctrlWithoutPlatformModifiers && key === 'Tab') {
        consumeFileWorkspaceTabShortcut(e);
        activateWorkspaceTabByOffset(e.shiftKey ? -1 : 1);
        return;
      }

      if (
        (ctrlWithoutPlatformModifiers && !e.shiftKey && key === 'PageDown')
        || (commandOption && !e.shiftKey && key === 'ArrowRight')
      ) {
        consumeFileWorkspaceTabShortcut(e);
        activateWorkspaceTabByOffset(1);
        return;
      }

      if (
        (ctrlWithoutPlatformModifiers && !e.shiftKey && key === 'PageUp')
        || (commandOption && !e.shiftKey && key === 'ArrowLeft')
      ) {
        consumeFileWorkspaceTabShortcut(e);
        activateWorkspaceTabByOffset(-1);
        return;
      }

      if (primaryModifier && !e.shiftKey && /^[1-9]$/u.test(key)) {
        consumeFileWorkspaceTabShortcut(e);
        const index = key === '9' ? workspaceTabIds.length - 1 : Number(key) - 1;
        activateWorkspaceTabByIndex(index);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  });

  // Cmd+P (mac) / Ctrl+P (win/linux) opens the file palette. Capture phase
  // so we beat the browser's default print dialog. Platform-gated so on
  // macOS we don't steal Ctrl+P from native readline ("previous line") in
  // text fields, and on win/linux we don't steal Cmd+P (rare but possible
  // on remapped keyboards).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        if (e.isComposing) return;
        e.preventDefault();
        setQuickSwitcherOpen((open) => !open);
      } else if (e.key === 'Escape' && quickSwitcherOpen) {
        // The palette handles Esc itself, but also catch it here for the
        // case where focus has drifted off the palette input.
        setQuickSwitcherOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [quickSwitcherOpen]);

  useEffect(() => {
    document.body.classList.toggle(QUICK_SWITCHER_DOCUMENT_CLASS, quickSwitcherOpen);
    return () => {
      document.body.classList.remove(QUICK_SWITCHER_DOCUMENT_CLASS);
    };
  }, [quickSwitcherOpen]);

  async function handleDelete(name: string) {
    if (!confirm(t('workspace.deleteFileConfirm', { name }))) return;
    const ok = await deleteProjectFile(projectId, name);
    if (ok) {
      await onRefreshFiles();
      const nextTabs = persistedTabs.filter((n) => n !== name);
      if (activeTab === name) {
        // User is viewing the file being deleted: fall back to another
        // open tab (or the Design Files panel if none remain).
        const nextActive = nextTabs[nextTabs.length - 1] ?? null;
        onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
        setActiveTab(nextActive ?? DESIGN_FILES_TAB);
      } else {
        // Deletion was triggered from the Design Files panel (or another
        // tab). We preserve `activeTab` because the user is viewing a
        // different context (Design Files or another tab) and shouldn't
        // be navigated away. Only clear the persisted active reference
        // when it points at the deleted file so we don't leave a dangling
        // pointer behind.
        const nextActive = tabsState.active === name ? null : tabsState.active;
        onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
      }
      setSketches((curr) => {
        const next = { ...curr };
        clearSketchAutosave(name);
        delete next[name];
        return next;
      });
    }
  }

  async function handleDeleteMany(names: string[]) {
    if (names.length === 0) return;
    if (!confirm(t('workspace.deleteSelectedFilesConfirm', { n: names.length }))) return;
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const name of names) {
      const ok = await deleteProjectFile(projectId, name);
      if (ok) deleted.push(name);
      else failed.push(name);
    }
    if (deleted.length > 0) {
      await onRefreshFiles();
      const deletedSet = new Set(deleted);
      const nextTabs = persistedTabs.filter((n) => !deletedSet.has(n));
      if (activeTab && deletedSet.has(activeTab)) {
        const nextActive = nextTabs[nextTabs.length - 1] ?? null;
        onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
        setActiveTab(nextActive ?? DESIGN_FILES_TAB);
      } else {
        const nextActive =
          tabsState.active && deletedSet.has(tabsState.active) ? null : tabsState.active;
        onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
      }
      setSketches((curr) => {
        const next = { ...curr };
        for (const name of deleted) {
          clearSketchAutosave(name);
          sketchSceneRevisionRef.current.delete(name);
          delete next[name];
        }
        return next;
      });
    }
    if (failed.length > 0) {
      alert(t('workspace.deleteSelectedFilesPartial', { n: failed.length }));
    }
  }

  async function handleRename(oldName: string, nextName: string): Promise<ProjectFile | null> {
    const hasPendingSketchConflict = Object.entries(sketches).some(
      ([name, sketch]) => !sketch.persisted && sameFileName(name, nextName),
    );
    if (nextName !== oldName && hasPendingSketchConflict) {
      throw new Error(
        `A pending sketch named "${nextName}" is already open. Save or close it before renaming.`,
      );
    }

    const result = await renameProjectFile(projectId, oldName, nextName);
    const renamed = result.file;
    await onRefreshFiles();
    await refreshProjectFolders();

    const nextTabs = persistedTabs.map((name) => (name === oldName ? renamed.name : name));
    const nextActive = tabsState.active === oldName ? renamed.name : tabsState.active;
    onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
    if (activeTab === oldName) setActiveTab(renamed.name);

    setSketches((curr) => {
      const entry = curr[oldName];
      if (!entry) return curr;
      const next = { ...curr };
      clearSketchAutosave(oldName);
      const revision = sketchSceneRevisionRef.current.get(oldName);
      sketchSceneRevisionRef.current.delete(oldName);
      if (revision !== undefined) sketchSceneRevisionRef.current.set(renamed.name, revision);
      delete next[oldName];
      next[renamed.name] = isSketchName(renamed.name)
        ? { ...entry, sourceKey: sketchFileSourceKey(projectId, renamed) }
        : entry;
      return next;
    });

    return renamed;
  }

  async function startNewSketch() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `sketch-${stamp}.sketch.json`;
    // Create under the folder currently being viewed, if any. The slash-joined
    // name flows through as the sketch's tab id and save path; the daemon's
    // sanitizePath turns it into a real subdirectory on save.
    const name = uploadDir ? `${uploadDir}/${base}` : base;
    const scene = emptySketchScene(name);
    sketchSceneRevisionRef.current.set(name, 0);
    setSketches((curr) => ({
      ...curr,
      [name]: {
        version: 1,
        rawItems: [],
        discardRawItemsOnSave: false,
        items: [],
        scene,
        dirty: false,
        persisted: false,
        loaded: true,
        saving: true,
      },
    }));
    activatePending(name);
    const ok = await saveSketch(name, scene, {
      activate: true,
      refreshFiles: true,
      showSaving: false,
    });
    if (ok === false) {
      setSketches((curr) => ({
        ...curr,
        [name]: {
          ...(curr[name] ?? defaultSketchState(name, scene)),
          dirty: true,
          persisted: false,
          saving: false,
        },
      }));
    }
  }

  async function createMarkdownDocument() {
    const target = nextMarkdownDocumentPath(files, uploadDir);
    const file = await writeProjectTextFile(projectId, target, initialMarkdownDocument(target, projectKind, t));
    if (!file) return;
    await onRefreshFiles();
    await refreshProjectFolders();
    openFile(file.name);
  }

  const activeSketchFile = useMemo(() => {
    if (!isSketchName(activeTab)) return null;
    return visibleFiles.find((file) => file.name === activeTab) ?? null;
  }, [activeTab, visibleFiles]);
  const activeSketchSourceKey = activeSketchFile ? sketchFileSourceKey(projectId, activeSketchFile) : null;
  const activeSketchEntry = isSketchName(activeTab) ? sketches[activeTab] : undefined;
  const activeSketchLoaded = Boolean(
    activeSketchEntry?.loaded
    && (
      !activeSketchEntry.persisted
      || (activeSketchSourceKey !== null && activeSketchEntry.sourceKey === activeSketchSourceKey)
    ),
  );

  // When the active tab is a sketch we don't have items for yet, load from
  // disk. Pending sketches start with loaded=true and skip this path.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB) return;
    if (!isSketchName(activeTab)) return;
    if (activeSketchLoaded) return;
    if (!activeSketchFile) return;
    void loadSketchFile(activeSketchFile);
  }, [activeSketchFile, activeSketchLoaded, activeTab, loadSketchFile]);

  function setSketchScene(
    name: string,
    scene: ExcalidrawSketchScene,
    options: { markDirty?: boolean; discardLegacyItems?: boolean } = {},
  ) {
    sketchSceneRevisionRef.current.set(name, (sketchSceneRevisionRef.current.get(name) ?? 0) + 1);
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          items: [],
          scene: emptySketchScene(name),
          persisted: false,
          loaded: true,
          saving: false,
        }),
        scene,
        items: options.discardLegacyItems ? [] : (curr[name]?.items ?? []),
        dirty: options.markDirty === false ? (curr[name]?.dirty ?? false) : true,
        discardRawItemsOnSave: options.discardLegacyItems ?? curr[name]?.discardRawItemsOnSave ?? false,
      } as SketchState,
    }));
    if (options.markDirty !== false) {
      queueSketchAutosave(name, scene);
    }
  }

  function clearSketch(name: string) {
    const scene = emptySketchScene(name);
    sketchSceneRevisionRef.current.set(name, (sketchSceneRevisionRef.current.get(name) ?? 0) + 1);
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          items: [],
          scene: emptySketchScene(name),
          persisted: false,
          loaded: true,
          saving: false,
        }),
        items: [],
        scene,
        dirty: true,
        discardRawItemsOnSave: true,
      } as SketchState,
    }));
    queueSketchAutosave(name, scene);
  }

  async function saveSketch(
    name: string,
    sceneOverride?: ExcalidrawSketchScene,
    options: SaveSketchOptions = {},
    revisionOverride?: number,
  ): Promise<boolean | undefined> {
    const entry = sketches[name] ?? (sceneOverride ? defaultSketchState(name, sceneOverride) : null);
    if (!entry) return;
    const scene = sceneOverride ?? entry.scene;
    const currentRevision = sketchSceneRevisionRef.current.get(name) ?? 0;
    const revision = revisionOverride ?? currentRevision;
    if (revision === currentRevision) clearSketchAutosave(name);
    if (sketchSaveInFlightRef.current.has(name)) {
      if (options.showSaving !== false) {
        setSketches((curr) => ({
          ...curr,
          [name]: {
            ...(curr[name] ?? entry),
            saving: true,
          },
        }));
      }
      return new Promise((resolve) => {
        const pending = pendingSketchSavesRef.current.get(name);
        pendingSketchSavesRef.current.set(name, {
          scene,
          revision,
          options: pending ? mergeSketchSaveOptions(pending.options, options) : options,
          resolvers: [...(pending?.resolvers ?? []), resolve],
        });
      });
    }
    return runSketchSave(name, entry, scene, options, revision);
  }

  async function runSketchSave(
    name: string,
    entry: SketchState,
    scene: ExcalidrawSketchScene,
    options: SaveSketchOptions,
    revision: number,
  ): Promise<boolean | undefined> {
    sketchSaveInFlightRef.current.add(name);
    const showSaving = options.showSaving !== false;
    if (showSaving) {
      setSketches((curr) => ({
        ...curr,
        [name]: {
          ...(curr[name] ?? entry),
          saving: true,
        },
      }));
    }
    const text = serializeExcalidrawSketchScene(scene, name);
    const startedAt = Date.now();
    let result: boolean | undefined;
    try {
      const file = await writeProjectTextFile(projectId, name, text);
      const elapsed = Date.now() - startedAt;
      // Ensures saving UI shows so the button does not flicker
      if (showSaving && elapsed < 500) await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      if (file) {
        const savedSourceKey = sketchFileSourceKey(projectId, file);
        const hasPendingSave = pendingSketchSavesRef.current.has(name);
        const savedRevisionIsCurrent = revision === (sketchSceneRevisionRef.current.get(name) ?? 0);
        const savedAt = Date.now();
        setSketches((curr) => {
          const current = curr[name] ?? entry;
          return {
            ...curr,
            [name]: hasPendingSave || !savedRevisionIsCurrent
              ? {
                ...current,
                sourceKey: savedSourceKey,
                persisted: true,
                loaded: true,
                saving: hasPendingSave,
              }
              : {
                ...current,
                version: 2,
                rawItems: [],
                items: [],
                scene,
                sourceKey: savedSourceKey,
                discardRawItemsOnSave: false,
                dirty: false,
                persisted: true,
                saving: false,
                savedAt,
              },
          };
        });
        if (!hasPendingSave) {
          // Promote the previously-pending sketch into the persisted tab list.
          const currentTabs = tabsStateRef.current.tabs;
          if (options.activate !== false || !currentTabs.includes(name)) {
            const nextTabs = currentTabs.includes(name) ? currentTabs : [...currentTabs, name];
            const nextActive = options.activate === false ? (tabsStateRef.current.active ?? null) : name;
            commitTabsState(workspaceTabsState(nextTabs, nextActive));
          }
          if (options.activate !== false) setActiveTab(name);
          if (options.refreshFiles !== false) {
            await onRefreshFiles();
            await refreshProjectFolders();
          }
        }
        result = true;
      } else {
        const hasPendingSave = pendingSketchSavesRef.current.has(name);
        setSketches((curr) => ({
          ...curr,
          [name]: {
            ...(curr[name] ?? entry),
            saving: hasPendingSave,
          },
        }));
        result = false;
      }
    } finally {
      sketchSaveInFlightRef.current.delete(name);
    }

    const pending = pendingSketchSavesRef.current.get(name);
    if (pending) {
      pendingSketchSavesRef.current.delete(name);
      const pendingResult = await saveSketch(name, pending.scene, pending.options, pending.revision);
      for (const resolve of pending.resolvers) resolve(pendingResult);
      return pendingResult;
    }

    return result;
  }

  function queueSketchAutosave(name: string, scene: ExcalidrawSketchScene) {
    clearSketchAutosave(name);
    const revision = sketchSceneRevisionRef.current.get(name) ?? 0;
    const options: SaveSketchOptions = {
      activate: false,
      refreshFiles: false,
      showSaving: false,
    };
    if (sketchSaveInFlightRef.current.has(name)) {
      const pending = pendingSketchSavesRef.current.get(name);
      pendingSketchSavesRef.current.set(name, {
        scene,
        revision,
        options: pending ? mergeSketchSaveOptions(pending.options, options) : options,
        resolvers: pending?.resolvers ?? [],
      });
      return;
    }
    sketchAutosaveDraftsRef.current.set(name, { scene, revision, options });
    const timer = setTimeout(() => {
      sketchAutosaveTimersRef.current.delete(name);
      sketchAutosaveDraftsRef.current.delete(name);
      void saveSketch(name, scene, options, revision);
    }, SKETCH_AUTOSAVE_DELAY_MS);
    sketchAutosaveTimersRef.current.set(name, timer);
  }

  function clearSketchAutosave(name: string) {
    const timer = sketchAutosaveTimersRef.current.get(name);
    if (timer) clearTimeout(timer);
    sketchAutosaveTimersRef.current.delete(name);
    sketchAutosaveDraftsRef.current.delete(name);
  }

  function flushPendingSketchAutosaves() {
    const queued = Array.from(sketchAutosaveDraftsRef.current.entries());
    if (queued.length === 0) return;
    for (const [name, draft] of queued) {
      const timer = sketchAutosaveTimersRef.current.get(name);
      if (timer) clearTimeout(timer);
      sketchAutosaveTimersRef.current.delete(name);
      sketchAutosaveDraftsRef.current.delete(name);
      void saveSketch(name, draft.scene, draft.options, draft.revision);
    }
  }
  flushPendingSketchAutosavesRef.current = flushPendingSketchAutosaves;

  async function exportSketchImage(
    sketchName: string,
    base64: string,
    imageFileName: string,
  ): Promise<{ fileName: string } | false> {
    const targetDir = parentDirForProjectFile(sketchName);
    const targetName = targetDir ? `${targetDir}/${imageFileName}` : imageFileName;
    const file = await writeProjectBase64File(projectId, targetName, base64);
    if (!file) {
      setUploadError(t('common.exportImageFailed'));
      return false;
    }
    setUploadError(null);
    await onRefreshFiles();
    await refreshProjectFolders();
    return { fileName: file.name };
  }

  const activeFile = useMemo<ProjectFile | null>(() => {
    if (
      activeTab === DESIGN_FILES_TAB
      || activeTab === DESIGN_SYSTEM_TAB
      || activeTab === QUESTIONS_TAB
      || isBrowserTabId(activeTab)
    ) return null;
    const onDisk = visibleFiles.find((f) => f.name === activeTab);
    if (onDisk) return onDisk;
    const activeSketch = sketches[activeTab];
    if (isSketchName(activeTab) && activeSketch && !activeSketch.persisted) {
      return {
        name: activeTab,
        path: activeTab,
        type: 'file',
        size: 0,
        mtime: Date.now(),
        kind: 'sketch',
        mime: 'application/json',
      };
    }
    return null;
  }, [activeTab, visibleFiles, sketches]);

  const activeLiveArtifact = useMemo<LiveArtifactWorkspaceEntry | null>(() => {
    if (
      activeTab === DESIGN_FILES_TAB
      || activeTab === DESIGN_SYSTEM_TAB
      || activeTab === QUESTIONS_TAB
      || isBrowserTabId(activeTab)
    ) return null;
    return liveArtifactEntries.find((entry) => entry.tabId === activeTab) ?? null;
  }, [activeTab, liveArtifactEntries]);

  const activeWorkspaceContext = useMemo<WorkspaceContextItem | null>(() => {
    if (activeTab === DESIGN_SYSTEM_TAB && designSystemProject) {
      return {
        id: 'workspace:design-system',
        kind: 'design-system',
        label: t('dsManager.tabDesignSystem'),
        tabId: activeTab,
      };
    }
    if (activeTab === DESIGN_FILES_TAB) {
      // Nothing to reference yet — don't auto-stage an empty "Design files" chip.
      if (designFilesTabIsEmpty) return null;
      const trimmedDir = uploadDir.trim();
      const label = trimmedDir.split('/').filter(Boolean).pop() || t('workspace.designFiles');
      return {
        id: trimmedDir ? `folder:${trimmedDir}` : 'workspace:design-files',
        kind: trimmedDir ? 'folder' : 'design-files',
        label,
        tabId: activeTab,
        ...(trimmedDir ? { path: trimmedDir } : {}),
        ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, trimmedDir) } : {}),
      };
    }
    if (isBrowserTabId(activeTab)) {
      const tab = browserTabs.find((candidate) => candidate.id === activeTab);
      if (!tab) return null;
      const url = tab.url?.trim() ?? '';
      const label = url ? tab.title?.trim() || labelFromUrl(url) : tab.label;
      return {
        id: `browser:${tab.id}`,
        kind: 'browser',
        label,
        tabId: tab.id,
        ...(tab.title ? { title: tab.title } : {}),
        ...(url ? { url } : {}),
      };
    }
    if (isTerminalTabId(activeTab)) {
      const terminalId = terminalIdFromTabId(activeTab);
      return {
        id: `terminal:${terminalId}`,
        kind: 'terminal',
        label: t('workspace.newTerminal'),
        tabId: activeTab,
      };
    }
    if (isSideChatTabId(activeTab)) {
      const conversationId = conversationIdFromSideChatTabId(activeTab);
      const conversation = conversations.find((item) => item.id === conversationId);
      return {
        id: `side-chat:${conversationId}`,
        kind: 'side-chat',
        label: conversation?.title?.trim() || t('workspace.sideChatDefaultTitle'),
        tabId: activeTab,
      };
    }
    if (activeLiveArtifact) {
      return {
        id: `live-artifact:${activeLiveArtifact.artifactId}`,
        kind: 'live-artifact',
        label: activeLiveArtifact.title,
        tabId: activeLiveArtifact.tabId,
        path: activeLiveArtifact.slug,
      };
    }
    if (activeFile) {
      const filePath = activeFile.path ?? activeFile.name;
      return {
        id: `file:${filePath}`,
        kind: 'file',
        label: filePath.split('/').filter(Boolean).pop() || filePath,
        tabId: activeTab,
        path: filePath,
        ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, filePath) } : {}),
      };
    }
    return null;
  }, [
    activeFile,
    activeLiveArtifact,
    activeTab,
    browserTabs,
    conversations,
    designFilesTabIsEmpty,
    designSystemProject,
    resolvedDir,
    t,
    uploadDir,
  ]);

  useEffect(() => {
    onActiveContextChange?.(activeWorkspaceContext);
  }, [activeWorkspaceContext, onActiveContextChange]);

  // Tabs rendered are persisted tabs plus any pending (un-saved) sketches.
  const tabNames = useMemo(() => {
    const seen = new Set(persistedTabs);
    const extras: string[] = [];
    for (const name of Object.keys(sketches)) {
      if (!sketches[name]?.persisted && !seen.has(name)) {
        extras.push(name);
        seen.add(name);
      }
    }
    return [...persistedTabs, ...extras];
  }, [persistedTabs, sketches]);

  const orderedWorkspaceTabs = useMemo(
    () => orderWorkspaceTabs(tabNames, browserTabs),
    [browserTabs, tabNames],
  );

  const workspaceTabIds = useMemo(() => {
    const ids: string[] = [];
    if (designSystemProject) ids.push(DESIGN_SYSTEM_TAB);
    ids.push(DESIGN_FILES_TAB);
    if (showQuestionsTab) ids.push(QUESTIONS_TAB);
    for (const entry of orderedWorkspaceTabs) {
      ids.push(entry.kind === 'browser' ? entry.browserTab.id : entry.name);
    }
    return ids;
  }, [designSystemProject, orderedWorkspaceTabs, showQuestionsTab]);

  const workspaceContexts = useMemo<WorkspaceContextItem[]>(() => {
    const out: WorkspaceContextItem[] = [];
    const seen = new Set<string>();
    const push = (item: WorkspaceContextItem | null | undefined) => {
      if (!item) return;
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    if (designSystemProject) {
      push({
        id: 'workspace:design-system',
        kind: 'design-system',
        label: t('dsManager.tabDesignSystem'),
        tabId: DESIGN_SYSTEM_TAB,
      });
    }

    const trimmedDir = uploadDir.trim();
    const designFilesLabel = trimmedDir.split('/').filter(Boolean).pop() || t('workspace.designFiles');
    push({
      id: trimmedDir ? `folder:${trimmedDir}` : 'workspace:design-files',
      kind: trimmedDir ? 'folder' : 'design-files',
      label: designFilesLabel,
      tabId: DESIGN_FILES_TAB,
      ...(trimmedDir ? { path: trimmedDir } : {}),
      ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, trimmedDir) } : {}),
    });

    const filesByName = new Map(visibleFiles.map((file) => [file.name, file] as const));
    const liveByTabId = new Map(liveArtifactEntries.map((entry) => [entry.tabId, entry] as const));
    const terminalTabNames = tabNames.filter(isTerminalTabId);

    for (const entry of orderedWorkspaceTabs) {
      if (entry.kind === 'browser') {
        const tab = entry.browserTab;
        const url = tab.url?.trim() ?? '';
        const label = url ? tab.title?.trim() || labelFromUrl(url) : tab.label;
        push({
          id: `browser:${tab.id}`,
          kind: 'browser',
          label,
          tabId: tab.id,
          ...(tab.title ? { title: tab.title } : {}),
          ...(url ? { url } : {}),
        });
        continue;
      }

      const name = entry.name;
      if (isTerminalTabId(name)) {
        const terminalId = terminalIdFromTabId(name);
        const ordinal = terminalTabNames.indexOf(name) + 1;
        push({
          id: `terminal:${terminalId}`,
          kind: 'terminal',
          label: ordinal > 1 ? `${t('workspace.newTerminal')} ${ordinal}` : t('workspace.newTerminal'),
          tabId: name,
        });
        continue;
      }

      if (isSideChatTabId(name)) {
        const conversationId = conversationIdFromSideChatTabId(name);
        const conversation = conversations.find((item) => item.id === conversationId);
        push({
          id: `side-chat:${conversationId}`,
          kind: 'side-chat',
          label: conversation?.title?.trim() || t('workspace.sideChatDefaultTitle'),
          tabId: name,
        });
        continue;
      }

      const liveArtifact = liveByTabId.get(name as LiveArtifactWorkspaceEntry['tabId']);
      if (liveArtifact) {
        push({
          id: `live-artifact:${liveArtifact.artifactId}`,
          kind: 'live-artifact',
          label: liveArtifact.title,
          tabId: liveArtifact.tabId,
          path: liveArtifact.slug,
        });
        continue;
      }

      const file = filesByName.get(name);
      if (file || (isSketchName(name) && sketches[name])) {
        const filePath = file?.path ?? file?.name ?? name;
        push({
          id: `file:${filePath}`,
          kind: 'file',
          label: filePath.split('/').filter(Boolean).pop() || filePath,
          tabId: name,
          path: filePath,
          ...(resolvedDir ? { absolutePath: joinDisplayPath(resolvedDir, filePath) } : {}),
        });
      }
    }

    return out;
  }, [
    browserTabs,
    conversations,
    designSystemProject,
    liveArtifactEntries,
    orderedWorkspaceTabs,
    resolvedDir,
    sketches,
    t,
    tabNames,
    uploadDir,
    visibleFiles,
  ]);

  useEffect(() => {
    onWorkspaceContextsChange?.(workspaceContexts);
  }, [onWorkspaceContextsChange, workspaceContexts]);

  useEffect(() => {
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setTabsOverflowing(tabBar.scrollWidth > tabBar.clientWidth + 1);
      // Pin the sticky Design Files tab to the exact right edge of the sticky
      // Design System tab (its real, locale-dependent width + the 2px flex gap),
      // so the two read as adjacent instead of leaving a hardcoded-offset gap.
      const systemTab = tabBar.querySelector<HTMLElement>('.ws-tab.design-system-tab');
      if (systemTab) {
        tabBar.style.setProperty('--ds-system-tab-w', `${Math.round(systemTab.offsetWidth) + 2}px`);
      } else {
        tabBar.style.removeProperty('--ds-system-tab-w');
      }
    };
    const requestMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    requestMeasure();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestMeasure);
    if (resizeObserver) {
      resizeObserver.observe(tabBar);
      Array.from(tabBar.children).forEach((child) => resizeObserver.observe(child));
    }
    window.addEventListener('resize', requestMeasure);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', requestMeasure);
    };
  }, [browserTabs.length, designSystemProject, tabNames.length]);

  const isActiveSketch = activeFile?.kind === 'sketch' && isSketchName(activeFile.name);
  const activeSketch = activeFile && isActiveSketch ? sketches[activeFile.name] : null;
  // The "+" launcher's create-new actions come from the registry. `openTab`
  // reuses the same tab-state path as opening a file so a new terminal:<id>
  // tab is focused; `createBrowser` opens an embedded browser tab.
  // Built fresh each render (not memoized): `createBrowser` closes over
  // `openBrowserTab`, which reads the live `browserTabs` state — memoizing it
  // would capture a stale closure and make every "New Browser" click overwrite
  // the same single tab. The terminal action routes through `openFile`
  // (ref-based), so freshness here is cheap and only matters while the launcher
  // is open.
  const launcherContext: LauncherContext = {
    projectId,
    openTab: openFile,
    // Browser is owned by this branch's DesignBrowserPanel: spin up a browser
    // tab synchronously (no daemon round-trip) and let the launcher close.
    createBrowser: () => openBrowserTab(),
    createSketch: () => void startNewSketch(),
    createDocument: () => void createMarkdownDocument(),
    uploadDesignFiles: () => fileInputRef.current?.click(),
    // Terminal needs only the project id — spawn the PTY here and hand the
    // resulting session id back so the launcher opens a terminal:<id> tab.
    // Surface a toast when the daemon can't start one (e.g. node-pty not
    // compiled) instead of silently no-opping the launcher action.
    createTerminal: async () => {
      const term = await createTerminal(projectId);
      if (!term) {
        setLauncherToast(t('workspace.terminalStartFailed'));
        return null;
      }
      return term.id;
    },
  };
  const launcherActions = buildLauncherActions(launcherContext);

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
          onWheel={(event) => {
            // Translate vertical wheel into horizontal tab scroll so Windows
            // mouse-wheel users (no horizontal wheel/trackpad) can reach
            // overflowed tabs. Only act when there's actually horizontal
            // overflow and the gesture is predominantly vertical.
            const el = event.currentTarget;
            if (el.scrollWidth <= el.clientWidth) return;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            el.scrollLeft += event.deltaY;
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragOverTab(null);
          }}
          onDrop={(event) => {
            if (event.target !== event.currentTarget) return;
            clearTabDragState();
          }}
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
              const browserUrl = browserTab.url?.trim() ?? '';
              const browserTitle = browserUrl
                ? browserTab.title?.trim() || labelFromUrl(browserUrl)
                : browserTab.label;
              return (
                <Tab
                  key={browserTab.id}
                  label={browserTitle}
                  title={browserUrl ? `${browserTitle}\n${browserUrl}` : browserTitle}
                  active={activeTab === browserTab.id}
                  onActivate={() => setPersistedActive(browserTab.id)}
                  onClose={() => closeBrowserTab(browserTab.id)}
                  kind="browser"
                />
              );
            }
            const name = entry.name;
            const sketchEntry = sketches[name];
            const dirtyMark =
              sketchEntry && (sketchEntry.dirty || !sketchEntry.persisted) ? ' •' : '';
            const isPending = sketchEntry && !sketchEntry.persisted;
            const onDisk = visibleFiles.find((f) => f.name === name);
            const liveArtifact = liveArtifactEntries.find((entry) => entry.tabId === name);
            const kind = liveArtifact ? 'live-artifact' : onDisk?.kind ?? (isSketchName(name) ? 'sketch' : 'text');
            const isTerminal = isTerminalTabId(name);
            const isSideChat = isSideChatTabId(name);
            // Terminal and side-chat tabs are not files: give them a friendly
            // label + glyph instead of the raw `terminal:<id>` / `chat:<id>` id.
            let label: string;
            if (isTerminal) {
              // Number multiple terminals so the tabs stay distinguishable.
              const ordinal = tabNames.filter(isTerminalTabId).indexOf(name) + 1;
              label =
                ordinal > 1
                  ? `${t('workspace.newTerminal')} ${ordinal}`
                  : t('workspace.newTerminal');
            } else if (isSideChat) {
              const conv = conversations.find(
                (c) => c.id === conversationIdFromSideChatTabId(name),
              );
              label = conv?.title?.trim() || t('workspace.sideChatDefaultTitle');
            } else {
              label = `${liveArtifact?.title ?? name}${dirtyMark}`;
            }
            const iconNameOverride: IconName | undefined = isTerminal
              ? 'terminal'
              : isSideChat
                ? 'comment'
                : undefined;
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
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', name);
                  draggedTabNameRef.current = name;
                  setDraggedTabName(name);
                }}
                onDragOver={(event) => {
                  const currentDraggedName = draggedTabNameRef.current ?? draggedTabName;
                  if (!currentDraggedName || currentDraggedName === name) return;
                  if (!persistedTabs.includes(currentDraggedName)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const edge = tabDropEdgeFromEvent(event);
                  setDragOverTab((current) =>
                    current?.name === name && current.edge === edge
                      ? current
                      : { name, edge },
                  );
                }}
                onDragLeave={() => {
                  setDragOverTab((current) => (current?.name === name ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedName = draggedTabNameRef.current || draggedTabName;
                  if (draggedName) {
                    reorderPersistedTab(draggedName, name, tabDropEdgeFromEvent(event));
                  }
                  clearTabDragState();
                }}
                onDragEnd={clearTabDragState}
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
            onConfirm={async (assets) => {
              // Copy each picked asset into the project's design files (under the
              // folder currently in view, if any). Apply records a provenance
              // back-link so the registry knows the asset was consumed. For
              // element-pick captures, `includeElement` also drops the captured
              // markup as a companion `.element.html` file so the element's text
              // lands in Design Files alongside its screenshot.
              const dir = uploadDir || undefined;
              let lastRelPath: string | null = null;
              for (const asset of assets) {
                const res = await applyLibraryAsset(asset.id, projectId, dir, { includeElement: true });
                if (res?.relPath) lastRelPath = res.relPath;
                if (res?.elementRelPath) lastRelPath = res.elementRelPath;
              }
              await onRefreshFiles();
              if (lastRelPath) openFile(lastRelPath);
            }}
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


