import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import { resolveHtmlPointerArtifactTarget } from '../artifacts/pointer';
import { validateHtmlArtifact } from '../artifacts/validate';
import { createArtifactParser } from '../artifacts/parser';
import { useI18n } from '../i18n';
import { streamMessage } from '../providers/anthropic';
import {
  fetchChatRunStatus,
  fetchVelaLoginStatus,
  listActiveChatRuns,
  listProjectRuns,
  reattachDaemonRun,
  reportChatRunFeedback,
  streamViaDaemon,
} from '../providers/daemon';
import { fetchElevenLabsVoiceOptions } from '../providers/elevenlabs-voices';
import { normalizeCustomReason } from '@open-design/contracts/analytics';
import {
  deletePreviewComment,
  fetchConnectorStatuses,
  fetchPreviewComments,
  fetchDesignSystem,
  fetchDesignTemplate,
  fetchProjectDesignSystemPackageAudit,
  fetchLiveArtifacts,
  fetchProjectFiles,
  fetchSkill,
  patchPreviewCommentStatus,
  projectRawUrl,
  upsertPreviewComment,
  writeProjectTextFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { useCoalescedCallback } from '../hooks/useCoalescedCallback';
import {
  composeSystemPrompt,
  type AudioVoiceOption,
  type MemorySystemPromptResponse,
  type ResearchOptions,
} from '@open-design/contracts';
import { projectKindToTracking } from '@open-design/contracts/analytics';
import type {
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemApplyResult,
  trackPageView,
} from '../analytics/events';
import {
  clearOnboardingSessionId,
  peekOnboardingSessionId,
} from '../analytics/onboarding-session';
import { navigate } from '../router';
import { agentDisplayName, agentModelDisplayName } from '../utils/agentLabels';
import { isMacPlatform } from '../utils/platform';
import {
  canAutoRenameProjectFromPrompt,
  summarizeProjectNameFromPrompt,
} from '../utils/projectName';
import {
  apiProtocolAgentId,
  apiProtocolModelLabel,
  usesAnthropicProxy,
} from '../utils/apiProtocol';
import { playSound, showCompletionNotification } from '../utils/notifications';
import { randomUUID } from '../utils/uuid';
import { DEFAULT_NOTIFICATIONS } from '../state/config';
import type { TodoItem } from '../runtime/todos';
import { appendErrorStatusEvent } from '../runtime/chat-events';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../runtime/design-system-package-audit';
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchAppliedPluginSnapshot,
  getTemplate,
  installGeneratedPluginFolder,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  saveMessage,
  startGeneratedPluginShareTask,
  saveTabs,
  type SaveMessageOptions,
  waitGeneratedPluginShareTask,
} from '../state/projects';
import type { AppliedPluginSnapshot } from '@open-design/contracts';
import type {
  AgentEvent,
  AgentInfo,
  AppConfig,
  Artifact,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  ChatMessageFeedbackChange,
  Conversation,
  DesignSystemSummary,
  OpenTabsState,
  Project,
  ProjectMetadata,
  PreviewComment,
  PreviewCommentTarget,
  ProjectFile,
  ProjectTemplate,
  LiveArtifactEventItem,
  LiveArtifactSummary,
  SkillSummary,
} from '../types';
import { historyWithApiAttachmentContext } from '../api-attachment-context';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  mergeAttachedComments,
  removeAttachedComment,
} from '../comments';
import { filterImplicitProducedFiles } from '../produced-files';
import { buildPptxExportPrompt } from '../lib/build-pptx-export-prompt';
import { AvatarMenu } from './AvatarMenu';
import { HandoffButton } from './HandoffButton';
import { ProjectDesignSystemPicker } from './ProjectDesignSystemPicker';
import { ChatPane } from './ChatPane';
import type { ChatSendMeta } from './ChatComposer';
import {
  CritiqueTheaterMount,
  useCritiqueTheaterEnabled,
} from './Theater';
import { useIframeKeepAlivePool } from './IframeKeepAlivePool';
import { decideAutoOpenAfterWrite } from './auto-open-file';
import { buildRepoImportPrompt, designSystemNeedsRepoConnect } from './design-system-github-evidence';
import { collectReferencedJsxNames } from '../runtime/jsx-module-refs';
import { FileWorkspace } from './FileWorkspace';
import {
  type PluginFolderAgentAction,
} from './design-files/pluginFolderActions';
import { CenteredLoader } from './Loading';
import type { SettingsSection } from './SettingsDialog';
import { Toast } from './Toast';
import { useDesignMdState } from '../hooks/useDesignMdState';
import { useFinalizeProject } from '../hooks/useFinalizeProject';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { useTerminalLaunch } from '../hooks/useTerminalLaunch';
import { buildContinueInCliToast } from '../lib/build-continue-in-cli-toast';
import { buildClipboardPrompt } from '../lib/build-clipboard-prompt';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { effectiveMaxTokens } from '../state/maxTokens';
import { effectiveAgentModelChoice } from './agentModelSelection';
import { mediaExecutionPolicyForProjectMetadata } from '../media/execution-policy';
import {
  buildFinalizeCredentialsMissingToast,
  buildFinalizeRequest,
} from '../lib/resolve-finalize-request';


type ProjectChatSendMeta = ChatSendMeta & {
  retryOfAssistantId?: string;
};

interface Props {
  project: Project;
  routeFileName: string | null;
  /**
   * Routed conversation id. When set (the URL is
   * `/projects/:id/conversations/:cid[/...]`), the project view picks
   * this conversation as active instead of defaulting to `list[0]`.
   * Falls through to the default picker if the conversation does not
   * exist (e.g. the run was deleted between the route landing and the
   * conversation list loading). Issue #1505. Optional so existing
   * test harnesses that mount ProjectView with a stub props bag do
   * not have to be updated; production callers in `App.tsx` always
   * pass the value from `useRoute()`.
   */
  routeConversationId?: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  // Mentionable functional skills — already filtered by config.disabledSkills
  // upstream, so this drives only the chat composer's @-picker scope. For
  // resolving an existing project's `skillId` (which can also point at a
  // design template after the skills/design-templates split) use
  // `designTemplates` as a fallback in composedSystemPrompt() and in the
  // skill-name / skill-mode lookups below.
  skills: SkillSummary[];
  // All known design templates (unfiltered). Required so projects created
  // from the Templates surface keep composing the template body in API
  // mode even when the user later disables the template in Settings.
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  daemonLive: boolean;
  onModeChange: (mode: AppConfig['mode']) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onRefreshAgents: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenAmrSettings?: () => void;
  onOpenMcpSettings?: () => void;
  // Pet wiring forwarded to the chat composer so users can adopt /
  // wake / tuck a pet without leaving the project view.
  onAdoptPetInline?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  onBack: () => void;
  onClearPendingPrompt: () => void;
  onTouchProject: () => void;
  onProjectChange: (next: Project) => void;
  onProjectsRefresh: () => void;
  onChangeDefaultDesignSystem?: (designSystemId: string | null) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
}

interface QueuedChatSend {
  id: string;
  conversationId: string;
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ProjectChatSendMeta;
  createdAt: number;
}

let liveArtifactEventSequence = 0;
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';
const DEFAULT_CHAT_PANEL_WIDTH = 460;
const MIN_CHAT_PANEL_WIDTH = 345;
const MAX_CHAT_PANEL_WIDTH = 720;
const MIN_WORKSPACE_PANEL_WIDTH = 400;
const SPLIT_RESIZE_HANDLE_WIDTH = 8;
const CHAT_PANEL_KEYBOARD_STEP = 16;
const DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS = 2;
const MIN_NORMAL_SPLIT_WIDTH =
  MIN_CHAT_PANEL_WIDTH + SPLIT_RESIZE_HANDLE_WIDTH + MIN_WORKSPACE_PANEL_WIDTH;
type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];
type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;
interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}

function workspacePanelMinWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MIN_WORKSPACE_PANEL_WIDTH;
  return splitWidth < MIN_NORMAL_SPLIT_WIDTH ? 0 : MIN_WORKSPACE_PANEL_WIDTH;
}

function maxChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MAX_CHAT_PANEL_WIDTH;
  const workspaceMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const viewportAwareMax = splitWidth - SPLIT_RESIZE_HANDLE_WIDTH - workspaceMinWidth;
  return Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(viewportAwareMax)));
}

function clampPreferredChatPanelWidth(width: number): number {
  return Math.min(MAX_CHAT_PANEL_WIDTH, Math.max(MIN_CHAT_PANEL_WIDTH, Math.round(width)));
}

function clampChatPanelWidth(width: number, maxWidth = MAX_CHAT_PANEL_WIDTH): number {
  const effectiveMax = Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(maxWidth)));
  const effectiveMin = Math.min(MIN_CHAT_PANEL_WIDTH, effectiveMax);
  return Math.min(effectiveMax, Math.max(effectiveMin, Math.round(width)));
}

function designSystemFeedbackAttachments(
  projectFiles: ProjectFile[],
  sectionFiles: string[],
): ChatAttachment[] {
  const fileLookup = new Map(projectFiles.map((file) => [file.name, file]));
  return sectionFiles
    .map((name) => fileLookup.get(name))
    .filter((file): file is ProjectFile => Boolean(file))
    .slice(0, 8)
    .map((file) => ({
      path: file.name,
      name: file.name,
      kind: file.kind === 'image' ? 'image' : 'file',
      size: file.size,
    }));
}

function designSystemNeedsWorkPrompt(
  sectionTitle: string,
  feedback: string,
  sectionFiles: string[],
): string {
  const fileList =
    sectionFiles.length > 0
      ? sectionFiles.map((name) => `- @${name}`).join('\n')
      : '- No generated files are registered for this section yet.';
  return (
    `Needs work on the design system section "${sectionTitle}".\n\n` +
    `User feedback:\n${feedback}\n\n` +
    `Relevant section files:\n${fileList}\n\n` +
    'Revise the design-system project files directly. Keep DESIGN.md, tokens, previews, UI kit examples, and assets consistent with the feedback. ' +
    'After editing, summarize what changed and which files should be reviewed again.'
  );
}

function readSavedChatPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_PANEL_WIDTH;
  try {
    const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed)
      ? clampPreferredChatPanelWidth(parsed)
      : DEFAULT_CHAT_PANEL_WIDTH;
  } catch {
    return DEFAULT_CHAT_PANEL_WIDTH;
  }
}

function saveChatPanelWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CHAT_PANEL_WIDTH_STORAGE_KEY,
      String(clampPreferredChatPanelWidth(width)),
    );
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

function autoSendFirstMessageKey(projectId: string): string {
  return `od:auto-send-first:${projectId}`;
}

function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
}

function designSystemAuditAutoRepairKey(projectId: string): string {
  return `od:design-system-audit-auto-repair:${projectId}`;
}

function readAutoSendAttachments(projectId: string): ChatAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(autoSendAttachmentsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredChatAttachment);
  } catch {
    return [];
  }
}

function clearAutoSendSession(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(autoSendFirstMessageKey(projectId));
    window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
  } catch {
    /* ignore */
  }
}

function markDesignSystemAuditAutoRepairEligible(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      designSystemAuditAutoRepairKey(projectId),
      String(DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS),
    );
  } catch {
    /* ignore */
  }
}

function consumeDesignSystemAuditAutoRepair(projectId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = designSystemAuditAutoRepairKey(projectId);
    const raw = window.sessionStorage.getItem(key);
    const attemptsRemaining = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(attemptsRemaining) || attemptsRemaining <= 0) {
      window.sessionStorage.removeItem(key);
      return false;
    }
    const nextAttemptsRemaining = attemptsRemaining - 1;
    if (nextAttemptsRemaining > 0) {
      window.sessionStorage.setItem(key, String(nextAttemptsRemaining));
    } else {
      window.sessionStorage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
}

function clearDesignSystemAuditAutoRepair(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(designSystemAuditAutoRepairKey(projectId));
  } catch {
    /* ignore */
  }
}

function isDesignSystemWorkspaceMetadata(metadata: ProjectMetadata | undefined): boolean {
  return metadata?.importedFrom === 'design-system';
}

function isStoredChatAttachment(value: unknown): value is ChatAttachment {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    record.path.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (record.kind === 'image' || record.kind === 'file') &&
    (record.size === undefined || typeof record.size === 'number')
  );
}

function appendLiveArtifactEventItem(
  prev: LiveArtifactEventItem[],
  event: LiveArtifactEventItem['event'],
): LiveArtifactEventItem[] {
  liveArtifactEventSequence += 1;
  const next = [...prev, { id: liveArtifactEventSequence, event }];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

export function projectSplitClassName(workspaceFocused: boolean): string {
  return workspaceFocused ? 'split split-focus' : 'split';
}

function shouldFetchElevenLabsVoiceOptions(project: Project): boolean {
  const metadata = project.metadata;
  return metadata?.kind === 'audio'
    && metadata.audioKind === 'speech'
    && metadata.audioModel === 'elevenlabs-v3'
    && !metadata.voice;
}

function projectEventToAgentEvent(evt: ProjectEvent): LiveArtifactEventItem['event'] | null {
  if (evt.type === 'file-changed') return null;
  if (evt.type === 'conversation-created') return null;
  if (evt.type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: evt.action,
      projectId: evt.projectId,
      artifactId: evt.artifactId,
      title: evt.title,
      refreshStatus: evt.refreshStatus,
    };
  }
  return {
    kind: 'live_artifact_refresh',
    phase: evt.phase,
    projectId: evt.projectId,
    artifactId: evt.artifactId,
    refreshId: evt.refreshId,
    title: evt.title,
    refreshedSourceCount: evt.refreshedSourceCount,
    error: evt.error,
  };
}

export function ProjectView({
  project,
  routeFileName,
  routeConversationId = null,
  config,
  agents,
  skills,
  designTemplates,
  designSystems,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onRefreshAgents,
  onOpenSettings,
  onOpenAmrSettings,
  onOpenMcpSettings,
  onAdoptPetInline,
  onTogglePet,
  onOpenPetSettings,
  onBack,
  onClearPendingPrompt,
  onTouchProject,
  onProjectChange,
  onProjectsRefresh,
  onChangeDefaultDesignSystem,
  onDesignSystemsRefresh,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  // P0 page_view page_name=chat_panel — fire once per project mount.
  // ProjectView outlives conversation switches (ChatPane is keyed by
  // activeConversationId so it remounts when the user switches chats,
  // but this component does not), so page_view stays a "chat-panel
  // entry" metric instead of becoming a "conversation switch" count.
  // Reviewer #2285 (mrcfps, 2026-05-20 04:08) flagged the previous
  // ChatComposer-level emit for skewing the funnel.
  const chatPanelPageViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (chatPanelPageViewFiredRef.current === project.id) return;
    chatPanelPageViewFiredRef.current = project.id;
    trackPageView(analytics.track, { page_name: 'chat_panel' });
    // Onboarding's 4th step ("生成进度页") fires here, not in
    // `DesignSystemDetailView`: the Generate path navigates
    // straight to the project's chat_panel, not to the design
    // system detail surface. If an onboarding session id is still
    // in sessionStorage we stamp the funnel's last row here and
    // clear so any later DS visit doesn't inherit the attribution.
    // E2E (2026-05-21) confirmed this is the only path users
    // actually take — observed: page_view chat_panel fires, but
    // page_view design_system_project never did because that
    // route isn't visited from the embedded onboarding generate.
    const onboardingSessionId = peekOnboardingSessionId();
    if (onboardingSessionId) {
      trackPageView(analytics.track, {
        page_name: 'onboarding',
        area: 'generation_progress',
        step_index: 'progress',
        step_name: 'generation',
        onboarding_session_id: onboardingSessionId,
      });
      clearOnboardingSessionId();
    }
  }, [analytics.track, project.id]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null);
  const [failedMessagesConversationId, setFailedMessagesConversationId] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [messageLoadRetryNonce, setMessageLoadRetryNonce] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePluginActionPaths, setActivePluginActionPaths] = useState<Set<string>>(() => new Set());
  const [hiddenAssistantPluginActionPaths, setHiddenAssistantPluginActionPaths] = useState<Set<string>>(() => new Set());
  const [forceStreamingPluginMessageIds, setForceStreamingPluginMessageIds] = useState<Set<string>>(() => new Set());
  // True once the initial DB read for the active conversation has settled.
  // Auto-send gates on this so it can't fire before listMessages resolves and
  // race-clobber the freshly-pushed user + assistant placeholder. Without
  // this, the auto-send writes [user, assistant] into state, then the still
  // in-flight listMessages PUT response arrives, runs setMessages(list), and
  // wipes both — leaving the daemon's run with no client-side message to
  // attach the runId to.
  const [messagesInitialized, setMessagesInitialized] = useState(false);
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);
  const [attachedComments, setAttachedComments] = useState<PreviewComment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioVoiceOptionsError, setAudioVoiceOptionsError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const projectFilesRef = useRef<ProjectFile[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);
  const [workspaceFocused, setWorkspaceFocused] = useState(false);
  const [commentInspectorActive, setCommentInspectorActive] = useState(false);
  const commentInspectorPortalId = useId();
  const leftInspectorActive = commentInspectorActive;
  // Per-session override for the BYOK SenseAudio chat's generate_image
  // tool. Seeded once from Settings (config.byokImageModel) so the
  // composer dropdown opens on the user's chosen default; subsequent
  // selections live only in this component's state — page refresh /
  // project switch resets to the Settings default. Persistent defaults
  // live in Settings → BYOK → SenseAudio → Image generation model.
  const [byokImageModelOverride, setByokImageModelOverride] = useState<string>(
    config.byokImageModel ?? '',
  );
  // PR #974 round 7 (mrcfps @ useDesignMdState.ts:131): counter that
  // bumps on file-changed SSE events, live_artifact* events, and the
  // chat streaming-completion edge so the staleness chip stays in sync
  // with the underlying mtimes / conversation updatedAt as the user
  // keeps working post-finalize. The hook treats it as a dep and
  // recomputes whenever it changes.
  const [designMdRefreshKey, setDesignMdRefreshKey] = useState(0);
  // ----- Continue in CLI / Finalize design package wiring (#451) -----
  // The toast surface is shared between Finalize errors and the
  // success/fallback toasts emitted from handleContinueInCli.
  const projectDetail = useProjectDetail(project.id);
  const designMdState = useDesignMdState(project.id, designMdRefreshKey);
  const finalize = useFinalizeProject(project.id);
  const terminalLauncher = useTerminalLaunch();
  const [projectActionsToast, setProjectActionsToast] = useState<{
    message: string;
    details: string | null;
    code?: string | null;
  } | null>(null);
  const [chatSeed, setChatSeed] = useState<{ id: string; value: string } | null>(null);
  const [autoAuditRepairSeed, setAutoAuditRepairSeed] =
    useState<{ id: string; value: string } | null>(null);
  const [chatPanelWidth, setChatPanelWidth] = useState(readSavedChatPanelWidth);
  const [chatPanelMaxWidth, setChatPanelMaxWidth] = useState(MAX_CHAT_PANEL_WIDTH);
  const [workspacePanelMinWidth, setWorkspacePanelMinWidth] = useState(MIN_WORKSPACE_PANEL_WIDTH);
  const [resizingChatPanel, setResizingChatPanel] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const chatPanelWidthRef = useRef(chatPanelWidth);
  const preferredChatPanelWidthRef = useRef(chatPanelWidth);
  const resizeStartPreferredWidthRef = useRef(chatPanelWidth);
  const chatPanelMaxWidthRef = useRef(chatPanelMaxWidth);
  const resizeStateRef = useRef<{
    startClientX: number;
    startWidth: number;
    isRtl: boolean;
    hasMoved: boolean;
  } | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerClientXRef = useRef<number | null>(null);
  // The persisted set of open tabs + active tab. Persisted via PUT on every
  // change; loaded once when the project mounts.
  const [openTabsState, setOpenTabsState] = useState<OpenTabsState>({
    tabs: [],
    active: null,
  });
  const tabsLoadedRef = useRef(false);
  const tabsHydratedFromSavedStateRef = useRef(false);
  const hasAppliedInitialPrimaryOpenRef = useRef(false);
  // Routed to FileWorkspace — bumped whenever the user clicks "open" on a
  // tool card, an attachment chip, or a produced-file chip in chat. We
  // include a nonce so re-clicking the same name after the user closed the
  // tab still focuses it.
  const [openRequest, setOpenRequest] = useState<{ name: string; nonce: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const [queuedChatSends, setQueuedChatSends] = useState<QueuedChatSend[]>([]);
  const queuedChatSendsRef = useRef<QueuedChatSend[]>([]);
  const sendTextBufferRef = useRef<BufferedTextUpdates | null>(null);
  const reattachTextBuffersRef = useRef<Set<BufferedTextUpdates>>(new Set());
  const reattachControllersRef = useRef<Map<string, AbortController>>(new Map());
  const reattachCancelControllersRef = useRef<Map<string, AbortController>>(new Map());
  const completedReattachRunsRef = useRef<Set<string>>(new Set());
  const skillCache = useRef<Map<string, string>>(new Map());
  const designCache = useRef<Map<string, string>>(new Map());
  const templateCache = useRef<Map<string, ProjectTemplate>>(new Map());
  // We auto-save the most recent artifact to the project folder. Track the
  // last name we persisted so re-renders during streaming don't spawn
  // duplicate writes.
  const savedArtifactRef = useRef<string | null>(null);
  // Pending Write tool invocations: tool_use_id -> destination basename.
  // When the matching tool_result lands we refresh the file list and open
  // the file as a tab once. Keying off the tool_use_id (rather than
  // diffing the file list at end-of-turn) lets us auto-open the moment
  // the agent's Write actually completes, without the previous synthetic
  // "live" tab that was causing flicker against manual opens.
  const pendingWritesRef = useRef<Map<string, string>>(new Map());
  // Track which conversation the current messages belong to, so we can
  // correctly gate new-conversation creation even during async loads.
  const messagesConversationIdRef = useRef<string | null>(null);
  const creatingConversationRef = useRef(false);
  // Last conversation id this view pushed into the URL. Lets the
  // route -> active-conversation sync tell a genuine external navigation
  // apart from the URL merely lagging a local conversation switch.
  const lastSyncedConversationIdRef = useRef<string | null>(null);
  // Live mirror of the currently-viewed project id. Used to bail out of
  // the conversation-created async refresh (#1361) if the user switches
  // projects while the refetch is in flight — the existing project-load
  // effects use the same kind of cancellation guard.
  const projectIdRef = useRef(project.id);
  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);
  useEffect(() => {
    setChatSeed(null);
    setAutoAuditRepairSeed(null);
    queuedChatSendsRef.current = [];
    setQueuedChatSends([]);
  }, [project.id]);
  // Monotonic token bumped on every `conversation-created` refresh dispatch.
  // Two rapid events (e.g. concurrent routine runs against the same reused
  // project, #1502) can start overlapping `listConversations` calls; if the
  // later request resolves first with N+1 conversations and the earlier
  // request resolves afterwards with only N, an unconditional
  // `setConversations(list)` would drop the newest conversation. Each
  // dispatch captures the token at start; only the dispatch whose token
  // still equals `conversationsRefreshTokenRef.current` at await-return is
  // allowed to apply its result.
  const conversationsRefreshTokenRef = useRef(0);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const currentConversationHasActiveRun = useMemo(
    () => messages.some((m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus)),
    [messages],
  );
  const currentConversationLoading = Boolean(
    activeConversationId
      && messagesConversationId !== activeConversationId
      && failedMessagesConversationId !== activeConversationId,
  );
  const currentConversationStreaming = streaming && streamingConversationId === activeConversationId;
  const currentConversationBusy = currentConversationLoading
    || currentConversationStreaming
    || currentConversationHasActiveRun;
  const currentConversationAwaitingActiveRunAttach =
    currentConversationHasActiveRun && !currentConversationStreaming;
  const currentConversationSendDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId
    || currentConversationAwaitingActiveRunAttach;
  const currentConversationActionDisabled = currentConversationBusy || currentConversationSendDisabled;
  const currentConversationQueueDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId;
  const currentConversationQueuedItems = activeConversationId
    ? queuedChatSends
        .filter((item) => item.conversationId === activeConversationId)
        .map((item) => ({
          id: item.id,
          prompt: item.prompt,
          attachments: item.attachments,
          commentAttachments: item.commentAttachments,
        }))
    : [];
  const newConversationDisabled = creatingConversation;
  const activeCompletionNotificationRunsRef = useRef<Set<string>>(new Set());
  const completedNotificationRunsRef = useRef<Set<string>>(new Set());

  // Load conversations on project switch. If none exist (older projects
  // pre-conversations, or a freshly created one whose default seed got
  // dropped), create one on the fly.
  useEffect(() => {
    let cancelled = false;
    setConversations([]);
    setActiveConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setMessageLoadRetryNonce(0);
    setConversationLoadError(null);
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setError(null);
    setAudioVoiceOptionsError(null);
    setArtifact(null);
    savedArtifactRef.current = null;
    pendingWritesRef.current.clear();
    (async () => {
      try {
        const list = await listConversations(project.id);
        if (cancelled) return;
        if (list.length === 0) {
          const fresh = await createConversation(project.id);
          if (cancelled) return;
          if (fresh) {
            setConversations([fresh]);
            setActiveConversationId(fresh.id);
          } else {
            throw new Error('Could not create a conversation for this project.');
          }
        } else {
          setConversations(list);
          // Issue #1505: when the URL deep-links to a specific
          // conversation, prefer that one. Falls through to list[0]
          // when the routed id is null or no longer present (the
          // routine row may have been deleted between the route
          // landing and the conversation list loading).
          const routedMatch = routeConversationId
            ? list.find((c) => c.id === routeConversationId) ?? null
            : null;
          setActiveConversationId(routedMatch ? routedMatch.id : list[0]!.id);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load conversations for this project.';
        setConversations([]);
        setActiveConversationId(null);
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Issue #1505: when the URL changes the routed conversation id while
  // we are already inside the project (e.g. the user clicks "Open
  // project" on a different routine history row in the same project),
  // switch the active conversation without re-fetching the list.
  // Guards: only acts when the routed id is non-null AND present in
  // the already-loaded list, and only when it differs from the current
  // active id. Falls through to a no-op for stale / missing routes so
  // the default picker above keeps its result.
  useEffect(() => {
    if (!routeConversationId) {
      lastSeenRouteConversationIdRef.current = null;
      return;
    }
    if (conversations.length === 0) return;
    if (routeConversationId === activeConversationId) return;
    // When the route still points at the conversation this view last
    // pushed to the URL, the mismatch means a local switch (new
    // conversation, history pick) moved activeConversationId ahead and
    // the URL sync below has not caught up yet. Following the stale
    // route here would fight that sync and remount ChatPane in a loop,
    // so only react to a genuinely external navigation.
    if (routeConversationId === lastSyncedConversationIdRef.current) return;
    if (lastSeenRouteConversationIdRef.current === routeConversationId) return;
    lastSeenRouteConversationIdRef.current = routeConversationId;
    const match = conversations.find((c) => c.id === routeConversationId);
    if (!match) return;
    setActiveConversationId(routeConversationId);
  }, [routeConversationId, conversations, activeConversationId]);

  useEffect(() => {
    setWorkspaceFocused(false);
  }, [project.id]);

  // Load messages whenever the active conversation changes. This happens
  // on project mount (after conversations load) and on user-triggered
  // conversation switches.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setMessagesInitialized(false);
      setPreviewComments([]);
      setAttachedComments([]);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      messagesConversationIdRef.current = null;
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      return;
    }
    // Reset the initialized flag so auto-send waits for the new
    // conversation's DB read to settle before checking messages.length.
    setMessagesInitialized(false);
    let cancelled = false;
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    savedArtifactRef.current = null;
    pendingWritesRef.current.clear();
    if (messagesConversationIdRef.current !== activeConversationId) {
      messagesConversationIdRef.current = null;
    }
    (async () => {
      try {
        const [list, comments] = await Promise.all([
          listMessages(project.id, activeConversationId),
          fetchPreviewComments(project.id, activeConversationId),
        ]);
        if (cancelled) return;
        setMessages(list);
        setMessagesInitialized(true);
        setPreviewComments(comments);
        setAttachedComments([]);
        setArtifact(null);
        setError(null);
        savedArtifactRef.current = null;
        pendingWritesRef.current.clear();
        messagesConversationIdRef.current = activeConversationId;
        setMessagesConversationId(activeConversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load messages for this conversation.';
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setError(message);
        savedArtifactRef.current = null;
        pendingWritesRef.current.clear();
        messagesConversationIdRef.current = null;
        setMessagesConversationId(null);
        setFailedMessagesConversationId(activeConversationId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, activeConversationId, messageLoadRetryNonce]);

  useEffect(() => {
    return () => {
      sendTextBufferRef.current?.cancel();
      sendTextBufferRef.current = null;
      // Unmounts / conversation switches should only detach local stream
      // consumers. Aborting the daemon cancel controllers here turns routine
      // cleanup into an explicit POST /api/runs/:id/cancel, which can mark a
      // live run canceled even when the user never clicked Stop.
      abortRef.current?.abort();
      abortRef.current = null;
      cancelRef.current = null;
      for (const textBuffer of reattachTextBuffersRef.current) textBuffer.cancel();
      reattachTextBuffersRef.current.clear();
      for (const controller of reattachControllersRef.current.values()) {
        if (abortRef.current === controller) abortRef.current = null;
        controller.abort();
      }
      for (const controller of reattachCancelControllersRef.current.values()) {
        // Route changes should only detach the browser-side SSE listener.
        // Aborting this signal maps to POST /cancel, so leave the daemon run alive.
        if (cancelRef.current === controller) cancelRef.current = null;
      }
      reattachControllersRef.current.clear();
      reattachCancelControllersRef.current.clear();
    };
  }, [project.id, activeConversationId]);

  const cancelSendTextBuffer = useCallback((flushPending = false) => {
    if (flushPending) sendTextBufferRef.current?.flush();
    sendTextBufferRef.current?.cancel();
    sendTextBufferRef.current = null;
  }, []);

  const cancelReattachTextBuffers = useCallback((flushPending = false) => {
    for (const textBuffer of reattachTextBuffersRef.current) {
      if (flushPending) textBuffer.flush();
      textBuffer.cancel();
    }
    reattachTextBuffersRef.current.clear();
  }, []);

  const notifyCompletedRun = useCallback((last: ChatMessage) => {
    // Round 7 (mrcfps @ useDesignMdState.ts:131): a chat turn just
    // settled — conversation updatedAt almost certainly moved, so
    // recompute DESIGN.md staleness even when the turn produced no
    // file mutations or live artifacts.
    setDesignMdRefreshKey((n) => n + 1);

    const status = last.runStatus;
    if (status !== 'succeeded' && status !== 'failed') return;

    const cfg = config.notifications ?? DEFAULT_NOTIFICATIONS;
    if (cfg.soundEnabled) {
      playSound(status === 'succeeded' ? cfg.successSoundId : cfg.failureSoundId);
    }

    if (cfg.desktopEnabled) {
      // Successes only interrupt when the user is on another tab/window.
      // Failures alert regardless — losing a long agent run silently is
      // worse than a small interruption when the page is in focus.
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const isFocused = typeof document === 'undefined' ? true : document.hasFocus();
      if (status === 'failed' || isHidden || !isFocused) {
        const title = status === 'succeeded'
          ? t('notify.successTitle')
          : t('notify.failureTitle');
        const fallbackBody = status === 'succeeded'
          ? t('notify.successBody')
          : t('notify.failureBody');
        const trimmed = (last.content ?? '').trim();
        const body = trimmed ? trimmed.slice(0, 80) : fallbackBody;
        void showCompletionNotification({
          status,
          title,
          body,
          onClick: () => {
            if (typeof window !== 'undefined') window.focus();
          },
        });
      }
    }
  }, [config.notifications, t]);

  // Fire completion feedback from assistant run-status transitions rather than
  // from the local SSE listener state. A run can finish while its conversation
  // is detached; when the user returns, the terminal status should still produce
  // the one completion notification for runs this view previously saw active.
  useEffect(() => {
    const completedMessages: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const keys = message.runId ? [message.runId, message.id] : [message.id];
      if (isActiveRunStatus(message.runStatus)) {
        for (const key of keys) activeCompletionNotificationRunsRef.current.add(key);
        continue;
      }
      if (message.runStatus !== 'succeeded' && message.runStatus !== 'failed') continue;
      if (!keys.some((key) => activeCompletionNotificationRunsRef.current.has(key))) continue;
      if (keys.some((key) => completedNotificationRunsRef.current.has(key))) continue;
      for (const key of keys) completedNotificationRunsRef.current.add(key);
      completedMessages.push(message);
    }

    for (const message of completedMessages) notifyCompletedRun(message);
  }, [messages, notifyCompletedRun]);

  // Hydrate the open-tabs state once per project. After this initial
  // load, every mutation flows through saveTabsState() which keeps DB +
  // local state coherent.
  useEffect(() => {
    let cancelled = false;
    tabsLoadedRef.current = false;
    tabsHydratedFromSavedStateRef.current = false;
    hasAppliedInitialPrimaryOpenRef.current = false;
    (async () => {
      const state = await loadTabs(project.id);
      if (cancelled) return;
      tabsHydratedFromSavedStateRef.current = state.hasSavedState === true;
      setOpenTabsState(state);
      tabsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      setOpenTabsState(next);
      if (tabsLoadedRef.current) {
        void saveTabs(project.id, next);
      }
    },
    [project.id],
  );

  const refreshProjectFiles = useCallback(async (): Promise<ProjectFile[]> => {
    const next = await fetchProjectFiles(project.id);
    projectFilesRef.current = next;
    setProjectFiles(next);
    return next;
  }, [project.id]);

  useEffect(() => {
    projectFilesRef.current = projectFiles;
  }, [projectFiles]);

  // Cache HTML file contents so the auto-open module check (issue #2744) does
  // not re-fetch unchanged entries on every Write. Keyed by file name with the
  // mtime stored alongside, so a rewrite REPLACES the file's single entry
  // rather than accreting a new key. Bounded by the project's HTML file count.
  const htmlContentCacheRef = useRef<Map<string, { mtime: number; text: string | null }>>(
    new Map(),
  );
  const readProjectHtml = useCallback(
    async (name: string): Promise<string | null> => {
      const file = projectFilesRef.current.find((entry) => entry.name === name);
      const mtime = file?.mtime ?? 0;
      const cached = htmlContentCacheRef.current.get(name);
      if (cached && cached.mtime === mtime) return cached.text;
      try {
        const response = await fetch(projectRawUrl(project.id, name));
        const text = response.ok ? await response.text() : null;
        htmlContentCacheRef.current.set(name, { mtime, text });
        return text;
      } catch {
        htmlContentCacheRef.current.set(name, { mtime, text: null });
        return null;
      }
    },
    [project.id],
  );

  const refreshLiveArtifacts = useCallback(async (): Promise<LiveArtifactSummary[]> => {
    const next = await fetchLiveArtifacts(project.id);
    setLiveArtifacts(next);
    return next;
  }, [project.id]);

  const refreshWorkspaceItems = useCallback(async (): Promise<ProjectFile[]> => {
    const [nextFiles] = await Promise.all([refreshProjectFiles(), refreshLiveArtifacts()]);
    return nextFiles;
  }, [refreshLiveArtifacts, refreshProjectFiles]);

  useEffect(() => {
    if (!tabsLoadedRef.current) return;
    if (hasAppliedInitialPrimaryOpenRef.current) return;
    if (routeFileName) return;
    if (openTabsState.active || openTabsState.tabs.length > 0) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    if (tabsHydratedFromSavedStateRef.current) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    const primaryFile = selectPrimaryProjectFile(projectFiles);
    if (!primaryFile) return;
    hasAppliedInitialPrimaryOpenRef.current = true;
    persistTabsState({ tabs: [primaryFile.name], active: primaryFile.name });
  }, [openTabsState.active, openTabsState.tabs.length, persistTabsState, projectFiles, routeFileName]);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    setOpenRequest({ name, nonce: Date.now() });
  }, []);

  const persistArtifact = useCallback(
    async (art: Artifact, projectFilesSnapshot?: ProjectFile[]) => {
      const baseName = artifactBaseNameFor(art);
      const ext = artifactExtensionFor(art);
      // Pick a name that doesn't collide with an existing project file.
      // The first run uses `<base>.<ext>`; subsequent runs append `-2`, `-3`…
      // so prior artifacts aren't silently overwritten.
      const currentProjectFiles = projectFilesSnapshot ?? projectFilesRef.current;
      const existing = new Set(currentProjectFiles.map((f) => f.name));
      let fileName = `${baseName}${ext}`;
      let n = 2;
      while (existing.has(fileName) && savedArtifactRef.current !== fileName) {
        fileName = `${baseName}-${n}${ext}`;
        n += 1;
      }
      if (ext === '.html') {
        const pointerTarget = resolveHtmlPointerArtifactTarget({
          content: art.html,
          candidateFileName: fileName,
          projectFiles: currentProjectFiles,
        });
        if (pointerTarget) {
          if (savedArtifactRef.current === pointerTarget) return;
          savedArtifactRef.current = pointerTarget;
          requestOpenFile(pointerTarget);
          return;
        }
      }
      // Pre-write structural gate for HTML artifacts (#50, #1143). Reject
      // bodies that obviously aren't a complete document — usually a one-line
      // prose summary the model emitted inside `<artifact type="text/html">`
      // when only Edit-tool changes happened this turn. Without this guard,
      // such content lands as a phantom HTML file in the project panel.
      if (ext === '.html') {
        const validation = validateHtmlArtifact(art.html);
        if (!validation.ok) {
          setError(`Refused to save artifact "${art.identifier || art.title || 'untitled'}": ${validation.reason}`);
          return;
        }
      }
      if (savedArtifactRef.current === fileName) return;
      savedArtifactRef.current = fileName;
      const title = art.title || art.identifier || fileName;
      const metadata = {
        identifier: art.identifier,
        artifactType: art.artifactType,
        inferred: false,
      };
      const manifest =
        ext === '.html'
          ? createHtmlArtifactManifest({
              entry: fileName,
              title,
              sourceSkillId: project.skillId ?? undefined,
              designSystemId: project.designSystemId,
              metadata,
            })
          : inferLegacyManifest({
              entry: fileName,
              title,
              metadata: {
                ...metadata,
                sourceSkillId: project.skillId ?? undefined,
                designSystemId: project.designSystemId,
              },
            });
      const file = await writeProjectTextFile(project.id, fileName, art.html, {
        artifactManifest: manifest ?? undefined,
      });
      if (file) {
        setFilesRefresh((n) => n + 1);
        // Surface the daemon's stub-guard warning when it fires in `warn`
        // mode (the default). Without this the warning would land in the
        // file metadata silently and the user would never see that the
        // model shipped a placeholder.
        if (file.stubGuardWarning) {
          setError(
            `Saved "${file.name}", but the model may have shipped a placeholder: ` +
              `${file.stubGuardWarning.message}`,
          );
        }
        // Auto-open the freshly-persisted artifact as a tab so the user
        // sees it without an extra click. The Write-tool path already does
        // this for tool-emitted files; this handles the artifact-tag path.
        requestOpenFile(file.name);
      } else {
        // writeProjectTextFile collapses all failure paths (non-OK HTTP
        // responses, network errors, and stub-guard 422s) to null — the
        // helper's return contract would need to be widened to distinguish
        // them, which is out of scope here.  Show a generic banner so the
        // failure is observable rather than silent; the daemon logs carry
        // the structured details for any specific error type.
        // Clear the saved-artifact ref so the user can retry.
        savedArtifactRef.current = '';
        setError(
          `Couldn't save artifact "${fileName}". The write failed — ` +
            'check the daemon logs for details.',
        );
      }
    },
    [project.id, project.designSystemId, project.skillId, requestOpenFile],
  );

  // Set of project file names that the chat surface uses to decide whether
  // a tool card's path is openable as a tab. Recomputed on every file-list
  // change; tool cards just read from the set.
  const projectFileNames = useMemo(
    () => new Set(projectFiles.map((f) => f.name)),
    [projectFiles],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  // Keep the @-picker's source of truth fresh: every refreshSignal bump
  // (artifact saved, sketch saved, image uploaded) refetches; on first
  // mount we also do an initial pull so attachments staged before the
  // agent has written anything still see the user's pasted images.
  useEffect(() => {
    void refreshWorkspaceItems().catch(() => {
      // The daemon probe can briefly lag behind a just-started local
      // runtime. Retry when daemonLive flips or the explicit refresh key
      // changes instead of leaving the project view in its empty shell.
    });
  }, [daemonLive, refreshWorkspaceItems, filesRefresh]);

  // Live-reload: when the daemon's chokidar watcher reports a file change,
  // bump filesRefresh so the file list refetches with new mtimes — which
  // propagates through to FileViewer iframes via PR #384's ?v=${mtime}
  // cache-bust, triggering an automatic preview reload without a click.
  //
  // Coalesce the refresh: agent rewrites surface to chokidar as an
  // `unlink` + `add` (+ later `change`) burst within a single tick (#2195).
  // Refreshing the file list on the intermediate `unlink` makes the open
  // tab's active file vanish for one frame before the `add` restores it,
  // and FileWorkspace's "tab no longer on disk" path then drops the user
  // out of their preview. A short trailing wait absorbs the burst; the
  // maxWait cap stops a sustained edit storm from starving the UI.
  const refreshFilesAndDesignMd = useCallback(() => {
    setFilesRefresh((n) => n + 1);
    // Round 7 (mrcfps): file mutations are the dominant staleness signal
    // post-finalize — bump the refresh key so DESIGN.md staleness
    // recomputes against the new mtimes.
    setDesignMdRefreshKey((n) => n + 1);
  }, []);
  const coalescedFileChangedRefresh = useCoalescedCallback(
    refreshFilesAndDesignMd,
    { wait: 80, maxWait: 250 },
  );
  const handleProjectEvent = useCallback((evt: ProjectEvent) => {
    if (evt.type === 'file-changed') {
      iframeKeepAlivePool.evictProject(project.id);
      coalescedFileChangedRefresh();
      return;
    }
    if (evt.type === 'conversation-created') {
      // A new conversation was inserted into this project by a path the
      // open project view can't observe through its own state (currently:
      // Routines "Run now" in reuse-an-existing-project mode, #1361).
      // Refetch the conversation list so the new entry becomes visible
      // without requiring the user to leave and re-enter the project.
      // Deliberately do NOT change the active conversation here — the
      // user keeps their current context. Auto-switch is a separate UX
      // decision tracked in #1361.
      if (evt.projectId !== project.id) return;
      const capturedProjectId = project.id;
      const myToken = ++conversationsRefreshTokenRef.current;
      void (async () => {
        try {
          const list = await listConversations(capturedProjectId);
          // Bail if the user switched projects while this request was in
          // flight (#1361 review, Codex P1). The captured project id is the
          // one we asked the daemon about; the live ref is the one the
          // user is looking at right now. If they don't match, applying
          // the list would overwrite the new project's sidebar with
          // stale data from the old one.
          if (projectIdRef.current !== capturedProjectId) return;
          // Bail if a newer conversation-created event already dispatched
          // its own refresh after us (#1361 review, lefarcen P2). With two
          // rapid events the later request may resolve first; if this
          // earlier request resolves afterwards it would drop the newer
          // conversation. Only the latest dispatch is allowed to apply.
          if (conversationsRefreshTokenRef.current !== myToken) return;
          setConversations(list);
        } catch {
          // Defensive: refresh failed (network blip, daemon gone). The
          // next project mount or another conversation-created event
          // will retry; no need to surface an error here.
        }
      })();
      return;
    }
    const agentEvent = projectEventToAgentEvent(evt);
    if (!agentEvent) return;
    setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, agentEvent));
    void refreshLiveArtifacts();
    onProjectsRefresh();
    // Live artifact events come from chat-turn-emitted artifacts; they
    // also imply the conversation transcript changed.
    setDesignMdRefreshKey((n) => n + 1);
  }, [coalescedFileChangedRefresh, iframeKeepAlivePool, onProjectsRefresh, refreshLiveArtifacts, project.id]);
  useProjectFileEvents(project.id, daemonLive, handleProjectEvent);

  const activePromptContextSignature = useMemo(() => {
    const skill = project.skillId
      ? (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))
      : null;
    const designSystem = project.designSystemId
      ? designSystems.find((d) => d.id === project.designSystemId)
      : null;
    return JSON.stringify({
      designSystem: designSystem
        ? {
            id: designSystem.id,
            title: designSystem.title,
            category: designSystem.category,
            summary: designSystem.summary,
            source: designSystem.source ?? null,
          }
        : null,
      skill: skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            mode: skill.mode,
            source: skill.source ?? null,
            upstream: skill.upstream,
          }
        : null,
    });
  }, [designSystems, designTemplates, project.designSystemId, project.skillId, skills]);
  const previousPromptContextSignatureRef = useRef(activePromptContextSignature);
  useEffect(() => {
    if (previousPromptContextSignatureRef.current === activePromptContextSignature) return;
    previousPromptContextSignatureRef.current = activePromptContextSignature;
    iframeKeepAlivePool.evictProject(project.id, { includeActive: true });
  }, [activePromptContextSignature, iframeKeepAlivePool, project.id]);

  // When the URL points at a specific file, fire an open request so the
  // FileWorkspace promotes it to an active tab. We watch routeFileName
  // (the parsed segment) so back/forward navigation triggers the same path.
  useEffect(() => {
    if (!routeFileName) return;
    requestOpenFile(routeFileName);
  }, [routeFileName, requestOpenFile]);

  // Sync the URL when the active tab changes, so reload + share-link both
  // land back on the same view. Replace (not push) on tab activation so the
  // history stack doesn't fill with every tab click.
  // Composite sync key: tracks BOTH the active file target AND the active
  // conversation id, so a conversation-only change (e.g. `listConversations`
  // resolves after `loadTabs` hydrated the active tab, or the user picks a
  // different conversation under the same tab) still triggers the navigate
  // and pushes `/conversations/:cid` into the URL. Keying only on the file
  // target lost that update because the early-return saw `target` unchanged
  // and skipped the navigate (lefarcen P1 on PR #1508).
  const lastSyncedRouteKeyRef = useRef<string | null>(null);
  const lastSeenRouteConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const target = openTabsState.active && (
      openTabsState.tabs.includes(openTabsState.active)
      || projectFileNames.has(openTabsState.active)
      || isLiveArtifactTabId(openTabsState.active)
    )
      ? openTabsState.active
      : null;
    const nextKey = `${activeConversationId ?? ''}:${target ?? ''}`;
    if (nextKey === lastSyncedRouteKeyRef.current) return;
    lastSyncedRouteKeyRef.current = nextKey;
    lastSyncedConversationIdRef.current = activeConversationId;
    // PerishCode + Codex P1 on PR #1508: the prior version of this
    // sync stripped any `/conversations/:cid` segment from the URL as
    // soon as a tab became active, which regressed the deep-link
    // behavior the parent commit was meant to add (reload / share
    // would fall back to `list[0]` instead of the routed run's
    // conversation). Thread the active conversation id so the URL
    // always reflects the conversation the project view is actually
    // showing, matching how `fileName` already tracks the active tab.
    navigate(
      {
        kind: 'project',
        projectId: project.id,
        conversationId: activeConversationId,
        fileName: target,
      },
      { replace: true },
    );
  }, [openTabsState.active, projectFileNames, project.id, activeConversationId]);

  const handleEnsureProject = useCallback(async (): Promise<string | null> => {
    return project.id;
  }, [project.id]);

  const composedSystemPrompt = useCallback(async (): Promise<string> => {
    let skillBody: string | undefined;
    let skillName: string | undefined;
    let skillMode: SkillSummary['mode'] | undefined;
    let designSystemBody: string | undefined;
    let designSystemTitle: string | undefined;

    if (project.skillId) {
      // project.skillId can resolve to either root after the
      // skills/design-templates split; check both lists so a template-backed
      // project keeps composing its template body when running in API mode.
      const summary =
        skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId);
      skillName = summary?.name;
      skillMode = summary?.mode;
      const cached = skillCache.current.get(project.skillId);
      if (cached !== undefined) {
        skillBody = cached;
      } else {
        const detail =
          (await fetchSkill(project.skillId)) ??
          (await fetchDesignTemplate(project.skillId));
        if (detail) {
          skillBody = detail.body;
          skillCache.current.set(project.skillId, detail.body);
        }
      }
    }
    if (project.designSystemId) {
      const summary = designSystems.find((d) => d.id === project.designSystemId);
      designSystemTitle = summary?.title;
      const cached = designCache.current.get(project.designSystemId);
      if (cached !== undefined) {
        designSystemBody = cached;
      } else {
        const detail = await fetchDesignSystem(project.designSystemId);
        if (detail) {
          designSystemBody = detail.body;
          designCache.current.set(project.designSystemId, detail.body);
        }
      }
    }
    let template: ProjectTemplate | undefined;
    const tplId = project.metadata?.templateId;
    if (project.metadata?.kind === 'template' && tplId) {
      const cached = templateCache.current.get(tplId);
      if (cached) {
        template = cached;
      } else {
        const fetched = await getTemplate(tplId);
        if (fetched) {
          templateCache.current.set(tplId, fetched);
          template = fetched;
        }
      }
    }
    // Fold in the auto-memory block so BYOK / API-mode chats see the
    // same Personal-memory section a daemon-side CLI chat would. The
    // daemon does this by calling `composeMemoryBody()` directly; the
    // web side hits the equivalent HTTP surface so it can stay
    // ignorant of daemon internals. Failures are swallowed — memory is
    // best-effort, never a blocker for the chat round-trip.
    let memoryBody: string | undefined;
    try {
      const resp = await fetch('/api/memory/system-prompt');
      if (resp.ok) {
        const json = (await resp.json()) as MemorySystemPromptResponse;
        if (typeof json.body === 'string' && json.body.trim().length > 0) {
          memoryBody = json.body;
        }
      }
    } catch {
      // Ignore; memory injection is best-effort.
    }
    let audioVoiceOptions: AudioVoiceOption[] | undefined;
    let audioVoiceOptionsLookupError: string | undefined;
    if (shouldFetchElevenLabsVoiceOptions(project)) {
      try {
        audioVoiceOptions = await fetchElevenLabsVoiceOptions();
        setAudioVoiceOptionsError(null);
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : 'ElevenLabs voice list could not be loaded.';
        audioVoiceOptionsLookupError = message;
        setAudioVoiceOptionsError(message);
      }
    } else {
      setAudioVoiceOptionsError(null);
    }
    return composeSystemPrompt({
      skillBody,
      skillName,
      skillMode,
      designSystemBody,
      designSystemTitle,
      memoryBody,
      metadata: project.metadata,
      template,
      audioVoiceOptions,
      audioVoiceOptionsError: audioVoiceOptionsLookupError,
      streamFormat: config.mode === 'api' ? 'plain' : undefined,
      locale,
      userInstructions: config.customInstructions,
      projectInstructions: project.customInstructions,
    });
  }, [
    project.skillId,
    project.designSystemId,
    project.metadata,
    project.customInstructions,
    skills,
    designTemplates,
    designSystems,
    config.mode,
    config.customInstructions,
    locale,
  ]);

  const persistMessage = useCallback(
    (m: ChatMessage, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      // Source-level guard against the "Working 24m+ / Waiting for first
      // output" UI: never write a daemon assistant row that is still
      // queued/running but has no runId. Until POST /api/runs returns the
      // runId, the message is purely in-flight on the client; persisting it
      // here creates a row that nothing can ever reattach to (daemon never
      // saw the runId, client lost the response). Once onRunCreated assigns
      // a runId — or the run finishes terminally — this guard lets the row
      // through normally.
      if (isPhantomDaemonRunMessage(m)) return;
      void saveMessage(project.id, activeConversationId, m, options);
    },
    [project.id, activeConversationId],
  );

  const persistMessageById = useCallback(
    (messageId: string, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      setMessages((curr) => {
        const found = curr.find((m) => m.id === messageId);
        if (found && !isPhantomDaemonRunMessage(found)) {
          void saveMessage(project.id, activeConversationId, found, options);
        }
        return curr;
      });
    },
    [project.id, activeConversationId],
  );

  const updateMessageById = useCallback(
    (
      messageId: string,
      updater: (message: ChatMessage) => ChatMessage,
      persist = false,
      persistOptions?: SaveMessageOptions,
    ) => {
      setMessages((curr) => {
        let saved: ChatMessage | null = null;
        const next = curr.map((m) => {
          if (m.id !== messageId) return m;
          const updated = updater(m);
          saved = updated;
          return updated;
        });
        // Same phantom guard as persistMessage: skip writes for a daemon
        // assistant row that is still in-flight (active runStatus, no runId).
        // The runId-arriving update from onRunCreated passes through because
        // the updater sets runId before this check runs.
        if (persist && saved && activeConversationId && !isPhantomDaemonRunMessage(saved)) {
          void saveMessage(project.id, activeConversationId, saved, persistOptions);
        }
        return next;
      });
    },
    [project.id, activeConversationId],
  );

  const appendConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => [...curr, message]);
      }
      if (persist) void saveMessage(project.id, conversationId, message, options);
    },
    [activeConversationId, project.id],
  );

  const replaceConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => curr.map((item) => (item.id === message.id ? message : item)));
      }
      if (persist) void saveMessage(project.id, conversationId, message, options);
    },
    [activeConversationId, project.id],
  );

  const markStreamingConversation = useCallback((conversationId: string) => {
    streamingConversationIdRef.current = conversationId;
    setStreaming(true);
    setStreamingConversationId(conversationId);
  }, []);

  const clearStreamingMarker = useCallback((conversationId?: string | null) => {
    const next = clearStreamingConversationMarker(
      streamingConversationIdRef.current,
      conversationId,
    );
    if (next === streamingConversationIdRef.current) return;
    streamingConversationIdRef.current = next;
    setStreamingConversationId(next);
    setStreaming(next !== null);
  }, []);

  const clearActiveRunRefs = useCallback((
    conversationId: string,
    controller: AbortController,
    cancelController: AbortController,
  ) => {
    if (!shouldClearActiveRunRefs(streamingConversationIdRef.current, conversationId)) {
      return;
    }
    if (abortRef.current === controller) abortRef.current = null;
    if (cancelRef.current === cancelController) cancelRef.current = null;
  }, []);

  const handleAssistantFeedback = useCallback(
    (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => {
      const now = Date.now();
      updateMessageById(
        assistantMessage.id,
        (prev) =>
          change
            ? {
                ...prev,
                feedback: {
                  rating: change.rating,
                  reasonCodes: change.reasonCodes,
                  customReason: change.customReason,
                  reasonsSubmittedAt: change.reasonsSubmittedAt,
                  createdAt:
                    prev.feedback?.rating === change.rating
                      ? prev.feedback.createdAt
                      : now,
                  updatedAt: now,
                },
              }
            : {
                ...prev,
                feedback: undefined,
              },
        true,
      );
      // Forward affirmative ratings to the daemon → Langfuse `score-create`.
      // Clears (change=null) are skipped — Langfuse scores are append-only,
      // and the rating is also captured by the PostHog event so a clear is
      // recoverable downstream if we ever need it.
      const runId = assistantMessage.runId;
      if (change && runId && activeConversationId) {
        void reportChatRunFeedback({
          runId,
          projectId: project.id,
          conversationId: activeConversationId,
          assistantMessageId: assistantMessage.id,
          rating: change.rating,
          reasonCodes: change.reasonCodes ?? [],
          hasCustomReason: !!change.customReason,
          customReason: normalizeCustomReason(change.customReason),
        });
      }
    },
    [updateMessageById, activeConversationId, project.id],
  );

  // `code` is the structured API error code (e.g. AGENT_AUTH_REQUIRED); it
  // rides along on the error status event so AssistantMessage can render the
  // hosted-AMR nudge for model/auth/quota failures on non-AMR agents.
  const appendAssistantErrorEvent = useCallback(
    (messageId: string, message: string, code?: string) => {
      if (!message) return;
      updateMessageById(
        messageId,
        (prev) => appendErrorStatusEvent(prev, message, code),
        true,
      );
    },
    [updateMessageById],
  );

  const auditDesignSystemWorkspaceAfterRun = useCallback(
    async (assistantMessageId: string) => {
      if (!isDesignSystemWorkspaceMetadata(project.metadata)) return;
      try {
        const audit = await fetchProjectDesignSystemPackageAudit(project.id);
        if (!audit) return;
        const auditSummary = summarizeDesignSystemPackageAudit(audit);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [...(prev.events ?? []), { kind: 'status', label: 'audit', detail: auditSummary }],
          }),
          true,
          { telemetryFinalized: true },
        );
        const repairPrompt = buildDesignSystemPackageAuditRepairPrompt(audit);
        if (repairPrompt) {
          const seed = { id: `audit-${Date.now()}`, value: repairPrompt };
          setChatSeed(seed);
          if (consumeDesignSystemAuditAutoRepair(project.id)) {
            setAutoAuditRepairSeed(seed);
          }
        } else {
          clearDesignSystemAuditAutoRepair(project.id);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [
              ...(prev.events ?? []),
              { kind: 'status', label: 'audit', detail: `Package audit could not run: ${detail}` },
            ],
          }),
          true,
          { telemetryFinalized: true },
        );
      }
    },
    [project.id, project.metadata, updateMessageById],
  );

  const refreshPreviewComments = useCallback(async () => {
    if (!activeConversationId) return;
    const next = await fetchPreviewComments(project.id, activeConversationId);
    setPreviewComments(next);
    setAttachedComments((current) =>
      current
        .map((attached) => next.find((comment) => comment.id === attached.id))
        .filter((comment): comment is PreviewComment => Boolean(comment)),
    );
  }, [project.id, activeConversationId]);

  const savePreviewComment = useCallback(
    async (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => {
      if (!activeConversationId) return null;
      const saved = await upsertPreviewComment(project.id, activeConversationId, { target, note });
      if (!saved) return null;
      setPreviewComments((current) => {
        const rest = current.filter((comment) => comment.id !== saved.id);
        return [saved, ...rest];
      });
      setAttachedComments((current) =>
        attachAfterSave ? mergeAttachedComments(current, saved) : current.map((comment) => comment.id === saved.id ? saved : comment),
      );
      return saved;
    },
    [project.id, activeConversationId],
  );

  const removePreviewComment = useCallback(
    async (commentId: string) => {
      if (!activeConversationId) return;
      const ok = await deletePreviewComment(project.id, activeConversationId, commentId);
      if (!ok) return;
      setPreviewComments((current) => current.filter((comment) => comment.id !== commentId));
      setAttachedComments((current) => removeAttachedComment(current, commentId));
    },
    [project.id, activeConversationId],
  );

  const attachPreviewComment = useCallback((comment: PreviewComment) => {
    setAttachedComments((current) => mergeAttachedComments(current, comment));
  }, []);

  const detachPreviewComment = useCallback((commentId: string) => {
    setAttachedComments((current) => removeAttachedComment(current, commentId));
  }, []);

  const patchAttachedStatuses = useCallback(
    async (attachments: ChatCommentAttachment[], status: PreviewComment['status']) => {
      if (!activeConversationId || attachments.length === 0) return;
      const persistedAttachments = attachments.filter(
        (attachment) => attachment.source !== 'board-batch',
      );
      if (persistedAttachments.length === 0) return;
      setPreviewComments((current) =>
        current.map((comment) =>
          persistedAttachments.some((attachment) => attachment.id === comment.id)
            ? { ...comment, status }
            : comment,
        ),
      );
      await Promise.all(
        persistedAttachments.map((attachment) =>
          patchPreviewCommentStatus(project.id, activeConversationId, attachment.id, status),
        ),
      );
      void refreshPreviewComments();
    },
    [project.id, activeConversationId, refreshPreviewComments],
  );

  useEffect(() => {
    if (config.mode !== 'daemon' || !daemonLive || !activeConversationId || streaming) return;
    let cancelled = false;
    const reattachConversationId = activeConversationId;

    const attachRecoverableRuns = async () => {
      const missingRunIdMessages = messages.filter((m) => {
        if (m.role !== 'assistant' || m.runId) return false;
        const producedFileCount = Array.isArray(m.producedFiles) ? m.producedFiles.length : 0;
        return (
          isActiveRunStatus(m.runStatus) ||
          (m.runStatus === 'succeeded' && (!m.content.trim() || producedFileCount === 0))
        );
      });
      const activeRuns = missingRunIdMessages.length > 0
        ? await listActiveChatRuns(project.id, reattachConversationId)
        : [];
      const historicalRuns = missingRunIdMessages.length > 0
        ? (await listProjectRuns()).filter(
            (run) => run.projectId === project.id && run.conversationId === reattachConversationId,
          )
        : [];
      if (cancelled) return;
      const activeByMessage = new Map(
        activeRuns
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );
      const historicalByMessage = new Map(
        historicalRuns
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );

      for (const message of messages) {
        if (cancelled) return;
        if (message.role !== 'assistant') continue;
        const producedFileCount = Array.isArray(message.producedFiles)
          ? message.producedFiles.length
          : 0;
        const needsTerminalReplay =
          message.runStatus === 'succeeded' &&
          (!message.content.trim() || producedFileCount === 0);
        const needsFullReplay = needsTerminalReplay || isActiveRunStatus(message.runStatus);
        if (!isActiveRunStatus(message.runStatus) && !needsTerminalReplay) continue;
        const fallbackRun = !message.runId
          ? activeByMessage.get(message.id) ?? historicalByMessage.get(message.id) ?? null
          : null;
        const runId = message.runId ?? fallbackRun?.id;
        // Self-heal phantom 'running' rows: when the message has no runId
        // and the daemon has no active run mapped to it, the original send
        // POST was lost (daemon restart mid-flight, the user navigated
        // away before /api/runs returned, or a network blip). Leaving the
        // message as 'running' is what produces the "Waiting for first
        // output — Working 24m+" UI the user reported. Mark it failed so
        // the composer is interactive again and the user can re-send.
        if (!runId) {
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runStatus: 'failed',
              endedAt: prev.endedAt ?? Date.now(),
            }),
            true,
          );
          continue;
        }
        if (reattachControllersRef.current.has(runId)) continue;
        if (completedReattachRunsRef.current.has(runId)) continue;

        if (fallbackRun && !message.runId) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runId, runStatus: fallbackRun.status }),
            true,
          );
        }

        const status = fallbackRun ?? await fetchChatRunStatus(runId);
        if (cancelled) return;
        if (!status) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
            true,
          );
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        updateMessageById(
          message.id,
          (prev) => ({ ...prev, runStatus: status.status }),
          true,
        );

        const controller = new AbortController();
        const cancelController = new AbortController();
        reattachControllersRef.current.set(runId, controller);
        reattachCancelControllersRef.current.set(runId, cancelController);
        if (!isTerminalRunStatus(status.status)) {
          abortRef.current = controller;
          cancelRef.current = cancelController;
          markStreamingConversation(reattachConversationId);
        }
        if (needsFullReplay) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, content: '', events: [], producedFiles: undefined }),
          );
        }

        let persistTimer: ReturnType<typeof setTimeout> | null = null;
        const persistSoon = () => {
          if (persistTimer) return;
          persistTimer = setTimeout(() => {
            persistTimer = null;
            persistMessageById(message.id);
          }, 500);
        };
        const persistNow = (options?: SaveMessageOptions) => {
          if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
          }
          textBuffer.flush();
          persistMessageById(message.id, options);
        };
        const parser = createArtifactParser();
        let parsedArtifact: Artifact | null = null;
        let liveHtml = '';
        let replayedContent = needsFullReplay ? '' : message.content;
        let replayedEvents: AgentEvent[] = needsFullReplay ? [] : [...(message.events ?? [])];
        const applyContentDelta = (delta: string) => {
          for (const ev of parser.feed(delta)) {
            if (ev.type === 'artifact:start') {
              liveHtml = '';
              parsedArtifact = {
                identifier: ev.identifier,
                artifactType: ev.artifactType,
                title: ev.title,
                html: '',
              };
              setArtifact(parsedArtifact);
            } else if (ev.type === 'artifact:chunk') {
              liveHtml += ev.delta;
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: liveHtml }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: liveHtml,
                  };
              setArtifact((prev) =>
                prev
                  ? { ...prev, html: liveHtml }
                  : {
                      identifier: ev.identifier,
                      title: '',
                      html: liveHtml,
                    },
              );
            } else if (ev.type === 'artifact:end') {
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: ev.fullContent }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: ev.fullContent,
                  };
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
          }
        };
        if (!needsFullReplay && message.content) {
          applyContentDelta(message.content);
        }
        const textBuffer = createBufferedTextUpdates({
          updateMessage: (updater) => updateMessageById(message.id, updater),
          persistSoon,
          flushAndPersistNow: () => persistNow({ keepalive: true }),
          onContentDelta: applyContentDelta,
        });
        reattachTextBuffersRef.current.add(textBuffer);
        const unregisterTextBuffer = () => {
          reattachTextBuffersRef.current.delete(textBuffer);
        };

        void reattachDaemonRun({
          runId,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          initialLastEventId: needsFullReplay ? null : message.lastRunEventId ?? null,
          handlers: {
            onDelta: (delta) => {
              replayedContent += delta;
              textBuffer.appendContent(delta);
            },
            onAgentEvent: (ev) => {
              replayedEvents = [...replayedEvents, ev];
              textBuffer.appendEvent(ev);
            },
            onDone: () => {
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              for (const ev of parser.flush()) {
                if (ev.type === 'artifact:end') {
                  parsedArtifact = parsedArtifact
                    ? { ...parsedArtifact, html: ev.fullContent }
                    : {
                        identifier: ev.identifier,
                        title: '',
                        html: ev.fullContent,
                      };
                  setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
                }
              }
              updateMessageById(
                message.id,
                (prev) => ({
                  ...prev,
                  content: needsFullReplay ? replayedContent : prev.content,
                  events: needsFullReplay ? replayedEvents : prev.events,
                  runStatus: resolveSucceededRunStatus(prev.runStatus),
                  endedAt: prev.endedAt ?? Date.now(),
                }),
                true,
                { telemetryFinalized: true },
              );
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearActiveRunRefs(reattachConversationId, controller, cancelController);
              clearStreamingMarker(reattachConversationId);
              void (async () => {
                const preTurn = message.preTurnFileNames;
                let nextFiles = await refreshProjectFiles();
                // Use the turn-start snapshot when available so reload
                // recovers files produced before the artifact write too;
                // fall back to the current list for legacy messages.
                const beforeFileNames = new Set(preTurn ?? nextFiles.map((f) => f.name));
                let recoveredExistingArtifact: ProjectFile | null = null;
                if (parsedArtifact?.html) {
                  const runStartedAt = status.createdAt || message.startedAt || message.createdAt;
                  recoveredExistingArtifact = findExistingArtifactProjectFile(
                    parsedArtifact,
                    nextFiles,
                    { minMtime: runStartedAt },
                  );
                  if (recoveredExistingArtifact) {
                    savedArtifactRef.current = recoveredExistingArtifact.name;
                    requestOpenFile(recoveredExistingArtifact.name);
                  } else {
                    await persistArtifact(parsedArtifact, nextFiles);
                    nextFiles = await refreshProjectFiles();
                  }
                }
                const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                if (produced.length > 0) {
                  updateMessageById(
                    message.id,
                    (prev) => ({ ...prev, producedFiles: produced }),
                    true,
                    { telemetryFinalized: true },
                  );
                }
                await auditDesignSystemWorkspaceAfterRun(message.id);
              })();
              onProjectsRefresh();
            },
            onError: (err) => {
              const errorCode = (err as Error & { code?: string }).code;
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              setError(err.message);
              appendAssistantErrorEvent(message.id, err.message, errorCode);
              updateMessageById(
                message.id,
                (prev) => ({
                  ...prev,
                  runStatus: 'failed',
                  endedAt: prev.endedAt ?? Date.now(),
                }),
                true,
              );
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearActiveRunRefs(reattachConversationId, controller, cancelController);
              clearStreamingMarker(reattachConversationId);
              persistNow({ telemetryFinalized: true });
            },
          },
          onRunStatus: (runStatus) => {
            textBuffer.flush();
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: isTerminalRunStatus(runStatus) ? prev.endedAt ?? Date.now() : prev.endedAt,
              }),
              true,
            );
            if (runStatus === 'canceled') {
              textBuffer.cancel();
              unregisterTextBuffer();
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearActiveRunRefs(reattachConversationId, controller, cancelController);
              clearStreamingMarker(reattachConversationId);
              persistNow({ telemetryFinalized: true });
            }
          },
          onRunEventId: (lastRunEventId) => {
            textBuffer.flush();
            updateMessageById(message.id, (prev) => ({ ...prev, lastRunEventId }));
            persistSoon();
          },
        })
          .catch((err) => {
            if ((err as Error).name !== 'AbortError') {
              const msg = err instanceof Error ? err.message : String(err);
              setError(msg);
              appendAssistantErrorEvent(message.id, msg);
              updateMessageById(
                message.id,
                (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
                true,
                { telemetryFinalized: true },
              );
            }
          })
          .finally(() => {
            textBuffer.flush();
            textBuffer.cancel();
            unregisterTextBuffer();
            if (persistTimer) clearTimeout(persistTimer);
            reattachControllersRef.current.delete(runId);
            reattachCancelControllersRef.current.delete(runId);
            clearActiveRunRefs(reattachConversationId, controller, cancelController);
          });
      }
    };

    void attachRecoverableRuns();
    return () => {
      cancelled = true;
    };
  }, [
    daemonLive,
    config.mode,
    activeConversationId,
    streaming,
    messages,
    project.id,
    updateMessageById,
    persistMessageById,
    auditDesignSystemWorkspaceAfterRun,
    markStreamingConversation,
    clearStreamingMarker,
    clearActiveRunRefs,
    refreshProjectFiles,
    persistArtifact,
    requestOpenFile,
    onProjectsRefresh,
  ]);

  const enqueueChatSend = useCallback((item: QueuedChatSend) => {
    const next = [...queuedChatSendsRef.current, item];
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
  }, []);

  const removeQueuedChatSend = useCallback((id: string) => {
    const next = queuedChatSendsRef.current.filter((item) => item.id !== id);
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
  }, []);

  const updateQueuedChatSend = useCallback((id: string, prompt: string) => {
    const next = queuedChatSendsRef.current.map((item) =>
      item.id === id ? { ...item, prompt } : item,
    );
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
  }, []);

  const prioritizeQueuedChatSend = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    const next = [item, ...queuedChatSendsRef.current.filter((candidate) => candidate.id !== id)];
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
  }, []);

  const handleSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[] = commentsToAttachments(attachedComments),
      meta?: ProjectChatSendMeta,
      baseMessages?: ChatMessage[],
    ) => {
      if (!activeConversationId) return;
      if (messagesConversationIdRef.current !== activeConversationId) return;
      const retryTarget = meta?.retryOfAssistantId
        ? resolveRetryTarget(messages, meta.retryOfAssistantId)
        : null;
      if (meta?.retryOfAssistantId && !retryTarget) return;
      const historyBase = retryTarget ? retryTarget.priorMessages : baseMessages ?? messages;
      if (
        !retryTarget &&
        !prompt.trim() &&
        attachments.length === 0 &&
        commentAttachments.length === 0
      ) return;
      if (currentConversationBusy) {
        enqueueChatSend({
          id: randomUUID(),
          conversationId: activeConversationId,
          prompt,
          attachments,
          commentAttachments,
          ...(meta === undefined ? {} : { meta }),
          createdAt: Date.now(),
        });
        if (commentAttachments.length > 0) {
          const reservedCommentIds = new Set(commentAttachments.map((attachment) => attachment.id));
          setAttachedComments((current) =>
            current.filter((comment) => !reservedCommentIds.has(comment.id)),
          );
        }
        return;
      }
      setChatSeed(null);
      const runConversationId = activeConversationId;
      setError(null);
      const startedAt = Date.now();
      const userMsg: ChatMessage = retryTarget?.userMsg ?? {
        id: randomUUID(),
        role: 'user',
        content: prompt,
        createdAt: startedAt,
        attachments: attachments.length > 0 ? attachments : undefined,
        commentAttachments: commentAttachments.length > 0 ? commentAttachments : undefined,
      };
      const runAttachments = userMsg.attachments ?? [];
      const runCommentAttachments = userMsg.commentAttachments ?? [];
      const selectedAgent =
        config.mode === 'daemon' && config.agentId
          ? agentsById.get(config.agentId)
          : null;
      const selectedAgentChoice =
        config.mode === 'daemon' && config.agentId
          ? config.agentModels?.[config.agentId]
          : undefined;
      const effectiveSelectedAgentChoice = effectiveAgentModelChoice(
        selectedAgent,
        selectedAgentChoice,
      );
      const assistantAgentId =
        config.mode === 'daemon'
          ? config.agentId ?? undefined
          : apiProtocolAgentId(config.apiProtocol);
      const assistantAgentName =
        config.mode === 'daemon'
          ? agentModelDisplayName(
              config.agentId,
              selectedAgent?.name,
              effectiveSelectedAgentChoice?.model,
            )
          : apiProtocolModelLabel(config.apiProtocol, config.model);
      const preTurnFileNames = projectFiles.map((f) => f.name);
      const assistantId = retryTarget?.failedAssistant.id ?? randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentId: assistantAgentId,
        agentName: assistantAgentName,
        events: [],
        createdAt: retryTarget?.failedAssistant.createdAt ?? startedAt,
        runStatus: config.mode === 'daemon' ? 'running' : undefined,
        startedAt,
        preTurnFileNames,
      };
      let latestAssistantMsg: ChatMessage = assistantMsg;
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === runConversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      activeCompletionNotificationRunsRef.current.add(assistantId);
      const nextHistory = retryTarget
        ? [...retryTarget.priorMessages, userMsg]
        : [...historyBase, userMsg];
      setMessages([...nextHistory, assistantMsg]);
      markStreamingConversation(runConversationId);
      updateConversationLatestRun(config.mode === 'daemon' ? 'running' : 'queued');
      setArtifact(null);
      savedArtifactRef.current = null;
      onTouchProject();
      if (!retryTarget) persistMessage(userMsg);
      // Intentionally do NOT persist `assistantMsg` here. In daemon mode it
      // starts as runStatus='running' with no runId, which the source-level
      // guard treats as a phantom — the first DB write happens inside
      // `onRunCreated` (below) once POST /api/runs returns a runId. In API
      // mode there is no runStatus, and the buffered text path will persist
      // as soon as the first delta lands.
      persistMessage(assistantMsg);
      if (runCommentAttachments.length > 0) {
        void patchAttachedStatuses(runCommentAttachments, 'applying');
        const consumedCommentIds = new Set(runCommentAttachments.map((attachment) => attachment.id));
        setAttachedComments((current) =>
          current.filter((comment) => !consumedCommentIds.has(comment.id)),
        );
      }
      // If this is the first turn, derive a working title from the prompt
      // so the conversation is identifiable in the dropdown without a
      // round-trip through the agent.
      if (!retryTarget && historyBase.length === 0) {
        const title = isDesignSystemWorkspacePrompt(prompt)
          ? DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE
          : prompt.slice(0, 60).trim();
        if (title) {
          setConversations((curr) =>
            curr.map((c) =>
              c.id === runConversationId ? { ...c, title } : c,
            ),
          );
          void patchConversation(project.id, runConversationId, { title });
        }
        const projectName = summarizeProjectNameFromPrompt(prompt);
        if (
          projectName &&
          projectName !== project.name &&
          canAutoRenameProjectFromPrompt(project)
        ) {
          const metadata = project.metadata
            ? { ...project.metadata, nameSource: 'prompt' as const }
            : undefined;
          const updated: Project = {
            ...project,
            name: projectName,
            ...(metadata ? { metadata } : {}),
            updatedAt: Date.now(),
          };
          onProjectChange(updated);
          void patchProject(project.id, {
            name: projectName,
            ...(metadata ? { metadata } : {}),
          });
        }
      }

      // Snapshot the file list at turn-start so we can diff after the
      // agent finishes and surface anything new (e.g. a generated .pptx)
      // as download chips on the assistant message.
      const beforeFileNames = new Set(preTurnFileNames);

      const parser = createArtifactParser();
      let parsedArtifact: Artifact | null = null;
      let liveHtml = '';
      let streamedText = '';

      const updateAssistant = (updater: (prev: ChatMessage) => ChatMessage) => {
        setMessages((curr) =>
          curr.map((m) => {
            if (m.id !== assistantId) return m;
            const updated = updater(m);
            latestAssistantMsg = updated;
            return updated;
          }),
        );
      };
      let persistTimer: ReturnType<typeof setTimeout> | null = null;
      const persistAssistantSoon = () => {
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
          persistTimer = null;
          persistMessageById(assistantId);
        }, 500);
      };
      const persistAssistantNowKeepalive = () => {
        if (persistTimer) {
          clearTimeout(persistTimer);
          persistTimer = null;
        }
        persistMessageById(assistantId, { keepalive: true });
      };
      const pushEvent = (ev: AgentEvent) => {
        textBuffer.flush();
        updateAssistant((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
        if (ev.kind === 'live_artifact') {
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts().then(() => {
            if (ev.action !== 'deleted') requestOpenFile(liveArtifactTabId(ev.artifactId));
          });
          onProjectsRefresh();
          return;
        }
        if (ev.kind === 'live_artifact_refresh') {
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts();
          onProjectsRefresh();
          return;
        }
        persistAssistantSoon();
        persistAssistantSoon();
        // Track Write tool invocations so we can auto-open the destination
        // file the moment the agent finishes writing it. The file-creating
        // tools we care about: Write (new file), Edit (existing file —
        // surfacing the freshly-modified file is also useful).
        if (ev.kind === 'tool_use' && ((ev.name === 'Write' || ev.name === 'write') || ev.name === 'Edit')) {
          const input = ev.input as { file_path?: unknown; filePath?: unknown } | null;
          const filePath = input?.file_path ?? input?.filePath;
          if (typeof filePath === 'string' && filePath.length > 0) {
            // Preserve the full path so decideAutoOpenAfterWrite can do a
            // path-suffix match against the project's relative file paths.
            // Reducing to a basename here would lose the segment alignment
            // we need to disambiguate same-basename collisions across the
            // project tree and outside it.
            pendingWritesRef.current.set(ev.id, filePath);
          }
        }
        if (ev.kind === 'tool_result') {
          const filePath = pendingWritesRef.current.get(ev.toolUseId);
          if (filePath) {
            pendingWritesRef.current.delete(ev.toolUseId);
            if (!ev.isError) {
              // Refresh first so FileWorkspace's file list (and the tab
              // body) sees the new content before we ask it to focus.
              // Only auto-open if the file actually landed in the project's
              // file list — otherwise an out-of-project Write (e.g. an
              // upstream repo edit) would spawn a permanent placeholder tab.
              void refreshProjectFiles().then(async (nextFiles) => {
                // A .jsx/.tsx loaded by a sibling HTML entry is a module of a
                // multi-file React prototype, not a standalone page — don't
                // strand the user on a dead-end preview tab. Issue #2744.
                const moduleFileNames = /\.(jsx|tsx)$/i.test(filePath)
                  ? await collectReferencedJsxNames(nextFiles, readProjectHtml)
                  : undefined;
                const decision = decideAutoOpenAfterWrite(filePath, nextFiles, {
                  moduleFileNames,
                });
                if (decision.shouldOpen && decision.fileName) {
                  requestOpenFile(decision.fileName);
                }
              });
            }
          }
        }
      };

      const applyContentDelta = (delta: string) => {
        for (const ev of parser.feed(delta)) {
          if (ev.type === 'artifact:start') {
            liveHtml = '';
            parsedArtifact = {
              identifier: ev.identifier,
              artifactType: ev.artifactType,
              title: ev.title,
              html: '',
            };
            setArtifact(parsedArtifact);
          } else if (ev.type === 'artifact:chunk') {
            liveHtml += ev.delta;
            parsedArtifact = parsedArtifact
              ? { ...parsedArtifact, html: liveHtml }
              : {
                  identifier: ev.identifier,
                  title: '',
                  html: liveHtml,
                };
            setArtifact((prev) =>
              prev
                ? { ...prev, html: liveHtml }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: liveHtml,
                  },
            );
          } else if (ev.type === 'artifact:end') {
            parsedArtifact = parsedArtifact
              ? { ...parsedArtifact, html: ev.fullContent }
              : {
                  identifier: ev.identifier,
                  title: '',
                  html: ev.fullContent,
                };
            setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
          }
        }
      };

      const textBuffer = createBufferedTextUpdates({
        updateMessage: updateAssistant,
        persistSoon: persistAssistantSoon,
        flushAndPersistNow: persistAssistantNowKeepalive,
        onContentDelta: applyContentDelta,
      });
      sendTextBufferRef.current = textBuffer;

      const controller = new AbortController();
      const cancelController = new AbortController();
      abortRef.current = controller;
      cancelRef.current = cancelController;
      const handlers = {
        onDelta: (delta: string) => {
          streamedText += delta;
          textBuffer.appendContent(delta);
        },
        onAgentEvent: (ev: AgentEvent) => {
          if (ev.kind === 'text') textBuffer.appendTextEvent(ev.text);
          else pushEvent(ev);
        },
        onDone: (fullText = '') => {
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          for (const ev of parser.flush()) {
            if (ev.type === 'artifact:end') {
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: ev.fullContent }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: ev.fullContent,
                  };
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
          }
          const emptyApiResponse =
            config.mode === 'api' &&
            !fullText.trim() &&
            !streamedText.trim() &&
            !liveHtml.trim();
          if (emptyApiResponse) {
            const endedAt = Date.now();
            const diagnostic = t('assistant.emptyResponseMessage');
            updateMessageById(
              assistantId,
              (prev) => ({
                ...prev,
                endedAt,
                runStatus: 'failed',
                events: [
                  ...(prev.events ?? []),
                  { kind: 'status', label: 'empty_response', detail: config.model },
                  { kind: 'text', text: diagnostic },
                ],
              }),
              true,
              { telemetryFinalized: true },
            );
            if (runCommentAttachments.length > 0) {
              void patchAttachedStatuses(runCommentAttachments, 'failed');
            }
            clearActiveRunRefs(runConversationId, controller, cancelController);
            clearStreamingMarker(runConversationId);
            updateConversationLatestRun('failed', endedAt);
            void refreshProjectFiles();
            onProjectsRefresh();
            return;
          }
          const endedAt = Date.now();
          let finalRunStatus: ChatMessage['runStatus'] = 'succeeded';
          updateAssistant((prev) => {
            finalRunStatus = resolveSucceededRunStatus(prev.runStatus);
            return {
              ...prev,
              endedAt,
              runStatus: finalRunStatus,
            };
          });
          if (runCommentAttachments.length > 0) {
            void patchAttachedStatuses(runCommentAttachments, 'needs_review');
          }
          clearActiveRunRefs(runConversationId, controller, cancelController);
          clearStreamingMarker(runConversationId);
          updateConversationLatestRun(finalRunStatus ?? 'succeeded', endedAt);
          // Refetch the file list directly (rather than just bumping the
          // refresh signal) so we can diff against the pre-turn snapshot
          // and attach the new files to the assistant message as download
          // chips.
          void (async () => {
            let nextFiles = await refreshProjectFiles();
            if (parsedArtifact?.html) {
              await persistArtifact(parsedArtifact, nextFiles);
              nextFiles = await refreshProjectFiles();
            }
            const produced = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
            setMessages((curr) => {
              const updated = curr.map((m) =>
                m.id === assistantId
                  ? { ...m, producedFiles: produced }
                  : m,
              );
              const finalized = updated.find((m) => m.id === assistantId);
              if (finalized) persistMessage(finalized, { telemetryFinalized: true });
              return updated;
            });
            await auditDesignSystemWorkspaceAfterRun(assistantId);
          })();
          onProjectsRefresh();
        },
        onError: (err: Error) => {
          const endedAt = Date.now();
          const errorCode = (err as Error & { code?: string }).code;
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          setError(err.message);
          appendAssistantErrorEvent(assistantId, err.message, errorCode);
          updateAssistant((prev) => ({
            ...prev,
            endedAt,
            runStatus: config.mode === 'api' || prev.runId || isActiveRunStatus(prev.runStatus)
              ? 'failed'
              : prev.runStatus,
          }));
          if (runCommentAttachments.length > 0) {
            void patchAttachedStatuses(runCommentAttachments, 'failed');
          }
          clearActiveRunRefs(runConversationId, controller, cancelController);
          clearStreamingMarker(runConversationId);
          updateConversationLatestRun('failed', endedAt);
          setMessages((curr) => {
            const finalized = curr.find((m) => m.id === assistantId);
            if (finalized) persistMessage(finalized, { telemetryFinalized: true });
            return curr;
          });
          void refreshProjectFiles();
        },
      };

      if (config.mode === 'daemon') {
        if (!config.agentId) {
          handlers.onError(new Error('Pick a local agent first (top bar).'));
          return;
        }
        const choice = effectiveSelectedAgentChoice;
        // v2 analytics: when the active project is a DS workspace
        // (created by `prepareCreatedDesignSystemProject`, identifiable
        // by `metadata.importedFrom === 'design-system'`), every run
        // started from this composer is a DS-variant run. Pass
        // analyticsHints so the daemon emits run_created /
        // run_finished under `page_name=design_system_project`,
        // `area=design_system_generation`, `project_kind=design_system`.
        // The first-ever message into a DS workspace is the auto-sent
        // generation kickoff (entry_from=`onboarding_design_system` is
        // the doc's name for "DS create flow handed off to the agent");
        // subsequent messages are review-driven regenerations
        // (`regenerate_from_review`). Use `messages.length === 0` —
        // truer than autoSendFirstMessageRef which races StrictMode
        // remounts + sessionStorage clears.
        const isDesignSystemWorkspaceProject =
          project.metadata?.importedFrom === 'design-system';
        const dsEntryFrom: 'onboarding_design_system' | 'regenerate_from_review' =
          messages.length === 0
            ? 'onboarding_design_system'
            : 'regenerate_from_review';
        const dsAnalyticsHints = isDesignSystemWorkspaceProject
          ? {
              entryFrom: dsEntryFrom,
              projectKind: 'design_system' as const,
              designSystemRunContext: {
                origin: 'manual_create' as const,
              },
            }
          : undefined;
        void streamViaDaemon({
          agentId: config.agentId,
          history: nextHistory,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          handlers,
          projectId: project.id,
          conversationId: runConversationId,
          assistantMessageId: assistantId,
          clientRequestId: randomUUID(),
          skillId: project.skillId ?? null,
          skillIds: Array.isArray(meta?.skillIds) ? meta.skillIds : [],
          context: meta?.context,
          designSystemId: project.designSystemId ?? null,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          research: meta?.research,
          mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata),
          model: choice?.model ?? null,
          reasoning: choice?.reasoning ?? null,
          locale,
          ...(dsAnalyticsHints ? { analyticsHints: dsAnalyticsHints } : {}),
          onRunCreated: (runId) => {
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
            };
            latestAssistantMsg = pinnedAssistant;
            // The view may already be on a different project/conversation;
            // pin the daemon run to the original row so returning can reattach.
            void saveMessage(project.id, runConversationId, pinnedAssistant);
            updateMessageById(assistantId, (prev) => ({ ...prev, runId, runStatus: 'queued' }));
          },
          onRunStatus: (runStatus) => {
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            updateMessageById(
              assistantId,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: endedAt === undefined ? prev.endedAt : prev.endedAt ?? endedAt,
              }),
              true,
              runStatus === 'canceled' ? { telemetryFinalized: true } : undefined,
            );
            updateConversationLatestRun(runStatus, endedAt);
            if (isTerminalRunStatus(runStatus)) {
              clearActiveRunRefs(runConversationId, controller, cancelController);
              clearStreamingMarker(runConversationId);
            }
          },
          onRunEventId: (lastRunEventId) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, lastRunEventId }));
            persistAssistantSoon();
          },
        });
      } else {
        // Mirror the daemon chat-route memory hook for BYOK chats. The
        // CLI path runs `extractFromMessage` BEFORE composing the prompt
        // (so an explicit "remember: X" / "我是 X" marker in this turn's
        // user message lands in memory in time for this turn's system
        // prompt), then queues `extractWithLLM` on child close (so the
        // small-model pass picks up implicit facts from the full
        // user+assistant exchange). BYOK chats never hit that route, so
        // we replicate both phases here against `/api/memory/extract`.
        // Without this, the Memory tab / model picker is a no-op for
        // BYOK users even though the UI saves model + index + entries
        // for that mode.
        const userText = (userMsg.content ?? '').trim();
        // Snapshot the live BYOK chat config so the daemon can run
        // "Same as chat" memory extraction against the same vendor /
        // key / baseUrl / apiVersion the user is chatting with. The
        // daemon never persists BYOK creds itself, so this per-call
        // signal is the only way `pickProvider()` can avoid falling
        // through to env / media-config (which is wrong for BYOK)
        // when no explicit memory model override is set. The picker
        // re-syncs an *explicit* override when chat config drifts;
        // this snapshot covers the implicit "Same as chat" default.
        const byokChatProvider =
          config.apiProtocol && config.apiKey
            ? {
                provider: config.apiProtocol,
                apiKey: config.apiKey,
                baseUrl: config.baseUrl,
                apiVersion:
                  config.apiProtocol === 'azure'
                    ? config.apiVersion ?? ''
                    : '',
              }
            : undefined;
        if (userText.length > 0) {
          try {
            await fetch('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userMessage: userText,
                projectId: project.id,
                conversationId: runConversationId,
                chatProvider: byokChatProvider,
              }),
            });
          } catch {
            // Best-effort: memory extraction must never block the
            // chat. The daemon's SSE bus will catch up the Memory tab
            // on the next event.
          }
        }
        const systemPrompt = await composedSystemPrompt();
        const apiHistory = await historyWithApiAttachmentContext(
          historyWithCommentAttachmentContext(nextHistory, userMsg.id),
          userMsg.id,
          project.id,
          projectFiles,
          { omitNativeImageAttachments: usesAnthropicProxy(config) },
        );
        pushEvent({ kind: 'status', label: 'requesting', detail: config.model });
        let accumulatedAssistantText = '';
        void streamMessage(config, systemPrompt, apiHistory, controller.signal, {
          onDelta: (delta) => {
            accumulatedAssistantText += delta;
            handlers.onDelta(delta);
            handlers.onAgentEvent({ kind: 'text', text: delta });
          },
          onDone: () => {
            handlers.onDone();
            const assistantText = accumulatedAssistantText.trim();
            if (userText.length === 0 || assistantText.length === 0) return;
            void fetch('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userMessage: userText,
                assistantMessage: accumulatedAssistantText,
                projectId: project.id,
                conversationId: runConversationId,
                chatProvider: byokChatProvider,
              }),
            }).catch(() => {
              // Best-effort: see comment above on the pre-turn call.
            });
          },
          onError: handlers.onError,
        }, {
          projectId: project.id,
          // SenseAudio BYOK chat reads this to pre-fill the tool param's
          // default model. Prefer the live composer override; fall back
          // to the Settings default when the composer dropdown is on
          // "use default". Other protocols ignore unknown body fields.
          byokImageModel: byokImageModelOverride || config.byokImageModel,
        });
      }
    },
    [
      attachedComments,
      activeConversationId,
      currentConversationBusy,
      enqueueChatSend,
      messages,
      config,
      locale,
      agentsById,
      composedSystemPrompt,
      onTouchProject,
      project.id,
      project.name,
      projectFiles,
      refreshProjectFiles,
      refreshLiveArtifacts,
      requestOpenFile,
      persistMessage,
      persistMessageById,
      auditDesignSystemWorkspaceAfterRun,
      patchAttachedStatuses,
      updateMessageById,
      markStreamingConversation,
      clearStreamingMarker,
      clearActiveRunRefs,
      onProjectsRefresh,
      onProjectChange,
    ],
  );

  const sendQueuedChatSendNow = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    if (currentConversationBusy) {
      prioritizeQueuedChatSend(id);
      return;
    }
    removeQueuedChatSend(id);
    void handleSend(
      item.prompt,
      item.attachments,
      item.commentAttachments,
      item.meta,
    );
  }, [currentConversationBusy, handleSend, prioritizeQueuedChatSend, removeQueuedChatSend]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (currentConversationBusy) return;
    if (messagesConversationIdRef.current !== activeConversationId) return;
    const next = queuedChatSendsRef.current.find(
      (item) => item.conversationId === activeConversationId,
    );
    if (!next) return;
    removeQueuedChatSend(next.id);
    void handleSend(
      next.prompt,
      next.attachments,
      next.commentAttachments,
      next.meta,
    );
  }, [
    activeConversationId,
    currentConversationBusy,
    queuedChatSends,
    handleSend,
    removeQueuedChatSend,
  ]);

  const handleRetry = useCallback(
    (assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      void handleSend('', [], [], { retryOfAssistantId: assistantMessage.id });
    },
    [currentConversationActionDisabled, handleSend],
  );

  // "Switch to AMR & retry" from the failed-run card: switch the run to AMR,
  // open Settings on the AMR controls so the user can sign in / authorize /
  // top up, and arm an auto-retry that fires once AMR is selected AND signed
  // in (see the effect below).
  const [pendingAmrRetry, setPendingAmrRetry] = useState<ChatMessage | null>(null);
  const handleSwitchToAmrAndRetry = useCallback(
    (failedAssistant: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      onModeChange('daemon');
      onAgentChange('amr');
      onOpenAmrSettings?.();
      setPendingAmrRetry(failedAssistant);
    },
    [currentConversationActionDisabled, onModeChange, onAgentChange, onOpenAmrSettings],
  );
  // PR #3157: Antigravity's `agy -p` cannot complete OAuth on its own,
  // so the auth banner offers a one-click "Sign in via terminal"
  // button that POSTs to the daemon. The daemon opens a system
  // Terminal running `agy` (osascript / x-terminal-emulator /
  // `cmd /c start`); the user finishes Google sign-in there and then
  // clicks Retry to redo the chat run. We don't auto-retry because
  // the OAuth completion happens externally with no reliable signal
  // back to the chat — the secondary Retry button on the same banner
  // covers the manual case.
  const handleLaunchAntigravityOauth = useCallback(async () => {
    try {
      const { launchAntigravityOauth } = await import('../providers/daemon');
      const result = await launchAntigravityOauth();
      if (!result.ok) {
        // Surface the daemon-side reason so the user knows whether
        // the spawn failed because of missing osascript / unsupported
        // platform / etc. instead of silently swallowing it.
        console.warn('[antigravity] oauth-launch failed:', result.error);
      }
    } catch (err) {
      console.warn('[antigravity] oauth-launch threw:', err);
    }
  }, []);
  // Poll the AMR login status while a retry is armed, rather than only reacting
  // to the AmrLoginPill's status event — the user may close Settings (which
  // unmounts the pill and stops its polling) before finishing sign-in in the
  // browser. Polling here keeps working regardless of the pill's lifecycle.
  // Fires once AMR is the selected agent AND the account is signed in.
  useEffect(() => {
    if (!pendingAmrRetry) return;
    let cancelled = false;
    const tryRetry = async () => {
      if (cancelled) return;
      if (!(config.mode === 'daemon' && config.agentId === 'amr')) return;
      const status = await fetchVelaLoginStatus().catch(() => null);
      if (cancelled || status?.loggedIn !== true) return;
      setPendingAmrRetry(null);
      handleRetry(pendingAmrRetry);
    };
    void tryRetry();
    const interval = setInterval(() => void tryRetry(), 2000);
    // Give up after a few minutes so we never poll forever.
    const stop = setTimeout(() => {
      if (!cancelled) setPendingAmrRetry(null);
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [pendingAmrRetry, config.mode, config.agentId, handleRetry]);

  useEffect(() => {
    if (!autoAuditRepairSeed) return;
    if (!activeConversationId) return;
    if (!messagesInitialized) return;
    if (currentConversationBusy) return;
    const repairText = autoAuditRepairSeed.value.trim();
    setAutoAuditRepairSeed(null);
    if (!repairText) return;
    void handleSend(repairText, [], []);
  }, [
    activeConversationId,
    autoAuditRepairSeed,
    currentConversationBusy,
    handleSend,
    messagesInitialized,
  ]);

  const handleSendBoardCommentAttachments = useCallback(
    async (commentAttachments: ChatCommentAttachment[]) => {
      if (currentConversationQueueDisabled || commentAttachments.length === 0) return false;
      setWorkspaceFocused(false);
      setCommentInspectorActive(false);
      await handleSend('', [], commentAttachments);
      return true;
    },
    [handleSend, currentConversationQueueDisabled],
  );
  const commentQueueOnSend = currentConversationBusy && !currentConversationQueueDisabled;

  const handleContinueRemainingTasks = useCallback(
    (_assistantMessage: ChatMessage, todos: TodoItem[]) => {
      if (currentConversationActionDisabled || todos.length === 0) return;
      const remainingList = todos
        .map((todo, i) => {
          const label =
            todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content;
          return `${i + 1}. [${todo.status}] ${label}`;
        })
        .join('\n');
      const prompt =
        'Continue the remaining unfinished tasks from the previous run. ' +
        'Do not redo completed work. Focus only on these unfinished todos:\n\n' +
        `${remainingList}\n\n` +
        'Before making changes, inspect the current project files as needed. ' +
        'Update TodoWrite as you complete each remaining task.';
      void handleSend(prompt, [], []);
    },
    [currentConversationActionDisabled, handleSend],
  );

  const selectedPluginActionAgent =
    config.mode === 'daemon' && config.agentId
      ? agentsById.get(config.agentId)
      : null;
  const selectedPluginActionChoice =
    config.mode === 'daemon' && config.agentId
      ? config.agentModels?.[config.agentId]
      : undefined;
  const effectiveSelectedPluginActionChoice = effectiveAgentModelChoice(
    selectedPluginActionAgent,
    selectedPluginActionChoice,
  );
  const pluginWorkflowAgentName =
    config.mode === 'daemon'
      ? agentModelDisplayName(
          config.agentId,
          selectedPluginActionAgent?.name,
          effectiveSelectedPluginActionChoice?.model,
        )
      : apiProtocolModelLabel(config.apiProtocol, config.model);

  const handlePluginFolderAgentAction = useCallback(
    async (relativePath: string, action: PluginFolderAgentAction) => {
      if (currentConversationActionDisabled || !activeConversationId) return;
      setHiddenAssistantPluginActionPaths((prev) => new Set(prev).add(relativePath));
      if (action === 'install') {
        setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
        let outcome;
        try {
          outcome = await installGeneratedPluginFolder(project.id, relativePath);
        } finally {
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
        if (!outcome.ok) throw new Error(outcome.message);
        return { message: outcome.message };
      }
      const conversationId = activeConversationId;
      const shareAction = action === 'publish' ? 'publish-github' : 'contribute-open-design';
      setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
      let taskStart;
      try {
        taskStart = await startGeneratedPluginShareTask(project.id, relativePath, shareAction);
      } catch (error) {
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        throw error;
      }
      const startedAt = taskStart.startedAt;
      const messageId = randomUUID();
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      const progressMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: pluginWorkflowStartContent(action, relativePath),
        agentName: pluginWorkflowAgentName,
        events: pluginWorkflowPlannedEvents(action, relativePath),
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      };
      setForceStreamingPluginMessageIds((prev) => new Set(prev).add(messageId));
      appendConversationMessage(conversationId, progressMessage, undefined, false);
      updateConversationLatestRun('running');
      void (async () => {
        let since = 0;
        let liveEvents = [...pluginWorkflowPlannedEvents(action, relativePath)];
        let liveContent = pluginWorkflowStartContent(action, relativePath);
        while (true) {
          const snapshot = await waitGeneratedPluginShareTask(taskStart.taskId, since, 25_000);
          since = snapshot.nextSince;
          if (snapshot.progress.length > 0) {
            const newTextEvents = snapshot.progress
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => ({ kind: 'text' as const, text: `${line}\n` }));
            liveEvents = [
              ...liveEvents.filter((event, index) => !(index === liveEvents.length - 1 && event.kind === 'status' && event.label === 'working')),
              ...newTextEvents,
              { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
            ];
            liveContent = `${liveContent}\n\n${snapshot.progress.map((line) => line.trim()).filter(Boolean).join('\n')}`.trim();
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: liveContent,
                events: liveEvents,
                runStatus: 'running',
              },
              undefined,
              false,
            );
          }
          if (snapshot.status === 'running' || snapshot.status === 'queued') continue;
          const endedAt = snapshot.endedAt ?? Date.now();
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          if (snapshot.status === 'done' && snapshot.result) {
            setForceStreamingPluginMessageIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: pluginWorkflowSuccessContent(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                ),
                events: pluginWorkflowResultEvents(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                  true,
                  liveEvents,
                ),
                endedAt,
                runStatus: 'succeeded',
              },
              { telemetryFinalized: true },
            );
            updateConversationLatestRun('succeeded', endedAt);
            return;
          }
          const errorMessage = snapshot.error?.message || `${pluginWorkflowTitle(action)} failed.`;
          setForceStreamingPluginMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
          replaceConversationMessage(
            conversationId,
            {
              ...progressMessage,
              content: pluginWorkflowFailureContent(
                action,
                relativePath,
                errorMessage,
                snapshot.error?.log,
              ),
              events: pluginWorkflowResultEvents(
                action,
                relativePath,
                errorMessage,
                undefined,
                snapshot.error?.log,
                false,
                liveEvents,
              ),
              endedAt,
              runStatus: 'failed',
            },
            { telemetryFinalized: true },
          );
          updateConversationLatestRun('failed', endedAt);
          return;
        }
      })().catch((err) => {
        const endedAt = Date.now();
        setForceStreamingPluginMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        replaceConversationMessage(
          conversationId,
          {
            ...progressMessage,
            content: pluginWorkflowFailureContent(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
            ),
            events: pluginWorkflowResultEvents(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
              undefined,
              [],
              false,
            ),
            endedAt,
            runStatus: 'failed',
          },
          { telemetryFinalized: true },
        );
        updateConversationLatestRun('failed', endedAt);
      });
      return;
    },
    [
      activeConversationId,
      appendConversationMessage,
      currentConversationActionDisabled,
      pluginWorkflowAgentName,
      project.id,
      replaceConversationMessage,
    ],
  );

  const sentDesignSystemReviewTaskKeysRef = useRef<Set<string>>(new Set());
  const persistDesignSystemReviewEntry = useCallback((
    sectionTitle: string,
    entry: DesignSystemReviewEntry,
  ) => {
    const baseMetadata: ProjectMetadata = {
      kind: project.metadata?.kind ?? 'other',
      ...project.metadata,
    };
    const metadata: ProjectMetadata = {
      ...baseMetadata,
      designSystemReview: {
        ...(baseMetadata.designSystemReview ?? {}),
        [sectionTitle]: entry,
      },
    };
    onProjectChange({ ...project, metadata });
    void patchProject(project.id, { metadata });
  }, [onProjectChange, project]);
  const sendDesignSystemFeedback = useCallback((
    sectionTitle: string,
    feedback: string,
    sectionFiles: string[],
  ): DesignSystemReviewAgentTask | void => {
    const cleanFeedback = feedback.trim();
    if (!cleanFeedback) return;
    const prompt = designSystemNeedsWorkPrompt(sectionTitle, cleanFeedback, sectionFiles);
    const queuedAt = new Date().toISOString();
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) {
      return {
        status: 'queued',
        prompt,
        queuedAt,
      };
    }
    const task: DesignSystemReviewAgentTask = {
      status: 'sent',
      prompt,
      queuedAt,
      sentAt: queuedAt,
    };
    sentDesignSystemReviewTaskKeysRef.current.add(`${sectionTitle}:${queuedAt}`);
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
    return task;
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    projectFiles,
  ]);
  const persistDesignSystemReviewDecision = useCallback((
    sectionTitle: string,
    decision: DesignSystemReviewEntry['decision'],
    details?: DesignSystemReviewDetails,
  ) => {
    const entry: DesignSystemReviewEntry = {
      decision,
      updatedAt: new Date().toISOString(),
    };
    if (details?.feedback) entry.feedback = details.feedback;
    if (details?.files) entry.files = details.files;
    if (details?.agentTask) entry.agentTask = details.agentTask;
    persistDesignSystemReviewEntry(sectionTitle, entry);
  }, [persistDesignSystemReviewEntry]);
  useEffect(() => {
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) return;
    const queued = Object.entries(project.metadata?.designSystemReview ?? {}).find(
      ([, entry]) =>
        entry.decision === 'needs-work'
        && Boolean(entry.feedback?.trim())
        && entry.agentTask?.status === 'queued',
    );
    if (!queued) return;
    const [sectionTitle, entry] = queued;
    const task = entry.agentTask;
    if (!task) return;
    const taskKey = `${sectionTitle}:${task.queuedAt}`;
    if (sentDesignSystemReviewTaskKeysRef.current.has(taskKey)) return;
    sentDesignSystemReviewTaskKeysRef.current.add(taskKey);
    const sectionFiles = entry.files ?? [];
    const prompt = task.prompt || designSystemNeedsWorkPrompt(
      sectionTitle,
      entry.feedback ?? '',
      sectionFiles,
    );
    const sentAt = new Date().toISOString();
    persistDesignSystemReviewEntry(sectionTitle, {
      ...entry,
      agentTask: {
        ...task,
        status: 'sent',
        prompt,
        sentAt,
      },
    });
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    persistDesignSystemReviewEntry,
    project.metadata?.designSystemReview,
    projectFiles,
  ]);

  const handleExportAsPptx = useCallback(
    (fileName: string) => {
      if (currentConversationActionDisabled) return;
      const prompt = buildPptxExportPrompt(fileName);
      const attachment: ChatAttachment = {
        path: fileName,
        name: fileName,
        kind: 'file',
      };
      void handleSend(prompt, [attachment], []);
    },
    [currentConversationActionDisabled, handleSend],
  );

  const handleStop = useCallback(() => {
    const stoppedAt = Date.now();
    cancelSendTextBuffer(true);
    cancelReattachTextBuffers(true);
    cancelRef.current?.abort();
    cancelRef.current = null;
    for (const controller of reattachCancelControllersRef.current.values()) {
      controller.abort();
    }
    reattachCancelControllersRef.current.clear();
    abortRef.current?.abort();
    abortRef.current = null;
    for (const controller of reattachControllersRef.current.values()) {
      controller.abort();
    }
    reattachControllersRef.current.clear();
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setMessages((curr) => {
      const { messages: next, finalized } = finalizeActiveAssistantMessagesOnStop(curr, stoppedAt);
      for (const message of finalized) persistMessage(message, { telemetryFinalized: true });
      return next;
    });
  }, [cancelSendTextBuffer, cancelReattachTextBuffers, persistMessage]);

  const handleNewConversation = useCallback(async () => {
    if (creatingConversationRef.current) return;
    // Only block if we're sure the current conversation is empty:
    // messages must be loaded AND match the active conversation.
    if (
      messagesConversationIdRef.current === activeConversationId &&
      messages.length === 0
    ) {
      return;
    }
    creatingConversationRef.current = true;
    setCreatingConversation(true);
    setConversationLoadError(null);
    try {
      const fresh = await createConversation(project.id);
      if (!fresh) throw new Error('Could not create a conversation for this project.');
      // Eagerly clear messages and update ref so rapid clicks don't create
      // duplicate empty conversations before the effect resolves.
      setMessages([]);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setMessagesConversationId(null);
      messagesConversationIdRef.current = fresh.id;
      setConversations((curr) => [fresh, ...curr]);
      setActiveConversationId(fresh.id);
      // Push the new conversation id into the URL synchronously so the
      // route-sync effect sees a matching `routeConversationId` before
      // it can revert `activeConversationId`. Without this, the route-sync
      // effect can fight the conversation switch, preventing users from
      // switching back to older conversations after creating a new one.
      navigate(
        {
          kind: 'project',
          projectId: project.id,
          conversationId: fresh.id,
          fileName: openTabsState.active ?? null,
        },
        { replace: true },
      );
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create a conversation for this project.';
      setConversationLoadError(message);
      setError(message);
    } finally {
      creatingConversationRef.current = false;
      setCreatingConversation(false);
    }
  }, [project.id, activeConversationId, messages.length, navigate, openTabsState.active]);

  const handleSelectConversation = useCallback((id: string) => {
    if (id === activeConversationId && failedMessagesConversationId !== id) return;
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setConversationLoadError(null);
    messagesConversationIdRef.current = null;
    setActiveConversationId(id);
    // Push the new conversation id into the URL synchronously so the
    // route-sync effect at L512 sees a matching `routeConversationId`
    // before it can find the previous conversation in the list and
    // revert `activeConversationId` to it. Without this, the same
    // effect that fights handleNewConversation also fights chat
    // switching, ping-ponging until React's nested-update guard fires.
    navigate(
      {
        kind: 'project',
        projectId: project.id,
        conversationId: id,
        fileName: openTabsState.active ?? null,
      },
      { replace: true },
    );
    setMessageLoadRetryNonce((nonce) => nonce + 1);
  }, [activeConversationId, failedMessagesConversationId, project.id, openTabsState.active]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const ok = await deleteConversationApi(project.id, id);
      if (!ok) return;
      // The deleted conversation may have owned an unanswered
      // `<question-form>`, which the daemon counts toward the project's
      // `needsInput` flag in `/api/projects`. Home cards render that
      // flag from the cached projects payload, so without refreshing
      // it here the `Needs input` badge survives the deletion until
      // the next manual reload.
      onProjectsRefresh();
      setConversations((curr) => {
        const next = curr.filter((c) => c.id !== id);
        if (next.length === 0) {
          // Re-seed so the project always has at least one conversation
          // to write into.
          void createConversation(project.id).then((fresh) => {
            if (fresh) {
              setConversations([fresh]);
              setActiveConversationId(fresh.id);
            }
          });
        } else if (id === activeConversationId) {
          setActiveConversationId(next[0]!.id);
        }
        return next;
      });
    },
    [project.id, activeConversationId, onProjectsRefresh],
  );

  const handleProjectRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === project.name) return;
      const metadata = project.metadata
        ? { ...project.metadata, nameSource: 'user' as const }
        : undefined;
      const updated: Project = {
        ...project,
        name: trimmed,
        ...(metadata ? { metadata } : {}),
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void patchProject(project.id, {
        name: trimmed,
        ...(metadata ? { metadata } : {}),
      });
    },
    [project, onProjectChange],
  );

  const handleChangeDesignSystemId = useCallback(
    (nextId: string | null) => {
      if ((project.designSystemId ?? null) === nextId) return;
      // `design_system_apply_result` studio variant. The existing
      // NewProjectPanel picker fires the same event under
      // `page_name=home`; this in-project header picker fires under
      // `page_name=studio` so the funnel sees applies from both
      // surfaces. `target_project_kind` derives from
      // `project.metadata.kind`.
      const target =
        (projectKindToTracking(project.metadata?.kind ?? null) ?? 'unknown') as TrackingDesignSystemApplyTargetKind;
      const picked = nextId
        ? designSystems.find((d) => d.id === nextId)
        : null;
      const origin: TrackingDesignSystemOrigin | undefined = picked
        ? picked.source === 'user'
          ? 'manual_create'
          : picked.source === 'built-in'
            ? 'official_preset'
            : picked.source === 'installed'
              ? 'template'
              : 'unknown'
        : undefined;
      const status: TrackingDesignSystemStatusValue | undefined = picked
        ? picked.status === 'draft' || picked.status === 'published'
          ? picked.status
          : 'unknown'
        : undefined;
      if (nextId === null) {
        trackDesignSystemApplyResult(analytics.track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'clear_selection',
          result: 'success',
          target_project_kind: target,
          design_system_applied: false,
          design_system_selection_mode: 'none',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      } else {
        trackDesignSystemApplyResult(analytics.track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'select_design_system',
          result: 'success',
          target_project_kind: target,
          design_system_id: nextId,
          design_system_source: origin,
          design_system_status: status,
          design_system_applied: true,
          design_system_selection_mode: 'manual',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      }
      const updated: Project = {
        ...project,
        designSystemId: nextId,
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void patchProject(project.id, { designSystemId: nextId });
    },
    [project, onProjectChange, designSystems, analytics.track],
  );

  const projectMeta = useMemo(() => {
    // Design system is rendered by the adjacent picker chip — keep the
    // bare meta string focused on skill / mode so the two surfaces
    // don't show the same label twice.
    const summary =
      skills.find((s) => s.id === project.skillId) ??
      designTemplates.find((s) => s.id === project.skillId);
    const skill = summary?.name;
    return skill ?? t('project.metaFreeform');
  }, [skills, designTemplates, project.skillId, t]);

  const activeDesignSystemSummary = useMemo(() => {
    if (!project.designSystemId) return null;
    return designSystems.find((d) => d.id === project.designSystemId) ?? null;
  }, [designSystems, project.designSystemId]);

  const designSystemProject = useMemo(() => {
    if (project.metadata?.importedFrom !== 'design-system') return null;
    if (!project.designSystemId) return null;
    return designSystems.find((d) => d.id === project.designSystemId) ?? null;
  }, [designSystems, project.designSystemId, project.metadata?.importedFrom]);
  const designSystemActivityEvents = useMemo(
    () => designSystemProject ? latestDesignSystemActivityEvents(messages) : [],
    [designSystemProject, messages],
  );
  const connectRepoNeeded = useMemo(
    () => designSystemNeedsRepoConnect(designSystemProject, projectFiles.map((file) => file.name)),
    [designSystemProject, projectFiles],
  );
  // Only the connect-repo CTA copy depends on this (connect vs re-import), so
  // resolve it lazily and only while the CTA is actually showing. Tri-state:
  // `undefined` means the status fetch has not resolved yet, which keeps the
  // CTA neutral and disabled so a fast click can't fire the wrong action.
  const [githubConnected, setGithubConnected] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!connectRepoNeeded) {
      setGithubConnected(undefined);
      return;
    }
    let aborted = false;
    const controller = new AbortController();
    const refresh = () => {
      void fetchConnectorStatuses({ signal: controller.signal }).then((statuses) => {
        if (!aborted) setGithubConnected(statuses.github?.status === 'connected');
      });
    };
    refresh();
    // Connecting GitHub happens in the Connectors dialog or an external OAuth
    // window, neither of which changes connectRepoNeeded. Re-check on focus so
    // the CTA flips from "Connect GitHub" to "Import repo" when the user returns.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      aborted = true;
      controller.abort();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [connectRepoNeeded]);

  // Signal that pushes a draft into the chat composer (the "Import repo" CTA).
  const [composerDraftSignal, setComposerDraftSignal] = useState<{ text: string; nonce: number }>();
  // One handler for both the review banner and the chat CTA. When GitHub is
  // not connected it opens Connectors; once connected it prefills the composer
  // with the import instruction so the user can review and send it.
  const handleConnectRepo = useCallback(() => {
    // Status not resolved yet; the CTA is disabled in this window, but guard
    // anyway so a stray call can't route a connected account to Connectors.
    if (githubConnected === undefined) return;
    if (githubConnected) {
      setComposerDraftSignal({
        text: buildRepoImportPrompt(designSystemProject, projectFiles.map((file) => file.name)),
        nonce: Date.now(),
      });
    } else {
      onOpenSettings('composio');
    }
  }, [githubConnected, onOpenSettings, designSystemProject, projectFiles]);

  const isDeck = useMemo(
    () =>
      (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))?.mode === 'deck',
    [skills, designTemplates, project.skillId],
  );
  const chatResizeLabel = t('project.resizeChatPanel');
  const workspacePanelTrack =
    workspacePanelMinWidth === 0
      ? 'minmax(0, 1fr)'
      : `minmax(${workspacePanelMinWidth}px, 1fr)`;
  const chatPanelAriaMinWidth = Math.min(MIN_CHAT_PANEL_WIDTH, chatPanelMaxWidth);

  const renderPreferredChatPanelWidth = useCallback((
    preferredWidth: number,
    maxWidth = chatPanelMaxWidthRef.current,
  ): number => {
    const next = clampChatPanelWidth(preferredWidth, maxWidth);
    chatPanelWidthRef.current = next;
    setChatPanelWidth(next);
    return next;
  }, []);

  const applyChatPanelWidth = useCallback((width: number): number => {
    const nextPreferred = clampPreferredChatPanelWidth(
      clampChatPanelWidth(width, chatPanelMaxWidthRef.current),
    );
    preferredChatPanelWidthRef.current = nextPreferred;
    return renderPreferredChatPanelWidth(nextPreferred);
  }, [renderPreferredChatPanelWidth]);

  const finishChatPanelResize = useCallback((saveFinalWidth = true) => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    if (pointerFrameRef.current !== null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerClientXRef.current = null;
    resizeStateRef.current = null;
    setResizingChatPanel(false);
    if (saveFinalWidth) saveChatPanelWidth(preferredChatPanelWidthRef.current);
  }, []);

  useEffect(() => {
    chatPanelWidthRef.current = chatPanelWidth;
  }, [chatPanelWidth]);

  useEffect(() => {
    chatPanelMaxWidthRef.current = chatPanelMaxWidth;
  }, [chatPanelMaxWidth]);

  useLayoutEffect(() => {
    const split = splitRef.current;
    if (!split) return undefined;

    const updateAllowedWidth = () => {
      const splitWidth = split.clientWidth;
      const nextWorkspaceMin = workspacePanelMinWidthForSplit(splitWidth);
      const nextMax = maxChatPanelWidthForSplit(splitWidth);
      chatPanelMaxWidthRef.current = nextMax;
      setWorkspacePanelMinWidth(nextWorkspaceMin);
      setChatPanelMaxWidth(nextMax);
      renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current, nextMax);
    };

    updateAllowedWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateAllowedWidth);
      observer.observe(split);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateAllowedWidth);
    return () => window.removeEventListener('resize', updateAllowedWidth);
  }, [renderPreferredChatPanelWidth]);

  useEffect(() => () => finishChatPanelResize(false), [finishChatPanelResize]);

  const handleChatResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const split = splitRef.current;
    if (!split) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerCleanupRef.current?.();
    setResizingChatPanel(true);
    resizeStartPreferredWidthRef.current = preferredChatPanelWidthRef.current;

    const updateWidthFromClientX = (clientX: number) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = clientX - state.startClientX;
      if (delta === 0 && !state.hasMoved) return;
      state.hasMoved = true;
      const rawWidth = state.startWidth + (state.isRtl ? -delta : delta);
      applyChatPanelWidth(rawWidth);
    };

    const flushPendingPointerMove = () => {
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
        pointerFrameRef.current = null;
      }
      const clientX = pendingPointerClientXRef.current;
      pendingPointerClientXRef.current = null;
      if (clientX !== null) updateWidthFromClientX(clientX);
    };

    resizeStateRef.current = {
      startClientX: event.clientX,
      startWidth: chatPanelWidthRef.current,
      isRtl: window.getComputedStyle(split).direction === 'rtl',
      hasMoved: false,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      pendingPointerClientXRef.current = moveEvent.clientX;
      if (pointerFrameRef.current !== null) return;
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        flushPendingPointerMove();
      });
    };
    const handlePointerEnd = () => {
      flushPendingPointerMove();
      finishChatPanelResize(true);
    };
    const handlePointerCancel = () => {
      flushPendingPointerMove();
      preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
      renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
      finishChatPanelResize(false);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handlePointerCancel);
    };

    pointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handlePointerCancel);
  }, [applyChatPanelWidth, finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeBlur = useCallback(() => {
    if (!pointerCleanupRef.current) return;
    preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
    renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
    finishChatPanelResize(false);
  }, [finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    const split = splitRef.current;
    const isRtl = split ? window.getComputedStyle(split).direction === 'rtl' : false;
    if (event.key === 'ArrowLeft') {
      nextWidth = chatPanelWidthRef.current + (isRtl ? 1 : -1) * CHAT_PANEL_KEYBOARD_STEP;
    } else if (event.key === 'ArrowRight') {
      nextWidth = chatPanelWidthRef.current + (isRtl ? -1 : 1) * CHAT_PANEL_KEYBOARD_STEP;
    } else if (event.key === 'Home') {
      nextWidth = MIN_CHAT_PANEL_WIDTH;
    } else if (event.key === 'End') {
      nextWidth = chatPanelMaxWidthRef.current;
    }
    if (nextWidth === null) return;
    event.preventDefault();
    const next = applyChatPanelWidth(nextWidth);
    saveChatPanelWidth(next);
  }, [applyChatPanelWidth]);

  // Hand the pending prompt to ChatPane exactly once per project. The local
  // project-scoped snapshot survives the conversation-id remount, while the
  // persisted pendingPrompt is cleared so refreshes and later entries do not
  // re-seed the composer.
  //
  // PluginLoopHome auto-send case: when the project was created with
  // `autoSendFirstMessage`, app.tsx left a sessionStorage flag telling us
  // to fire the prompt as a real user message immediately. We must NOT
  // seed initialDraft in that case — otherwise the textarea echoes the
  // prompt while it is also streaming as the first user message. The ref
  // captures the prompt independently so downstream effects can still
  // dispatch the auto-send without going through initialDraft.
  const autoSendSeedRef = useRef<string | null>(null);
  const autoSendAttachmentsRef = useRef<ChatAttachment[] | null>(null);
  const autoSendFirstMessageRef = useRef(false);
  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    try {
      isAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
    } catch {
      /* sessionStorage may be unavailable; treat as manual flow. */
    }
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendSeedRef.current = isAutoSend ? (project.pendingPrompt ?? '') : '';
    autoSendAttachmentsRef.current = isAutoSend ? readAutoSendAttachments(project.id) : [];
  }
  const [initialDraft, setInitialDraft] = useState<
    { projectId: string; value: string } | undefined
  >(
    autoSendSeedRef.current || !project.pendingPrompt
      ? undefined
      : { projectId: project.id, value: project.pendingPrompt },
  );
  useEffect(() => {
    const pendingPrompt = project.pendingPrompt;
    if (!pendingPrompt) return;
    if (autoSendFirstMessageRef.current) {
      onClearPendingPrompt();
      return;
    }
    setInitialDraft((current) =>
      current?.projectId === project.id
        ? current
        : { projectId: project.id, value: pendingPrompt },
    );
    onClearPendingPrompt();
  }, [project.id, project.pendingPrompt, onClearPendingPrompt]);
  const chatInitialDraft =
    chatSeed?.value ?? (initialDraft?.projectId === project.id ? initialDraft.value : undefined);

  // Continue in CLI / Finalize design package handlers + keyboard
  // shortcut wiring. Close to the JSX so the data flow is easy to
  // trace from the toolbar back to its sources.
  const handleFinalize = useCallback(() => {
    const request = buildFinalizeRequest(config);
    if (!request) {
      setProjectActionsToast(buildFinalizeCredentialsMissingToast(config));
      return;
    }
    void finalize.trigger(request).then((result) => {
      if (result) void designMdState.refresh();
    });
  }, [finalize, config, designMdState]);

  const handleCancelFinalize = useCallback(() => {
    finalize.cancel();
  }, [finalize]);

  const handleContinueInCli = useCallback(async () => {
    const projectDir = projectDetail.resolvedDir;
    if (!projectDir) {
      setProjectActionsToast({
        message: 'Working directory unavailable. Update the daemon to enable Continue in CLI.',
        details: null,
      });
      return;
    }
    const prompt = buildClipboardPrompt({
      project: { id: project.id, name: project.name },
      designMdState: {
        generatedAt: designMdState.generatedAt,
        transcriptMessageCount: designMdState.transcriptMessageCount,
        designSystemId: designMdState.designSystemId,
        currentArtifact: designMdState.currentArtifact,
      },
      projectDir,
    });
    const copied = await copyToClipboard(prompt);
    if (!copied) {
      // Clipboard write failed in both the canonical and execCommand
      // fallback paths (locked clipboard / insecure context). Surface
      // the prompt body in the toast so the user can manually
      // select-and-copy. Do not open the folder — the user has nothing
      // to paste yet.
      setProjectActionsToast({
        message: 'Clipboard unavailable. Copy this prompt manually, then run `claude` at the working directory.',
        details: `Working directory: ${projectDir}`,
        code: prompt,
      });
      return;
    }
    const launched = await terminalLauncher.open(project.id);
    setProjectActionsToast(buildContinueInCliToast(projectDir, launched));
  }, [
    project.id,
    project.name,
    projectDetail.resolvedDir,
    designMdState.generatedAt,
    designMdState.transcriptMessageCount,
    designMdState.designSystemId,
    designMdState.currentArtifact,
    terminalLauncher,
  ]);

  // Defensive: if the conversation already has messages once they
  // hydrate, the pendingPrompt that seeded the composer is stale (the
  // user sent it earlier but onClearPendingPrompt did not get a chance
  // to patch the server before the page reloaded). Drop the seed so the
  // textarea does not echo a prompt the user already submitted.
  useEffect(() => {
    if (initialDraft && messages.length > 0) {
      setInitialDraft(undefined);
    }
  }, [initialDraft, messages.length]);

  // §8.4 — when the project was created with a plugin pinned (the
  // PluginLoopHome → POST /api/projects path), fetch the immutable
  // snapshot once so ChatPane can render the active plugin as a
  // context chip on user messages instead of re-rendering the inline
  // plugin rail. Re-fetches when the pinned id changes; cancelled if
  // the project switches away mid-flight to avoid setState-on-unmount.
  const [activePluginSnapshot, setActivePluginSnapshot] =
    useState<AppliedPluginSnapshot | null>(null);
  useEffect(() => {
    const snapshotId = project.appliedPluginSnapshotId;
    if (!snapshotId) {
      setActivePluginSnapshot(null);
      return;
    }
    let cancelled = false;
    void fetchAppliedPluginSnapshot(snapshotId).then((snap) => {
      if (cancelled) return;
      setActivePluginSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [project.appliedPluginSnapshotId]);
  const chatDesignSystemSummary = useMemo(() => {
    if (activeDesignSystemSummary) return activeDesignSystemSummary;
    const designSystemName = activePluginSnapshot?.inputs?.designSystem;
    if (typeof designSystemName !== 'string') return null;
    const normalized = designSystemName.trim();
    if (!normalized || normalized === 'the active project design system') return null;
    return designSystems.find((d) => d.title === normalized) ?? null;
  }, [activeDesignSystemSummary, activePluginSnapshot?.inputs, designSystems]);

  // Lift finalize errors into the shared project-actions toast so the
  // user sees both the daemon's category message and any upstream
  // detail (per #450 verification commitment).
  useEffect(() => {
    if (finalize.error) {
      setProjectActionsToast({
        message: finalize.error.message,
        details: finalize.error.details,
      });
    }
  }, [finalize.error]);

  // ⌘+Shift+K (mac) / Ctrl+Shift+K (others) → Continue in CLI. Mirrors
  // the capture-phase, platform-gated pattern from FileWorkspace's
  // Quick Switcher shortcut. ⌘+Shift+K is free (⌘+P is the only
  // existing primary-modifier shortcut on this surface).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        if (e.isComposing) return;
        if (!designMdState.exists) return;
        e.preventDefault();
        void handleContinueInCli();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [designMdState.exists, handleContinueInCli]);

  // PluginLoopHome auto-send: when the user submits on Home, app.tsx
  // sets `sessionStorage['od:auto-send-first:<projectId>']` and routes
  // through createProject. Once the conversation id resolves and the
  // composer is mounted, fire handleSend(pendingPrompt) exactly once so
  // the user lands inside a running pipeline without an extra click.
  // We gate on `messages.length === 0` so a refresh after the run is
  // mid-flight never double-fires; the sessionStorage flag is cleared
  // immediately after the first dispatch.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!activeConversationId) return;
    // Wait for the initial listMessages DB read to land. Without this gate
    // the auto-send fires before the in-flight DB response, which then
    // arrives with `setMessages([])` and wipes the freshly-pushed user +
    // assistant placeholder out of React state — leaving the daemon's run
    // with no in-memory message to attach the runId to.
    if (!messagesInitialized) return;
    if (streaming) return;
    if (messages.length > 0) return;
    let flag: string | null = null;
    try {
      flag = window.sessionStorage.getItem(autoSendFirstMessageKey(project.id));
    } catch {
      flag = null;
    }
    if (!flag) return;
    // Prefer the seed captured at mount (autoSendSeedRef) — it survives
    // even after onClearPendingPrompt wipes project.pendingPrompt on the
    // server. Fall back to the live values for any edge case where the
    // ref was not populated (e.g. sessionStorage error path).
    const seed = (
      autoSendSeedRef.current ||
      (initialDraft?.projectId === project.id ? initialDraft.value : '') ||
      project.pendingPrompt ||
      ''
    ).trim();
    const attachments = autoSendAttachmentsRef.current ?? [];
    if (!seed && attachments.length === 0) {
      autoSentRef.current = true;
      clearAutoSendSession(project.id);
      return;
    }
    autoSentRef.current = true;
    if (isDesignSystemWorkspaceMetadata(project.metadata)) {
      markDesignSystemAuditAutoRepairEligible(project.id);
    }
    clearAutoSendSession(project.id);
    autoSendAttachmentsRef.current = [];
    void handleSend(seed, attachments, []);
  }, [
    activeConversationId,
    messagesInitialized,
    streaming,
    messages.length,
    project.id,
    project.metadata,
    initialDraft,
    project.pendingPrompt,
    handleSend,
  ]);

  // Wire the Critique Theater drop-in mount into the project workspace.
  // The hook reads the M1 Settings toggle out of the existing
  // `open-design:config` localStorage blob and stays in sync with the
  // platform `storage` event (cross-tab) plus the same-tab
  // `open-design:critique-theater-toggle` CustomEvent. The mount itself
  // returns `null` until the daemon emits a `critique.run_started` for
  // the active project, so the visual surface is unchanged for users
  // who have not opted in. The daemon-side gate
  // (`isCritiqueEnabled(...)` in `apps/daemon/src/server.ts`) is the
  // authority for whether a run is actually wired through the critique
  // pipeline; this hook only governs whether the web layer renders the
  // resulting SSE stream.
  const critiqueTheaterEnabled = useCritiqueTheaterEnabled();

  return (
    <div className="app">
      <CritiqueTheaterMount
        projectId={project.id}
        enabled={critiqueTheaterEnabled}
      />
      {/* ProjectActionsToolbar removed per 00efdcba — hide finalize-design
          toolbar from project header. Restore from cf1cd9bb if product
          wants the Finalize + Continue-in-CLI buttons back in the chrome. */}
      <div
        ref={splitRef}
        className={[
          projectSplitClassName(workspaceFocused),
          leftInspectorActive && !workspaceFocused ? 'split-manual-edit' : '',
          resizingChatPanel && !workspaceFocused ? 'is-resizing-chat' : '',
        ].filter(Boolean).join(' ')}
        style={workspaceFocused
          ? undefined
          : {
              gridTemplateColumns:
                `${chatPanelWidth}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`,
            }}
      >
        <div className="split-chat-slot" hidden={workspaceFocused}>
          {commentInspectorActive ? (
            <div
              id={commentInspectorPortalId}
              className="comment-left-host"
              aria-label="Comments"
            />
          ) : activeConversationId || conversationLoadError ? (
            <ChatPane
              // The conversation id is part of the key so switching conversations
              // resets internal scroll/draft state inside ChatPane and ChatComposer.
              key={`${project.id}:${activeConversationId ?? 'conversation-unavailable'}:${chatSeed?.id ?? 'ready'}`}
              messages={messages}
              streaming={currentConversationStreaming}
              sendDisabled={currentConversationSendDisabled}
              queuedItems={currentConversationQueuedItems}
              error={conversationLoadError ?? error ?? audioVoiceOptionsError}
              projectId={project.id}
              projectKindForTracking={projectKindToTracking(project.metadata?.kind)}
              projectFiles={projectFiles}
              hasActiveDesignSystem={!!project.designSystemId}
              activeDesignSystem={chatDesignSystemSummary}
              projectFileNames={projectFileNames}
              skills={skills}
              onEnsureProject={handleEnsureProject}
              previewComments={previewComments}
              attachedComments={attachedComments}
              onAttachComment={attachPreviewComment}
              onDetachComment={detachPreviewComment}
              onDeleteComment={(commentId) => void removePreviewComment(commentId)}
              onSend={handleSend}
              onRetry={handleRetry}
              onStop={handleStop}
              onRemoveQueuedSend={removeQueuedChatSend}
              onUpdateQueuedSend={updateQueuedChatSend}
              onSendQueuedNow={sendQueuedChatSendNow}
              onRequestOpenFile={requestOpenFile}
              onRequestPluginFolderAgentAction={handlePluginFolderAgentAction}
              activePluginActionPaths={activePluginActionPaths}
              hiddenPluginActionPaths={hiddenAssistantPluginActionPaths}
              forceStreamingMessageIds={forceStreamingPluginMessageIds}
              initialDraft={chatInitialDraft}
              onSubmitForm={(text) => {
                if (currentConversationActionDisabled) return;
                void handleSend(text, [], []);
              }}
              onContinueRemainingTasks={handleContinueRemainingTasks}
              onAssistantFeedback={handleAssistantFeedback}
              onNewConversation={handleNewConversation}
              newConversationDisabled={newConversationDisabled}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onOpenSettings={onOpenSettings}
              onOpenAmrSettings={onOpenAmrSettings}
              onSwitchToAmrAndRetry={handleSwitchToAmrAndRetry}
              onLaunchAntigravityOauth={handleLaunchAntigravityOauth}
              onOpenMcpSettings={onOpenMcpSettings}
              connectRepoNeeded={connectRepoNeeded}
              githubConnected={githubConnected}
              onConnectRepo={handleConnectRepo}
              composerDraftSignal={composerDraftSignal}
              petConfig={config.pet}
              onAdoptPet={onAdoptPetInline}
              onTogglePet={onTogglePet}
              onOpenPetSettings={onOpenPetSettings}
              researchAvailable={config.mode === 'daemon'}
              byokApiProtocol={config.apiProtocol}
              byokImageModel={byokImageModelOverride}
              onChangeByokImageModel={setByokImageModelOverride}
              projectMetadata={project.metadata}
              onProjectMetadataChange={(metadata) => {
                onProjectChange({ ...project, metadata });
              }}
              currentSkillId={project.skillId}
              onProjectSkillChange={(skillId) => {
                onProjectChange({ ...project, skillId });
              }}
              activePluginSnapshot={activePluginSnapshot}
              currentDesignSystemId={project.designSystemId}
              onActiveDesignSystemChange={(updatedProject) => {
                onProjectChange(updatedProject);
              }}
              onShowToast={(message) => {
                setProjectActionsToast({ message, details: null });
              }}
              onBack={onBack}
              backLabel={t('project.backToProjects')}
              projectHeader={(
                <span className="chat-project-title-line">
                  <span
                    className="title editable"
                    data-testid="project-title"
                    title={project.name}
                    tabIndex={0}
                    role="textbox"
                    suppressContentEditableWarning
                    contentEditable
                    onBlur={(e) => handleProjectRename(e.currentTarget.textContent ?? '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                  >
                    {project.name}
                  </span>
                  {projectMeta !== t('project.metaFreeform') ? (
                    <span className="meta" data-testid="project-meta">{projectMeta}</span>
                  ) : null}
                </span>
              )}
              designSystemPicker={(
                <ProjectDesignSystemPicker
                  designSystems={designSystems}
                  selectedId={project.designSystemId ?? null}
                  onChange={handleChangeDesignSystemId}
                />
              )}
            />
          ) : (
            <div className="pane" data-testid="chat-pane-loading">
              <CenteredLoader />
            </div>
          )}
        </div>
        {!workspaceFocused ? (
          leftInspectorActive ? (
            <div className="split-edit-divider" aria-hidden />
          ) : (
            <div
              className="split-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label={chatResizeLabel}
              aria-valuemin={chatPanelAriaMinWidth}
              aria-valuemax={chatPanelMaxWidth}
              aria-valuenow={chatPanelWidth}
              tabIndex={0}
              title={chatResizeLabel}
              onPointerDown={handleChatResizePointerDown}
              onKeyDown={handleChatResizeKeyDown}
              onBlur={handleChatResizeBlur}
            />
          )
        ) : null}
        <FileWorkspace
          projectId={project.id}
          projectKind={projectKindToTracking(project.metadata?.kind) ?? 'prototype'}
          files={projectFiles}
          liveArtifacts={liveArtifacts}
          filesRefreshKey={filesRefresh}
          onRefreshFiles={() => {
            void refreshWorkspaceItems();
          }}
          isDeck={isDeck}
          onExportAsPptx={handleExportAsPptx}
          streaming={currentConversationActionDisabled}
          commentQueueOnSend={commentQueueOnSend}
          commentSendDisabled={currentConversationQueueDisabled}
          openRequest={openRequest}
          liveArtifactEvents={liveArtifactEvents}
          designSystemActivityEvents={designSystemActivityEvents}
          tabsState={openTabsState}
          onTabsStateChange={persistTabsState}
          previewComments={previewComments}
          onSavePreviewComment={savePreviewComment}
          onRemovePreviewComment={removePreviewComment}
          onSendBoardCommentAttachments={handleSendBoardCommentAttachments}
          onPluginFolderAgentAction={handlePluginFolderAgentAction}
          activePluginActionPaths={activePluginActionPaths}
          focusMode={workspaceFocused}
          onFocusModeChange={setWorkspaceFocused}
          designSystemProject={designSystemProject}
          defaultDesignSystemId={config.designSystemId}
          onSetDefaultDesignSystem={onChangeDefaultDesignSystem}
          onDesignSystemsRefresh={onDesignSystemsRefresh}
          onDesignSystemNeedsWork={sendDesignSystemFeedback}
          designSystemReview={project.metadata?.designSystemReview}
          onDesignSystemReviewDecision={persistDesignSystemReviewDecision}
          onConnectRepo={handleConnectRepo}
          githubConnected={githubConnected}
          commentPortalId={commentInspectorPortalId}
          onCommentModeChange={setCommentInspectorActive}
          messages={messages}
          artifactHtml={artifact?.html}
          conversationError={error}
          onRetry={handleRetry}
          onAuthorizeAndRetry={handleSwitchToAmrAndRetry}
          onLaunchTerminalAuth={handleLaunchAntigravityOauth}
          conversationId={activeConversationId}
          headerActions={(
            <>
              <HandoffButton projectId={project.id} />
              <AvatarMenu
                config={config}
                agents={agents}
                daemonLive={daemonLive}
                onModeChange={onModeChange}
                onAgentChange={onAgentChange}
                onAgentModelChange={onAgentModelChange}
                onOpenSettings={onOpenSettings}
                onRefreshAgents={onRefreshAgents}
                onBack={onBack}
              />
            </>
          )}
        />
      </div>
      {projectActionsToast ? (
        <Toast
          message={projectActionsToast.message}
          details={projectActionsToast.details}
          code={projectActionsToast.code}
          onDismiss={() => setProjectActionsToast(null)}
        />
      ) : null}
    </div>
  );
}

function artifactExtensionFor(art: Artifact): '.html' | '.jsx' | '.tsx' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  return '.html';
}

function artifactBaseNameFor(art: Artifact): string {
  return (
    (art.identifier || art.title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

export function findExistingArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  const ext = artifactExtensionFor(art);
  const baseName = artifactBaseNameFor(art);
  const candidateFileName = `${baseName}${ext}`;
  const minMtime = options.minMtime;
  const currentRunFiles = typeof minMtime === 'number' && Number.isFinite(minMtime)
    ? projectFiles.filter((file) => file.mtime >= minMtime)
    : projectFiles;

  if (ext === '.html') {
    const pointerTarget = resolveHtmlPointerArtifactTarget({
      content: art.html,
      candidateFileName,
      projectFiles: currentRunFiles,
    });
    const pointerFile = pointerTarget
      ? currentRunFiles.find((file) => file.name === pointerTarget || file.path === pointerTarget)
      : null;
    if (pointerFile) return pointerFile;
  }

  const identifier = art.identifier || '';
  if (identifier) {
    const manifestMatches = currentRunFiles
      .filter((file) => file.artifactManifest?.metadata?.identifier === identifier)
      .sort((a, b) => b.mtime - a.mtime);
    if (manifestMatches[0]) return manifestMatches[0];
  }

  return currentRunFiles.find((file) => file.name === candidateFileName) ?? null;
}

export function selectPrimaryProjectFile(files: ProjectFile[]): ProjectFile | null {
  const candidates = files
    .filter((file) => !isProcessArtifactFile(file.name))
    .map((file) => ({ file, rank: primaryProjectFileRank(file) }))
    .filter((candidate) => Number.isFinite(candidate.rank));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rank - b.rank || b.file.mtime - a.file.mtime);
  return candidates[0]?.file ?? null;
}

function isProcessArtifactFile(name: string): boolean {
  const base = name.split('/').pop()?.toLowerCase() ?? name.toLowerCase();
  return (
    base === 'critique.json'
    || base.endsWith('.log')
    || base.endsWith('.meta.json')
    || base.endsWith('.artifact.json')
    || base.endsWith('.map')
  );
}

function primaryProjectFileRank(file: ProjectFile): number {
  if (manifestDeclaresPrimary(file)) return 0;
  if (file.artifactManifest && file.artifactManifest.metadata?.inferred !== true) return 1;
  if (file.kind === 'html') return 2;
  if (file.kind === 'image') return 3;
  if (file.kind === 'video') return 4;
  if (file.kind === 'sketch') return 5;
  if (file.kind === 'pdf') return 6;
  if (file.kind === 'presentation') return 7;
  if (file.kind === 'document') return 8;
  if (file.kind === 'spreadsheet') return 9;
  return Number.POSITIVE_INFINITY;
}

function manifestDeclaresPrimary(file: ProjectFile): boolean {
  const manifest = file.artifactManifest;
  if (!manifest) return false;
  if (primaryValueTargetsFile(manifest.primary, file.name)) return true;
  const metadata = manifest.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  if (primaryValueTargetsFile(metadata.primary, file.name)) return true;
  const outputs = metadata.outputs;
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    return primaryValueTargetsFile(
      (outputs as { primary?: unknown }).primary,
      file.name,
    );
  }
  return false;
}

function primaryValueTargetsFile(value: unknown, fileName: string): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return normalizeProjectFileName(value) === normalizeProjectFileName(fileName);
}

function normalizeProjectFileName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function assistantAgentDisplayName(
  agentId: string | null,
  fallbackName?: string,
): string | undefined {
  return agentDisplayName(agentId, fallbackName) ?? undefined;
}

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

export interface RetryTarget {
  failedAssistant: ChatMessage;
  userMsg: ChatMessage;
  priorMessages: ChatMessage[];
}

export function resolveRetryTarget(
  messages: ChatMessage[],
  failedAssistantId: string,
): RetryTarget | null {
  const failedIndex = messages.findIndex(
    (message) =>
      message.id === failedAssistantId &&
      message.role === 'assistant' &&
      message.runStatus === 'failed',
  );
  if (failedIndex <= 0 || failedIndex !== messages.length - 1) return null;

  const userMsg = messages[failedIndex - 1];
  const failedAssistant = messages[failedIndex];
  if (!userMsg || userMsg.role !== 'user' || !failedAssistant) return null;

  return {
    failedAssistant,
    userMsg,
    priorMessages: messages.slice(0, failedIndex - 1),
  };
}

function latestDesignSystemActivityEvents(messages: ChatMessage[]): AgentEvent[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') continue;
    if ((message.events?.length ?? 0) > 0) return message.events ?? [];
    if (isActiveRunStatus(message.runStatus)) return [];
  }
  return [];
}

function pluginWorkflowTitle(action: PluginFolderAgentAction): string {
  return action === 'publish' ? 'Publish repo' : 'Open Design PR';
}

function pluginWorkflowCliCommand(action: PluginFolderAgentAction, relativePath: string): string {
  return action === 'publish'
    ? `od plugin publish-repo ${relativePath}`
    : `od plugin open-design-pr ${relativePath}`;
}

function pluginWorkflowPlannedSteps(action: PluginFolderAgentAction): string[] {
  if (action === 'publish') {
    return [
      'Resolve GitHub owner and validate plugin metadata',
      'Create or update the GitHub repository',
      'Push plugin files and tags',
      'Return the repository URL',
    ];
  }
  return [
    'Ensure the Open Design fork exists',
    'Clone the fork and prepare a branch',
    'Copy the plugin into plugins/community',
    'Push the branch and open the PR form',
  ];
}

function pluginWorkflowPlannedEvents(action: PluginFolderAgentAction, relativePath: string): AgentEvent[] {
  return [
    { kind: 'text', text: `${pluginWorkflowStartContent(action, relativePath)}\n\n` },
    { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
  ];
}

function pluginWorkflowResultEvents(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url: string | undefined,
  log: string[] | undefined,
  ok: boolean,
  existingEvents?: AgentEvent[],
): AgentEvent[] {
  const summary = ok
    ? pluginWorkflowSuccessContent(action, relativePath, message, url, log)
    : pluginWorkflowFailureContent(action, relativePath, message, log);
  const baseEvents = (existingEvents ?? []).filter(
    (event) => !(event.kind === 'status' && event.label === 'working'),
  );
  return [
    ...baseEvents,
    { kind: 'text', text: `${summary}\n\n` },
    {
      kind: 'status',
      label: ok ? 'done' : 'failed',
      detail: ok ? 'CLI command finished' : 'CLI command failed',
    },
  ];
}

function pluginWorkflowStartContent(action: PluginFolderAgentAction, relativePath: string): string {
  const title = pluginWorkflowTitle(action);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const steps = pluginWorkflowPlannedSteps(action).map((step) => `- ${step}`).join('\n');
  return `${title} started.\n\n\`\`\`bash\n${command}\n\`\`\`\n\nPlanned steps:\n${steps}`;
}

function pluginWorkflowSuccessContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url?: string,
  log?: string[],
): string {
  const summary = stripTrailingUrl(message, url) || `${pluginWorkflowTitle(action)} completed for \`${relativePath}\`.`;
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  const link = url ? `\n\nLink: [${url}](${url})` : '';
  return `${summary}\n\n\`\`\`bash\n${command}\n\`\`\`${link}${details}`;
}

function pluginWorkflowFailureContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  log?: string[],
): string {
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  return `${pluginWorkflowTitle(action)} failed.\n\n\`\`\`bash\n${command}\n\`\`\`\n\n${message}${details}`;
}

function truncatePluginWorkflowLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function stripTrailingUrl(message: string, url?: string): string {
  const text = message.trim();
  const link = url?.trim();
  if (!link) return text;
  return text.replace(new RegExp(`\\s*${escapeRegExp(link)}\\s*$`), '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A daemon assistant message that is "queued/running" but has no runId yet
// is in-flight on the client: POST /api/runs has not returned. Persisting it
// in this state creates a phantom DB row that the reattach loop can never
// recover (the daemon either never saw the request or the response was lost),
// which is what produced the "Working 24m+" stuck UI. Treat the in-flight
// window as ephemeral and only write to DB once a runId pins the row to a
// real daemon run — or once the run reaches a terminal state.
function isPhantomDaemonRunMessage(m: ChatMessage): boolean {
  return (
    m.role === 'assistant' &&
    isActiveRunStatus(m.runStatus) &&
    !m.runId
  );
}

function isStoppableAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  return message.runStatus === undefined && message.endedAt === undefined && message.startedAt !== undefined;
}

export function resolveSucceededRunStatus(status: ChatMessage['runStatus']): ChatMessage['runStatus'] {
  return status === 'failed' || status === 'canceled' ? status : 'succeeded';
}

export function computeProducedFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  return filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)));
}

// Reattach with a recovered (on-disk) artifact must still include any
// other files the turn produced before the artifact write — replacing
// the diff with a single file was the regression noted on PR #2383.
export function mergeRecoveredArtifact(
  diff: readonly ProjectFile[],
  recovered: ProjectFile | null,
): ProjectFile[] {
  if (!recovered) return [...diff];
  if (diff.some((f) => f.name === recovered.name)) return [...diff];
  return [...diff, recovered];
}

export function clearStreamingConversationMarker(
  currentConversationId: string | null,
  completedConversationId?: string | null,
): string | null {
  if (
    completedConversationId !== undefined
    && completedConversationId !== null
    && currentConversationId !== completedConversationId
  ) {
    return currentConversationId;
  }
  return null;
}

export function shouldClearActiveRunRefs(
  currentConversationId: string | null,
  completedConversationId: string,
): boolean {
  return currentConversationId === completedConversationId;
}

export function finalizeActiveAssistantMessagesOnStop(
  messages: ChatMessage[],
  stoppedAt: number,
): { messages: ChatMessage[]; finalized: ChatMessage[] } {
  const finalized: ChatMessage[] = [];
  const next = messages.map((message) => {
    if (!isStoppableAssistantMessage(message)) {
      return message;
    }
    const updated = {
      ...message,
      runStatus: 'canceled' as const,
      endedAt: message.endedAt ?? stoppedAt,
    };
    finalized.push(updated);
    return updated;
  });
  return { messages: next, finalized };
}

type BufferedTextUpdates = ReturnType<typeof createBufferedTextUpdates>;

function createBufferedTextUpdates({
  updateMessage,
  persistSoon,
  flushAndPersistNow,
  onContentDelta,
}: {
  updateMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  persistSoon: () => void;
  // Synchronous flush + persist with a transport that survives page
  // unload (PUT with keepalive). Invoked by the pagehide handler so the
  // last buffered chunk isn't lost when the user reloads mid-stream.
  flushAndPersistNow?: () => void;
  onContentDelta?: (delta: string) => void;
}) {
  let pendingContentDelta = '';
  let pendingTextEventDelta = '';
  let flushFrame: number | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let flushing = false;
  let needsFlush = false;
  const hasDocument = typeof document !== 'undefined';
  const hasWindow = typeof window !== 'undefined';

  const cancelScheduledFlush = () => {
    if (flushFrame !== null) {
      cancelAnimationFrame(flushFrame);
      flushFrame = null;
    }
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    if (disposed) return;
    if (flushing) {
      needsFlush = true;
      return;
    }
    cancelScheduledFlush();
    if (!pendingContentDelta && !pendingTextEventDelta && !needsFlush) return;
    flushing = true;
    needsFlush = false;
    const contentDelta = pendingContentDelta;
    const textEventDelta = pendingTextEventDelta;
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    try {
      updateMessage((prev) => ({
        ...prev,
        content: prev.content + contentDelta,
        events: textEventDelta
          ? [...(prev.events ?? []), { kind: 'text', text: textEventDelta }]
          : prev.events,
      }));
      persistSoon();
      if (contentDelta) onContentDelta?.(contentDelta);
    } finally {
      flushing = false;
    }
    if (pendingContentDelta || pendingTextEventDelta || needsFlush) {
      needsFlush = false;
      scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    if (disposed || flushFrame !== null || flushTimer !== null) return;
    flushFrame = requestAnimationFrame(() => {
      flushFrame = null;
      flush();
    });
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 250);
  };

  const appendContent = (delta: string) => {
    if (disposed) return;
    pendingContentDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendTextEvent = (delta: string) => {
    if (disposed) return;
    pendingTextEventDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendEvent = (ev: AgentEvent) => {
    if (disposed) return;
    if (ev.kind === 'text') {
      appendTextEvent(ev.text);
      return;
    }
    flush();
    updateMessage((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
    persistSoon();
  };

  const cancel = () => {
    disposed = true;
    cancelScheduledFlush();
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    needsFlush = false;
    if (hasDocument) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (hasWindow) {
      window.removeEventListener('pagehide', onPageHide);
    }
  };

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  }

  function onPageHide() {
    flush();
    // persistSoon's 500ms debounce never fires once the document tears
    // down, so synchronously PUT with keepalive instead.
    flushAndPersistNow?.();
  }

  if (hasDocument) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (hasWindow) {
    window.addEventListener('pagehide', onPageHide);
  }

  return { appendContent, appendTextEvent, appendEvent, flush, cancel };
}
