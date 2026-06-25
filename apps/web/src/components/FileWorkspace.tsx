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
} from '../analytics/events';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { useT } from '../i18n';
import { isMacPlatform } from '../utils/platform';
import {
  deleteProjectFile,
  fetchProjectFileText,
  fetchProjectFolders,
  projectFileUrl,
  projectRawUrl,
  applyLibraryAsset,
  createProjectFolder,
  deleteDesignSystemDraft,
  deleteProjectFolder,
  renameProjectFile,
  startDesignSystemTokenContractRebuildJob,
  updateDesignSystemDraft,
  type UploadProjectFilesResult,
  uploadProjectFiles,
  writeProjectTextFile,
} from '../providers/registry';
import type { Dict } from '../i18n/types';
import { downloadDesignSystemArchive, downloadProjectArchive } from '../runtime/exports';
import { finalizeBrandProject } from '../runtime/brands';
import { deriveFileOps, type FileOpEntry } from '../runtime/file-ops';
import { parseDesignMd } from '../runtime/design-md-parse';
import {
  deleteBrandImage,
  deleteBrandLogo,
  readDesignMd,
  replaceDesignMdColorAtIndex,
  updateBrandColor,
} from '../runtime/kit-edit';
import { latestTodosFromEvents, type TodoItem } from '../runtime/todos';
import { deliverableSlideNavForActiveFile, isSlideNavDeliverableNow } from '../runtime/slide-nav';
import { buildSrcdoc } from '../runtime/srcdoc';
import { useDesignKit, hostnameOf, type KitColor } from '../runtime/design-kit';
import { useKitModuleUpload } from '../runtime/kit-upload';
import {
  DesignKitView,
  type DesignKitActionFeedbackTone,
  type DesignKitEditFocusRequest,
  type HeaderMenuAction,
} from './DesignKitView';
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
import { navigate } from '../router';
import type { QuestionForm } from '../artifacts/question-form';
import { DesignFilesPanel, type DesignFilesNavState } from './DesignFilesPanel';
import { DesignBrowserPanel, labelFromUrl, type BrowserPageInfo } from './DesignBrowserPanel';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { designSystemGithubEvidenceState, repoConnectCopy } from './design-system-github-evidence';
import { APP_CHROME_FILE_ACTIONS_ID } from './AppChromeHeader';
import { FileViewer, LiveArtifactViewer } from './FileViewer';
import { Icon, type IconName } from './Icon';
import { Toast } from './Toast';
import { TabLauncherMenu } from './workspace/TabLauncherMenu';
import { buildLauncherActions, type LauncherContext } from './workspace/tab-launcher';
import { SideChatTab, type ActiveConversationChatState } from './workspace/SideChatTab';
import { TerminalViewer } from './workspace/TerminalViewer';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import { MissingBrandFontsBanner } from './MissingBrandFontsBanner';
import { PasteTextDialog } from './PasteTextDialog';
import { LibraryPicker } from './LibraryPicker';
import { QuestionsPanel } from './QuestionsPanel';
import { QuickSwitcher } from './QuickSwitcher';
import { SketchEditor } from './SketchEditor';
import {
  buildSketchDocument,
  isSketchJsonFileName,
  parseSketchWorkspaceDocument,
  type SketchItem,
} from './sketch-model';
import { AnimatePresence } from 'motion/react';
import type { ChatMessage } from '../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

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
  defaultDesignSystemId?: string | null;
  onSetDefaultDesignSystem?: (id: string | null) => Promise<void> | void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
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
  dirty: boolean;
  persisted: boolean;
  loaded: boolean;
  saving: boolean;
}

export const DESIGN_FILES_TAB = '__design_files__';
export const DESIGN_SYSTEM_TAB = '__design_system__';
const QUESTIONS_TAB = '__questions__';
const BROWSER_TAB_PREFIX = '__browser__:';
// Keep at most this many embedded-browser `<webview>`s mounted at once. Each is
// a full out-of-process Chromium guest (timers, JS, network, a GPU surface), so
// mounting every open browser tab made memory/CPU grow linearly with tab count.
// We keep an LRU of the most-recently-activated browser tabs live and unmount
// the rest; switching back to an evicted tab remounts (reloads) it.
const BROWSER_KEEPALIVE_CAP = 3;

// Stable empty folder list so the render-phase project-switch reset is
// idempotent (passing a fresh `[]` each render would re-trigger the reset).
const EMPTY_PROJECT_FOLDERS: ProjectFolder[] = [];
type TabDropEdge = 'before' | 'after';
type BrowserWorkspaceTab = ProjectBrowserWorkspaceTab;
type WorkspaceOrderedTab =
  | { id: string; kind: 'browser'; browserTab: BrowserWorkspaceTab }
  | { id: string; kind: 'file'; name: string };
type DesignSystemReviewDecision =
  NonNullable<ProjectMetadata['designSystemReview']>[string]['decision'];
type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];
type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;
interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}
type DesignSystemSectionStatus =
  | 'missing'
  | 'planned'
  | 'running'
  | 'needs-review'
  | 'approved'
  | 'needs-work'
  | 'updated';
type DesignSystemReviewCategory = 'Type' | 'Colors' | 'Spacing' | 'Components' | 'Brand';
interface DesignSystemProjectSection {
  title: string;
  subtitle: string;
  files: string[];
  category: DesignSystemReviewCategory;
  requiredFile?: string;
}

function consumeFileWorkspaceTabShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

type DesignSystemSectionActivityPhase =
  | 'idle'
  | 'planned'
  | 'reading'
  | 'writing'
  | 'updated'
  | 'error';
interface DesignSystemSectionActivity {
  running: boolean;
  mutated: boolean;
  errored: boolean;
  phase: DesignSystemSectionActivityPhase;
  touchedFiles: string[];
  todoText?: string;
  todoStatus?: TodoItem['status'];
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

interface DesignSystemProjectSectionReview {
  section: DesignSystemProjectSection;
  previewFile: ProjectFile | null;
  previewDisplay: DesignSystemReviewPreviewDisplay;
  reviewEntry: DesignSystemReviewEntry | undefined;
  sectionActivity: DesignSystemSectionActivity;
  changedAfterFeedback: boolean;
  sectionStatus: DesignSystemSectionStatus;
  sectionStatusLabel: string;
  reviewTimeLabel: string | null;
}
type DesignSystemReviewPreviewDisplay = 'specimen' | 'ui-kit' | 'asset';
interface DesignSystemCardManifestEntry {
  path: string;
  group?: string;
  name?: string;
  subtitle?: string;
  viewport?: string;
}
type DesignSystemCardManifestMap = Map<string, DesignSystemCardManifestEntry>;
const DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS = ['group', 'name', 'subtitle', 'viewport'] as const;
type DesignSystemGenerationStepStatus = 'pending' | 'running' | 'succeeded';
interface DesignSystemGenerationStep {
  id: string;
  title: string;
  detail: string;
  status: DesignSystemGenerationStepStatus;
}
const DESIGN_SYSTEM_GUIDANCE_FILES = new Set([
  'design.md',
  'readme.md',
  'readme-print.md',
  'skill.md',
]);
const DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS = /\.(svg|png|jpe?g|gif|webp|avif|ico|otf|ttf|woff2?)$/i;

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
  defaultDesignSystemId = null,
  onSetDefaultDesignSystem,
  onDesignSystemsRefresh,
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

  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The folder the Design Files panel is currently viewing (synced via
  // onCurrentDirChange). New files — uploads, pastes, sketches, dropped files —
  // are created under this folder instead of the project root.
  const [uploadDir, setUploadDir] = useState<string>('');
  const [sketches, setSketches] = useState<Record<string, SketchState>>({});
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
  // "+" launcher (file search + registry-driven create-new actions:
  // Side Chat, Terminal, Browser).
  const [launcherOpen, setLauncherOpen] = useState(false);
  // Transient feedback when a launcher "create" action (e.g. New Terminal)
  // fails on the daemon side, so the click is never a silent no-op.
  const [launcherToast, setLauncherToast] = useState<string | null>(null);
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

  const visibleFiles = useMemo(
    () => files.filter((file) => !isLiveArtifactImplementationPath(file.name)),
    [files],
  );

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
    browserTabSequenceRef.current = 0;
    setLauncherOpen(false);
  }, [projectId]);

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
      if (entry && !entry.persisted) delete next[name];
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
        for (const name of deleted) delete next[name];
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
      delete next[oldName];
      next[renamed.name] = entry;
      return next;
    });

    return renamed;
  }

  function startNewSketch() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `sketch-${stamp}.sketch.json`;
    // Create under the folder currently being viewed, if any. The slash-joined
    // name flows through as the sketch's tab id and save path; the daemon's
    // sanitizePath turns it into a real subdirectory on save.
    const name = uploadDir ? `${uploadDir}/${base}` : base;
    setSketches((curr) => ({
      ...curr,
      [name]: {
        version: 1,
        rawItems: [],
        discardRawItemsOnSave: false,
        items: [],
        dirty: false,
        persisted: false,
        loaded: true,
        saving: false,
      },
    }));
    activatePending(name);
  }

  // When the active tab is a sketch we don't have items for yet, load from
  // disk. Pending sketches start with loaded=true and skip this path.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB) return;
    if (!isSketchName(activeTab)) return;
    if (sketches[activeTab]?.loaded) return;
    let cancelled = false;
    void fetchProjectFileText(projectId, activeTab).then((text) => {
      if (cancelled) return;
      const doc = parseSketchWorkspaceDocument(text);
      setSketches((curr) => ({
        ...curr,
        [activeTab]: {
          version: doc.version,
          rawItems: doc.rawItems,
          discardRawItemsOnSave: false,
          items: doc.items,
          dirty: false,
          persisted: true,
          loaded: true,
          saving: false,
        },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, projectId, sketches]);

  function setSketchItems(name: string, items: SketchItem[]) {
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          persisted: false,
          loaded: true,
          saving: false,
        }),
        items,
        dirty: true,
      } as SketchState,
    }));
  }

  function clearSketch(name: string) {
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          persisted: false,
          loaded: true,
          saving: false,
        }),
        items: [],
        dirty: true,
        discardRawItemsOnSave: true,
      } as SketchState,
    }));
  }

  async function saveSketch(name: string) {
    const entry = sketches[name];
    if (!entry) return;
    setSketches((curr) => ({ ...curr, [name]: { ...curr[name]!, saving: true } }));
    const doc = buildSketchDocument(
      entry.version,
      entry.discardRawItemsOnSave ? [] : entry.rawItems,
      entry.items,
    );
    const startedAt = Date.now();
    const file = await writeProjectTextFile(projectId, name, JSON.stringify(doc, null, 2));
    const elapsed = Date.now() - startedAt;
    // Ensures saving UI shows so the button does not flicker
    if (elapsed < 500) await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
    if (file) {
      setSketches((curr) => ({
        ...curr,
        [name]: {
          ...curr[name]!,
          version: doc.version,
          rawItems: doc.items.slice(),
          discardRawItemsOnSave: false,
          dirty: false,
          persisted: true,
          saving: false,
        },
      }));
      // Promote the previously-pending sketch into the persisted tab list.
      onTabsStateChange(workspaceTabsState(
        persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
        name,
      ));
      setActiveTab(name);
      await onRefreshFiles();
      return true;
    } else {
      setSketches((curr) => ({ ...curr, [name]: { ...curr[name]!, saving: false } }));
      return false;
    }
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
    if (isSketchName(activeTab) && sketches[activeTab]) {
      return {
        name: activeTab,
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
              const browserMeta = browserUrl ? formatBrowserTabUrl(browserUrl) : undefined;
              return (
                <Tab
                  key={browserTab.id}
                  label={browserTitle}
                  meta={browserMeta}
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
      {launcherToast ? (
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
        {browserTabs.filter((browserTab) => liveBrowserTabIds.includes(browserTab.id)).map((browserTab) => (
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
              sendDisabled={Boolean(streaming)}
              previewComments={previewComments}
              onSavePreviewComment={onSavePreviewComment}
              onRemovePreviewComment={onRemovePreviewComment}
              onSendBoardCommentAttachments={onSendBoardCommentAttachments}
              onRequestBrowserUsePrompt={onRequestBrowserUsePrompt}
              onRefreshFiles={onRefreshFiles}
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
            onOpenFile={openFile}
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
              setShowPasteDialog(true);
            }}
            onNewSketch={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'new_sketch',
              });
              startNewSketch();
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
              navigate({ kind: 'design-system-create' });
            }}
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
        ) : isActiveSketch && activeSketch && activeFile ? (
          activeSketch.loaded ? (
            <SketchEditor
              fileName={activeFile.name}
              items={activeSketch.items}
              hasPreservedRawItems={
                !activeSketch.discardRawItemsOnSave && activeSketch.rawItems.length > activeSketch.items.length
              }
              onItemsChange={(items) => setSketchItems(activeFile.name, items)}
              onClear={() => clearSketch(activeFile.name)}
              onSave={() => saveSketch(activeFile.name)}
              saving={activeSketch.saving}
              dirty={activeSketch.dirty || !activeSketch.persisted}
              onCancel={() => closeTab(activeFile.name)}
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
        {showPasteDialog ? (
          <PasteTextDialog
            onClose={() => setShowPasteDialog(false)}
            onSave={async (name, content) => {
              setShowPasteDialog(false);
              // Save under the folder currently being viewed, if any.
              const target = uploadDir ? `${uploadDir}/${name}` : name;
              const file = await writeProjectTextFile(projectId, target, content);
              if (file) {
                await onRefreshFiles();
                openFile(file.name);
              }
            }}
          />
        ) : null}
      </AnimatePresence>
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

function DesignSystemProjectPanel({
  projectId,
  system,
  brandId,
  files,
  streaming,
  activityEvents,
  onOpenFile,
  onUploadAssets,
  onRefreshFiles,
  defaultDesignSystemId,
  onSetDefaultDesignSystem,
  onDesignSystemsRefresh,
  onDeleteDesignSystemProject,
  onNeedsWork,
  designSystemReview,
  onReviewDecision,
  onUseDesignSystem,
  editFocusRequest,
  onConnectRepo,
  githubConnected,
}: {
  projectId: string;
  system: DesignSystemSummary;
  brandId?: string | null;
  files: ProjectFile[];
  streaming: boolean;
  activityEvents: AgentEvent[];
  onOpenFile: (name: string) => void;
  onUploadAssets: () => void;
  onRefreshFiles: () => Promise<void> | void;
  defaultDesignSystemId?: string | null;
  onSetDefaultDesignSystem?: (id: string | null) => Promise<void> | void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onDeleteDesignSystemProject?: (id: string) => Promise<boolean> | boolean;
  onNeedsWork?: (
    sectionTitle: string,
    feedback: string,
    files: string[],
  ) => DesignSystemReviewAgentTask | void;
  designSystemReview?: ProjectMetadata['designSystemReview'];
  onReviewDecision?: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
  onUseDesignSystem?: (id: string, title: string) => Promise<void> | void;
  editFocusRequest?: DesignKitEditFocusRequest | null;
  onConnectRepo?: () => void;
  githubConnected?: boolean;
}) {
  const t = useT();
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, DesignSystemReviewDecision>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [feedbackSection, setFeedbackSection] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [status, setStatus] = useState(system.status ?? 'draft');
  const [statusBusy, setStatusBusy] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState(false);
  const [cardManifest, setCardManifest] = useState<DesignSystemCardManifestMap>(() => new Map());
  const [cardManifestError, setCardManifestError] = useState<string | null>(null);
  useEffect(() => {
    setStatus(system.status ?? 'draft');
  }, [system.status]);
  useEffect(() => {
    const next: Record<string, DesignSystemReviewDecision> = {};
    for (const [sectionTitle, entry] of Object.entries(designSystemReview ?? {})) {
      next[sectionTitle] = entry.decision;
    }
    setReviewDecisions(next);
  }, [designSystemReview]);

  // brand.html-style kit for this design system. brand.json keeps rich assets,
  // while DESIGN.md is the editable text/token contract rendered on top.
  const [designMdBody, setDesignMdBody] = useState('');
  const [savingDesignMd, setSavingDesignMd] = useState(false);
  const [kitActionBusy, setKitActionBusy] = useState<string | null>(null);
  // Transient feedback for kit edits (upload / refresh / reset / delete) so an
  // action that previously fired-and-forgot now reports success or failure.
  const [kitToast, setKitToast] = useState<{ message: string; tone: DesignKitActionFeedbackTone } | null>(null);
  const notifyKit = useCallback(
    (tone: DesignKitActionFeedbackTone, message: string) => setKitToast({ tone, message }),
    [],
  );
  const notifyKitLoading = useCallback(
    (label: string) => notifyKit('loading', label.endsWith('…') || label.endsWith('...') ? label : `${label}...`),
    [notifyKit],
  );
  const [kitReloadKey, setKitReloadKey] = useState(0);
  const initialDesignMdRef = useRef<string | null>(null);
  const initialBrandJsonRef = useRef<string | null>(null);
  const initialBrandJsonLoadedRef = useRef(false);

  const refreshKitDependencies = useCallback(async (options?: { finalizeBrand?: boolean }) => {
    if (options?.finalizeBrand && brandId) {
      const outcome = await finalizeBrandProject(brandId, projectId);
      if (!outcome.ok) throw new Error(outcome.error);
    }
    setKitReloadKey((k) => k + 1);
    await Promise.all([
      Promise.resolve(onRefreshFiles()),
      Promise.resolve(onDesignSystemsRefresh?.()),
    ]);
  }, [brandId, onDesignSystemsRefresh, onRefreshFiles, projectId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readDesignMd(projectId),
      fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' }),
    ]).then(([designMd, brandJson]) => {
      if (cancelled) return;
      setDesignMdBody(designMd);
      if (initialDesignMdRef.current === null) initialDesignMdRef.current = designMd;
      if (!initialBrandJsonLoadedRef.current) {
        initialBrandJsonRef.current = brandJson;
        initialBrandJsonLoadedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, kitReloadKey]);
  const kitHost = system.provenance?.sourceUrls?.[0]
    ? hostnameOf(system.provenance.sourceUrls[0])
    : undefined;
  const { uploading: kitUploading, uploadModule: kitUploadModule } = useKitModuleUpload({
    projectId,
    title: system.title,
    onUploaded: (module) => {
      setKitActionBusy(`upload:${module}`);
      notifyKit('loading', t('ds.uploading'));
      void refreshKitDependencies({ finalizeBrand: true })
        .then(() => notifyKit('success', t('ds.uploadDone')))
        .catch(() => notifyKit('error', t('ds.actionFailed')))
        .finally(() => setKitActionBusy(null));
    },
    onError: () => {
      setKitActionBusy(null);
      notifyKit('error', t('ds.uploadFailed'));
    },
  });
  const { kit } = useDesignKit({
    designSystemId: system.id,
    title: system.title,
    projectId,
    swatches: system.swatches,
    body: designMdBody,
    editable: true,
    host: kitHost,
    reloadKey: kitReloadKey,
  });
  async function persistDesignMd(nextBody: string) {
    const updated = await updateDesignSystemDraft(system.id, { body: nextBody });
    if (!updated) throw new Error(t('ds.actionFailed'));
    const file = await writeProjectTextFile(projectId, 'DESIGN.md', nextBody);
    if (!file) throw new Error(t('ds.actionFailed'));
    setDesignMdBody(nextBody);
    await refreshKitDependencies();
  }

  async function saveDesignMd(nextBody: string) {
    if (kitActionBusy) throw new Error(t('ds.actionFailed'));
    setSavingDesignMd(true);
    setKitActionBusy('design-md-save');
    notifyKit('loading', t('ds.saving'));
    try {
      await persistDesignMd(nextBody);
      notifyKit('success', t('ds.actionDone'));
    } catch (err) {
      notifyKit('error', t('ds.actionFailed'));
      throw err;
    } finally {
      setSavingDesignMd(false);
      setKitActionBusy(null);
    }
  }

  async function refreshKit() {
    if (kitActionBusy) return;
    setKitActionBusy('refresh');
    notifyKitLoading(t('ds.refresh'));
    try {
      if (brandId) {
        await refreshKitDependencies({ finalizeBrand: true });
      } else {
        const job = await startDesignSystemTokenContractRebuildJob(system.id, { force: true });
        if (!job) throw new Error(t('ds.actionFailed'));
        await refreshKitDependencies();
      }
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setKitActionBusy(null);
    }
  }

  async function downloadKit() {
    if (kitActionBusy) return;
    setKitActionBusy('download');
    notifyKitLoading(t('ds.download'));
    try {
      await refreshKitDependencies({ finalizeBrand: true });
      const ok =
        await downloadProjectArchive({ projectId, fallbackTitle: system.title }) ||
        await downloadDesignSystemArchive({ designSystemId: system.id, fallbackTitle: system.title });
      if (!ok) throw new Error(t('ds.actionFailed'));
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setKitActionBusy(null);
    }
  }

  // Delete the whole design system from the project tab's "..." menu: remove the
  // registered design system (so it leaves the Design Systems list) AND its
  // backing project, then exit the tab. onDeleteDesignSystemProject is App's
  // handleDeleteProject, which deletes the project, clears local state and
  // navigates home — so the panel unmounts on success and there's no busy reset
  // to do in the happy path.
  async function deleteDesignSystemProject() {
    if (kitActionBusy || !onDeleteDesignSystemProject) return;
    const ok = window.confirm(
      t('ds.deleteProjectConfirm', { title: system.title }),
    );
    if (!ok) return;
    setKitActionBusy('delete');
    notifyKitLoading(t('ds.deleteProjectAction', { title: system.title }));
    try {
      // Delete the backing project first: this navigates home and unmounts the
      // panel, so the tab exits cleanly instead of briefly rendering an empty
      // design-system view. Only on success do we drop the registered design
      // system (so the Design Systems list keeps no ghost row) and refresh that
      // list. deleteDesignSystemDraft is a no-op (404 → false) for systems that
      // aren't user-editable; that's fine.
      const deleted = await onDeleteDesignSystemProject(projectId);
      if (!deleted) {
        notifyKit('error', t('ds.actionFailed'));
        setKitActionBusy(null);
        return;
      }
      await deleteDesignSystemDraft(system.id);
      await onDesignSystemsRefresh?.();
    } catch {
      notifyKit('error', t('ds.actionFailed'));
      setKitActionBusy(null);
    }
  }

  async function changeKitColor(index: number, hex: string) {
    if (kitActionBusy) throw new Error(t('ds.actionFailed'));
    const nextHex = normalizeDesignKitHex(hex);
    if (!nextHex) throw new Error(t('ds.invalidHexColor'));
    setKitActionBusy('color');
    notifyKit('loading', t('ds.saving'));
    try {
      const ok = await updateBrandColor(projectId, index, nextHex);
      if (!ok) {
        const nextBody = designMdBodyWithColor(designMdBody, kit?.colors ?? [], index, nextHex);
        await persistDesignMd(nextBody);
      } else {
        await refreshKitDependencies({ finalizeBrand: true });
      }
      notifyKit('success', t('ds.actionDone'));
    } catch (err) {
      notifyKit('error', t('ds.actionFailed'));
      throw err;
    } finally {
      setKitActionBusy(null);
    }
  }

  async function resetKitColor(index: number) {
    const originalHex = initialDesignKitColorHex(index, {
      brandJson: initialBrandJsonRef.current,
      designMdBody: initialDesignMdRef.current,
      swatches: system.swatches,
      currentColors: kit?.colors ?? [],
    });
    if (!originalHex) throw new Error(t('ds.noOriginalColor'));
    await changeKitColor(index, originalHex);
  }

  async function removeKitLogo(index: number) {
    if (kitActionBusy) return;
    setKitActionBusy(`delete-logo:${index}`);
    notifyKitLoading(t('ds.deleteLogo'));
    try {
      const ok = await deleteBrandLogo(projectId, index);
      if (!ok) throw new Error(t('ds.actionFailed'));
      await refreshKitDependencies({ finalizeBrand: true });
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setKitActionBusy(null);
    }
  }

  async function removeKitImage(index: number) {
    if (kitActionBusy) return;
    setKitActionBusy(`delete-image:${index}`);
    notifyKitLoading(t('ds.deleteImage', { caption: '' }).trim());
    try {
      const ok = await deleteBrandImage(projectId, index);
      if (!ok) throw new Error(t('ds.actionFailed'));
      await refreshKitDependencies({ finalizeBrand: true });
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setKitActionBusy(null);
    }
  }

  const allFileNames = files.map((file) => file.name);
  const fileByName = new Map(files.map((file) => [file.name, file]));
  const manifestFile = files.find((file) => normalizeDesignSystemPath(file.name) === '_ds_manifest.json');
  const manifestFileName = manifestFile?.name ?? null;
  const manifestCacheBustKey = manifestFile ? Math.round(manifestFile.mtime) : null;
  const manifestReadFailedLabel = t('ds.manifestReadFailed');
  useEffect(() => {
    if (!system.id || !manifestFileName || manifestCacheBustKey === null) {
      setCardManifest((current) => (current.size === 0 ? current : new Map()));
      setCardManifestError((current) => (current === null ? current : null));
      return undefined;
    }
    let cancelled = false;
    void fetchProjectFileText(projectId, manifestFileName, {
      cache: 'no-store',
      cacheBustKey: manifestCacheBustKey,
    }).then((text) => {
      if (cancelled) return;
      setCardManifest(parseDesignSystemCardManifest(text));
      setCardManifestError(null);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setCardManifest(new Map());
      setCardManifestError(err instanceof Error ? err.message : manifestReadFailedLabel);
    });
    return () => {
      cancelled = true;
    };
  }, [manifestCacheBustKey, manifestFileName, manifestReadFailedLabel, projectId, system.id]);
  const fontFiles = allFileNames.filter((name) =>
    /\.(otf|ttf|woff|woff2)$/i.test(name) || name.toLowerCase().includes('/fonts/'),
  );
  const githubEvidence = designSystemGithubEvidenceState(system, allFileNames);
  const sections = buildDesignSystemReviewSections(allFileNames, fileByName, cardManifest);
  const published = status === 'published';
  const isDefault = published && defaultDesignSystemId === system.id;
  // Strip a trailing "design system" from the title so the heading
  // "Review <name> design system" does not read redundantly when a system is
  // already named e.g. "Acme Design System".
  const systemDisplayName = system.title.replace(/\s*design system$/i, '').trim() || system.title;
  const activityFileOps = useMemo(() => deriveFileOps(activityEvents), [activityEvents]);
  const activityTodos = useMemo(() => latestTodosFromEvents(activityEvents), [activityEvents]);
  const sectionReviews: DesignSystemProjectSectionReview[] = sections.map((section) => {
    const previewFile = designSystemSectionPreviewFile(section.files, fileByName);
    const reviewEntry = designSystemReview?.[section.title];
    const reviewDecision = reviewDecisions[section.title] ?? reviewEntry?.decision;
    const sectionActivity = designSystemSectionActivity(section, activityFileOps, activityTodos);
    const changedAfterFeedback = designSystemSectionChangedAfterReview(
      section.files,
      fileByName,
      reviewEntry,
    );
    const sectionStatus = designSystemSectionStatus(
      section,
      reviewDecision,
      changedAfterFeedback,
      sectionActivity,
    );
    return {
      section,
      previewFile,
      previewDisplay: designSystemReviewPreviewDisplay(section, previewFile),
      reviewEntry,
      sectionActivity,
      changedAfterFeedback,
      sectionStatus,
      sectionStatusLabel: designSystemSectionStatusLabel(t, section, sectionStatus, sectionActivity),
      reviewTimeLabel: reviewEntry?.updatedAt
        ? designSystemReviewTimeLabel(t, reviewEntry.updatedAt)
        : null,
    };
  });
  const generationReviewHasStarted = published || designSystemGenerationReviewHasStarted(sectionReviews);
  const visibleSectionReviews = streaming && !published && generationReviewHasStarted
    ? sectionReviews.filter((item) => designSystemSectionVisibleDuringGeneration(item))
    : sectionReviews;
  const groupedSectionReviews = designSystemReviewGroups(visibleSectionReviews);
  const reviewTocGroups = groupedSectionReviews
    .map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({
        id: `design-system-section-${slugForTestId(`${group.title}:${item.section.title}`)}`,
        label: item.section.title,
        statusClass: designSystemSectionStatusClass(item.sectionStatus),
        statusLabel: item.sectionStatusLabel,
      })),
    }))
    .filter((group) => group.items.length > 0);
  const creatingInitialDraft = streaming && !published;
  const generationSteps = designSystemInitialGenerationSteps({
    files,
    sectionReviews,
    system,
    t,
  });
  const generationProgress = designSystemGenerationProgress(generationSteps);

  async function togglePublished(nextPublished: boolean) {
    if (nextPublished && !githubEvidence.ready) return;
    setStatusBusy(true);
    notifyKitLoading(publishActionLabel);
    try {
      const nextStatus = nextPublished ? 'published' : 'draft';
      const updated = await updateDesignSystemDraft(system.id, { status: nextStatus });
      if (!updated) throw new Error(t('ds.actionFailed'));
      setStatus(updated.status ?? nextStatus);
      await onDesignSystemsRefresh?.();
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setStatusBusy(false);
    }
  }

  async function toggleDefault(nextDefault: boolean) {
    if (!onSetDefaultDesignSystem) return;
    setDefaultBusy(true);
    notifyKitLoading(nextDefault ? t('dsManager.makeDefault') : t('dsManager.badgeDefault'));
    try {
      await onSetDefaultDesignSystem(nextDefault ? system.id : null);
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setDefaultBusy(false);
    }
  }

  function markSectionReview(
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) {
    setReviewDecisions((current) => ({ ...current, [sectionTitle]: decision }));
    onReviewDecision?.(sectionTitle, decision, details);
    if (decision === 'looks-good' && feedbackSection === sectionTitle) {
      setFeedbackSection(null);
      setFeedbackText('');
    }
  }

  function toggleSection(sectionTitle: string) {
    setExpandedSections((current) => ({
      ...current,
      [sectionTitle]: !(current[sectionTitle] ?? false),
    }));
  }

  function openNeedsWorkFeedback(sectionTitle: string, expansionKey: string) {
    setReviewDecisions((current) => ({ ...current, [sectionTitle]: 'needs-work' }));
    setExpandedSections((current) => ({ ...current, [expansionKey]: true }));
    setFeedbackSection(sectionTitle);
    setFeedbackText('');
  }

  function submitNeedsWorkFeedback(sectionTitle: string, sectionFiles: string[]) {
    const feedback = feedbackText.trim();
    if (!feedback) return;
    const agentTask = onNeedsWork?.(sectionTitle, feedback, sectionFiles);
    markSectionReview(sectionTitle, 'needs-work', {
      feedback,
      files: sectionFiles,
      ...(agentTask ? { agentTask } : {}),
    });
    setFeedbackSection(null);
    setFeedbackText('');
  }

  function renderReviewCard(
    item: DesignSystemProjectSectionReview,
    instanceId: string,
    defaultExpanded: boolean,
  ) {
    const {
      section,
      previewFile,
      reviewEntry,
      sectionActivity,
      changedAfterFeedback,
      sectionStatus,
      sectionStatusLabel,
    } = item;
    const needsAttention = designSystemReviewNeedsAttention(item);
    // A section the user marked "Looks good" is validated, so collapse it by
    // default to show it is done. Gate that on the current status, not just the
    // stored decision: when a section is regenerated after approval its status
    // moves back to needs-attention, and it has to reopen so the "review again"
    // notice and regenerated preview stay visible. Without the needsAttention guard a stale "looks-good" decision
    // keeps the regenerated section collapsed and the change is easy to miss.
    // The user can still re-expand with the chevron (expandedSections[instanceId]),
    // and an active agent run forces it open.
    const reviewedGood =
      !needsAttention && (reviewDecisions[section.title] ?? reviewEntry?.decision) === 'looks-good';
    const expanded =
      (expandedSections[instanceId] ?? (defaultExpanded && !reviewedGood)) || sectionActivity.running;
    const sectionSlug = slugForTestId(instanceId);
    const sectionAnchorId = `design-system-section-${sectionSlug}`;
    const editableFile = designSystemSectionEditableFile(section, previewFile, fileByName);
    return (
      <section
        id={sectionAnchorId}
        key={instanceId}
        className={[
          'ds-project-section',
          'ds-project-review-item',
          `ds-project-review-item--${item.previewDisplay}`,
          expanded ? 'is-expanded' : 'is-collapsed',
        ].join(' ')}
      >
        <div className="ds-project-section-head">
          {/* The trigger is a stretched button covering the whole head, so the
              entire row toggles. It is a sibling of the review action buttons
              (not a parent), so there are no nested interactive elements. The
              title below is display-only (pointer-events: none) and lets clicks
              fall through to this trigger. */}
          <button
            type="button"
            className="ds-project-section-head-trigger"
            aria-expanded={expanded}
            aria-label={t(expanded ? 'ds.reviewCollapseSection' : 'ds.reviewExpandSection', { title: section.title })}
            onClick={() => toggleSection(instanceId)}
          />
          <span className="ds-project-section-title">
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={13} />
            <span>
              <strong>{section.title}</strong>
              <small>{section.subtitle}</small>
            </span>
            {!expanded ? (
              <span
                className={[
                  'ds-project-section-state',
                  'ds-project-section-dot',
                  designSystemSectionStatusClass(sectionStatus),
                ].join(' ')}
                aria-label={sectionStatusLabel}
                title={sectionStatusLabel}
              >
                {needsAttention ? t('ds.reviewNeedsReview') : t('ds.reviewLooksGood')}
              </span>
            ) : null}
          </span>
          <div className="ds-project-review-actions" aria-label={t('ds.reviewActionsLabel', { title: section.title })}>
            <button
              type="button"
              className={`ghost success ${reviewDecisions[section.title] === 'looks-good' ? 'active' : ''}`}
              data-testid={`design-system-review-good-${slugForTestId(section.title)}`}
              onClick={() => {
                markSectionReview(section.title, 'looks-good');
                // Collapse on validate, overriding any manual expand so the
                // section always tidies away once it is marked good.
                setExpandedSections((current) => ({ ...current, [instanceId]: false }));
              }}
            >
              <Icon name="check" size={13} />
              {t('ds.reviewLooksGood')}
            </button>
            <button
              type="button"
              className={`ghost danger ${reviewDecisions[section.title] === 'needs-work' ? 'active' : ''}`}
              data-testid={`design-system-review-work-${slugForTestId(section.title)}`}
              onClick={() => openNeedsWorkFeedback(section.title, instanceId)}
            >
              <Icon name="comment" size={13} />
              {t('ds.reviewNeedsWorkEllipsis')}
            </button>
            {editableFile ? (
              <button
                type="button"
                className="ghost compact"
                data-testid={`design-system-review-edit-${sectionSlug}`}
                title={t('ds.reviewEditFile', { file: editableFile.name })}
                onClick={() => onOpenFile(editableFile.name)}
              >
                <Icon name="edit" size={13} />
                {t('common.edit')}
              </button>
            ) : null}
            {feedbackSection === section.title ? (
              <form
                className="ds-project-feedback-popover"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitNeedsWorkFeedback(section.title, section.files);
                }}
              >
                <label htmlFor={`ds-feedback-${slugForTestId(section.title)}`}>
                  {t('ds.reviewFeedbackLabel')}
                </label>
                <textarea
                  id={`ds-feedback-${slugForTestId(section.title)}`}
                  value={feedbackText}
                  rows={3}
                  placeholder={t('ds.reviewFeedbackPlaceholder', { title: section.title })}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  autoFocus
                />
                <div>
                  <button
                    type="button"
                    className="ghost compact"
                    onClick={() => {
                      setFeedbackSection(null);
                      setFeedbackText('');
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="primary compact"
                    disabled={!feedbackText.trim()}
                  >
                    {t('chat.send')}
                  </button>
                </div>
              </form>
              ) : null}
          </div>
        </div>
        {expanded ? (
          <div className="ds-project-section-body">
            {sectionActivity.running ? (
              <div className="ds-project-review-notice is-running">
                <Icon name="sparkles" size={14} />
                <span>{designSystemSectionRunningNotice(t, section, sectionActivity)}</span>
              </div>
            ) : changedAfterFeedback || sectionActivity.mutated ? (
              <div className="ds-project-review-notice">
                <Icon name="check" size={14} />
                <span>
                  {changedAfterFeedback
                    ? t('ds.reviewChangedAfterFeedback')
                    : t('ds.reviewChangedDuringRun')}
                </span>
              </div>
            ) : null}
            {reviewEntry?.decision === 'needs-work' && reviewEntry.feedback ? (
              <div className="ds-project-last-feedback">
                <Icon name="comment" size={14} />
                <span>
                  <strong>{t('ds.reviewLastFeedback')}</strong>
                  <small>{reviewEntry.feedback}</small>
                  {reviewEntry.agentTask ? (
                    <small>{designSystemReviewAgentTaskLabel(t, reviewEntry.agentTask)}</small>
                  ) : null}
                </span>
              </div>
            ) : null}
            {previewFile ? (
              <div className="ds-project-inline-preview">
                <DesignSystemInlinePreview projectId={projectId} file={previewFile} />
              </div>
            ) : (
              <div className="ds-project-preview-placeholder">
                <Icon name="sparkles" size={16} />
                <span>{t('ds.previewGenerating')}</span>
              </div>
            )}
          </div>
        ) : null}
      </section>
    );
  }

  if (creatingInitialDraft) {
    return (
      <div className="ds-project-panel ds-project-panel--generating">
        <DesignSystemProjectLoading
          kicker={t('dsManager.tabDesignSystem')}
          title={t('ds.creatingProjectTitle')}
          subtitle={t('ds.creatingProjectSubtitle')}
          progress={generationProgress}
          progressLabel={t('ds.generationProgressLabel', { progress: generationProgress })}
        />
      </div>
    );
  }

  // Scaffolding kept around the brand.html kit: publish / default controls in
  // the kit header, and the publish card + repo / font / manifest warnings above
  // the modules. The Looks-good / Needs-work review flow is intentionally gone
  // here — the kit is the single, on-brand view of the system.
  // The publish lifecycle button stays a visible primary; everything else
  // (asset refresh/download/reset and the chat-default toggle) folds into the
  // header's "More" dropdown so the sticky row reads as one clear action.
  const repoCopy = repoConnectCopy(t, githubConnected);
  const publishActionLabel = published ? t('ds.unpublishDesignSystem') : t('ds.publishDesignSystem');
  const actionsSlot = (
    <span
      className="ds-project-publish-trigger"
      title={
        !published && !githubEvidence.ready
          ? t('ds.publishRepoRequiredTitle')
          : undefined
      }
    >
      <button
        type="button"
        className={published ? 'ghost compact' : 'primary'}
        data-testid="design-system-publish"
        aria-label={publishActionLabel}
        title={publishActionLabel}
        disabled={statusBusy || (!published && !githubEvidence.ready)}
        aria-busy={statusBusy || undefined}
        onClick={() => void togglePublished(!published)}
      >
        <Icon name={statusBusy ? 'spinner' : published ? 'check' : 'arrow-up'} size={14} />
        {published ? t('ds.published') : t('ds.publish')}
      </button>
    </span>
  );

  const headerMenuActions: HeaderMenuAction[] = [
    {
      id: 'refresh',
      label: t('ds.refresh'),
      icon: 'refresh',
      onClick: () => void refreshKit(),
      disabled: Boolean(kitActionBusy) || statusBusy || defaultBusy,
      loading: kitActionBusy === 'refresh',
    },
    {
      id: 'download',
      label: t('dsManager.downloadTitle'),
      icon: 'download',
      onClick: () => void downloadKit(),
      disabled: Boolean(kitActionBusy) || statusBusy || defaultBusy,
      loading: kitActionBusy === 'download',
    },
    ...(published && onSetDefaultDesignSystem
      ? [
          {
            id: 'default',
            label: isDefault ? t('dsManager.badgeDefault') : t('dsManager.makeDefault'),
            icon: (isDefault ? 'check' : 'star') as IconName,
            onClick: () => void toggleDefault(!isDefault),
            disabled: statusBusy || defaultBusy || Boolean(kitActionBusy),
            loading: defaultBusy,
            active: isDefault,
          } satisfies HeaderMenuAction,
        ]
      : []),
    ...(onDeleteDesignSystemProject
      ? [
          {
            id: 'delete',
            label: t('ds.deleteProjectAction', { title: system.title }),
            icon: 'trash' as IconName,
            onClick: () => void deleteDesignSystemProject(),
            disabled: Boolean(kitActionBusy) || statusBusy || defaultBusy,
            loading: kitActionBusy === 'delete',
          } satisfies HeaderMenuAction,
        ]
      : []),
  ];

  const topSlot = (
    <>
      <div
        className={`ds-project-extraction-status ${streaming ? 'is-running' : 'is-complete'}`}
        role="status"
        data-testid="design-system-extraction-status"
      >
        <Icon name={streaming ? 'sparkles' : 'check'} size={15} />
        <span>
          <strong>{streaming ? t('ds.extractionRunningTitle') : t('ds.extractionCompleteTitle')}</strong>
          <small>
            {streaming
              ? t('ds.extractionRunningBody')
              : t('ds.extractionCompleteBody')}
          </small>
        </span>
      </div>

      <div className="ds-project-publish-card ds-project-publish-card--review">
        <p>
          {published
            ? t('ds.publishCardPublished')
            : t('ds.publishCardDraft')}
        </p>
        {published ? (
          <div className="ds-project-use-row">
            <span>
              <strong>{t('ds.useSystemTitle')}</strong>
              <small>
                {t('ds.useSystemBody')}
              </small>
            </span>
            <Button
              variant="primary"
              onClick={() => onUseDesignSystem?.(system.id, system.title)}
              disabled={!onUseDesignSystem}
            >
              <Icon name="plus" size={14} />
              {t('ds.createNewDesign')}
            </Button>
          </div>
        ) : null}
      </div>

      {!githubEvidence.ready ? (
        <div className="ds-project-warning-card">
          <Icon name="github" size={16} />
          <span>
            <strong>{repoCopy.bannerTitle}</strong>
            <small>{repoCopy.bannerBody}</small>
          </span>
          {onConnectRepo ? (
            <Button
              variant="ghost"
              className="compact"
              disabled={githubConnected === undefined}
              onClick={onConnectRepo}
            >
              <Icon name="github" size={13} />
              {repoCopy.buttonLabel}
            </Button>
          ) : githubEvidence.hasSourceManifest ? (
            <Button variant="ghost" className="compact" onClick={() => onOpenFile('context/source-context.md')}>
              <Icon name="file" size={13} />
              {t('ds.openSourceContext')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {fontFiles.length === 0 ? (
        <MissingBrandFontsBanner projectId={projectId} onUploadAssets={onUploadAssets} />
      ) : null}

      {cardManifestError ? (
        <div
          className="ds-project-warning-card ds-project-warning-card--error"
          data-testid="design-system-manifest-error"
          role="alert"
        >
          <Icon name="alert-triangle" size={16} />
          <span>
            <strong>{t('ds.manifestNeedsAttention')}</strong>
            <small>{cardManifestError}</small>
          </span>
          {manifestFileName ? (
            <Button variant="ghost" className="compact" onClick={() => onOpenFile(manifestFileName)}>
              <Icon name="file" size={13} />
              {t('ds.openManifest')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="ds-project-panel ds-project-panel--kit" data-testid="design-system-project-tab-panel">
      {kitToast ? (
        <Toast
          message={kitToast.message}
          tone={kitToast.tone}
          ttlMs={kitToast.tone === 'loading' ? 60000 : 2600}
          role={kitToast.tone === 'error' ? 'alert' : 'status'}
          onDismiss={() => setKitToast(null)}
        />
      ) : null}
      {kit ? (
        <DesignKitView
          kit={kit}
          actionsSlot={actionsSlot}
          headerMenuActions={headerMenuActions}
          topSlot={topSlot}
          stickyHeader
          designMd={{
            body: designMdBody,
            onSave: saveDesignMd,
            onOpenFile: () => onOpenFile('DESIGN.md'),
            saving: savingDesignMd,
            canEdit: true,
          }}
          onUploadModule={kitUploadModule}
          onColorChange={(index, hex) => changeKitColor(index, hex)}
          onColorReset={(index) => resetKitColor(index)}
          onDeleteLogo={(index) => void removeKitLogo(index)}
          onDeleteImage={(index) => void removeKitImage(index)}
          onRefresh={() => void refreshKit()}
          onDownload={() => void downloadKit()}
          uploading={kitUploading}
          actionBusy={kitActionBusy}
          onActionFeedback={notifyKit}
          editFocusRequest={editFocusRequest}
          dataTestId="design-system-project-kit"
        />
      ) : (
        <DesignSystemProjectLoading
          kicker={t('dsManager.tabDesignSystem')}
          title={systemDisplayName}
          subtitle={t('ds.workspacePreparing')}
          progressLabel={t('ds.workspaceLoadingLabel')}
        />
      )}
    </div>
  );
}

function DesignSystemProjectLoading({
  kicker,
  title,
  subtitle,
  progress,
  progressLabel,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  progress?: number;
  progressLabel: string;
}) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const clampedProgress = hasProgress
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : undefined;
  return (
    <div className="ds-project-loading-stage" role="status" aria-live="polite">
      <div className="ds-project-loading-emblem" aria-hidden="true">
        <span className="ds-project-loading-emblem__grid" />
        <span className="ds-project-loading-mark">
          <Icon name="blocks" size={28} />
        </span>
      </div>
      <div className="ds-project-loading-copy">
        <span className="ds-project-loading-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div
        className={`ds-project-loading-progress ${hasProgress ? 'is-determinate' : 'is-indeterminate'}`}
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={hasProgress ? 0 : undefined}
        aria-valuemax={hasProgress ? 100 : undefined}
        aria-valuenow={clampedProgress}
      >
        <span style={hasProgress ? { width: `${clampedProgress}%` } : undefined} />
      </div>
      <div className="ds-project-loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function normalizeDesignKitHex(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toUpperCase();
  }
  return null;
}

function initialDesignKitColorHex(
  index: number,
  sources: {
    brandJson: string | null;
    designMdBody: string | null;
    swatches: string[] | undefined;
    currentColors: KitColor[];
  },
): string | null {
  const brandColor = colorHexFromBrandJson(sources.brandJson, index);
  if (brandColor) return brandColor;
  const designMdColor = colorHexFromDesignMd(sources.designMdBody ?? '', index);
  if (designMdColor) return designMdColor;
  return normalizeDesignKitHex(sources.swatches?.[index] ?? sources.currentColors[index]?.hex ?? '');
}

function colorHexFromBrandJson(raw: string | null, index: number): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { colors?: Array<{ hex?: unknown }> };
    const hex = parsed.colors?.[index]?.hex;
    return typeof hex === 'string' ? normalizeDesignKitHex(hex) : null;
  } catch {
    return null;
  }
}

function colorHexFromDesignMd(body: string, index: number): string | null {
  if (!body.trim()) return null;
  return normalizeDesignKitHex(parseDesignMd(body).colors[index]?.hex ?? '');
}

function designMdBodyWithColor(
  body: string,
  colors: KitColor[],
  index: number,
  hex: string,
): string {
  const replaced = replaceDesignMdColorAtIndex(body, index, hex);
  if (replaced) return replaced;
  const nextColors = colors.length > 0
    ? colors.map((color, colorIndex) => ({
        ...color,
        hex: colorIndex === index ? hex : color.hex,
      }))
    : [];
  while (nextColors.length <= index) {
    nextColors.push({
      role: `color-${nextColors.length + 1}`,
      name: `Color ${nextColors.length + 1}`,
      hex: nextColors.length === index ? hex : '#000000',
      usage: '',
    });
  }
  if (nextColors[index]) {
    nextColors[index] = { ...nextColors[index], hex };
  }
  const table = [
    '## Color Palette',
    '',
    '| Role | Name | Hex | Usage |',
    '| --- | --- | --- | --- |',
    ...nextColors.map((color, colorIndex) => {
      const role = color.role || `color-${colorIndex + 1}`;
      const name = color.name || role;
      return `| ${role} | ${name} | \`${normalizeDesignKitHex(color.hex) ?? '#000000'}\` | ${color.usage || ''} |`;
    }),
  ].join('\n');
  return `${body.trimEnd()}\n\n${table}\n`;
}

function designSystemHasSourceContext(system: DesignSystemSummary): boolean {
  const provenance = system.provenance;
  if (!provenance) return false;
  return Boolean(
    provenance.companyBlurb?.trim() ||
    provenance.githubUrls?.length ||
    provenance.localCodeFiles?.length ||
    provenance.figFiles?.length ||
    provenance.assetFiles?.length ||
    provenance.notes?.trim() ||
    provenance.sourceNotes?.trim(),
  );
}

function slugForTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function designSystemSectionEditableFile(
  section: DesignSystemProjectSection,
  previewFile: ProjectFile | null,
  fileByName: Map<string, ProjectFile>,
): ProjectFile | null {
  if (previewFile && (previewFile.kind === 'html' || previewFile.kind === 'sketch')) return previewFile;
  const htmlFile = section.files
    .map((name) => fileByName.get(name))
    .find((file) => file?.kind === 'html');
  if (htmlFile) return htmlFile;
  return previewFile ?? section.files.map((name) => fileByName.get(name)).find(Boolean) ?? null;
}

function designSystemSectionPreviewFile(
  names: string[],
  fileByName: Map<string, ProjectFile>,
): ProjectFile | null {
  for (const name of names) {
    const file = fileByName.get(name);
    if (!file) continue;
    if (file.kind === 'html' || file.kind === 'image' || file.kind === 'sketch') return file;
  }
  return null;
}

function buildDesignSystemReviewSections(
  names: string[],
  fileByName: Map<string, ProjectFile>,
  cardManifest: DesignSystemCardManifestMap = new Map(),
): DesignSystemProjectSection[] {
  const artifactNames = names
    .filter((name) => isDesignSystemReviewArtifactFile(name, fileByName))
    .sort(designSystemReviewArtifactSort);
  if (artifactNames.length > 0) {
    const reviewNames = preferPreviewArtifactsOverRawAssets(artifactNames);
    return reviewNames.map((name) => {
      const manifestEntry = cardManifest.get(normalizeDesignSystemPath(name));
      const title = manifestEntry?.name?.trim() || designSystemReviewTitleFromPath(name);
      const category = inferDesignSystemReviewCategory(name, title, manifestEntry);
      return {
        title,
        subtitle: manifestEntry?.subtitle?.trim() || designSystemReviewSubtitle(title, category, name),
        category,
        files: designSystemRelatedFilesForCategory(name, category, names),
      };
    });
  }
  return designSystemFallbackReviewSections(names);
}

function preferPreviewArtifactsOverRawAssets(names: string[]): string[] {
  const hasBrandPreview = names.some((name) => {
    const path = normalizeDesignSystemPath(name);
    const title = designSystemReviewTitleFromPath(name);
    return inferDesignSystemReviewCategory(name, title) === 'Brand'
      && (path.startsWith('preview/') || path.includes('/preview/') || path.endsWith('.html'));
  });
  if (!hasBrandPreview) return names;
  return names.filter((name) => {
    const path = normalizeDesignSystemPath(name);
    const title = designSystemReviewTitleFromPath(name);
    if (inferDesignSystemReviewCategory(name, title) !== 'Brand') return true;
    return path.startsWith('preview/') || path.includes('/preview/') || path.endsWith('.html');
  });
}

function isDesignSystemReviewArtifactFile(
  name: string,
  fileByName: Map<string, ProjectFile>,
): boolean {
  const path = normalizeDesignSystemPath(name);
  const file = fileByName.get(name);
  if (!file || isDesignSystemEvidenceFile(path) || path === 'metadata.json') return false;
  const isRenderable = file.kind === 'html' || file.kind === 'image' || file.kind === 'sketch';
  if (!isRenderable) return false;
  if (isDesignSystemRawAssetFile(path)) return isDesignSystemReviewableAssetArtifact(path);
  if (path === 'index.html') return true;
  if (path.startsWith('preview/') || path.includes('/preview/')) return true;
  if (isDesignSystemUiKitFile(path)) return true;
  return false;
}

function isDesignSystemRawAssetFile(path: string): boolean {
  return path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || path.includes('/fonts/')
    || path.includes('/logos/');
}

function isDesignSystemReviewableAssetArtifact(path: string): boolean {
  return /\b(brand|logo|logos|mark|wordmark|icon)\b/u.test(path);
}

function designSystemReviewArtifactSort(first: string, second: string): number {
  const firstCategory = inferDesignSystemReviewCategory(first, designSystemReviewTitleFromPath(first));
  const secondCategory = inferDesignSystemReviewCategory(second, designSystemReviewTitleFromPath(second));
  return designSystemReviewCategoryRank(firstCategory) - designSystemReviewCategoryRank(secondCategory)
    || designSystemReviewTitleFromPath(first).localeCompare(designSystemReviewTitleFromPath(second));
}

function designSystemReviewTitleFromPath(name: string): string {
  const path = normalizeDesignSystemPath(name);
  const parts = path.split('/').filter(Boolean);
  let basename = parts[parts.length - 1] ?? path;
  if (/^index\.(html?|png|jpe?g|svg|webp|avif)$/iu.test(basename) && parts.length > 1) {
    basename = parts[parts.length - 2] ?? basename;
  }
  return basename
    .replace(/\.(html?|png|jpe?g|gif|webp|avif|svg|fig|pen)$/iu, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'overview';
}

function inferDesignSystemReviewCategory(
  name: string,
  title: string,
  manifestEntry?: DesignSystemCardManifestEntry,
): DesignSystemReviewCategory {
  const text = `${normalizeDesignSystemPath(name)} ${title}`.toLowerCase();
  const group = manifestEntry?.group?.toLowerCase() ?? '';
  if (group.includes('ui kit')) return 'Components';
  if (/\b(type|typography|font|text)\b/u.test(text)) return 'Type';
  if (/\b(color|colors|palette|theme)\b/u.test(text)) return 'Colors';
  if (/\b(space|spacing|radius|radii|shadow|shadows|elevation|layout-grid)\b/u.test(text)) return 'Spacing';
  if (/\b(brand|logo|logos|mark|wordmark|icon|favicon)\b/u.test(text)) return 'Brand';
  if (group.includes('brand')) return 'Brand';
  return 'Components';
}

function designSystemReviewSubtitle(title: string, category: DesignSystemReviewCategory, name = ''): string {
  const path = normalizeDesignSystemPath(name);
  const titleText = title.toLowerCase();
  const text = `${title} ${path}`.toLowerCase();
  if (isDesignSystemUiKitEntryPage(path)) return 'Applied UI kit example';
  if (text.includes('typography')) return 'Text hierarchy and styles';
  if (text.includes('type-')) return 'Typography scale and font guidance';
  if (text.includes('font')) return 'Font family specimens';
  if (text.includes('node')) return 'Data type color coding system';
  if (text.includes('ui-palette') || text.includes('palette')) return 'Interface color palette';
  if (text.includes('dark')) return 'Dark theme color palette';
  if (text.includes('spacing') || text.includes('radius') || text.includes('radii') || text.includes('shadow')) return 'Spacing scale and border radius tokens';
  if (text.includes('favicon')) return 'Brand app icon and favicon';
  if (text.includes('logo') || text.includes('brand')) return 'Brand logo marks';
  if (titleText.includes('interface') || titleText.includes('ui')) return 'Interface and component patterns';
  switch (category) {
    case 'Type':
      return 'Typography scale and font guidance';
    case 'Colors':
      return 'Color palette and token specimens';
    case 'Spacing':
      return 'Spacing and radius system';
    case 'Brand':
      return 'Brand assets and identity usage';
    case 'Components':
      return 'Reusable product interface examples';
  }
}

function isDesignSystemUiKitEntryPage(path: string): boolean {
  return isDesignSystemUiKitFile(path) && /\.html?$/iu.test(path);
}

function designSystemManifestCardError(index: number, detail: string): Error {
  const separator = detail.startsWith('.') ? '' : ' ';
  return new Error(`Invalid _ds_manifest.json: cards[${index}]${separator}${detail}.`);
}

function optionalDesignSystemManifestString(
  record: Record<string, unknown>,
  field: (typeof DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS)[number],
  index: number,
): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw designSystemManifestCardError(index, `.${field} must be a string`);
  return value;
}

function parseDesignSystemCardManifestEntry(card: unknown, index: number): DesignSystemCardManifestEntry {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw designSystemManifestCardError(index, 'must be an object');
  }
  const record = card as Record<string, unknown>;
  if (typeof record.path !== 'string' || !record.path.trim()) {
    throw designSystemManifestCardError(index, '.path must be a non-empty string');
  }
  const entry: DesignSystemCardManifestEntry = { path: normalizeDesignSystemPath(record.path) };
  for (const field of DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS) {
    entry[field] = optionalDesignSystemManifestString(record, field, index);
  }
  return entry;
}

function parseDesignSystemCardManifest(text: string | null): DesignSystemCardManifestMap {
  if (!text) return new Map();
  let parsed: { cards?: unknown };
  try {
    parsed = JSON.parse(text) as { cards?: unknown };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid _ds_manifest.json: ${detail}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid _ds_manifest.json: expected an object with a cards array.');
  }
  if (parsed.cards !== undefined && !Array.isArray(parsed.cards)) {
    throw new Error('Invalid _ds_manifest.json: cards must be an array.');
  }
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const entries: Array<[string, DesignSystemCardManifestEntry]> = [];
  for (const [index, card] of cards.entries()) {
    const entry = parseDesignSystemCardManifestEntry(card, index);
    entries.push([entry.path, entry]);
  }
  return new Map(entries);
}

function designSystemReviewPreviewDisplay(
  section: DesignSystemProjectSection,
  previewFile: ProjectFile | null,
): DesignSystemReviewPreviewDisplay {
  if (!previewFile) return 'specimen';
  const path = normalizeDesignSystemPath(previewFile.name);
  if (path.startsWith('ui_kits/') || path.includes('/ui_kits/')) return 'ui-kit';
  if (previewFile.kind !== 'html') return 'asset';
  if (section.category === 'Components' && !path.startsWith('preview/')) return 'ui-kit';
  return 'specimen';
}

function designSystemRelatedFilesForCategory(
  artifactName: string,
  category: DesignSystemReviewCategory,
  names: string[],
): string[] {
  const related = names.filter((name) => {
    if (name === artifactName || isDesignSystemEvidenceFile(name)) return false;
    switch (category) {
      case 'Type':
      case 'Colors':
      case 'Spacing':
        return isDesignSystemTokenFile(name);
      case 'Components':
        return isDesignSystemUiKitFile(name);
      case 'Brand':
        return isDesignSystemAssetFile(name);
    }
  });
  return Array.from(new Set([artifactName, ...related])).slice(0, 12);
}

function designSystemFallbackReviewSections(names: string[]): DesignSystemProjectSection[] {
  const tokenFiles = names.filter(isDesignSystemTokenFile).slice(0, 8);
  const uiKitFiles = names.filter(isDesignSystemUiKitFile).slice(0, 8);
  const assetFiles = names.filter(isDesignSystemAssetFile).slice(0, 8);
  const sections: Array<DesignSystemProjectSection | null> = [
    tokenFiles.length > 0
      ? {
        title: 'colors-and-type',
        subtitle: 'Color, type, spacing, and token guidance',
        category: 'Colors',
        files: tokenFiles,
      }
      : null,
    uiKitFiles.length > 0
      ? {
        title: 'components',
        subtitle: 'Reusable interface examples',
        category: 'Components',
        files: uiKitFiles,
      }
      : null,
    assetFiles.length > 0
      ? {
        title: 'assets',
        subtitle: 'Brand logos, fonts, and uploaded assets',
        category: 'Brand',
        files: assetFiles,
      }
      : null,
  ];
  return sections.filter((section): section is DesignSystemProjectSection => section !== null);
}

function designSystemReviewGroups(
  reviews: DesignSystemProjectSectionReview[],
): Array<{ title: DesignSystemReviewCategory; items: DesignSystemProjectSectionReview[] }> {
  const categories: DesignSystemReviewCategory[] = ['Type', 'Colors', 'Spacing', 'Components', 'Brand'];
  return categories
    .map((title) => ({
      title,
      items: reviews.filter((review) => review.section.category === title),
    }))
    .filter((group) => group.items.length > 0);
}

function designSystemReviewCategoryRank(category: DesignSystemReviewCategory): number {
  return ['Type', 'Colors', 'Spacing', 'Components', 'Brand'].indexOf(category);
}

function designSystemReviewNeedsAttention(review: DesignSystemProjectSectionReview): boolean {
  return review.sectionStatus === 'needs-review'
    || review.sectionStatus === 'needs-work'
    || review.sectionStatus === 'updated'
    || review.sectionStatus === 'running'
    || review.sectionStatus === 'planned'
    || review.sectionStatus === 'missing';
}

function isDesignSystemEvidenceFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  return path.startsWith('context/') || path.includes('/context/');
}

function isDesignSystemGuidanceFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (path.includes('/')) return false;
  return DESIGN_SYSTEM_GUIDANCE_FILES.has(path);
}

function designSystemGuidanceSort(first: string, second: string): number {
  const order = ['design.md', 'readme.md', 'readme-print.md', 'skill.md'];
  const firstRank = order.indexOf(normalizeDesignSystemPath(first));
  const secondRank = order.indexOf(normalizeDesignSystemPath(second));
  return (firstRank === -1 ? order.length : firstRank)
    - (secondRank === -1 ? order.length : secondRank)
    || first.localeCompare(second);
}

function isDesignSystemTokenFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  if (
    path.startsWith('preview/')
    || path.startsWith('ui_kits/')
    || path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/preview/')
    || path.includes('/ui_kits/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path)
  ) {
    return false;
  }
  const basename = designSystemBasename(path);
  if (basename.endsWith('.html')) return false;
  return basename === 'colors_and_type.css'
    || basename === 'tailwind.config.ts'
    || basename === 'tailwind.config.js'
    || basename === 'tailwind.config.mjs'
    || basename === 'theme.css'
    || basename === 'tokens.css'
    || basename === 'variables.css'
    || basename === 'design-tokens.json'
    || path.includes('/tokens/')
    || path.startsWith('src/tokens/')
    || path.startsWith('src/styles/')
    || path.startsWith('styles/')
    || /\b(color|colors|palette|typography|spacing|radius|theme|token)s?\b/u.test(path);
}

function isDesignSystemPreviewFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path) || path.startsWith('ui_kits/')) return false;
  const basename = designSystemBasename(path);
  return path.startsWith('preview/')
    || (path.split('/').length === 1 && basename.endsWith('.html'))
    || (basename.endsWith('.html') && /\b(index|overview|preview|showcase|styleguide)\b/u.test(path));
}

function isDesignSystemUiKitFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  if (isDesignSystemRawAssetFile(path)) return false;
  return path.startsWith('ui_kits/')
    || path.startsWith('src/components/')
    || path.startsWith('components/')
    || path.includes('/ui_kits/')
    || path.includes('/src/components/')
    || /\b(component|components|interface|ui-kit|uikit)\b/u.test(path);
}

function isDesignSystemAssetFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  return path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || path.includes('/fonts/')
    || path.includes('/icons/')
    || path.includes('/logos/')
    || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path);
}

function designSystemGenerationReviewHasStarted(
  sectionReviews: DesignSystemProjectSectionReview[],
): boolean {
  return sectionReviews.some((review) => {
    const { previewFile, section, sectionActivity } = review;
    if (previewFile) return true;
    if (section.files.length > 0 && sectionActivity.phase !== 'idle') return true;
    return sectionActivity.phase === 'writing'
      || sectionActivity.phase === 'updated'
      || sectionActivity.phase === 'planned';
  });
}

function designSystemSectionVisibleDuringGeneration(
  review: DesignSystemProjectSectionReview,
): boolean {
  const { section, reviewEntry, sectionActivity, previewFile } = review;
  if (reviewEntry) return true;
  if (previewFile) return true;
  if (sectionActivity.phase !== 'idle') return true;
  return section.files.length > 0;
}

function designSystemSectionStatus(
  section: DesignSystemProjectSection,
  decision: DesignSystemReviewDecision | undefined,
  changedAfterFeedback: boolean,
  activity: DesignSystemSectionActivity,
): DesignSystemSectionStatus {
  if (activity.running) return 'running';
  if (activity.phase === 'planned') return 'planned';
  if (changedAfterFeedback || activity.mutated) return 'updated';
  if (section.files.length === 0) return 'missing';
  if (decision === 'looks-good') return 'approved';
  if (decision === 'needs-work') return 'needs-work';
  return 'needs-review';
}

function designSystemSectionStatusLabel(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  status: DesignSystemSectionStatus,
  activity: DesignSystemSectionActivity,
): string {
  switch (status) {
    case 'running':
      return designSystemSectionPhaseLabel(t, section, activity);
    case 'planned':
      return t('ds.sectionQueued');
    case 'updated':
      return t('ds.sectionReviewUpdatedFiles');
    case 'approved':
      return t('ds.reviewLooksGood');
    case 'needs-work':
      return t('ds.reviewNeedsWork');
    case 'needs-review':
      return t('ds.reviewNeedsReview');
    case 'missing':
      return section.requiredFile
        ? t('ds.sectionRequiredFileMissing', { file: section.requiredFile })
        : t('ds.sectionNoFilesYet');
  }
}

function designSystemSectionStatusClass(status: DesignSystemSectionStatus): string {
  switch (status) {
    case 'running':
      return 'is-running';
    case 'planned':
      return 'is-planned';
    case 'updated':
      return 'is-review';
    case 'approved':
      return 'is-approved';
    case 'needs-work':
      return 'is-work';
    case 'needs-review':
      return 'is-ready';
    case 'missing':
      return 'is-missing';
  }
}

function designSystemInitialGenerationSteps({
  files,
  sectionReviews,
  system,
  t,
}: {
  files: ProjectFile[];
  sectionReviews: DesignSystemProjectSectionReview[];
  system: DesignSystemSummary;
  t: TranslateFn;
}): DesignSystemGenerationStep[] {
  const hasSourceContext =
    designSystemGithubEvidenceState(system, files.map((file) => file.name)).ready
    && (
      files.some((file) => normalizeDesignSystemPath(file.name).startsWith('context/')) ||
      designSystemHasSourceContext(system)
    );
  const fileNames = files.map((file) => file.name);
  const categoryHasReview = (category: DesignSystemReviewCategory) =>
    sectionReviews.some((review) => review.section.category === category);
  const categoryIsRunning = (category: DesignSystemReviewCategory) =>
    sectionReviews.some((review) => review.section.category === category && review.sectionActivity.running);
  const guidanceRunning = sectionReviews.some((review) =>
    review.sectionActivity.running
    && review.section.files.some((name) => isDesignSystemGuidanceFile(name)),
  );
  const steps: DesignSystemGenerationStep[] = [
    {
      id: 'source-context',
      title: t('ds.generationSourceTitle'),
      detail: t('ds.generationSourceDetail'),
      status: hasSourceContext ? 'succeeded' : 'running',
    },
    {
      id: 'guidance',
      title: t('ds.generationGuidanceTitle'),
      detail: t('ds.generationGuidanceDetail'),
      status: fileNames.some(isDesignSystemGuidanceFile)
        ? 'succeeded'
        : guidanceRunning
          ? 'running'
          : 'pending',
    },
    {
      id: 'tokens',
      title: t('ds.generationTokensTitle'),
      detail: t('ds.generationTokensDetail'),
      status: fileNames.some(isDesignSystemTokenFile)
        ? 'succeeded'
        : (categoryIsRunning('Type') || categoryIsRunning('Colors') || categoryIsRunning('Spacing'))
          ? 'running'
          : 'pending',
    },
    {
      id: 'previews',
      title: t('ds.generationPreviewsTitle'),
      detail: t('ds.generationPreviewsDetail'),
      status: sectionReviews.some((review) => review.previewFile)
        ? 'succeeded'
        : (categoryIsRunning('Type') || categoryIsRunning('Colors') || categoryIsRunning('Spacing') || categoryIsRunning('Brand'))
          ? 'running'
          : 'pending',
    },
    {
      id: 'ui-kit',
      title: t('ds.generationUiKitTitle'),
      detail: t('ds.generationUiKitDetail'),
      status: categoryHasReview('Components') || fileNames.some(isDesignSystemUiKitFile)
        ? 'succeeded'
        : categoryIsRunning('Components')
          ? 'running'
          : 'pending',
    },
    {
      id: 'assets',
      title: t('ds.generationAssetsTitle'),
      detail: t('ds.generationAssetsDetail'),
      status: categoryHasReview('Brand') || fileNames.some(isDesignSystemAssetFile)
        ? 'succeeded'
        : categoryIsRunning('Brand')
          ? 'running'
          : 'pending',
    },
  ];
  if (!steps.some((step) => step.status === 'running')) {
    const firstPending = steps.find((step) => step.status === 'pending');
    if (firstPending) firstPending.status = 'running';
  }
  return steps;
}

function designSystemGenerationProgress(steps: DesignSystemGenerationStep[]): number {
  if (steps.length === 0) return 8;
  const succeeded = steps.filter((step) => step.status === 'succeeded').length;
  const running = steps.some((step) => step.status === 'running') ? 0.45 : 0;
  return Math.max(8, Math.min(92, Math.round(((succeeded + running) / steps.length) * 100)));
}

function designSystemSectionActivity(
  section: DesignSystemProjectSection,
  fileOps: FileOpEntry[],
  todos: TodoItem[],
): DesignSystemSectionActivity {
  const touched = fileOps.filter((entry) => designSystemFileOpBelongsToSection(entry, section));
  const touchedFiles = Array.from(new Set(touched.map((entry) => entry.path)));
  const todo = designSystemSectionTodo(section, todos);
  const hasRunningMutation = touched.some((entry) =>
    entry.status === 'running' && (entry.ops.includes('write') || entry.ops.includes('edit')),
  );
  const hasRunningRead = touched.some((entry) =>
    entry.status === 'running' && entry.ops.includes('read'),
  );
  const mutated = touched.some((entry) =>
    entry.status === 'done' && (entry.ops.includes('write') || entry.ops.includes('edit')),
  );
  const errored = touched.some((entry) => entry.status === 'error');
  const todoPhase = todo ? designSystemTodoActivityPhase(section, todo) : null;
  const hasRunningTodo = todo?.status === 'in_progress';
  const phase: DesignSystemSectionActivityPhase =
    errored
      ? 'error'
      : hasRunningMutation
        ? 'writing'
        : hasRunningRead
          ? 'reading'
          : hasRunningTodo && todoPhase
            ? todoPhase
            : mutated
              ? 'updated'
              : todoPhase
                ? todoPhase
                : 'idle';
  return {
    running: hasRunningMutation || hasRunningRead || hasRunningTodo,
    mutated,
    errored,
    phase,
    touchedFiles,
    todoText: todo?.content,
    todoStatus: todo?.status,
  };
}

function designSystemSectionTodo(
  section: DesignSystemProjectSection,
  todos: TodoItem[],
): TodoItem | undefined {
  return todos
    .filter((todo) => todo.status !== 'completed')
    .filter((todo) => designSystemTodoBelongsToSection(todo, section))
    .sort((first, second) => designSystemTodoRank(first) - designSystemTodoRank(second))[0];
}

function designSystemTodoRank(todo: TodoItem): number {
  if (todo.status === 'in_progress') return 0;
  if (todo.status === 'pending') return 1;
  return 2;
}

function designSystemTodoActivityPhase(
  section: DesignSystemProjectSection,
  todo: TodoItem,
): DesignSystemSectionActivityPhase {
  if (todo.status === 'pending') return 'planned';
  const text = designSystemTodoSearchText(todo);
  const isMutation = [
    'build',
    'copy',
    'create',
    'edit',
    'generate',
    'import',
    'register',
    'update',
    'write',
  ].some((keyword) => text.includes(keyword));
  if (isMutation) return 'writing';
  const isReading = [
    'analy',
    'browse',
    'explore',
    'fetch',
    'github',
    'inspect',
    'read',
    'repo',
    'search',
  ].some((keyword) => text.includes(keyword));
  if (isReading) return 'reading';
  return section.title === 'Preview' || section.title === 'UI kit' ? 'writing' : 'reading';
}

function designSystemTodoBelongsToSection(
  todo: TodoItem,
  section: DesignSystemProjectSection,
): boolean {
  const text = designSystemTodoSearchText(todo);
  if (section.files.some((name) => text.includes(designSystemReviewTitleFromPath(name)))) {
    return true;
  }
  switch (section.category) {
    case 'Type':
      return [
        'font',
        'type',
        'typography',
      ].some((keyword) => text.includes(keyword));
    case 'Colors':
      return [
        'color',
        'colors_and_type',
        'css variable',
        'palette',
        'theme',
        'token',
      ].some((keyword) => text.includes(keyword));
    case 'Spacing':
      return [
        'radius',
        'spacing',
        'space',
      ].some((keyword) => text.includes(keyword));
    case 'Components':
      return [
        'component',
        'interface',
        'prototype',
        'react',
        'ui kit',
        'ui_kit',
        'ui_kits',
      ].some((keyword) => text.includes(keyword));
    case 'Brand':
      return [
        'font',
        'icon',
        'logo',
        'brand',
        'asset',
        'upload',
      ].some((keyword) => text.includes(keyword));
  }
}

function designSystemTodoSearchText(todo: TodoItem): string {
  return `${todo.content} ${todo.activeForm ?? ''}`.toLowerCase();
}

function designSystemFileOpBelongsToSection(
  entry: FileOpEntry,
  section: DesignSystemProjectSection,
): boolean {
  const candidates = [entry.fullPath, entry.path].map(normalizeDesignSystemPath);
  const sectionFiles = [...section.files, section.requiredFile]
    .filter((name): name is string => Boolean(name))
    .map(normalizeDesignSystemPath);
  if (sectionFiles.some((name) => candidates.some((candidate) =>
    candidate === name || candidate.endsWith(`/${name}`),
  ))) {
    return true;
  }
  return candidates.some((path) => designSystemPathMatchesSection(path, section.category));
}

function designSystemPathMatchesSection(path: string, sectionTitle: string): boolean {
  const basename = designSystemBasename(path);
  switch (sectionTitle) {
    case 'Type':
      return !isDesignSystemEvidenceFile(path)
        && (isDesignSystemTokenFile(path) || DESIGN_SYSTEM_GUIDANCE_FILES.has(basename))
        && /\b(type|typography|font|text)\b/u.test(path);
    case 'Colors':
      return isDesignSystemTokenFile(path)
        && /\b(color|colors|palette|theme|token)\b/u.test(path);
    case 'Spacing':
      return isDesignSystemTokenFile(path)
        && /\b(space|spacing|radius)\b/u.test(path);
    case 'Components':
      return isDesignSystemUiKitFile(path);
    case 'Brand':
      return isDesignSystemAssetFile(path);
    default:
      return false;
  }
}

function normalizeDesignSystemPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function designSystemBasename(path: string): string {
  const segments = normalizeDesignSystemPath(path).split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalizeDesignSystemPath(path);
}

function designSystemSectionPhaseLabel(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.phase === 'planned') {
    switch (section.category) {
      case 'Type':
        return t('ds.phaseQueuedTypography');
      case 'Colors':
        return t('ds.phaseQueuedTokens');
      case 'Spacing':
        return t('ds.phaseQueuedSpacing');
      case 'Components':
        return t('ds.phaseQueuedUiKit');
      case 'Brand':
        return t('ds.phaseQueuedAssets');
    }
  }
  if (activity.phase === 'reading') {
    switch (section.category) {
      case 'Type':
        return t('ds.phaseReadingTypography');
      case 'Colors':
        return t('ds.phaseReadingTokens');
      case 'Spacing':
        return t('ds.phaseReadingSpacing');
      case 'Components':
        return t('ds.phaseReadingUiKit');
      case 'Brand':
        return t('ds.phaseReadingAssets');
    }
  }
  if (activity.phase === 'writing') {
    switch (section.category) {
      case 'Type':
        return t('ds.phaseWritingTypography');
      case 'Colors':
        return t('ds.phaseWritingTokens');
      case 'Spacing':
        return t('ds.phaseWritingSpacing');
      case 'Components':
        return t('ds.phaseBuildingUiKit');
      case 'Brand':
        return t('ds.phaseUpdatingAssets');
    }
  }
  if (activity.phase === 'error') return t('ds.phaseNeedsAttention');
  if (activity.phase === 'updated') return t('ds.phaseUpdated');
  return t('ds.reviewNeedsReview');
}

function designSystemSectionActivityLabel(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.touchedFiles.length === 0) {
    const phaseLabel = designSystemSectionPhaseLabel(t, section, activity);
    return activity.todoText
      ? t('ds.sectionActivityFromTodo', {
          phase: phaseLabel,
          todo: truncateDesignSystemActivityText(activity.todoText),
        })
      : phaseLabel;
  }
  const label = activity.touchedFiles.slice(0, 3).join(', ');
  const suffix = activity.touchedFiles.length > 3 ? ` +${activity.touchedFiles.length - 3}` : '';
  const files = `${label}${suffix}`;
  if (activity.phase === 'idle') return t('ds.sectionActivityReadFiles', { files });
  return t('ds.sectionActivityPhaseFiles', {
    phase: designSystemSectionPhaseLabel(t, section, activity),
    files,
  });
}

function truncateDesignSystemActivityText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function designSystemSectionRunningNotice(
  t: TranslateFn,
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.phase === 'reading') {
    return t('ds.sectionRunningReadingContext', { title: section.title });
  }
  return t('ds.sectionRunningNow', { phase: designSystemSectionPhaseLabel(t, section, activity) });
}

function designSystemReviewTimeLabel(t: TranslateFn, value: string): string | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(time));
  return t('ds.reviewLastReviewed', { time: formatted });
}

function designSystemReviewAgentTaskLabel(t: TranslateFn, task: DesignSystemReviewAgentTask): string {
  switch (task.status) {
    case 'queued':
      return t('ds.agentFeedbackQueued');
    case 'sent':
      if (!task.sentAt) return t('ds.agentFeedbackSent');
      {
        const time = Date.parse(task.sentAt);
        if (!Number.isFinite(time)) return t('ds.agentFeedbackSent');
        const formatted = new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(time));
        return t('ds.agentFeedbackSentAt', { time: formatted });
      }
    case 'failed':
      return task.error
        ? t('ds.agentFeedbackFailedWithError', { error: task.error })
        : t('ds.agentFeedbackFailed');
  }
  return t('ds.agentFeedbackUnknown');
}

function designSystemSectionChangedAfterReview(
  names: string[],
  fileByName: Map<string, ProjectFile>,
  reviewEntry: DesignSystemReviewEntry | undefined,
): boolean {
  if (!reviewEntry || reviewEntry.decision !== 'needs-work') return false;
  const reviewedAt = Date.parse(reviewEntry.updatedAt);
  if (!Number.isFinite(reviewedAt)) return false;
  const trackedNames: string[] = reviewEntry.files && reviewEntry.files.length > 0
    ? reviewEntry.files
    : names;
  return trackedNames.some((name) => {
    const file = fileByName.get(name);
    return file ? file.mtime > reviewedAt : false;
  });
}

function DesignSystemInlinePreview({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const url = projectFileUrl(projectId, file.name);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [srcDocReady, setSrcDocReady] = useState(false);

  useEffect(() => {
    setSrcDoc(null);
    setSrcDocReady(false);
    if (file.kind !== 'html') return undefined;
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: Math.round(file.mtime),
    }).then(async (html) => {
      if (cancelled) return;
      if (!html) {
        setSrcDocReady(true);
        return;
      }
      const inlinedHtml = await inlineDesignSystemPreviewRelativeAssets(html, projectId, file.name);
      if (cancelled) return;
      setSrcDoc(buildSrcdoc(inlinedHtml, {
        baseHref: projectRawUrl(projectId, baseDirForDesignSystemPreviewFile(file.name)),
      }));
      setSrcDocReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [file.kind, file.mtime, file.name, projectId]);

  if (file.kind === 'html') {
    return (
      <iframe
        title={file.name}
        src={srcDocReady && srcDoc ? undefined : url}
        srcDoc={srcDoc ?? undefined}
        sandbox="allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox"
      />
    );
  }
  return <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />;
}

async function inlineDesignSystemPreviewRelativeAssets(
  html: string,
  projectId: string,
  ownerFileName: string,
): Promise<string> {
  const replacements: Array<Promise<{ from: string; to: string } | null>> = [];
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = readDesignSystemPreviewHtmlAttr(tag, 'rel');
    const href = readDesignSystemPreviewHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    const stylesheetPath = resolveDesignSystemPreviewRelativePath(ownerFileName, href);
    if (!stylesheetPath) continue;
    replacements.push(fetchProjectFileText(projectId, stylesheetPath, { cache: 'no-store' }).then((css) => {
      if (css == null) return null;
      const safeCss = rewriteDesignSystemPreviewCssUrls(css, projectId, stylesheetPath)
        .replace(/<\/style/gi, '<\\/style');
      return {
        from: tag,
        to: [
          `<style data-od-inline-asset="${escapeDesignSystemPreviewAttr(href)}">`,
          safeCss,
          '</style>',
        ].join('\n'),
      };
    }));
  }

  const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scripts) {
    const src = readDesignSystemPreviewHtmlAttr(tag, 'src');
    if (!src) continue;
    replacements.push(fetchDesignSystemPreviewRelativeText(projectId, ownerFileName, src).then((js) => {
      if (js == null) return null;
      const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
      const attrs = open
        .replace(/^<script/i, '')
        .replace(/>$/i, '')
        .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
      return {
        from: tag,
        to: [
          `<script${attrs} data-od-inline-asset="${escapeDesignSystemPreviewAttr(src)}">`,
          js.replace(/<\/script/gi, '<\\/script'),
          '</script>',
        ].join('\n'),
      };
    }));
  }

  const resolved = (await Promise.all(replacements)).filter(
    (replacement): replacement is { from: string; to: string } => replacement !== null,
  );
  const withInlineAssets = resolved.reduce(
    (next, replacement) => next.replace(replacement.from, () => replacement.to),
    html,
  );
  const withInlineCssAssets = rewriteDesignSystemPreviewInlineCssAssetUrls(withInlineAssets, projectId, ownerFileName);
  return rewriteDesignSystemPreviewHtmlAssetUrls(withInlineCssAssets, projectId, ownerFileName);
}

async function fetchDesignSystemPreviewRelativeText(
  projectId: string,
  ownerFileName: string,
  assetRef: string,
): Promise<string | null> {
  const filePath = resolveDesignSystemPreviewRelativePath(ownerFileName, assetRef);
  if (!filePath) return null;
  return fetchProjectFileText(projectId, filePath, { cache: 'no-store' });
}

type DesignSystemPreviewAssetPath = {
  filePath: string;
  suffix: string;
};

function resolveDesignSystemPreviewRelativePath(ownerFileName: string, assetRef: string): string | null {
  return resolveDesignSystemPreviewAssetPath(ownerFileName, assetRef)?.filePath ?? null;
}

function resolveDesignSystemPreviewAssetPath(ownerFileName: string, assetRef: string): DesignSystemPreviewAssetPath | null {
  const ref = assetRef.trim();
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(ref)) return null;
  if (isDesignSystemPreviewAppRootRef(ref)) return null;
  try {
    const url = new URL(ref, `https://od.local/${baseDirForDesignSystemPreviewFile(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    return {
      filePath: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
      suffix: `${url.search}${url.hash}`,
    };
  } catch {
    return null;
  }
}

function isDesignSystemPreviewAppRootRef(ref: string): boolean {
  if (!ref.startsWith('/') || ref.startsWith('//')) return false;
  const pathOnly = ref.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  return pathOnly === '/api'
    || pathOnly.startsWith('/api/')
    || pathOnly === '/artifacts'
    || pathOnly.startsWith('/artifacts/')
    || pathOnly === '/frames'
    || pathOnly.startsWith('/frames/');
}

function rewriteDesignSystemPreviewCssUrls(css: string, projectId: string, stylesheetFileName: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote: string, rawRef: string) => {
    const ref = rawRef.trim();
    const assetPath = resolveDesignSystemPreviewAssetPath(stylesheetFileName, ref);
    if (!assetPath) return match;
    return `url("${escapeDesignSystemPreviewCssUrl(projectRawUrl(projectId, assetPath.filePath) + assetPath.suffix)}")`;
  });
}

function rewriteDesignSystemPreviewHtmlAssetUrls(html: string, projectId: string, ownerFileName: string): string {
  const directAssetTags = new RegExp(
    '(<(?:img|source|video|audio|track|embed|object|image|use)\\b[^>]*?\\s' +
      '(?:src|poster|data|href|xlink:href)\\s*=\\s*)([\'"])([\\s\\S]*?)\\2',
    'gi',
  );
  const withDirectAssets = html.replace(directAssetTags, (match, prefix: string, quote: string, rawRef: string) => {
    const rewritten = rewriteDesignSystemPreviewHtmlAssetRef(rawRef, projectId, ownerFileName);
    if (rewritten === rawRef) return match;
    return `${prefix}${quote}${escapeDesignSystemPreviewAttr(rewritten)}${quote}`;
  });
  const srcsetAssetTags = new RegExp(
    '(<(?:img|source)\\b[^>]*?\\ssrcset\\s*=\\s*)([\'"])([\\s\\S]*?)\\2',
    'gi',
  );
  return withDirectAssets.replace(srcsetAssetTags, (match, prefix: string, quote: string, rawSrcset: string) => {
    const rewritten = rewriteDesignSystemPreviewSrcset(rawSrcset, projectId, ownerFileName);
    if (rewritten === rawSrcset) return match;
    return `${prefix}${quote}${escapeDesignSystemPreviewAttr(rewritten)}${quote}`;
  });
}

function rewriteDesignSystemPreviewInlineCssAssetUrls(html: string, projectId: string, ownerFileName: string): string {
  const withStyleBlocks = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (
    match,
    attrs: string,
    css: string,
  ) => {
    const rewritten = rewriteDesignSystemPreviewCssUrls(css, projectId, ownerFileName);
    if (rewritten === css) return match;
    return `<style${attrs}>${rewritten}</style>`;
  });
  return withStyleBlocks.replace(/(\sstyle\s*=\s*)(['"])([\s\S]*?)\2/gi, (
    match,
    prefix: string,
    quote: string,
    css: string,
  ) => {
    const rewritten = rewriteDesignSystemPreviewCssUrls(css, projectId, ownerFileName);
    if (rewritten === css) return match;
    return `${prefix}${quote}${escapeDesignSystemPreviewAttr(rewritten)}${quote}`;
  });
}

function rewriteDesignSystemPreviewHtmlAssetRef(ref: string, projectId: string, ownerFileName: string): string {
  const assetPath = resolveDesignSystemPreviewAssetPath(ownerFileName, ref.trim());
  return assetPath ? projectRawUrl(projectId, assetPath.filePath) + assetPath.suffix : ref;
}

function rewriteDesignSystemPreviewSrcset(srcset: string, projectId: string, ownerFileName: string): string {
  if (/\bdata:/i.test(srcset)) return srcset;
  return srcset
    .split(',')
    .map((candidate) => {
      const match = candidate.trim().match(/^(\S+)(\s+.+)?$/);
      if (!match) return candidate;
      const rewritten = rewriteDesignSystemPreviewHtmlAssetRef(match[1] ?? '', projectId, ownerFileName);
      return `${rewritten}${match[2] ?? ''}`;
    })
    .join(', ');
}

function baseDirForDesignSystemPreviewFile(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(0, index + 1) : '';
}

function readDesignSystemPreviewHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function escapeDesignSystemPreviewAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeDesignSystemPreviewCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
}

function Tab({
  label,
  meta,
  title,
  active,
  onActivate,
  onClose,
  closable = true,
  kind,
  iconNameOverride,
  liveArtifact,
  draggable = false,
  dragging = false,
  dragOverEdge,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  label: string;
  meta?: string;
  title?: string;
  active: boolean;
  onActivate: () => void;
  onClose?: () => void;
  closable?: boolean;
  kind?: ProjectFile['kind'] | 'live-artifact' | 'browser';
  /** Force a specific icon (e.g. non-file tabs like terminal:<id> / chat:<id>). */
  iconNameOverride?: IconName;
  liveArtifact?: LiveArtifactWorkspaceEntry;
  draggable?: boolean;
  dragging?: boolean;
  dragOverEdge?: TabDropEdge | null;
  onDragStart?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const t = useT();
  const iconName = iconNameOverride ?? kindIconName(kind);
  const tabTitle = title ?? (meta ? `${label} ${meta}` : label);
  return (
    <div
      className={[
        'ws-tab',
        'od-tooltip',
        meta ? 'has-meta' : '',
        kind === 'live-artifact' ? 'live-artifact-tab' : '',
        kind === 'browser' ? 'browser-tab' : '',
        active ? 'active' : '',
        draggable ? 'draggable' : '',
        dragging ? 'dragging' : '',
        dragOverEdge ? `drag-over-${dragOverEdge}` : '',
      ].filter(Boolean).join(' ')}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={tabTitle}
      data-tooltip={tabTitle}
      data-tooltip-placement="bottom"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDragLeave={draggable ? onDragLeave : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      {iconName ? (
        <span className="tab-icon" aria-hidden>
          <Icon name={iconName} size={13} />
        </span>
      ) : null}
      <span className="ws-tab-text">
        <span className="ws-tab-label">{label}</span>
        {meta ? <span className="ws-tab-meta">{meta}</span> : null}
      </span>
      {liveArtifact ? (
        <LiveArtifactBadges
          compact
          className="ws-live-artifact-badges"
          status={liveArtifact.status}
          refreshStatus={liveArtifact.refreshStatus}
        />
      ) : null}
      {closable && onClose ? (
        <button
          type="button"
          className="ws-tab-close od-tooltip"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title={t('workspace.closeTab')}
          data-tooltip={t('workspace.closeTab')}
          data-tooltip-placement="bottom"
          aria-label={t('workspace.closeTab')}
        >
          <Icon name="close" size={11} />
        </button>
      ) : null}
    </div>
  );
}

function tabDropEdgeFromEvent(event: ReactDragEvent<HTMLDivElement>): TabDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function scrollWorkspaceTabsWithWheel(
  tabBar: Pick<HTMLDivElement, 'clientWidth' | 'scrollLeft' | 'scrollWidth'>,
  event: Pick<globalThis.WheelEvent, 'ctrlKey' | 'deltaMode' | 'deltaX' | 'deltaY' | 'preventDefault'>,
) {
  if (event.ctrlKey) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (tabBar.scrollWidth <= tabBar.clientWidth) return;

  const before = tabBar.scrollLeft;
  tabBar.scrollLeft += wheelDeltaToPixels(event.deltaY, event.deltaMode);
  if (tabBar.scrollLeft === before) return;

  event.preventDefault();
}

function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  const WHEEL_DELTA_LINE = 1;
  const WHEEL_DELTA_PAGE = 2;

  if (deltaMode === WHEEL_DELTA_LINE) return delta * 16;
  if (deltaMode === WHEEL_DELTA_PAGE) return delta * 160;
  return delta;
}

function kindIconName(
  kind?: string,
):
  | 'file-code'
  | 'globe'
  | 'image'
  | 'pencil'
  | 'file'
  | null {
  if (kind === 'browser') return 'globe';
  if (kind === 'live-artifact') return 'file-code';
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  if (kind === 'text') return 'file';
  return 'file';
}

function isBrowserTabId(tabId: string): boolean {
  return tabId.startsWith(BROWSER_TAB_PREFIX);
}

function browserTabsFromState(value: OpenTabsState['browserTabs']): BrowserWorkspaceTab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tabs: BrowserWorkspaceTab[] = [];
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    if (!item.id.startsWith(BROWSER_TAB_PREFIX)) continue;
    const label = item.label?.trim() || 'Browser';
    const tab: BrowserWorkspaceTab = {
      id: item.id,
      label,
    };
    if (item.insertAfter === null) tab.insertAfter = null;
    else if (typeof item.insertAfter === 'string') tab.insertAfter = item.insertAfter;
    if (item.title?.trim()) tab.title = item.title.trim();
    if (item.url?.trim()) tab.url = item.url.trim();
    if (item.iconUrl?.trim()) tab.iconUrl = item.iconUrl.trim();
    seen.add(item.id);
    tabs.push(tab);
  }
  return tabs;
}

function maxBrowserTabSequence(tabs: BrowserWorkspaceTab[]): number {
  let max = 0;
  for (const tab of tabs) {
    const suffix = tab.id.slice(BROWSER_TAB_PREFIX.length);
    const value = Number.parseInt(suffix, 10);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return max;
}

function lastWorkspaceTabId(tabs: WorkspaceOrderedTab[]): string | null {
  return tabs[tabs.length - 1]?.id ?? null;
}

function reanchorBrowserTabsToCurrentOrder(
  orderedTabs: WorkspaceOrderedTab[],
  browserTabs: BrowserWorkspaceTab[],
): BrowserWorkspaceTab[] {
  if (browserTabs.length === 0) return browserTabs;
  const anchorByBrowserId = new Map<string, string | null>();
  let previousId: string | null = DESIGN_FILES_TAB;
  for (const entry of orderedTabs) {
    if (entry.kind === 'browser') {
      anchorByBrowserId.set(entry.browserTab.id, previousId);
      previousId = entry.browserTab.id;
    } else {
      previousId = entry.name;
    }
  }

  let changed = false;
  const nextTabs = browserTabs.map((tab) => {
    if (!anchorByBrowserId.has(tab.id)) return tab;
    const nextInsertAfter = anchorByBrowserId.get(tab.id) ?? null;
    const currentInsertAfter = tab.insertAfter ?? null;
    if (currentInsertAfter === nextInsertAfter) return tab;
    changed = true;
    return { ...tab, insertAfter: nextInsertAfter };
  });
  return changed ? nextTabs : browserTabs;
}

function orderWorkspaceTabs(
  fileTabNames: string[],
  browserTabs: BrowserWorkspaceTab[],
): WorkspaceOrderedTab[] {
  const ordered: WorkspaceOrderedTab[] = fileTabNames.map((name) => ({
    id: name,
    kind: 'file',
    name,
  }));
  let rootAnchorInsertIndex = 0;

  for (const browserTab of browserTabs) {
    const entry: WorkspaceOrderedTab = {
      id: browserTab.id,
      kind: 'browser',
      browserTab,
    };
    const anchor = browserTab.insertAfter;
    if (!anchor || anchor === DESIGN_FILES_TAB || anchor === DESIGN_SYSTEM_TAB) {
      ordered.splice(rootAnchorInsertIndex, 0, entry);
      rootAnchorInsertIndex += 1;
      continue;
    }
    const anchorIndex = ordered.findIndex((candidate) => candidate.id === anchor);
    if (anchorIndex === -1) {
      ordered.push(entry);
      continue;
    }
    ordered.splice(anchorIndex + 1, 0, entry);
  }

  return ordered;
}

function isSketchName(name: string): boolean {
  return isSketchJsonFileName(name);
}

function sameFileName(a: string, b: string): boolean {
  return a === b || a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function isLiveArtifactImplementationPath(name: string): boolean {
  if (name === '.live-artifacts') return true;
  if (!name.startsWith('.live-artifacts/')) return false;
  // Live artifacts are exposed through virtual tree nodes only. In
  // particular, keep implementation-only snapshot and tile files hidden even
  // if a generic project-files endpoint returns them in older daemon builds.
  return true;
}
