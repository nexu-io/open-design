import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence } from 'motion/react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import { resolveHtmlPointerArtifactTarget } from '../artifacts/pointer';
import { validateHtmlArtifact } from '../artifacts/validate';
import { recoverHtmlDocumentFromMarkdownFence, recoverStandaloneHtmlDocument, resolvePersistedArtifactHtml } from '../artifacts/recover';
import { createArtifactParser } from '../artifacts/parser';
import { useI18n } from '../i18n';
import {
  fetchChatRunStatus,
  fetchVelaLoginStatus,
  listActiveChatRuns,
  listProjectRuns,
  reattachDaemonRun,
  reportChatRunFeedback,
  streamViaDaemon,
} from '../providers/daemon';
import { normalizeCustomReason } from '@open-design/contracts/analytics';
import {
  fetchProjectDesignSystemPackageAudit,
  fetchLiveArtifacts,
  fetchProjectFiles,
  fetchProjectFileText,
  fetchSkill,
  patchPreviewCommentStatus,
  uploadProjectFiles,
  writeProjectTextFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { claimProjectTurnIndex, claimRunTurnIndex } from '../analytics/identity';
import { useCoalescedCallback } from '../hooks/useCoalescedCallback';
import {
  type AmrWalletSnapshot,
  type ByokMediaDefaults,
  type ResearchOptions,
} from '@open-design/contracts';
import {
  projectKindFromMetadataToTracking,
  projectKindToTracking,
} from '@open-design/contracts/analytics';
import type {
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackArtifactHeaderClick,
  trackDesignSystemApplyResult,
  trackDesignSystemEnrichClick,
  trackPageView,
  trackOnboardingPromptPrefilled,
  trackOnboardingFirstPromptSent,
  trackOnboardingFirstGenerationCompleted,
} from '../analytics/events';
import {
  clearOnboardingSessionId,
  peekOnboardingSessionId,
} from '../analytics/onboarding-session';
import { agentDisplayName, agentModelDisplayName } from '../utils/agentLabels';
import {
  canAutoRenameProjectFromPrompt,
  summarizeProjectNameFromPrompt,
} from '../utils/projectName';
import {
  apiProtocolAgentId,
  apiProtocolModelLabel,
  usesAnthropicProxy,
} from '../utils/apiProtocol';
import { randomUUID } from '../utils/uuid';
import type { TodoItem } from '../runtime/todos';
import { appendErrorStatusEvent, removeErrorStatusEvent } from '../runtime/chat-events';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import { checkAmrBalanceGate } from '../runtime/amr-balance-gate';
import { AmrBalanceDialog } from './AmrBalanceDialog';
import { AmrLowBalanceDialog, type AmrLowBalanceDecision } from './AmrLowBalanceDialog';
import {
  cancelBrandExtraction,
  continueBrandExtraction,
  extractBrandFromHtml,
  finalizeBrandProject,
} from '../runtime/brands';
import { isOpenDesignHostAvailable } from '@open-design/host';
import {
  getBrandBrowser,
  BRAND_BROWSER_TAB_ID,
  type BrandBrowserPageSnapshotResult,
} from '../runtime/brand-browser-bridge';
import {
  BROWSER_PAGE_ARCHIVE_INDEX_FILE,
  BROWSER_SERIALIZE_HTML_SCRIPT,
  BROWSER_SERIALIZE_STYLES_SCRIPT,
  isBrowserPageArchiveManifest,
} from './design-browser-tools';
import type { BrandBrowserAssistConfirm, BrandBrowserAssistResult } from './OdCard';
import {
  buildBrandEnrichmentPrompt,
  installedBrandEnrichmentSkillIds,
  isProgrammaticBrandExtractionProject,
} from '../runtime/brand-enrichment';
import { useBrandReadyPrompt } from '../runtime/useBrandReadyPrompt';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../runtime/design-system-package-audit';
import { liveArtifactTabId } from '../types';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import {
  createConversation,
  installGeneratedPluginFolder,
  listConversations,
  listMessages,
  patchConversation,
  patchProject,
  saveMessage,
  startGeneratedPluginShareTask,
  type SaveMessageOptions,
  waitGeneratedPluginShareTask,
} from '../state/projects';
import type {
  BrandStatus,
  ChatSessionMode,
  InstalledPluginRecord,
  RunContextSelection,
} from '@open-design/contracts';
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
  Project,
  PreviewComment,
  ProjectFile,
  LiveArtifactEventItem,
  LiveArtifactSummary,
  SkillSummary,
} from '../types';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  queuedSlideNavTarget,
} from '../comments';
import { historyWithApiAttachmentContext } from '../api-attachment-context';
import { filterImplicitProducedFiles } from '../produced-files';
import { EntrySettingsMenu } from './EntrySettingsMenu';
import { HandoffButton } from './HandoffButton';
import { Icon } from './Icon';
import { localizePluginTitle } from './plugins-home/localization';
import { DesignSystemPicker } from './DesignSystemPicker';
import { PluginDetailsModal } from './PluginDetailsModal';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { ChatPane } from './ChatPane';
import type { ChatSendMeta } from './ChatComposer';
import {
  CritiqueTheaterMount,
  useCritiqueTheaterEnabled,
} from './Theater';
import { useIframeKeepAlivePool } from './IframeKeepAlivePool';
import {
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedArtifact,
} from './auto-open-file';
import { buildRepoImportPrompt, designSystemNeedsRepoConnect } from './design-system-github-evidence';
import { isDesignSystemProject, resolveProjectDesignSystemId } from './design-system-project';
import { collectReferencedJsxNames } from '../runtime/jsx-module-refs';
import { DESIGN_SYSTEM_TAB, FileWorkspace, type BrowserOpenRequest } from './FileWorkspace';
import {
  type PluginFolderAgentAction,
} from './design-files/pluginFolderActions';
import { CenteredLoader } from './Loading';
import type { SettingsSection } from './SettingsDialog';
import { Toast } from './Toast';
import { FirstArtifactHint } from './FirstArtifactHint';
import {
  consumeOnboardingEntryForProject,
  hasSentFirstOnboardingPrompt,
  markFirstOnboardingPromptSent,
  hasCompletedFirstOnboardingGeneration,
  markFirstOnboardingGenerationCompleted,
  type OnboardingEntry,
} from '../onboarding/onboarding-entry';
import { producedPreviewableArtifact } from '../onboarding/first-generation';
import { sentPrefilledPrompt } from '../onboarding/first-prompt';
import { beginFirstLoop, recordFirstLoopStep } from '../onboarding/first-loop';
import { BrandReadyPrompt } from './BrandReadyPrompt';
import { useDesignMdState } from '../hooks/useDesignMdState';
import { useFinalizeProject } from '../hooks/useFinalizeProject';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { useTerminalLaunch } from '../hooks/useTerminalLaunch';
import { effectiveMaxTokens } from '../state/maxTokens';
import { effectiveAgentModelChoice } from './agentModelSelection';
import { mediaExecutionPolicyForProjectMetadata } from '../media/execution-policy';
import {
  useByokImageModelOptions,
  useByokVideoModelOptions,
  useByokSpeechModelOptions,
} from '../media/aihubmix-image-models';
import {
  SPLIT_RESIZE_HANDLE_WIDTH,
  BRAND_EMPTY_TRANSCRIPT_RETRY_DELAYS_MS,
  COMMENT_INSPECTOR_PANEL_WIDTH,
  BYOK_OPENCODE_UNAVAILABLE_MESSAGE,
  BEDROCK_BYOK_UNSUPPORTED_MESSAGE,
  projectSplitClassName,
  projectSplitStyle,
  useWiredChatPanelResize,
  useByokModelOverrides,
  useWiredGithubConnectRepo,
  useWiredPluginContextDetails,
  useWiredProjectFinalizeActions,
  useProjectActions,
  useShareToOpenDesign,
  useWiredDesignSystemReview,
  useWiredConversationManagement,
  useProjectTimeouts,
  useWiredRunCompletionNotifications,
  useQuestionFormPanel,
  useWiredConversationMessages,
  useWiredPreviewComments,
  useWiredOpenTabsSync,
  findActiveConversation,
  ExecutionControls,
  brandBrowserSnapshotMatchesSource,
  isDesignSystemWorkspaceMetadata,
  isBrandStatusValue,
  brandExtractionAllowsEditing,
  byokMediaDefaultsForRun,
  isGenericDaemonDisconnect,
  hasGenericDisconnectFailureEvent,
  appendLiveArtifactEventItem,
  buildBrandAgentExtractionContinuationPrompt,
  designSystemNameForSourceProject,
  buildCreateDesignSystemFromProjectPrompt,
  chatAttachmentsFromPreviewCommentImages,
  mergeChatAttachments,
  historyWithWorkspaceContext,
  commentTaskQuery,
  commentTaskContextAttachment,
  fallbackDesignSystemSummaryForProject,
  projectViewTransportPort,
  artifactExtensionFor,
  artifactBaseNameFor,
  filterProjectFilesByMinMtime,
  artifactFromRecoverableSourceText,
  isFileWriteToolName,
  extractFileWriteToolPath,
  conversationHasBrandBrowserAssist,
  findExistingArtifactProjectFile,
  findSameTurnNonHtmlWriteForRecoveredArtifact,
  findSameTurnWriteForRecoveredArtifact,
  isTerminalRunStatus,
  isActiveRunStatus,
  isProgrammaticBrandExtractionStatusMessage,
  hasRecoverableArtifactMessage,
  shouldReplayTerminalRunMessage,
  textContentFromAgentEvents,
  resolveRetryTarget,
  latestDesignSystemActivityEvents,
  resolveSucceededRunStatus,
  computeProducedFiles,
  computeTraceObjectFiles,
  mergeRecoveredArtifact,
  findSameTurnHtmlWriteForRecoveredArtifact,
  mergeRecoveredTraceObjectFile,
  extractTouchedFilePathsFromEvents,
  clearStreamingConversationMarker,
  shouldClearActiveRunRefs,
  finalizeActiveAssistantMessagesOnStop,
  pluginWorkflowTitle,
  pluginWorkflowPlannedEvents,
  pluginWorkflowResultEvents,
  pluginWorkflowStartContent,
  pluginWorkflowSuccessContent,
  pluginWorkflowFailureContent,
  stripQueueOnlyFromMeta,
  autoSendFirstMessageKey,
  autoSendAmrGateOkKey,
  resolveTerminalEndedAt,
  createBufferedTextUpdates,
  brandExtractionPreviewFileName,
  byokOpenCodeProviderFromConfig,
  projectEventToAgentEvent,
  artifactWithHtml,
} from '../features/project-view';
import type {
  ProjectChatSendMeta,
  QueuedChatSend,
  BufferedTextUpdates,
  BrandBrowserSnapshot,
  BrandBrowserSnapshotExtractionResult,
} from '../features/project-view';

// Re-export the public pure helpers that previously lived in this file so the
// existing ProjectView.*/FileWorkspace test net keeps importing them from here
// with zero churn. Their home is now the project-view slice (ADR 0002).
export {
  mergeSavedPreviewComment,
  mergeServerMessagesIntoConversation,
  projectSplitClassName,
  projectSplitStyle,
  buildQuestionFormKey,
  findExistingArtifactProjectFile,
  findExistingNonHtmlArtifactProjectFile,
  findSameTurnNonHtmlWriteForRecoveredArtifact,
  selectPrimaryProjectFile,
  hasRecoverableArtifactMessage,
  resolveRetryTarget,
  resolveSucceededRunStatus,
  computeProducedFiles,
  computeTraceObjectFiles,
  mergeRecoveredArtifact,
  findSameTurnHtmlWriteForRecoveredArtifact,
  mergeRecoveredTraceObjectFile,
  extractTouchedFilePathsFromEvents,
  clearStreamingConversationMarker,
  shouldClearActiveRunRefs,
  finalizeActiveAssistantMessagesOnStop,
  createBufferedTextUpdates,
} from '../features/project-view';

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
  // design template after the skills/design-templates split), use
  // `designTemplates` as a fallback in the skill-name / skill-mode lookups
  // below.
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
  onApiModelChange?: (model: string) => void;
  onRefreshAgents: () => void;
  onThemeChange?: (theme: AppConfig['theme']) => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenAmrSettings?: () => void;
  onOpenMcpSettings?: () => void;
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
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
  onDeleteProject?: (id: string) => Promise<boolean> | boolean;
  onChangeDefaultDesignSystem?: (designSystemId: string | null) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onCreateProjectFromDesignSystem?: (designSystemId: string, title: string) => Promise<void> | void;
  onCreateDesignSystemFromProject?: (
    sourceProjectId: string,
    input: { name?: string; pendingPrompt?: string },
  ) => Promise<void> | void;
  onDuplicateProject?: (
    sourceProjectId: string,
    input?: { name?: string },
  ) => Promise<void> | void;
}

interface QueuedChatSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
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
  onApiModelChange,
  onRefreshAgents,
  onThemeChange,
  onOpenSettings,
  onOpenAmrSettings,
  onOpenMcpSettings,
  onBrowsePlugins,
  onOpenConnectors,
  onAdoptPetInline,
  onTogglePet,
  onOpenPetSettings,
  onBack,
  onClearPendingPrompt,
  onTouchProject,
  onProjectChange,
  onProjectsRefresh,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onDesignSystemsRefresh,
  onCreateProjectFromDesignSystem,
  onCreateDesignSystemFromProject,
  onDuplicateProject,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  // Onboarding first-generation funnel (spec §11.1). Consume the pending entry
  // (set by the Home recommendation) exactly once on mount; the refs guard the
  // two lifecycle events so each fires only for the genuine first send / first
  // successful generation of a recommendation-started project.
  const onboardingEntryInitRef = useRef(false);
  const onboardingEntryRef = useRef<OnboardingEntry | null>(null);
  // The prompt the recommendation prefilled into the composer. Prefer the seed
  // cached WITH the onboarding entry (it survives a reopen-before-send, whereas
  // `project.pendingPrompt` is wiped by `onClearPendingPrompt` on the first
  // mount); fall back to `pendingPrompt` for the very first mount / any project
  // without a cached seed. The first-prompt-sent funnel event compares the
  // actually-sent prompt against this seed so `has_prefilled_prompt` reflects
  // real behavior — the user is free to edit, clear, or replace the suggestion
  // before sending (spec §7.4 / §8.2).
  const onboardingSeedPromptRef = useRef('');
  if (!onboardingEntryInitRef.current) {
    onboardingEntryInitRef.current = true;
    onboardingEntryRef.current = consumeOnboardingEntryForProject(project.id);
    onboardingSeedPromptRef.current =
      onboardingEntryRef.current?.seedPrompt ?? (project.pendingPrompt ?? '').trim();
    // Pin the first-loop ledger for THIS project so later delivery taps (the
    // FileViewer share/export path) can close the loop by project id without
    // prop plumbing. Project-scoped, so an unrelated project's delivery never
    // closes this loop.
    if (onboardingEntryRef.current) beginFirstLoop(project.id, onboardingEntryRef.current);
  }
  // The once-per-project funnel guards live in the onboarding-entry module
  // (project-keyed), not mount-local refs: ProjectView remounts on every
  // leave/reopen, and the entry now survives those remounts via its cache, so a
  // mount-local guard would let the funnel events re-fire on a later
  // conversation/run of the same project.
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  const handleThemeChange = onThemeChange ?? (() => {});
  const projectDetail = useProjectDetail(project.id);
  const detailedProject = projectDetail.project?.id === project.id ? projectDetail.project : null;
  const currentProject =
    detailedProject && detailedProject.updatedAt >= project.updatedAt ? detailedProject : project;
  const projectDesignSystemId = resolveProjectDesignSystemId(currentProject);
  const projectIsDesignSystemProject = isDesignSystemProject(currentProject);
  const designSystemBrandId = projectIsDesignSystemProject
    ? currentProject.metadata?.brandId?.trim() || null
    : null;
  const projectIsProgrammaticBrandExtraction =
    isProgrammaticBrandExtractionProject(currentProject.metadata);
  // P0 page_view page_name=chat_panel — fire once per project mount.
  // ProjectView outlives conversation switches (ChatPane is keyed by
  // activeConversationId so it remounts when the user switches chats,
  // but this component does not), so page_view stays a "chat-panel
  // entry" metric instead of becoming a "conversation switch" count.
  // Reviewer #2285 (mrcfps, 2026-05-20 04:08) flagged the previous
  // ChatComposer-level emit for skewing the funnel.
  const chatPanelPageViewFiredRef = useRef<string | null>(null);
  const { mountedRef, scheduleProjectTimeout, clearProjectTimeout } = useProjectTimeouts();

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
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const activeConversation = useMemo(
    () => findActiveConversation(conversations, activeConversationId),
    [conversations, activeConversationId],
  );
  const activeSessionMode = activeConversation?.sessionMode ?? 'design';
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null);
  const [failedMessagesConversationId, setFailedMessagesConversationId] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [messageLoadRetryNonce, setMessageLoadRetryNonce] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePluginActionPaths, setActivePluginActionPaths] = useState<Set<string>>(() => new Set());
  const [hiddenAssistantPluginActionPaths, setHiddenAssistantPluginActionPaths] = useState<Set<string>>(() => new Set());
  const [forceStreamingPluginMessageIds, setForceStreamingPluginMessageIds] = useState<Set<string>>(() => new Set());
  // Ephemeral, live-only accumulation of a tool call's streaming JSON input,
  // keyed by tool-use id (globally unique per run). Fed by `onToolInputDelta`
  // while the model is still emitting `input_json_delta`; dropped per-id once
  // the full `tool_use` lands and wiped when the run ends. Never persisted —
  // see daemon `daemonAgentPayloadToPersistedAgentEvent` (returns null).
  // `seq` records how many persisted events existed when the tool started
  // streaming, so the renderer can place the live card at the tool call's
  // position in the message (text before it = preamble, after it = hedging).
  const [liveToolInput, setLiveToolInput] = useState<Record<string, { name: string; text: string; seq: number }>>({});
  // True once the initial DB read for the active conversation has settled.
  // Auto-send gates on this so it can't fire before listMessages resolves and
  // race-clobber the freshly-pushed user + assistant placeholder. Without
  // this, the auto-send writes [user, assistant] into state, then the still
  // in-flight listMessages PUT response arrives, runs setMessages(list), and
  // wipes both — leaving the daemon's run with no client-side message to
  // attach the runId to.
  const [messagesInitialized, setMessagesInitialized] = useState(false);
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);
  // Mirror so the send-now interrupt path can read the current statuses
  // synchronously without re-creating its callback on every comment change.
  const previewCommentsRef = useRef<PreviewComment[]>([]);
  useEffect(() => {
    previewCommentsRef.current = previewComments;
  }, [previewComments]);
  const [attachedComments, setAttachedComments] = useState<PreviewComment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  // Safety net: drop any live tool-input partials whose tool never produced a
  // full `tool_use` (run errored/canceled mid-call) once streaming settles.
  useEffect(() => {
    if (!streaming) setLiveToolInput((prev) => (Object.keys(prev).length ? {} : prev));
  }, [streaming]);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  // True while a working-dir replace is reindexing the new folder. Surfaced
  // to the Design Files panel so the file list shows a loading state instead
  // of silently sitting on the old tree for the few seconds the scan takes.
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const projectFilesRef = useRef<ProjectFile[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);
  const [workspaceFocused, setWorkspaceFocused] = useState(false);
  const [commentInspectorActive, setCommentInspectorActive] = useState(false);
  const commentInspectorPortalId = useId();
  const leftInspectorActive = commentInspectorActive;
  // Per-session BYOK chat tool-call model/voice overrides (generate_image /
  // generate_video / generate_speech). Seeded once from the project's
  // creation-time media picks (when they belong to the active BYOK provider),
  // falling back to the Settings default otherwise. Subsequent selections
  // live only in this state — page refresh / project switch resets to the
  // seed. Persistent defaults live in Settings → BYOK.
  const {
    byokImageModelOverride,
    setByokImageModelOverride,
    byokVideoModelOverride,
    setByokVideoModelOverride,
    byokSpeechModelOverride,
    setByokSpeechModelOverride,
    byokSpeechVoiceOverride,
    setByokSpeechVoiceOverride,
  } = useByokModelOverrides(project.metadata, config);
  // Live model option lists (same hooks the composer/Settings pickers use) so
  // the chat "default" (no explicit pick) resolves to the FIRST catalogue model
  // shown in the dropdown — not a hardcoded id. The daemon keeps its own
  // fallback for when the catalogue hasn't loaded.
  const byokImageModelOptionsPV = useByokImageModelOptions(config.apiProtocol);
  const byokVideoModelOptionsPV = useByokVideoModelOptions(config.apiProtocol);
  const byokSpeechModelOptionsPV = useByokSpeechModelOptions(config.apiProtocol);
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
  const designMdState = useDesignMdState(project.id, designMdRefreshKey);
  const finalize = useFinalizeProject(project.id);
  const terminalLauncher = useTerminalLaunch();
  const [projectActionsToast, setProjectActionsToast] = useState<{
    message: string;
    details: string | null;
    code?: string | null;
    tone?: 'default' | 'success' | 'error' | 'loading';
    ttlMs?: number;
  } | null>(null);
  // Brand extraction has no SSE; this polls the brand's status and, once the
  // backing extraction finalizes a `user:<id>` design system, surfaces a
  // one-shot "ready — preview it" prompt so the user knows to open the Design
  // systems tab. A no-op for every non-brand-extraction project.
  const {
    status: polledBrandExtractionStatus,
    ready: brandReady,
    prompt: brandReadyPrompt,
    dismiss: dismissBrandReady,
    browserAssist: brandBrowserAssist,
    dismissBrowserAssist: dismissBrandBrowserAssist,
  } = useBrandReadyPrompt(currentProject.metadata);
  const currentBrandExtractionId = projectIsProgrammaticBrandExtraction
    ? currentProject.metadata?.brandId?.trim() || null
    : null;
  const [brandExtractionStatusOverride, setBrandExtractionStatusOverride] =
    useState<{ brandId: string; status: BrandStatus } | null>(null);
  useEffect(() => {
    if (!currentBrandExtractionId) {
      setBrandExtractionStatusOverride(null);
      return;
    }
    if (
      brandExtractionStatusOverride &&
      brandExtractionStatusOverride.brandId !== currentBrandExtractionId
    ) {
      setBrandExtractionStatusOverride(null);
      return;
    }
    if (
      brandExtractionStatusOverride &&
      brandExtractionStatusOverride.brandId === currentBrandExtractionId &&
      brandExtractionAllowsEditing(polledBrandExtractionStatus)
    ) {
      setBrandExtractionStatusOverride(null);
    }
  }, [brandExtractionStatusOverride, currentBrandExtractionId, polledBrandExtractionStatus]);
  const effectiveBrandExtractionStatus =
    brandExtractionStatusOverride?.brandId === currentBrandExtractionId
      ? brandExtractionStatusOverride.status
      : polledBrandExtractionStatus;
  const terminalBrandPreviewRefreshRef = useRef<string | null>(null);
  const designSystemEditable =
    !projectIsProgrammaticBrandExtraction ||
    brandExtractionAllowsEditing(effectiveBrandExtractionStatus) ||
    Boolean(brandReady);
  const pendingBrandDesignSystemOpenRef = useRef<string | null>(null);
  const handledBrandReadyDesignSystemRef = useRef<string | null>(null);
  const missingDesignSystemRefreshRef = useRef<string | null>(null);
  const autoOpenedBrandDesignSystemRef = useRef<string | null>(null);
  const brandEmptyTranscriptRetriesRef = useRef<Map<string, number>>(new Map());
  const [chatSeed, setChatSeed] = useState<{ id: string; value: string } | null>(null);
  // Hard block from the pre-run balance gate (empty wallet or signed out);
  // non-null renders the AmrBalanceDialog. `conversationId` remembers whose
  // queue to resume when the dialog resolves (sign-in done / recharge landed).
  const [amrBalanceGateBlock, setAmrBalanceGateBlock] = useState<
    {
      reason: 'insufficient' | 'signed_out';
      snapshot: AmrWalletSnapshot;
      conversationId: string;
    } | null
  >(null);
  // Soft low-balance warning holding a pending send: the dialog resolves the
  // promise the gate is awaiting ('proceed' continues the very same send).
  const [amrLowBalanceWarn, setAmrLowBalanceWarn] = useState<
    { snapshot: AmrWalletSnapshot; resolve: (decision: AmrLowBalanceDecision) => void } | null
  >(null);
  // Conversations with a balance-gate check currently in flight. Sends that
  // arrive during the check queue instead of racing a duplicate run through
  // the not-yet-busy window the gate's await opens.
  const amrGateInFlightConversationsRef = useRef<Set<string>>(new Set());
  // Conversations whose queue auto-drain is paused because the balance gate
  // blocked a send. Without the pause, every unrelated re-run of the drain
  // effect would re-hit the wallet endpoint and re-pop the dialog. Lifted by
  // the next send that passes the gate.
  const amrGatePausedQueueConversationsRef = useRef<Set<string>>(new Set());
  const [autoAuditRepairSeed, setAutoAuditRepairSeed] =
    useState<{ id: string; value: string } | null>(null);
  const {
    splitRef,
    chatPanelWidth,
    chatPanelWidthRef,
    chatPanelMaxWidth,
    workspacePanelMinWidth,
    workspacePanelTrack,
    resizingChatPanel,
    chatPanelAriaMinWidth,
    handleChatResizePointerDown,
    handleChatResizeBlur,
    handleChatResizeKeyDown,
  } = useWiredChatPanelResize();
  // Routed to FileWorkspace — bumped whenever the user clicks "open" on a
  // tool card, an attachment chip, or a produced-file chip in chat. We
  // include a nonce so re-clicking the same name after the user closed the
  // tab still focuses it.
  const [openRequest, setOpenRequest] = useState<{ name: string; nonce: number } | null>(null);
  const [browserOpenRequest, setBrowserOpenRequest] = useState<BrowserOpenRequest | null>(null);
  // Like `openRequest`, but additionally asks the preview workspace to open the
  // file's Share/Export menu. Drives the "Share" next-step action: it reuses the
  // existing export/deploy surface rather than introducing a new share backend.
  const [shareRequest, setShareRequest] = useState<{ name: string; nonce: number } | null>(null);
  // Parallel to shareRequest, but opens the workspace's Download/Export menu.
  const [downloadRequest, setDownloadRequest] = useState<{ name: string; nonce: number } | null>(null);
  const [designSystemEditRequest, setDesignSystemEditRequest] =
    useState<{ module: 'logo'; nonce: number } | null>(null);
  // When a queued chat send starts processing, ask the workspace to flip the
  // deck preview to the slide its marked element lives on, so the user watches
  // the edit land in context instead of staying parked on slide 1. Mirrors the
  // `shareRequest` nonce signal: FileWorkspace matches `name` against the open
  // file and FileViewer consumes each nonce once.
  const [slideNavRequest, setSlideNavRequest] = useState<
    { name: string; slideIndex: number; nonce: number } | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  // Runs explicitly superseded by a "send now" interrupt. Their abort
  // controller is recorded here synchronously — before handleStop() clears the
  // active refs — so the run's late terminal callbacks (which the daemon still
  // delivers for a canceled run) can be recognized as stale and skip every
  // current-run side effect, independent of abortRef churn. A WeakSet so a
  // finished run's controller is collected once nothing else references it.
  const supersededRunsRef = useRef<WeakSet<AbortController>>(new WeakSet());
  const streamingConversationIdRef = useRef<string | null>(null);
  const [queuedChatSends, setQueuedChatSends] = useState<QueuedChatSend[]>([]);
  const queuedChatSendsRef = useRef<QueuedChatSend[]>([]);
  const sendTextBufferRef = useRef<BufferedTextUpdates | null>(null);
  const reattachTextBuffersRef = useRef<Set<BufferedTextUpdates>>(new Set());
  const reattachControllersRef = useRef<Map<string, AbortController>>(new Map());
  const reattachCancelControllersRef = useRef<Map<string, AbortController>>(new Map());
  const completedReattachRunsRef = useRef<Set<string>>(new Set());
  // Tracks transient null-status retry attempts per runId; bounded by
  // MAX_TRANSIENT_RETRIES so we never spin indefinitely on a persistently
  // missing run.
  const transientFailedRetriesRef = useRef<Map<string, number>>(new Map());
  // Tracks generic-disconnect retry attempts per runId independently of the
  // null-status path so the two transient error classes don't share one budget
  // and cause premature sealing when both fire on the same run.
  const genericDisconnectRetriesRef = useRef<Map<string, number>>(new Map());
  // Cooldown window for active generic-disconnect retries after the transient
  // budget is exhausted, so a flapping SSE endpoint does not trigger an
  // immediate reattach loop while the daemon still reports the run as active.
  const genericDisconnectBackoffUntilRef = useRef<Map<string, number>>(new Map());
  // Timer handles for pending transient-retry callbacks; cleared on cleanup.
  const transientRetryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [recoveryTick, setRecoveryTick] = useState(0);
  const recoveredArtifactMessagesRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<ChatMessage[]>([]);
  const startingQueuedChatSendIdRef = useRef<string | null>(null);
  const [queuedAutoStartTick, setQueuedAutoStartTick] = useState(0);
  // We auto-save the most recent artifact to the project folder. Track the
  // last name we persisted so re-renders during streaming don't spawn
  // duplicate writes.
  const savedArtifactRef = useRef<string | null>(null);
  // Track which conversation the current messages belong to, so we can
  // correctly gate new-conversation creation even during async loads.
  const messagesConversationIdRef = useRef<string | null>(null);
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
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    setChatSeed(null);
    setAutoAuditRepairSeed(null);
    const restored = projectViewTransportPort.loadQueuedChatSends(project.id);
    queuedChatSendsRef.current = restored;
    setQueuedChatSends(restored);
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
  const currentConversationHasProgrammaticBrandExtractionRun = useMemo(
    () => messages.some((m) => isProgrammaticBrandExtractionStatusMessage(m, currentProject.metadata)),
    [messages, currentProject.metadata],
  );
  const currentConversationHasActiveRun = useMemo(
    () => messages.some((m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus)),
    [messages],
  );
  const currentConversationHasRecoverableArtifact = useMemo(
    () => messages.some((message) => hasRecoverableArtifactMessage(message)),
    [messages],
  );
  const currentConversationLoading = Boolean(
    activeConversationId
      && messagesConversationId !== activeConversationId
      && failedMessagesConversationId !== activeConversationId,
  );
  const currentConversationStreaming = streaming && streamingConversationId === activeConversationId;
  const currentConversationControlStreaming =
    currentConversationStreaming || currentConversationHasProgrammaticBrandExtractionRun;
  const currentConversationBusy = currentConversationLoading
    || currentConversationStreaming
    || currentConversationHasActiveRun;
  const currentConversationAwaitingActiveRunAttach =
    currentConversationHasActiveRun
    && !currentConversationStreaming
    && !currentConversationHasProgrammaticBrandExtractionRun;
  const currentConversationSendDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId
    || currentConversationAwaitingActiveRunAttach;
  const currentConversationActionDisabled = currentConversationBusy || currentConversationSendDisabled;
  const currentConversationQueueDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId;

  // The discovery question form lives in the right-hand Questions tab. We
  // derive it from the latest assistant message: if that message embeds a
  // <question-form> block, the panel renders it. The form is interactive
  // only while it's the most recent turn and the user hasn't answered yet
  // (an answer arrives as a following "[form answers …]" user message).
  const {
    displayedQuestionForm,
    displayedQuestionFormPreview,
    displayedQuestionFormSubmittedAnswers,
    displayedQuestionFormActive,
    displayedQuestionsGenerating,
    displayedQuestionFormKey,
    focusQuestionsRequest,
    openQuestionsTab,
  } = useQuestionFormPanel(messages, activeConversationId, currentConversationStreaming, project.id);

  const currentConversationQueuedItems = activeConversationId
    ? queuedChatSends
        .filter((item) => item.conversationId === activeConversationId)
        .map((item) => {
          const queuedItem = {
            id: item.id,
            prompt: item.prompt,
            attachments: item.attachments,
            commentAttachments: item.commentAttachments,
          };
          if (item.meta === undefined) return queuedItem;
          return { ...queuedItem, meta: item.meta };
        })
    : [];

  const {
    persistMessage,
    persistMessageById,
    updateMessageById,
    appendConversationMessage,
    replaceConversationMessage,
    refreshConversationMessagesFromServer,
    scheduleConversationMessageRefresh,
  } = useWiredConversationMessages(
    project.id,
    routeConversationId,
    conversations,
    activeConversationId,
    setActiveConversationId,
    setConversations,
    setMessagesConversationId,
    setFailedMessagesConversationId,
    messageLoadRetryNonce,
    setMessageLoadRetryNonce,
    setConversationLoadError,
    setMessages,
    messagesConversationIdRef,
    setMessagesInitialized,
    setPreviewComments,
    setAttachedComments,
    setStreaming,
    streamingConversationIdRef,
    setStreamingConversationId,
    setError,
    setArtifact,
    savedArtifactRef,
    lastSyncedConversationIdRef,
    scheduleProjectTimeout,
  );

  const {
    refreshPreviewComments,
    savePreviewComment,
    removePreviewComment,
    attachPreviewComment,
    detachPreviewComment,
    patchAttachedStatuses,
  } = useWiredPreviewComments(
    project.id,
    activeConversationId,
    previewComments,
    setPreviewComments,
    setAttachedComments,
  );

  useEffect(() => {
    setWorkspaceFocused(false);
  }, [project.id]);

  useEffect(() => {
    if (!projectIsProgrammaticBrandExtraction) return undefined;
    if (!activeConversationId || !messagesInitialized || messages.length > 0) return undefined;
    if (streaming || currentConversationStreaming) return undefined;
    const key = `${project.id}:${activeConversationId}`;
    const retries = brandEmptyTranscriptRetriesRef.current.get(key) ?? 0;
    const delay = BRAND_EMPTY_TRANSCRIPT_RETRY_DELAYS_MS[retries];
    if (delay === undefined) return undefined;
    brandEmptyTranscriptRetriesRef.current.set(key, retries + 1);
    const timer = window.setTimeout(() => {
      void projectDetail.refresh();
      setMessageLoadRetryNonce((nonce) => nonce + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    activeConversationId,
    currentConversationStreaming,
    messages.length,
    messagesInitialized,
    project.id,
    projectDetail.refresh,
    projectIsProgrammaticBrandExtraction,
    streaming,
  ]);

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

  const { activeCompletionNotificationRunsRef } = useWiredRunCompletionNotifications(
    messages,
    config.notifications,
    t,
    () => setDesignMdRefreshKey((n) => n + 1),
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
      const text = await projectViewTransportPort.readProjectRawText(project.id, name);
      htmlContentCacheRef.current.set(name, { mtime, text });
      return text;
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
    if (!currentBrandExtractionId) {
      terminalBrandPreviewRefreshRef.current = null;
      return;
    }
    if (!brandExtractionAllowsEditing(effectiveBrandExtractionStatus)) {
      terminalBrandPreviewRefreshRef.current = null;
      return;
    }
    const refreshKey = `${currentBrandExtractionId}:${effectiveBrandExtractionStatus}`;
    if (terminalBrandPreviewRefreshRef.current === refreshKey) return;
    terminalBrandPreviewRefreshRef.current = refreshKey;
    void refreshWorkspaceItems().catch(() => {});
    setFilesRefresh((n) => n + 1);
  }, [
    currentBrandExtractionId,
    effectiveBrandExtractionStatus,
    refreshWorkspaceItems,
  ]);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    setOpenRequest({ name, nonce: Date.now() });
  }, []);

  useEffect(() => {
    const designSystemId = brandReady?.designSystemId;
    if (!designSystemId) return;
    if (handledBrandReadyDesignSystemRef.current === designSystemId) return;
    handledBrandReadyDesignSystemRef.current = designSystemId;
    pendingBrandDesignSystemOpenRef.current = designSystemId;
    void (async () => {
      try {
        await Promise.all([
          projectDetail.refresh(),
          Promise.resolve(onDesignSystemsRefresh?.()),
          refreshWorkspaceItems(),
        ]);
        onProjectsRefresh();
        if (activeConversationId) {
          setMessageLoadRetryNonce((nonce) => nonce + 1);
        }
      } catch (err) {
        handledBrandReadyDesignSystemRef.current = null;
        console.warn('[brand] failed to refresh ready design system state', err);
      }
    })();
  }, [
    activeConversationId,
    brandReady?.designSystemId,
    onDesignSystemsRefresh,
    onProjectsRefresh,
    projectDetail.refresh,
    refreshWorkspaceItems,
  ]);

  const persistArtifact = useCallback(
    async (
      art: Artifact,
      projectFilesSnapshot?: ProjectFile[],
      sourceText?: string,
      options: { pointerMinMtime?: number } = {},
    ) => {
      const persistedHtml = resolvePersistedArtifactHtml({
        artifactHtml: art.html,
        identifier: art.identifier,
        sourceText,
      });
      const artifactToPersist = persistedHtml === art.html ? art : { ...art, html: persistedHtml };
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
        const pointerProjectFiles = filterProjectFilesByMinMtime(
          currentProjectFiles,
          options.pointerMinMtime,
        );
        const pointerTarget = resolveHtmlPointerArtifactTarget({
          content: artifactToPersist.html,
          candidateFileName: fileName,
          projectFiles: pointerProjectFiles,
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
        const validation = validateHtmlArtifact(artifactToPersist.html);
        if (!validation.ok) {
          setError(`Refused to save artifact "${art.identifier || art.title || 'untitled'}": ${validation.reason}`);
          return;
        }
      }
      if (savedArtifactRef.current === fileName) return;
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
              designSystemId: projectDesignSystemId,
              metadata,
            })
          : inferLegacyManifest({
              entry: fileName,
              title,
              metadata: {
                ...metadata,
                sourceSkillId: project.skillId ?? undefined,
                designSystemId: projectDesignSystemId,
              },
            });
      const file = await writeProjectTextFile(project.id, fileName, artifactToPersist.html, {
        artifactManifest: manifest ?? undefined,
      });
      if (file) {
        savedArtifactRef.current = file.name;
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
    [project.id, projectDesignSystemId, project.skillId, requestOpenFile],
  );

  const artifactFromStandaloneHtml = useCallback(
    (sourceText: string): Artifact | null => artifactFromRecoverableSourceText(sourceText),
    [],
  );

  // Set of project file names that the chat surface uses to decide whether
  // a tool card's path is openable as a tab. Recomputed on every file-list
  // change; tool cards just read from the set.
  const projectFileNames = useMemo(
    () => new Set(projectFiles.map((f) => f.name)),
    [projectFiles],
  );

  const {
    openTabsState,
    headerArtifact,
    activeWorkspaceContext,
    workspaceContexts,
    handleActiveWorkspaceContextChange,
    handleWorkspaceContextsChange,
    persistTabsState,
    tabsLoadedRef,
    tabsHydratedFromSavedStateRef,
    tabsHydrationVersion,
  } = useWiredOpenTabsSync(
    project.id,
    routeFileName,
    projectFiles,
    projectFileNames,
    activeConversationId,
    lastSyncedConversationIdRef,
  );

  // A previewable artifact exists once any HTML file has been produced. Gates
  // the one-time first-generation hint (spec §8.3); the hint component owns its
  // own once-ever "seen" budget.
  const hasPreviewableArtifact = useMemo(() => {
    for (const name of projectFileNames) {
      if (name.toLowerCase().endsWith('.html')) return true;
    }
    return false;
  }, [projectFileNames]);
  // First-loop ledger: the artifact reaching the preview is the 查看 step of the
  // loop (spec §8.3). Recorded once per project; a no-op for any project not
  // started from a recommendation.
  const firstLoopViewedRef = useRef(false);
  useEffect(() => {
    if (!hasPreviewableArtifact || firstLoopViewedRef.current) return;
    if (!onboardingEntryRef.current) return;
    firstLoopViewedRef.current = true;
    recordFirstLoopStep(analytics.track, 'artifact_viewed', project.id);
  }, [hasPreviewableArtifact, analytics.track, project.id]);
  const activeProjectFileName = useMemo(
    () => (
      openTabsState.active && projectFileNames.has(openTabsState.active)
        ? openTabsState.active
        : null
    ),
    [openTabsState.active, projectFileNames],
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
    const designSystem = projectDesignSystemId
      ? designSystems.find((d) => d.id === projectDesignSystemId)
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
  }, [designSystems, designTemplates, projectDesignSystemId, project.skillId, skills]);
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

  const handleEnsureProject = useCallback(async (): Promise<string | null> => {
    return project.id;
  }, [project.id]);

  const readLocalBrowserPageArchiveSnapshot = useCallback(
    async (sourceUrl: string | null | undefined): Promise<BrandBrowserSnapshot> => {
      const manifestText = await fetchProjectFileText(project.id, BROWSER_PAGE_ARCHIVE_INDEX_FILE, {
        cache: 'no-store',
        cacheBustKey: Date.now(),
      });
      if (!manifestText) {
        return { status: 'unavailable', message: t('chat.brandBrowserLocalSnapshotMissing') };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(manifestText);
      } catch {
        return { status: 'read-failed', message: t('chat.brandBrowserLocalSnapshotReadFailed') };
      }
      if (!isBrowserPageArchiveManifest(parsed)) {
        return { status: 'read-failed', message: t('chat.brandBrowserLocalSnapshotReadFailed') };
      }
      if (!brandBrowserSnapshotMatchesSource(parsed.baseUrl || parsed.url, sourceUrl)) {
        return { status: 'unavailable', message: t('chat.brandBrowserLocalSnapshotMissing') };
      }
      const [html, css] = await Promise.all([
        fetchProjectFileText(project.id, parsed.htmlFile, { cache: 'no-store', cacheBustKey: parsed.capturedAt }),
        fetchProjectFileText(project.id, parsed.cssFile, { cache: 'no-store', cacheBustKey: parsed.capturedAt }),
      ]);
      if (!html?.trim()) {
        return { status: 'read-failed', message: t('chat.brandBrowserLocalSnapshotReadFailed') };
      }
      return {
        status: 'ready',
        html,
        css: css ?? '',
        baseUrl: parsed.baseUrl || parsed.url,
      };
    },
    [project.id, t],
  );

  const readBrandBrowserSnapshot = useCallback(
    async (tabId = BRAND_BROWSER_TAB_ID, timeoutMs = 8000): Promise<BrandBrowserSnapshot> => {
      const handle = getBrandBrowser(project.id, tabId);
      if (!handle || !handle.isDesktopWebview) {
        return { status: 'unavailable', message: t('chat.brandBrowserAssistDesktopOnly') };
      }
      // Guard against a tab that never actually navigated/loaded — reading a
      // blank webview would otherwise look like an empty page.
      const tabUrl = handle.getURL();
      if (!tabUrl || tabUrl === 'about:blank') {
        return { status: 'read-failed', message: t('chat.brandBrowserAssistReadFailed') };
      }
      // Electron's executeJavaScript never times out on its own; a tab still on a
      // challenge wall / mid-redirect / hung renderer would freeze the recovery
      // forever. Cap each read so the UI surfaces a retryable error instead.
      const readTab = (script: string): Promise<string> => {
        const promise = handle.executeJavaScript<string>(script, true);
        if (!promise) return Promise.resolve('');
        return Promise.race([
          promise,
          new Promise<string>((_, reject) =>
            window.setTimeout(
              () => reject(new Error(t('chat.brandBrowserAssistReadFailed'))),
              timeoutMs,
            ),
          ),
        ]);
      };
      let html = '';
      let css = '';
      try {
        // Read the DOM and the computed-style digest CONCURRENTLY: serially they
        // stacked two full timeout windows back-to-back (a slow page meant ~16s
        // per attempt, and the retry loop multiplied that into a minute-long
        // spinner). The CSS digest is best-effort — a sparse/empty palette no
        // longer fails extraction server-side — so it must never reject the read.
        [html, css] = await Promise.all([
          readTab(BROWSER_SERIALIZE_HTML_SCRIPT),
          readTab(BROWSER_SERIALIZE_STYLES_SCRIPT).catch(() => ''),
        ]);
      } catch (err) {
        return {
          status: 'read-failed',
          message: err instanceof Error ? err.message : t('chat.brandBrowserAssistReadFailed'),
        };
      }
      if (!html.trim()) {
        return { status: 'read-failed', message: t('chat.brandBrowserAssistReadFailed') };
      }
      const baseUrl = handle.getURL() || tabUrl;
      return { status: 'ready', html, css, baseUrl };
    },
    [project.id, t],
  );

  const downloadBrandBrowserPageArchive = useCallback(
    async (
      sourceUrl: string | null | undefined,
      tabId = BRAND_BROWSER_TAB_ID,
      // The page-snapshot download now persists only page.html + styles.css
      // (extraction reads nothing else), so it completes in well under a
      // second. This race is just a generous safety ceiling for serializing a
      // very large DOM, not a budget for asset fetching.
      timeoutMs = 30_000,
    ): Promise<BrandBrowserSnapshot> => {
      const handle = getBrandBrowser(project.id, tabId);
      if (!handle || !handle.isDesktopWebview || !handle.downloadPageSnapshot) {
        return { status: 'unavailable', message: t('chat.brandBrowserAssistDesktopOnly') };
      }
      const result: BrandBrowserPageSnapshotResult = await Promise.race<BrandBrowserPageSnapshotResult>([
        handle.downloadPageSnapshot(),
        new Promise<BrandBrowserPageSnapshotResult>((_, reject) =>
          window.setTimeout(
            () => reject(new Error(t('chat.brandBrowserSnapshotSaveFailed'))),
            timeoutMs,
          ),
        ),
      ]).catch((err): BrandBrowserPageSnapshotResult => ({
        ok: false,
        message: err instanceof Error ? err.message : t('chat.brandBrowserSnapshotSaveFailed'),
      }));
      if (!result.ok) {
        return { status: 'read-failed', message: result.message || t('chat.brandBrowserSnapshotSaveFailed') };
      }
      return readLocalBrowserPageArchiveSnapshot(sourceUrl || result.baseUrl || '');
    },
    [project.id, readLocalBrowserPageArchiveSnapshot, t],
  );

  const readBrandBrowserSnapshotWithRetry = useCallback(
    async (tabId = BRAND_BROWSER_TAB_ID): Promise<BrandBrowserSnapshot> => {
      // The pinned webview can still be mounting/registering right after a
      // workspace remount, and a freshly-focused tab may not have committed its
      // post-wall URL yet — so a single read can spuriously report the live DOM
      // unreadable. Re-read a few times before giving up. Only meaningful on the
      // desktop host: the web-only host never exposes a webview, so retrying
      // can't change an `unavailable` verdict.
      let snapshot = await readBrandBrowserSnapshot(tabId, 8000);
      if (snapshot.status === 'ready' || !isOpenDesignHostAvailable()) return snapshot;
      // Retries cover the mount/registration race only — a ready webview resolves
      // these reads almost instantly. Use a short per-retry cap so a genuinely
      // hung/walled page fails fast instead of stacking full timeout windows.
      for (let attempt = 0; attempt < 3 && snapshot.status !== 'ready'; attempt += 1) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 500);
        });
        snapshot = await readBrandBrowserSnapshot(tabId, 3000);
      }
      return snapshot;
    },
    [readBrandBrowserSnapshot],
  );

  // Client-side handler for the brand-browser-assist od-card's button: open or
  // focus the bound Browser tab, surface the Download Page menu action, and let
  // Continue extraction consume the saved snapshot or live DOM.
  const handleBrandBrowserAssistConfirm = useCallback<BrandBrowserAssistConfirm>(
    async (card): Promise<BrandBrowserAssistResult> => {
      const url = card.url?.trim() || currentProject.metadata?.brandSourceUrl?.trim() || '';
      if (!url) return { ok: false, message: t('chat.brandBrowserAssistReadFailed') };
      const nonce = Date.now();
      setBrowserOpenRequest({
        tabId: card.browserTabId || BRAND_BROWSER_TAB_ID,
        url,
        nonce,
        attentionAction: 'download-page',
      });
      setProjectActionsToast({
        message: t('chat.brandBrowserAssistDownloadGuideTitle'),
        details: t('chat.brandBrowserAssistDownloadGuideDetails'),
        tone: 'default',
        ttlMs: 12000,
      });
      return { ok: true, action: 'opened' };
    },
    [currentProject.metadata?.brandSourceUrl, t],
  );

  // Identity for host-authored chat messages (the brand browser-assist prompt
  // below). Without it the message collapses to the generic "Assistant" label +
  // monogram; stamping the user's currently-selected design agent makes its
  // avatar and role name follow that selection (Claude by default), matching how
  // handleSend identifies a real turn.
  const selectedAssistantIdentity = useMemo<{
    agentId: string | undefined;
    agentName: string | undefined;
  }>(() => {
    if (config.mode === 'daemon') {
      const selectedAgent = config.agentId ? agentsById.get(config.agentId) : null;
      const selectedAgentChoice = config.agentId
        ? config.agentModels?.[config.agentId]
        : undefined;
      const effectiveChoice = effectiveAgentModelChoice(selectedAgent, selectedAgentChoice);
      return {
        agentId: config.agentId ?? undefined,
        agentName: agentModelDisplayName(
          config.agentId,
          selectedAgent?.name,
          effectiveChoice?.model,
        ),
      };
    }
    return {
      agentId: apiProtocolAgentId(config.apiProtocol),
      agentName: apiProtocolModelLabel(config.apiProtocol, config.model),
    };
  }, [config, agentsById]);

  // One-shot: when extraction is blocked by an anti-bot wall (or has stalled past
  // the timeout), drop the assist card into the conversation so the user can
  // clear the wall in the Browser tab and Confirm. Keyed per conversation+brand
  // so it can't double-post.
  const injectedAssistRef = useRef<string | null>(null);
  useEffect(() => {
    if (!brandBrowserAssist || !activeConversationId) return;
    if (messagesConversationId !== activeConversationId) return;
    const { brandId, sourceUrl, reason } = brandBrowserAssist;
    const dedupeKey = `${activeConversationId}:${brandId}`;
    if (injectedAssistRef.current === dedupeKey) return;
    injectedAssistRef.current = dedupeKey;
    if (conversationHasBrandBrowserAssist(messagesRef.current, brandId)) {
      dismissBrandBrowserAssist();
      return;
    }
    const payload = JSON.stringify({
      brandId,
      browserTabId: BRAND_BROWSER_TAB_ID,
      ...(sourceUrl ? { url: sourceUrl } : {}),
      reason,
    });
    const content = `${t('chat.brandBrowserAssistMessage')}\n\n<od-card type="brand-browser-assist">${payload}</od-card>`;
    appendConversationMessage(activeConversationId, {
      id: randomUUID(),
      role: 'assistant',
      agentId: selectedAssistantIdentity.agentId,
      agentName: selectedAssistantIdentity.agentName,
      content,
      events: [{ kind: 'text', text: content }],
      createdAt: Date.now(),
    });
    dismissBrandBrowserAssist();
  }, [
    brandBrowserAssist,
    activeConversationId,
    appendConversationMessage,
    dismissBrandBrowserAssist,
    messagesConversationId,
    selectedAssistantIdentity,
    t,
  ]);

  // The programmatic brand-extraction transcript is a synthetic row the daemon
  // reconciles to a terminal state out of band (finalize success, the 30s
  // "needs a hand" checkpoint, or a user Stop) — there is no SSE run streaming
  // it. Poll the conversation while that row is still "running" so the terminal
  // flip shows up live instead of leaving an ever-climbing "Working" clock until
  // a manual reload. Self-cleans the moment the row settles or a live agent run
  // takes over (we never refresh on top of an active stream).
  const hasRunningBrandTranscriptRow = useMemo(
    () =>
      currentProject.metadata?.importedFrom === 'brand-extraction'
      && messages.some((m) => m.role === 'assistant' && m.runStatus === 'running'),
    [currentProject.metadata?.importedFrom, messages],
  );
  useEffect(() => {
    if (!hasRunningBrandTranscriptRow || streaming) return undefined;
    const conversationId = activeConversationId;
    if (!conversationId) return undefined;
    const timer = window.setInterval(() => {
      void refreshConversationMessagesFromServer(conversationId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [
    hasRunningBrandTranscriptRow,
    streaming,
    activeConversationId,
    refreshConversationMessagesFromServer,
  ]);

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
      return false;
    }
    if (abortRef.current !== controller || cancelRef.current !== cancelController) {
      return false;
    }
    abortRef.current = null;
    cancelRef.current = null;
    return true;
  }, []);

  const clearCurrentRunStreamingMarker = useCallback((
    conversationId: string,
    controller: AbortController,
    cancelController: AbortController,
  ) => {
    if (!clearActiveRunRefs(conversationId, controller, cancelController)) return false;
    clearStreamingMarker(conversationId);
    return true;
  }, [clearActiveRunRefs, clearStreamingMarker]);

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
      const isDesignSystemWorkspace =
        isDesignSystemWorkspaceMetadata(currentProject.metadata) || projectIsDesignSystemProject;
      if (!isDesignSystemWorkspace) return;
      try {
        if (designSystemBrandId) {
          const outcome = await finalizeBrandProject(designSystemBrandId, project.id);
          if (outcome.ok) {
            await Promise.all([
              projectDetail.refresh(),
              Promise.resolve(onDesignSystemsRefresh?.()),
              refreshWorkspaceItems(),
            ]);
            onProjectsRefresh();
            setDesignMdRefreshKey((n) => n + 1);
            updateMessageById(
              assistantMessageId,
              (prev) => ({
                ...prev,
                events: [
                  ...(prev.events ?? []),
                  {
                    kind: 'status',
                    label: 'design_system',
                    detail: 'Rebuilt derived kit, assets, and registered design system from brand.json.',
                  },
                ],
              }),
              true,
              { telemetryFinalized: true },
            );
          } else {
            updateMessageById(
              assistantMessageId,
              (prev) => ({
                ...prev,
                events: [
                  ...(prev.events ?? []),
                  {
                    kind: 'status',
                    label: 'design_system',
                    detail: `Design system sync could not run: ${outcome.error}`,
                  },
                ],
              }),
              true,
              { telemetryFinalized: true },
            );
          }
        }
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
          if (projectViewTransportPort.consumeDesignSystemAuditAutoRepair(project.id)) {
            const seed = { id: `audit-${Date.now()}`, value: repairPrompt };
            setChatSeed(seed);
            setAutoAuditRepairSeed(seed);
          }
        } else {
          projectViewTransportPort.clearDesignSystemAuditAutoRepair(project.id);
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
    [
      currentProject.metadata,
      designSystemBrandId,
      onDesignSystemsRefresh,
      onProjectsRefresh,
      project.id,
      projectDetail.refresh,
      projectIsDesignSystemProject,
      refreshWorkspaceItems,
      updateMessageById,
    ],
  );

  // Maximum number of times we will retry fetching a null status for a
  // spuriouslyFailedPending run before treating the absence as authoritative
  // completion.  Transient null-status retries are bounded; after
  // MAX_TRANSIENT_RETRIES we add to completedReattachRunsRef to avoid spinning.
  const MAX_TRANSIENT_RETRIES = 2;

  // Reset transient retry counts when the conversation or daemon connection
  // changes so stale counts from a previous session do not bleed in.  This
  // must be a separate effect keyed only on those two values; placing the
  // reset inside the reattach effect (which also depends on recoveryTick and
  // messages) would zero the counts every time the timer-driven recoveryTick
  // bumped, preventing attempts >= MAX_TRANSIENT_RETRIES from ever holding.
  useEffect(() => {
    transientFailedRetriesRef.current = new Map();
    genericDisconnectRetriesRef.current = new Map();
    genericDisconnectBackoffUntilRef.current = new Map();
  }, [activeConversationId, daemonLive]);

  useEffect(() => {
    if (config.mode !== 'daemon' || !daemonLive || !activeConversationId || streaming) return;
    let cancelled = false;
    const reattachConversationId = activeConversationId;

    const attachRecoverableRuns = async () => {
      const missingRunIdMessages = messages.filter((m) => {
        if (m.role !== 'assistant' || m.runId) return false;
        if (isProgrammaticBrandExtractionStatusMessage(m, currentProject.metadata)) return false;
        return isActiveRunStatus(m.runStatus);
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

        // A message whose run_status was spuriously written as 'failed' before
        // the page reloaded (e.g. the SSE reconnect fallback fired while the
        // daemon run was still in flight) must still be reattached when the
        // actual daemon run succeeded.  Detect this by checking for a 'failed'
        // message that has a runId but no content and no produced files — the
        // daemon's authoritative status is fetched below and the message is
        // updated to reflect it.
        //
        // NOTE: `spuriouslyFailedPending` is kept separate from the other two
        // branches because the recovery action is gated on the fetched daemon
        // status; genuine failures (onError of a live stream) must not enter
        // the reattach path and must never have their persisted failure context
        // cleared or their resumable flag overwritten.
        const spuriouslyFailedPending =
          message.runStatus === 'failed' &&
          !!message.runId &&
          !message.content &&
          !(message.producedFiles?.length);
        const recoverableGenericDisconnectFailed =
          message.runStatus === 'failed' &&
          !!message.runId &&
          hasGenericDisconnectFailureEvent(message);
        const replayingTerminalRun =
          shouldReplayTerminalRunMessage(message) || spuriouslyFailedPending;
        const needsFullReplay =
          isActiveRunStatus(message.runStatus) ||
          replayingTerminalRun ||
          spuriouslyFailedPending ||
          recoverableGenericDisconnectFailed;
        if (!needsFullReplay) continue;
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
          if (isProgrammaticBrandExtractionStatusMessage(message, currentProject.metadata)) {
            continue;
          }
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
        const genericDisconnectBackoffUntil =
          genericDisconnectBackoffUntilRef.current.get(runId) ?? 0;
        if (genericDisconnectBackoffUntil > Date.now()) continue;
        genericDisconnectBackoffUntilRef.current.delete(runId);

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
          // `fetchChatRunStatus` returns null on ANY non-OK response or fetch
          // exception (providers/daemon.ts:686), not only when the daemon has
          // permanently forgotten the run.  For a spuriously-failed pending
          // message we must keep this path retryable: a transient network or
          // daemon hiccup during reload must not permanently suppress the
          // reattach attempt for the rest of the session.
          //
          // Transient null-status retries are bounded; after MAX_TRANSIENT_RETRIES
          // we treat the absence as authoritative completion to avoid spinning.
          // Timers are tracked in transientRetryTimersRef and cleared on cleanup.
          //
          // For other message states (phantom running rows with no runId),
          // fall through to the original mark-failed behaviour and seal the
          // runId so we don't loop indefinitely.
          if (spuriouslyFailedPending) {
            const attempts = transientFailedRetriesRef.current.get(runId) ?? 0;
            if (attempts >= MAX_TRANSIENT_RETRIES) {
              // Cap reached — treat as authoritative completion so we stop retrying.
              // Clear the Map entry so it doesn't accumulate stale entries.
              transientFailedRetriesRef.current.delete(runId);
              genericDisconnectRetriesRef.current.delete(runId);
              completedReattachRunsRef.current.add(runId);
            } else {
              transientFailedRetriesRef.current.set(runId, attempts + 1);
              const handle = setTimeout(() => {
                transientRetryTimersRef.current.delete(handle);
                setRecoveryTick((t) => t + 1);
              }, 3000);
              transientRetryTimersRef.current.add(handle);
            }
          } else {
            updateMessageById(
              message.id,
              (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
              true,
            );
            completedReattachRunsRef.current.add(runId);
          }
          continue;
        }
        // When the daemon authoritative status is 'failed', the run ended in a
        // genuine failure.  For spuriously-failed pending messages this means
        // the client-side heuristic was wrong — the daemon did not succeed.
        // Leave the message alone so its persisted error content/events/producedFiles
        // survive, but still apply the daemon's authoritative `resumable` flag so
        // ChatPane's Continue affordance reflects the daemon's view after a reload.
        if (spuriouslyFailedPending && status.status === 'failed') {
          if (typeof status.resumable !== 'undefined') {
            updateMessageById(
              message.id,
              (prev) => ({ ...prev, resumable: status.resumable }),
              true,
            );
          }
          // Clear stale retry count — this run is authoritatively done.
          transientFailedRetriesRef.current.delete(runId);
          genericDisconnectRetriesRef.current.delete(runId);
          genericDisconnectBackoffUntilRef.current.delete(runId);
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        if (spuriouslyFailedPending && status.status === 'canceled') {
          setError(null);
          // Route through the shared invariant helper: `status` is already
          // terminal here, so this resolves to `status.updatedAt` directly.
          const endedAt = await resolveTerminalEndedAt(runId, status, fetchChatRunStatus);
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runStatus: 'canceled',
              endedAt,
              ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
            }),
            true,
          );
          transientFailedRetriesRef.current.delete(runId);
          genericDisconnectRetriesRef.current.delete(runId);
          genericDisconnectBackoffUntilRef.current.delete(runId);
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        if (spuriouslyFailedPending && status.status === 'succeeded') {
          setError(null);
          transientFailedRetriesRef.current.delete(runId);
          genericDisconnectRetriesRef.current.delete(runId);
          genericDisconnectBackoffUntilRef.current.delete(runId);
        }
        if (!(spuriouslyFailedPending && status.status === 'succeeded')) {
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runStatus: status.status,
              ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
            }),
            true,
          );
        }

        if (shouldReplayTerminalRunMessage(message)) {
          const replayedContent = textContentFromAgentEvents(message.events);
          if (replayedContent.trim().length > 0) {
            const parser = createArtifactParser();
            let parsedArtifact: Artifact | null = null;
            let liveHtml = '';
            for (const ev of [...parser.feed(replayedContent), ...parser.flush()]) {
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
                parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, liveHtml);
                setArtifact((prev) =>
                  artifactWithHtml(prev, ev.identifier, liveHtml),
                );
              } else if (ev.type === 'artifact:end') {
                parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, ev.fullContent);
                setArtifact((prev) =>
                  prev ? artifactWithHtml(prev, ev.identifier, ev.fullContent) : null,
                );
              }
            }

            // Legacy rows persisted before `endedAt` existed reach this
            // branch with no stored `endedAt` at all — fall back to the
            // daemon's authoritative terminal timestamp (already fetched
            // above as `status`) rather than the reload's wall-clock time.
            const legacyReplayEndedAt = await resolveTerminalEndedAt(runId, status, fetchChatRunStatus);
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                content: replayedContent,
                runStatus: resolveSucceededRunStatus(prev.runStatus),
                endedAt: prev.endedAt ?? legacyReplayEndedAt,
              }),
              true,
              { telemetryFinalized: true },
            );

            let nextFiles = await refreshProjectFiles();
            const beforeFileNames = new Set(
              message.preTurnFileNames ?? nextFiles.map((f) => f.name),
            );
            const artifactToPersist = parsedArtifact?.html
              ? parsedArtifact
              : artifactFromStandaloneHtml(replayedContent);
            let recoveredExistingArtifact: ProjectFile | null = null;
            if (artifactToPersist?.html) {
              const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
              const runStartedAt = status.createdAt || message.startedAt || message.createdAt;
              recoveredExistingArtifact =
                await findSameTurnWriteForRecoveredArtifact({
                  artifact: artifactToPersist,
                  sourceText: replayedContent,
                  producedFiles: producedBeforeFallback,
                  readProjectText: readProjectHtml,
                }) ??
                findExistingArtifactProjectFile(
                  artifactToPersist,
                  nextFiles,
                  { minMtime: runStartedAt },
                );
              if (recoveredExistingArtifact) {
                savedArtifactRef.current = recoveredExistingArtifact.name;
                requestOpenFile(recoveredExistingArtifact.name);
              } else {
                savedArtifactRef.current = null;
                await persistArtifact(
                  artifactToPersist,
                  nextFiles,
                  replayedContent,
                  { pointerMinMtime: runStartedAt },
                );
                nextFiles = await refreshProjectFiles();
              }
            }
            const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
            const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
            const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced);
            if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
            if (produced.length > 0) {
              updateMessageById(
                message.id,
                (prev) => ({ ...prev, producedFiles: produced }),
                true,
                { telemetryFinalized: true },
              );
            }
            await auditDesignSystemWorkspaceAfterRun(message.id);
            // Clear stale retry count for successfully recovered run.
            transientFailedRetriesRef.current.delete(runId);
            genericDisconnectRetriesRef.current.delete(runId);
            completedReattachRunsRef.current.add(runId);
            onProjectsRefresh();
            continue;
          }
        }

        const controller = new AbortController();
        const cancelController = new AbortController();
        reattachControllersRef.current.set(runId, controller);
        reattachCancelControllersRef.current.set(runId, cancelController);
        if (!isTerminalRunStatus(status.status)) {
          abortRef.current = controller;
          cancelRef.current = cancelController;
          markStreamingConversation(reattachConversationId);
        }
        // Only blank content/events/producedFiles when the daemon confirms the run
        // is still recoverable (queued/running/succeeded).  A genuinely failed run
        // already carries diagnostic information in `events`; clearing it before
        // re-running the reattach path would erase the error context and loop the
        // message through reattach even when the daemon still reports `failed`.
        const daemonStatusIsRecoverable =
          status.status === 'queued' ||
          status.status === 'running' ||
          status.status === 'succeeded';
        if (needsFullReplay && daemonStatusIsRecoverable) {
          updateMessageById(
            message.id,
            // Clear endedAt only for spuriously-failed pending messages so the
            // replay finalizers stamp Date.now() on real completion instead of
            // preserving the SSE-disconnect timestamp that onError set when the
            // browser-side reconnect loop gave up.  Already-succeeded rows
            // reaching needsFullReplay via shouldReplayTerminalRunMessage must
            // keep their original terminal timestamp; resetting it here causes
            // prev.endedAt ?? Date.now() to re-stamp to reload time and drifts
            // persisted run durations forward.
            (prev) => ({ ...prev, content: '', events: [], producedFiles: undefined, ...(spuriouslyFailedPending ? { endedAt: undefined } : {}) }),
          );
          // When the failed-message recovery moves back to running/succeeded,
          // clear any stale "daemon stream disconnected" error banner that the
          // original onError path may have set, so the chat does not show a
          // stale error after the reattach succeeds.
          setError(null);
        }

        let persistTimer: ReturnType<typeof setTimeout> | null = null;
        const persistSoon = () => {
          if (persistTimer) return;
          persistTimer = scheduleProjectTimeout(() => {
            persistTimer = null;
            persistMessageById(message.id);
          }, 500);
        };
        const persistNow = (options?: SaveMessageOptions) => {
          if (persistTimer) {
            clearProjectTimeout(persistTimer);
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
        let latestReattachRunStatus: ChatMessage['runStatus'] = status.status;
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
          subscribeFlushTriggers: projectViewTransportPort.subscribeBufferedTextFlushTriggers,
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
              // First payload from the resumed stream is real recovery — the daemon is
              // sending data, not just answering REST status probes.  Reset the
              // transient retry budgets so a future disconnect starts from zero, but
              // only on genuine stream progress (not on a status fetch or queued→running
              // transition). Terminal replay recovery is the exception: if a
              // replay-only reconnect delivers partial output and then disconnects
              // again, we must preserve the generic-disconnect retry budget long
              // enough to status-probe and force a clean full replay instead of
              // persisting that truncated transcript.
              transientFailedRetriesRef.current.delete(runId);
              if (!(replayingTerminalRun && !(message.producedFiles?.length))) {
                genericDisconnectRetriesRef.current.delete(runId);
              }
              genericDisconnectBackoffUntilRef.current.delete(runId);
              replayedContent += delta;
              textBuffer.appendContent(delta);
            },
            onAgentEvent: (ev) => {
              transientFailedRetriesRef.current.delete(runId);
              if (!(replayingTerminalRun && !(message.producedFiles?.length))) {
                genericDisconnectRetriesRef.current.delete(runId);
              }
              genericDisconnectBackoffUntilRef.current.delete(runId);
              replayedEvents = [...replayedEvents, ev];
              textBuffer.appendEvent(ev);
            },
            onDone: async () => {
              // A reattached run interrupted by a "send now" still receives a
              // late onDone from the daemon. Decide ownership first, then bail
              // BEFORE any current-run side effect (committing buffered text,
              // repainting the artifact preview via setArtifact, re-finalizing
              // the message) — only release this run's bookkeeping. See the
              // streamViaDaemon onDone for the ownership rationale.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              if (runMayFinalize) textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              // Clear stale retry count for successfully recovered run.
              transientFailedRetriesRef.current.delete(runId);
              genericDisconnectRetriesRef.current.delete(runId);
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              // Clear any stale error banner set by the original onError path
              // (e.g. "daemon stream disconnected") so the chat does not show it
              // after the spuriously-failed message reattaches and succeeds.
              if (runMayFinalize && spuriouslyFailedPending) setError(null);
              if (!runMayFinalize) return;
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
              // `status` is the pre-reattach snapshot fetched before
              // reattachDaemonRun started — on a reload-while-running it is
              // still 'running' (a near-run-start heartbeat), not the
              // daemon's terminal time. Re-probe now, at the end of
              // recovery, for the authoritative terminal `updatedAt`.
              const endedAt = await resolveTerminalEndedAt(runId, status, fetchChatRunStatus);
              updateMessageById(
                message.id,
                (prev) => ({
                  ...prev,
                  content: needsFullReplay ? replayedContent : prev.content,
                  events: needsFullReplay ? replayedEvents : prev.events,
                  runStatus:
                    latestReattachRunStatus === 'canceled' ? 'canceled' : 'succeeded',
                  endedAt,
                }),
                true,
                latestReattachRunStatus === 'canceled'
                  ? { telemetryFinalized: true }
                  : undefined,
              );
              if (latestReattachRunStatus === 'canceled') return;
              void (async () => {
                const preTurn = message.preTurnFileNames;
                let nextFiles = await refreshProjectFiles();
                // Use the turn-start snapshot when available so reload
                // recovers files produced before the artifact write too;
                // fall back to the current list for legacy messages.
                const beforeFileNames = new Set(preTurn ?? nextFiles.map((f) => f.name));
                let recoveredExistingArtifact: ProjectFile | null = null;
                const artifactToPersist = parsedArtifact?.html
                  ? parsedArtifact
                  : artifactFromStandaloneHtml(replayedContent);
                if (artifactToPersist?.html) {
                  const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                  const runStartedAt = status.createdAt || message.startedAt || message.createdAt;
                  recoveredExistingArtifact =
                    await findSameTurnWriteForRecoveredArtifact({
                      artifact: artifactToPersist,
                      sourceText: replayedContent,
                      producedFiles: producedBeforeFallback,
                      readProjectText: readProjectHtml,
                    }) ??
                    findExistingArtifactProjectFile(
                      artifactToPersist,
                      nextFiles,
                      { minMtime: runStartedAt },
                    );
                  if (recoveredExistingArtifact) {
                    savedArtifactRef.current = recoveredExistingArtifact.name;
                    requestOpenFile(recoveredExistingArtifact.name);
                  } else {
                    savedArtifactRef.current = null;
                    await persistArtifact(
                      artifactToPersist,
                      nextFiles,
                      replayedContent,
                      { pointerMinMtime: runStartedAt },
                    );
                    nextFiles = await refreshProjectFiles();
                  }
                }
                const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                const traceObjectFiles = mergeRecoveredTraceObjectFile(
                  computeTraceObjectFiles(
                    beforeFileNames,
                    nextFiles,
                    extractTouchedFilePathsFromEvents(
                      needsFullReplay ? replayedEvents : message.events,
                    ),
                  ) ?? [],
                  recoveredExistingArtifact,
                );
                const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced);
                if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
                updateMessageById(
                  message.id,
                  (prev) => ({ ...prev, producedFiles: produced, traceObjectFiles }),
                  true,
                  { telemetryFinalized: true },
                );
                await auditDesignSystemWorkspaceAfterRun(message.id);
              })();
              onProjectsRefresh();
            },
            onError: async (err) => {
              const errorCode = (err as Error & { code?: string }).code;
              const resumable = (err as Error & { resumable?: boolean }).resumable === true;
              let skipFinalPersistNow = false;
              let retryFullReplayAfterCleanup = false;
              const genericDisconnect = isGenericDaemonDisconnect(err);
              // A superseded reattached run must not paint a global failure
              // banner or re-finalize its message over the replacement run.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              if (runMayFinalize) {
                setError(err.message);
                appendAssistantErrorEvent(message.id, err.message, errorCode);
                updateMessageById(
                  message.id,
                  (prev) => ({
                    ...prev,
                    runStatus: 'failed',
                    endedAt: prev.endedAt ?? Date.now(),
                    resumable,
                  }),
                  true,
                );
                if (!genericDisconnect && artifactFromRecoverableSourceText(replayedContent)) {
                  void (async () => {
                    if (recoveredArtifactMessagesRef.current.has(message.id)) return;
                    const latestRunStatus = await fetchChatRunStatus(runId).catch(() => null);
                    const artifactToPersist = parsedArtifact?.html
                      ? parsedArtifact
                      : artifactFromStandaloneHtml(replayedContent);
                    if (!artifactToPersist?.html) return;
                    let nextFiles = await refreshProjectFiles();
                    const beforeFileNames = new Set(
                      message.preTurnFileNames ?? nextFiles.map((f) => f.name),
                    );
                    const runStartedAt =
                      latestRunStatus?.createdAt || message.startedAt || message.createdAt;
                    const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                    let recoveredExistingArtifact =
                      await findSameTurnWriteForRecoveredArtifact({
                        artifact: artifactToPersist,
                        sourceText: replayedContent,
                        producedFiles: producedBeforeFallback,
                        readProjectText: readProjectHtml,
                      }) ??
                      findExistingArtifactProjectFile(
                        artifactToPersist,
                        nextFiles,
                        { minMtime: runStartedAt },
                      );
                    if (recoveredExistingArtifact) {
                      savedArtifactRef.current = recoveredExistingArtifact.name;
                      requestOpenFile(recoveredExistingArtifact.name);
                    } else {
                      savedArtifactRef.current = null;
                      await persistArtifact(
                        artifactToPersist,
                        nextFiles,
                        replayedContent,
                        { pointerMinMtime: runStartedAt },
                      );
                      nextFiles = await refreshProjectFiles();
                      recoveredExistingArtifact = findExistingArtifactProjectFile(
                        artifactToPersist,
                        nextFiles,
                        { minMtime: runStartedAt },
                      );
                    }
                    const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                    const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                    if (produced.length > 0) {
                      recoveredArtifactMessagesRef.current.add(message.id);
                    }
                    const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced);
                    if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
                    if (latestRunStatus?.status === 'succeeded') setError(null);
                    // Unlike the recoverArtifacts sibling below, this row's
                    // endedAt was already stamped synchronously above (~4041)
                    // at disconnect time — `prev.endedAt` is never null here,
                    // so a `prev.endedAt ?? ...` fallback would never fire.
                    // Overwrite it, but ONLY when the daemon just confirmed
                    // succeeded (the same condition gating the runStatus
                    // upgrade below) — `latestRunStatus` is already the fresh,
                    // confirmed-terminal probe from above, so its `updatedAt`
                    // is authoritative directly, with no extra re-probe.
                    // Otherwise this row is still not terminal and must keep
                    // its existing endedAt.
                    updateMessageById(
                      message.id,
                      (prev) => ({
                        ...prev,
                        content: replayedContent,
                        producedFiles: produced.length > 0 ? produced : prev.producedFiles,
                        runStatus: latestRunStatus?.status === 'succeeded' ? 'succeeded' : prev.runStatus,
                        endedAt:
                          latestRunStatus?.status === 'succeeded'
                            ? latestRunStatus.updatedAt
                            : prev.endedAt,
                      }),
                      true,
                      { telemetryFinalized: true },
                    );
                    await auditDesignSystemWorkspaceAfterRun(message.id);
                    onProjectsRefresh();
                  })();
                }
              }
              // Clear stale retry count for the run.  Generic disconnects
              // (browser SSE reconnect-budget exhaustion) are NOT authoritative
              // terminal failures — the daemon may still report the run as
              // queued/running/succeeded on the next attachRecoverableRuns tick.
              // Only seal completedReattachRunsRef for real terminal errors so
              // generic disconnects stay eligible for re-query.
              // Generic disconnects share the transient-retry budget with the
              // null-status path. Even once the generic-disconnect retry budget
              // is exhausted, we must not seal on a transient status-probe miss:
              // fetchChatRunStatus() returns null for any network/non-OK failure,
              // not only when the daemon has truly forgotten the run. Treat
              // null the same as an active retryable state and keep the row
              // eligible for future refresh/reattach. Only authoritative
              // terminal statuses seal completedReattachRunsRef.
              if (genericDisconnect) {
                const attempts = (genericDisconnectRetriesRef.current.get(runId) ?? 0) + 1;
                if (attempts >= MAX_TRANSIENT_RETRIES) {
                  const backoffUntil = Date.now() + 3000;
                  genericDisconnectRetriesRef.current.set(runId, attempts);
                  genericDisconnectBackoffUntilRef.current.set(runId, backoffUntil);
                  // consumeDaemonRun invokes async error handlers without
                  // awaiting them. Clear the streaming marker before the status
                  // probe yields so the surrounding finally block cannot clear
                  // the refs first and strand the conversation in streaming.
                  clearCurrentRunStreamingMarker(
                    reattachConversationId,
                    controller,
                    cancelController,
                  );
                  const backoffTimer = scheduleProjectTimeout(() => {
                    const currentBackoffUntil =
                      genericDisconnectBackoffUntilRef.current.get(runId) ?? 0;
                    if (currentBackoffUntil <= Date.now()) {
                      genericDisconnectBackoffUntilRef.current.delete(runId);
                    }
                    setRecoveryTick((t) => t + 1);
                  }, 3000);
                  const latestRunStatus = await fetchChatRunStatus(runId).catch(() => null);
                  if (!latestRunStatus || isActiveRunStatus(latestRunStatus.status)) {
                  } else if (latestRunStatus.status === 'succeeded') {
                    clearProjectTimeout(backoffTimer);
                    setError(null);
                    // If the resumed stream already replayed some content/events
                    // before disconnecting again, finalizing this row as
                    // succeeded would persist a truncated transcript. Clear the
                    // partial local replay and trigger one immediate full replay
                    // from the daemon's terminal event log instead.
                    if (
                      needsFullReplay
                      && !(message.producedFiles?.length)
                      && (replayedContent.trim().length > 0 || replayedEvents.length > 0)
                    ) {
                      updateMessageById(
                        message.id,
                        (prev) => ({
                          ...removeErrorStatusEvent(prev, err.message, errorCode),
                          content: '',
                          events: [],
                          runStatus: 'succeeded',
                          // Adopt the daemon's authoritative terminal timestamp rather
                          // than the stale disconnect-time stamp taken when the generic
                          // disconnect first fired.
                          endedAt: latestRunStatus.updatedAt,
                          ...(latestRunStatus.resumable !== undefined
                            ? { resumable: latestRunStatus.resumable }
                            : {}),
                        }),
                        true,
                        { telemetryFinalized: true },
                      );
                      retryFullReplayAfterCleanup = true;
                    } else {
                      updateMessageById(
                        message.id,
                        (prev) => ({
                          ...removeErrorStatusEvent(prev, err.message, errorCode),
                          runStatus: 'succeeded',
                          endedAt: latestRunStatus.updatedAt,
                          ...(latestRunStatus.resumable !== undefined
                            ? { resumable: latestRunStatus.resumable }
                            : {}),
                        }),
                        true,
                        { telemetryFinalized: true },
                      );
                    }
                    skipFinalPersistNow = true;
                    genericDisconnectRetriesRef.current.delete(runId);
                    genericDisconnectBackoffUntilRef.current.delete(runId);
                  } else {
                    clearProjectTimeout(backoffTimer);
                    if (latestRunStatus.status === 'canceled') setError(null);
                    updateMessageById(
                      message.id,
                      (prev) => ({
                        ...prev,
                        runStatus: latestRunStatus.status,
                        endedAt: latestRunStatus.updatedAt,
                        ...(latestRunStatus.resumable !== undefined
                          ? { resumable: latestRunStatus.resumable }
                          : {}),
                      }),
                      true,
                      { telemetryFinalized: true },
                    );
                    skipFinalPersistNow = true;
                    completedReattachRunsRef.current.add(runId);
                    genericDisconnectRetriesRef.current.delete(runId);
                    genericDisconnectBackoffUntilRef.current.delete(runId);
                  }
                } else {
                  genericDisconnectRetriesRef.current.set(runId, attempts);
                }
              } else {
                transientFailedRetriesRef.current.delete(runId);
                genericDisconnectRetriesRef.current.delete(runId);
                genericDisconnectBackoffUntilRef.current.delete(runId);
                completedReattachRunsRef.current.add(runId);
              }
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              if (!skipFinalPersistNow) persistNow({ telemetryFinalized: true });
              if (retryFullReplayAfterCleanup) setRecoveryTick((t) => t + 1);
              scheduleConversationMessageRefresh(reattachConversationId);
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
            latestReattachRunStatus = runStatus;
            if (runStatus === 'canceled') {
              textBuffer.cancel();
              unregisterTextBuffer();
              // Clear stale retry count for canceled run.
              transientFailedRetriesRef.current.delete(runId);
              genericDisconnectRetriesRef.current.delete(runId);
              genericDisconnectBackoffUntilRef.current.delete(runId);
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
            }
            if (isTerminalRunStatus(runStatus)) {
              scheduleConversationMessageRefresh(reattachConversationId);
            }
          },
          onRunEventId: (lastRunEventId) => {
            textBuffer.flush();
            updateMessageById(message.id, (prev) => ({ ...prev, lastRunEventId }));
            persistSoon();
          },
        })
          .catch((err) => {
            // Skip AbortError (expected on interrupt) and any error from a run
            // that was tagged superseded by a send-now interrupt — it must not
            // surface a global failure over the replacement.
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
            if ((err as Error).name !== 'AbortError' && runMayFinalize) {
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
            if (persistTimer) clearProjectTimeout(persistTimer);
            reattachControllersRef.current.delete(runId);
            reattachCancelControllersRef.current.delete(runId);
            clearActiveRunRefs(reattachConversationId, controller, cancelController);
          });
      }
    };

    void attachRecoverableRuns();
    return () => {
      cancelled = true;
      // Clear any pending transient-retry timers so they don't fire after
      // unmount or after the effect re-enters for a different conversation.
      for (const handle of transientRetryTimersRef.current) {
        clearTimeout(handle);
      }
      transientRetryTimersRef.current = new Set();
    };
  }, [
    daemonLive,
    config.mode,
    activeConversationId,
    currentProject.metadata,
    streaming,
    messages,
    project.id,
    updateMessageById,
    persistMessageById,
    auditDesignSystemWorkspaceAfterRun,
    markStreamingConversation,
    clearStreamingMarker,
    clearActiveRunRefs,
    clearCurrentRunStreamingMarker,
    clearProjectTimeout,
    refreshProjectFiles,
    readProjectHtml,
    persistArtifact,
    requestOpenFile,
    onProjectsRefresh,
    scheduleProjectTimeout,
    scheduleConversationMessageRefresh,
    recoveryTick,
  ]);

  useEffect(() => {
    if (config.mode !== 'daemon' || !daemonLive || !activeConversationId) return;
    if (!currentConversationHasRecoverableArtifact) return;
    let cancelled = false;
    let recovering = false;

    const recoverArtifacts = async () => {
      if (recovering) return;
      recovering = true;
      try {
        const serverMessages = await listMessages(project.id, activeConversationId).catch(() => []);
        if (cancelled) return;
        const recoveryMessages = serverMessages.length > 0 ? serverMessages : messagesRef.current;
        for (const message of recoveryMessages) {
          if (cancelled) return;
          if (!hasRecoverableArtifactMessage(message)) continue;
          if (recoveredArtifactMessagesRef.current.has(message.id)) continue;
          const runId = message.runId;
          if (!runId) continue;

          const sourceText = message.content.trim().length > 0
            ? message.content
            : textContentFromAgentEvents(message.events);

          const parser = createArtifactParser();
          let parsedArtifact: Artifact | null = null;
          let liveHtml = '';
          for (const ev of [...parser.feed(sourceText), ...parser.flush()]) {
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
              parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, liveHtml);
              setArtifact((prev) =>
                artifactWithHtml(prev, ev.identifier, liveHtml),
              );
            } else if (ev.type === 'artifact:end') {
              parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, ev.fullContent);
              setArtifact((prev) =>
                prev ? artifactWithHtml(prev, ev.identifier, ev.fullContent) : null,
              );
            }
          }

          const artifactToPersist = parsedArtifact?.html
            ? parsedArtifact
            : artifactFromStandaloneHtml(sourceText);
          if (!artifactToPersist?.html) continue;
          const latestRunStatus = await fetchChatRunStatus(runId).catch(() => null);
          let nextFiles = await refreshProjectFiles();
          if (cancelled) return;
          const beforeFileNames = new Set(
            message.preTurnFileNames ?? nextFiles.map((f) => f.name),
          );
          const runStartedAt =
            latestRunStatus?.createdAt || message.startedAt || message.createdAt;
          const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
          let recoveredExistingArtifact =
            await findSameTurnWriteForRecoveredArtifact({
              artifact: artifactToPersist,
              sourceText,
              producedFiles: producedBeforeFallback,
              readProjectText: readProjectHtml,
            }) ??
            findExistingArtifactProjectFile(
              artifactToPersist,
              nextFiles,
              { minMtime: runStartedAt },
            );
          if (recoveredExistingArtifact) {
            savedArtifactRef.current = recoveredExistingArtifact.name;
            requestOpenFile(recoveredExistingArtifact.name);
          } else {
            savedArtifactRef.current = null;
            await persistArtifact(
              artifactToPersist,
              nextFiles,
              sourceText,
              { pointerMinMtime: runStartedAt },
            );
            nextFiles = await refreshProjectFiles();
            recoveredExistingArtifact = findExistingArtifactProjectFile(
              artifactToPersist,
              nextFiles,
              { minMtime: runStartedAt },
            );
          }
          if (cancelled) return;
          const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
          const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
          if (produced.length === 0) {
            continue;
          }
          recoveredArtifactMessagesRef.current.add(message.id);
          const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced);
          if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
          // This message's persisted runStatus was already terminal (a
          // precondition of hasRecoverableArtifactMessage); when it has no
          // stored endedAt, fall back to the daemon's authoritative terminal
          // timestamp (already fetched above as latestRunStatus) instead of
          // this reload/poll's wall-clock time.
          const recoveredArtifactEndedAt = await resolveTerminalEndedAt(runId, latestRunStatus, fetchChatRunStatus);
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              content: sourceText,
              producedFiles: produced,
              runStatus:
                latestRunStatus?.status === 'succeeded'
                  ? 'succeeded'
                  : prev.runStatus,
              endedAt: prev.endedAt ?? recoveredArtifactEndedAt,
            }),
            true,
            { telemetryFinalized: true },
          );
          await auditDesignSystemWorkspaceAfterRun(message.id);
          scheduleConversationMessageRefresh(activeConversationId);
          onProjectsRefresh();
        }
      } finally {
        recovering = false;
      }
    };

    void recoverArtifacts();
    const interval = window.setInterval(() => {
      void recoverArtifacts();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    daemonLive,
    config.mode,
    activeConversationId,
    project.id,
    currentConversationHasRecoverableArtifact,
    artifactFromStandaloneHtml,
    refreshProjectFiles,
    persistArtifact,
    requestOpenFile,
    updateMessageById,
    auditDesignSystemWorkspaceAfterRun,
    scheduleConversationMessageRefresh,
    onProjectsRefresh,
  ]);

  const commitQueuedChatSends = useCallback((next: QueuedChatSend[]) => {
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
    projectViewTransportPort.saveQueuedChatSends(project.id, next);
  }, [project.id]);

  const enqueueChatSend = useCallback((item: QueuedChatSend) => {
    const next = [...queuedChatSendsRef.current, item];
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const removeQueuedChatSend = useCallback((id: string) => {
    const next = queuedChatSendsRef.current.filter((item) => item.id !== id);
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const updateQueuedChatSend = useCallback((id: string, update: QueuedChatSendUpdate) => {
    const next = queuedChatSendsRef.current.map((item) => {
      if (item.id !== id) return item;
      const meta = stripQueueOnlyFromMeta(update.meta);
      const updated: QueuedChatSend = {
        ...item,
        prompt: update.prompt,
        attachments: update.attachments,
        commentAttachments: update.commentAttachments,
      };
      if (meta === undefined) delete updated.meta;
      else updated.meta = meta;
      return updated;
    });
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const prioritizeQueuedChatSend = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    const next = [item, ...queuedChatSendsRef.current.filter((candidate) => candidate.id !== id)];
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const reorderCurrentConversationQueuedChatSends = useCallback((orderedIds: string[]) => {
    if (!activeConversationId || orderedIds.length === 0) return;
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const current = queuedChatSendsRef.current;
    const originalConversationItems = current.filter(
      (item) => item.conversationId === activeConversationId,
    );
    const sortedConversationItems = [...originalConversationItems].sort((a, b) => {
      const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
    if (
      sortedConversationItems.every((item, index) => item.id === originalConversationItems[index]?.id)
    ) {
      return;
    }
    let cursor = 0;
    const next = current.map((item) => {
      if (item.conversationId !== activeConversationId) return item;
      return sortedConversationItems[cursor++] ?? item;
    });
    commitQueuedChatSends(next);
  }, [activeConversationId, commitQueuedChatSends]);

  const queueChatSendForCurrentConversation = useCallback((input: {
    attachments: ChatAttachment[];
    commentAttachments: ChatCommentAttachment[];
    conversationId: string;
    meta?: ProjectChatSendMeta;
    prompt: string;
  }) => {
    const queuedMeta = stripQueueOnlyFromMeta(input.meta);
    enqueueChatSend({
      id: randomUUID(),
      conversationId: input.conversationId,
      prompt: input.prompt,
      attachments: input.attachments,
      commentAttachments: input.commentAttachments,
      ...(queuedMeta === undefined ? {} : { meta: queuedMeta }),
      createdAt: Date.now(),
    });
    if (input.commentAttachments.length > 0) {
      const reservedCommentIds = new Set(
        input.commentAttachments
          .filter((attachment) => attachment.source !== 'board-batch')
          .map((attachment) => attachment.id),
      );
      setAttachedComments((current) =>
        current.filter((comment) => !reservedCommentIds.has(comment.id)),
      );
      if (reservedCommentIds.size > 0) {
        setPreviewComments((current) =>
          current.map((comment) =>
            reservedCommentIds.has(comment.id)
              ? { ...comment, status: 'applying' }
              : comment,
          ),
        );
        void Promise.all(
          Array.from(reservedCommentIds, (commentId) =>
            patchPreviewCommentStatus(project.id, input.conversationId, commentId, 'applying'),
          ),
        ).catch(() => {});
      }
    }
  }, [enqueueChatSend, project.id]);

  const handleSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[] = commentsToAttachments(attachedComments),
      meta?: ProjectChatSendMeta,
      baseMessages?: ChatMessage[],
    ) => {
      if (!activeConversationId) return false;
      if (messagesConversationIdRef.current !== activeConversationId) return false;
      const runSessionMode = meta?.sessionMode ?? activeSessionMode;
      const retryTarget = meta?.retryOfAssistantId
        ? resolveRetryTarget(messages, meta.retryOfAssistantId)
        : null;
      if (meta?.retryOfAssistantId && !retryTarget) return false;
      const runContext = meta?.context ?? retryTarget?.userMsg.runContext;
      const historyBase = retryTarget ? retryTarget.priorMessages : baseMessages ?? messages;
      if (
        !retryTarget &&
        !prompt.trim() &&
        attachments.length === 0 &&
        commentAttachments.length === 0
      ) return false;
      const effectiveAttachments = mergeChatAttachments(
        attachments,
        ...commentAttachments.map((attachment) =>
          chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
        ),
      );
      if (!retryTarget && meta?.queueOnly) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode },
        });
        return false;
      }
      if (currentConversationBusy) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode },
        });
        return false;
      }
      // Open Design Cloud pre-run balance gate: a definitively insufficient
      // wallet blocks the run BEFORE any message is persisted or a daemon run
      // spawned, surfacing the subscription dialog instead of a mid-run
      // AMR_INSUFFICIENT_BALANCE failure. Sends the home submit already gated
      // (amrGatePrechecked) pass straight through — the user answered there.
      if (config.mode === 'daemon' && config.agentId === 'amr' && !meta?.amrGatePrechecked) {
        const gateConversationId = activeConversationId;
        // The gate's await opens a window where the conversation is not yet
        // marked busy. A second send arriving during that window behaves like
        // a busy conversation: it queues instead of racing a duplicate run.
        if (amrGateInFlightConversationsRef.current.has(gateConversationId)) {
          if (retryTarget) return false;
          queueChatSendForCurrentConversation({
            conversationId: gateConversationId,
            prompt,
            attachments: effectiveAttachments,
            commentAttachments,
            meta: { ...(meta ?? {}), sessionMode: runSessionMode },
          });
          return false;
        }
        amrGateInFlightConversationsRef.current.add(gateConversationId);
        try {
          const gate = await checkAmrBalanceGate();
          // A blocked send parks in the conversation queue with its FULL
          // payload (prompt, attachments, comment context) — the composer
          // already cleared itself, and a text-only draft restore would
          // silently drop staged attachments. Retries keep their error card
          // and queue drains already have their queue item, so both skip the
          // re-queue. The pause keeps queued items from re-hitting the gate
          // (and re-popping a dialog) on every unrelated state change; any
          // later send that passes the gate lifts it, and a manual "run now"
          // on a queued item bypasses it deliberately.
          const queueGateSend = () => {
            if (!retryTarget && !meta?.queueDrain) {
              queueChatSendForCurrentConversation({
                conversationId: gateConversationId,
                prompt,
                attachments: effectiveAttachments,
                commentAttachments,
                meta: { ...(meta ?? {}), sessionMode: runSessionMode },
              });
            }
          };
          const parkBlockedSend = () => {
            queueGateSend();
            amrGatePausedQueueConversationsRef.current.add(gateConversationId);
          };
          // The await may have raced a conversation switch; re-run the entry
          // guard before touching any state so this stale closure can't write
          // the old conversation's messages into the now-visible view. The
          // composer has already cleared, so keep the full payload queued for
          // the original conversation instead of dropping it.
          if (messagesConversationIdRef.current !== activeConversationId) {
            queueGateSend();
            return false;
          }
          if (gate.kind === 'hard') {
            setAmrBalanceGateBlock({
              reason: gate.reason,
              snapshot: gate.snapshot,
              conversationId: gateConversationId,
            });
            parkBlockedSend();
            return false;
          }
          if (gate.kind === 'soft') {
            // Low balance: pause THIS send while the reminder dialog waits
            // for a decision. 'proceed' resumes the very same send below —
            // a continuation, not a re-submit.
            const decision = await new Promise<AmrLowBalanceDecision>((resolve) => {
              setAmrLowBalanceWarn({ snapshot: gate.snapshot, resolve });
            });
            setAmrLowBalanceWarn(null);
            // Same conversation-switch guard for the dialog-open window; the
            // payload is parked (not sent) so nothing is lost either way.
            if (decision !== 'proceed' || messagesConversationIdRef.current !== activeConversationId) {
              parkBlockedSend();
              return false;
            }
          }
          amrGatePausedQueueConversationsRef.current.delete(gateConversationId);
        } finally {
          amrGateInFlightConversationsRef.current.delete(gateConversationId);
        }
      }
      // First genuine send in a recommendation-started project — the
      // send-through half of the onboarding funnel. Fires once per project (the
      // guard is project-scoped so it survives ProjectView remounts), on the
      // first message of the conversation (not retries). Placed AFTER the
      // queue-only / busy / AMR balance gates above: those can abort the send
      // without creating a run, so emitting earlier would over-count blocked
      // attempts and then suppress the real retry via the once-only guard. By
      // here the send is committed to creating a run.
      if (
        onboardingEntryRef.current &&
        !hasSentFirstOnboardingPrompt(project.id) &&
        !retryTarget &&
        historyBase.length === 0
      ) {
        markFirstOnboardingPromptSent(project.id);
        const entry = onboardingEntryRef.current;
        trackOnboardingFirstPromptSent(analytics.track, {
          entry_source: entry.source,
          product_type: entry.productType,
          recommendation_id: entry.recommendationId,
          // True only when the user sent the prefilled suggestion unmodified;
          // an edited, cleared, replaced, or starter-swapped prompt (or an
          // attachments-only send) reports false so the send-through split
          // stays honest.
          has_prefilled_prompt: sentPrefilledPrompt(onboardingSeedPromptRef.current, prompt),
        });
        recordFirstLoopStep(analytics.track, 'prompt_sent', project.id);
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
        sessionMode: runSessionMode,
        ...(meta?.appliedPluginSnapshot
          ? { appliedPluginSnapshot: meta.appliedPluginSnapshot }
          : {}),
        ...(runContext ? { runContext } : {}),
        attachments: effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
        commentAttachments: commentAttachments.length > 0 ? commentAttachments : undefined,
      };
      const runCommentAttachments = userMsg.commentAttachments ?? [];
      const runAttachments = mergeChatAttachments(
        userMsg.attachments ?? [],
        ...runCommentAttachments.map((attachment) =>
          chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
        ),
      );
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
      const byokOpenCodeProvider = byokOpenCodeProviderFromConfig(config);
      const preTurnFileNames = projectFiles.map((f) => f.name);
      const assistantId = randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentId: assistantAgentId,
        agentName: assistantAgentName,
        events: [],
        createdAt: startedAt,
        runStatus: config.mode === 'daemon' ? 'running' : undefined,
        startedAt,
        preTurnFileNames,
      };
      let latestAssistantMsg: ChatMessage = assistantMsg;
      // Tracks the runId once POST /api/runs returns so that the live stream
      // onError handler can mark the run as completed in completedReattachRunsRef.
      // This prevents attachRecoverableRuns from attempting to reattach a run
      // that just failed in the current session (the daemon status fetch is only
      // needed on reload, not for runs that are already known to have failed).
      let currentRunId: string | undefined = undefined;
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
      const nextVisibleMessages = retryTarget
        ? [...nextHistory, ...retryTarget.preservedAttempts, assistantMsg]
        : [...nextHistory, assistantMsg];
      setMessages(nextVisibleMessages);
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
      const isFirstTurn = !retryTarget && historyBase.length === 0;
      const fallbackFirstTurnTitle = isDesignSystemWorkspacePrompt(prompt)
        ? DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE
        : summarizeProjectNameFromPrompt(prompt) || prompt.slice(0, 60).trim();
      const fallbackProjectName = summarizeProjectNameFromPrompt(prompt);
      // If this is the first turn, derive a working title from the prompt
      // so the conversation is identifiable in the dropdown without a
      // round-trip through the agent.
      if (isFirstTurn) {
        const title = fallbackFirstTurnTitle;
        if (title) {
          setConversations((curr) =>
            curr.map((c) =>
              c.id === runConversationId ? { ...c, title } : c,
            ),
          );
          void patchConversation(project.id, runConversationId, { title });
        }
        const projectName = fallbackProjectName;
        if (
          projectName &&
          projectName !== project.name &&
          canAutoRenameProjectFromPrompt(project, prompt)
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
      const canReplaceConversationTitle = (title: string | null | undefined) => {
        const trimmed = (title ?? '').trim();
        return (
          !trimmed ||
          trimmed === fallbackFirstTurnTitle ||
          trimmed === prompt.slice(0, 60).trim()
        );
      };
      const applyAgentGeneratedTitle = (rawTitle: string) => {
        if (!isFirstTurn) return;
        const agentTitle = rawTitle.trim();
        if (!agentTitle || isDesignSystemWorkspacePrompt(prompt)) return;
        const currentConversationTitle = conversationsRef.current.find(
          (conversation) => conversation.id === runConversationId,
        )?.title;
        const shouldPatchConversation = canReplaceConversationTitle(currentConversationTitle);
        setConversations((curr) =>
          curr.map((conversation) => {
            if (conversation.id !== runConversationId) return conversation;
            if (!canReplaceConversationTitle(conversation.title)) return conversation;
            return { ...conversation, title: agentTitle };
          }),
        );
        if (shouldPatchConversation) {
          void patchConversation(project.id, runConversationId, { title: agentTitle });
        }
        if (
          agentTitle !== project.name &&
          canAutoRenameProjectFromPrompt(project, prompt)
        ) {
          const metadata = project.metadata
            ? { ...project.metadata, nameSource: 'agent' as const }
            : undefined;
          const updated: Project = {
            ...project,
            name: agentTitle,
            ...(metadata ? { metadata } : {}),
            updatedAt: Date.now(),
          };
          onProjectChange(updated);
          void patchProject(project.id, {
            name: agentTitle,
            ...(metadata ? { metadata } : {}),
          });
        }
      };

      // Snapshot the file list at turn-start so we can diff after the
      // agent finishes and surface anything new (e.g. a generated .pptx)
      // as download chips on the assistant message.
      const beforeFileNames = new Set(preTurnFileNames);
      // Pending Write/Edit tool invocations for this run: tool_use_id -> path.
      // Keeping this local prevents a superseded stream's late tool_result from
      // consuming a replacement run's colliding tool id.
      const pendingWrites = new Map<string, string>();
      const traceTouchedFilePaths = new Set<string>();
      const clearTraceTouchedFilePaths = () => {
        pendingWrites.clear();
        traceTouchedFilePaths.clear();
      };

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
        persistTimer = scheduleProjectTimeout(() => {
          persistTimer = null;
          persistMessageById(assistantId);
        }, 500);
      };
      const persistAssistantNowKeepalive = () => {
        if (persistTimer) {
          clearProjectTimeout(persistTimer);
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
        if (ev.kind === 'tool_use') {
          // The authoritative input has landed; drop the live partial so the
          // card renders from the parsed `tool_use.input` instead of the
          // mid-token JSON fragment.
          setLiveToolInput((prev) => {
            if (!(ev.id in prev)) return prev;
            const next = { ...prev };
            delete next[ev.id];
            return next;
          });
        }
        if (ev.kind === 'tool_use' && isFileWriteToolName(ev.name)) {
          const filePath = extractFileWriteToolPath(ev.input);
          if (typeof filePath === 'string' && filePath.length > 0) {
            // Preserve the full path so decideAutoOpenAfterWrite can do a
            // path-suffix match against the project's relative file paths.
            // Reducing to a basename here would lose the segment alignment
            // we need to disambiguate same-basename collisions across the
            // project tree and outside it.
            pendingWrites.set(ev.id, filePath);
          }
        }
        if (ev.kind === 'tool_result') {
          const filePath = pendingWrites.get(ev.toolUseId);
          if (filePath) {
            pendingWrites.delete(ev.toolUseId);
            if (!ev.isError) {
              traceTouchedFilePaths.add(filePath);
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
        subscribeFlushTriggers: projectViewTransportPort.subscribeBufferedTextFlushTriggers,
      });
      sendTextBufferRef.current = textBuffer;

      const controller = new AbortController();
      const cancelController = new AbortController();
      abortRef.current = controller;
      cancelRef.current = cancelController;
      const handlers = {
        onDelta: (delta: string) => {
          // See reattach-path comment above for rationale.  PR #4651 round 9.
          if (currentRunId) {
            transientFailedRetriesRef.current.delete(currentRunId);
            genericDisconnectRetriesRef.current.delete(currentRunId);
            genericDisconnectBackoffUntilRef.current.delete(currentRunId);
          }
          streamedText += delta;
          textBuffer.appendContent(delta);
        },
        onAgentEvent: (ev: AgentEvent) => {
          if (currentRunId) {
            transientFailedRetriesRef.current.delete(currentRunId);
            genericDisconnectRetriesRef.current.delete(currentRunId);
            genericDisconnectBackoffUntilRef.current.delete(currentRunId);
          }
          if (ev.kind === 'conversation_title') {
            applyAgentGeneratedTitle(ev.title);
            return;
          }
          if (ev.kind === 'text') textBuffer.appendTextEvent(ev.text);
          else pushEvent(ev);
        },
        onToolInputDelta: (id: string, name: string, delta: string) => {
          setLiveToolInput((prev) => ({
            ...prev,
            [id]: {
              name,
              text: (prev[id]?.text ?? '') + delta,
              // Pin the tool's stream position the first time we see it: the
              // count of events already on the message is everything the model
              // emitted before the tool call (its preamble). Buffered text
              // (appendTextEvent) isn't flushed into `events` until the next
              // frame, so add 1 for any still-pending preamble chunk — it will
              // commit as one text event just before this tool's position.
              seq:
                prev[id]?.seq ??
                ((latestAssistantMsg.events?.length ?? 0) + (textBuffer.hasPendingText() ? 1 : 0)),
            },
          }));
        },
        onDone: (fullText = '') => {
          // The daemon delivers onDone even for a canceled run, so a run
          // superseded by a "send now" interrupt can still land here and must
          // not apply its completion side effects over the replacement. A run
          // may finalize unless it was tagged superseded at interrupt time
          // (recorded before handleStop cleared the refs), which is reliable
          // even before the replacement send attaches — unlike abortRef, whose
          // terminal onRunStatus / handleStop churn make it ambiguous here.
          const runMayFinalize =
            !supersededRunsRef.current.has(controller);
          if (!runMayFinalize) {
            textBuffer.cancel();
            cancelSendTextBuffer();
            clearTraceTouchedFilePaths();
            return;
          }
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
            const ownsCurrentRun = clearCurrentRunStreamingMarker(
              runConversationId,
              controller,
              cancelController,
            );
            if (ownsCurrentRun) updateConversationLatestRun('failed', endedAt);
            void refreshProjectFiles();
            onProjectsRefresh();
            clearTraceTouchedFilePaths();
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
          const ownsCurrentRun = clearCurrentRunStreamingMarker(
            runConversationId,
            controller,
            cancelController,
          );
          if (ownsCurrentRun) updateConversationLatestRun(finalRunStatus ?? 'succeeded', endedAt);
          // Refetch the file list directly (rather than just bumping the
          // refresh signal) so we can diff against the pre-turn snapshot
          // and attach the new files to the assistant message as download
          // chips.
          void (async () => {
            try {
              let nextFiles = await refreshProjectFiles();
              const finalText = streamedText || fullText;
              const artifactToPersist = parsedArtifact?.html
                ? parsedArtifact
                : artifactFromStandaloneHtml(finalText);
              if (artifactToPersist?.html) {
                const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                const sameTurnArtifactWrite =
                  await findSameTurnNonHtmlWriteForRecoveredArtifact({
                    artifact: artifactToPersist,
                    producedFiles: producedBeforeFallback,
                    readProjectText: readProjectHtml,
                  });
                const sameTurnHtmlWrite = sameTurnArtifactWrite
                  ? null
                  : await findSameTurnHtmlWriteForRecoveredArtifact({
                      artifactHtml: resolvePersistedArtifactHtml({
                        artifactHtml: artifactToPersist.html,
                        identifier: artifactToPersist.identifier,
                        sourceText: finalText,
                      }),
                      producedFiles: producedBeforeFallback,
                      readProjectHtml,
                    });
                const sameTurnWrite = sameTurnArtifactWrite ?? sameTurnHtmlWrite;
                if (sameTurnWrite) {
                  savedArtifactRef.current = sameTurnWrite.name;
                  requestOpenFile(sameTurnWrite.name);
                } else {
                  await persistArtifact(artifactToPersist, nextFiles, finalText);
                  nextFiles = await refreshProjectFiles();
                }
              }
              const produced = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
              // Completion half of the onboarding funnel: the first generation
              // in a recommendation-started project that actually produced a
              // previewable artifact. Gated on the same artifact-producing
              // condition as the first-artifact hint (a produced `.html`), so a
              // `succeeded` run that returned only text or a clarifying question
              // does NOT count. Fires once.
              if (
                ownsCurrentRun &&
                onboardingEntryRef.current &&
                !hasCompletedFirstOnboardingGeneration(project.id) &&
                finalRunStatus === 'succeeded' &&
                producedPreviewableArtifact(produced)
              ) {
                markFirstOnboardingGenerationCompleted(project.id);
                const entry = onboardingEntryRef.current;
                trackOnboardingFirstGenerationCompleted(analytics.track, {
                  entry_source: entry.source,
                  product_type: entry.productType,
                  recommendation_id: entry.recommendationId,
                });
                recordFirstLoopStep(analytics.track, 'generated', project.id);
              }
              const traceObjectFiles = computeTraceObjectFiles(
                beforeFileNames,
                nextFiles,
                traceTouchedFilePaths,
              ) ?? [];
              const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced);
              if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
              setMessages((curr) => {
                const updated = curr.map((m) =>
                  m.id === assistantId
                    ? { ...m, producedFiles: produced, traceObjectFiles }
                    : m,
                );
                const finalized = updated.find((m) => m.id === assistantId);
                if (finalized) persistMessage(finalized, { telemetryFinalized: true });
                return updated;
              });
              await auditDesignSystemWorkspaceAfterRun(assistantId);
            } finally {
              clearTraceTouchedFilePaths();
            }
          })();
          onProjectsRefresh();
        },
        onError: async (err: Error) => {
          // Disconnect-time stamp, used as-is for non-generic-disconnect
          // failures. When the generic-disconnect retry-cap probe below
          // resolves a terminal daemon status, this is advanced to that
          // authoritative `updatedAt` so BOTH the assistant message row and
          // updateConversationLatestRun() (which drives the sidebar/dropdown
          // sort + duration) reflect the daemon's terminal time rather than
          // this stale pre-probe timestamp.
          let endedAt = Date.now();
          const errorCode = (err as Error & { code?: string }).code;
          const resumable = (err as Error & { resumable?: boolean }).resumable === true;
          let finalRunStatusAfterError: ChatMessage['runStatus'] = 'failed';
          let refreshConversationAfterError = false;
          // The final onError invocation whose retry-cap probe turns terminal
          // may arrive AFTER an earlier invocation already consumed
          // ownership via clearCurrentRunStreamingMarker (abortRef/cancelRef
          // are nulled out the first time, so a later call with the same
          // controller reads ownsCurrentRun as false). Track whether the
          // terminal-probe branches below already stamped the conversation
          // directly, so the unconditional call at the bottom does not need
          // (and must not double-apply) that same update.
          let conversationFinalizedInline = false;
          // A run superseded by a "send now" interrupt can still surface a
          // late disconnect error (e.g. a canceled stream that lost its
          // terminal SSE). It must not paint a global failure banner or
          // re-finalize its already-canceled assistant message once it was
          // tagged superseded. See the onDone above for the ownership rationale.
          const runMayFinalize =
            !supersededRunsRef.current.has(controller);
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          if (runMayFinalize) {
            setError(err.message);
            appendAssistantErrorEvent(assistantId, err.message, errorCode);
            updateAssistant((prev) => ({
              ...prev,
              endedAt,
              runStatus: config.mode === 'api' || prev.runId || isActiveRunStatus(prev.runStatus)
                ? 'failed'
                : prev.runStatus,
              resumable,
            }));
            if (runCommentAttachments.length > 0) {
              void patchAttachedStatuses(runCommentAttachments, 'failed');
            }
          }
          // Mark the run as completed in the reattach registry so that
          // attachRecoverableRuns does not race it after streaming ends.
          // Without this guard, the spuriouslyFailedPending heuristic would
          // match a freshly-failed live run (no content, no producedFiles) and
          // attempt a daemon status fetch on a run the client already knows
          // failed — overwriting the assistant message's resumable flag with
          // the fetched status before the ChatPane has had a chance to render.
          //
          // EXCEPTION: the generic "daemon stream disconnected before run
          // completed" error is a browser-side SSE reconnect-budget exhaustion,
          // NOT an authoritative terminal failure.  The daemon may still report
          // the run as queued/running on the next tick, so we must leave the
          // runId eligible for attachRecoverableRuns to re-query.  Only seal
          // the registry entry on authoritative terminal failures (any error
          // that is NOT the generic disconnect message).
          // Generic disconnects share the transient-retry budget with the
          // reattach null-status path. As with the reattach path above, a null
          // status probe is not authoritative — it may be a transient fetch or
          // daemon hiccup — so keep the run eligible for future re-query unless
          // the daemon explicitly reports a terminal status.
          if (currentRunId) {
            if (isGenericDaemonDisconnect(err)) {
              const runIdForGenericDisconnect = currentRunId;
              const attempts =
                (genericDisconnectRetriesRef.current.get(runIdForGenericDisconnect) ?? 0) + 1;
              if (attempts >= MAX_TRANSIENT_RETRIES) {
                const backoffUntil = Date.now() + 3000;
                genericDisconnectRetriesRef.current.set(runIdForGenericDisconnect, attempts);
                genericDisconnectBackoffUntilRef.current.set(runIdForGenericDisconnect, backoffUntil);
                const backoffTimer = scheduleProjectTimeout(() => {
                  const currentBackoffUntil =
                    genericDisconnectBackoffUntilRef.current.get(runIdForGenericDisconnect) ?? 0;
                  if (currentBackoffUntil <= Date.now()) {
                    genericDisconnectBackoffUntilRef.current.delete(runIdForGenericDisconnect);
                  }
                  setRecoveryTick((t) => t + 1);
                }, 3000);
                const latestRunStatus = await fetchChatRunStatus(runIdForGenericDisconnect).catch(() => null);
                if (!latestRunStatus || isActiveRunStatus(latestRunStatus.status)) {
                } else if (latestRunStatus.status === 'succeeded') {
                  clearProjectTimeout(backoffTimer);
                  // Advance the outer endedAt so updateConversationLatestRun()
                  // below adopts this same authoritative terminal timestamp,
                  // matching the message row's endedAt set further down.
                  endedAt = latestRunStatus.updatedAt;
                  if (runMayFinalize) {
                    setError(null);
                    updateAssistant((prev) => {
                      const recovered = removeErrorStatusEvent(prev, err.message, errorCode);
                      if (
                        !prev.producedFiles?.length
                        && (prev.content.trim().length > 0 || (prev.events?.length ?? 0) > 0)
                      ) {
                        return {
                          ...recovered,
                          content: '',
                          events: [],
                          // Adopt the daemon's authoritative terminal timestamp rather
                          // than the stale disconnect-time stamp taken when the generic
                          // disconnect first fired.
                          endedAt: latestRunStatus.updatedAt,
                          runStatus: 'succeeded',
                          ...(latestRunStatus.resumable !== undefined
                            ? { resumable: latestRunStatus.resumable }
                            : {}),
                        };
                      }
                      return {
                        ...recovered,
                        endedAt: latestRunStatus.updatedAt,
                        runStatus: 'succeeded',
                        ...(latestRunStatus.resumable !== undefined
                          ? { resumable: latestRunStatus.resumable }
                          : {}),
                      };
                    });
                    updateConversationLatestRun('succeeded', endedAt);
                    conversationFinalizedInline = true;
                  }
                  if (runCommentAttachments.length > 0) {
                    void patchAttachedStatuses(runCommentAttachments, 'needs_review');
                  }
                  finalRunStatusAfterError = 'succeeded';
                  refreshConversationAfterError = true;
                  genericDisconnectRetriesRef.current.delete(runIdForGenericDisconnect);
                  genericDisconnectBackoffUntilRef.current.delete(runIdForGenericDisconnect);
                } else {
                  clearProjectTimeout(backoffTimer);
                  // Same rationale as the succeeded branch above: keep the
                  // conversation-level stamp in step with the message row.
                  endedAt = latestRunStatus.updatedAt;
                  if (runMayFinalize) {
                    if (latestRunStatus.status === 'canceled') setError(null);
                    updateAssistant((prev) => ({
                      ...prev,
                      endedAt: latestRunStatus.updatedAt,
                      runStatus: latestRunStatus.status,
                      ...(latestRunStatus.resumable !== undefined
                        ? { resumable: latestRunStatus.resumable }
                        : {}),
                    }));
                    updateConversationLatestRun(latestRunStatus.status, endedAt);
                    conversationFinalizedInline = true;
                  }
                  finalRunStatusAfterError = latestRunStatus.status;
                  refreshConversationAfterError = true;
                  completedReattachRunsRef.current.add(runIdForGenericDisconnect);
                  genericDisconnectRetriesRef.current.delete(runIdForGenericDisconnect);
                  genericDisconnectBackoffUntilRef.current.delete(runIdForGenericDisconnect);
                }
              } else {
                genericDisconnectRetriesRef.current.set(runIdForGenericDisconnect, attempts);
              }
            } else {
              genericDisconnectRetriesRef.current.delete(currentRunId);
              genericDisconnectBackoffUntilRef.current.delete(currentRunId);
              completedReattachRunsRef.current.add(currentRunId);
            }
          }
          const ownsCurrentRun = clearCurrentRunStreamingMarker(
            runConversationId,
            controller,
            cancelController,
          );
          if (ownsCurrentRun && !conversationFinalizedInline) {
            updateConversationLatestRun(finalRunStatusAfterError, endedAt);
          }
          setMessages((curr) => {
            const finalized = curr.find((m) => m.id === assistantId);
            if (finalized) persistMessage(finalized, { telemetryFinalized: true });
            return curr;
          });
          if (refreshConversationAfterError) {
            scheduleConversationMessageRefresh(runConversationId);
          }
          void refreshProjectFiles();
          clearTraceTouchedFilePaths();
        },
      };

      if (config.mode === 'daemon') {
        if (!config.agentId) {
          handlers.onError(new Error('Pick a local agent first (top bar).'));
          return true;
        }
        const choice = effectiveSelectedAgentChoice;
        const daemonByokOpenCode = config.agentId === 'byok-opencode';
        if (daemonByokOpenCode && !agentsById.get('byok-opencode')?.available) {
          handlers.onError(new Error(BYOK_OPENCODE_UNAVAILABLE_MESSAGE));
          return true;
        }
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
        // A caller-supplied entry_from (e.g. 'resume_continue' from the
        // resumable-failure Continue action) overrides the DS default so the
        // run is attributed to the affordance that started it.
        //
        // Session-dimension hints are stamped on every real run creation (this
        // path only runs for non-queued sends): claim the next 0-based turn
        // index for this browser session, and flag whether the project already
        // had a generated artifact (project-scoped) so the run reads as an edit
        // rather than a first creation.
        const sessionTurn = claimRunTurnIndex();
        // Per-project run turn index (project-lifetime, localStorage-backed):
        // "within THIS project, which prompt / follow-up is this?". Sibling to
        // the session-wide `sessionTurn` above — claimed together per real run
        // so run_created / run_finished carry both the session-global and the
        // project-scoped sequence.
        const projectTurn = claimProjectTurnIndex(project.id);
        const hasExistingArtifact = projectFilesRef.current.some(
          (file) => Boolean(file.artifactManifest),
        );
        const runAnalyticsHints = {
          ...(dsAnalyticsHints ?? {}),
          ...(meta?.entryFrom ? { entryFrom: meta.entryFrom } : {}),
          ...(sessionTurn
            ? { turnIndex: sessionTurn.turnIndex, isFirstRun: sessionTurn.isFirstRun }
            : {}),
          ...(projectTurn ? { projectTurnIndex: projectTurn.projectTurnIndex } : {}),
          ...(meta?.dsEnrichment ? { dsEnrichment: true } : {}),
          hasExistingArtifact,
          runtimeType: daemonByokOpenCode
            ? ('byok' as const)
            : config.agentId === 'amr'
              ? ('amr_cloud' as const)
              : ('local_cli' as const),
        };
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
          context: runContext,
          designSystemId: projectDesignSystemId ?? null,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          sessionMode: runSessionMode,
          appliedPluginSnapshotId:
            meta?.appliedPluginSnapshotId ?? meta?.appliedPluginSnapshot?.snapshotId ?? null,
          research: meta?.research,
          mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata),
          model: daemonByokOpenCode ? config.model : choice?.model ?? null,
          reasoning: daemonByokOpenCode ? null : choice?.reasoning ?? null,
          ...(daemonByokOpenCode && byokOpenCodeProvider
            ? { byokProvider: byokOpenCodeProvider }
            : {}),
          ...(daemonByokOpenCode
            ? {
                byokMediaDefaults: byokMediaDefaultsForRun({
                  imageModelOverride: byokImageModelOverride,
                  videoModelOverride: byokVideoModelOverride,
                  speechModelOverride: byokSpeechModelOverride,
                  speechVoiceOverride: byokSpeechVoiceOverride,
                  config,
                  imageModelOptions: byokImageModelOptionsPV,
                  videoModelOptions: byokVideoModelOptionsPV,
                  speechModelOptions: byokSpeechModelOptionsPV,
                }),
              }
            : {}),
          titleGeneration: isFirstTurn ? { enabled: true } : undefined,
          locale,
          ...(runAnalyticsHints ? { analyticsHints: runAnalyticsHints } : {}),
          onRunCreated: (runId) => {
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
            };
            latestAssistantMsg = pinnedAssistant;
            currentRunId = runId;
            // The view may already be on a different project/conversation;
            // pin the daemon run to the original row so returning can reattach.
            void saveMessage(project.id, runConversationId, pinnedAssistant);
            updateMessageById(assistantId, (prev) => ({ ...prev, runId, runStatus: 'queued' }));
          },
          onRunStatus: (runStatus) => {
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
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
            if (!runMayFinalize) return;
            updateConversationLatestRun(runStatus, endedAt);
            if (isTerminalRunStatus(runStatus)) {
              clearCurrentRunStreamingMarker(runConversationId, controller, cancelController);
              scheduleConversationMessageRefresh(runConversationId);
              if (runStatus !== 'succeeded') clearTraceTouchedFilePaths();
            }
          },
          onRunEventId: (lastRunEventId) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, lastRunEventId }));
            persistAssistantSoon();
          },
        });
        return true;
      } else {
        if (config.apiProtocol === 'bedrock') {
          handlers.onError(new Error(BEDROCK_BYOK_UNSUPPORTED_MESSAGE));
          return true;
        }
        if (!agentsById.get('byok-opencode')?.available) {
          handlers.onError(new Error(BYOK_OPENCODE_UNAVAILABLE_MESSAGE));
          return true;
        }
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
        const byokChatProvider = byokOpenCodeProvider
          ? {
              provider: byokOpenCodeProvider.protocol,
              apiKey: byokOpenCodeProvider.apiKey,
              baseUrl: byokOpenCodeProvider.baseUrl,
              apiVersion: byokOpenCodeProvider.apiVersion,
            }
          : undefined;
        if (userText.length > 0) {
          await projectViewTransportPort.extractMemory({
            userMessage: userText,
            projectId: project.id,
            conversationId: runConversationId,
            chatProvider: byokChatProvider,
          });
        }
        pushEvent({ kind: 'status', label: 'requesting', detail: config.model });
        const byokOpenCodeHistory = await historyWithApiAttachmentContext(
          historyWithCommentAttachmentContext(
            historyWithWorkspaceContext(nextHistory, userMsg.id, runContext),
            userMsg.id,
          ),
          userMsg.id,
          project.id,
          projectFiles,
          { omitNativeImageAttachments: usesAnthropicProxy(config) },
        );
        // Session-dimension hints on the BYOK-OpenCode path too, so
        // run_created / run_finished carry the same session-global and
        // project-scoped run sequence on every runtime (cli / amr / byok).
        const byokSessionTurn = claimRunTurnIndex();
        const byokProjectTurn = claimProjectTurnIndex(project.id);
        const byokHasExistingArtifact = projectFilesRef.current.some(
          (file) => Boolean(file.artifactManifest),
        );
        void streamViaDaemon({
          agentId: 'byok-opencode',
          history: byokOpenCodeHistory,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          handlers,
          projectId: project.id,
          conversationId: runConversationId,
          assistantMessageId: assistantId,
          clientRequestId: randomUUID(),
          skillId: project.skillId ?? null,
          skillIds: Array.isArray(meta?.skillIds) ? meta.skillIds : [],
          context: runContext,
          designSystemId: projectDesignSystemId ?? null,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          sessionMode: runSessionMode,
          appliedPluginSnapshotId:
            meta?.appliedPluginSnapshotId ?? meta?.appliedPluginSnapshot?.snapshotId ?? null,
          research: meta?.research,
          mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata),
          model: config.model,
          reasoning: null,
          ...(byokOpenCodeProvider ? { byokProvider: byokOpenCodeProvider } : {}),
          byokMediaDefaults: byokMediaDefaultsForRun({
            imageModelOverride: byokImageModelOverride,
            videoModelOverride: byokVideoModelOverride,
            speechModelOverride: byokSpeechModelOverride,
            speechVoiceOverride: byokSpeechVoiceOverride,
            config,
            imageModelOptions: byokImageModelOptionsPV,
            videoModelOptions: byokVideoModelOptionsPV,
            speechModelOptions: byokSpeechModelOptionsPV,
          }),
          titleGeneration: isFirstTurn ? { enabled: true } : undefined,
          locale,
          analyticsHints: {
            ...(meta?.entryFrom ? { entryFrom: meta.entryFrom } : {}),
            ...(byokSessionTurn
              ? { turnIndex: byokSessionTurn.turnIndex, isFirstRun: byokSessionTurn.isFirstRun }
              : {}),
            ...(byokProjectTurn ? { projectTurnIndex: byokProjectTurn.projectTurnIndex } : {}),
            hasExistingArtifact: byokHasExistingArtifact,
            runtimeType: 'byok',
          },
          onRunCreated: (runId) => {
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
            };
            latestAssistantMsg = pinnedAssistant;
            void saveMessage(project.id, runConversationId, pinnedAssistant);
            updateMessageById(assistantId, (prev) => ({ ...prev, runId, runStatus: 'queued' }));
          },
          onRunStatus: (runStatus) => {
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            const runMayFinalize = !supersededRunsRef.current.has(controller);
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
            if (!runMayFinalize) return;
            updateConversationLatestRun(runStatus, endedAt);
            if (isTerminalRunStatus(runStatus)) {
              clearCurrentRunStreamingMarker(runConversationId, controller, cancelController);
              scheduleConversationMessageRefresh(runConversationId);
            }
          },
          onRunEventId: (lastRunEventId) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, lastRunEventId }));
            persistAssistantSoon();
          },
        });
        return true;
      }
    },
    [
      attachedComments,
      activeConversationId,
      activeSessionMode,
      currentConversationBusy,
      queueChatSendForCurrentConversation,
      messages,
      config,
      locale,
      agentsById,
      onTouchProject,
      project.id,
      projectDesignSystemId,
      project.name,
      projectFiles,
      refreshProjectFiles,
      refreshLiveArtifacts,
      readProjectHtml,
      requestOpenFile,
      persistMessage,
      persistMessageById,
      auditDesignSystemWorkspaceAfterRun,
      patchAttachedStatuses,
      updateMessageById,
      markStreamingConversation,
      clearStreamingMarker,
      clearCurrentRunStreamingMarker,
      clearProjectTimeout,
      scheduleConversationMessageRefresh,
      scheduleProjectTimeout,
      onProjectsRefresh,
      onProjectChange,
      byokImageModelOverride,
      byokVideoModelOverride,
      byokSpeechModelOverride,
      byokSpeechVoiceOverride,
      byokImageModelOptionsPV,
      byokVideoModelOptionsPV,
      byokSpeechModelOptionsPV,
    ],
  );

  // Cancel every in-flight run for the current conversation (the user's own
  // streaming turn plus any reattached runs), mark their assistant messages
  // canceled, and drop the streaming state. Defined here — ahead of the
  // queued-send handlers — because "send now" interrupts the active run to
  // make room for the prioritized send.
  const handleStop = useCallback(() => {
    const stoppedAt = Date.now();
    const programmaticBrandId = isProgrammaticBrandExtractionProject(currentProject.metadata)
      ? currentProject.metadata?.brandId?.trim() || ''
      : '';
    if (programmaticBrandId) {
      void Promise.resolve(cancelBrandExtraction(programmaticBrandId))
        .then((result) => {
          if (result.ok && isBrandStatusValue(result.status)) {
            setBrandExtractionStatusOverride({
              brandId: programmaticBrandId,
              status: result.status,
            });
          }
        })
        .finally(() => {
          void (async () => {
            await Promise.allSettled([
              projectDetail.refresh(),
              Promise.resolve(onProjectsRefresh()),
              Promise.resolve(onDesignSystemsRefresh?.()),
              refreshWorkspaceItems(),
            ]);
            setFilesRefresh((n) => n + 1);
            requestOpenFile(DESIGN_SYSTEM_TAB);
          })();
        });
    }
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
  }, [
    cancelSendTextBuffer,
    cancelReattachTextBuffers,
    currentProject.metadata,
    onDesignSystemsRefresh,
    onProjectsRefresh,
    persistMessage,
    projectDetail.refresh,
    requestOpenFile,
    refreshWorkspaceItems,
  ]);

  // Flip the deck preview to the slide a queued send's marked element lives on
  // the moment that send starts processing. No-op for plain prompts or marks
  // without a slide index; FileWorkspace/FileViewer ignore it unless the named
  // file is the open deck.
  const armSlideNavForQueuedSend = useCallback((item: QueuedChatSend) => {
    const target = queuedSlideNavTarget(item.commentAttachments);
    if (!target) return;
    setSlideNavRequest({ name: target.filePath, slideIndex: target.slideIndex, nonce: Date.now() });
  }, []);

  const sendQueuedChatSendNow = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    if (currentConversationBusy) {
      // "Send now" while the agent is still working: the user has explicitly
      // chosen this turn over the in-flight one, so interrupt the running run
      // and move this item to the front. Stopping flips the conversation out
      // of its busy state, and the auto-start effect below then flushes the
      // now-first queued send — reusing the same path as a natural completion,
      // so runs never overlap.
      //
      // Record the runs we're superseding BEFORE handleStop() clears the active
      // refs. The daemon still delivers a late terminal callback for the
      // canceled run; tagging its controller here lets those callbacks be
      // recognized as stale and skip every current-run side effect, even if the
      // replacement send hasn't attached yet.
      if (abortRef.current) supersededRunsRef.current.add(abortRef.current);
      for (const controller of reattachControllersRef.current.values()) {
        supersededRunsRef.current.add(controller);
      }
      // The interrupted turn moved its preview-comment attachments to
      // 'applying' when it started; since we now suppress its terminal
      // callbacks, reset them to 'open' so they don't stay stuck mid-apply.
      // Reset ONLY the in-flight run's comments: queued sends (including the
      // one being prioritized) also hold their attachments in 'applying', and
      // those must stay reserved — the replacement run re-applies them. The
      // in-flight run's comments are exactly the 'applying' ones not owned by
      // any queued send.
      const queuedCommentIds = new Set(
        queuedChatSendsRef.current.flatMap((send) =>
          send.commentAttachments.map((attachment) => attachment.id),
        ),
      );
      const stuckApplying = previewCommentsRef.current.filter(
        (comment) => comment.status === 'applying' && !queuedCommentIds.has(comment.id),
      );
      if (stuckApplying.length > 0) {
        const resetIds = new Set(stuckApplying.map((comment) => comment.id));
        setPreviewComments((current) =>
          current.map((comment) =>
            resetIds.has(comment.id) ? { ...comment, status: 'open' } : comment,
          ),
        );
        void Promise.all(
          stuckApplying.map((comment) =>
            patchPreviewCommentStatus(project.id, comment.conversationId, comment.id, 'open'),
          ),
        ).catch(() => {});
      }
      prioritizeQueuedChatSend(id);
      handleStop();
      return;
    }
    void (async () => {
      armSlideNavForQueuedSend(item);
      const started = await handleSend(
        item.prompt,
        item.attachments,
        item.commentAttachments,
        { ...(item.meta ?? {}), queueDrain: true },
      );
      if (started) removeQueuedChatSend(id);
    })();
  }, [armSlideNavForQueuedSend, currentConversationBusy, handleSend, handleStop, prioritizeQueuedChatSend, project.id, removeQueuedChatSend]);

  useEffect(() => {
    if (currentConversationBusy) {
      startingQueuedChatSendIdRef.current = null;
      return;
    }
    if (startingQueuedChatSendIdRef.current) return;
    if (!activeConversationId) return;
    if (messagesConversationIdRef.current !== activeConversationId) return;
    // Queue paused by the balance gate: don't re-drain (and re-pop the
    // dialog) on unrelated state churn while AMR is still the agent. The
    // manual "run now" path below bypasses this deliberately, and switching
    // agents makes the pause irrelevant.
    if (
      config.mode === 'daemon' &&
      config.agentId === 'amr' &&
      amrGatePausedQueueConversationsRef.current.has(activeConversationId)
    ) {
      return;
    }
    const next = queuedChatSendsRef.current.find(
      (item) => item.conversationId === activeConversationId,
    );
    if (!next) return;
    startingQueuedChatSendIdRef.current = next.id;
    armSlideNavForQueuedSend(next);
    void (async () => {
      const started = await handleSend(
        next.prompt,
        next.attachments,
        next.commentAttachments,
        { ...(next.meta ?? {}), queueDrain: true },
      );
      if (!started) {
        if (startingQueuedChatSendIdRef.current === next.id) {
          startingQueuedChatSendIdRef.current = null;
        }
        return;
      }
      removeQueuedChatSend(next.id);
      scheduleProjectTimeout(() => {
        if (startingQueuedChatSendIdRef.current !== next.id) return;
        startingQueuedChatSendIdRef.current = null;
        setQueuedAutoStartTick((tick) => tick + 1);
      }, 0);
    })();
  }, [
    activeConversationId,
    armSlideNavForQueuedSend,
    config.mode,
    config.agentId,
    currentConversationBusy,
    queuedAutoStartTick,
    queuedChatSends,
    handleSend,
    removeQueuedChatSend,
    scheduleProjectTimeout,
  ]);

  const handleRetry = useCallback(
    (assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      void handleSend('', [], [], { retryOfAssistantId: assistantMessage.id });
    },
    [currentConversationActionDisabled, handleSend],
  );

  // "Continue" on a resumable failed run: send a fresh turn in the same
  // conversation. For a session-resuming runtime (Claude) the daemon persisted
  // the failed run's CLI session, so this turn resumes it (`--resume`) and the
  // agent continues from its committed work instead of restarting. Mirrors the
  // "Continue remaining tasks" affordance; unlike Retry it does not replay the
  // prior turn from scratch. Tagged `entryFrom: 'resume_continue'` so
  // run_created / run_finished can quantify how often resume fires and whether
  // it recovers (the whole point is to show the mechanism lowers failure rate).
  const handleResumeRun = useCallback(
    (_assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      void handleSend(RESUME_CONTINUE_PROMPT, [], [], { entryFrom: 'resume_continue' });
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
    async (commentAttachments: ChatCommentAttachment[], images: File[] = []) => {
      if (currentConversationQueueDisabled) return false;
      if (commentAttachments.length === 0 && images.length === 0) return false;
      setWorkspaceFocused(false);
      setCommentInspectorActive(false);
      // Upload any attached images once, then queue. Each comment becomes its
      // own task (so multiple notes => multiple queued tasks); the images ride
      // along the first task rather than being duplicated across every note.
      let uploaded: ChatAttachment[] = [];
      if (images.length > 0) {
        const result = await uploadProjectFiles(project.id, images);
        uploaded = result.uploaded;
      }
      if (commentAttachments.length === 0) {
        if (uploaded.length > 0) await handleSend('', uploaded, [], { queueOnly: true, entryFrom: 'comment' });
        return true;
      }
      for (let i = 0; i < commentAttachments.length; i++) {
        const commentAttachment = commentAttachments[i]!;
        const savedImages = chatAttachmentsFromPreviewCommentImages(commentAttachment.imageAttachments);
        const prompt = commentTaskQuery(commentAttachment);
        // Comment/board pin → run: tag entry_from='comment' so the dashboard
        // separates annotation-driven runs from plain composer sends.
        await handleSend(
          prompt,
          mergeChatAttachments(i === 0 ? uploaded : [], savedImages),
          [commentTaskContextAttachment(commentAttachment)],
          { queueOnly: true, entryFrom: 'comment' },
        );
      }
      return true;
    },
    [handleSend, project.id, currentConversationQueueDisabled],
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

  const { shareToOpenDesignBusyMessageId, handleShareToOpenDesign } = useShareToOpenDesign(
    currentConversationActionDisabled,
    currentConversationBusy,
    handleSend,
  );

  const { sendDesignSystemFeedback, persistDesignSystemReviewDecision } = useWiredDesignSystemReview(
    project,
    projectFiles,
    activeConversationId,
    messagesInitialized,
    currentConversationActionDisabled,
    onProjectChange,
    handleSend,
  );

  const {
    creatingConversation,
    forkingMessageId,
    handleNewConversation,
    handleSelectConversation,
    refreshConversationsForProgrammaticBrandRetry,
    handleDeleteConversation,
    handleRenameConversation,
    handleConversationSessionModeChange,
    handleActiveConversationSessionModeChange,
    handleForkFromMessage,
  } = useWiredConversationManagement(
    project.id,
    activeConversationId,
    setConversations,
    setActiveConversationId,
    failedMessagesConversationId,
    setFailedMessagesConversationId,
    messages,
    setMessages,
    messagesConversationIdRef,
    setMessagesConversationId,
    setStreaming,
    streamingConversationIdRef,
    setStreamingConversationId,
    setPreviewComments,
    setAttachedComments,
    setArtifact,
    setConversationLoadError,
    setError,
    setMessageLoadRetryNonce,
    activeConversation?.title,
    activeSessionMode,
    openTabsState.active,
    onProjectsRefresh,
    projectIdRef,
    conversationsRefreshTokenRef,
    t,
  );

  const activeConversationChatState = useMemo(
    () =>
      activeConversationId
        ? {
	            conversationId: activeConversationId,
	            messages,
	            streaming: currentConversationControlStreaming,
	            loading: currentConversationLoading,
	            sendDisabled: currentConversationSendDisabled,
            queuedItems: currentConversationQueuedItems,
            error: conversationLoadError ?? error,
            onSend: handleSend,
            onRetry: handleRetry,
            onStop: handleStop,
            onRemoveQueuedSend: removeQueuedChatSend,
            onUpdateQueuedSend: updateQueuedChatSend,
            onReorderQueuedSends: reorderCurrentConversationQueuedChatSends,
            onSendQueuedNow: sendQueuedChatSendNow,
            onAssistantFeedback: handleAssistantFeedback,
          }
        : undefined,
    [
      activeConversationId,
      conversationLoadError,
      currentConversationActionDisabled,
	      currentConversationQueuedItems,
	      currentConversationSendDisabled,
	      currentConversationLoading,
	      currentConversationControlStreaming,
      error,
      handleAssistantFeedback,
      handleRetry,
      handleSend,
      handleStop,
      messages,
      removeQueuedChatSend,
      reorderCurrentConversationQueuedChatSends,
      sendQueuedChatSendNow,
      updateQueuedChatSend,
    ],
  );

  const handleChangeDesignSystemId = useCallback(
    (nextId: string | null) => {
      if ((projectDesignSystemId ?? null) === nextId) return;
      // `design_system_apply_result` studio variant. The existing
      // NewProjectPanel picker fires the same event under
      // `page_name=home`; this in-project header picker fires under
      // `page_name=studio` so the funnel sees applies from both
      // surfaces. `target_project_kind` derives from
      // `project.metadata.kind`.
      const target =
        // NOTE: `target_project_kind` uses the narrower
        // `TrackingDesignSystemApplyTargetKind` enum, which intentionally does
        // NOT carry the prototype subtypes (wireframe/mobile) or `document`.
        // Derive the coarse kind here (subtypes collapse back to `prototype`)
        // so a Home-created Wireframe/Mobile/Document project never emits a
        // value outside this field's schema. The fine-grained split only
        // belongs on `project_kind` (create/run events).
        (projectKindToTracking(project.metadata?.kind ?? null, project.metadata?.videoModel) ?? 'unknown') as TrackingDesignSystemApplyTargetKind;
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
    [project, projectDesignSystemId, onProjectChange, designSystems, analytics.track],
  );

  // Canonical project-type chip shown next to the editable title. We label
  // by the resolved skill/template `mode` (the real type taxonomy) rather
  // than the skill's display name, so every project kind — prototype, deck,
  // template, image, video, audio, design system — reads as one consistent,
  // short type just like "Design system". Returns null for freeform projects
  // (no resolvable type), which hides the chip.
  const projectTypeLabel = useMemo<string | null>(() => {
    if (projectIsDesignSystemProject) return t('dsManager.tabDesignSystem');
    const summary =
      skills.find((s) => s.id === project.skillId) ??
      designTemplates.find((s) => s.id === project.skillId);
    switch (summary?.mode) {
      case 'prototype':
        return t('project.typePrototype');
      case 'deck':
        return t('project.typeDeck');
      case 'template':
        return t('project.typeTemplate');
      case 'design-system':
        return t('dsManager.tabDesignSystem');
      case 'image':
        return t('project.typeImage');
      case 'video':
        return t('project.typeVideo');
      case 'audio':
        return t('project.typeAudio');
      default:
        return null;
    }
  }, [projectIsDesignSystemProject, skills, designTemplates, project.skillId, t]);

  const activeDesignSystemSummary = useMemo(() => {
    if (!projectDesignSystemId) return null;
    return designSystems.find((d) => d.id === projectDesignSystemId) ?? null;
  }, [designSystems, projectDesignSystemId]);

  const designSystemProject = useMemo(() => {
    if (!projectIsDesignSystemProject || !projectDesignSystemId) return null;
    return designSystems.find((d) => d.id === projectDesignSystemId)
      ?? fallbackDesignSystemSummaryForProject(currentProject, projectDesignSystemId);
  }, [
    currentProject,
    designSystems,
    projectDesignSystemId,
    projectIsDesignSystemProject,
  ]);
  const designSystemProjectFromRegistry = useMemo(() => {
    if (!projectIsDesignSystemProject || !projectDesignSystemId) return null;
    return designSystems.find((d) => d.id === projectDesignSystemId) ?? null;
  }, [designSystems, projectDesignSystemId, projectIsDesignSystemProject]);
  useEffect(() => {
    if (!projectIsDesignSystemProject || !projectDesignSystemId) {
      missingDesignSystemRefreshRef.current = null;
      return;
    }
    if (designSystemProjectFromRegistry) {
      missingDesignSystemRefreshRef.current = null;
      return;
    }
    if (missingDesignSystemRefreshRef.current === projectDesignSystemId) return;
    missingDesignSystemRefreshRef.current = projectDesignSystemId;
    void Promise.resolve(onDesignSystemsRefresh?.()).catch((err) => {
      missingDesignSystemRefreshRef.current = null;
      console.warn('[design-system] failed to refresh missing project design system', err);
    });
  }, [
    designSystemProjectFromRegistry,
    onDesignSystemsRefresh,
    projectDesignSystemId,
    projectIsDesignSystemProject,
  ]);
  useEffect(() => {
    const pending = pendingBrandDesignSystemOpenRef.current;
    if (!pending || designSystemProject?.id !== pending) return;
    pendingBrandDesignSystemOpenRef.current = null;
    requestOpenFile(DESIGN_SYSTEM_TAB);
  }, [designSystemProject?.id, requestOpenFile]);
  useEffect(() => {
    if (!projectIsProgrammaticBrandExtraction || !designSystemProject?.id) {
      autoOpenedBrandDesignSystemRef.current = null;
      return;
    }
    if (autoOpenedBrandDesignSystemRef.current === designSystemProject.id) return;
    if (!tabsLoadedRef.current) return;
    if (routeFileName) {
      autoOpenedBrandDesignSystemRef.current = designSystemProject.id;
      return;
    }
    if (openTabsState.active || openTabsState.tabs.length > 0) {
      autoOpenedBrandDesignSystemRef.current = designSystemProject.id;
      return;
    }
    if (tabsHydratedFromSavedStateRef.current) {
      autoOpenedBrandDesignSystemRef.current = designSystemProject.id;
      return;
    }
    autoOpenedBrandDesignSystemRef.current = designSystemProject.id;
    requestOpenFile(DESIGN_SYSTEM_TAB);
  }, [
    designSystemProject?.id,
    openTabsState.active,
    openTabsState.tabs.length,
    projectIsProgrammaticBrandExtraction,
    requestOpenFile,
    routeFileName,
    tabsHydrationVersion,
  ]);
  const designSystemActivityEvents = useMemo(
    () => designSystemProject ? latestDesignSystemActivityEvents(messages) : [],
    [designSystemProject, messages],
  );
  const connectRepoNeeded = useMemo(
    () => designSystemNeedsRepoConnect(designSystemProject, projectFiles.map((file) => file.name)),
    [designSystemProject, projectFiles],
  );
  // Signal that pushes a draft into the chat composer (the "Import repo" CTA).
  const [composerDraftSignal, setComposerDraftSignal] = useState<{ text: string; nonce: number }>();
  // One handler for both the review banner and the chat CTA. When GitHub is
  // not connected it opens Connectors; once connected it prefills the composer
  // with the import instruction so the user can review and send it.
  const buildConnectRepoPrompt = useCallback(
    () => buildRepoImportPrompt(designSystemProject, projectFiles.map((file) => file.name)),
    [designSystemProject, projectFiles],
  );
  const handleConnectRepoConnected = useCallback((text: string) => {
    setComposerDraftSignal({ text, nonce: Date.now() });
  }, []);
  const handleConnectRepoNotConnected = useCallback(() => {
    onOpenSettings('composio');
  }, [onOpenSettings]);
  const { githubConnected, handleConnectRepo } = useWiredGithubConnectRepo(
    connectRepoNeeded,
    buildConnectRepoPrompt,
    handleConnectRepoConnected,
    handleConnectRepoNotConnected,
  );

  // "Next step" affordance handlers (shown under the last assistant message
  // once it produced a previewable HTML artifact). Share reuses the preview
  // workspace's existing Share/Export menu. The featured design-toolbox rows are
  // driven by ChatPane's composer ref, so ProjectView no longer wires them here.
  const handleArtifactShare = useCallback(
    (fileName: string) => {
      requestOpenFile(fileName);
      setShareRequest({ name: fileName, nonce: Date.now() });
    },
    [requestOpenFile],
  );
  // Mirrors share, but opens the workspace's Download/Export menu (PDF / image /
  // zip / standalone HTML / save-as-template) instead of a bare file download.
  const handleArtifactDownload = useCallback(
    (fileName: string) => {
      requestOpenFile(fileName);
      setDownloadRequest({ name: fileName, nonce: Date.now() });
    },
    [requestOpenFile],
  );

  const handleBrowserUsePrompt = useCallback((text: string) => {
    setWorkspaceFocused(false);
    setComposerDraftSignal({
      text,
      nonce: Date.now(),
    });
  }, []);

  const isDeck = useMemo(
    () =>
      (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))?.mode === 'deck',
    [skills, designTemplates, project.skillId],
  );
  const chatResizeLabel = t('project.resizeChatPanel');
  const splitLeftPanelWidth = leftInspectorActive
    ? COMMENT_INSPECTOR_PANEL_WIDTH
    : chatPanelWidthRef.current;

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
  const autoSendContextRef = useRef<RunContextSelection | null>(null);
  const autoSendFirstMessageRef = useRef(false);
  const autoSendAmrGateOkRef = useRef(false);
  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    let amrGateOk = false;
    try {
      isAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
      amrGateOk = Boolean(
        window.sessionStorage.getItem(autoSendAmrGateOkKey(project.id)),
      );
    } catch {
      /* sessionStorage may be unavailable; treat as manual flow. */
    }
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendAmrGateOkRef.current = isAutoSend && amrGateOk;
    autoSendSeedRef.current = isAutoSend ? (project.pendingPrompt ?? '') : '';
    autoSendAttachmentsRef.current = isAutoSend
      ? projectViewTransportPort.readAutoSendAttachments(project.id)
      : [];
    autoSendContextRef.current = isAutoSend
      ? projectViewTransportPort.readAutoSendContext(project.id)
      : null;
  }
  const initialWorkspaceContexts = autoSendContextRef.current?.workspaceItems ?? [];
  const brandEnrichmentEligibleForProject =
    config.mode === 'daemon' &&
    projectIsProgrammaticBrandExtraction &&
    !autoSendFirstMessageRef.current;
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
      autoSendSeedRef.current = pendingPrompt;
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
    chatSeed?.value ??
    (
      brandEnrichmentEligibleForProject
        ? undefined
        : (initialDraft?.projectId === project.id ? initialDraft.value : undefined)
    );
  // Home → Studio handoff confirmation (spec §11.1 onboarding_prompt_prefilled):
  // the recommendation's first request actually reached this composer. Fires
  // once, only for recommendation-started projects that arrived with a seed.
  const onboardingPrefilledFiredRef = useRef(false);
  useEffect(() => {
    const entry = onboardingEntryRef.current;
    if (!entry || onboardingPrefilledFiredRef.current) return;
    if (typeof chatInitialDraft !== 'string' || chatInitialDraft.trim().length === 0) return;
    onboardingPrefilledFiredRef.current = true;
    trackOnboardingPromptPrefilled(analytics.track, {
      entry_source: entry.source,
      product_type: entry.productType,
      recommendation_id: entry.recommendationId,
      ...(entry.role ? { role: entry.role } : {}),
      ...(entry.useCases && entry.useCases.length > 0 ? { use_cases: entry.useCases } : {}),
    });
  }, [chatInitialDraft, analytics.track]);
  const brandEnrichmentPromptSeed =
    project.pendingPrompt?.trim() ||
    (initialDraft?.projectId === project.id ? initialDraft.value.trim() : '');
  const [brandEnrichmentPromptSeedCache, setBrandEnrichmentPromptSeedCache] = useState(
    () => brandEnrichmentPromptSeed,
  );
  const [brandEnrichmentStarting, setBrandEnrichmentStarting] = useState(false);
  const [brandAgentExtractionStarting, setBrandAgentExtractionStarting] = useState(false);
  const [brandProgrammaticContinueStarting, setBrandProgrammaticContinueStarting] = useState(false);
  const brandProgrammaticContinueStartingRef = useRef(false);
  useEffect(() => {
    if (brandEnrichmentPromptSeed) {
      setBrandEnrichmentPromptSeedCache(brandEnrichmentPromptSeed);
    }
  }, [brandEnrichmentPromptSeed]);

  const handleContinueBrandExtraction = useCallback(() => {
    if (brandProgrammaticContinueStartingRef.current) return;
    const brandId = currentProject.metadata?.brandId?.trim();
    if (!projectIsProgrammaticBrandExtraction || !brandId) return;
    brandProgrammaticContinueStartingRef.current = true;
    setBrandProgrammaticContinueStarting(true);
    setBrandExtractionStatusOverride({ brandId, status: 'extracting' });
    const brandPreviewFile = brandExtractionPreviewFileName(projectFiles);
    const brandExtractionSourceUrl =
      currentProject.metadata?.brandSourceUrl?.trim() ||
      brandBrowserAssist?.sourceUrl?.trim() ||
      '';

    const refreshAfterProgrammaticContinue = async (
      status: string,
      conversationId?: string | null,
    ) => {
      setBrandExtractionStatusOverride({
        brandId,
        status: isBrandStatusValue(status) ? status : 'extracting',
      });
      dismissBrandBrowserAssist();
      await Promise.allSettled([
        projectDetail.refresh(),
        Promise.resolve(onProjectsRefresh()),
        Promise.resolve(onDesignSystemsRefresh?.()),
        refreshWorkspaceItems(),
      ]);
      setFilesRefresh((n) => n + 1);
      requestOpenFile(brandPreviewFile);
      const returnedConversationId = conversationId?.trim() || null;
      if (returnedConversationId) {
        const stillCurrent = await refreshConversationsForProgrammaticBrandRetry(returnedConversationId);
        if (!stillCurrent) return;
        if (
          returnedConversationId !== activeConversationId
          || failedMessagesConversationId === returnedConversationId
        ) {
          handleSelectConversation(returnedConversationId);
        } else {
          scheduleConversationMessageRefresh(returnedConversationId);
        }
        return;
      }
      if (activeConversationId) scheduleConversationMessageRefresh(activeConversationId);
    };

    void (async () => {
      const delay = (ms: number) =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, ms);
        });
      const snapshotMessage = (snapshot: BrandBrowserSnapshot): string | null =>
        snapshot.status === 'ready' ? null : snapshot.message;
      const hasBrowserFallback = (): boolean => {
        const handle = getBrandBrowser(project.id, BRAND_BROWSER_TAB_ID);
        return Boolean(handle?.isDesktopWebview);
      };
      const extractSnapshot = async (
        snapshot: BrandBrowserSnapshot,
        options: { recoverableFailureIsMiss?: boolean } = {},
      ): Promise<BrandBrowserSnapshotExtractionResult> => {
        if (snapshot.status !== 'ready') {
          return { status: 'miss', message: snapshot.message };
        }
        if (!brandBrowserSnapshotMatchesSource(snapshot.baseUrl, brandExtractionSourceUrl)) {
          // The Browser tab/saved archive is for a different page than the brand
          // source. Stop instead of extracting a design system for the wrong site.
          setBrandExtractionStatusOverride({ brandId, status: 'needs_input' });
          setProjectActionsToast({
            message: t('chat.brandBrowserAssistReadFailed'),
            details: null,
            tone: 'error',
            ttlMs: 7000,
          });
          return { status: 'handled' };
        }
        const outcome = await extractBrandFromHtml(brandId, {
          html: snapshot.html,
          css: snapshot.css,
          baseUrl: snapshot.baseUrl,
        });
        if (!outcome.ok) {
          if (options.recoverableFailureIsMiss) {
            return { status: 'miss', message: outcome.error };
          }
          // Recoverable, not terminal: the read may have caught the page mid-load
          // / still on the wall. Keep the kit in the calm `needs_input` state (a
          // retry or the agent fallback can still finish it) instead of flashing
          // the red "Extraction failed" terminal. The toast explains the retry.
          setBrandExtractionStatusOverride({ brandId, status: 'needs_input' });
          setProjectActionsToast({
            message: outcome.error,
            details: null,
            tone: 'error',
            ttlMs: 6000,
          });
          return { status: 'handled' };
        }
        await refreshAfterProgrammaticContinue('ready');
        return { status: 'handled' };
      };

      const localSnapshot = await readLocalBrowserPageArchiveSnapshot(brandExtractionSourceUrl);
      const localExtract = await extractSnapshot(localSnapshot, { recoverableFailureIsMiss: true });
      if (localExtract.status === 'handled') return;

      const daemonOutcome = await continueBrandExtraction(brandId);
      let fallbackMessage: string | null = localExtract.message;
      if (daemonOutcome.ok) {
        await refreshAfterProgrammaticContinue(
          daemonOutcome.result.status,
          daemonOutcome.result.conversationId,
        );
        if (daemonOutcome.result.status === 'ready') return;
        if (!isOpenDesignHostAvailable() && !hasBrowserFallback()) return;
      } else {
        fallbackMessage = daemonOutcome.error;
        if (!isOpenDesignHostAvailable() && !hasBrowserFallback()) {
          setBrandExtractionStatusOverride({ brandId, status: 'needs_input' });
          setProjectActionsToast({
            message: daemonOutcome.error,
            details: null,
            tone: 'error',
            ttlMs: 5000,
          });
          return;
        }
      }

      // Foreground the pinned Browser tab before either live DOM communication
      // or invoking its page-snapshot downloader. When the user clicks Continue
      // from the preview tab, the browser <webview> may be `display:none` and
      // Electron can throttle its renderer; a focus-only request wakes it
      // without navigating/re-triggering a wall.
      if (isOpenDesignHostAvailable() && brandExtractionSourceUrl) {
        setBrowserOpenRequest({
          tabId: BRAND_BROWSER_TAB_ID,
          url: brandExtractionSourceUrl,
          nonce: Date.now(),
          focusOnly: true,
        });
        await delay(600);
      }

      const liveSnapshot = await readBrandBrowserSnapshotWithRetry(BRAND_BROWSER_TAB_ID);
      requestOpenFile(brandPreviewFile);
      if ((await extractSnapshot(liveSnapshot)).status === 'handled') return;

      const archivedSnapshot = await downloadBrandBrowserPageArchive(brandExtractionSourceUrl);
      requestOpenFile(brandPreviewFile);
      if ((await extractSnapshot(archivedSnapshot)).status === 'handled') return;

      // Still no readable local source. Recoverable — clear/settle/download the
      // Browser page and click Continue again, or use the agent fallback.
      setBrandExtractionStatusOverride({ brandId, status: 'needs_input' });
      if (isOpenDesignHostAvailable() && brandExtractionSourceUrl) {
        setBrowserOpenRequest({
          tabId: BRAND_BROWSER_TAB_ID,
          url: brandExtractionSourceUrl,
          nonce: Date.now(),
          attentionAction: 'download-page',
        });
      }
      setProjectActionsToast({
        message:
          snapshotMessage(archivedSnapshot) ||
          snapshotMessage(liveSnapshot) ||
          fallbackMessage ||
          t('chat.brandBrowserAssistReadFailed'),
        details: t('chat.brandBrowserAssistDownloadGuideDetails'),
        tone: 'error',
        ttlMs: 7000,
      });
    })()
      .catch((err) => {
        setBrandExtractionStatusOverride({ brandId, status: 'needs_input' });
        setProjectActionsToast({
          message: err instanceof Error ? err.message : t('chat.brandBrowserAssistReadFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
      })
      .finally(() => {
        brandProgrammaticContinueStartingRef.current = false;
        setBrandProgrammaticContinueStarting(false);
      });
  }, [
    activeConversationId,
    brandBrowserAssist?.sourceUrl,
    currentProject.metadata,
    dismissBrandBrowserAssist,
    failedMessagesConversationId,
    handleSelectConversation,
    onDesignSystemsRefresh,
    onProjectsRefresh,
    projectDetail,
    project.id,
    projectFiles,
    projectIsProgrammaticBrandExtraction,
    downloadBrandBrowserPageArchive,
    readLocalBrowserPageArchiveSnapshot,
    readBrandBrowserSnapshotWithRetry,
    refreshConversationsForProgrammaticBrandRetry,
    refreshWorkspaceItems,
    requestOpenFile,
    scheduleConversationMessageRefresh,
    t,
  ]);

  const handleBrandAgentExtraction = useCallback(() => {
    if (brandAgentExtractionStarting) return;
    const brandId = currentProject.metadata?.brandId?.trim();
    if (brandId) setBrandExtractionStatusOverride({ brandId, status: 'extracting' });
    const prompt = buildBrandAgentExtractionContinuationPrompt({
      promptSeed: brandEnrichmentPromptSeed || brandEnrichmentPromptSeedCache,
      metadata: currentProject.metadata,
      projectFiles,
    });
    setBrandAgentExtractionStarting(true);
    requestOpenFile(brandExtractionPreviewFileName(projectFiles));
    void handleSend(prompt, [], []).finally(() => setBrandAgentExtractionStarting(false));
  }, [
    brandAgentExtractionStarting,
    brandEnrichmentPromptSeed,
    brandEnrichmentPromptSeedCache,
    currentProject.metadata,
    handleSend,
    projectFiles,
    requestOpenFile,
  ]);

  // Run the deeper "AI Optimize" enrichment pass on a programmatically-extracted
  // brand: send the hidden seeded enrichment prompt + the default design-system
  // skill bundle, refining the SAME registered design system in place. Shared by
  // the chat "Continue" affordance and the ready-toast "AI Optimize" nudge.
  const handleBrandEnrichment = useCallback(() => {
    if (brandEnrichmentStarting || config.mode !== 'daemon') return;
    const system = designSystemProject ?? activeDesignSystemSummary;
    const skillIds = installedBrandEnrichmentSkillIds(skills);
    trackDesignSystemEnrichClick(analytics.track, {
      page_name: 'design_system_project',
      area: 'design_system_enrich',
      element: 'ai_optimize',
      design_system_id: projectDesignSystemId ?? undefined,
      project_kind: 'design_system',
    });
    setBrandEnrichmentStarting(true);
    void handleSend(
      buildBrandEnrichmentPrompt(brandEnrichmentPromptSeed || brandEnrichmentPromptSeedCache, {
        metadata: currentProject.metadata,
        designSystemId: system?.id,
        designSystemTitle: system?.title,
        projectFiles,
      }),
      [],
      [],
      { ...(skillIds.length > 0 ? { skillIds } : {}), dsEnrichment: true },
    ).finally(() => setBrandEnrichmentStarting(false));
  }, [
    activeDesignSystemSummary,
    analytics,
    brandEnrichmentPromptSeed,
    brandEnrichmentPromptSeedCache,
    brandEnrichmentStarting,
    config.mode,
    designSystemProject,
    handleSend,
    currentProject.metadata,
    projectDesignSystemId,
    projectFiles,
    skills,
  ]);

  const {
    handleCreateDesignFromActiveDesignSystem,
    createDesignFromActiveDesignSystemBusy: brandCreateDesignStarting,
    handleCreateDesignSystemFromProject,
    createDesignSystemFromProjectBusy: projectDesignSystemCreateStarting,
    handleDuplicateProject,
    duplicateProjectBusy: projectDuplicateStarting,
    handleNavigateToDuplicatedProject,
    handleDuplicateContextPluginFailed,
    handleProjectRename,
  } = useProjectActions(
    currentProject,
    projectFiles,
    projectIsDesignSystemProject,
    designSystemProject,
    activeDesignSystemSummary,
    onCreateProjectFromDesignSystem,
    onCreateDesignSystemFromProject,
    onDuplicateProject,
    setProjectActionsToast,
    t,
    onProjectChange,
    projectViewTransportPort,
  );

  // Continue in CLI / Finalize design package handlers + keyboard
  // shortcut wiring. Close to the JSX so the data flow is easy to
  // trace from the toolbar back to its sources.
  const projectIdentity = useMemo(
    () => ({ id: project.id, name: project.name }),
    [project.id, project.name],
  );
  const { handleFinalize, handleCancelFinalize, handleContinueInCli } =
    useWiredProjectFinalizeActions(
      config,
      finalize,
      designMdState,
      terminalLauncher,
      projectIdentity,
      projectDetail.resolvedDir,
      setProjectActionsToast,
    );

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
  const buildDuplicatePluginName = useCallback(
    (record: InstalledPluginRecord) => localizePluginTitle(locale, record),
    [locale],
  );
  const {
    activePluginSnapshot,
    contextPluginDetails,
    contextDesignSystemDetails,
    handleOpenContextPluginDetails,
    handleDuplicateContextPlugin,
    handleOpenContextDesignSystemDetails,
    closeContextPluginDetails,
    closeContextDesignSystemDetails,
  } = useWiredPluginContextDetails(
    project.appliedPluginSnapshotId,
    buildDuplicatePluginName,
    handleNavigateToDuplicatedProject,
    handleDuplicateContextPluginFailed,
  );
  const chatDesignSystemSummary = useMemo(() => {
    if (activeDesignSystemSummary) return activeDesignSystemSummary;
    const designSystemName = activePluginSnapshot?.inputs?.designSystem;
    if (typeof designSystemName !== 'string') return null;
    const normalized = designSystemName.trim();
    if (!normalized || normalized === 'the active project design system') return null;
    return designSystems.find((d) => d.title === normalized) ?? null;
  }, [activeDesignSystemSummary, activePluginSnapshot?.inputs, designSystems]);

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
    if (projectIsProgrammaticBrandExtraction) {
      projectViewTransportPort.clearAutoSendSession(project.id);
      autoSendAttachmentsRef.current = [];
      autoSentRef.current = true;
      return;
    }
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
    const context = autoSendContextRef.current ?? projectViewTransportPort.readAutoSendContext(project.id);
    if (!seed && attachments.length === 0) {
      return;
    }
    autoSentRef.current = true;
    if (isDesignSystemWorkspaceMetadata(project.metadata)) {
      projectViewTransportPort.markDesignSystemAuditAutoRepairEligible(project.id);
    }
    projectViewTransportPort.clearAutoSendSession(project.id);
    autoSendAttachmentsRef.current = [];
    void handleSend(seed, attachments, [], {
      ...(context ? { context } : {}),
      // The home submit already gated this exact task (and the user answered
      // any soft warning there); asking again would double-prompt.
      ...(autoSendAmrGateOkRef.current ? { amrGatePrechecked: true } : {}),
    });
  }, [
    activeConversationId,
    messagesInitialized,
    streaming,
    messages.length,
    project.id,
    projectIsProgrammaticBrandExtraction,
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

  // CLI / agent selector lives below the chat conversation (composer footer),
  // not in the top-right header.
  const executionControls = (
    <ExecutionControls
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      projectId={project?.id}
      track={analytics.track}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiModelChange={onApiModelChange}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
    />
  );

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
        style={projectSplitStyle(workspaceFocused, splitLeftPanelWidth, workspacePanelTrack)}
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
              streaming={currentConversationControlStreaming}
              liveToolInput={liveToolInput}
              loading={currentConversationLoading}
              sendDisabled={currentConversationSendDisabled}
              queuedItems={currentConversationQueuedItems}
              error={conversationLoadError ?? error}
              projectId={project.id}
              sessionMode={activeSessionMode}
              onSessionModeChange={handleActiveConversationSessionModeChange}
              projectKindForTracking={projectKindFromMetadataToTracking(currentProject.metadata)}
              projectFiles={projectFiles}
              activeProjectFileName={activeProjectFileName}
              hasActiveDesignSystem={!!projectDesignSystemId}
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
              onResumeRun={handleResumeRun}
              onStop={handleStop}
              onRemoveQueuedSend={removeQueuedChatSend}
              onUpdateQueuedSend={updateQueuedChatSend}
              onReorderQueuedSends={reorderCurrentConversationQueuedChatSends}
              onSendQueuedNow={sendQueuedChatSendNow}
              onRequestOpenFile={requestOpenFile}
              onRequestPluginDetails={handleOpenContextPluginDetails}
              onRequestDesignSystemDetails={handleOpenContextDesignSystemDetails}
              onRequestPluginFolderAgentAction={handlePluginFolderAgentAction}
              activePluginActionPaths={activePluginActionPaths}
              hiddenPluginActionPaths={hiddenAssistantPluginActionPaths}
              onShareToOpenDesign={handleShareToOpenDesign}
              shareToOpenDesignBusyMessageId={shareToOpenDesignBusyMessageId}
              forceStreamingMessageIds={forceStreamingPluginMessageIds}
              initialDraft={chatInitialDraft}
              onboardingStarterPath={onboardingEntryRef.current?.productType ?? null}
              onOpenQuestions={openQuestionsTab}
              onContinueRemainingTasks={handleContinueRemainingTasks}
              onAssistantFeedback={handleAssistantFeedback}
              onArtifactShare={handleArtifactShare}
              onArtifactDownload={handleArtifactDownload}
              onForkFromMessage={handleForkFromMessage}
              forkingMessageId={forkingMessageId}
              onNewConversation={handleNewConversation}
              newConversationDisabled={creatingConversation}
              conversations={conversations}
              activeConversationId={activeConversationId}
              messagesConversationId={messagesConversationId}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              config={config}
              onOpenSettings={onOpenSettings}
              showByokRecoveryAction={
                config.mode === 'api' &&
                daemonLive &&
                (
                  !config.apiKey.trim() ||
                  !config.baseUrl.trim() ||
                  !config.model.trim()
                )
              }
              onSwitchToLocalCli={() => {
                setError(null);
                onModeChange('daemon');
              }}
              onOpenAmrSettings={onOpenAmrSettings}
              onSwitchToAmrAndRetry={handleSwitchToAmrAndRetry}
              onLaunchAntigravityOauth={handleLaunchAntigravityOauth}
              onOpenMcpSettings={onOpenMcpSettings}
              onBrowsePlugins={onBrowsePlugins}
              onOpenConnectors={onOpenConnectors}
              connectRepoNeeded={connectRepoNeeded}
              githubConnected={githubConnected}
              onConnectRepo={handleConnectRepo}
              brandExtractionComplete={effectiveBrandExtractionStatus === 'ready' || Boolean(brandReady)}
              brandEnrichmentEligible={brandEnrichmentEligibleForProject}
              onContinueBrandEnrichment={handleBrandEnrichment}
              brandEnrichmentBusy={brandEnrichmentStarting}
              onContinueBrandAgentExtraction={handleBrandAgentExtraction}
              continueBrandAgentExtractionBusy={brandAgentExtractionStarting}
              onContinueBrandExtraction={handleContinueBrandExtraction}
              continueBrandExtractionBusy={brandProgrammaticContinueStarting}
              onCreateDesignFromActiveDesignSystem={handleCreateDesignFromActiveDesignSystem}
              createDesignFromActiveDesignSystemBusy={brandCreateDesignStarting}
              onCreateDesignSystemFromProject={
                projectIsDesignSystemProject ? undefined : handleCreateDesignSystemFromProject
              }
              createDesignSystemFromProjectBusy={projectDesignSystemCreateStarting}
              onBrandBrowserAssistConfirm={handleBrandBrowserAssistConfirm}
              composerDraftSignal={composerDraftSignal}
              petConfig={config.pet}
              onAdoptPet={onAdoptPetInline}
              onTogglePet={onTogglePet}
              onOpenPetSettings={onOpenPetSettings}
              researchAvailable={config.mode === 'daemon'}
              byokApiProtocol={config.apiProtocol}
              byokImageModel={byokImageModelOverride}
              onChangeByokImageModel={setByokImageModelOverride}
              byokVideoModel={byokVideoModelOverride}
              onChangeByokVideoModel={setByokVideoModelOverride}
              byokSpeechModel={byokSpeechModelOverride}
              onChangeByokSpeechModel={setByokSpeechModelOverride}
              byokSpeechVoice={byokSpeechVoiceOverride}
              onChangeByokSpeechVoice={setByokSpeechVoiceOverride}
              projectMetadata={currentProject.metadata}
              onProjectMetadataChange={(metadata) => {
                onProjectChange({ ...project, metadata });
              }}
              activeWorkspaceContext={activeWorkspaceContext}
              initialWorkspaceContexts={initialWorkspaceContexts}
              workspaceContexts={workspaceContexts}
              currentSkillId={project.skillId}
              onProjectSkillChange={(skillId) => {
                onProjectChange({ ...project, skillId });
              }}
              activePluginSnapshot={activePluginSnapshot}
              currentDesignSystemId={projectDesignSystemId}
              onActiveDesignSystemChange={(updatedProject) => {
                onProjectChange(updatedProject);
              }}
              onShowToast={(message) => {
                setProjectActionsToast({ message, details: null });
              }}
              onBack={onBack}
              backLabel={t('project.backToProjects')}
              composerFooterAccessory={executionControls}
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
                  {projectTypeLabel ? (
                    <span className="meta" data-testid="project-meta">{projectTypeLabel}</span>
                  ) : null}
                </span>
              )}
              designSystemPicker={(
                <DesignSystemPicker
                  designSystems={designSystems}
                  selectedId={projectDesignSystemId ?? null}
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
          projectKind={projectKindFromMetadataToTracking(currentProject.metadata) ?? 'prototype'}
          rootDirName={(() => {
            const baseDir = currentProject.metadata?.baseDir;
            return typeof baseDir === 'string'
              ? baseDir.split(/[/\\]/).filter(Boolean).pop()
              : undefined;
          })()}
          reloading={false}
          resolvedDir={projectDetail.resolvedDir}
          files={projectFiles}
          liveArtifacts={liveArtifacts}
          filesRefreshKey={filesRefresh}
          onRefreshFiles={() => {
            return refreshWorkspaceItems().then(() => undefined);
          }}
          isDeck={isDeck}
          streaming={currentConversationActionDisabled}
          commentQueueOnSend={commentQueueOnSend}
          commentSendDisabled={currentConversationQueueDisabled}
          openRequest={openRequest}
          browserOpenRequest={browserOpenRequest}
          pinnedBrowserTabId={projectIsProgrammaticBrandExtraction ? BRAND_BROWSER_TAB_ID : null}
          shareRequest={shareRequest}
          downloadRequest={downloadRequest}
          slideNavRequest={slideNavRequest}
          liveArtifactEvents={liveArtifactEvents}
          designSystemActivityEvents={designSystemActivityEvents}
          tabsState={openTabsState}
          onTabsStateChange={persistTabsState}
          previewComments={previewComments}
          onSavePreviewComment={savePreviewComment}
          onRemovePreviewComment={removePreviewComment}
          onSendBoardCommentAttachments={handleSendBoardCommentAttachments}
          onBrandExtractionStopRequest={projectIsProgrammaticBrandExtraction ? handleStop : undefined}
          onRequestBrowserUsePrompt={handleBrowserUsePrompt}
          onPluginFolderAgentAction={handlePluginFolderAgentAction}
          activePluginActionPaths={activePluginActionPaths}
          preferredPreviewFile={currentProject.metadata?.entryFile ?? null}
          autoPreviewDesignArtifacts={currentProject.metadata?.importedFrom === 'folder'}
          focusMode={workspaceFocused}
          onFocusModeChange={setWorkspaceFocused}
          designSystemProject={designSystemProject}
          designSystemBrandId={designSystemBrandId}
          designSystemEditable={designSystemEditable}
          defaultDesignSystemId={config.designSystemId}
          onSetDefaultDesignSystem={onChangeDefaultDesignSystem}
          onDesignSystemsRefresh={onDesignSystemsRefresh}
          onCreateDesignSystemFromProject={
            projectIsDesignSystemProject ? undefined : handleCreateDesignSystemFromProject
          }
          createDesignSystemFromProjectBusy={projectDesignSystemCreateStarting}
          onDuplicateProject={onDuplicateProject ? handleDuplicateProject : undefined}
          duplicateProjectBusy={projectDuplicateStarting}
          onDeleteDesignSystemProject={onDeleteProject}
          onDesignSystemNeedsWork={sendDesignSystemFeedback}
          designSystemReview={currentProject.metadata?.designSystemReview}
          onDesignSystemReviewDecision={persistDesignSystemReviewDecision}
          onUseDesignSystem={onCreateProjectFromDesignSystem}
          designSystemEditRequest={designSystemEditRequest}
          onConnectRepo={handleConnectRepo}
          githubConnected={githubConnected}
          commentPortalId={commentInspectorPortalId}
          onCommentModeChange={setCommentInspectorActive}
          chatConfig={config}
          chatAgentsById={agentsById}
          chatLocale={locale}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onConversationSessionModeChange={handleConversationSessionModeChange}
          onNewConversation={handleNewConversation}
          activeConversationChat={activeConversationChatState}
          onActiveContextChange={handleActiveWorkspaceContextChange}
          onWorkspaceContextsChange={handleWorkspaceContextsChange}
          messages={messages}
          artifactHtml={artifact?.html}
          conversationError={error}
          onRetry={handleRetry}
          onAuthorizeAndRetry={handleSwitchToAmrAndRetry}
          onLaunchTerminalAuth={handleLaunchAntigravityOauth}
          conversationId={activeConversationId}
          headerActions={(
            <>
              <HandoffButton
                projectId={project.id}
                projectName={project.name}
                projectDir={projectDetail.resolvedDir}
                agents={agents}
                artifactId={headerArtifact.artifact_id}
                artifactKind={headerArtifact.artifact_kind}
                metricsConsent={config.telemetry?.metrics === true}
                installationId={config.installationId}
              />
              <EntrySettingsMenu
                config={config}
                onThemeChange={handleThemeChange}
                onOpenSettings={onOpenSettings}
                trackingPageName="artifact"
                onTrackTriggerClick={() => {
                  // Spec row 52: the settings gear in the artifact header.
                  // Carry the active artifact so settings slices line up with
                  // the rest of the artifact_header funnel.
                  trackArtifactHeaderClick(analytics.track, {
                    page_name: 'artifact',
                    area: 'artifact_header',
                    element: 'settings',
                    ...headerArtifact,
                  });
                }}
              />
            </>
          )}
          questionForm={displayedQuestionForm}
          questionFormPreview={displayedQuestionFormPreview}
          questionFormKey={displayedQuestionFormKey}
          questionFormInteractive={displayedQuestionFormActive}
          questionFormSubmitDisabled={currentConversationActionDisabled}
          questionFormSubmittedAnswers={displayedQuestionFormSubmittedAnswers}
          questionsGenerating={displayedQuestionsGenerating}
          focusQuestionsRequest={focusQuestionsRequest}
          onSubmitQuestionForm={(text) => {
            if (currentConversationActionDisabled) return;
            // Submitting question-form answers is a clarification turn, not a
            // fresh create/edit — tag entry_from so the dashboard can separate it.
            void handleSend(text, [], [], { entryFrom: 'question_answer' });
          }}
        />
      </div>
      {contextPluginDetails ? (
        <PluginDetailsModal
          record={contextPluginDetails}
          onClose={closeContextPluginDetails}
          onUse={closeContextPluginDetails}
          onDuplicate={(record) => void handleDuplicateContextPlugin(record)}
          isApplying={false}
          hideUseAction
        />
      ) : null}
      {contextDesignSystemDetails ? (
        <DesignSystemPreviewModal
          system={contextDesignSystemDetails}
          initialViewId="kit"
          onClose={closeContextDesignSystemDetails}
        />
      ) : null}
      {/* One-time first-generation hint (spec §8.3) is scoped to the new-user
          onboarding handoff: only projects started from the Home recommendation
          carry a consumed `onboardingEntryRef`. Without this gate the hint
          would surface for any returning user opening an existing HTML project
          and burn its once-ever localStorage budget outside the intended flow. */}
      {onboardingEntryRef.current && hasPreviewableArtifact && !currentConversationStreaming ? (
        <FirstArtifactHint />
      ) : null}
      {amrBalanceGateBlock ? (
        <AmrBalanceDialog
          reason={amrBalanceGateBlock.reason}
          balanceUsd={amrBalanceGateBlock.snapshot.balanceUsd}
          profile={amrBalanceGateBlock.snapshot.profile}
          entrySource="chat_balance_gate_upgrade"
          metricsConsent={config.telemetry?.metrics === true}
          installationId={config.installationId}
          onClose={() => setAmrBalanceGateBlock(null)}
          onResolved={() => {
            // Sign-in completed or the recharge landed: lift the balance
            // pause and kick the drain so the parked send starts on its own
            // (it still re-gates, so a half-measure recharge surfaces the
            // soft reminder rather than silently failing mid-run).
            const conversationId = amrBalanceGateBlock.conversationId;
            setAmrBalanceGateBlock(null);
            amrGatePausedQueueConversationsRef.current.delete(conversationId);
            setQueuedAutoStartTick((tick) => tick + 1);
          }}
        />
      ) : null}
      {amrLowBalanceWarn ? (
        <AmrLowBalanceDialog
          balanceUsd={amrLowBalanceWarn.snapshot.balanceUsd}
          profile={amrLowBalanceWarn.snapshot.profile}
          entrySource="chat_low_balance_warn_recharge"
          metricsConsent={config.telemetry?.metrics === true}
          installationId={config.installationId}
          onDecision={amrLowBalanceWarn.resolve}
        />
      ) : null}
      <AnimatePresence>
        {projectActionsToast ? (
          <Toast
            message={projectActionsToast.message}
            details={projectActionsToast.details}
            code={projectActionsToast.code}
            tone={projectActionsToast.tone}
            ttlMs={projectActionsToast.ttlMs}
            onDismiss={() => setProjectActionsToast(null)}
          />
        ) : null}
        {brandReadyPrompt ? (
          <BrandReadyPrompt
            key="brand-ready-prompt"
            brandName={brandReadyPrompt.brandName}
            workspaceOffsetPx={workspaceFocused ? 0 : splitLeftPanelWidth + SPLIT_RESIZE_HANDLE_WIDTH}
            onPreview={() => {
              requestOpenFile(DESIGN_SYSTEM_TAB);
              setProjectActionsToast({
                message: t('project.brandReadyPreviewOpened'),
                details: null,
                tone: 'success',
                ttlMs: 3000,
              });
              dismissBrandReady();
            }}
            // Programmatic extraction can miss details — nudge toward refining it.
            showRefinement={projectIsProgrammaticBrandExtraction}
            onAiOptimize={() => {
              handleBrandEnrichment();
              dismissBrandReady();
            }}
            onEditManually={() => {
              setDesignSystemEditRequest({ module: 'logo', nonce: Date.now() });
              dismissBrandReady();
            }}
            onDismiss={dismissBrandReady}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
