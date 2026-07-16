import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence } from 'motion/react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import { resolveHtmlPointerArtifactTarget } from '../artifacts/pointer';
import { validateHtmlArtifact } from '../artifacts/validate';
import { recoverHtmlDocumentFromMarkdownFence, recoverStandaloneHtmlDocument, resolvePersistedArtifactHtml } from '../artifacts/recover';
import { createArtifactParser } from '../artifacts/parser';
import {
  findFirstQuestionForm,
  hasUnterminatedQuestionForm,
  parsePartialQuestionForm,
  type QuestionForm,
} from '../artifacts/question-form';
import { parseSubmittedAnswers } from './QuestionForm';
import { useI18n } from '../i18n';
import {
  fetchChatRunStatus,
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
  fetchVelaLoginStatus,
  listActiveChatRuns,
  listProjectRuns,
  publishDaemonRunFinishedEvent,
  reattachDaemonRun,
  reportChatRunFeedback,
  streamViaDaemon,
} from '../providers/daemon';
import { normalizeCustomReason } from '@open-design/contracts/analytics';
import {
  deletePreviewComment,
  fetchConnectorStatuses,
  fetchPreviewComments,
  fetchProjectDesignSystemPackageAudit,
  fetchLiveArtifacts,
  fetchProjectFiles,
  fetchProjectFileText,
  fetchSkill,
  patchPreviewCommentStatus,
  projectRawUrl,
  uploadProjectFiles,
  upsertPreviewComment,
  writeProjectTextFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { claimProjectTurnIndex, claimRunTurnIndex } from '../analytics/identity';
import { useCoalescedCallback } from '../hooks/useCoalescedCallback';
import { requestAmrArtifactUpgrade } from '../runtime/amr-artifact-upgrade';
import {
  type AmrWalletSnapshot,
  type ByokMediaDefaults,
  type ByokChatProviderConfig,
  type ByokChatProtocol,
  type ResearchOptions,
} from '@open-design/contracts';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  projectKindFromMetadataToTracking,
  projectKindToTracking,
} from '@open-design/contracts/analytics';
import type {
  TrackingArtifactKind,
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackArtifactHeaderClick,
  trackComposerBarClick,
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
import {
  appendErrorStatusEvent,
  removeErrorStatusEvent,
  runFailureFieldsFromError,
} from '../runtime/chat-events';
import type { RunFailureClassificationFields } from '../runtime/chat-events';
import {
  designDeliveryVerificationPending,
  isRetryableAssistantTerminalFailure,
  resolveDesignDeliveryOutcome,
  type DesignDeliveryOutcome,
} from '../runtime/design-delivery';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import { checkAmrBalanceGate } from '../runtime/amr-balance-gate';
import { isPaidAmrPlan, resolveAmrPlan } from '../runtime/amr-low-balance-plan';
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
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  duplicatePluginAsProject,
  fetchAppliedPluginSnapshot,
  installGeneratedPluginFolder,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  saveMessage,
  startGeneratedPluginShareTask,
  cacheTabsLocally,
  persistTabsToDaemonNow,
  listPlugins,
  type SaveMessageOptions,
  waitGeneratedPluginShareTask,
} from '../state/projects';
import type {
  AppliedPluginSnapshot,
  BrandStatus,
  ChatAnalyticsEntryFrom,
  ChatSessionMode,
  InstalledPluginRecord,
  RunContextSelection,
  WorkspaceContextItem,
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
  OpenTabsState,
  Project,
  ProjectMetadata,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentTarget,
  ProjectFile,
  LiveArtifactEventItem,
  LiveArtifactSummary,
  SkillSummary,
} from '../types';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  mergeAttachedComments,
  mergePreviewCommentAttachments,
  queuedSlideNavTarget,
  removeAttachedComment,
} from '../comments';
import { historyWithApiAttachmentContext } from '../api-attachment-context';
import { filterImplicitProducedFiles } from '../produced-files';
import { AvatarMenu } from './AvatarMenu';
import { EntrySettingsMenu } from './EntrySettingsMenu';
import { HandoffButton } from './HandoffButton';
import { Icon } from './Icon';
import { localizePluginTitle } from './plugins-home/localization';
import { DesignSystemPicker } from './DesignSystemPicker';
import { PluginDetailsModal } from './PluginDetailsModal';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { ChatPane } from './ChatPane';
import type { QuestionFormOpenRequest } from './AssistantMessage';
import type { ChatSendMeta, ChatSendOutcome } from './ChatComposer';
import {
  CritiqueTheaterMount,
  useCritiqueTheaterEnabled,
} from './Theater';
import { useIframeKeepAlivePool } from './IframeKeepAlivePool';
import {
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedArtifact,
  selectAutoOpenTurnArtifact,
} from './auto-open-file';
import { buildRepoImportPrompt, designSystemNeedsRepoConnect } from './design-system-github-evidence';
import { isDesignSystemProject, resolveProjectDesignSystemId } from './design-system-project';
import { collectReferencedJsxNames } from '../runtime/jsx-module-refs';
import { KNOWN_PROVIDERS } from '../state/config';
import { DESIGN_SYSTEM_TAB, FileWorkspace, type BrowserOpenRequest } from './FileWorkspace';
import {
  type PluginFolderAgentAction,
} from './design-files/pluginFolderActions';
import { SHARE_TO_COMMUNITY_PROMPT } from './share-to-community/shareToCommunityPrompt';
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
import { buildContinueInCliToast } from '../lib/build-continue-in-cli-toast';
import { buildClipboardPrompt } from '../lib/build-clipboard-prompt';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { effectiveMaxTokens } from '../state/maxTokens';
import { effectiveAgentModelChoice } from './agentModelSelection';
import { mediaExecutionPolicyForProjectMetadata } from '../media/execution-policy';
import { mediaModelProviderId } from '../media/models';
import { byokProviderRequiresApiKey } from '../utils/byokProvider';
import {
  useByokImageModelOptions,
  useByokVideoModelOptions,
  useByokSpeechModelOptions,
} from '../media/aihubmix-image-models';
import {
  buildFinalizeCredentialsMissingToast,
  buildFinalizeRequest,
} from '../lib/resolve-finalize-request';

type BrandBrowserSnapshot =
  | { status: 'ready'; html: string; css: string; baseUrl: string }
  | { status: 'unavailable'; message: string }
  | { status: 'read-failed'; message: string };

type BrandBrowserSnapshotExtractionResult =
  | { status: 'handled' }
  | { status: 'miss'; message: string | null };

type ProjectChatSendMeta = ChatSendMeta & {
  queueOnly?: boolean;
  retryOfAssistantId?: string;
  sessionMode?: ChatSessionMode;
  /** Overrides the run_created / run_finished `entry_from` analytics prop for
   *  this send (e.g. 'resume_continue' from the resumable-failure Continue
   *  action). Behavior never depends on it; it only shapes PostHog props. */
  entryFrom?: ChatAnalyticsEntryFrom;
  /** Marks this send as the AI-optimize (deep enrichment) run so the daemon
   *  can emit design_system_enrich_result + flag the DS as ai_refined on
   *  success (tracking spec C14/C15). Daemon mode only. */
  dsEnrichment?: boolean;
  /** Marks a send replayed from the queued-sends drain. Its payload already
   *  lives in the queue item, so a pre-run block (e.g. the AMR balance gate)
   *  must NOT re-queue it — only pause further drains. */
  queueDrain?: boolean;
  /** The Open Design Cloud balance gate already ran for this exact send at
   *  the home submit (with any soft warning answered there); skip re-gating
   *  so the user is never double-prompted for one task. */
  amrGatePrechecked?: boolean;
};

export function mergeSavedPreviewComment(current: PreviewComment[], saved: PreviewComment): PreviewComment[] {
  const existingIndex = current.findIndex((comment) => comment.id === saved.id);
  if (existingIndex < 0) return [...current, saved];
  return current.map((comment, index) => (index === existingIndex ? saved : comment));
}

function mergeServerMessageWithLocal(server: ChatMessage, local?: ChatMessage): ChatMessage {
  if (!local) return server;
  const merged: ChatMessage = { ...server };
  if (local.role === 'assistant' && server.role === 'assistant') {
    if ((local.content?.length ?? 0) > (server.content?.length ?? 0)) {
      merged.content = local.content;
    }
    if ((local.events?.length ?? 0) > (server.events?.length ?? 0)) {
      merged.events = local.events;
    }
  }
  if (!server.producedFiles?.length && local.producedFiles?.length) {
    merged.producedFiles = local.producedFiles;
  }
  if (!server.preTurnFileNames?.length && local.preTurnFileNames?.length) {
    merged.preTurnFileNames = local.preTurnFileNames;
  }
  if (!server.lastRunEventId && local.lastRunEventId) {
    merged.lastRunEventId = local.lastRunEventId;
  }
  if (!server.startedAt && local.startedAt) {
    merged.startedAt = local.startedAt;
  }
  if (!server.endedAt && local.endedAt) {
    merged.endedAt = local.endedAt;
  }
  if (!server.runStatus && local.runStatus) {
    merged.runStatus = local.runStatus;
  }
  return merged;
}

export function mergeServerMessagesIntoConversation(
  current: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const merged = serverMessages.map((message) =>
    mergeServerMessageWithLocal(message, currentById.get(message.id)),
  );
  for (const message of current) {
    if (!serverIds.has(message.id)) merged.push(message);
  }
  return merged;
}

function ensureConversationPresent(
  conversations: Conversation[],
  conversationId: string,
  projectId: string,
): Conversation[] {
  if (conversations.some((conversation) => conversation.id === conversationId)) {
    return conversations;
  }
  const now = Date.now();
  return [
    {
      id: conversationId,
      projectId,
      title: null,
      createdAt: now,
      updatedAt: now,
    },
    ...conversations,
  ];
}

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

interface QueuedChatSend {
  id: string;
  conversationId: string;
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ProjectChatSendMeta;
  createdAt: number;
}

interface QueuedChatSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

let liveArtifactEventSequence = 0;
// The brand-extraction project's design-system (brand kit) preview tab. Mirrors
// the daemon `BRAND_KIT_FILE` (apps/daemon/src/brands/kit-render.ts); kept as a
// local literal to respect the web↔daemon boundary.
const BRAND_KIT_FILE = 'brand.html';
const BRAND_EMPTY_TRANSCRIPT_RETRY_DELAYS_MS = [120, 500, 1_200, 2_000] as const;
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';
const DEFAULT_CHAT_PANEL_WIDTH = 460;
const MIN_CHAT_PANEL_WIDTH = 345;
const MAX_CHAT_PANEL_WIDTH = 720;
const COMMENT_INSPECTOR_PANEL_WIDTH = 320;
const MIN_WORKSPACE_PANEL_WIDTH = 400;
const SPLIT_RESIZE_HANDLE_WIDTH = 8;
const BYOK_OPENCODE_UNAVAILABLE_MESSAGE =
  'BYOK API runs require OpenCode. Install OpenCode, then rescan local agents in Settings before retrying.';
const BEDROCK_BYOK_UNSUPPORTED_MESSAGE =
  'AWS Bedrock BYOK chat requires AWS credential signing and is not supported by the current API-key proxy.';
const CHAT_PANEL_KEYBOARD_STEP = 16;
const DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS = 2;
// Trailing-debounce window for the canonical (daemon + SQLite) tab-state write.
// Embedded-browser navigation bursts settle well within this; the local cache
// is written immediately so nothing is lost if the daemon write is coalesced.
const TAB_PERSIST_DEBOUNCE_MS = 400;
// The generic browser-side SSE reconnect-budget exhaustion message emitted by
// consumeDaemonRun when the daemon status fetch still shows the run as
// queued/running (providers/daemon.ts).  Both the live-stream onError and the
// reattach-stream onError share this message; neither constitutes an
// authoritative terminal failure.  Use isGenericDaemonDisconnect() at both
// sites so generic disconnects stay eligible for attachRecoverableRuns to
// re-query daemon authoritative status on the next tick.
function isGenericDaemonDisconnect(err: unknown): boolean {
  return err instanceof Error && (
    (err as Error & { code?: string }).code === GENERIC_DAEMON_DISCONNECT_CODE ||
    err.message === GENERIC_DAEMON_DISCONNECT_MESSAGE
  );
}

// A persisted status/error event represents a generic daemon disconnect when
// either its structured `code` matches GENERIC_DAEMON_DISCONNECT_CODE, OR
// (legacy rows persisted before this code was introduced) its `detail`
// equals the canonical GENERIC_DAEMON_DISCONNECT_MESSAGE with no code set.
// Mirrors isGenericDaemonDisconnect() above, which checks the equivalent
// code-or-message pair on live Error objects for the same reason.
function hasGenericDisconnectFailureEvent(message: ChatMessage): boolean {
  return (message.events ?? []).some(
    (event) =>
      event.kind === 'status' &&
      event.label === 'error' &&
      (event.code === GENERIC_DAEMON_DISCONNECT_CODE ||
        event.detail === GENERIC_DAEMON_DISCONNECT_MESSAGE),
  );
}
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

function brandExtractionPreviewFileName(projectFiles: readonly ProjectFile[]): string {
  return (
    projectFiles.find((file) => file.name === 'brand.html')?.name ??
    projectFiles.find((file) => file.name.endsWith('/brand.html'))?.name ??
    'brand.html'
  );
}

function buildBrandAgentExtractionContinuationPrompt(input: {
  promptSeed?: string | null;
  metadata?: ProjectMetadata | null;
  projectFiles: readonly ProjectFile[];
}): string {
  const trimmed = input.promptSeed?.trim() ?? '';
  const brandId = input.metadata?.brandId?.trim() || '(current brand id)';
  const sourceUrl = input.metadata?.brandSourceUrl?.trim() || 'the source website';
  const base = /DESIGN SYSTEM EXTRACTION|ready design system is NOT guaranteed/i.test(trimmed)
    ? trimmed
    : [
        `Continue the AI design-system extraction for ${sourceUrl}.`,
        `Brand id: ${brandId}`,
        '',
        'The programmatic pass has not produced a ready design system yet. Continue from the current brand.html scaffold and saved project files; do not assume the design system is ready, and do not create a duplicate design-system id.',
        '',
        'Inspect brand.html, brand.json, DESIGN.md, BRAND.md, context/, logos/, imagery/, fonts/, and system assets. Measure the source website when reachable. If the live page is an anti-bot verification interstitial, ask the user to clear it in the Browser tab before continuing.',
        '',
        `Write valid partial brand.json updates progressively, run od brand preview ${brandId} after meaningful field groups, then run od brand finalize ${brandId} when the kit is complete. Fix validation errors and keep updating the same registered design system in place.`,
      ].join('\n');
  const visibleFiles = input.projectFiles
    .filter((file) => file.name.trim())
    .slice(0, 80)
    .map((file) => `  - ${file.name}${file.size > 0 ? ` (${Math.round(file.size / 1024)}KB)` : ''}`);
  if (visibleFiles.length === 0 || base.includes('Current brand extraction continuation context:')) {
    return base;
  }
  return [
    base,
    '',
    'Current brand extraction continuation context:',
    `- Source URL: ${sourceUrl}`,
    `- Brand id: ${brandId}`,
    '- Files visible in the project right now:',
    ...visibleFiles,
  ].join('\n');
}

function designSystemNameForSourceProject(project: Project): string {
  const sourceName = project.name.trim() || 'Untitled';
  return /\bdesign system\b/i.test(sourceName)
    ? sourceName
    : `${sourceName} Design System`;
}

function buildCreateDesignSystemFromProjectPrompt(input: {
  project: Project;
  projectFiles: readonly ProjectFile[];
  activeDesignSystem?: DesignSystemSummary | null;
}): string {
  const visibleFiles = input.projectFiles
    .filter((file) => file.name.trim())
    .slice(0, 140)
    .map((file) => `  - ${file.name}${file.size > 0 ? ` (${Math.round(file.size / 1024)}KB)` : ''}`);
  const metadataJson = input.project.metadata
    ? JSON.stringify(input.project.metadata, null, 2)
    : '{}';
  const activeDesignSystem = input.activeDesignSystem
    ? [
        `- Active design system id: ${input.activeDesignSystem.id}`,
        `- Active design system title: ${input.activeDesignSystem.title}`,
      ]
    : ['- Active design system: (none)'];
  return [
    'Create this project as a complete Open Design design system workspace.',
    '',
    'Autonomy requirement:',
    '- Do not ask setup or clarification questions during design-system generation.',
    '- Do not emit `<question-form>`, "Quick brief — 30 seconds", direction cards, choice cards, or any UI that waits for user input.',
    '- The source project already contains the evidence. Choose sensible defaults where details are missing and begin generating the design-system artifacts immediately.',
    '',
    'Source project handoff:',
    `- Source project id: ${input.project.id}`,
    `- Source project name: ${input.project.name}`,
    ...activeDesignSystem,
    '- Read `context/source-context.md` first. It lists the copied project files and original project metadata.',
    '- Treat every copied file, uploaded asset, reference image, browser snapshot, sketch, generated artifact, and context note in this workspace as design-system evidence.',
    '- Use the copied project outputs to infer real visual language, components, layout, interaction patterns, copy tone, tokens, typography, spacing, assets, and anti-patterns.',
    '- Do not create another project or another design-system id. Update this new design-system project in place.',
    '',
    'Source project metadata:',
    '```json',
    metadataJson,
    '```',
    '',
    'Visible copied files to inspect:',
    ...(visibleFiles.length > 0 ? visibleFiles : ['  - (none listed yet; rely on context/source-context.md after the copy finishes)']),
    input.projectFiles.length > visibleFiles.length
      ? `  - ...and ${input.projectFiles.length - visibleFiles.length} more files listed in context/source-context.md`
      : '',
    '',
    'Expected output:',
    '- A clear `DESIGN.md` with product context, visual foundations, color, type, spacing, layout, components, motion, voice, and anti-patterns.',
    '- A reusable package: `README.md`, `SKILL.md`, `colors_and_type.css`, provenance notes, `assets/`, `build/` when runtime icons exist, optional `fonts/`, focused `preview/` cards, preserved source examples, and `ui_kits/app/`.',
    '- Preserve real source assets when evidence provides them: logos, app icons, tray icons, avatars, wordmarks, imagery, and font files belong in `assets/`, `build/`, or `fonts/`, not only in prose.',
    '- Preserve high-signal source/component examples outside `context/` when copied files include substantial implementation or artifact code. Do not replace them with tiny stubs.',
    '- Split review previews into focused cards for colors, typography, spacing, radius/shadows, components, brand assets, and applied UI surfaces. Preview cards must visibly load preserved files when available.',
    '- Build `ui_kits/app/` as an applied interface kit that reflects the source project, with an index page and component files when the evidence supports them. Do not leave it as a generic static mock.',
    '- Keep `README.md`, `SKILL.md`, `DESIGN.md`, preview manifest text, and `ui_kits/app/README.md` synchronized with the final file structure.',
    '',
    'Completion gate:',
    '- Finish only after the project contains reviewable design-system artifacts and the right-side Design System tab can inspect them.',
    '- Before your final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`.',
    '- Fix every audit error and design-quality warning. If an issue cannot be fixed because source evidence is missing, explain that blocker instead of claiming the design system is ready.',
    '',
    'When finished, summarize the generated files and name the first previews reviewers should inspect.',
  ].filter(Boolean).join('\n');
}

function chatAttachmentsFromPreviewCommentImages(
  images: PreviewCommentAttachment[] | undefined,
): ChatAttachment[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const image of images) {
    const path = image.path.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      name: image.name.trim() || path.split('/').pop() || path,
      kind: 'image',
    });
  }
  return out;
}

function mergeChatAttachments(...groups: ChatAttachment[][]): ChatAttachment[] {
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const group of groups) {
    for (const attachment of group) {
      const path = attachment.path.trim();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({ ...attachment, path });
    }
  }
  return out;
}

function historyWithWorkspaceContext(
  history: ChatMessage[],
  messageId: string,
  context: ChatSendMeta['context'] | undefined,
): ChatMessage[] {
  const items = context?.workspaceItems ?? [];
  if (items.length === 0) return history;
  const block = [
    '',
    '',
    '<active-workspace-context>',
    'Open Design selected or inferred these workspace contexts for this turn. Treat absolute paths as reference context unless the user explicitly asks to edit them.',
    ...items.map((item, index) => {
      const details = [
        item.path ? `path: ${item.path}` : null,
        item.absolutePath ? `absolute: ${item.absolutePath}` : null,
        item.url ? `url: ${item.url}` : null,
        item.title ? `title: ${item.title}` : null,
        item.tabId ? `tab: ${item.tabId}` : null,
      ].filter(Boolean).join(' | ');
      return `${index + 1}. ${item.kind}: ${item.label}${details ? ` | ${details}` : ''}`;
    }),
    '</active-workspace-context>',
  ].join('\n');
  return history.map((message) =>
    message.id === messageId && message.role === 'user'
      ? { ...message, content: `${message.content}${block}` }
      : message,
  );
}

function commentTaskQuery(attachment: ChatCommentAttachment): string {
  return (attachment.comment ?? '').trim();
}

function commentTaskContextAttachment(attachment: ChatCommentAttachment): ChatCommentAttachment {
  return {
    ...attachment,
    comment: '',
    commentContext: 'query',
  };
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

function autoSendContextKey(projectId: string): string {
  return `od:auto-send-context:${projectId}`;
}

/** Set by the home create flow when its submit already ran the Open Design
 * Cloud balance gate — the first auto-send must not re-prompt the user. */
function autoSendAmrGateOkKey(projectId: string): string {
  return `od:auto-send-amr-gate-ok:${projectId}`;
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

function readAutoSendContext(projectId: string): RunContextSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(autoSendContextKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isStoredRunContextSelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clearAutoSendSession(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(autoSendFirstMessageKey(projectId));
    window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
    window.sessionStorage.removeItem(autoSendContextKey(projectId));
    window.sessionStorage.removeItem(autoSendAmrGateOkKey(projectId));
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
    (record.size === undefined || typeof record.size === 'number') &&
    (record.order === undefined || typeof record.order === 'number')
  );
}

function isStoredStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStoredWorkspaceContextItem(value: unknown): value is WorkspaceContextItem {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.kind === 'string' &&
    record.kind.length > 0 &&
    typeof record.label === 'string' &&
    record.label.length > 0 &&
    (record.tabId === undefined || typeof record.tabId === 'string') &&
    (record.path === undefined || typeof record.path === 'string') &&
    (record.absolutePath === undefined || typeof record.absolutePath === 'string') &&
    (record.url === undefined || typeof record.url === 'string') &&
    (record.title === undefined || typeof record.title === 'string')
  );
}

function isStoredRunContextSelection(value: unknown): value is RunContextSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.skillIds === undefined || isStoredStringArray(record.skillIds)) &&
    (record.pluginIds === undefined || isStoredStringArray(record.pluginIds)) &&
    (record.mcpServerIds === undefined || isStoredStringArray(record.mcpServerIds)) &&
    (record.connectorIds === undefined || isStoredStringArray(record.connectorIds)) &&
    (
      record.workspaceItems === undefined ||
      (Array.isArray(record.workspaceItems) &&
        record.workspaceItems.every(isStoredWorkspaceContextItem))
    )
  );
}

function fallbackDesignSystemSummaryForProject(
  project: Project,
  designSystemId: string | null,
): DesignSystemSummary | null {
  if (!designSystemId || !isDesignSystemProject(project)) return null;
  const metadata = project.metadata;
  const sourceUrl = metadata?.brandSourceUrl?.trim() || null;
  const title =
    metadata?.sourceFileName?.trim()
    || project.name.replace(/\s+Design System\s*$/i, '').trim()
    || project.name
    || 'Design system';
  return {
    id: designSystemId,
    title,
    category: 'Brands',
    summary: sourceUrl ? `Draft design system extracted from ${sourceUrl}.` : '',
    swatches: [],
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    projectId: project.id,
    ...(sourceUrl
      ? { provenance: { sourceUrls: [sourceUrl], sourceNotes: `Extracting from ${sourceUrl}` } }
      : {}),
  };
}

function isBrandStatusValue(value: unknown): value is BrandStatus {
  return value === 'extracting' || value === 'needs_input' || value === 'ready' || value === 'failed';
}

function brandExtractionAllowsEditing(status: BrandStatus | null): boolean {
  return status === 'ready' || status === 'failed';
}

function normalizedBrandBrowserHost(parsed: URL): string {
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return parsed.port ? `${hostname}:${parsed.port}` : hostname;
}

type BrowserExtractionUrlParts = {
  host: string;
  pathname: string;
  search: string;
};

function normalizedBrandBrowserPathname(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

function browserExtractionUrlParts(value: string | null | undefined): BrowserExtractionUrlParts | null {
  const url = value?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: normalizedBrandBrowserHost(parsed),
      pathname: normalizedBrandBrowserPathname(parsed.pathname),
      search: parsed.search,
    };
  } catch {
    return null;
  }
}

function isBrandBrowserHomeRedirectPath(pathname: string): boolean {
  if (pathname === '/home') return true;
  return /^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(pathname);
}

function brandBrowserSnapshotMatchesSource(
  snapshotBaseUrl: string,
  sourceUrl: string | null | undefined,
): boolean {
  const snapshot = browserExtractionUrlParts(snapshotBaseUrl);
  const source = browserExtractionUrlParts(sourceUrl);
  if (!snapshot || !source || snapshot.host !== source.host) return false;
  if (snapshot.pathname === source.pathname && snapshot.search === source.search) return true;
  return (
    source.pathname === '/'
    && source.search === ''
    && snapshot.search === ''
    && isBrandBrowserHomeRedirectPath(snapshot.pathname)
  );
}

function workspaceContextItemEqual(
  a: WorkspaceContextItem | null,
  b: WorkspaceContextItem | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.label === b.label &&
    (a.tabId ?? '') === (b.tabId ?? '') &&
    (a.path ?? '') === (b.path ?? '') &&
    (a.absolutePath ?? '') === (b.absolutePath ?? '') &&
    (a.url ?? '') === (b.url ?? '') &&
    (a.title ?? '') === (b.title ?? '')
  );
}

function workspaceContextItemsEqual(
  a: WorkspaceContextItem[],
  b: WorkspaceContextItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => workspaceContextItemEqual(item, b[index] ?? null));
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

// React key for the on-screen question form. Deliberately does NOT include the
// form's parsed `id`: there is at most one (first) form per assistant message,
// so `${conversation}:${message}` is already a stable, unique identity for the
// occurrence. Folding the parsed id in would remount the panel mid-stream — the
// preview shows the `discovery` fallback until the body `id` streams in, and a
// form that emits answerable questions before its `id` would flip identity
// while the user is mid-answer, dropping their selections. A distinct later
// form lives in a different assistant message, so it still gets its own key
// (and replays the reveal) without relying on the id.
export function buildQuestionFormKey(
  conversationId: string | null,
  assistantMessageId: string | null,
  hasForm: boolean,
): string | null {
  return conversationId && assistantMessageId && hasForm
    ? `${conversationId}:${assistantMessageId}`
    : null;
}

type ProjectSplitStyle = CSSProperties & {
  '--project-chat-panel-width': string;
  '--project-workspace-panel-track': string;
};

export function projectSplitStyle(
  workspaceFocused: boolean,
  chatPanelWidth: number,
  workspacePanelTrack: string,
): ProjectSplitStyle | undefined {
  if (workspaceFocused) return undefined;
  return {
    '--project-chat-panel-width': `${chatPanelWidth}px`,
    '--project-workspace-panel-track': workspacePanelTrack,
    gridTemplateColumns: `${chatPanelWidth}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`,
  };
}

function applySplitChatPanelWidth(
  split: HTMLDivElement | null,
  width: number,
  workspacePanelTrack: string,
): void {
  if (!split) return;
  split.style.setProperty('--project-chat-panel-width', `${width}px`);
  split.style.gridTemplateColumns =
    `${width}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`;
}

// The media model the user picked in the New Project → Media dialog, keyed by
// surface. For BYOK providers (AIHubMix) media is produced by the generate_*
// chat tools whose default model comes from the per-request byok*Model field —
// NOT the `od media generate` dispatcher — so without this seed the dialog pick
// is dropped and the conversation falls back to the Settings default. Returns
// undefined for non-media projects (and when the field is empty) so callers fall
// back to the Settings default exactly as before. The daemon re-validates the id
// against the active provider's registry, so a mismatched pick is safely ignored.
function projectMediaModelSeed(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
): string | undefined {
  if (!metadata) return undefined;
  if (surface === 'image' && metadata.kind === 'image') {
    return metadata.imageModel?.trim() || undefined;
  }
  if (surface === 'video' && metadata.kind === 'video') {
    return metadata.videoModel?.trim() || undefined;
  }
  if (surface === 'speech' && metadata.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.audioModel?.trim() || undefined;
  }
  return undefined;
}

function projectMediaVoiceSeed(
  metadata: ProjectMetadata | null | undefined,
): string | undefined {
  if (metadata?.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.voice?.trim() || undefined;
  }
  return undefined;
}

// Carry the creation-time model pick into the conversation ONLY when it belongs
// to the active BYOK provider. Guards against clobbering a user's Settings
// default with a model from a different provider — e.g. a SenseAudio user whose
// image project was created with the dialog's default `gpt-image-2` keeps their
// configured SenseAudio model instead of being forced to the registry default.
// AIHubMix's live (`aihubmix-` prefixed) ids resolve via mediaModelProviderId
// without waiting on the async catalogue, so the AIHubMix path still seeds.
function byokModelSeedForProtocol(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
  protocol: string | undefined,
): string | undefined {
  const picked = projectMediaModelSeed(metadata, surface);
  if (!picked) return undefined;
  return mediaModelProviderId(picked) === protocol ? picked : undefined;
}

function firstNonBlank(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? '';
}

function byokMediaDefaultsForRun(input: {
  imageModelOverride: string;
  videoModelOverride: string;
  speechModelOverride: string;
  speechVoiceOverride: string;
  config: Pick<AppConfig, 'byokImageModel' | 'byokVideoModel' | 'byokSpeechModel' | 'byokSpeechVoice'>;
  imageModelOptions: readonly { id: string }[];
  videoModelOptions: readonly { id: string }[];
  speechModelOptions: readonly { id: string }[];
}): ByokMediaDefaults {
  const imageModel = firstNonBlank(
    input.imageModelOverride,
    input.config.byokImageModel,
    input.imageModelOptions[0]?.id,
  );
  const videoModel = firstNonBlank(
    input.videoModelOverride,
    input.config.byokVideoModel,
    input.videoModelOptions[0]?.id,
  );
  const speechModel = firstNonBlank(
    input.speechModelOverride,
    input.config.byokSpeechModel,
    input.speechModelOptions[0]?.id,
  );
  const speechVoice = firstNonBlank(
    input.speechVoiceOverride,
    input.config.byokSpeechVoice,
  );
  return {
    ...(imageModel ? { imageModel } : {}),
    ...(videoModel ? { videoModel } : {}),
    ...(speechModel ? { speechModel } : {}),
    ...(speechVoice ? { speechVoice } : {}),
  };
}

function byokOpenCodeProviderFromConfig(
  config: AppConfig,
): ByokChatProviderConfig | undefined {
  const selectedProvider = selectedKnownProviderForConfig(config);
  if (
    !isOpenCodeByokChatProtocol(config.apiProtocol) ||
    (byokProviderRequiresApiKey(config.apiProtocol, selectedProvider, config.baseUrl) && !config.apiKey.trim())
  ) {
    return undefined;
  }
  return {
    protocol: config.apiProtocol,
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl,
    model: config.model,
    ...(selectedProvider?.requiresApiKey === false ? { requiresApiKey: false } : {}),
    apiVersion:
      config.apiProtocol === 'azure'
        ? config.apiVersion ?? ''
        : '',
  };
}

function selectedKnownProviderForConfig(config: AppConfig) {
  if (!config.apiProtocol) return undefined;
  return KNOWN_PROVIDERS.find(
    (provider) =>
      provider.protocol === config.apiProtocol &&
      provider.baseUrl === config.baseUrl &&
      (config.apiProviderBaseUrl == null || provider.baseUrl === config.apiProviderBaseUrl),
  );
}

function isOpenCodeByokChatProtocol(
  protocol: AppConfig['apiProtocol'],
): protocol is ByokChatProtocol {
  return (
    protocol === 'anthropic' ||
    protocol === 'openai' ||
    protocol === 'azure' ||
    protocol === 'google' ||
    protocol === 'ollama' ||
    protocol === 'senseaudio' ||
    protocol === 'aihubmix'
  );
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

function artifactWithHtml(
  artifact: Artifact | null,
  fallbackIdentifier: string,
  html: string,
): Artifact {
  return artifact
    ? { ...artifact, html }
    : {
        identifier: fallbackIdentifier,
        title: '',
        html,
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
  // Website-clone turns reproduce a whole multi-page site; auto-open should
  // land on the site entry (index.html), not the last-written subpage. See
  // `SelectAutoOpenOptions.preferSiteEntry`.
  const autoOpenArtifactOptions = {
    preferSiteEntry: currentProject.metadata?.intent === 'web-clone',
  };
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
  const mountedRef = useRef(true);
  const trackedTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timer of trackedTimeoutsRef.current) clearTimeout(timer);
      trackedTimeoutsRef.current.clear();
    };
  }, []);

  const scheduleProjectTimeout = useCallback((callback: () => void, delayMs: number) => {
    if (!mountedRef.current) return null;
    const timer = setTimeout(() => {
      trackedTimeoutsRef.current.delete(timer);
      if (!mountedRef.current) return;
      callback();
    }, delayMs);
    trackedTimeoutsRef.current.add(timer);
    return timer;
  }, []);

  const clearProjectTimeout = useCallback((timer: ReturnType<typeof setTimeout> | null) => {
    if (timer == null) return;
    clearTimeout(timer);
    trackedTimeoutsRef.current.delete(timer);
  }, []);

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
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );
  const activeSessionMode = activeConversation?.sessionMode ?? 'design';
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null);
  const [failedMessagesConversationId, setFailedMessagesConversationId] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [messageLoadRetryNonce, setMessageLoadRetryNonce] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
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
  // Per-session override for the BYOK chat's generate_image tool. Seeded once
  // from the New Project → Media model pick (project.metadata.imageModel) — but
  // only when that pick belongs to the active BYOK provider (see
  // byokModelSeedForProtocol) — falling back to the Settings default
  // (config.byokImageModel) otherwise. Subsequent selections live only in this
  // component's state — page refresh / project switch resets to this seed.
  // Persistent defaults live in Settings → BYOK → Image generation model.
  const [byokImageModelOverride, setByokImageModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'image', config.apiProtocol) ?? config.byokImageModel ?? '',
  );
  // Same per-session override for the BYOK chat's generate_video tool, seeded
  // from the project's videoModel pick (provider-gated), then Settings.
  const [byokVideoModelOverride, setByokVideoModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'video', config.apiProtocol) ?? config.byokVideoModel ?? '',
  );
  // Same per-session overrides for the BYOK chat's generate_speech tool (model +
  // voice), seeded from the project's speech pick (provider-gated), then Settings.
  const [byokSpeechModelOverride, setByokSpeechModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'speech', config.apiProtocol) ?? config.byokSpeechModel ?? '',
  );
  // Voice only carries when the speech model itself is carried (same provider),
  // so a cross-provider voice id never leaks into the request.
  const [byokSpeechVoiceOverride, setByokSpeechVoiceOverride] = useState<string>(
    () => (byokModelSeedForProtocol(project.metadata, 'speech', config.apiProtocol)
      ? projectMediaVoiceSeed(project.metadata)
      : undefined) ?? config.byokSpeechVoice ?? '',
  );
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
    scope?: 'chat-pane';
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
    {
      snapshot: AmrWalletSnapshot;
      resolve: (decision: AmrLowBalanceDecision) => void;
    } | null
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
  // Artifact context for the header actions (settings gear, handoff) that live
  // in this workspace's header alongside FileViewer's present/share/download.
  // Mirrors the artifact_id / artifact_kind that FileViewer attaches, derived
  // from the currently-active file tab, so all artifact_header analytics carry
  // the same dimensions. Undefined on non-file tabs (e.g. the file list).
  const headerArtifact = useMemo<{
    artifact_id?: string;
    artifact_kind?: TrackingArtifactKind;
  }>(() => {
    const activeName = openTabsState.active;
    const file = activeName
      ? projectFiles.find((entry) => entry.name === activeName) ?? null
      : null;
    if (!file) return {};
    return {
      artifact_id: anonymizeArtifactId({ projectId: project.id, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    };
  }, [openTabsState.active, projectFiles, project.id]);
  const routeFileNameRef = useRef(routeFileName);
  routeFileNameRef.current = routeFileName;
  const [activeWorkspaceContext, setActiveWorkspaceContext] =
    useState<WorkspaceContextItem | null>(null);
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContextItem[]>([]);
  const tabsLoadedRef = useRef(false);
  const tabsHydratedFromSavedStateRef = useRef(false);
  const [tabsHydrationVersion, setTabsHydrationVersion] = useState(0);
  const hasAppliedInitialPrimaryOpenRef = useRef(false);
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
  // A locally finished run briefly has terminal status before its async
  // project-file refresh attaches delivery evidence. Do not let that same
  // browser session reattach the run during this handoff; reattach remains
  // the recovery path after a reload, where this in-memory set is empty.
  const finalizingLocalRunIdsRef = useRef<Set<string>>(new Set());
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
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    setChatSeed(null);
    setAutoAuditRepairSeed(null);
    const restored = loadQueuedChatSends(project.id);
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
  const [creatingConversation, setCreatingConversation] = useState(false);
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
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [messages]);
  const lastAssistantContent =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.content ?? '' : '';
  const lastAssistantMessageId =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.id ?? null : null;
  const questionForm: QuestionForm | null = useMemo(
    () => findFirstQuestionForm(lastAssistantContent)?.form ?? null,
    [lastAssistantContent],
  );
  const questionFormSubmittedAnswers = useMemo(() => {
    if (!questionForm) return undefined;
    for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (m?.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(questionForm, m.content ?? '');
      if (parsed) return parsed;
    }
    return undefined;
  }, [questionForm, lastAssistantIndex, messages]);
  const questionsGenerating =
    currentConversationStreaming && hasUnterminatedQuestionForm(lastAssistantContent);
  // While the form is still streaming, parse it tolerantly so the Questions tab
  // can show a frame (title) immediately and fill questions in as they arrive.
  const questionFormPreview = useMemo(
    () => (questionsGenerating ? parsePartialQuestionForm(lastAssistantContent) : null),
    [questionsGenerating, lastAssistantContent],
  );
  // The active (latest, unanswered) form stays editable the whole time it's on
  // screen — while it streams in AND while the turn is still busy — so it never
  // flickers between the locked (grey) and interactive (accent) styles.
  // Submission is gated separately by the panel via `submitDisabled`/generating.
  const questionFormActive =
    (!!questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Mirror `questionFormActive`'s unanswered gate: once the user answers, the
  // Questions tab closes, so the auto-focus nonce must not treat an answered
  // form as a freshly appeared one.
  const hasQuestions =
    Boolean(questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Stable identity for the current form occurrence, used to remember that its
  // one-by-one reveal already played. Keyed on the conversation + the hosting
  // assistant message id (not the message index, and NOT the parsed form id —
  // see buildQuestionFormKey). The assistant message id is allocated once and
  // kept in place across the streaming→persisted swap (same `assistantId`
  // throughout), so it survives the brief unmount/re-focus of the Questions tab
  // without replaying the animation, yet differs for every distinct form
  // occurrence (each lives in its own assistant message).
  const questionFormKey = useMemo(
    () =>
      buildQuestionFormKey(
        activeConversationId,
        lastAssistantMessageId,
        Boolean(questionForm ?? questionFormPreview),
      ),
    [activeConversationId, lastAssistantMessageId, questionForm, questionFormPreview],
  );

  // Release #3661: let a past question form be manually re-opened in the
  // Questions panel. Layered on top of main's stable questionFormKey (#3644) —
  // the `displayed*` values fall back to the live form when nothing is manually
  // pinned, so both fixes coexist.
  const [manualQuestionFormRequest, setManualQuestionFormRequest] =
    useState<QuestionFormOpenRequest | null>(null);
  useEffect(() => {
    setManualQuestionFormRequest(null);
  }, [project.id, activeConversationId]);
  useEffect(() => {
    if (hasQuestions && questionFormKey) setManualQuestionFormRequest(null);
  }, [hasQuestions, questionFormKey]);
  const displayedQuestionForm = manualQuestionFormRequest?.form ?? questionForm;
  const displayedQuestionFormPreview = manualQuestionFormRequest ? null : questionFormPreview;
  const displayedQuestionFormSubmittedAnswers =
    manualQuestionFormRequest?.submittedAnswers ?? questionFormSubmittedAnswers;
  const displayedQuestionFormActive = manualQuestionFormRequest ? false : questionFormActive;
  const displayedQuestionsGenerating = manualQuestionFormRequest ? false : questionsGenerating;
  const displayedQuestionFormKey = manualQuestionFormRequest
    ? `${activeConversationId ?? 'conversation'}:${manualQuestionFormRequest.messageId}:${manualQuestionFormRequest.form.id}:manual`
    : questionFormKey;

  // Auto-switch the workspace to the Questions tab when a new discovery form
  // first appears, and let the chat banner re-focus it on click. The nonce
  // bump is what FileWorkspace listens to.
  const [questionsFocusNonce, setQuestionsFocusNonce] = useState(0);
  const prevHasQuestionsRef = useRef(false);
  useEffect(() => {
    if (hasQuestions && !prevHasQuestionsRef.current) {
      setQuestionsFocusNonce((n) => n + 1);
    }
    prevHasQuestionsRef.current = hasQuestions;
  }, [hasQuestions]);
  const focusQuestionsRequest = useMemo(
    () => (questionsFocusNonce > 0 ? { nonce: questionsFocusNonce } : null),
    [questionsFocusNonce],
  );
  const submittedAnswersForQuestionFormRequest = useCallback((request: QuestionFormOpenRequest) => {
    const assistantIndex = messages.findIndex((m) => m.id === request.messageId);
    if (assistantIndex < 0) return null;
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === 'assistant') break;
      if (m.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(request.form, m.content ?? '');
      if (parsed) return parsed;
    }
    return null;
  }, [messages]);
  const openQuestionsTab = useCallback((request?: QuestionFormOpenRequest) => {
    if (request) {
      const opensCurrentLiveForm =
        request.messageId === lastAssistantMessageId
        && questionForm?.id === request.form.id
        && questionFormSubmittedAnswers === undefined;
      if (opensCurrentLiveForm) {
        setManualQuestionFormRequest(null);
      } else {
        setManualQuestionFormRequest({
          ...request,
          submittedAnswers:
            request.submittedAnswers ?? submittedAnswersForQuestionFormRequest(request) ?? undefined,
        });
      }
    }
    setQuestionsFocusNonce((n) => n + 1);
  }, [
    lastAssistantMessageId,
    questionForm,
    questionFormSubmittedAnswers,
    submittedAnswersForQuestionFormRequest,
  ]);

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
    setArtifact(null);
    savedArtifactRef.current = null;
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

  const notifyCompletedRun = useCallback((last: ChatMessage) => {
    // Round 7 (mrcfps @ useDesignMdState.ts:131): a chat turn just
    // settled — conversation updatedAt almost certainly moved, so
    // recompute DESIGN.md staleness even when the turn produced no
    // file mutations or live artifacts.
    setDesignMdRefreshKey((n) => n + 1);

    const status =
      last.resultDeliveryState === 'no_result' ||
      last.resultDeliveryState === 'delivery_failed'
        ? 'failed'
        : last.runStatus;
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
      if (message.runStatus === 'succeeded' && designDeliveryVerificationPending(message)) continue;
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
    setOpenTabsState({ tabs: [], active: null });
    (async () => {
      const state = await loadTabs(project.id);
      if (cancelled) return;
      const routeActive = routeFileNameRef.current;
      let nextState = routeActive
        ? {
            ...state,
            tabs: state.tabs.includes(routeActive)
              ? state.tabs
              : [...state.tabs, routeActive],
            active: routeActive,
          }
        : state;
      if (routeActive) {
        nextState = cacheTabsLocally(project.id, nextState);
        void persistTabsToDaemonNow(project.id, nextState);
      }
      tabsHydratedFromSavedStateRef.current = state.hasSavedState === true;
      setOpenTabsState(nextState);
      tabsLoadedRef.current = true;
      setTabsHydrationVersion((version) => version + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Debounce the canonical (daemon + SQLite) tab-state write. The embedded
  // browser fans out url/title/favicon updates in bursts on a single page load
  // (did-navigate, did-navigate-in-page, page-title-updated, favicon), and each
  // used to be a localStorage write + HTTP PUT + SQLite UPDATE + re-render.
  // We keep React state and the local cache IMMEDIATE (so the UI and a reload
  // are never stale) and coalesce only the daemon PUT.
  const tabsDaemonSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDaemonTabsRef = useRef<OpenTabsState | null>(null);
  const flushTabsDaemonSave = useCallback(() => {
    if (tabsDaemonSaveTimerRef.current != null) {
      clearTimeout(tabsDaemonSaveTimerRef.current);
      tabsDaemonSaveTimerRef.current = null;
    }
    const pending = pendingDaemonTabsRef.current;
    pendingDaemonTabsRef.current = null;
    if (pending) void persistTabsToDaemonNow(project.id, pending);
  }, [project.id]);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      setOpenTabsState(next);
      if (!tabsLoadedRef.current) return;
      // Immediate, cheap, synchronous — keeps the cache canonical for reload.
      const stamped = cacheTabsLocally(project.id, next);
      pendingDaemonTabsRef.current = stamped;
      if (tabsDaemonSaveTimerRef.current != null) {
        clearTimeout(tabsDaemonSaveTimerRef.current);
      }
      tabsDaemonSaveTimerRef.current = setTimeout(() => {
        tabsDaemonSaveTimerRef.current = null;
        const pending = pendingDaemonTabsRef.current;
        pendingDaemonTabsRef.current = null;
        if (pending) void persistTabsToDaemonNow(project.id, pending);
      }, TAB_PERSIST_DEBOUNCE_MS);
    },
    [project.id],
  );

  // Flush any pending tab write when the project changes or the view unmounts,
  // so a fast project switch / close doesn't leave the daemon a debounce behind.
  useEffect(() => flushTabsDaemonSave, [flushTabsDaemonSave]);

  const handleActiveWorkspaceContextChange = useCallback((next: WorkspaceContextItem | null) => {
    setActiveWorkspaceContext((current) =>
      workspaceContextItemEqual(current, next) ? current : next,
    );
  }, []);

  const handleWorkspaceContextsChange = useCallback((next: WorkspaceContextItem[]) => {
    // This runs in a post-commit effect inside FileWorkspace: on any tab
    // mutation the workspace-context set changes and this setState schedules a
    // SECOND full render of the entire ProjectView -> FileWorkspace ->
    // FileViewer tree, on top of the tab-state render that triggered it. The
    // result only feeds the composer's @-mention context picker, which never
    // needs to update in the same frame the user closes a tab. Marking it as a
    // transition lets the urgent tab-close render commit first (tab disappears
    // immediately) and defers this heavy second pass so it no longer stalls the
    // interaction.
    startTransition(() => {
      setWorkspaceContexts((current) =>
        workspaceContextItemsEqual(current, next) ? current : next,
      );
    });
  }, []);

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
          if (savedArtifactRef.current === pointerTarget) {
            return { ok: true as const, fileName: pointerTarget };
          }
          savedArtifactRef.current = pointerTarget;
          requestOpenFile(pointerTarget);
          return { ok: true as const, fileName: pointerTarget };
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
          const message =
            `Refused to save artifact "${art.identifier || art.title || 'untitled'}": ` +
            validation.reason;
          setError(message);
          return { ok: false as const, error: message };
        }
      }
      if (savedArtifactRef.current === fileName) {
        return { ok: true as const, fileName };
      }
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
        return { ok: true as const, fileName: file.name };
      } else {
        // writeProjectTextFile collapses all failure paths (non-OK HTTP
        // responses, network errors, and stub-guard 422s) to null — the
        // helper's return contract would need to be widened to distinguish
        // them, which is out of scope here.  Show a generic banner so the
        // failure is observable rather than silent; the daemon logs carry
        // the structured details for any specific error type.
        // Clear the saved-artifact ref so the user can retry.
        savedArtifactRef.current = '';
        const message =
          `Couldn't save artifact "${fileName}". The write failed — ` +
          'check the daemon logs for details.';
        setError(message);
        return { ok: false as const, error: message };
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

  const refreshConversationMessagesFromServer = useCallback(
    async (conversationId: string) => {
      if (messagesConversationIdRef.current !== conversationId) return;
      try {
        const serverMessages = await listMessages(project.id, conversationId);
        if (messagesConversationIdRef.current !== conversationId) return;
        setMessages((current) => mergeServerMessagesIntoConversation(current, serverMessages));
        setMessagesInitialized(true);
        setMessagesConversationId(conversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        console.warn('Failed to refresh conversation messages after run completion', err);
      }
    },
    [project.id],
  );

  const scheduleConversationMessageRefresh = useCallback(
    (conversationId: string) => {
      scheduleProjectTimeout(() => {
        void refreshConversationMessagesFromServer(conversationId);
      }, 150);
    },
    [refreshConversationMessagesFromServer, scheduleProjectTimeout],
  );

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
    (
      messageId: string,
      message: string,
      code?: string,
      failure?: RunFailureClassificationFields,
    ) => {
      if (!message) return;
      updateMessageById(
        messageId,
        (prev) => appendErrorStatusEvent(prev, message, code, failure),
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
          if (consumeDesignSystemAuditAutoRepair(project.id)) {
            const seed = { id: `audit-${Date.now()}`, value: repairPrompt };
            setChatSeed(seed);
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
    async (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images: File[] = []) => {
      if (!activeConversationId) return null;
      // Upload any attached images first so the saved comment carries durable
      // file paths — this is what lets the comment list / re-opened popover
      // re-display the images instead of losing them on echo.
      let uploadedAttachments: PreviewCommentAttachment[] | undefined;
      if (images.length > 0) {
        const result = await uploadProjectFiles(project.id, images);
        if (result.uploaded.length !== images.length) return null;
        uploadedAttachments = result.uploaded.map((file) => ({ path: file.path, name: file.name }));
      }
      const existing = previewComments.find(
        (comment) => comment.filePath === target.filePath && comment.elementId === target.elementId,
      );
      const attachments = mergePreviewCommentAttachments(existing?.attachments, uploadedAttachments);
      const saved = await upsertPreviewComment(project.id, activeConversationId, {
        target,
        note,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (!saved) return null;
      setPreviewComments((current) => mergeSavedPreviewComment(current, saved));
      setAttachedComments((current) =>
        attachAfterSave ? mergeAttachedComments(current, saved) : current.map((comment) => comment.id === saved.id ? saved : comment),
      );
      return saved;
    },
    [project.id, activeConversationId, previewComments],
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
        if (finalizingLocalRunIdsRef.current.has(runId)) continue;
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
          const endedAt = await resolveTerminalEndedAt(runId, status);
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
            const legacyReplayEndedAt = await resolveTerminalEndedAt(runId, status);
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
            let artifactPersistenceSucceeded = false;
            let artifactPersistenceError: string | undefined;
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
                artifactPersistenceSucceeded = true;
                savedArtifactRef.current = recoveredExistingArtifact.name;
                requestOpenFile(recoveredExistingArtifact.name);
              } else {
                savedArtifactRef.current = null;
                const persistence = await persistArtifact(
                  artifactToPersist,
                  nextFiles,
                  replayedContent,
                  { pointerMinMtime: runStartedAt },
                );
                if (persistence.ok) artifactPersistenceSucceeded = true;
                else artifactPersistenceError = persistence.error;
                nextFiles = await refreshProjectFiles();
              }
            }
            const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
            const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
            const touchedFilePaths = extractTouchedFilePathsFromEvents(message.events);
            const traceObjectFiles = mergeRecoveredTraceObjectFile(
              computeTraceObjectFiles(
                beforeFileNames,
                nextFiles,
                touchedFilePaths,
                project.id,
              ) ?? [],
              recoveredExistingArtifact,
            );
            const producedArtifactToOpen = selectAutoOpenTurnArtifact(produced, nextFiles, {
              ...autoOpenArtifactOptions,
              turnStartedAt: status.createdAt || message.startedAt || message.createdAt || null,
              turnEndedAt: message.endedAt || legacyReplayEndedAt || null,
              agentTouchedFileNames: resolveAgentTouchedFileNames(
                touchedFilePaths,
                nextFiles,
                project.id,
              ),
            });
            if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
            const deliveryOutcome = resolveDesignDeliveryOutcome({
              sessionMode: message.sessionMode,
              runStatus: 'succeeded',
              content: replayedContent,
              events: message.events,
              producedFileCount: produced.length,
              traceObjectFileCount: traceObjectFiles.length,
              persistenceSucceeded: artifactPersistenceSucceeded,
              persistenceFailed: artifactPersistenceError !== undefined,
            });
            updateMessageById(
              message.id,
              (prev) =>
                applyDesignDeliveryOutcome(
                  {
                    ...prev,
                    content: replayedContent,
                    producedFiles: produced,
                    traceObjectFiles,
                  },
                  deliveryOutcome,
                  artifactPersistenceError,
                ),
              true,
              { telemetryFinalized: true },
            );
            if (deliveryOutcome === 'no_result' || deliveryOutcome === 'delivery_failed') {
              setError(artifactPersistenceError ?? DESIGN_RESULT_MISSING_DETAIL);
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
        });
        reattachTextBuffersRef.current.add(textBuffer);
        const unregisterTextBuffer = () => {
          reattachTextBuffersRef.current.delete(textBuffer);
        };

        const shouldPublishRunFinishedEvent =
          isActiveRunStatus(message.runStatus)
          || spuriouslyFailedPending
          || recoverableGenericDisconnectFailed;
        void reattachDaemonRun({
          runId,
          projectId: project.id,
          conversationId: reattachConversationId,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          initialLastEventId: needsFullReplay ? null : message.lastRunEventId ?? null,
          publishRunFinishedEvent: shouldPublishRunFinishedEvent,
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
              const endedAt = await resolveTerminalEndedAt(runId, status);
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
                let artifactPersistenceSucceeded = false;
                let artifactPersistenceError: string | undefined;
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
                    artifactPersistenceSucceeded = true;
                    savedArtifactRef.current = recoveredExistingArtifact.name;
                    requestOpenFile(recoveredExistingArtifact.name);
                  } else {
                    savedArtifactRef.current = null;
                    const persistence = await persistArtifact(
                      artifactToPersist,
                      nextFiles,
                      replayedContent,
                      { pointerMinMtime: runStartedAt },
                    );
                    if (persistence.ok) artifactPersistenceSucceeded = true;
                    else artifactPersistenceError = persistence.error;
                    nextFiles = await refreshProjectFiles();
                  }
                }
                const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                const touchedFilePaths = extractTouchedFilePathsFromEvents(
                  needsFullReplay ? replayedEvents : message.events,
                );
                const traceObjectFiles = mergeRecoveredTraceObjectFile(
                  computeTraceObjectFiles(
                    beforeFileNames,
                    nextFiles,
                    touchedFilePaths,
                    project.id,
                  ) ?? [],
                  recoveredExistingArtifact,
                );
                const producedArtifactToOpen = selectAutoOpenTurnArtifact(produced, nextFiles, {
                  ...autoOpenArtifactOptions,
                  turnStartedAt: status.createdAt || message.startedAt || message.createdAt || null,
                  turnEndedAt: endedAt ?? null,
                  agentTouchedFileNames: resolveAgentTouchedFileNames(
                    touchedFilePaths,
                    nextFiles,
                    project.id,
                  ),
                });
                if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
                const deliveryContent = needsFullReplay ? replayedContent : message.content;
                const deliveryEvents = needsFullReplay ? replayedEvents : message.events;
                const deliveryOutcome = resolveDesignDeliveryOutcome({
                  sessionMode: message.sessionMode,
                  runStatus: 'succeeded',
                  content: deliveryContent,
                  events: deliveryEvents,
                  producedFileCount: produced.length,
                  traceObjectFileCount: traceObjectFiles.length,
                  persistenceSucceeded: artifactPersistenceSucceeded,
                  persistenceFailed: artifactPersistenceError !== undefined,
                });
                updateMessageById(
                  message.id,
                  (prev) =>
                    applyDesignDeliveryOutcome(
                      {
                        ...prev,
                        content: deliveryContent,
                        events: deliveryEvents,
                        producedFiles: produced,
                        traceObjectFiles,
                      },
                      deliveryOutcome,
                      artifactPersistenceError,
                    ),
                  true,
                  { telemetryFinalized: true },
                );
                if (deliveryOutcome === 'no_result' || deliveryOutcome === 'delivery_failed') {
                  setError(artifactPersistenceError ?? DESIGN_RESULT_MISSING_DETAIL);
                }
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
              const failure = runFailureFieldsFromError(err);
              // A superseded reattached run must not paint a global failure
              // banner or re-finalize its message over the replacement run.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              if (runMayFinalize) {
                setError(err.message);
                appendAssistantErrorEvent(message.id, err.message, errorCode, failure);
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
                    const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced, autoOpenArtifactOptions);
                    if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
                    if (latestRunStatus?.status === 'succeeded') setError(null);
                    if (
                      shouldPublishRunFinishedEvent
                      && latestRunStatus?.status === 'succeeded'
                      && typeof latestRunStatus.artifactCount === 'number'
                    ) {
                      publishDaemonRunFinishedEvent({
                        runId,
                        projectId: project.id,
                        conversationId: reattachConversationId,
                        result: 'success',
                        artifactCount: latestRunStatus.artifactCount,
                      });
                    }
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
                        resultDeliveryState:
                          produced.length > 0 ? 'delivered' : prev.resultDeliveryState,
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
                    if (
                      shouldPublishRunFinishedEvent
                      && typeof latestRunStatus.artifactCount === 'number'
                    ) {
                      publishDaemonRunFinishedEvent({
                        runId,
                        projectId: project.id,
                        conversationId: reattachConversationId,
                        result: 'success',
                        artifactCount: latestRunStatus.artifactCount,
                      });
                    }
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
          const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced, autoOpenArtifactOptions);
          if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
          // This message's persisted runStatus was already terminal (a
          // precondition of hasRecoverableArtifactMessage); when it has no
          // stored endedAt, fall back to the daemon's authoritative terminal
          // timestamp (already fetched above as latestRunStatus) instead of
          // this reload/poll's wall-clock time.
          const recoveredArtifactEndedAt = await resolveTerminalEndedAt(runId, latestRunStatus);
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              content: sourceText,
              producedFiles: produced,
              resultDeliveryState: 'delivered',
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
    saveQueuedChatSends(project.id, next);
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
            const plan = await resolveAmrPlan(gate.snapshot);
            if (messagesConversationIdRef.current !== activeConversationId) {
              queueGateSend();
              return false;
            }
            if (isPaidAmrPlan(plan)) {
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
        sessionMode: runSessionMode,
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
          const finalizingRunId = currentRunId;
          if (finalizingRunId) finalizingLocalRunIdsRef.current.add(finalizingRunId);
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
              let artifactPersistenceSucceeded = false;
              let artifactPersistenceError: string | undefined;
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
                  artifactPersistenceSucceeded = true;
                  savedArtifactRef.current = sameTurnWrite.name;
                  requestOpenFile(sameTurnWrite.name);
                } else {
                  const persistence = await persistArtifact(artifactToPersist, nextFiles, finalText);
                  if (persistence.ok) artifactPersistenceSucceeded = true;
                  else artifactPersistenceError = persistence.error;
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
                project.id,
              ) ?? [];
              const producedArtifactToOpen = selectAutoOpenTurnArtifact(produced, nextFiles, {
                ...autoOpenArtifactOptions,
                turnStartedAt: startedAt,
                turnEndedAt: endedAt ?? null,
                agentTouchedFileNames: resolveAgentTouchedFileNames(
                  traceTouchedFilePaths,
                  nextFiles,
                  project.id,
                ),
              });
              if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
              const deliveryCandidate: ChatMessage = {
                ...latestAssistantMsg,
                endedAt,
                runStatus: finalRunStatus,
                sessionMode: runSessionMode,
                producedFiles: produced,
                traceObjectFiles,
              };
              const deliveryOutcome = resolveDesignDeliveryOutcome({
                sessionMode: deliveryCandidate.sessionMode,
                runStatus: deliveryCandidate.runStatus,
                content: deliveryCandidate.content,
                events: deliveryCandidate.events,
                producedFileCount: produced.length,
                traceObjectFileCount: traceObjectFiles.length,
                persistenceSucceeded: artifactPersistenceSucceeded,
                persistenceFailed: artifactPersistenceError !== undefined,
              });
              const finalized = applyDesignDeliveryOutcome(
                deliveryCandidate,
                deliveryOutcome,
                artifactPersistenceError,
              );
              latestAssistantMsg = finalized;
              setMessages((curr) => {
                const updated = curr.map((m) =>
                  m.id === assistantId
                    ? finalized
                    : m,
                );
                persistMessage(finalized, { telemetryFinalized: true });
                return updated;
              });
              if (deliveryOutcome === 'no_result' || deliveryOutcome === 'delivery_failed') {
                setError(artifactPersistenceError ?? DESIGN_RESULT_MISSING_DETAIL);
                if (runCommentAttachments.length > 0) {
                  void patchAttachedStatuses(runCommentAttachments, 'failed');
                }
              }
              await auditDesignSystemWorkspaceAfterRun(assistantId);
            } finally {
              clearTraceTouchedFilePaths();
              if (finalizingRunId) finalizingLocalRunIdsRef.current.delete(finalizingRunId);
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
          const failure = runFailureFieldsFromError(err);
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
            appendAssistantErrorEvent(assistantId, err.message, errorCode, failure);
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
                  if (typeof latestRunStatus.artifactCount === 'number') {
                    publishDaemonRunFinishedEvent({
                      runId: runIdForGenericDisconnect,
                      projectId: project.id,
                      conversationId: runConversationId,
                      result: 'success',
                      artifactCount: latestRunStatus.artifactCount,
                    });
                  }
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
              model: byokOpenCodeProvider.model,
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

  const handleComposerSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): Promise<ChatSendOutcome> => {
      if (activeConversationId) {
        const decision = await requestAmrArtifactUpgrade({
          projectId: project.id,
          conversationId: activeConversationId,
          source: 'chat_send',
        });
        if (decision === 'cancel') return 'restore-draft';
      }
      void handleSend(prompt, attachments, commentAttachments, meta);
    },
    [activeConversationId, handleSend, project.id],
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

  // "Share to Open Design" — kicks off the bundled `od-share-to-community`
  // scenario in the active conversation. We just inject the trigger prompt
  // through the standard chat-send path; the agent then loads SKILL.md and
  // drives the rest. Keep this preparing state alive for the resulting chat
  // run so the action reads as async packaging instead of instant sharing.
  const [shareToOpenDesignBusyMessageId, setShareToOpenDesignBusyMessageId] = useState<string | null>(null);
  const shareToOpenDesignBusyMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shareToOpenDesignBusyMessageIdRef.current || currentConversationBusy) return;
    shareToOpenDesignBusyMessageIdRef.current = null;
    setShareToOpenDesignBusyMessageId(null);
  }, [currentConversationBusy]);
  const handleShareToOpenDesign = useCallback((assistantMessageId: string) => {
    if (currentConversationActionDisabled || shareToOpenDesignBusyMessageIdRef.current) return;
    shareToOpenDesignBusyMessageIdRef.current = assistantMessageId;
    setShareToOpenDesignBusyMessageId(assistantMessageId);
    void Promise.resolve(handleSend(SHARE_TO_COMMUNITY_PROMPT, [], []))
      .then((started) => {
        if (started) return;
        shareToOpenDesignBusyMessageIdRef.current = null;
        setShareToOpenDesignBusyMessageId(null);
      })
      .catch(() => {
        shareToOpenDesignBusyMessageIdRef.current = null;
        setShareToOpenDesignBusyMessageId(null);
      });
  }, [currentConversationActionDisabled, handleSend]);

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

  const refreshConversationsForProgrammaticBrandRetry = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const capturedProjectId = project.id;
      const myToken = ++conversationsRefreshTokenRef.current;
      try {
        const list = await listConversations(capturedProjectId);
        if (projectIdRef.current !== capturedProjectId) return false;
        if (conversationsRefreshTokenRef.current !== myToken) return false;
        setConversations(ensureConversationPresent(list, conversationId, capturedProjectId));
        return true;
      } catch (err) {
        if (projectIdRef.current !== capturedProjectId) return false;
        if (conversationsRefreshTokenRef.current !== myToken) return false;
        console.warn('Failed to refresh conversations after brand extraction retry', err);
        setConversations((curr) =>
          ensureConversationPresent(curr, conversationId, capturedProjectId),
        );
        return true;
      }
    },
    [project.id],
  );

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

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim() || null;
      setConversations((curr) =>
        curr.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
      );
      await patchConversation(project.id, id, { title: trimmed });
    },
    [project.id],
  );

  const handleConversationSessionModeChange = useCallback(
    async (id: string, sessionMode: ChatSessionMode) => {
      setConversations((curr) =>
        curr.map((conversation) =>
          conversation.id === id ? { ...conversation, sessionMode } : conversation,
        ),
      );
      const updated = await patchConversation(project.id, id, { sessionMode });
      if (updated) {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === id ? { ...conversation, ...updated } : conversation,
          ),
        );
      }
    },
    [project.id],
  );

  const handleActiveConversationSessionModeChange = useCallback(
    (sessionMode: ChatSessionMode) => {
      if (!activeConversationId) return;
      void handleConversationSessionModeChange(activeConversationId, sessionMode);
    },
    [activeConversationId, handleConversationSessionModeChange],
  );

  const handleForkFromMessage = useCallback(
    async (assistantMessage: ChatMessage) => {
      if (!activeConversationId || forkingMessageId) return;
      setForkingMessageId(assistantMessage.id);
      setConversationLoadError(null);
      try {
        const sourceTitle = activeConversation?.title?.trim();
        const forkTitle = sourceTitle
          ? t('chat.forkedConversationTitle', { title: sourceTitle })
          : undefined;
        // Seed the fork from the messages the user is actually looking at,
        // up to and including the fork point. A run that errored or had its
        // connection reset before its assistant message was persisted leaves
        // that message in memory only; copying from the database by id would
        // 404 and silently drop the fork. Sending the in-memory snapshot makes
        // the fork resilient to that gap.
        const forkIndex = messages.findIndex((m) => m.id === assistantMessage.id);
        const seedMessages =
          forkIndex >= 0 ? messages.slice(0, forkIndex + 1) : [...messages, assistantMessage];
        const fresh = await createConversation(project.id, forkTitle, {
          seedFromConversationId: activeConversationId,
          forkAfterMessageId: assistantMessage.id,
          sessionMode: activeSessionMode,
          seedMessages,
        });
        if (!fresh) throw new Error(t('chat.forkConversationFailed'));
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setStreaming(false);
        streamingConversationIdRef.current = null;
        setStreamingConversationId(null);
        setMessagesConversationId(null);
        messagesConversationIdRef.current = null;
        setFailedMessagesConversationId(null);
        setConversations((curr) => [fresh, ...curr.filter((c) => c.id !== fresh.id)]);
        setActiveConversationId(fresh.id);
        navigate(
          {
            kind: 'project',
            projectId: project.id,
            conversationId: fresh.id,
            fileName: openTabsState.active ?? null,
          },
          { replace: true },
        );
        onProjectsRefresh();
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('chat.forkConversationFailed');
        setConversationLoadError(message);
        setError(message);
      } finally {
        setForkingMessageId(null);
      }
    },
    [
      activeConversationId,
      activeConversation?.title,
      activeSessionMode,
      forkingMessageId,
      messages,
      navigate,
      onProjectsRefresh,
      openTabsState.active,
      project.id,
      t,
    ],
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
            onSend: handleComposerSend,
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
      handleComposerSend,
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
  const workspacePanelTrack =
    workspacePanelMinWidth === 0
      ? 'minmax(0, 1fr)'
      : `minmax(${workspacePanelMinWidth}px, 1fr)`;
  const splitLeftPanelWidth = leftInspectorActive
    ? COMMENT_INSPECTOR_PANEL_WIDTH
    : chatPanelWidthRef.current;
  const chatPanelAriaMinWidth = Math.min(MIN_CHAT_PANEL_WIDTH, chatPanelMaxWidth);
  const projectActionsToastInChatPane =
    projectActionsToast?.scope === 'chat-pane' &&
    !workspaceFocused &&
    !commentInspectorActive &&
    Boolean(activeConversationId || conversationLoadError);
  const projectActionsToastNode = projectActionsToast ? (
    <Toast
      message={projectActionsToast.message}
      details={projectActionsToast.details}
      code={projectActionsToast.code}
      tone={projectActionsToast.tone}
      ttlMs={projectActionsToast.ttlMs}
      onDismiss={() => setProjectActionsToast(null)}
    />
  ) : null;

  const renderPreferredChatPanelWidth = useCallback((
    preferredWidth: number,
    maxWidth = chatPanelMaxWidthRef.current,
    options: { commitState?: boolean } = {},
  ): number => {
    const next = clampChatPanelWidth(preferredWidth, maxWidth);
    chatPanelWidthRef.current = next;
    applySplitChatPanelWidth(splitRef.current, next, workspacePanelTrack);
    if (options.commitState !== false) setChatPanelWidth(next);
    return next;
  }, [workspacePanelTrack]);

  const applyChatPanelWidth = useCallback((
    width: number,
    options: { commitState?: boolean } = {},
  ): number => {
    const nextPreferred = clampPreferredChatPanelWidth(
      clampChatPanelWidth(width, chatPanelMaxWidthRef.current),
    );
    preferredChatPanelWidthRef.current = nextPreferred;
    return renderPreferredChatPanelWidth(nextPreferred, chatPanelMaxWidthRef.current, options);
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
    if (saveFinalWidth) {
      const finalWidth = renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current);
      saveChatPanelWidth(finalWidth);
    }
  }, [renderPreferredChatPanelWidth]);

  useEffect(() => {
    chatPanelWidthRef.current = chatPanelWidth;
    applySplitChatPanelWidth(splitRef.current, chatPanelWidth, workspacePanelTrack);
  }, [chatPanelWidth, workspacePanelTrack]);

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
      applyChatPanelWidth(rawWidth, { commitState: false });
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
    autoSendAttachmentsRef.current = isAutoSend ? readAutoSendAttachments(project.id) : [];
    autoSendContextRef.current = isAutoSend ? readAutoSendContext(project.id) : null;
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
  const [brandCreateDesignStarting, setBrandCreateDesignStarting] = useState(false);
  const [projectDesignSystemCreateStarting, setProjectDesignSystemCreateStarting] = useState(false);
  const [projectDuplicateStarting, setProjectDuplicateStarting] = useState(false);
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
            scope: 'chat-pane',
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
            scope: 'chat-pane',
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
            scope: 'chat-pane',
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
        details: null,
        tone: 'error',
        ttlMs: 7000,
        scope: 'chat-pane',
      });
    })()
      .catch((err) => {
        setBrandExtractionStatusOverride({ brandId, status: 'needs_input' });
        setProjectActionsToast({
          message: err instanceof Error ? err.message : t('chat.brandBrowserAssistReadFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
          scope: 'chat-pane',
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

  const handleCreateDesignFromActiveDesignSystem = useCallback(() => {
    if (brandCreateDesignStarting) return;
    const system = designSystemProject ?? activeDesignSystemSummary;
    if (!system || !onCreateProjectFromDesignSystem) return;
    setBrandCreateDesignStarting(true);
    void Promise.resolve(onCreateProjectFromDesignSystem(system.id, system.title)).finally(() => {
      setBrandCreateDesignStarting(false);
    });
  }, [
    activeDesignSystemSummary,
    brandCreateDesignStarting,
    designSystemProject,
    onCreateProjectFromDesignSystem,
  ]);

  const handleCreateDesignSystemFromProject = useCallback(() => {
    if (
      projectDesignSystemCreateStarting ||
      projectIsDesignSystemProject ||
      !onCreateDesignSystemFromProject
    ) {
      return;
    }
    const name = designSystemNameForSourceProject(currentProject);
    const pendingPrompt = buildCreateDesignSystemFromProjectPrompt({
      project: currentProject,
      projectFiles,
      activeDesignSystem: activeDesignSystemSummary,
    });
    setProjectDesignSystemCreateStarting(true);
    void Promise.resolve(onCreateDesignSystemFromProject(currentProject.id, {
      name,
      pendingPrompt,
    }))
      .catch((err) => {
        setProjectActionsToast({
          message: err instanceof Error ? err.message : String(err),
          details: null,
          tone: 'error',
        });
      })
      .finally(() => {
        setProjectDesignSystemCreateStarting(false);
      });
  }, [
    activeDesignSystemSummary,
    currentProject,
    onCreateDesignSystemFromProject,
    projectDesignSystemCreateStarting,
    projectFiles,
    projectIsDesignSystemProject,
  ]);

  const handleDuplicateProject = useCallback(() => {
    if (projectDuplicateStarting || !onDuplicateProject) return;
    setProjectDuplicateStarting(true);
    void Promise.resolve(onDuplicateProject(currentProject.id, {}))
      .catch((err) => {
        setProjectActionsToast({
          message: err instanceof Error ? err.message : String(err),
          details: null,
          tone: 'error',
        });
      })
      .finally(() => {
        setProjectDuplicateStarting(false);
      });
  }, [
    currentProject.id,
    onDuplicateProject,
    projectDuplicateStarting,
  ]);

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
  const [contextPluginDetails, setContextPluginDetails] =
    useState<InstalledPluginRecord | null>(null);
  const [contextDesignSystemDetails, setContextDesignSystemDetails] =
    useState<DesignSystemSummary | null>(null);
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
  const handleOpenContextPluginDetails = useCallback(async (pluginId: string) => {
    const normalizedId = pluginId.trim();
    if (!normalizedId) return;
    const plugins = await listPlugins({ includeHidden: true });
    const record = plugins.find((plugin) => plugin.id === normalizedId);
    if (record) setContextPluginDetails(record);
  }, []);
  const handleDuplicateContextPlugin = useCallback(async (record: InstalledPluginRecord) => {
    try {
      const result = await duplicatePluginAsProject(record.id, {
        name: localizePluginTitle(locale, record),
      });
      setContextPluginDetails(null);
      navigate({
        kind: 'project',
        projectId: result.projectId,
        conversationId: result.conversationId,
        fileName: result.relPath,
      });
    } catch {
      setProjectActionsToast({
        message: t('pluginCard.duplicateFailed'),
        details: null,
        tone: 'error',
        ttlMs: 3000,
      });
    }
  }, [locale, t]);
  const handleOpenContextDesignSystemDetails = useCallback((system: DesignSystemSummary) => {
    setContextDesignSystemDetails(system);
  }, []);
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
    if (projectIsProgrammaticBrandExtraction) {
      clearAutoSendSession(project.id);
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
    const context = autoSendContextRef.current ?? readAutoSendContext(project.id);
    if (!seed && attachments.length === 0) {
      return;
    }
    autoSentRef.current = true;
    if (isDesignSystemWorkspaceMetadata(project.metadata)) {
      markDesignSystemAuditAutoRepairEligible(project.id);
    }
    clearAutoSendSession(project.id);
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
    <>
      <AvatarMenu
        config={config}
        agents={agents}
        daemonLive={daemonLive}
        onModeChange={onModeChange}
        onOpen={() => {
          trackComposerBarClick(analytics.track, {
            page_name: 'chat_panel',
            area: 'chat_composer',
            element: 'agent_selector_open',
            ...(project?.id ? { project_id: project.id } : {}),
          });
        }}
        onAgentChange={(id) => {
          trackComposerBarClick(analytics.track, {
            page_name: 'chat_panel',
            area: 'chat_composer',
            element: 'agent_select',
            agent_id: id,
            ...(project?.id ? { project_id: project.id } : {}),
          });
          onAgentChange(id);
        }}
        onAgentModelChange={(agentId, choice) => {
          trackComposerBarClick(analytics.track, {
            page_name: 'chat_panel',
            area: 'chat_composer',
            element: 'agent_model_select',
            agent_id: agentId,
            ...(choice?.model ? { model_id: choice.model } : {}),
            ...(project?.id ? { project_id: project.id } : {}),
          });
          onAgentModelChange(agentId, choice);
        }}
        onApiModelChange={(model) => {
          trackComposerBarClick(analytics.track, {
            page_name: 'chat_panel',
            area: 'chat_composer',
            element: 'agent_model_select',
            model_id: model,
            ...(project?.id ? { project_id: project.id } : {}),
          });
          onApiModelChange?.(model);
        }}
        onOpenSettings={onOpenSettings}
        onRefreshAgents={onRefreshAgents}
        placement="up"
      />
    </>
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
              projectResolvedDir={projectDetail.resolvedDir}
              skills={skills}
              onEnsureProject={handleEnsureProject}
              previewComments={previewComments}
              attachedComments={attachedComments}
              onAttachComment={attachPreviewComment}
              onDetachComment={detachPreviewComment}
              onDeleteComment={(commentId) => void removePreviewComment(commentId)}
              onSend={handleComposerSend}
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
              newConversationDisabled={newConversationDisabled}
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
              chatLogTray={
                projectActionsToastInChatPane ? (
                  <div className="project-actions-toast-anchor">
                    {projectActionsToastNode}
                  </div>
                ) : null
              }
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
          onSubmitQuestionForm={(text, attachments = [], context) => {
            if (currentConversationActionDisabled) return;
            // Submitting question-form answers is a clarification turn, not a
            // fresh create/edit — tag entry_from so the dashboard can separate it.
            void handleSend(text, attachments, [], {
              entryFrom: 'question_answer',
              ...(context ? { context } : {}),
            });
          }}
        />
      </div>
      {contextPluginDetails ? (
        <PluginDetailsModal
          record={contextPluginDetails}
          onClose={() => setContextPluginDetails(null)}
          onUse={() => setContextPluginDetails(null)}
          onDuplicate={(record) => void handleDuplicateContextPlugin(record)}
          isApplying={false}
          hideUseAction
        />
      ) : null}
      {contextDesignSystemDetails ? (
        <DesignSystemPreviewModal
          system={contextDesignSystemDetails}
          initialViewId="kit"
          onClose={() => setContextDesignSystemDetails(null)}
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
        {projectActionsToast && !projectActionsToastInChatPane ? projectActionsToastNode : null}
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

function artifactExtensionFor(art: Artifact): '.html' | '.jsx' | '.tsx' | '.css' | '.svg' | '.md' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  if (type.includes('css') || identifier.endsWith('.css')) return '.css';
  if (type.includes('svg') || identifier.endsWith('.svg')) return '.svg';
  if (type.includes('markdown') || type === 'md' || identifier.endsWith('.md')) {
    return '.md';
  }
  return '.html';
}

function conversationHasBrandBrowserAssist(messages: ChatMessage[], brandId: string): boolean {
  const brandNeedle = `"brandId":"${escapeJsonNeedle(brandId)}"`;
  return messages.some((message) =>
    message.role === 'assistant' &&
    message.content.includes('<od-card type="brand-browser-assist"') &&
    message.content.includes(brandNeedle),
  );
}

function escapeJsonNeedle(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

function artifactFileNamePattern(baseName: string, ext: string): RegExp {
  const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedBaseName}(?:-\\d+)?${escapedExt}$`);
}

export function findExistingArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  const ext = artifactExtensionFor(art);
  const baseName = artifactBaseNameFor(art);
  const candidateFileName = `${baseName}${ext}`;
  const currentRunFiles = filterProjectFilesByMinMtime(projectFiles, options.minMtime);

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

  if (ext === '.html') {
    const exactNameMatch = currentRunFiles.find((file) => file.name === candidateFileName);
    if (exactNameMatch) return exactNameMatch;
  }
  return null;
}

export function findExistingNonHtmlArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  if (artifactExtensionFor(art) === '.html') return null;
  return findExistingArtifactProjectFile(art, projectFiles, options);
}

export async function findSameTurnNonHtmlWriteForRecoveredArtifact({
  artifact,
  producedFiles,
  readProjectText,
}: {
  artifact: Artifact;
  producedFiles: readonly ProjectFile[];
  readProjectText: (name: string) => Promise<string | null>;
}): Promise<ProjectFile | null> {
  const ext = artifactExtensionFor(artifact);
  if (ext === '.html') return null;

  const baseName = artifactBaseNameFor(artifact);
  const candidateFileName = `${baseName}${ext}`;
  const namePattern = artifactFileNamePattern(baseName, ext);
  const identifier = artifact.identifier || '';
  const candidates = producedFiles
    .filter((file) => {
      if (identifier && file.artifactManifest?.metadata?.identifier === identifier) {
        return file.name.toLowerCase().endsWith(ext);
      }
      return file.name === candidateFileName || namePattern.test(file.name);
    })
    .sort((a, b) => b.mtime - a.mtime);

  const expected = normalizeProjectTextForArtifactComparison(artifact.html);
  for (const file of candidates) {
    const text = await readProjectText(file.name);
    if (text === null) continue;
    const actual = normalizeProjectTextForArtifactComparison(text);
    if (actual === expected) return file;
  }
  return null;
}

async function findSameTurnWriteForRecoveredArtifact({
  artifact,
  sourceText,
  producedFiles,
  readProjectText,
}: {
  artifact: Artifact;
  sourceText: string;
  producedFiles: readonly ProjectFile[];
  readProjectText: (name: string) => Promise<string | null>;
}): Promise<ProjectFile | null> {
  const nonHtmlWrite = await findSameTurnNonHtmlWriteForRecoveredArtifact({
    artifact,
    producedFiles,
    readProjectText,
  });
  if (nonHtmlWrite || artifactExtensionFor(artifact) !== '.html') return nonHtmlWrite;
  return findSameTurnHtmlWriteForRecoveredArtifact({
    artifactHtml: resolvePersistedArtifactHtml({
      artifactHtml: artifact.html,
      identifier: artifact.identifier,
      sourceText,
    }),
    producedFiles,
    readProjectHtml: readProjectText,
  });
}

function normalizeProjectTextForArtifactComparison(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

function filterProjectFilesByMinMtime(
  projectFiles: readonly ProjectFile[],
  minMtime?: number,
): ProjectFile[] {
  return typeof minMtime === 'number' && Number.isFinite(minMtime)
    ? projectFiles.filter((file) => file.mtime >= minMtime)
    : [...projectFiles];
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

/** A daemon run-status snapshot, as returned by `fetchChatRunStatus`/`listActiveChatRuns`. */
type RunStatusSnapshot = Awaited<ReturnType<typeof fetchChatRunStatus>>;

/**
 * Resolves the authoritative `endedAt` for a terminal-recovery branch.
 *
 * Invariant: every terminal-recovery branch (reload reattach, generic
 * disconnect retry-cap probe, stale/legacy row replay) must stamp `endedAt`
 * from an authoritative TERMINAL `updatedAt` — a status snapshot whose
 * `status` is terminal (succeeded/canceled/failed), observed at the END of
 * recovery — never from a pre-reattach/heartbeat snapshot or a stale
 * disconnect-time value.
 *
 * `candidate` is whatever status snapshot the caller already has in hand
 * (e.g. fetched before `reattachDaemonRun` started, which may still read
 * 'running'/'queued' if the daemon only finished afterward). When it is
 * already terminal, its `updatedAt` IS the authoritative value and is
 * returned with no extra round trip. When it is missing or still active, a
 * fresh probe is taken via `fetchChatRunStatus` — the daemon may have
 * finished in the interim — and used if terminal. If the fresh probe is
 * also unavailable or non-terminal, `Date.now()` is the last-resort
 * fallback so `endedAt` is never left unset.
 */
async function resolveTerminalEndedAt(
  runId: string,
  candidate: RunStatusSnapshot | null | undefined,
): Promise<number> {
  if (candidate && !isActiveRunStatus(candidate.status)) {
    return candidate.updatedAt;
  }
  const probed = await fetchChatRunStatus(runId).catch(() => null);
  if (probed && !isActiveRunStatus(probed.status)) {
    return probed.updatedAt;
  }
  return Date.now();
}

function isProgrammaticBrandExtractionStatusMessage(
  message: ChatMessage,
  metadata: ProjectMetadata | null | undefined,
): boolean {
  if (!isProgrammaticBrandExtractionProject(metadata)) return false;
  if (message.role !== 'assistant' || message.runId) return false;
  if (!isActiveRunStatus(message.runStatus)) return false;
  const text = `${message.content}\n${textContentFromAgentEvents(message.events)}`;
  return (
    text.includes('Programmatic design-system extraction started') ||
    text.includes('程序化设计系统抽取') ||
    text.includes('程式化設計系統抽取')
  );
}

export function hasRecoverableArtifactMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (!message.runId) return false;
  if (!isTerminalRunStatus(message.runStatus)) return false;
  if (message.producedFiles?.length) return false;
  const sourceText = message.content.trim().length > 0
    ? message.content
    : textContentFromAgentEvents(message.events);
  return artifactFromRecoverableSourceText(sourceText) !== null;
}

function artifactFromRecoverableSourceText(sourceText: string): Artifact | null {
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
    } else if (ev.type === 'artifact:chunk') {
      liveHtml += ev.delta;
      parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, liveHtml);
    } else if (ev.type === 'artifact:end') {
      parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, ev.fullContent);
    }
  }
  if (parsedArtifact?.html) return parsedArtifact;

  const html = recoverStandaloneHtmlDocument(sourceText)
    ?? recoverHtmlDocumentFromMarkdownFence(sourceText);
  if (!html) return null;
  return {
    identifier: 'response',
    artifactType: 'text/html',
    title: 'Response',
    html,
  };
}

export function shouldReplayTerminalRunMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (!message.runId) return false;
  if (message.runStatus !== 'succeeded') return false;
  // A daemon can persist terminal success before the browser finishes its
  // project-file refresh. Reattach once even when prose already exists so the
  // delivery invariant can confirm a file or downgrade the turn after reload.
  if (designDeliveryVerificationPending(message)) return true;
  if (message.content.trim().length > 0) return false;
  if (
    message.startedAt == null
    && !message.preTurnFileNames?.length
    && textContentFromAgentEvents(message.events).trim().length === 0
  ) {
    return false;
  }
  return !(message.producedFiles?.length);
}

function textContentFromAgentEvents(events?: AgentEvent[]): string {
  return (events ?? [])
    .filter((event): event is Extract<AgentEvent, { kind: 'text' }> => event.kind === 'text')
    .map((event) => event.text)
    .join('');
}

const QUEUED_CHAT_SENDS_STORAGE_VERSION = 1;

function queuedChatSendsStorageKey(projectId: string): string {
  return `od:chat-queued-sends:${projectId}:v${QUEUED_CHAT_SENDS_STORAGE_VERSION}`;
}

function loadQueuedChatSends(projectId: string): QueuedChatSend[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(queuedChatSendsStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedChatSend).slice(0, 100);
  } catch {
    return [];
  }
}

function saveQueuedChatSends(projectId: string, items: QueuedChatSend[]): void {
  if (typeof window === 'undefined') return;
  try {
    const key = queuedChatSendsStorageKey(projectId);
    if (items.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, 100)));
  } catch {
    // Ignore private-mode/quota failures. The in-memory queue still works.
  }
}

function isQueuedChatSend(value: unknown): value is QueuedChatSend {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false;
  const record = value as Partial<QueuedChatSend>;
  return (
    typeof record.id === 'string' &&
    typeof record.conversationId === 'string' &&
    typeof record.prompt === 'string' &&
    Array.isArray(record.attachments) &&
    Array.isArray(record.commentAttachments) &&
    typeof record.createdAt === 'number'
  );
}

function stripQueueOnlyFromMeta(meta: ChatSendMeta | undefined): ProjectChatSendMeta | undefined {
  if (!meta) return undefined;
  const { queueOnly: _queueOnly, ...rest } = meta;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export interface RetryTarget {
  failedAssistant: ChatMessage;
  userMsg: ChatMessage;
  priorMessages: ChatMessage[];
  preservedAttempts: ChatMessage[];
}

export function resolveRetryTarget(
  messages: ChatMessage[],
  failedAssistantId: string,
): RetryTarget | null {
  const failedIndex = messages.findIndex(
    (message) =>
      message.id === failedAssistantId &&
      message.role === 'assistant' &&
      isRetryableAssistantTerminalFailure(message),
  );
  if (failedIndex <= 0 || failedIndex !== messages.length - 1) return null;

  let userIndex = failedIndex - 1;
  while (
    userIndex >= 0 &&
    messages[userIndex]?.role === 'assistant' &&
    isRetryableAssistantTerminalFailure(messages[userIndex]!)
  ) {
    userIndex -= 1;
  }

  const userMsg = messages[userIndex];
  const failedAssistant = messages[failedIndex];
  if (!userMsg || userMsg.role !== 'user' || !failedAssistant) return null;

  return {
    failedAssistant,
    userMsg,
    priorMessages: messages.slice(0, userIndex),
    preservedAttempts: messages.slice(userIndex + 1, failedIndex + 1),
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

const DESIGN_RESULT_MISSING_DETAIL =
  'The design run finished without producing a deliverable project file.';
const DESIGN_RESULT_DELIVERY_FAILED_DETAIL =
  'The design result was generated, but Open Design could not save it to the project.';

function applyDesignDeliveryOutcome(
  message: ChatMessage,
  outcome: DesignDeliveryOutcome,
  persistenceError?: string,
): ChatMessage {
  if (outcome === 'delivered') {
    return { ...message, resultDeliveryState: 'delivered' };
  }
  if (outcome !== 'no_result' && outcome !== 'delivery_failed') return message;
  const detail =
    outcome === 'delivery_failed'
      ? persistenceError || DESIGN_RESULT_DELIVERY_FAILED_DETAIL
      : DESIGN_RESULT_MISSING_DETAIL;
  const failed = {
    ...message,
    resultDeliveryState: outcome,
    resumable: false,
  };
  return appendErrorStatusEvent(
    failed,
    detail,
    'ARTIFACT_NOT_FOUND',
  );
}

export function computeProducedFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  return filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)));
}

export function computeTraceObjectFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
  touchedPaths: Iterable<string> = [],
  projectId?: string,
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  const byName = new Map<string, ProjectFile>();
  for (const file of filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)))) {
    byName.set(file.name, { ...file, traceObjectReason: 'new' });
  }
  for (const rawPath of touchedPaths) {
    const file = findTouchedProjectFile(rawPath, next, projectId);
    if (!file) continue;
    byName.set(file.name, {
      ...file,
      traceObjectReason: set.has(file.name) ? 'modified' : 'new',
    });
  }
  return [...byName.values()];
}

function findTouchedProjectFile(
  rawPath: string,
  files: readonly ProjectFile[],
  projectId?: string,
): ProjectFile | null {
  const normalized = normalizeComparableFilePath(rawPath);
  if (!normalized) return null;
  const managedProjectRelativePath = relativePathFromManagedProjectAlias(normalized, projectId);
  const comparablePaths = managedProjectRelativePath
    ? [normalized, managedProjectRelativePath]
    : [normalized];
  const hasPathSeparator = comparablePaths.every((candidate) => candidate.includes('/'));
  const basename = normalized.split('/').pop() ?? normalized;
  const normalizedFiles = files.map((file) => ({
    file,
    candidates: [
      normalizeComparableFilePath(file.path ?? ''),
      normalizeComparableFilePath(file.name),
    ].filter(Boolean),
  }));

  const matches = (predicate: (candidate: string) => boolean): ProjectFile[] => {
    const matched: ProjectFile[] = [];
    for (const { file, candidates } of normalizedFiles) {
      if (candidates.some(predicate)) matched.push(file);
    }
    return matched;
  };

  const exact = matches((candidate) => comparablePaths.includes(candidate));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  const suffix = matches((candidate) =>
    candidate.includes('/') &&
    comparablePaths.some((comparablePath) =>
      candidate.endsWith(`/${comparablePath}`) || comparablePath.endsWith(`/${candidate}`),
    ),
  );
  if (suffix.length === 1) return suffix[0]!;
  if (suffix.length > 1) return null;

  if (hasPathSeparator) return null;

  const basenameMatches = normalizedFiles.filter(({ candidates }) =>
    candidates.some((candidate) => candidate.split('/').pop() === basename),
  );
  return basenameMatches.length === 1 ? basenameMatches[0]!.file : null;
}

function relativePathFromManagedProjectAlias(
  normalizedPath: string,
  projectId: string | undefined,
): string | null {
  const normalizedProjectId = normalizeComparableFilePath(projectId ?? '');
  if (!normalizedProjectId || normalizedProjectId.includes('/')) return null;
  const marker = `projects/${normalizedProjectId}/`;
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex < 0 || (markerIndex > 0 && normalizedPath[markerIndex - 1] !== '/')) return null;
  return normalizedPath.slice(markerIndex + marker.length) || null;
}

function normalizeComparableFilePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

// Resolve the agent's raw Write/Edit tool paths (absolute or partial) to
// project file NAMES for selectAutoOpenTurnArtifact's touched-file
// restriction. Paths that do not resolve to a project file (out-of-project
// writes) are dropped; ambiguous matches resolve to null inside
// findTouchedProjectFile and are dropped the same way.
export function resolveAgentTouchedFileNames(
  touchedPaths: Iterable<string>,
  files: readonly ProjectFile[],
  projectId?: string,
): Set<string> {
  const names = new Set<string>();
  for (const rawPath of touchedPaths) {
    const file = findTouchedProjectFile(rawPath, files, projectId);
    if (file) names.add(file.name);
  }
  return names;
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

export async function findSameTurnHtmlWriteForRecoveredArtifact({
  artifactHtml,
  producedFiles,
  readProjectHtml,
}: {
  artifactHtml: string;
  producedFiles: readonly ProjectFile[];
  readProjectHtml: (name: string) => Promise<string | null>;
}): Promise<ProjectFile | null> {
  const recovered = normalizeHtmlForRecoveredArtifactComparison(artifactHtml);
  if (!recovered) return null;
  const candidates = producedFiles.filter(isHtmlProjectFile);
  if (candidates.length === 0) return null;
  const contents = await Promise.all(candidates.map((file) => readProjectHtml(file.name)));
  const normalized = contents.map(normalizeHtmlForRecoveredArtifactComparison);
  // Bind only on an exact normalized-content match. This is inherently
  // agent-agnostic (#4308): whenever a filesystem-backed CLI writes an HTML
  // file and echoes the same document as an artifact, the normalized contents
  // are equal and we suppress the duplicate — no Claude-specific gate needed.
  //
  // We deliberately do NOT bind on a content *mismatch*. A differing same-turn
  // HTML file is a genuinely different document and must persist on its own.
  // A blind single-file bind also mis-fired across queued runs: the pre-turn
  // file snapshot for a queued run can predate the previous run's persist, so
  // computeProducedFiles() reports that earlier artifact as "produced this
  // turn" and we'd bind the echo to the wrong, unrelated file.
  const exact = candidates.find((_file, i) => normalized[i] === recovered);
  return exact ?? null;
}

function isHtmlProjectFile(file: ProjectFile): boolean {
  const name = (file.path || file.name).toLowerCase();
  return file.kind === 'html' || /\.(?:html?|xhtml)$/u.test(name);
}

function normalizeHtmlForRecoveredArtifactComparison(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function mergeRecoveredTraceObjectFile(
  files: readonly ProjectFile[],
  recovered: ProjectFile | null,
): ProjectFile[] {
  const out = [...files];
  if (!recovered) return out;
  const existing = out.findIndex((file) => file.name === recovered.name);
  const tagged = { ...recovered, traceObjectReason: 'recovered' as const };
  if (existing >= 0) {
    out[existing] = { ...out[existing]!, traceObjectReason: out[existing]!.traceObjectReason ?? 'recovered' };
    return out;
  }
  return [...out, tagged];
}

export function extractTouchedFilePathsFromEvents(events: ChatMessage['events']): string[] {
  if (!Array.isArray(events)) return [];
  const pending = new Map<string, string>();
  const touched: string[] = [];
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const rec = event as Record<string, unknown>;
    if (rec.kind === 'tool_use' && isFileWriteToolName(rec.name)) {
      const filePath = extractFileWriteToolPath(rec.input);
      if (typeof rec.id === 'string' && typeof filePath === 'string' && filePath) {
        pending.set(rec.id, filePath);
      }
    }
    if (rec.kind === 'tool_result') {
      const toolUseId = typeof rec.toolUseId === 'string'
        ? rec.toolUseId
        : typeof rec.tool_use_id === 'string'
          ? rec.tool_use_id
          : '';
      const filePath = pending.get(toolUseId);
      if (!filePath) continue;
      pending.delete(toolUseId);
      if (rec.isError !== true) touched.push(filePath);
    }
  }
  return touched;
}

function isFileWriteToolName(value: unknown): boolean {
  return (
    value === 'Write'
    || value === 'write'
    || value === 'create_file'
    || value === 'Edit'
    || value === 'str_replace_edit'
    || value === 'MultiEdit'
    || value === 'multi_edit'
  );
}

function extractFileWriteToolPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const rec = input as Record<string, unknown>;
  const filePath = rec.file_path ?? rec.filePath ?? rec.path;
  return typeof filePath === 'string' && filePath ? filePath : null;
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

export function createBufferedTextUpdates({
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

  // True when text has been appended but not yet flushed into a `text` event.
  // Callers that need the soon-to-be-committed event count (e.g. pinning a live
  // tool's stream position) add 1 for this still-buffered preamble.
  const hasPendingText = () => pendingTextEventDelta.length > 0;

  return { appendContent, appendTextEvent, appendEvent, flush, cancel, hasPendingText };
}
