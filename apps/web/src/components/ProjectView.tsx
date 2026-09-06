import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useLayoutEffect,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { AnimatePresence } from 'motion/react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import { resolveHtmlPointerArtifactTarget } from '../artifacts/pointer';
import { validateHtmlArtifact } from '../artifacts/validate';
import { recoverHtmlDocumentFromMarkdownFence, recoverStandaloneHtmlDocument, resolvePersistedArtifactHtml } from '../artifacts/recover';
import { createArtifactParser } from '../artifacts/parser';
import { useI18n } from '../i18n';
import {
  type DaemonAgentReconnectState,
  type DaemonAgentRetryState,
  type DaemonReconnectState,
  fetchChatRunStatus,
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
  listActiveChatRuns,
  listProjectRuns,
  publishDaemonRunFinishedEvent,
  reattachDaemonRun,
  reportChatRunFeedback,
  streamViaDaemon,
} from '../providers/daemon';
import {
  type ChatReconnectSignal,
  type ChatReconnectView,
  MANUAL_RECONNECT_FEEDBACK_MS,
  nextChatReconnectView,
  reconnectViewForConversation,
  settledSignalFromMessages,
} from '../runtime/chat/reconnect-state';
import { forkBoundaryMessageIndex } from '../runtime/chat/fork-boundary';
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
  invalidateProjectFilesCache,
  patchPreviewCommentSortKey,
  patchPreviewCommentStatus,
  projectRawUrl,
  uploadProjectFiles,
  upsertPreviewComment,
  writeProjectTextFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { claimProjectTurnIndex, claimRunTurnIndex } from '../analytics/identity';
import {
  buildInitialTaskAnalytics,
  buildRecoveryTaskAnalytics,
  runAgentProviderId,
} from '../analytics/run-task';
import { useCoalescedCallback } from '../hooks/useCoalescedCallback';
import { requestAmrArtifactUpgrade } from '../runtime/amr-artifact-upgrade';
import {
  resolveQuestionFormStrategyTaskExecutionId,
  strategySettledMessageFields,
} from '../runtime/strategy-question-continuation';
import {
  isTodoWriteToolName,
  type AmrWalletSnapshot,
  type ByokChatProviderConfig,
  type ByokMediaDefaults,
  type ByokChatProtocol,
  type ChatTaskExecutionAnalytics,
  type ProjectWorkspaceScope,
  type ResearchOptions,
} from '@open-design/contracts';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  byokProtocolToTracking,
  executionModeToTracking,
  projectKindFromMetadataToTracking,
  projectKindFromMetadataToTrackingOrLegacyDefault,
  projectKindToTracking,
  sessionModeToTracking,
} from '@open-design/contracts/analytics';
import type {
  TrackingArtifactKind,
  TrackingConversationForkErrorCode,
  TrackingConversationForkPoint,
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
  TrackingRunRecoveryActionType,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackByokPreflightBlocked,
  trackComposerBarClick,
  trackConversationForkClick,
  trackConversationForkResult,
  trackDesignSystemApplyResult,
  trackDesignSystemEnrichClick,
  trackPageView,
  trackOnboardingPromptPrefilled,
  trackOnboardingFirstPromptSent,
  trackOnboardingFirstGenerationCompleted,
  trackRunRecoveryActionClick,
  trackRunStartBlockedSurfaceView,
} from '../analytics/events';
import { byokPreflightBlockReason } from './byok/preflight';
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
import { DEFAULT_NOTIFICATIONS, KNOWN_PROVIDERS } from '../state/config';
import type { TodoItem } from '../runtime/todos';
import type {
  AmrAuthRetryContinuation,
  AmrAuthRetryPersonalAdoptionWitness,
} from '../runtime/amr-auth-retry-continuation';
import {
  appendErrorStatusEvent,
  removeErrorStatusEvent,
  runFailureFieldsFromError,
  stderrTailFromError,
} from '../runtime/chat-events';
import type { RunFailureClassificationFields } from '../runtime/chat-events';
import {
  designDeliveryReconciliationStale,
  designDeliveryVerificationPending,
  isRetryableAssistantTerminalFailure,
  resolveDesignDeliveryOutcome,
  type DesignDeliveryOutcome,
} from '../runtime/design-delivery';
import { notifyArtifactDelivered } from './experience-survey-trigger';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import {
  amrBalanceGateScopeForWorkspaceContext,
  amrBalanceGateScopesMatch,
  amrWalletBalanceUsd,
  checkAmrBalanceGate,
  fetchAmrBalanceCardWalletSnapshot,
  isAmrBalanceGateScope,
  type AmrBalanceGateScope,
} from '../runtime/amr-balance-gate';
import {
  amrBalanceBlockedDialog,
  amrBalanceUpgradeIntent,
  resolveAmrBalanceBranch,
  type AmrBalanceBlockedDialogKind,
} from '../runtime/amr-balance-branch';
import { AmrBalanceDialog } from './AmrBalanceDialog';
import { AmrOwnerTopUpDialog } from './chat/AmrOwnerTopUpDialog';
import { markHistoryReplayLanded } from './chat/useCharReveal';
import { workspaceAutoRechargeUrl, workspaceUpgradeUrl } from './EntryNavRail';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
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
import { useSingleFlightCallback } from '../runtime/useSingleFlightCallback';
import { useBrandReadyPrompt } from '../runtime/useBrandReadyPrompt';
import {
  memoryWrittenCardContent,
  useMemoryWrittenCard,
} from '../runtime/useMemoryWrittenCard';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../runtime/design-system-package-audit';
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import { isDesignSystemWorkspacePrompt } from '../design-system-auto-prompt';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  duplicatePluginAsProject,
  fetchAppliedPluginSnapshot,
  getProject,
  installGeneratedPluginFolder,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  ProjectConversationsHttpError,
  saveMessage,
  startGeneratedPluginShareTask,
  cacheTabsLocally,
  persistTabsToDaemonNow,
  listPlugins,
  resolvedWorkspaceContextForWrite,
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
  WorkspaceCollabContext,
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
import { Icon } from './Icon';
import { useWorkspaceTabsDockRef } from './workspaceTabsDock';
import { localizePluginTitle } from './plugins-home/localization';
import { DesignSystemPicker } from './DesignSystemPicker';
import { PresenceBar } from '../collab/PresenceBar';
import { useProjectCollab } from '../collab/useProjectCollab';
import {
  currentUserDirectoryEntry,
  useTeamMembers,
} from '../collab/useTeamMembers';
import { workspaceIdentityCacheKey } from '../collab/workspace-identity';
import {
  useWorkspaceBillingResponse,
  useWorkspaceContext,
  workspaceBillingSummaryForContext,
  workspaceIdentityCanBillAmr,
} from '../collab/useWorkspaceContext';
import {
  projectWorkspaceContext,
  projectWorkspaceScopeAuthorizesAmr,
  projectWorkspaceScopeReady,
  projectWorkspaceVisibility,
  runWorkspaceIdentity,
  runWorkspacePersonalAdoptionWitness,
  useProjectWorkspaceScope,
} from '../collab/useProjectWorkspaceScope';
import {
  CollabProvider,
  type CollabContextValue,
  type ProjectResourceAuthority,
} from '../collab/collab-context';
import { persistCommentAnchors } from '../collab/comment-anchor-client';
import type { AnchorWriteBack } from '../comments';
import { PluginDetailsModal } from './PluginDetailsModal';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { ChatPane } from './ChatPane';
import type { ChatSendMeta, ChatSendOutcome } from './ChatComposer';
import {
  CritiqueTheaterMount,
  useCritiqueTheaterEnabled,
} from './Theater';
import { useIframeKeepAlivePool } from './IframeKeepAlivePool';
import { invalidateHtmlSourceSnapshotProject } from './html-source-snapshot-cache';
import {
  decideAgentFocusOpen,
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedArtifact,
  selectAutoOpenTurnArtifact,
  selectAutoOpenTurnArtifacts,
} from './auto-open-file';
import { buildRepoImportPrompt, designSystemNeedsRepoConnect } from './design-system-github-evidence';
import { isDesignSystemProject, resolveProjectDesignSystemId } from './design-system-project';
import { collectReferencedJsxNames } from '../runtime/jsx-module-refs';
import {
  DESIGN_SYSTEM_TAB,
  FileWorkspace,
  type BrowserOpenRequest,
  type FileRefreshResult,
} from './FileWorkspace';
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
import {
  useProjectDetail,
  type ProjectDetailSeed,
} from '../hooks/useProjectDetail';
import { useTerminalLaunch } from '../hooks/useTerminalLaunch';
import { createBoundedConcurrency } from '../lib/bounded-concurrency';
import { buildContinueInCliToast } from '../lib/build-continue-in-cli-toast';
import { buildClipboardPrompt } from '../lib/build-clipboard-prompt';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { effectiveMaxTokens } from '../state/maxTokens';
import {
  dismissHomeAttachmentUpload,
  homeAttachmentUploadsFor,
  subscribeHomeAttachmentUploads,
} from '../state/home-attachment-handoff';
import { effectiveAgentModelChoice, effectiveAgentModelId } from './agentModelSelection';
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
import type { CommentSendResult } from './comment-send-result';

type BrandBrowserSnapshot =
  | { status: 'ready'; html: string; css: string; baseUrl: string }
  | { status: 'unavailable'; message: string }
  | { status: 'read-failed'; message: string };

type BrandBrowserSnapshotExtractionResult =
  | { status: 'handled' }
  | { status: 'miss'; message: string | null };

type ProjectChatSendMeta = ChatSendMeta & {
  /** Stable persisted row ids for a replayable handoff such as Home auto-send. */
  userMessageId?: string;
  assistantMessageId?: string;
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
  /** The OpenDesign Cloud balance gate already ran for this exact send at
   *  the home submit (with any soft warning answered there); skip re-gating
   *  so the user is never double-prompted for one task. */
  amrGatePrechecked?: boolean;
  /** The caller owns a payload that must be consumed exactly once — the Home
   *  handoff's separately persisted prompt, an inline question form's single
   *  answer. Once the payload is durably parked in this view's queue, report
   *  it as accepted so the caller releases it instead of offering a second
   *  copy that the queue drain would then send twice. This flag is
   *  transport-only and is stripped before queue persistence. */
  acceptDurableQueue?: boolean;
  /** Stable task lineage for retries, resumes and clarification answers. */
  taskAnalytics?: ChatTaskExecutionAnalytics;
  /** Explicit daemon-issued OD Next continuation handle. */
  strategyTaskExecutionId?: string;
};

export function mergeSavedPreviewComment(current: PreviewComment[], saved: PreviewComment): PreviewComment[] {
  const existingIndex = current.findIndex((comment) => comment.id === saved.id);
  if (existingIndex < 0) return [...current, saved];
  return current.map((comment, index) => (index === existingIndex ? saved : comment));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function conversationForkErrorCode(error: unknown): TrackingConversationForkErrorCode {
  if (error instanceof ProjectConversationsHttpError) {
    if (error.status === 400) return 'bad_request';
    if (error.status === 401 || error.status === 403) return 'permission_denied';
    if (error.status === 404) return 'fork_source_not_found';
    if (error.status === 413) return 'payload_too_large';
    if (error.status >= 500) return 'server_error';
    return 'http_error';
  }
  if (error instanceof TypeError) return 'network_error';
  return 'unknown_error';
}

function conversationForkPoint(
  messages: ChatMessage[],
  assistantMessageId: string,
  forkIndex: number,
): TrackingConversationForkPoint {
  if (forkIndex < 0) return 'unknown';
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    return message.id === assistantMessageId ? 'latest' : 'historical';
  }
  return 'unknown';
}

export async function listConversationsWithRetry(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<Conversation[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CONVERSATION_LOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await listConversations(projectId, {
        throwOnError: true,
        workspaceContext,
      });
    } catch (err) {
      lastError = err;
      // A shared project may be visible in the catalog just before its local
      // conversation materialization completes. Only that transient 404 earns
      // the bounded retry window; auth/permission/request failures are settled
      // and retrying them merely leaves the entire project in a loading state.
      if (
        !(err instanceof ProjectConversationsHttpError)
        || err.status !== 404
        || workspaceContext?.workspaceType !== 'team'
      ) {
        throw err;
      }
      const delay = CONVERSATION_LOAD_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await wait(delay);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not load conversations for this project.');
}

/**
 * Server messages whose local copy is longer only because the live stream
 * folded a LATER Run of the same logical task into it.
 *
 * A Full Plan turn spans several physical Runs. The live stream re-points one
 * assistant message at each successor Run (`onRunCreated`), so that message
 * accumulates every stage's output; the daemon meanwhile persists one message
 * per Run. On the post-run refresh the two views meet, and the ordinary
 * "longer local body is fresher" rule (#6396) reads the accumulation as
 * freshness and keeps it — next to the successor's own row. The successor's
 * answer then renders twice.
 *
 * Only a message with a LATER sibling in the same task qualifies: the task's
 * final Run has nothing to have absorbed, and its local copy really is the
 * freshest one.
 */
function messagesThatAbsorbedASuccessorRun(
  serverMessages: readonly ChatMessage[],
): Set<string> {
  const lastRunIndexByTask = new Map<string, number>();
  for (const message of serverMessages) {
    const task = message.strategyTaskExecutionId;
    if (!task) continue;
    const runIndex = message.strategyTaskRunIndex ?? 0;
    lastRunIndexByTask.set(task, Math.max(lastRunIndexByTask.get(task) ?? 0, runIndex));
  }
  const absorbed = new Set<string>();
  for (const message of serverMessages) {
    const task = message.strategyTaskExecutionId;
    if (!task) continue;
    if ((message.strategyTaskRunIndex ?? 0) < (lastRunIndexByTask.get(task) ?? 0)) {
      absorbed.add(message.id);
    }
  }
  return absorbed;
}

function terminalErrorEventOf(message: ChatMessage): AgentEvent | undefined {
  const events = message.events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === 'status' && event.label === 'error') return event;
  }
  return undefined;
}

/**
 * The client's record of a terminal `blocked` verdict that the server row has
 * no way to contradict — because it has no way to EXPRESS it.
 *
 * A blocked strategy task is not a failed process. The daemon writes the Run's
 * own outcome (`succeeded`, exit 0, zero error frames) and it is right to: the
 * agent answered, and the answer is on screen. What failed is the TASK — the
 * OD Next protocol gate refused the turn because the reply carried no Runtime
 * State block. `providers/daemon.ts` already resolves that verdict into the
 * turn's user-facing status (`endStatus = 'failed'` plus a structured error
 * whose `code` is the gate's reason code), so within the chat
 * `ChatMessage.runStatus` means "how this TURN ended", not "how the process
 * exited".
 *
 * `GET …/messages` returns neither half of that verdict: the daemon persists
 * no `strategyTaskBlocked` column and never wrote the client-side error frame
 * (its Run had none to write). So the post-run alignment refresh arrives
 * carrying only the process status — and the plain `{...server}` copy read that
 * silence as a correction, dropping the verdict AND its reason code. The
 * blocked card that `runtime/amr-guidance.ts` already writes for
 * `od_next_protocol_runtime_state_missing` could therefore never render: with
 * no `runStatus: 'failed'` there is no `retryAssistant`, with no
 * `retryAssistant` there is no `runFailureUi`, and the chat fell back to the
 * anonymous "task failed" card plus the English diagnostic sentence — under a
 * message labelled "completed". The same emptiness took the card's Retry with
 * it (its whole action group hangs off `runFailureUi`).
 *
 * The witnesses are deliberately narrow, so this is "the server does not know
 * about this verdict", never "the local copy wins":
 *   - the daemon's OWN terminal projection stamped the block (`onStrategyTaskSettled`);
 *   - the client already resolved the turn as failed — which excludes the
 *     blocked-but-delivered carve-out in `providers/daemon.ts`, where the Run
 *     succeeded AND delivered and the turn deliberately stays `succeeded`;
 *   - both copies describe the SAME physical Run, so a later Run's row cannot
 *     inherit an older Run's verdict;
 *   - the client holds the attribution (the error event carrying the gate's
 *     reason code) and the server row does not, so nothing is duplicated and a
 *     verdict without a reason can never resurrect an anonymous failure card.
 */
function localBlockedTurnVerdictUnknownToServer(
  server: ChatMessage,
  local: ChatMessage,
): { runStatus: ChatMessage['runStatus']; errorEvent: AgentEvent } | null {
  if (local.strategyTaskBlocked !== true) return null;
  if (local.runStatus !== 'failed') return null;
  if (!server.runId || server.runId !== local.runId) return null;
  if (terminalErrorEventOf(server)) return null;
  const errorEvent = terminalErrorEventOf(local);
  if (!errorEvent) return null;
  return { runStatus: local.runStatus, errorEvent };
}

function mergeServerMessageWithLocal(
  server: ChatMessage,
  local?: ChatMessage,
  absorbedASuccessorRun = false,
): ChatMessage {
  if (!local) return server;
  const merged: ChatMessage = { ...server };
  if (local.role === 'assistant' && server.role === 'assistant' && !absorbedASuccessorRun) {
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
  // A terminal `blocked` verdict is sticky (the daemon answers every further
  // continuation of that task with 409 STRATEGY_TASK_STATE_MISMATCH) and the
  // server row cannot carry it, so a refresh must not quietly un-block the
  // turn's question form.
  if (!server.strategyTaskBlocked && local.strategyTaskBlocked) {
    merged.strategyTaskBlocked = local.strategyTaskBlocked;
    if (server.strategyTaskBlockedText === undefined) {
      merged.strategyTaskBlockedText = local.strategyTaskBlockedText ?? null;
    }
  }
  // See `localBlockedTurnVerdictUnknownToServer`. The server's richer event log
  // stays authoritative — the client's error frame is APPENDED to it, not
  // swapped in — because the daemon's own diagnostics belong to the same turn.
  const blockedVerdict = localBlockedTurnVerdictUnknownToServer(server, local);
  if (blockedVerdict) {
    merged.runStatus = blockedVerdict.runStatus;
    if (!terminalErrorEventOf(merged)) {
      merged.events = [...(merged.events ?? []), blockedVerdict.errorEvent];
    }
  }
  // Feedback is written through a best-effort PUT after the button updates
  // the local message. A run-completion refresh can race that PUT and return
  // the previous server snapshot; blindly accepting it makes the selected
  // thumb (and the reason panel after submit) visibly snap back until reload.
  // Both copies carry the client-issued feedback timestamp, so keep the newer
  // one just like we already keep fresher streamed content/events above.
  if (
    local.feedback
    && (
      !server.feedback
      || (local.feedback.updatedAt ?? local.feedback.createdAt)
        > (server.feedback.updatedAt ?? server.feedback.createdAt)
    )
  ) {
    merged.feedback = local.feedback;
  }
  return merged;
}

export function mergeServerMessagesIntoConversation(
  current: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const absorbed = messagesThatAbsorbedASuccessorRun(serverMessages);
  const merged = serverMessages.map((message) =>
    mergeServerMessageWithLocal(
      message,
      currentById.get(message.id),
      absorbed.has(message.id),
    ),
  );
  for (const message of current) {
    if (!serverIds.has(message.id)) merged.push(message);
  }
  return normalizeConversationMessageOrder(merged);
}

export function normalizeConversationMessageOrder(messages: ChatMessage[]): ChatMessage[] {
  let normalized: ChatMessage[] | null = null;
  for (let index = 0; index < messages.length - 1; index += 1) {
    const assistant = (normalized ?? messages)[index];
    const user = (normalized ?? messages)[index + 1];
    if (
      assistant?.role !== 'assistant'
      || user?.role !== 'user'
      || typeof assistant.runId !== 'string'
      || assistant.runId.length === 0
      || typeof assistant.startedAt !== 'number'
      || typeof user.createdAt !== 'number'
      || assistant.startedAt !== user.createdAt
    ) {
      continue;
    }
    // POST /api/runs pins the assistant synchronously. Older clients persisted
    // the matching user row through a separate best-effort PUT, so the two
    // requests could land in the opposite order. The identical turn-start
    // timestamp is a narrow positive witness; unrelated assistant/user pairs
    // keep their server position.
    normalized ??= [...messages];
    normalized[index] = user;
    normalized[index + 1] = assistant;
    index += 1;
  }
  return normalized ?? messages;
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
  /**
   * Exact project-bound Workspace authority resolved by the route gate.
   * Production deep links pass this instead of borrowing the shell's mutable
   * current/default Workspace. Tests and legacy embedded callers may omit it
   * and retain the existing provider behavior.
   */
  workspaceContextOverride?: WorkspaceCollabContext | null;
  /** Fresh route-bootstrap witnesses, reused to avoid repeating scope/detail reads. */
  initialWorkspaceScope?: ProjectWorkspaceScope | null;
  initialProjectDetail?: ProjectDetailSeed | null;
  /** The seeded project row is a Team-bound placeholder, not content authority. */
  initialMaterializationPending?: boolean;
  /** Workspace/member authorization lifetime for async title reads. */
  projectAuthorizationKey?: string;
  amrAuthRetryContinuation?: AmrAuthRetryContinuation | null;
  onArmAmrAuthRetryContinuation?: (
    continuation: Omit<AmrAuthRetryContinuation, 'accountIdAtArm' | 'createdAtMs'>,
  ) => void;
  onConsumeAmrAuthRetryContinuation?: (
    continuation: AmrAuthRetryContinuation,
  ) => boolean;
  onDiscardAmrAuthRetryContinuation?: (
    continuation: AmrAuthRetryContinuation,
  ) => void;
  /**
   * The current title from the team catalog when this project is shared by
   * another member. That catalog is the naming authority; the member's local
   * mirror may carry an older real name with a newer local timestamp.
   */
  authoritativeProjectName?: string;
  /** Re-read the catalog after a metadata invalidation before merging detail. */
  resolveAuthoritativeProjectName?: (
    projectId: string,
    expectedAuthorizationKey: string,
  ) => Promise<ProjectNameAuthorityResolution>;
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
    choice: { model?: string; reasoning?: string; serviceTier?: string },
  ) => void;
  onApiModelChange?: (model: string) => void;
  onRefreshAgents: () => void;
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
  onProjectRenameStarted?: (optimistic: Project) => ProjectRenameFenceToken | null;
  onProjectRenameSettled?: (
    token: ProjectRenameFenceToken | null,
    confirmed: Project,
  ) => void;
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
  /** Lets the shell spend the optional memory-notification SSE slot only while
   * this project can produce a post-run extraction. */
  onRunActivityChange?: (projectId: string, active: boolean) => void;
}

export type ProjectRenameFenceToken = Readonly<{
  accountGeneration: number;
  scopeKey: string;
  projectId: string;
  mutationVersion: number;
}>;

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
  meta?: ProjectChatSendMeta;
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
const FALLBACK_MAX_CHAT_PANEL_WIDTH = 720;
const MIN_WORKSPACE_PANEL_WIDTH = 400;
const SPLIT_RESIZE_HANDLE_WIDTH = 8;
const BYOK_OPENCODE_UNAVAILABLE_MESSAGE =
  'BYOK API runs require OpenCode. Install OpenCode, then rescan local agents in Settings before retrying.';
const BYOK_PROVIDER_REQUIRED_MESSAGE =
  'BYOK OpenCode requires a provider, API key, and model. Complete BYOK settings before starting a run.';
const BEDROCK_BYOK_UNSUPPORTED_MESSAGE =
  'AWS Bedrock BYOK chat requires AWS credential signing and is not supported by the current API-key proxy.';
const CHAT_PANEL_KEYBOARD_STEP = 16;
const DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS = 2;
// The conversations list 404s while a project is not yet in the local daemon DB.
// For a personal project that is a transient blip, but opening a TEAM-SHARED
// project a member has not pulled yet only registers it locally after the collab
// status resolves and the auto-pull completes — several seconds against a remote
// collab backend (e.g. a packaged feature-env build round-tripping through vela).
// The old ~1s window ran out mid-pull and surfaced a hard "conversations 404"
// error on first open of a shared project. Retry on the 404 long enough to cover
// that sync (~12s); a genuinely missing project is rare on this path (the user
// navigated in from a real project list) and still surfaces the error afterward.
const CONVERSATION_LOAD_RETRY_DELAYS_MS = [
  120, 300, 600, 1000, 1500, 2000, 2500, 3500,
] as const;
type ConversationMaterializationRecovery = {
  projectId: string;
  authorityKey: string;
  generation: number;
  workspaceContext: WorkspaceCollabContext;
  errorMessage: string;
};
export function reconcileConversationRecoveryGlobalError(
  current: string | null,
  previousConversationError: string,
  nextConversationError: string,
): string {
  return current === null || current === previousConversationError
    ? nextConversationError
    : current;
}
export function createConversationMaterializationGenerationController() {
  let current = 0;
  return {
    begin(): number {
      current += 1;
      return current;
    },
    invalidate(generation: number): void {
      if (current === generation) current += 1;
    },
    isCurrent(generation: number): boolean {
      return current === generation;
    },
  };
}
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

/**
 * 从重挂的流里回放出来的状态帧,能不能改这条消息的状态。
 *
 * **不变量:daemon 已经对这条 run 给出终态裁定之后,同一条 run 回放出来的「活着」
 * 信号只是历史,不许把这一轮改回进行中。**
 *
 * 订阅之前客户端刚问过 `/api/runs/:id`。拿到终态之后仍然会去订阅(`recoverableGenericDisconnectFailed`
 * 这类路径要靠重放补回正文与产物),而 daemon 重放的是这条 run 的**完整事件日志** ——
 * 里面有它当初的 `start` 帧,`providers/daemon.ts` 收到 `start` 就发 `running`。
 * 那一帧描述的是「这条 run 当时启动了」,不是「它现在活着」。
 *
 * 让它落地的后果(真机会话 64acc867 / 消息 b7b61e19,DB 与 API 都写着 failed):
 *  · `isAssistantMessageStreaming` 看到 running 就提前返回 true,`AssistantMessage`
 *    把整轮的 `turnRunStatus` 钉成 running → 壳头「进行中」,耗时跟着 `nowMs` 永远涨
 *    (一条真实时长 20.7s 的 run 被画成 202 分钟);
 *  · `currentConversationAwaitingActiveRunAttach`(有活跃 run、又没在流)为真 → 发送禁用,
 *    而 `currentConversationControlStreaming` 为假 → 连停止按钮都没有。用户没有出路。
 *
 * run 的日志里没有 `end` 帧时(daemon 被重启打断,`terminalTrigger: "daemon_restart"`)
 * 这就是死结:再没有任何一帧能把它改回终态,刷新也解不开。
 *
 * 只挡**非终态**的帧。终态帧照常落地;daemon 的裁定本身不是终态(run 真的在跑)时
 * 整条判据关闭;流已经转到**另一条** run(strategy task 推进)时同样放行 ——
 * 那条 run 的死活与这份裁定无关。
 */
function replayedRunStatusMayLand(
  frameStatus: ChatMessage['runStatus'],
  terminalVerdict: ChatMessage['runStatus'] | null,
  frameBelongsToVerdictRun: boolean,
): boolean {
  if (!terminalVerdict) return true;
  if (!frameBelongsToVerdictRun) return true;
  return isTerminalRunStatus(frameStatus);
}

/**
 * How many REPLAY reattaches may hold a connection at the same time.
 *
 * Reopening a conversation whose messages all ended in a daemon disconnect
 * releases one reattach per message. Each one opens an SSE subscription, and
 * the browser gives an origin about six HTTP/1.1 connections for the entire
 * profile — shared with any other Open Design tab sitting in the background.
 * Firing the whole batch at once does not make the batch finish sooner; it
 * parks every other request the page still owes behind it.
 *
 * Two is deliberate rather than one: a replay is mostly connection setup plus
 * a finite event log, so a second in-flight replay keeps the pipe busy while
 * the first is being decoded, without approaching the connection budget.
 *
 * Module scope, not per-effect: the connection budget belongs to the tab, and
 * this effect re-runs on every `messages` change. A gate that was recreated
 * per run would let each re-run open its own pair.
 */
const REATTACH_REPLAY_CONCURRENCY = 2;
/**
 * A replay is a finite event log, so it settles — but a connection that dies
 * without closing does not. Cap how long one replay may hold its slot so a
 * wedged one can never stop the rest of the batch from reattaching at all;
 * exceeding the cap only means we stop counting it, never that we drop it.
 */
const REATTACH_REPLAY_MAX_HOLD_MS = 30_000;
const reattachReplayGate = createBoundedConcurrency(REATTACH_REPLAY_CONCURRENCY, {
  maxHoldMs: REATTACH_REPLAY_MAX_HOLD_MS,
});

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
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return FALLBACK_MAX_CHAT_PANEL_WIDTH;
  const workspaceMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const viewportAwareMax = splitWidth - SPLIT_RESIZE_HANDLE_WIDTH - workspaceMinWidth;
  // Keep the established 720px drag ceiling on ordinary windows, widening it
  // only as far as the equal split on larger project workspaces. That makes
  // 1:1 reachable without letting the chat drag past and dominate preview.
  const equalSplitWidth = Math.floor((splitWidth - SPLIT_RESIZE_HANDLE_WIDTH) / 2);
  const responsiveMax = Math.max(FALLBACK_MAX_CHAT_PANEL_WIDTH, equalSplitWidth);
  return Math.max(0, Math.min(responsiveMax, Math.floor(viewportAwareMax)));
}

function clampPreferredChatPanelWidth(width: number): number {
  return Math.max(MIN_CHAT_PANEL_WIDTH, Math.round(width));
}

function clampChatPanelWidth(
  width: number,
  maxWidth = FALLBACK_MAX_CHAT_PANEL_WIDTH,
): number {
  const effectiveMax = Math.max(0, Math.floor(maxWidth));
  const effectiveMin = Math.min(MIN_CHAT_PANEL_WIDTH, effectiveMax);
  return Math.min(effectiveMax, Math.max(effectiveMin, Math.round(width)));
}

export function defaultChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return DEFAULT_CHAT_PANEL_WIDTH;
  const equalHalf = (splitWidth - SPLIT_RESIZE_HANDLE_WIDTH) / 2;
  return clampChatPanelWidth(equalHalf, maxChatPanelWidthForSplit(splitWidth));
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
    'Create this project as a complete OpenDesign design system workspace.',
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
    'OpenDesign selected or inferred these workspace contexts for this turn. Treat absolute paths as reference context unless the user explicitly asks to edit them.',
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

function readSavedChatPanelWidth(): { width: number; customized: boolean } {
  if (typeof window === 'undefined') {
    return { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false };
  }
  try {
    const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed)
      ? { width: clampPreferredChatPanelWidth(parsed), customized: true }
      : { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false };
  } catch {
    return { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false };
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

function stableIdentityDigest(value: string): string {
  // FNV-1a 64-bit keeps the daemon-facing id bounded while preserving a
  // deterministic identity across retries and ProjectView remounts.
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36).padStart(13, '0');
}

function homeAutoSendIdentity(projectId: string): Pick<
  ProjectChatSendMeta,
  'assistantMessageId' | 'clientRequestId' | 'userMessageId'
> {
  const handoffId = `home-auto-send-${stableIdentityDigest(projectId)}`;
  return {
    clientRequestId: handoffId,
    userMessageId: `${handoffId}-user`,
    assistantMessageId: `${handoffId}-assistant`,
  };
}

/**
 * A question form's answer is one payload with one identity.
 *
 * "At most one user answer message and one non-failed run per
 * sourceAssistantMessageId + formId" cannot be a property of the form's own
 * submit lock: a second tab, a reload in a context that denies storage, and a
 * queue replay all reach the host without that lock. Deriving the send's ids
 * from the occurrence makes the guarantee a property of the request, and every
 * layer that already dedupes on identity then enforces it for free — the
 * conversation queue keys entries on `clientRequestId`, the answer row keeps
 * one `userMessageId` instead of appending a second, and the daemon's
 * `createOrReuse` returns the first run rather than spawning another.
 *
 * A form rendered without a known occurrence (no source message, no form id)
 * keeps the per-send random identity it has always had.
 *
 * The row and the run are claimed by two different authorities, both of which
 * decide on this identity. `handleSend` persists the user row before the
 * daemon has answered, so the row's exactly-once cannot be decided here: the
 * write goes out `createOnly`, and the daemon — where the check and the write
 * are one operation — keeps the first accepted answer and returns it. The run
 * is claimed by `createOrReuse` on the same key. A later submitter therefore
 * adds neither a second answer nor a second run, and adopts the answer that
 * actually ran instead of displaying one no run ever saw.
 */
function questionFormAnswerIdentity(
  sourceAssistantMessageId: string | undefined,
  formId: string | undefined,
): Pick<ProjectChatSendMeta, 'clientRequestId' | 'userMessageId'> {
  if (!sourceAssistantMessageId || !formId) return {};
  const answerId = `qf-answer-${stableIdentityDigest(`${sourceAssistantMessageId}:${formId}`)}`;
  return { clientRequestId: answerId, userMessageId: `${answerId}-user` };
}

function autoSendPromptKey(projectId: string): string {
  return `od:auto-send-prompt:${projectId}`;
}

function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
}

function autoSendContextKey(projectId: string): string {
  return `od:auto-send-context:${projectId}`;
}

/** Exact workspace/member authority checked by the Home AMR preflight. */
function autoSendAmrGateWitnessKey(projectId: string): string {
  return `od:auto-send-amr-gate-witness:${projectId}`;
}

function legacyAutoSendAmrGateOkKey(projectId: string): string {
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

function readAutoSendPrompt(projectId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(autoSendPromptKey(projectId));
  } catch {
    return null;
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

function readAutoSendAmrGateWitness(
  projectId: string,
): AmrBalanceGateScope | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(
      autoSendAmrGateWitnessKey(projectId),
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return isAmrBalanceGateScope(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function clearAutoSendSession(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(autoSendFirstMessageKey(projectId));
    window.sessionStorage.removeItem(autoSendPromptKey(projectId));
    window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
    window.sessionStorage.removeItem(autoSendContextKey(projectId));
    window.sessionStorage.removeItem(autoSendAmrGateWitnessKey(projectId));
    window.sessionStorage.removeItem(legacyAutoSendAmrGateOkKey(projectId));
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

function projectFileContentSnapshotsEqual(
  a: ProjectFile[],
  b: ProjectFile[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const byPath = new Map(a.map((file) => [file.path ?? file.name, file]));
  return b.every((file) => {
    const previous = byPath.get(file.path ?? file.name);
    return previous != null
      && previous.name === file.name
      && previous.path === file.path
      && previous.type === file.type
      && previous.size === file.size
      && previous.mtime === file.mtime
      && previous.kind === file.kind
      && previous.mime === file.mime;
  });
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

/**
 * Whether a project open should start with the chat pane collapsed (workspace
 * focus mode). Uses `useProjectCollab`'s confirmed shared-non-owner signal
 * (`isSharedNonOwner`) — not raw `isOwner` — so a catalog-confirmed owner whose
 * `/collab/status` payload is still missing `ownerMemberId` does not latch into
 * focus mode permanently (review: sticky apply ref).
 */
export function shouldDefaultCollapseChatForSharedNonOwner(collab: {
  enabled: boolean;
  isSharedNonOwner: boolean;
}): boolean {
  return collab.enabled && collab.isSharedNonOwner;
}

/**
 * B11 —— 「当前 agent 不支持中途插话」什么时候才**说得通**。
 *
 * 这句话是对「队列里那颗为什么不是『引导对话』」的解释,而「引导」只有在
 * **有一轮正在跑**的时候才存在。一轮都没在跑、队列纯粹排着等的时候,没有任何
 * 东西可以插话:那颗按钮就是普通的「立即发送」,不打断任何东西 —— 这时候再解释
 * 「不支持中途插话」,是在回答一个没人问的问题。
 */
export function shouldExplainMidTurnSteeringUnsupported(input: {
  steerableRunId: string | null;
  agentSupportsSteering: boolean;
}): boolean {
  return Boolean(input.steerableRunId) && !input.agentSupportsSteering;
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
  '--project-chat-handle-width': string;
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
    '--project-chat-handle-width': `${SPLIT_RESIZE_HANDLE_WIDTH}px`,
    '--project-workspace-panel-track': workspacePanelTrack,
  };
}

// Writes the two animatable width custom properties directly (see the
// `@property` registrations + `.split` / `.split.split-focus` transition
// rules in shell.css) instead of composing a `gridTemplateColumns` string —
// the grid layout is always driven by
// `var(--project-chat-panel-width) var(--project-chat-handle-width) var(--project-workspace-panel-track)`
// declared once on `.split`, so a plain custom-property write is all a
// collapse/expand or a live resize needs to animate or track the cursor.
function applySplitChatPanelWidth(
  split: HTMLDivElement | null,
  width: number,
  workspacePanelTrack: string,
  workspaceFocused: boolean,
): void {
  if (!split) return;
  if (workspaceFocused) {
    // Workspace-focused mode collapses the chat column through the
    // `.split-focus` CSS class alone (see `projectSplitStyle`, which
    // deliberately returns no inline style while focused). A resize firing
    // while focused still reaches this function via the ResizeObserver
    // effect below; without this guard it would write stale inline width
    // overrides back onto the element, which — as inline styles — outrank
    // the `.split-focus` class rule's `0px` values and reintroduce the
    // (hidden, so blank) chat column as dead space.
    split.style.removeProperty('--project-chat-panel-width');
    split.style.removeProperty('--project-chat-handle-width');
    split.style.removeProperty('--project-workspace-panel-track');
    return;
  }
  split.style.setProperty('--project-chat-panel-width', `${width}px`);
  split.style.setProperty('--project-chat-handle-width', `${SPLIT_RESIZE_HANDLE_WIDTH}px`);
  split.style.setProperty('--project-workspace-panel-track', workspacePanelTrack);
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
// image project was created with the dialog's default `vela/gpt-image-2` keeps their
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
  if (!isOpenCodeByokChatProtocol(config.apiProtocol)) return undefined;
  const selectedProvider = selectedKnownProviderForConfig(config);
  const model = config.model.trim();
  if (
    (byokProviderRequiresApiKey(config.apiProtocol, selectedProvider, config.baseUrl)
      && !config.apiKey.trim())
    || !model
    || model.toLowerCase() === 'default'
    || (config.apiProtocol === 'azure' && !config.baseUrl.trim())
  ) {
    return undefined;
  }
  return {
    protocol: config.apiProtocol,
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl.trim(),
    model,
    ...(config.apiProtocol === 'azure' && config.apiVersion?.trim()
      ? { apiVersion: config.apiVersion.trim() }
      : {}),
    requiresApiKey: byokProviderRequiresApiKey(
      config.apiProtocol,
      selectedProvider,
      config.baseUrl,
    ),
  };
}

function selectedKnownProviderForConfig(config: AppConfig) {
  if (!config.apiProtocol) return undefined;
  return KNOWN_PROVIDERS.find(
    (provider) =>
      provider.protocol === config.apiProtocol
      && provider.baseUrl === config.baseUrl
      && (
        config.apiProviderBaseUrl == null
        || provider.baseUrl === config.apiProviderBaseUrl
      ),
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
  // Collab realtime hop-2 invalidations are handled directly in
  // `handleProjectEvent` (they trigger targeted re-fetches, not artifact cards).
  if (
    evt.type === 'comment-changed' ||
    evt.type === 'presence-changed' ||
    evt.type === 'project-metadata-changed' ||
    evt.type === 'project-content-transfer-state' ||
    // Same shape of signal: `handleProjectEvent` turns it into a targeted
    // conversation re-read. It must be named here rather than left to fall
    // through — the tail of this function assumes whatever survives is a
    // live-artifact refresh and reads `evt.phase` off it.
    evt.type === 'chat-artifact-refs-changed'
  ) {
    return null;
  }
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

const SHARED_PROJECT_PLACEHOLDER_NAME = '共享项目';

export type ProjectNameAuthorityResolution =
  | { kind: 'resolved'; name: string | null }
  | { kind: 'stale' };

/**
 * Reconcile the route/list snapshot with the daemon detail response.
 *
 * A shared-project placeholder is created locally with `updatedAt = now`, so
 * timestamp-only selection can make it look newer than the catalog row whose
 * real title the user already saw. Detail still owns newer project fields, but
 * it must never replace a meaningful catalog title with that transport
 * placeholder. The project-id check also keeps a late response from a previous
 * route out of the next project.
 */
export function reconcileProjectDetail(
  project: Project,
  detail: Project | null,
  authoritativeProjectName?: string | null,
): Project {
  const authoritativeName = authoritativeProjectName?.trim() || null;
  const routedProject = authoritativeName
    ? { ...project, name: authoritativeName }
    : project;
  if (!detail || detail.id !== project.id || detail.updatedAt < project.updatedAt) {
    return routedProject;
  }
  const projectName = routedProject.name.trim();
  const detailName = detail.name.trim();
  if (
    detailName === SHARED_PROJECT_PLACEHOLDER_NAME
    && projectName
    && projectName !== SHARED_PROJECT_PLACEHOLDER_NAME
  ) {
    // The placeholder is an unmaterialized transport row, not a newer project
    // authority. Reject the whole row so its null skill/design metadata cannot
    // regress the catalog/local record along with its synthetic title.
    return routedProject;
  }
  return authoritativeName ? { ...detail, name: authoritativeName } : detail;
}

export function ProjectView({
  project,
  workspaceContextOverride,
  initialWorkspaceScope,
  initialProjectDetail,
  initialMaterializationPending = false,
  projectAuthorizationKey = project.id,
  amrAuthRetryContinuation = null,
  onArmAmrAuthRetryContinuation,
  onConsumeAmrAuthRetryContinuation,
  onDiscardAmrAuthRetryContinuation,
  authoritativeProjectName,
  resolveAuthoritativeProjectName,
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
  onProjectRenameStarted,
  onProjectRenameSettled,
  onProjectsRefresh,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onDesignSystemsRefresh,
  onCreateProjectFromDesignSystem,
  onCreateDesignSystemFromProject,
  onDuplicateProject,
  onRunActivityChange,
}: Props) {
  const { locale, t } = useI18n();
  const amrAuthRetryMountIdRef = useRef<string | null>(null);
  if (amrAuthRetryMountIdRef.current === null) {
    amrAuthRetryMountIdRef.current = randomUUID();
  }
  const activeAuthorizationLifetimeRef = useRef<string | null>(projectAuthorizationKey);
  /**
   * The Home-carried attachments, by every name the workspace might list them
   * under. `selectPrimaryProjectFile` uses it to NOT auto-open a file the user
   * merely attached to their prompt.
   *
   * This can no longer be a first-render snapshot. The project frame now opens
   * while those files are still uploading, so at mount the only names we have
   * are the local ones the picker gave us; the server paths arrive later. Both
   * sources are folded in, and the set keeps refreshing until the uploads are
   * done — a snapshot taken mid-upload would let a just-uploaded attachment
   * win the initial-open race it is supposed to be excluded from.
   */
  const initialHomeAttachmentFileNamesRef = useRef<{
    projectId: string;
    fileNames: Set<string>;
  } | null>(null);
  const refreshInitialHomeAttachmentFileNames = useCallback(() => {
    const current = initialHomeAttachmentFileNamesRef.current;
    const fileNames = current?.projectId === project.id ? current.fileNames : new Set<string>();
    let isHomeAutoSend = false;
    try {
      isHomeAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
    } catch {
      /* sessionStorage may be unavailable; use ordinary initial selection. */
    }
    if (isHomeAutoSend) {
      for (const upload of homeAttachmentUploadsFor(project.id)) fileNames.add(upload.name);
      for (const attachment of readAutoSendAttachments(project.id)) {
        fileNames.add(attachment.path);
        const baseName = attachment.path.split('/').pop();
        if (baseName) fileNames.add(baseName);
        if (attachment.name) fileNames.add(attachment.name);
      }
    }
    initialHomeAttachmentFileNamesRef.current = { projectId: project.id, fileNames };
    return fileNames;
  }, [project.id]);
  if (initialHomeAttachmentFileNamesRef.current?.projectId !== project.id) {
    refreshInitialHomeAttachmentFileNames();
  }

  useEffect(() => {
    activeAuthorizationLifetimeRef.current = projectAuthorizationKey;
    return () => {
      if (activeAuthorizationLifetimeRef.current === projectAuthorizationKey) {
        activeAuthorizationLifetimeRef.current = null;
      }
    };
  }, [projectAuthorizationKey]);
  const analytics = useAnalytics();
  const ambientWorkspaceContextState = useWorkspaceContext();
  const workspaceContextState = workspaceContextOverride !== undefined
    ? {
        context: workspaceContextOverride,
        loading: false,
        identityChangePending: false,
      }
    : ambientWorkspaceContextState;
  const { context: workspaceContext } = workspaceContextState;
  const projectWorkspaceScopeState = useProjectWorkspaceScope(
    project.id,
    workspaceContext,
    project.workspaceId,
    initialWorkspaceScope,
  );
  // The project's resolved scope when there is one. While that first read is
  // pending, the persisted project binding may witness the matching caller;
  // answered unavailable states deliberately do not borrow it.
  const resolvedProjectRunWorkspaceContext = runWorkspaceIdentity(
    projectWorkspaceScopeState,
    workspaceContext,
    project.workspaceId,
  );
  const personalAdoptionContext = runWorkspacePersonalAdoptionWitness(
    projectWorkspaceScopeState,
    workspaceContext,
    project.workspaceId,
  );
  // Scope revalidation returns a freshly decoded context object even when the
  // data-plane authority did not change. Project hydration is keyed to the
  // authority carried by resource requests, not that object's allocation:
  // replacing an equivalent object must not blank conversations, messages,
  // tabs, or files while the same project remains open.
  const projectRunAuthorityKey = workspaceIdentityCacheKey(
    resolvedProjectRunWorkspaceContext,
  );
  const amrAuthRetryPersonalAdoptionWitness:
    AmrAuthRetryPersonalAdoptionWitness | null = personalAdoptionContext
      ? {
          workspaceIdentityKey: workspaceIdentityCacheKey(personalAdoptionContext),
          workspaceId: personalAdoptionContext.workspaceId,
          workspaceMemberId: personalAdoptionContext.workspaceMemberId,
          workspaceType: 'personal',
          memberStatus: 'active',
        }
      : null;
  const canonicalProjectRunWorkspaceContextRef = useRef<{
    authorityKey: string;
    context: WorkspaceCollabContext | null;
  }>({
    authorityKey: projectRunAuthorityKey,
    context: resolvedProjectRunWorkspaceContext,
  });
  if (
    canonicalProjectRunWorkspaceContextRef.current.authorityKey
    !== projectRunAuthorityKey
  ) {
    canonicalProjectRunWorkspaceContextRef.current = {
      authorityKey: projectRunAuthorityKey,
      context: resolvedProjectRunWorkspaceContext,
    };
  }
  const projectRunWorkspaceContext =
    canonicalProjectRunWorkspaceContextRef.current.context;
  const projectResourceAuthority: ProjectResourceAuthority =
    projectWorkspaceScopeState.failure === 'forbidden'
    || projectWorkspaceScopeState.failure === 'unsupported'
      ? 'denied'
      : projectWorkspaceScopeState.scope?.kind === 'unbound'
        ? 'local'
        : projectRunWorkspaceContext
          ? 'workspace'
          : 'pending';
  const projectResourceAuthorityRef = useRef(projectResourceAuthority);
  projectResourceAuthorityRef.current = projectResourceAuthority;
  const projectRunWorkspaceContextRef = useRef(projectRunWorkspaceContext);
  projectRunWorkspaceContextRef.current = projectRunWorkspaceContext;
  // The AMR pre-run balance gate uses the project's resolved scope, or the one
  // narrow adoption witness returned above: an exact active Personal caller
  // for an explicitly unbound historical project. When no safe witness exists,
  // handleSend skips the local balance preflight and lets the daemon return its
  // explicit authorization/adoption decision. It must never inspect an
  // unrelated account wallet just because project scope is inconclusive.
  const projectRunBillingContext = projectWorkspaceContext(
    projectWorkspaceScopeState.scope,
  );
  // A pending first scope read may use the exact ambient caller only when
  // runWorkspaceIdentity has already proven it matches project.workspaceId.
  // That same safe witness is valid for the balance preflight. Settled
  // unavailable/forbidden states produce no run identity and therefore no
  // preflight context; they must never fall through to the Personal wallet.
  const projectRunPreflightContext =
    projectRunBillingContext ?? projectRunWorkspaceContext;
  const cloudModelSelected = config.mode === 'daemon' && config.agentId === 'amr';
  const projectRunRequiresWorkspaceScope = cloudModelSelected;
  // An OpenDesign Cloud run needs a wallet, and the ONLY client-side veto is
  // "there is no billing principal at all". Either witness suffices: the
  // caller's own cloud identity, or a project scope that already names an
  // explicit personal/team principal.
  //
  // What this deliberately stops doing is requiring the PROJECT's membership
  // projection to resolve before a send. A transient directory failure says
  // nothing authoritative about access or billing: the daemon still forwards
  // the project's persisted Workspace id with the signed-in account, and Vela
  // makes the final membership/balance decision. It must not be converted to a
  // Personal run. A settled unbound historical project is also allowed to
  // reach the daemon: with an exact Personal witness it may be transactionally
  // adopted; with a Team/absent witness the daemon rejects it explicitly.
  // An explicit backend rejection is preferable to a client-side dead button
  // or a popup for the wrong wallet.
  //
  // Strictly a widening: every state this admits was previously blocked, and
  // nothing previously admitted becomes blocked.
  const projectRunHasBillableAmrPrincipal =
    !projectRunRequiresWorkspaceScope ||
    projectWorkspaceScopeState.scope?.kind === 'unbound' ||
    workspaceIdentityCanBillAmr(workspaceContextState) ||
    projectWorkspaceScopeAuthorizesAmr(projectWorkspaceScopeState.scope);
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
  // ProjectView is the authorization lifetime for project-owned file content.
  // FileViewer may unmount while switching to a root tab such as Design Files,
  // but ProjectView remains mounted in that flow so revisit snapshots survive.
  // Leaving the project (or changing project identity) crosses the boundary:
  // drop every source snapshot before a later mount can seed content that the
  // next project/workspace context has not reauthorized.
  // `viewerOnly` is not a revocation signal: it also represents authorized
  // read-only members, so this ProjectView lifetime is the fail-closed boundary.
  useEffect(() => () => {
    invalidateHtmlSourceSnapshotProject(project.id);
  }, [project.id]);
  // Team collaboration: presence for a shared project. Dormant (no heartbeat,
  // renders nothing) unless the workspace context marks the viewer an active
  // team member — safe to mount unconditionally.
  const projectCollab = useProjectCollab(project?.id ?? null, {
    workspaceContext: projectRunWorkspaceContext,
    workspaceContextLoading: projectWorkspaceScopeState.loading,
    initialMaterializationPending,
    // The daemon's own `workspace_projects` verdict for this project. A
    // `personal` row is the same authority its write gate consults, so the
    // read-only banner must not outlive it when `/collab/status` cannot
    // answer (OPEND-2624).
    projectVisibility: projectWorkspaceVisibility(projectWorkspaceScopeState.scope),
    presenceFilePath: project?.metadata?.entryFile ?? null,
  });
  // A Team-bound placeholder is safe to render and comment around, but its
  // empty tree is never a writer authority. Reuse the established viewer-only
  // gates for content/run/project mutations until the daemon's own status poll
  // proves first materialization finished. Keep the read-only ownership banner
  // keyed to `projectCollab.viewerOnly` below so an owner reinstall sees a
  // syncing project, not the misleading “shared by someone else” notice.
  const projectMutationReadOnly =
    projectCollab.viewerOnly || projectCollab.materializationPending;
  const { resolve: resolvePresenceMember } = useTeamMembers(
    currentUserDirectoryEntry(projectRunWorkspaceContext),
    projectRunWorkspaceContext,
  );
  // Tab layout is private browser state for a read-only Team viewer. Keep its
  // identity-partitioned local cache working, but only let a positively proven
  // project writer update the daemon's shared project row. Personal and legacy
  // unbound projects retain their existing local-daemon persistence once the
  // daemon has settled that scope. The local project row is not an unbound
  // authority witness: it can lag a daemon-side Team binding.
  const projectTabsCanPersistToDaemon =
    projectWorkspaceScopeState.scope?.kind === 'unbound'
    || projectWorkspaceScopeState.scope?.kind === 'personal'
    || (
      projectWorkspaceScopeState.scope?.kind === 'team'
      && projectCollab.writerAuthority === 'allowed'
    );
  const projectTabsCanPersistToDaemonRef = useRef(
    projectTabsCanPersistToDaemon,
  );
  projectTabsCanPersistToDaemonRef.current = projectTabsCanPersistToDaemon;
  // Stable references (useCallback with empty deps inside useCollab) — safe
  // for the project-events handler's dependency array without re-subscribing.
  const {
    refreshPresence: collabRefreshPresence,
    checkStatusNow: collabCheckStatusNow,
  } = projectCollab;
  // Read-only banner copy: when the collab cloud resolved who shared this project,
  // name them ("这是 麻薯 创建的共享项目…"); otherwise fall back to the name-less
  // notice. Only computed when the viewer is actually read-only.
  const readonlyNoticeText = projectCollab.viewerOnly
    ? projectCollab.ownerDisplayName
      ? t('workspace.readonlyNoticeBy', { owner: projectCollab.ownerDisplayName })
      : t('workspace.readonlyNotice')
    : undefined;
  // Team-share file-sync badge for the design-files tab bar + empty state
  // (recvqghymxqQQq). A member downloads (their local mirror trails the
  // published head); the owner uploads (a local edit hasn't published yet).
  // The two are mutually exclusive — a project has exactly one writer — so at
  // most one of these is ever true.
  const fileSyncBadge: 'downloading' | 'uploading' | null = projectCollab.downloadPending
    ? 'downloading'
    : projectCollab.enabled && projectCollab.isOwner && projectCollab.syncState === 'pending_upload'
      ? 'uploading'
      : null;
  const projectDetail = useProjectDetail(
    project.id,
    projectRunWorkspaceContext,
    project.workspaceId,
    initialProjectDetail,
  );
  const detailedProject = projectDetail.project?.id === project.id ? projectDetail.project : null;
  const currentProject = reconcileProjectDetail(
    project,
    detailedProject,
    authoritativeProjectName,
  );
  let projectTitleTooltip = currentProject.name;
  if (projectMutationReadOnly) projectTitleTooltip = t('workspace.readonlyNotice');
  if (projectCollab.materializationPending) projectTitleTooltip = t('designFiles.syncing');
  const resolvedProjectDesignSystemId = resolveProjectDesignSystemId(currentProject);
  // A project can outlive a Design System being disabled in Settings. Keep the
  // persisted project value intact for recovery, but do not inject a disabled
  // system into a new runtime turn.
  const projectDesignSystemId = resolvedProjectDesignSystemId;
  const runtimeDesignSystemId =
    projectDesignSystemId && (config.disabledDesignSystems ?? []).includes(projectDesignSystemId)
      ? null
      : projectDesignSystemId;
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
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const [pendingEmptyConversationSeed, setPendingEmptyConversationSeed] =
    useState<{ projectId: string; authorityKey: string } | null>(null);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );
  // Team collaboration: persist a comment that drifted to `lost` so its ghost
  // pin survives reload. Only ProjectView has the active conversation id the
  // anchor route needs; fed to the drift ladder through the collab context.
  const handleLostAnchors = useCallback(
    (writeBacks: AnchorWriteBack[]) => {
      if (!activeConversationId || writeBacks.length === 0) return;
      void persistCommentAnchors({
        projectId: project.id,
        conversationId: activeConversationId,
        writeBacks,
        workspaceContext: projectRunWorkspaceContext,
      });
    },
    [project.id, activeConversationId, projectRunWorkspaceContext],
  );
  const collabValue = useMemo<CollabContextValue>(
    () => ({
      ...projectCollab,
      workspaceContext: projectRunWorkspaceContext,
      workspaceContextLoading: projectWorkspaceScopeState.loading,
      projectResourceAuthority,
      onLostAnchors: handleLostAnchors,
    }),
    [
      projectCollab,
      projectRunWorkspaceContext,
      projectWorkspaceScopeState.loading,
      projectResourceAuthority,
      handleLostAnchors,
    ],
  );
  const activeSessionMode = activeConversation?.sessionMode ?? 'design';
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null);
  const [failedMessagesConversationId, setFailedMessagesConversationId] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const conversationMaterializationRecoveryRef =
    useRef<ConversationMaterializationRecovery | null>(null);
  const conversationMaterializationGenerationControllerRef =
    useRef<ReturnType<typeof createConversationMaterializationGenerationController> | null>(null);
  const conversationMaterializationGenerationController =
    conversationMaterializationGenerationControllerRef.current
    ?? createConversationMaterializationGenerationController();
  conversationMaterializationGenerationControllerRef.current =
    conversationMaterializationGenerationController;
  const conversationMaterializationRecoveryInFlightRef =
    useRef<ConversationMaterializationRecovery | null>(null);
  const [messageLoadRetryNonce, setMessageLoadRetryNonce] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
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
  // Every local comment commit invalidates older in-flight list reads. The
  // initial read and the SSE/poll refresher use the same generation as a
  // commit witness, so a slow response can never resurrect a locally deleted
  // comment or replace a newer add/status update.
  const previewCommentsGenerationRef = useRef(0);
  const commitPreviewComments = useCallback((next: SetStateAction<PreviewComment[]>) => {
    previewCommentsGenerationRef.current += 1;
    setPreviewComments(next);
  }, []);
  // Mirror so the send-now interrupt path can read the current statuses
  // synchronously without re-creating its callback on every comment change.
  const previewCommentsRef = useRef<PreviewComment[]>([]);
  useEffect(() => {
    previewCommentsRef.current = previewComments;
  }, [previewComments]);
  const [attachedComments, setAttachedComments] = useState<PreviewComment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const [paneError, setPaneError] = useState<{
    message: string;
    sourceAssistantId: string | null;
  } | null>(null);
  const error = paneError?.message ?? null;
  const errorSourceAssistantId = paneError?.sourceAssistantId ?? null;
  const setError = useCallback((next: SetStateAction<string | null>) => {
    setPaneError((current) => {
      const currentMessage = current?.message ?? null;
      const message = typeof next === 'function' ? next(currentMessage) : next;
      if (message == null) return null;
      return {
        message,
        sourceAssistantId:
          typeof next === 'function' && message === currentMessage
            ? current?.sourceAssistantId ?? null
            : null,
      };
    });
  }, []);
  const setRunError = useCallback((message: string, sourceAssistantId: string) => {
    setPaneError({ message, sourceAssistantId });
  }, []);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  const filesRefreshRequestKeyRef = useRef(0);
  const bumpFilesRefresh = useCallback(() => {
    setFilesRefresh((current) => {
      const next = current + 1;
      filesRefreshRequestKeyRef.current = next;
      return next;
    });
  }, []);
  // True while a working-dir replace is reindexing the new folder. Surfaced
  // to the Design Files panel so the file list shows a loading state instead
  // of silently sitting on the old tree for the few seconds the scan takes.
  const [projectFilesSnapshot, setProjectFilesSnapshot] = useState<{
    files: ProjectFile[];
    refreshKey: number;
    generation: number;
  }>({ files: [], refreshKey: 0, generation: 0 });
  const projectFiles = projectFilesSnapshot.files;
  const committedFilesRefreshKey = projectFilesSnapshot.refreshKey;
  const committedFilesGeneration = projectFilesSnapshot.generation;
  const projectFilesGenerationRef = useRef(committedFilesGeneration);
  const committedFilesRefreshKeyRef = useRef(committedFilesRefreshKey);
  committedFilesRefreshKeyRef.current = committedFilesRefreshKey;
  const projectFilesRef = useRef<ProjectFile[]>([]);
  const projectFilesRequestSeqRef = useRef(0);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);
  const [workspaceFocused, setWorkspaceFocused] = useState(false);
  // Read by `renderPreferredChatPanelWidth` instead of closing over
  // `workspaceFocused` directly, so that callback's identity (and therefore
  // the ResizeObserver effect keyed on it, below) doesn't need to depend on
  // focus state — see the render-phase mirror below for why.
  const workspaceFocusedRef = useRef(workspaceFocused);
  // Keep this render-phase mirror synchronous with the state that determines
  // the committed `.split-focus` class. A child layout effect (and, in the
  // browser, ResizeObserver delivery before passive effects) can run before a
  // parent effect, so effect-based synchronization still exposes one stale
  // frame where the old three-column widths can be written back inline.
  workspaceFocusedRef.current = workspaceFocused;
  // Mirrors `workspaceFocused` but lags behind it while collapsing, so the
  // chat pane stays mounted/visible until the `.split` width transition
  // actually finishes — see the sync effect near the ResizeObserver below.
  const [chatSlotHidden, setChatSlotHidden] = useState(workspaceFocused);
  // Chat-column dock host for the workspace tab strip (workspaceTabsDock.ts);
  // FileWorkspace registers its own focus-mode host when the chat collapses.
  const chatTabsDockRef = useWorkspaceTabsDockRef();
  const [commentInspectorActive, setCommentInspectorActive] = useState(false);
  const commentInspectorPortalId = useId();
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
  const designMdState = useDesignMdState(
    project.id,
    designMdRefreshKey,
    projectRunWorkspaceContext,
  );
  const finalize = useFinalizeProject(project.id, projectRunWorkspaceContext);
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
      /**
       * 这一档同时唤起哪个弹窗 —— 由**身份 × 订阅**决定(规格 §6.V):
       * `upgrade` 是现有的余额不足升级弹窗(非 Max · owner);`ask_owner` 是
       * 「找所有者充值」那张(所有非 owner 成员);`null` 是不弹窗
       * (Max · owner —— 他没有更高的套餐可买,卡上那颗按钮直接落在自动充值上,
       * 中间再插一张弹窗只是多一次点击)。
       *
       * 决定在**拦截发生的那一刻**做完并记下来,而不是渲染时再算:身份换了
       * (切工作区)不该把一张已经开着的弹窗换成另一张。
       */
      dialog: AmrBalanceBlockedDialogKind;
      snapshot: AmrWalletSnapshot;
      conversationId: string;
    } | null
  >(null);
  /**
   * 余额提示卡(交付稿第 75 / 76 格)要显示的余额,`null` = 不提示。
   *
   * 产品 2026-08-26 裁决:「**告警可继续的不弹窗,只有卡片;余额不足再弹窗**」。
   * 于是这里成了告警档**唯一**的呈现方式 —— 它不挡发送(D4),卡在流水里,
   * 和输入框无关。拦截档弹窗保留,但也会同时点亮这张卡。
   *
   * 判定本身没动(`runtime/amr-balance-gate.ts`),这只是判定结果的呈现。
   */
  const [amrBalanceCardUsd, setAmrBalanceCardUsd] = useState<number | null>(null);
  /**
   * 出这张卡时那份钱包读数的 profile。只在**没有工作区上下文**时用得到 ——
   * 那种情况下升级链接退回 profile 兜底(和 `AmrBalanceDialog` 同一条规则)。
   */
  const [amrBalanceCardProfile, setAmrBalanceCardProfile] = useState<string | null>(null);
  /**
   * **跑到一半死在钱上的那一轮,也要点亮同一张卡。**
   *
   * 用户 2026-09-02 裁决:「额度不足和额度耗尽,升级卡各只有一张,不存在第二张
   * 白色通用报错卡」。上面那两处 `setAmrBalanceCardUsd` 都在**发送前**的余额闸门
   * 里 —— 闸门看不出问题、run 起来了、跑到一半才耗尽的那一格,在此之前只有
   * daemon 的 `AMR_INSUFFICIENT_BALANCE` → 通用白卡。白卡那一半已经由
   * `amr-guidance` 的 `suppressCard` 撤掉,这里补上另一半。
   *
   * 判据从**消息**上读,不挂在 `onError` 回调里:错误事件是落库的,所以刷新之后
   * 卡还在;而发送路径和重挂路径各有一个 `onError`,挂回调等于要在两处各写一遍,
   * 漏一处就是刷新后卡消失。
   */
  const amrBalanceFailureMessageId = useMemo(
    () => amrInsufficientBalanceFailureMessageId(messages),
    [messages],
  );
  /**
   * **补查落空了没有。** 落空 = 报错卡那一半没人接得住,得还回去。
   *
   * 三态,不是两态:`false` 同时覆盖「没有这样一轮失败」和「补查还在路上」——
   * 这两格都不该画白卡。前者本来就没有失败可说,后者画了就会先闪一下白卡再
   * 换成升级卡,把裁决里的「一张卡」闪成两张。只有**查完了、确实没有数字**
   * 那一格才置 true。
   */
  const [amrBalanceFailureWalletUnavailable, setAmrBalanceFailureWalletUnavailable] =
    useState(false);
  /**
   * 补查要读**哪个钱包**。
   *
   * 和发送前那道闸门钉在同一个工作区身份上(`projectRunPreflightContext`)——
   * 这一轮的钱是从那儿出的。少了这一步,补查会去读账号级的
   * `/api/integrations/vela/wallet`,而那条请求里根本没有 workspace 参数
   * (`daemon/src/routes/vela.ts:601`):团队项目会念出这个人**个人账号**的余额。
   * 那不是「数字略有出入」,是整张卡说反 —— 团队钱包 $0 的那一轮会被个人的
   * $12.50 画成橙色的「余额可能撑不完下一个任务」,而真相是「现在无法开始新任务」,
   * 且他把个人钱包充满也救不了这个团队。
   *
   * 判据字符串化之后当 effect 的依赖:scope 落定得比这条失败晚时,effect 会
   * 自己重跑一次把数字换过来,不需要额外的等待态。
   */
  const amrBalanceCardScope = useMemo(
    () => amrBalanceGateScopeForWorkspaceContext(projectRunPreflightContext),
    [projectRunPreflightContext],
  );
  const amrBalanceCardScopeKey = amrBalanceCardScope
    ? `${amrBalanceCardScope.workspaceType}:${amrBalanceCardScope.workspaceId}:${amrBalanceCardScope.workspaceMemberId}`
    : '';
  const amrBalanceCardScopeRef = useRef(amrBalanceCardScope);
  amrBalanceCardScopeRef.current = amrBalanceCardScope;
  useEffect(() => {
    if (!amrBalanceFailureMessageId) {
      setAmrBalanceFailureWalletUnavailable(false);
      return;
    }
    let cancelled = false;
    // 换了一轮失败就重新查:上一轮的结论不能替这一轮回答。
    setAmrBalanceFailureWalletUnavailable(false);
    void (async () => {
      // 失败事件本身**不带余额**(daemon 的 `classifyAmrAccountFailure` 只给出
      // 错误码),所以数字只能现查。有工作区身份就走闸门那条被后端证明过的
      // 工作区读数,没有(旧的未绑定项目)才退回账号钱包 —— 那种项目花的
      // 本来就是账号的钱。
      const snapshot = await fetchAmrBalanceCardWalletSnapshot(
        amrBalanceCardScopeRef.current,
      );
      if (cancelled) return;
      // 读不出确定的数字就**什么都不念**。这张卡把余额报给用户,编一个出来
      // 比不出卡更糟 —— 判定用的是和闸门同一条解析规则,两处不另算。
      //
      // 但「不念数字」不等于「不给出路」:这一轮是死在钱上的,充值入口是它
      // 唯一的自救口。所以这里把落空**说出来**,由 ChatPane 把白色报错卡
      // (充值 + 重试)还回来,而不是两张卡都不画、屏幕上什么都不剩。
      const balanceUsd = amrBalanceCardBalanceUsd(snapshot);
      if (balanceUsd == null) {
        setAmrBalanceFailureWalletUnavailable(true);
        return;
      }
      setAmrBalanceCardUsd(balanceUsd);
      setAmrBalanceCardProfile(snapshot?.profile ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [amrBalanceFailureMessageId, amrBalanceCardScopeKey]);
  /**
   * 这一次要付钱的工作区,把这个人放进 §6.V 的哪一格。
   *
   * 用的是 `projectRunPreflightContext` —— 余额门查的是同一个工作区,不是环境里
   * 恰好选中的那个;两处不同源就会出现「查 A 的钱、按 B 的身份呈现」。
   */
  /**
   * 这个工作区的**套餐**,投影到要付这笔钱的那个工作区上。
   *
   * 不能只靠 `context.planId`:走到客户端的 collab context 是用 vela 的
   * `/api/v1/workspaces` 目录行拼出来的,而目录行不带套餐字段 —— daemon 和 web
   * 两侧的 `workspaceContextFromDirectoryItem` 都把 `planId` 写死成 null
   * (`daemon/src/collab/vela-workspace-context.ts` / `collab/useWorkspaceContext.ts`)。
   * 2026-09-04 用真账号打后端实测过:一个 `team_max` 的团队工作区,vela 自己报
   * `planId: "team_max"`,而 `GET /api/workspace/context` 报 null。只认 context
   * 就会把每一个团队 Max 所有者都判成非 Max,把他送去 Pricing 买他已经买过的套餐。
   *
   * 工作区套餐唯一的真实来源是账单快照,所以这里跟 Home(`EntryShell`)用同一个
   * 投影函数。scope 钉在 `projectRunPreflightContext` 上,而不是环境里恰好选中的
   * 那个工作区 —— 否则又会变成「查 A 的钱、按 B 的套餐呈现」。
   */
  const projectRunPreflightBillingResponse = useWorkspaceBillingResponse({
    context: projectRunPreflightContext,
  });
  const projectRunPreflightBilling = useMemo(
    () =>
      workspaceBillingSummaryForContext(
        projectRunPreflightBillingResponse,
        projectRunPreflightContext,
      ),
    [projectRunPreflightBillingResponse, projectRunPreflightContext],
  );
  const amrBalanceBranch = useMemo(
    () =>
      resolveAmrBalanceBranch({
        context: projectRunPreflightContext,
        billing: projectRunPreflightBilling,
      }),
    [projectRunPreflightBilling, projectRunPreflightContext],
  );
  const amrBalanceBranchRef = useRef(amrBalanceBranch);
  amrBalanceBranchRef.current = amrBalanceBranch;
  /**
   * 「找所有者充值」弹窗是从**卡上那颗按钮**点开的(而不是拦截时自动弹出的)。
   * 拦截时自动弹出的那一份记在 `amrBalanceGateBlock.dialog` 上,两者共用同一个
   * 组件,任一为真就渲染。
   */
  const [amrOwnerTopUpFromCard, setAmrOwnerTopUpFromCard] = useState(false);
  /**
   * 升级卡那颗按钮:**点了跳哪由身份 × 订阅决定**(规格 §6.V 的第四列)。
   *
   *   非 Max · owner → 现有的 Pricing 深链(和弹窗同一个落点,「卡和弹窗都直接跳 Pricing」)
   *   Max   · owner → vela web 端 + 自动充值意图(他没有更高的套餐可买,充值才是解法)
   *   任何非 owner  → 不外跳:账单动作 B 会拒。给他「找所有者充值」那张弹窗,
   *                   那是他唯一真正走得通的一条路(也是 §6.Y 死胡同的出口)。
   *
   * 落点复用 `workspaceUpgradeUrl` / `workspaceAutoRechargeUrl` 这两个唯一决策点,
   * 免得升级卡和账号菜单、设置面板各自长出一条不一样的链接。
   */
  const handleAmrBalanceCardUpgrade = useCallback(() => {
    const branch = amrBalanceBranchRef.current;
    const intent = amrBalanceUpgradeIntent(branch);
    if (intent === 'ask_owner') {
      setAmrOwnerTopUpFromCard(true);
      return;
    }
    const fallbackProfile = amrBalanceCardProfile;
    // 自动充值链接对「可读但不可写」的工作区会返回 null(权限位不同,见
    // `workspaceAutoRechargeUrl`)。那时退回 Pricing —— 少一个功能好过一颗死按钮。
    const url =
      (intent === 'auto_recharge'
        ? workspaceAutoRechargeUrl(projectRunPreflightContext, { fallbackProfile })
        : null)
      ?? workspaceUpgradeUrl(projectRunPreflightContext, null, { fallbackProfile });
    if (!url) return;
    const entrySource =
      intent === 'auto_recharge'
        ? ('chat_upgrade_card_auto_recharge' as const)
        : ('chat_upgrade_card' as const);
    const metricsConsent = config.telemetry?.metrics === true;
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config.installationId,
    });
    window.open(
      attributedAmrUrl(url, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  }, [
    amrBalanceCardProfile,
    analytics.track,
    config.installationId,
    config.telemetry?.metrics,
    projectRunPreflightContext,
  ]);
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
  const initialChatPanelWidth = useMemo(readSavedChatPanelWidth, []);
  const [chatPanelWidth, setChatPanelWidth] = useState(initialChatPanelWidth.width);
  const [chatPanelMaxWidth, setChatPanelMaxWidth] = useState(FALLBACK_MAX_CHAT_PANEL_WIDTH);
  const [workspacePanelMinWidth, setWorkspacePanelMinWidth] = useState(MIN_WORKSPACE_PANEL_WIDTH);
  const [resizingChatPanel, setResizingChatPanel] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const chatPanelWidthRef = useRef(chatPanelWidth);
  const preferredChatPanelWidthRef = useRef(chatPanelWidth);
  const chatPanelWidthCustomizedRef = useRef(initialChatPanelWidth.customized);
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
  // `openBatch` carries a whole finished turn's artifacts (OPEND-2588) in one
  // request. It has to be one request: this is a single state slot, so N
  // synchronous `requestOpenFile` calls would collapse into the last one.
  const [openRequest, setOpenRequest] = useState<
    { name: string; nonce: number; openBatch?: readonly string[] } | null
  >(null);
  const [browserOpenRequest, setBrowserOpenRequest] = useState<BrowserOpenRequest | null>(null);
  // Like `openRequest`, but additionally asks the preview workspace to open the
  // file's Share/Export menu. Drives the "Share" next-step action: it reuses the
  // existing export/deploy surface rather than introducing a new share backend.
  const [shareRequest, setShareRequest] = useState<
    { name: string; nonce: number; anchorId?: string } | null
  >(null);
  // Parallel to shareRequest, but opens the workspace's Download/Export menu.
  const [downloadRequest, setDownloadRequest] = useState<
    { name: string; nonce: number; anchorId?: string } | null
  >(null);
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
  // A BYOK preflight can reject a send before any Run exists. Keep that
  // submission's task identity in memory so fixing Settings and resubmitting
  // the same draft completes the original task funnel instead of fabricating a
  // second task. AMR hard gates persist the full send in the queue separately.
  const blockedRunTaskRef = useRef<{
    conversationId: string;
    requestKey: string;
    taskAnalytics: ChatTaskExecutionAnalytics;
  } | null>(null);
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
  /**
   * 组件 22 · 重连 · S29:流水最后一行此刻该不该有、写几分之几。
   *
   * 读数来自传输层的 `onReconnect`(`providers/daemon.ts` 的 `DaemonReconnectState`),
   * 推演规则全在 `runtime/chat/reconnect-state.ts` —— 包括「恢复后整行消失」
   * 与「run 落终态后整行消失」这两条边界。这里只做搬运。
   */
  const [reconnectView, setReconnectView] = useState<ChatReconnectView | null>(null);
  const pushReconnectSignal = useCallback((signal: ChatReconnectSignal) => {
    setReconnectView((prev) => nextChatReconnectView(prev, signal));
  }, []);
  /**
   * 那一轮的结局有时不从流上来 —— 会话刷新、切回这个会话时重新拉消息,
   * 都能把终态带进 `messages`,而 `settled` 今天只在流上发。掉线正是流断了的时刻,
   * 所以这条「别的门」恰恰是最常走的那条:不补这一拍,重连行会挂在一条写着
   * 「已完成」的消息下面继续说「连接失败」(2026-08-27 真机见过)。
   *
   * 撤不撤由 `nextChatReconnectView` 判 —— `failed` 对已经交回给人的那一行是不动的。
   */
  useEffect(() => {
    const signal = settledSignalFromMessages(reconnectView, messages);
    if (signal) pushReconnectSignal(signal);
  }, [reconnectView, messages, pushReconnectSignal]);
  /**
   * 组件 22 的**第二个上膛口**:浏览器自己说这一屏没网了。
   *
   * 第一个上膛口是传输层那条重连预算,它只认「socket 真的断掉」。那条路本身是通的
   * (`tests/providers/daemon-sse-tab-offline.test.ts` 走的就是它)。可 daemon 跑在
   * **本机回环**上 —— 页签断网时那条流常常一点事都没有:25 秒一次的 keepalive 照旧到,
   * 75 秒的静默闸(`DAEMON_STREAM_IDLE_TIMEOUT_MS`)一次都不上膛,预算于是从头到尾是 0。
   *
   * 真机 2026-09-03:一条长任务跑着,把那个页签断网,一分钟后 `navigator.onLine`
   * 已经是 `false`,而壳头照旧写着「进行中」、秒数还在往上走,「正在重新连接 /
   * 连接失败 / 重新连接」一个字都没有。**浏览器早就知道,我们没问过它。**
   *
   * 只在**这个会话里有一轮还在跑**的时候上膛:没有在跑的东西就没有可重连的东西,
   * 那时报「正在重新连接」是凭空多一句话。收场只认 `online` 与这一轮的终态
   * (`settled`),判据全在 `nextChatReconnectView` 的 `network` 分支。
   */
  const offlineWatchRunId = useMemo(() => {
    // 切会话的那一拍 `messages` 可能还是上一个会话的,别把别人的 run 盖上这个会话的戳。
    if (!activeConversationId || messagesConversationId !== activeConversationId) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role !== 'assistant' || !message.runId) continue;
      if (!isActiveRunStatus(message.runStatus)) continue;
      return message.runId;
    }
    return null;
  }, [messages, activeConversationId, messagesConversationId]);
  useEffect(() => {
    const runId = offlineWatchRunId;
    const conversationId = activeConversationId;
    if (!runId || !conversationId) return undefined;
    const push = (online: boolean): void => {
      pushReconnectSignal({ kind: 'network', runId, conversationId, online });
    };
    // 挂上来时就已经断着的那一种:事件早发过了,只有问一次才知道。
    if (typeof navigator !== 'undefined' && navigator.onLine === false) push(false);
    const handleOffline = (): void => push(false);
    const handleOnline = (): void => push(true);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [offlineWatchRunId, activeConversationId, pushReconnectSignal]);
  /**
   * 22-3 那颗〔重新连接〕。
   *
   * 语义是**接回同一轮的流**,不是重试 —— 复用已有的重挂通道
   * (`attachRecoverableRuns` → `reattachDaemonRun`,带 `?after=<lastRunEventId>` 游标),
   * 所以已经跑出来的东西不会丢,也不会在 daemon 上多起一轮。
   *
   * 用尽预算后那条通道被 `genericDisconnectBackoffUntilRef` 压了一段冷却窗口
   * (给还在跑的 daemon 留喘息),这里是用户明确要求现在就试,所以先撤掉冷却与
   * 重试计数,再推一拍 `recoveryTick` 把重挂扫描叫醒。
   *
   * 按下之后那一行**当场**翻回「正在重新连接 1/5」,不撤整行。
   *
   * 为什么必须当场变:按下之后要走的整条链(清记账 → 叫醒扫描 → 拉运行状态 →
   * 起重挂)全在异步里,而 daemon 没回来时它在第三步就断了 —— 上面这几行
   * `delete` 一个像素都不会改。真机 2026-08-27 用户原话「点击 reconnect 咋没啥
   * 反应」;**「点了没变化」和「按钮坏了」在屏幕上长得一模一样。**
   *
   * 为什么不能撤整行:更早一版乐观推了一条 `dropped`,重挂起不来时没有人再把
   * 行画回来,屏幕只剩壳头一句「运行失败」,用户连再按一次的入口都没有。
   * 撤整行的唯一正当时机仍然是「重挂真的开始了」,那个位置由 `attachRecoverableRuns`
   * 里 `reattachDaemonRun` 前一行的 `dropped` 占着。
   *
   * 乐观就必须有到期。这把闸是那条不变量在运行时的唯一落点:重挂起不来的形态太多
   * (状态拉不到、daemon 亲口说这一轮已经 failed、被冷却窗口挡下、扫描因为
   * `daemonLive` 翻假压根没跑),挨个去认等于把一条规矩拆成十几处记得写对。
   * 过了 `MANUAL_RECONNECT_FEEDBACK_MS` 这一行还是那条乐观读数,就回落成 22-3
   * 把按钮还给人 —— 判据在 `reconnect-state.ts` 的 `manual-retry-expired`,
   * 传输层真的接管出来的读数不带 `manualRetry`,那把闸对它自动作废。
   *
   * 连点不成立,而且不是靠一把锁:乐观读数的 `exhausted` 是 false,而
   * `components/chat/Reconnect.tsx` 只有 `exhausted` 那一档才画按钮 ——
   * 窗口里屏幕上没有可按的东西,一次按压最多换来一次重挂扫描。
   */
  const reconnectRunId = reconnectView?.runId ?? null;
  const manualReconnectExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleManualReconnect = useCallback(() => {
    const runId = reconnectRunId;
    /*
     * 没有 runId 就是**屏幕上没有那一行**:按钮和这个 id 读的是同一份
     * `reconnectView`(渲染那一路只多过一道会话过滤,过滤只会把它变成 null),
     * 所以没有行 = 没有按钮 = 没有东西可接。能走到这里只剩一种时序:画面画出按钮
     * 之后、这一下按压落地之前那一行自己收场了(比如这一轮其实已经成功)。
     * 那时什么都不做才是对的 —— 不该为一个已经不存在的目标再起一次重挂。
     */
    if (!runId) return;
    transientFailedRetriesRef.current.delete(runId);
    genericDisconnectRetriesRef.current.delete(runId);
    genericDisconnectBackoffUntilRef.current.delete(runId);
    completedReattachRunsRef.current.delete(runId);
    clearProjectTimeout(manualReconnectExpiryRef.current);
    manualReconnectExpiryRef.current = null;
    setReconnectView((prev) => nextChatReconnectView(prev, { kind: 'manual-retry', runId }));
    manualReconnectExpiryRef.current = scheduleProjectTimeout(() => {
      manualReconnectExpiryRef.current = null;
      setReconnectView((prev) =>
        nextChatReconnectView(prev, { kind: 'manual-retry-expired', runId }));
    }, MANUAL_RECONNECT_FEEDBACK_MS);
    setRecoveryTick((t) => t + 1);
  }, [reconnectRunId, clearProjectTimeout, scheduleProjectTimeout]);
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
  const messagesAuthorityKeyRef = useRef<string | null>(null);
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
  const projectRunAuthorityKeyRef = useRef(projectRunAuthorityKey);
  projectRunAuthorityKeyRef.current = projectRunAuthorityKey;
  const conversationsLoadedProjectIdRef = useRef<string | null>(null);
  // Live mirror of the full project prop, for async handlers whose useCallback
  // deps only track `project.id` (e.g. the project-events handler below):
  // comparing a re-fetched record against a stale closure copy would
  // mis-detect changes after a rename.
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
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
  const memoryExtractionRunActive = currentConversationHasActiveRun || streaming;
  useEffect(() => {
    onRunActivityChange?.(project.id, memoryExtractionRunActive);
  }, [memoryExtractionRunActive, onRunActivityChange, project.id]);
  useEffect(() => () => {
    onRunActivityChange?.(project.id, false);
  }, [onRunActivityChange, project.id]);
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
  const currentConversationSendDisabled = projectMutationReadOnly
    || !projectRunHasBillableAmrPrincipal
    || currentConversationLoading
    || failedMessagesConversationId === activeConversationId
    || currentConversationAwaitingActiveRunAttach;
  const currentConversationActionDisabled = currentConversationBusy || currentConversationSendDisabled;
  const currentConversationQueueDisabled = projectMutationReadOnly
    || currentConversationLoading
    || failedMessagesConversationId === activeConversationId;

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
  const newConversationDisabled = creatingConversation || projectMutationReadOnly;
  const activeCompletionNotificationRunsRef = useRef<Set<string>>(new Set());
  const completedNotificationRunsRef = useRef<Set<string>>(new Set());

  // Load conversations on project switch. If none exist (older projects
  // pre-conversations, or a freshly created one whose default seed got
  // dropped), create one on the fly.
  useEffect(() => {
    let cancelled = false;
    const revalidatingCurrentProject =
      conversationsLoadedProjectIdRef.current === project.id;
    const generation = conversationMaterializationGenerationController.begin();
    const requestWorkspaceContext = projectRunWorkspaceContextRef.current;
    conversationMaterializationRecoveryRef.current = null;
    setPendingEmptyConversationSeed(null);
    setConversationLoadError(null);
    setError(null);
    if (!revalidatingCurrentProject) {
      setConversations([]);
      setActiveConversationId(null);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      setMessageLoadRetryNonce(0);
      setMessages([]);
      commitPreviewComments([]);
      setAttachedComments([]);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setArtifact(null);
      savedArtifactRef.current = null;
    }
    (async () => {
      try {
        const list = await listConversationsWithRetry(
          project.id,
          requestWorkspaceContext,
        );
        if (cancelled) return;
        conversationsLoadedProjectIdRef.current = project.id;
        if (list.length === 0) {
          // Conversation reads can settle before collaboration ownership. Keep
          // the empty result and let the effect below seed only after the
          // fail-closed viewer gate proves this caller may mutate. This avoids
          // both a member's POST -> 403 loop and reloading the whole transcript
          // when status later confirms an owner.
          setConversations([]);
          setActiveConversationId(null);
          setPendingEmptyConversationSeed({
            projectId: project.id,
            authorityKey: projectRunAuthorityKey,
          });
        } else {
          setPendingEmptyConversationSeed(null);
          setConversations(list);
          // Issue #1505: when the URL deep-links to a specific
          // conversation, prefer that one. Falls through to list[0]
          // when the routed id is null or no longer present (the
          // routine row may have been deleted between the route
          // landing and the conversation list loading).
          const routedMatch = routeConversationId
            ? list.find((c) => c.id === routeConversationId) ?? null
            : null;
          const retainedMatch = revalidatingCurrentProject
            ? list.find((c) => c.id === activeConversationIdRef.current) ?? null
            : null;
          setActiveConversationId(
            retainedMatch?.id ?? routedMatch?.id ?? list[0]!.id,
          );
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load conversations for this project.';
        const materializationRecovery =
          err instanceof ProjectConversationsHttpError
          && err.status === 404
          && requestWorkspaceContext?.workspaceType === 'team'
            ? {
                projectId: project.id,
                authorityKey: projectRunAuthorityKey,
                generation,
                workspaceContext: requestWorkspaceContext,
                errorMessage: message,
              }
            : null;
        conversationMaterializationRecoveryRef.current = materializationRecovery;
        setPendingEmptyConversationSeed(null);
        const accessRevoked =
          err instanceof ProjectConversationsHttpError
          && (err.status === 401 || err.status === 403);
        if (!revalidatingCurrentProject || accessRevoked) {
          setConversations([]);
          setActiveConversationId(null);
        }
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
      conversationMaterializationGenerationController.invalidate(generation);
      if (
        conversationMaterializationRecoveryRef.current?.generation
        === generation
      ) {
        conversationMaterializationRecoveryRef.current = null;
      }
    };
  }, [
    commitPreviewComments,
    conversationMaterializationGenerationController,
    project.id,
    projectRunAuthorityKey,
  ]);

  const recoverMaterializedConversations = useCallback(async (
    signalProjectId: string,
    signalAuthorityKey: string,
  ) => {
    const recovery = conversationMaterializationRecoveryRef.current;
    if (!recovery) return;
    if (recovery.projectId !== signalProjectId) return;
    if (recovery.authorityKey !== signalAuthorityKey) return;
    if (!conversationMaterializationGenerationController.isCurrent(recovery.generation)) return;
    if (projectIdRef.current !== recovery.projectId) return;
    if (projectRunAuthorityKeyRef.current !== recovery.authorityKey) return;
    if (conversationMaterializationRecoveryInFlightRef.current === recovery) return;
    conversationMaterializationRecoveryInFlightRef.current = recovery;
    try {
      // Materialization completion is already our retry signal, so perform one
      // exact-scoped read here instead of extending the fixed initial retry
      // schedule. A still-early 404 leaves recovery armed for the next signal.
      const list = await listConversations(recovery.projectId, {
        throwOnError: true,
        workspaceContext: recovery.workspaceContext,
      });
      if (conversationMaterializationRecoveryRef.current !== recovery) return;
      if (!conversationMaterializationGenerationController.isCurrent(recovery.generation)) return;
      if (projectIdRef.current !== recovery.projectId) return;
      if (projectRunAuthorityKeyRef.current !== recovery.authorityKey) return;

      conversationMaterializationRecoveryRef.current = null;
      setConversationLoadError(null);
      setError((current) => (
        current === recovery.errorMessage ? null : current
      ));
      if (list.length === 0) {
        setConversations([]);
        setActiveConversationId(null);
        setPendingEmptyConversationSeed({
          projectId: recovery.projectId,
          authorityKey: recovery.authorityKey,
        });
        return;
      }

      setPendingEmptyConversationSeed(null);
      setConversations(list);
      const routedMatch = routeConversationId
        ? list.find((candidate) => candidate.id === routeConversationId) ?? null
        : null;
      setActiveConversationId(routedMatch ? routedMatch.id : list[0]!.id);
    } catch (err) {
      if (conversationMaterializationRecoveryRef.current !== recovery) return;
      if (!conversationMaterializationGenerationController.isCurrent(recovery.generation)) return;
      if (projectIdRef.current !== recovery.projectId) return;
      if (projectRunAuthorityKeyRef.current !== recovery.authorityKey) return;
      if (
        err instanceof ProjectConversationsHttpError
        && err.status === 404
      ) {
        return;
      }
      // A completion signal exposed a settled non-404 failure. Stop treating
      // it as a materialization race and surface that exact response now; a
      // later project/authority load owns only any further retry.
      conversationMaterializationRecoveryRef.current = null;
      const message = err instanceof Error
        ? err.message
        : 'Could not load conversations for this project.';
      setConversationLoadError(message);
      setError((current) => reconcileConversationRecoveryGlobalError(
        current,
        recovery.errorMessage,
        message,
      ));
    } finally {
      if (conversationMaterializationRecoveryInFlightRef.current === recovery) {
        conversationMaterializationRecoveryInFlightRef.current = null;
      }
    }
  }, [
    conversationMaterializationGenerationController,
    routeConversationId,
  ]);

  const emptyConversationWriterAuthorized =
    projectWorkspaceScopeState.scope?.kind === 'personal'
    || projectWorkspaceScopeState.scope?.kind === 'unbound'
    || (
      projectWorkspaceScopeState.scope?.kind === 'team'
      && projectCollab.writerAuthority === 'allowed'
    );
  const emptyConversationReadOnlySettled =
    pendingEmptyConversationSeed?.projectId === project.id
    && pendingEmptyConversationSeed.authorityKey === projectRunAuthorityKey
    && projectCollab.writerAuthority === 'denied';
  useEffect(() => {
    if (
      !pendingEmptyConversationSeed
      || pendingEmptyConversationSeed.projectId !== project.id
      || pendingEmptyConversationSeed.authorityKey !== projectRunAuthorityKey
      || !emptyConversationWriterAuthorized
    ) {
      return;
    }
    let cancelled = false;
    const requestWorkspaceContext = projectRunWorkspaceContextRef.current;
    (async () => {
      try {
        const fresh = await createConversation(project.id, undefined, {
          workspaceContext: requestWorkspaceContext,
        });
        if (cancelled) return;
        if (!fresh) {
          throw new Error('Could not create a conversation for this project.');
        }
        setPendingEmptyConversationSeed(null);
        setConversations([fresh]);
        setActiveConversationId(fresh.id);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Could not create a conversation for this project.';
        setPendingEmptyConversationSeed(null);
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    pendingEmptyConversationSeed,
    emptyConversationWriterAuthorized,
    project.id,
    projectRunAuthorityKey,
  ]);

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
    const match = conversations.find((c) => c.id === routeConversationId);
    if (!match) return;
    lastSeenRouteConversationIdRef.current = routeConversationId;
    setActiveConversationId(routeConversationId);
  }, [routeConversationId, conversations, activeConversationId]);

  // Reset chat pane to the open default on project switch. Shared non-owner
  // projects re-collapse once collab status confirms (see below) — but only
  // once per open, so expanding chat after that is sticky for the visit.
  const sharedNonOwnerChatDefaultAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    setWorkspaceFocused(false);
    sharedNonOwnerChatDefaultAppliedRef.current = null;
  }, [project.id]);

  useEffect(() => {
    if (sharedNonOwnerChatDefaultAppliedRef.current === project.id) return;
    if (
      !shouldDefaultCollapseChatForSharedNonOwner({
        enabled: projectCollab.enabled,
        isSharedNonOwner: projectCollab.isSharedNonOwner,
      })
    ) {
      return;
    }
    setWorkspaceFocused(true);
    sharedNonOwnerChatDefaultAppliedRef.current = project.id;
  }, [project.id, projectCollab.enabled, projectCollab.isSharedNonOwner]);

  // Load messages whenever the active conversation changes. This happens
  // on project mount (after conversations load) and on user-triggered
  // conversation switches.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setMessagesInitialized(false);
      commitPreviewComments([]);
      setAttachedComments([]);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      messagesConversationIdRef.current = null;
      messagesAuthorityKeyRef.current = null;
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      return;
    }
    const reloadingCurrentConversation =
      messagesConversationIdRef.current === activeConversationId
      && messagesAuthorityKeyRef.current === projectRunAuthorityKey;
    const liveReloadMessageIds = new Set<string>();
    if (
      messagesConversationIdRef.current === activeConversationId
      && streamingConversationIdRef.current === activeConversationId
      && abortRef.current !== null
      && cancelRef.current !== null
      && projectResourceAuthorityRef.current !== 'denied'
    ) {
      const currentMessages = messagesRef.current;
      let assistantIndex = -1;
      for (let index = currentMessages.length - 1; index >= 0; index -= 1) {
        const message = currentMessages[index];
        if (message?.role === 'assistant' && isActiveRunStatus(message.runStatus)) {
          liveReloadMessageIds.add(message.id);
          assistantIndex = index;
          break;
        }
      }
      for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        const message = currentMessages[index];
        if (message?.role !== 'user') continue;
        liveReloadMessageIds.add(message.id);
        break;
      }
    }
    const preservingLiveConversation = liveReloadMessageIds.size > 0;
    // Reset the initialized flag so auto-send waits for this authoritative DB
    // read to settle before checking messages.length. A same-conversation
    // authority refresh keeps the prior transcript visible. An authority-key
    // handoff keeps only the live turn, so its pending read cannot detach the
    // stream or later replace those rows with an empty snapshot.
    setMessagesInitialized(false);
    let cancelled = false;
    const requestWorkspaceContext = projectRunWorkspaceContextRef.current;
    setFailedMessagesConversationId(null);
    if (!preservingLiveConversation) {
      setMessagesConversationId(null);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
    }
    if (!reloadingCurrentConversation) {
      setMessages((current) =>
        preservingLiveConversation
          ? current.filter((message) => liveReloadMessageIds.has(message.id))
          : [],
      );
      commitPreviewComments([]);
      setAttachedComments([]);
      setArtifact(null);
      savedArtifactRef.current = null;
    }
    const commentsGeneration = previewCommentsGenerationRef.current;
    if (!reloadingCurrentConversation && !preservingLiveConversation) {
      messagesConversationIdRef.current = null;
      messagesAuthorityKeyRef.current = null;
    }
    (async () => {
      try {
        // Comments are an auxiliary overlay. A slow collaboration read must
        // not keep the persisted transcript (and every recovery action it
        // contains) behind ChatPane's Loading gate. Keep both reads under this
        // effect's project/conversation/authority lifetime, but settle them
        // independently.
        void fetchPreviewComments(
          project.id,
          activeConversationId,
          requestWorkspaceContext,
        ).then((comments) => {
          if (cancelled || previewCommentsGenerationRef.current !== commentsGeneration) return;
          setPreviewComments(comments);
        }).catch(() => {
          if (cancelled || previewCommentsGenerationRef.current !== commentsGeneration) return;
          if (!reloadingCurrentConversation) setPreviewComments([]);
        });
        const list = await listMessages(
          project.id,
          activeConversationId,
          requestWorkspaceContext,
        );
        if (cancelled) return;
        setMessages((current) =>
          preservingLiveConversation
            ? mergeServerMessagesIntoConversation(
                current.filter((message) => liveReloadMessageIds.has(message.id)),
                list,
              )
            : normalizeConversationMessageOrder(list),
        );
        setMessagesInitialized(true);
        setAttachedComments([]);
        setArtifact(null);
        setError(null);
        savedArtifactRef.current = null;
        messagesConversationIdRef.current = activeConversationId;
        messagesAuthorityKeyRef.current = projectRunAuthorityKey;
        setMessagesConversationId(activeConversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load messages for this conversation.';
        if (!reloadingCurrentConversation) {
          setMessages((current) =>
            preservingLiveConversation
              ? current.filter((item) => liveReloadMessageIds.has(item.id))
              : [],
          );
          commitPreviewComments([]);
          setAttachedComments([]);
          setArtifact(null);
          savedArtifactRef.current = null;
        }
        setError(message);
        if (!preservingLiveConversation) {
          messagesConversationIdRef.current = null;
          messagesAuthorityKeyRef.current = null;
          setMessagesConversationId(null);
        }
        setFailedMessagesConversationId(activeConversationId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    project.id,
    activeConversationId,
    commitPreviewComments,
    messageLoadRetryNonce,
    projectRunAuthorityKey,
  ]);

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
      // System notifications are useful only when the task is not already in
      // front of the user. Sounds remain independent feedback for both states.
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const isFocused = typeof document === 'undefined' ? true : document.hasFocus();
      if (isHidden || !isFocused) {
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
    const requestWorkspaceContext = projectRunWorkspaceContextRef.current;
    tabsLoadedRef.current = false;
    tabsHydratedFromSavedStateRef.current = false;
    hasAppliedInitialPrimaryOpenRef.current = false;
    setOpenTabsState({ tabs: [], active: null });
    (async () => {
      const state = await loadTabs(project.id, requestWorkspaceContext, {
        reconcileNewerCacheToDaemon: projectTabsCanPersistToDaemonRef.current,
      });
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
      const routeChangesSavedState = Boolean(
        routeActive
        && (
          state.active !== routeActive
          || !state.tabs.includes(routeActive)
        ),
      );
      if (routeActive && routeChangesSavedState) {
        nextState = cacheTabsLocally(
          project.id,
          nextState,
          requestWorkspaceContext,
        );
        if (projectTabsCanPersistToDaemonRef.current) {
          void persistTabsToDaemonNow(
            project.id,
            nextState,
            requestWorkspaceContext,
          );
        }
      }
      tabsHydratedFromSavedStateRef.current = state.hasSavedState === true;
      setOpenTabsState(nextState);
      tabsLoadedRef.current = true;
      setTabsHydrationVersion((version) => version + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, projectRunAuthorityKey]);

  // Debounce the canonical (daemon + SQLite) tab-state write. The embedded
  // browser fans out url/title/favicon updates in bursts on a single page load
  // (did-navigate, did-navigate-in-page, page-title-updated, favicon), and each
  // used to be a localStorage write + HTTP PUT + SQLite UPDATE + re-render.
  // We keep React state and the local cache IMMEDIATE (so the UI and a reload
  // are never stale) and coalesce only the daemon PUT.
  const tabsDaemonSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDaemonTabsRef = useRef<{
    projectId: string;
    state: OpenTabsState;
    workspaceContext: WorkspaceCollabContext | null;
  } | null>(null);
  const flushTabsDaemonSave = useCallback(() => {
    if (tabsDaemonSaveTimerRef.current != null) {
      clearTimeout(tabsDaemonSaveTimerRef.current);
      tabsDaemonSaveTimerRef.current = null;
    }
    const pending = pendingDaemonTabsRef.current;
    pendingDaemonTabsRef.current = null;
    if (pending) {
      void persistTabsToDaemonNow(
        pending.projectId,
        pending.state,
        pending.workspaceContext,
      );
    }
  }, []);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      // A tab activation the host did not ask for is the user steering the
      // preview themselves. See `userTookOverPreviewRef` for why that outranks
      // an agent's `<od-focus open="…">`.
      if (next.active && next.active !== lastHostRequestedOpenRef.current) {
        userTookOverPreviewRef.current = true;
      }
      setOpenTabsState(next);
      if (!tabsLoadedRef.current) return;
      // Immediate, cheap, synchronous — keeps the cache canonical for reload.
      const stamped = cacheTabsLocally(
        project.id,
        next,
        projectRunWorkspaceContext,
      );
      if (!projectTabsCanPersistToDaemon) {
        if (tabsDaemonSaveTimerRef.current != null) {
          clearTimeout(tabsDaemonSaveTimerRef.current);
          tabsDaemonSaveTimerRef.current = null;
        }
        pendingDaemonTabsRef.current = null;
        return;
      }
      pendingDaemonTabsRef.current = {
        projectId: project.id,
        state: stamped,
        workspaceContext: projectRunWorkspaceContext,
      };
      if (tabsDaemonSaveTimerRef.current != null) {
        clearTimeout(tabsDaemonSaveTimerRef.current);
      }
      tabsDaemonSaveTimerRef.current = setTimeout(() => {
        tabsDaemonSaveTimerRef.current = null;
        const pending = pendingDaemonTabsRef.current;
        pendingDaemonTabsRef.current = null;
        if (pending) {
          void persistTabsToDaemonNow(
            pending.projectId,
            pending.state,
            pending.workspaceContext,
          );
        }
      }, TAB_PERSIST_DEBOUNCE_MS);
    },
    [
      project.id,
      projectRunWorkspaceContext,
      projectTabsCanPersistToDaemon,
    ],
  );

  // Revocation can arrive without another tab interaction. Discard a queued
  // write immediately instead of letting its old authority fire after the
  // project has become read-only.
  useEffect(() => {
    if (projectTabsCanPersistToDaemon) return;
    if (tabsDaemonSaveTimerRef.current != null) {
      clearTimeout(tabsDaemonSaveTimerRef.current);
      tabsDaemonSaveTimerRef.current = null;
    }
    pendingDaemonTabsRef.current = null;
  }, [projectTabsCanPersistToDaemon]);

  // Flush any pending tab write when the project changes or the view unmounts,
  // so a fast project switch / close doesn't leave the daemon a debounce behind.
  useEffect(
    () => flushTabsDaemonSave,
    [flushTabsDaemonSave, project.id],
  );

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

  const refreshProjectFiles = useCallback(async (
    options?: { fresh?: boolean },
    onAcceptedGeneration?: (generation: number) => void,
  ): Promise<ProjectFile[]> => {
    const requestSeq = ++projectFilesRequestSeqRef.current;
    const requestedRefreshKey = filesRefreshRequestKeyRef.current;
    let next: ProjectFile[];
    try {
      next = await fetchProjectFiles(project.id, {
        workspaceContext: projectRunWorkspaceContextRef.current,
        requireAuthoritative: true,
        ...(options?.fresh ? { fresh: true } : {}),
      });
    } catch {
      // A transport/HTTP failure is not an authoritative empty directory.
      // Keep the last accepted snapshot and generation, while preserving the
      // refresh helper's historical resolved-list contract for its callers.
      return projectFilesRef.current;
    }
    if (requestSeq === projectFilesRequestSeqRef.current) {
      const acceptedGeneration = projectFilesGenerationRef.current + 1;
      projectFilesGenerationRef.current = acceptedGeneration;
      projectFilesRef.current = next;
      // Commit the list and both observation witnesses atomically. A refresh
      // request must never publish a new key or generation alongside an older
      // file snapshot.
      setProjectFilesSnapshot({
        files: next,
        refreshKey: requestedRefreshKey,
        generation: acceptedGeneration,
      });
      onAcceptedGeneration?.(acceptedGeneration);
    }
    return next;
  }, [project.id, projectRunAuthorityKey]);

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
        const text = await fetchProjectFileText(project.id, name, {
          workspaceContext: projectRunWorkspaceContextRef.current,
        });
        htmlContentCacheRef.current.set(name, { mtime, text });
        return text;
      } catch {
        htmlContentCacheRef.current.set(name, { mtime, text: null });
        return null;
      }
    },
    [project.id, projectRunAuthorityKey],
  );

  const refreshLiveArtifacts = useCallback(async (): Promise<LiveArtifactSummary[]> => {
    const next = await fetchLiveArtifacts(project.id, {
      workspaceContext: projectRunWorkspaceContextRef.current,
    });
    setLiveArtifacts(next);
    return next;
  }, [project.id, projectRunAuthorityKey]);

  const refreshWorkspaceItems = useCallback(async (
    options?: { freshProjectFiles?: boolean },
    onAcceptedFilesGeneration?: (generation: number) => void,
  ): Promise<ProjectFile[]> => {
    const [nextFiles] = await Promise.all([
      refreshProjectFiles({ fresh: options?.freshProjectFiles }, onAcceptedFilesGeneration),
      refreshLiveArtifacts(),
    ]);
    return nextFiles;
  }, [refreshLiveArtifacts, refreshProjectFiles]);

  const refreshFileWorkspace = useCallback(async (
    options?: { fresh?: boolean },
  ): Promise<FileRefreshResult> => {
    let acceptedGeneration: number | null = null;
    await refreshWorkspaceItems(
      { freshProjectFiles: options?.fresh },
      (generation) => { acceptedGeneration = generation; },
    );
    return { acceptedGeneration };
  }, [refreshWorkspaceItems]);

  const previousMaterializationDownloadRef = useRef<{
    projectId: string;
    authorityKey: string;
    pending: boolean;
  } | null>(null);
  useEffect(() => {
    const previous = previousMaterializationDownloadRef.current;
    const sameAuthority = previous?.projectId === project.id
      && previous.authorityKey === projectRunAuthorityKey;
    previousMaterializationDownloadRef.current = {
      projectId: project.id,
      authorityKey: projectRunAuthorityKey,
      pending: projectCollab.downloadPending,
    };
    if (
      !sameAuthority
      || !previous.pending
      || projectCollab.downloadPending
    ) {
      return;
    }

    // The first file read for a newly opened Team mirror can legitimately
    // observe the empty placeholder directory. Materialization replaces that
    // directory without producing a chokidar event for a stream that was not
    // connected yet, so settling the download is itself an authoritative file
    // invalidation. Fence the placeholder snapshot and fetch the exact scoped
    // directory now; otherwise the first view stays empty until it is reopened.
    invalidateProjectFilesCache(
      project.id,
      projectRunWorkspaceContextRef.current,
    );
    void refreshWorkspaceItems({ freshProjectFiles: true }).catch(() => {
      // Preserve the last accepted snapshot on a transient transport failure.
      // The project event stream and ordinary refresh paths remain retries.
    });
    void recoverMaterializedConversations(project.id, projectRunAuthorityKey);
  }, [
    project.id,
    projectRunAuthorityKey,
    projectCollab.downloadPending,
    recoverMaterializedConversations,
    refreshWorkspaceItems,
  ]);

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
    bumpFilesRefresh();
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
    const primaryFile = selectPrimaryProjectFile(
      projectFiles,
      refreshInitialHomeAttachmentFileNames(),
    );
    if (!primaryFile) return;
    hasAppliedInitialPrimaryOpenRef.current = true;
    persistTabsState({ tabs: [primaryFile.name], active: primaryFile.name });
  }, [
    openTabsState.active,
    openTabsState.tabs.length,
    persistTabsState,
    projectFiles,
    refreshInitialHomeAttachmentFileNames,
    routeFileName,
  ]);

  /**
   * The last file the HOST asked to open. Everything the host opens — an
   * auto-open decision, a Share/Download affordance, a route restore — goes
   * through `requestOpenFile`, so a tab activation that lands anywhere ELSE is
   * the user's own click.
   */
  const lastHostRequestedOpenRef = useRef<string | null>(null);
  /**
   * True once the user has taken the preview over during the current run.
   *
   * Read by the `<od-focus open="…">` handler, which declines rather than yank
   * the tab away. Reset when a run starts: taking over during turn N says
   * nothing about turn N+1.
   *
   * Known false negative, accepted: the user clicking BACK to the file the host
   * last opened is indistinguishable from the host's own open. The cost is that
   * a later agent `open` may still fire in that one case, and the cost of
   * closing it would be threading a "who asked" flag through FileWorkspace's
   * whole tab surface.
   */
  const userTookOverPreviewRef = useRef(false);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    lastHostRequestedOpenRef.current = name;
    setOpenRequest({ name, nonce: Date.now() });
  }, []);

  /**
   * Open a finished turn's artifacts together, with `focused` selected.
   *
   * Product ruling 2026-09-04 (OPEND-2588): 「就让 agent 生成完,把那些产物在右侧
   * 全打开呗」—— 「是全部的**主要**产物」. Auto-open used to open exactly ONE file
   * per turn, so a batch that generated four images left two of them with no
   * tab. Which artifacts qualify is still `auto-open-file.ts`'s call; this only
   * stops throwing the rest away.
   *
   * Deliberately ONE request rather than a `requestOpenFile` loop: `openRequest`
   * is a single state slot, so successive calls in the same tick collapse to the
   * last name, and even spread across ticks each open would steal the focus that
   * the selection heuristic deliberately assigned to `focused`.
   */
  const requestOpenTurnArtifacts = useCallback(
    (names: readonly string[], focused: string) => {
      if (!focused) return;
      lastHostRequestedOpenRef.current = focused;
      // The batch is the complete, ordered tab list — `focused` included, so
      // the tab strip keeps file-list order instead of pushing the selected
      // artifact to the end.
      const openBatch = names.filter((name) => Boolean(name));
      setOpenRequest({
        name: focused,
        nonce: Date.now(),
        ...(openBatch.length > 1 ? { openBatch } : {}),
      });
    },
    [],
  );

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
      const currentProjectFiles = projectFilesSnapshot ?? projectFilesRef.current;
      const existing = new Set(currentProjectFiles.map((f) => f.name));
      let fileName = `${baseName}${ext}`;
      // A non-empty identifier is stable artifact identity: when its canonical
      // filename already exists, update that file in place. Title- and
      // fallback-derived names still suffix collisions so new artifacts cannot
      // silently replace unrelated project files.
      const updatesExplicitlyIdentifiedFile =
        Boolean(art.identifier?.trim()) && existing.has(fileName);
      let collisionFileName = fileName;
      let n = 2;
      while (
        existing.has(collisionFileName) &&
        savedArtifactRef.current !== collisionFileName
      ) {
        collisionFileName = `${baseName}-${n}${ext}`;
        n += 1;
      }
      if (!updatesExplicitlyIdentifiedFile) fileName = collisionFileName;
      if (ext === '.html') {
        const pointerProjectFiles = filterProjectFilesByMinMtime(
          currentProjectFiles,
          options.pointerMinMtime,
        );
        const pointerTarget = resolveHtmlPointerArtifactTarget({
          content: artifactToPersist.html,
          candidateFileName: collisionFileName,
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
      }, projectRunWorkspaceContext);
      if (file) {
        savedArtifactRef.current = file.name;
        bumpFilesRefresh();
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
    void refreshWorkspaceItems({
      freshProjectFiles: filesRefresh > committedFilesRefreshKeyRef.current,
    }).catch(() => {
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
    // A chokidar event is an authoritative invalidation, not merely a visual
    // refresh hint. Fence the exact project/Workspace file-list authority
    // before publishing the React refresh key: otherwise fetchProjectFiles
    // can return its short-lived settled cache (or an already-joined response
    // that was captured before this event) and leave the restored project on
    // the old file snapshot.
    invalidateProjectFilesCache(
      project.id,
      projectRunWorkspaceContextRef.current,
    );
    bumpFilesRefresh();
    // Round 7 (mrcfps): file mutations are the dominant staleness signal
    // post-finalize — bump the refresh key so DESIGN.md staleness
    // recomputes against the new mtimes.
    setDesignMdRefreshKey((n) => n + 1);
    // Team-share upload badge (recvqghymxqQQq): this fires on the SAME
    // chokidar-backed `file-changed` event the daemon's collab-publish-watcher
    // uses to flip `syncState` to 'pending_upload' (markLocalChangePending in
    // apps/daemon/src/collab/runtime.ts), and that state typically reverts to
    // 'synced' within one debounce window (~400ms) plus a publish — far
    // shorter than CollabClient's 5s status-poll cadence. Without checking
    // status right here, the owner's own tab almost never catches the
    // transient and the file-tab "uploading" icon never appears to change.
    // Mirrors the existing `project-metadata-changed` → `checkStatusNow()`
    // hub-push pattern below, just triggered by the LOCAL watcher instead.
    collabCheckStatusNow();
  }, [collabCheckStatusNow, project.id]);
  const reconcileFilesWhenProjectEventsBecomeReady = useCallback(async () => {
    // The initial file snapshot and the project-event stream are established
    // independently. Re-read once after the stream handshake to close the
    // gap, but do not publish a preview invalidation merely because the
    // handshake completed: changing the iframe URL would abort a perfectly
    // good first navigation and load the same document twice.
    const hadAcceptedSnapshot = projectFilesGenerationRef.current > 0;
    const previousFiles = projectFilesRef.current;
    invalidateProjectFilesCache(
      project.id,
      projectRunWorkspaceContextRef.current,
    );
    const nextFiles = await refreshProjectFiles({ fresh: true });
    collabCheckStatusNow();
    if (
      !hadAcceptedSnapshot
      || projectFileContentSnapshotsEqual(previousFiles, nextFiles)
    ) {
      return;
    }
    // A real snapshot change landed in the pre-handshake gap. Route it
    // through the normal refresh witness so the preview and DESIGN.md state
    // catch up exactly as they do for a live `file-changed` event.
    bumpFilesRefresh();
    setDesignMdRefreshKey((n) => n + 1);
  }, [
    bumpFilesRefresh,
    collabCheckStatusNow,
    project.id,
    refreshProjectFiles,
  ]);
  const coalescedFileChangedRefresh = useCoalescedCallback(
    refreshFilesAndDesignMd,
    { wait: 80, maxWait: 250 },
  );
  // Collab realtime hop-2: poll-as-floor for the comment poll below. True while
  // the project events SSE (which now also carries `comment-changed`) is live;
  // the comment poll slows to a safety-net cadence while true and runs at full
  // ~5s cadence while false (SSE unavailable — packaged old shell / tests).
  const [projectEventsSseConnected, setProjectEventsSseConnected] = useState(false);
  // Ref to the (later-defined) comment refresher so the SSE handler above can
  // call it without a temporal-dead-zone reference.
  const refreshPreviewCommentsRef = useRef<(() => Promise<void>) | null>(null);
  // Same temporal-dead-zone dodge for the conversation re-read, used by the
  // `chat-artifact-refs-changed` branch below.
  const scheduleConversationMessageRefreshRef = useRef<((conversationId: string) => void) | null>(
    null,
  );
  const handleProjectEvent = useCallback((evt: ProjectEvent) => {
    if (evt.type === 'file-changed') {
      iframeKeepAlivePool.evictProject(project.id);
      invalidateHtmlSourceSnapshotProject(project.id);
      coalescedFileChangedRefresh();
      void recoverMaterializedConversations(project.id, projectRunAuthorityKey);
      return;
    }
    if (evt.type === 'comment-changed') {
      // Collab realtime hop-2 (reference path): the daemon merged a teammate's
      // comment change into local storage and pushed this thin signal. Re-fetch
      // the comment list so it appears without waiting for the fallback poll.
      // `refreshPreviewComments` is defined later in this component, so reach it
      // through a ref to avoid a temporal-dead-zone reference here.
      if (evt.projectId === project.id) void refreshPreviewCommentsRef.current?.();
      return;
    }
    if (evt.type === 'chat-artifact-refs-changed') {
      /*
       * A card's static cover finished rendering after its turn already ended.
       *
       * The render deliberately outlives the turn, so it lands well after the
       * one post-run re-read (`scheduleConversationMessageRefresh`, 150ms) has
       * already returned a message with no ready ref — measured at 616ms on a
       * real client against that 150ms window. Without this the card sits on
       * the live-iframe degrade branch for the rest of the session, which is
       * what `chat-artifact-versioning-design.md` line 505 forbids: "后台
       * ready 后消息投影更新".
       *
       * Re-read rather than apply: the event carries no refs, so `listMessages`
       * stays the single authority on what a ref is, and a duplicate event
       * costs one redundant fetch instead of a wrong card. Reusing the existing
       * scheduler also keeps the degrade branch mounted until the real refs
       * arrive — line 505 asks for a follow-up update, not a placeholder.
       */
      if (evt.projectId === project.id) {
        scheduleConversationMessageRefreshRef.current?.(evt.conversationId);
      }
      return;
    }
    if (evt.type === 'presence-changed') {
      // Hub push channel: a teammate joined/left. Refresh the roster now
      // instead of waiting for the next 10s heartbeat tick.
      if (evt.projectId === project.id) collabRefreshPresence();
      return;
    }
    if (evt.type === 'project-metadata-changed') {
      // Hub push channel: rename or a fresh content publish landed. Run one
      // status check now (drives the member auto-pull) instead of waiting for
      // the next 5s status tick.
      if (evt.projectId === project.id) {
        invalidateHtmlSourceSnapshotProject(project.id);
        collabCheckStatusNow();
        void recoverMaterializedConversations(project.id, projectRunAuthorityKey);
        // The daemon also pushes this signal when a pull just swapped the
        // shared-project placeholder record for the real name
        // (registerPulledProject → notifyProjectMetadataChanged). App.tsx's
        // `projects` state never re-reads a project record on its own, so
        // without this refetch a member's sidebar/tab title stays on the
        // "共享项目" placeholder until a full page reload (recvqhwv6RPU1j).
        // Thin-event model: re-fetch the record, propagate up only when a
        // rendered field actually changed — an unconditional apply would
        // re-render the whole App on every content-publish nudge.
        const capturedProjectId = project.id;
        const capturedAuthorizationKey = projectAuthorizationKey;
        const capturedProjectWorkspaceContext = projectRunWorkspaceContext;
        void Promise.all([
          getProject(capturedProjectId, capturedProjectWorkspaceContext),
          resolveAuthoritativeProjectName
            ? resolveAuthoritativeProjectName(capturedProjectId, capturedAuthorizationKey)
            : Promise.resolve<ProjectNameAuthorityResolution>({
                kind: 'resolved',
                name: authoritativeProjectName ?? null,
              }),
        ]).then(([fresh, authorityResolution]) => {
          if (!fresh) return;
          if (authorityResolution.kind === 'stale') return;
          if (activeAuthorizationLifetimeRef.current !== capturedAuthorizationKey) return;
          // User switched projects while the fetch was in flight.
          if (projectIdRef.current !== capturedProjectId) return;
          const current = projectRef.current;
          const reconciled = reconcileProjectDetail(
            current,
            fresh,
            authorityResolution.name,
          );
          if (
            reconciled.name === current.name
            && reconciled.skillId === current.skillId
            && reconciled.designSystemId === current.designSystemId
          ) {
            return;
          }
          onProjectChange(reconciled);
        });
      }
      return;
    }
    if (evt.type === 'project-content-transfer-state') {
      if (evt.projectId === project.id) {
        // The daemon intentionally emits no transfer payload here. A project
        // id can be reused across workspace/owner/resource bindings, so direct
        // application could let scope A's idle hide scope B's download.
        // Re-read the exact-scoped status; CollabClient's request/tombstone
        // fences reject stale responses.
        collabCheckStatusNow();
      }
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
          const list = await listConversations(capturedProjectId, {
            workspaceContext: projectRunWorkspaceContext,
          });
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
  }, [
    authoritativeProjectName,
    coalescedFileChangedRefresh,
    collabCheckStatusNow,
    collabRefreshPresence,
    iframeKeepAlivePool,
    onProjectChange,
    onProjectsRefresh,
    refreshLiveArtifacts,
    recoverMaterializedConversations,
    resolveAuthoritativeProjectName,
    project.id,
    projectAuthorizationKey,
    projectRunAuthorityKey,
    projectRunWorkspaceContext,
  ]);
  // A bound project must not open a headerless EventSource while its exact
  // authority is unresolved or forbidden: that request can only fail and the
  // EventSource reconnect loop would keep retrying a terminal response.
  // Anonymous/local unbound projects intentionally keep their legacy stream
  // after the daemon settles them as unbound. A missing local workspaceId is
  // not sufficient: that project row can lag a hidden daemon-side Team mirror.
  const projectEventsEnabled =
    daemonLive
    && projectWorkspaceScopeReady(projectWorkspaceScopeState.scope);
  useProjectFileEvents(project.id, projectEventsEnabled, handleProjectEvent, {
    onConnectedChange: setProjectEventsSseConnected,
    // Files or comments can change after their initial snapshots but before
    // SSE is listening. Reconcile both once the exact-scoped stream is ready:
    // for comments this also redeems a daemon-side dirty mark left by a hub
    // event that arrived in the pre-handshake gap.
    onReady: () => {
      void reconcileFilesWhenProjectEventsBecomeReady();
      void refreshPreviewCommentsRef.current?.();
    },
  }, projectRunWorkspaceContext);

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
    // A restarted/deep-linked project already carries its persisted
    // conversation in the route while the daemon's conversation list is still
    // hydrating. Preserve that authority until activeConversationId resolves;
    // otherwise this first tab-sync pass strips `/conversations/:cid` and the
    // subsequent list load can no longer select the requested conversation.
    const effectiveConversationId = activeConversationId ?? routeConversationId;
    const nextKey = `${effectiveConversationId ?? ''}:${target ?? ''}`;
    if (nextKey === lastSyncedRouteKeyRef.current) return;
    lastSyncedRouteKeyRef.current = nextKey;
    lastSyncedConversationIdRef.current = effectiveConversationId;
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
        conversationId: effectiveConversationId,
        fileName: target,
      },
      { replace: true },
    );
  }, [
    openTabsState.active,
    projectFileNames,
    project.id,
    activeConversationId,
    routeConversationId,
  ]);

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
      void saveMessage(project.id, activeConversationId, m, {
        ...options,
        workspaceContext: projectRunWorkspaceContext,
      });
    },
    [project.id, activeConversationId, projectRunWorkspaceContext],
  );

  const persistMessageById = useCallback(
    (messageId: string, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      setMessages((curr) => {
        const found = curr.find((m) => m.id === messageId);
        if (found && !isPhantomDaemonRunMessage(found)) {
          void saveMessage(project.id, activeConversationId, found, {
            ...options,
            workspaceContext: projectRunWorkspaceContext,
          });
        }
        return curr;
      });
    },
    [project.id, activeConversationId, projectRunWorkspaceContext],
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
          void saveMessage(project.id, activeConversationId, saved, {
            ...persistOptions,
            workspaceContext: projectRunWorkspaceContext,
          });
        }
        return next;
      });
    },
    [project.id, activeConversationId, projectRunWorkspaceContext],
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
      if (persist) {
        void saveMessage(project.id, conversationId, message, {
          ...options,
          workspaceContext: projectRunWorkspaceContext,
        });
      }
    },
    [activeConversationId, project.id, projectRunWorkspaceContext],
  );

  const readLocalBrowserPageArchiveSnapshot = useCallback(
    async (sourceUrl: string | null | undefined): Promise<BrandBrowserSnapshot> => {
      const manifestText = await fetchProjectFileText(project.id, BROWSER_PAGE_ARCHIVE_INDEX_FILE, {
        cache: 'no-store',
        cacheBustKey: Date.now(),
        workspaceContext: projectRunWorkspaceContext,
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
        fetchProjectFileText(project.id, parsed.htmlFile, {
          cache: 'no-store',
          cacheBustKey: parsed.capturedAt,
          workspaceContext: projectRunWorkspaceContext,
        }),
        fetchProjectFileText(project.id, parsed.cssFile, {
          cache: 'no-store',
          cacheBustKey: parsed.capturedAt,
          workspaceContext: projectRunWorkspaceContext,
        }),
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
    [project.id, projectRunWorkspaceContext, t],
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

  // Memory the conversation itself wrote. Extraction runs out of band after the
  // turn (the daemon queues it on child close), so there is no run event left to
  // carry it — and until this landed, three rules could reach the store with the
  // transcript showing nothing but prose (OPEND-2607). Same shape as the assist
  // card above: one host-authored assistant message, persisted with the
  // conversation, so the card is still there after a reload. A batch that wrote
  // nothing never reaches here, so the block simply does not appear at 0 — the
  // draft's rule for every "empty means gone" surface in the panel.
  const {
    batch: memoryWritten,
    dismiss: dismissMemoryWritten,
  } = useMemoryWrittenCard(memoryExtractionRunActive);
  useEffect(() => {
    if (!memoryWritten || !activeConversationId) return;
    if (messagesConversationId !== activeConversationId) return;
    const content = memoryWrittenCardContent(
      memoryWritten,
      t('chat.memoryWrittenSummary', { count: memoryWritten.count }),
    );
    appendConversationMessage(activeConversationId, {
      id: randomUUID(),
      role: 'assistant',
      agentId: selectedAssistantIdentity.agentId,
      agentName: selectedAssistantIdentity.agentName,
      content,
      events: [{ kind: 'text', text: content }],
      createdAt: Date.now(),
    });
    dismissMemoryWritten();
  }, [
    memoryWritten,
    dismissMemoryWritten,
    activeConversationId,
    appendConversationMessage,
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
      if (persist) {
        void saveMessage(project.id, conversationId, message, {
          ...options,
          workspaceContext: projectRunWorkspaceContext,
        });
      }
    },
    [activeConversationId, project.id, projectRunWorkspaceContext],
  );

  const refreshConversationMessagesFromServer = useCallback(
    async (conversationId: string) => {
      if (messagesConversationIdRef.current !== conversationId) return;
      try {
        const serverMessages = await listMessages(
          project.id,
          conversationId,
          projectRunWorkspaceContext,
        );
        if (messagesConversationIdRef.current !== conversationId) return;
        setMessages((current) => mergeServerMessagesIntoConversation(current, serverMessages));
        setMessagesInitialized(true);
        setMessagesConversationId(conversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        console.warn('Failed to refresh conversation messages after run completion', err);
      }
    },
    [project.id, projectRunWorkspaceContext],
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
          rating: change.rating,
          reasonCodes: change.reasonCodes ?? [],
          hasCustomReason: !!change.customReason,
          customReason: normalizeCustomReason(change.customReason),
        }, projectRunWorkspaceContext);
      }
    },
    [updateMessageById, activeConversationId, projectRunWorkspaceContext],
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
      stderrTail?: string,
    ) => {
      if (!message) return;
      updateMessageById(
        messageId,
        (prev) => appendErrorStatusEvent(prev, message, code, failure, stderrTail),
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
          const outcome = await finalizeBrandProject(
            designSystemBrandId,
            project.id,
            projectRunWorkspaceContext,
          );
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
        const audit = await fetchProjectDesignSystemPackageAudit(
          project.id,
          projectRunWorkspaceContext,
        );
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
    const commentsGeneration = ++previewCommentsGenerationRef.current;
    const next = await fetchPreviewComments(
      project.id,
      activeConversationId,
      projectRunWorkspaceContext,
    );
    if (previewCommentsGenerationRef.current !== commentsGeneration) return;
    setPreviewComments(next);
    setAttachedComments((current) =>
      current
        .map((attached) => next.find((comment) => comment.id === attached.id))
        .filter((comment): comment is PreviewComment => Boolean(comment)),
    );
  }, [project.id, activeConversationId, projectRunWorkspaceContext]);

  // Expose the latest refresher to the SSE handler (defined earlier) so a
  // pushed `comment-changed` can re-fetch immediately.
  useEffect(() => {
    refreshPreviewCommentsRef.current = refreshPreviewComments;
    return () => {
      refreshPreviewCommentsRef.current = null;
    };
  }, [refreshPreviewComments]);

  // Same exposure for the conversation re-read, so a pushed
  // `chat-artifact-refs-changed` can pick up a cover that landed after the turn.
  useEffect(() => {
    scheduleConversationMessageRefreshRef.current = scheduleConversationMessageRefresh;
    return () => {
      scheduleConversationMessageRefreshRef.current = null;
    };
  }, [scheduleConversationMessageRefresh]);

  // Cross-daemon comment sync: the daemon merges teammates' comments into the
  // local store on a background poll, but the web panel only shows what it last
  // fetched. Collab realtime hop-2 makes this SSE-first: the daemon pushes a thin
  // `comment-changed` on the project events stream when its poll merges a change,
  // and `handleProjectEvent` re-fetches on receipt. This poll is the FLOOR — it
  // slows to a safety-net cadence (30s) while the SSE is connected and runs at
  // the original ~5s cadence while the SSE is unavailable (packaged old shell /
  // tests), so a client whose stream never connects has zero regression.
  // Gated on `projectCollab.enabled` so a personal / off-team project never
  // polls. This only replaces the loaded comment LIST — the composer /
  // create-form drafts are separate local state, so an in-flight comment the
  // user is typing is never clobbered.
  useEffect(() => {
    if (!projectCollab.enabled || !activeConversationId) return undefined;
    const pollMs = projectEventsSseConnected ? 30_000 : 5_000;
    const interval = setInterval(() => {
      void refreshPreviewComments();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPreviewComments();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [projectCollab.enabled, activeConversationId, refreshPreviewComments, projectEventsSseConnected]);

  const savePreviewComment = useCallback(
    async (
      target: PreviewCommentTarget,
      note: string,
      attachAfterSave: boolean,
      images: File[] = [],
      commentId?: string,
    ) => {
      const commentConversationId = activeConversationId ?? routeConversationId;
      if (!commentConversationId) {
        setProjectActionsToast({
          message: t('project.previewCommentSaveFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
        return null;
      }
      if (projectCollab.materializationPending) return null;
      // Upload any attached images first so the saved comment carries durable
      // file paths — this is what lets the comment list / re-opened popover
      // re-display the images instead of losing them on echo.
      let uploadedAttachments: PreviewCommentAttachment[] | undefined;
      if (images.length > 0) {
        const result = await uploadProjectFiles(
          project.id,
          images,
          undefined,
          projectRunWorkspaceContext,
        );
        if (result.uploaded.length !== images.length) {
          setProjectActionsToast({
            message: t('project.previewCommentSaveFailed'),
            details: null,
            tone: 'error',
            ttlMs: 5000,
          });
          return null;
        }
        uploadedAttachments = result.uploaded.map((file) => ({ path: file.path, name: file.name }));
      }
      const existing = commentId
        ? previewComments.find((comment) => comment.id === commentId)
        : undefined;
      const attachments = mergePreviewCommentAttachments(existing?.attachments, uploadedAttachments);
      const saved = await upsertPreviewComment(
        project.id,
        commentConversationId,
        {
          ...(commentId ? { id: commentId } : {}),
          target,
          note,
          ...(attachments.length > 0 ? { attachments } : {}),
        },
        projectRunWorkspaceContext,
      );
      if (!saved) {
        // Do not fail silently (recvq5BVsolIxi follow-up): a missing/expired
        // workspace context 401s here with zero prior UI feedback, and the
        // popover otherwise just closes as if the comment had saved.
        setProjectActionsToast({
          message: t('project.previewCommentSaveFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
        return null;
      }
      commitPreviewComments((current) => mergeSavedPreviewComment(current, saved));
      setAttachedComments((current) =>
        attachAfterSave ? mergeAttachedComments(current, saved) : current.map((comment) => comment.id === saved.id ? saved : comment),
      );
      return saved;
    },
    [
      project.id,
      activeConversationId,
      routeConversationId,
      commitPreviewComments,
      previewComments,
      projectRunWorkspaceContext,
      t,
      projectCollab.materializationPending,
    ],
  );

  const removePreviewComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      const commentConversationId = activeConversationId ?? routeConversationId;
      if (!commentConversationId) {
        setProjectActionsToast({
          message: t('project.previewCommentSaveFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
        return false;
      }
      if (projectCollab.materializationPending) return false;
      const ok = await deletePreviewComment(
        project.id,
        commentConversationId,
        commentId,
        projectRunWorkspaceContext,
      );
      if (!ok) {
        setProjectActionsToast({
          message: t('project.previewCommentSaveFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
        return false;
      }
      commitPreviewComments((current) => current.filter((comment) => comment.id !== commentId));
      setAttachedComments((current) => removeAttachedComment(current, commentId));
      return true;
    },
    [
      project.id,
      activeConversationId,
      routeConversationId,
      commitPreviewComments,
      projectRunWorkspaceContext,
      t,
      projectCollab.materializationPending,
    ],
  );

  /**
   * Persist a sidebar drag-reorder (recvq5BVsolIxi Phase 2). Applies the new
   * `sortKey` to local state FIRST (optimistic — the drag already showed the
   * new order instantly) so a slow PATCH never flashes the list back to its
   * old order, then reconciles with whatever the daemon actually persisted.
   * A failed PATCH leaves the optimistic order in place rather than
   * snapping back — the daemon call is a best-effort persistence layer for a
   * personal display preference, not content that must round-trip. Even so,
   * a failed persist gets a toast (recvq5BVsolIxi follow-up): the local
   * order still looks right until the next reload silently drops it, and the
   * user should have a chance to notice and retry before that happens.
   */
  const reorderPreviewComment = useCallback(
    async (commentId: string, sortKey: number) => {
      const commentConversationId = activeConversationId ?? routeConversationId;
      if (!commentConversationId) {
        setProjectActionsToast({
          message: t('project.previewCommentReorderFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
        return;
      }
      if (projectCollab.materializationPending) return;
      commitPreviewComments((current) =>
        current.map((comment) => (comment.id === commentId ? { ...comment, sortKey } : comment)),
      );
      const saved = await patchPreviewCommentSortKey(
        project.id,
        commentConversationId,
        commentId,
        sortKey,
        projectRunWorkspaceContext,
      );
      if (saved) {
        commitPreviewComments((current) => mergeSavedPreviewComment(current, saved));
      } else {
        setProjectActionsToast({
          message: t('project.previewCommentReorderFailed'),
          details: null,
          tone: 'error',
          ttlMs: 5000,
        });
      }
    },
    [
      project.id,
      activeConversationId,
      routeConversationId,
      commitPreviewComments,
      projectRunWorkspaceContext,
      t,
      projectCollab.materializationPending,
    ],
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
      commitPreviewComments((current) =>
        current.map((comment) =>
          persistedAttachments.some((attachment) => attachment.id === comment.id)
            ? { ...comment, status }
            : comment,
        ),
      );
      await Promise.all(
        persistedAttachments.map((attachment) =>
          patchPreviewCommentStatus(
            project.id,
            activeConversationId,
            attachment.id,
            status,
            projectRunWorkspaceContext,
          ),
        ),
      );
      void refreshPreviewComments();
    },
    [
      project.id,
      activeConversationId,
      commitPreviewComments,
      refreshPreviewComments,
      projectRunWorkspaceContext,
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

  // 组件 22 · 重连 · S29:换项目 / 离开这一屏,本地就不再跟着那条流了,
  // 掉线那一行不该跟着走。会话之间的隔离由渲染前的
  // `reconnectViewForConversation` 负责;这里管的是整屏的收尾。
  useEffect(
    () => () => {
      setReconnectView(null);
    },
    [project.id],
  );

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
        ? await listActiveChatRuns(
            project.id,
            reattachConversationId,
            projectRunWorkspaceContext,
          )
        : [];
      const historicalRuns = missingRunIdMessages.length > 0
        ? (await listProjectRuns(projectRunWorkspaceContext)).filter(
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
        const needsReplayForMessage =
          isActiveRunStatus(message.runStatus) ||
          replayingTerminalRun ||
          spuriouslyFailedPending ||
          recoverableGenericDisconnectFailed;
        // A predecessor can be persisted as physically succeeded immediately
        // before the logical task advances. Probe daemon task truth even when
        // this row otherwise looks terminal; completed task rows bail out
        // below without replaying their final Run again.
        const needsTaskProjectionProbe = Boolean(
          message.strategyTaskExecutionId
          && message.runId
          && message.runStatus === 'succeeded',
        );
        const needsFullReplay = needsReplayForMessage || needsTaskProjectionProbe;
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

        const physicalStatus = fallbackRun
          ?? await fetchChatRunStatus(runId, projectRunWorkspaceContext);
        if (cancelled) return;
        if (!physicalStatus) {
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
        const projectedActiveRunId = physicalStatus.strategyTask?.activeRunId;
        const taskRunAdvanced = Boolean(
          projectedActiveRunId
          && projectedActiveRunId !== runId,
        );
        const reattachRunId = taskRunAdvanced && projectedActiveRunId
          ? projectedActiveRunId
          : runId;
        const projectedTaskStatus: ChatMessage['runStatus'] =
          physicalStatus.strategyTask?.terminal === true
            ? physicalStatus.strategyTask.outcome === 'canceled'
              ? 'canceled'
              : physicalStatus.strategyTask.outcome === 'blocked'
                ? 'failed'
                : 'succeeded'
            : 'running';
        // A crash may persist the predecessor Run after the daemon has already
        // advanced the logical task. Treat the daemon projection as the
        // subscription truth: the predecessor's physical `succeeded` status
        // is not the user task terminal state.
        const status = taskRunAdvanced
          ? {
              ...physicalStatus,
              id: reattachRunId,
              status: projectedTaskStatus,
            }
          : physicalStatus;
        const projectedRunAlreadyHydrated = Boolean(
          taskRunAdvanced
          && messages.some(
            (candidate) =>
              candidate.id !== message.id
              && candidate.role === 'assistant'
              && candidate.runId === reattachRunId,
          ),
        );
        if (projectedRunAlreadyHydrated) {
          // A normal hydration contains one persisted assistant message per
          // physical strategy Run. The predecessor's status probe still
          // projects the task's active successor, but that successor must own
          // its own replay/reattach. Replaying it into this predecessor would
          // append the final answer here while its hydrated sibling already
          // renders the same answer, producing a duplicate conclusion after a
          // hard refresh. Keep the crash-window recovery below for the case
          // where the successor message has not been persisted yet.
          if (status.strategyTask?.taskExecutionId) {
            const settledFields = strategySettledMessageFields(status.strategyTask);
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                strategyTaskExecutionId: status.strategyTask!.taskExecutionId,
                ...(settledFields ?? {}),
              }),
              true,
            );
          }
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        if (
          taskRunAdvanced
          && (
            finalizingLocalRunIdsRef.current.has(reattachRunId)
            || reattachControllersRef.current.has(reattachRunId)
            || completedReattachRunsRef.current.has(reattachRunId)
          )
        ) {
          continue;
        }
        if (
          needsTaskProjectionProbe
          && !needsReplayForMessage
          && !taskRunAdvanced
          && (!status.strategyTask || status.strategyTask.terminal)
        ) {
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        if (status.strategyTask?.taskExecutionId) {
          // A blocked verdict is stamped alongside the task handle so the
          // turn's question form stays terminated after a reload.
          const settledFields = strategySettledMessageFields(status.strategyTask);
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              strategyTaskExecutionId: status.strategyTask!.taskExecutionId,
              ...(settledFields ?? {}),
            }),
            true,
          );
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
          const endedAt = await resolveTerminalEndedAt(
            runId,
            status,
            projectRunWorkspaceContext,
          );
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

        if (shouldReplayTerminalRunMessage(message) && !taskRunAdvanced) {
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
            const legacyReplayEndedAt = await resolveTerminalEndedAt(
              runId,
              status,
              projectRunWorkspaceContext,
            );
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
            const diff = computeProducedFiles(
              beforeFileNames,
              nextFiles,
              status.artifactPaths,
              project.id,
              projectDetail.resolvedDir,
            ) ?? [];
            const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
            const touchedFilePaths = extractTouchedFilePathsFromEvents(message.events);
            const traceObjectFiles = mergeRecoveredTraceObjectFile(
              computeTraceObjectFiles(
                beforeFileNames,
                nextFiles,
                [...touchedFilePaths, ...(status.artifactPaths ?? [])],
                project.id,
                projectDetail.resolvedDir,
              ) ?? [],
              recoveredExistingArtifact,
            );
            // OPEND-2588 (2026-09-04): a turn that finishes while we are
            // replaying it opens ALL of its primary artifacts, same as a live
            // completion — the user cannot tell the two apart.
            const turnArtifacts = selectAutoOpenTurnArtifacts(produced, nextFiles, {
              ...autoOpenArtifactOptions,
              preTurnFileNames: beforeFileNames,
              turnStartedAt: status.createdAt || message.startedAt || message.createdAt || null,
              turnEndedAt: message.endedAt || legacyReplayEndedAt || null,
              agentTouchedFileNames: resolveAgentTouchedFileNames(
                [...touchedFilePaths, ...(status.artifactPaths ?? [])],
                nextFiles,
                project.id,
                projectDetail.resolvedDir,
              ),
            });
            if (turnArtifacts.focused) {
              requestOpenTurnArtifacts(turnArtifacts.open, turnArtifacts.focused);
            }
            const deliveryOutcome = resolveDesignDeliveryOutcome({
              sessionMode: message.sessionMode,
              runStatus: 'succeeded',
              content: replayedContent,
              events: message.events,
              producedFileCount: produced.length,
              traceObjectFileCount: traceObjectFiles.length,
              artifactCount: status.artifactCount,
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
        const ownedReattachRunIds = new Set<string>();
        const claimReattachRun = (claimedRunId: string) => {
          ownedReattachRunIds.add(claimedRunId);
          reattachControllersRef.current.set(claimedRunId, controller);
          reattachCancelControllersRef.current.set(claimedRunId, cancelController);
        };
        const releaseReattachRuns = () => {
          for (const claimedRunId of ownedReattachRunIds) {
            if (reattachControllersRef.current.get(claimedRunId) === controller) {
              reattachControllersRef.current.delete(claimedRunId);
            }
            if (reattachCancelControllersRef.current.get(claimedRunId) === cancelController) {
              reattachCancelControllersRef.current.delete(claimedRunId);
            }
          }
        };
        const completeReattachRuns = () => {
          for (const claimedRunId of ownedReattachRunIds) {
            completedReattachRunsRef.current.add(claimedRunId);
          }
        };
        claimReattachRun(runId);
        claimReattachRun(reattachRunId);
        let activeReattachRunId = reattachRunId;
        /*
         * daemon 刚给出的裁定 —— 见 `replayedRunStatusMayLand`。终态时它就是这条 run 的
         * 权威结论,之后从同一条流里回放出来的 `start`(→ `running`)只是历史帧。
         */
        const reattachTerminalVerdict = isTerminalRunStatus(status.status) ? status.status : null;
        /*
         * 这次订阅**听到 daemon 说话了吗**。见 `.finally()` 里的封存判据。
         * 只有三种声音算数:终态的 `onRunStatus`、`onDone`、`onError` ——
         * 它们各自都会封存这条 run 或安排一次有节流的重试。
         */
        let reattachHeardFromDaemon = false;
        if (taskRunAdvanced) {
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runId: reattachRunId,
              runStatus: status.status,
              lastRunEventId: undefined,
              strategyTaskPrefixLength: message.content.length,
              strategyTaskPrefixEventCount: message.events?.length ?? 0,
              ...(status.strategyTask?.taskExecutionId
                ? { strategyTaskExecutionId: status.strategyTask.taskExecutionId }
                : {}),
            }),
            true,
          );
        }
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
        const taskPrefixLength = taskRunAdvanced
          ? message.content.length
          : Math.max(0, message.strategyTaskPrefixLength ?? 0);
        const taskPrefixEventCount = taskRunAdvanced
          ? message.events?.length ?? 0
          : Math.max(0, message.strategyTaskPrefixEventCount ?? 0);
        const preserveTaskPrefix = needsFullReplay && taskPrefixLength > 0;
        const preservedTaskPrefixContent = preserveTaskPrefix
          ? message.content.slice(0, taskPrefixLength)
          : '';
        const preservedTaskPrefixEvents = preserveTaskPrefix
          ? [...(message.events ?? []).slice(0, taskPrefixEventCount)]
          : [];
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
            (prev) => ({
              ...prev,
              content: preservedTaskPrefixContent,
              events: preservedTaskPrefixEvents,
              producedFiles: undefined,
              ...(spuriouslyFailedPending ? { endedAt: undefined } : {}),
            }),
            true,
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
        let replayedContent = needsFullReplay
          ? preserveTaskPrefix
            ? preservedTaskPrefixContent
            : ''
          : message.content;
        let replayedEvents: AgentEvent[] = needsFullReplay
          ? preserveTaskPrefix
            ? preservedTaskPrefixEvents
            : []
          : [...(message.events ?? [])];
        let daemonArtifactCount = status.artifactCount;
        let latestReattachRunStatus: ChatMessage['runStatus'] = status.status;
        let authoritativeReattachArtifactPaths = status.artifactPaths;
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
          // 这两种情况下面会把 `initialLastEventId` 设成 null,daemon 于是从第 0 条
          // 重推 —— 开头那一段是用户已经看过的历史,攒住一次性铺出来,别一段一段
          // 重新走一遍流式(OPEND-2590)。
          replayingHistory: needsFullReplay || taskRunAdvanced,
        });
        reattachTextBuffersRef.current.add(textBuffer);
        const unregisterTextBuffer = () => {
          reattachTextBuffersRef.current.delete(textBuffer);
        };

        const shouldPublishRunFinishedEvent =
          isActiveRunStatus(message.runStatus)
          || isActiveRunStatus(status.status)
          || spuriouslyFailedPending
          || recoverableGenericDisconnectFailed;
        // 组件 22 · 重连 · S29:重挂即将开始 ——「次数用尽、交回给人」这句话此刻
        // 已经不成立了,先把那一行撤掉。这次重挂的读数从 0 起,断不了就永远不会
        // 发 `cleared`,留着那一行会在正文重新流进来时挂着一句反话。
        pushReconnectSignal({ kind: 'dropped', runId });
        const startReattach = () => reattachDaemonRun({
          agentId: message.agentId,
          runId: reattachRunId,
          projectId: project.id,
          conversationId: reattachConversationId,
          workspaceContext: projectRunWorkspaceContext,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          initialLastEventId:
            needsFullReplay || taskRunAdvanced ? null : message.lastRunEventId ?? null,
          publishRunFinishedEvent: shouldPublishRunFinishedEvent,
          onArtifactPaths: (paths) => {
            authoritativeReattachArtifactPaths = paths;
          },
          onStrategyTaskSettled: (strategyTask) => {
            const settledFields = strategySettledMessageFields(strategyTask);
            if (!settledFields) return;
            updateMessageById(
              message.id,
              (prev) => ({ ...prev, ...settledFields }),
              true,
            );
          },
          onRunCreated: (nextRunId, strategyTask) => {
            activeReattachRunId = nextRunId;
            claimReattachRun(nextRunId);
            textBuffer.flush();
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                runId: nextRunId,
                runStatus: 'running',
                lastRunEventId: undefined,
                strategyTaskPrefixLength: replayedContent.length,
                strategyTaskPrefixEventCount: replayedEvents.length,
                ...(strategyTask?.taskExecutionId
                  ? { strategyTaskExecutionId: strategyTask.taskExecutionId }
                  : {}),
              }),
              true,
            );
          },
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
              replayedEvents = appendCoalescedAgentEvent(replayedEvents, ev);
              textBuffer.appendEvent(ev);
            },
            onArtifactCount: (count) => {
              daemonArtifactCount = count;
            },
            // 组件 22 · 重连 · S29,重挂那条流上的同一份读数。
            // 会话取被重挂消息自己的 `reattachConversationId`(后台重挂可能发生在
            // 别的会话上),渲染前再按当前会话过一道,免得串到别人的流水里。
            onReconnect: (state: DaemonReconnectState) => {
              pushReconnectSignal({
                kind: 'transport',
                runId,
                conversationId: reattachConversationId,
                attempt: state.attempt,
                max: state.max,
                phase: state.phase,
              });
            },
            // daemon 把这一轮重跑了 —— 同一行、同一套规矩,只有那句话不同。
            onAgentRetry: (state: DaemonAgentRetryState) => {
              pushReconnectSignal({
                kind: 'agent-retry',
                runId,
                conversationId: reattachConversationId,
                attempt: state.attempt,
                max: state.max,
                phase: state.phase,
              });
            },
            onAgentReconnect: (state: DaemonAgentReconnectState) => {
              pushReconnectSignal({
                kind: 'agent-reconnect',
                runId,
                conversationId: reattachConversationId,
                attempt: state.attempt,
                max: state.max,
                phase: state.phase,
              });
            },
            onDone: async () => {
              reattachHeardFromDaemon = true;
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
              completeReattachRuns();
              releaseReattachRuns();
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
              const endedAt = await resolveTerminalEndedAt(
                activeReattachRunId,
                activeReattachRunId === runId ? status : null,
                projectRunWorkspaceContext,
              );
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
                const diff = computeProducedFiles(
                  beforeFileNames,
                  nextFiles,
                  authoritativeReattachArtifactPaths,
                  project.id,
                  projectDetail.resolvedDir,
                ) ?? [];
                const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                const touchedFilePaths = extractTouchedFilePathsFromEvents(
                  needsFullReplay ? replayedEvents : message.events,
                );
                const traceObjectFiles = mergeRecoveredTraceObjectFile(
                  computeTraceObjectFiles(
                    beforeFileNames,
                    nextFiles,
                    [
                      ...touchedFilePaths,
                      ...(authoritativeReattachArtifactPaths ?? []),
                    ],
                    project.id,
                    projectDetail.resolvedDir,
                  ) ?? [],
                  recoveredExistingArtifact,
                );
                // OPEND-2588 (2026-09-04): see the replay path above — a run
                // that lands while reattached is still a turn finishing.
                const turnArtifacts = selectAutoOpenTurnArtifacts(produced, nextFiles, {
                  ...autoOpenArtifactOptions,
                  preTurnFileNames: beforeFileNames,
                  turnStartedAt: status.createdAt || message.startedAt || message.createdAt || null,
                  turnEndedAt: endedAt ?? null,
                  agentTouchedFileNames: resolveAgentTouchedFileNames(
                    [
                      ...touchedFilePaths,
                      ...(authoritativeReattachArtifactPaths ?? []),
                    ],
                    nextFiles,
                    project.id,
                    projectDetail.resolvedDir,
                  ),
                });
                if (turnArtifacts.focused) {
                  requestOpenTurnArtifacts(turnArtifacts.open, turnArtifacts.focused);
                }
                const deliveryContent = needsFullReplay ? replayedContent : message.content;
                const deliveryEvents = needsFullReplay ? replayedEvents : message.events;
                const deliveryOutcome = resolveDesignDeliveryOutcome({
                  sessionMode: message.sessionMode,
                  runStatus: 'succeeded',
                  content: deliveryContent,
                  events: deliveryEvents,
                  producedFileCount: produced.length,
                  traceObjectFileCount: traceObjectFiles.length,
                  artifactCount: daemonArtifactCount,
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
              reattachHeardFromDaemon = true;
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
                setRunError(err.message, message.id);
                appendAssistantErrorEvent(
                  message.id,
                  err.message,
                  errorCode,
                  failure,
                  stderrTailFromError(err),
                );
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
                    const latestRunStatus = await fetchChatRunStatus(
                      runId,
                      projectRunWorkspaceContext,
                    ).catch(() => null);
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
                    const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced, {
                      ...autoOpenArtifactOptions,
                      preTurnFileNames: beforeFileNames,
                    });
                    if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
                    if (latestRunStatus?.status === 'succeeded') setError(null);
                    if (
                      shouldPublishRunFinishedEvent
                      && latestRunStatus?.status === 'succeeded'
                      && latestRunStatus.agentId === 'amr'
                      && typeof latestRunStatus.artifactCount === 'number'
                    ) {
                      publishDaemonRunFinishedEvent({
                        agentId: latestRunStatus.agentId,
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
              let shouldRefreshConversationAfterCleanup = true;
              let shouldRetryAfterControllerCleanup = false;
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
                    genericDisconnectBackoffUntilRef.current.delete(runId);
                    shouldRetryAfterControllerCleanup = true;
                    setRecoveryTick((t) => t + 1);
                  }, 3000);
                  const latestRunStatus = await fetchChatRunStatus(
                    runId,
                    projectRunWorkspaceContext,
                  ).catch(() => null);
                  if (!latestRunStatus || isActiveRunStatus(latestRunStatus.status)) {
                    // If the backoff elapsed while this probe was still in
                    // flight, its recovery tick already ran while the run was
                    // still registered as reattaching. Re-run recovery after
                    // controller cleanup so the retry is not stranded until an
                    // unrelated state change.
                    shouldRefreshConversationAfterCleanup = false;
                  } else if (latestRunStatus.status === 'succeeded') {
                    if (
                      shouldPublishRunFinishedEvent
                      && latestRunStatus.agentId === 'amr'
                      && typeof latestRunStatus.artifactCount === 'number'
                    ) {
                      publishDaemonRunFinishedEvent({
                        agentId: latestRunStatus.agentId,
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
                          content: preservedTaskPrefixContent,
                          events: preservedTaskPrefixEvents,
                          // A non-empty prefix would otherwise make the
                          // terminal-replay heuristic treat this row as fully
                          // restored. Keep it recoverable until the active
                          // Run's complete visible suffix is replayed.
                          runStatus: preserveTaskPrefix ? 'running' : 'succeeded',
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
                    completeReattachRuns();
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
                completeReattachRuns();
              }
              releaseReattachRuns();
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              if (!skipFinalPersistNow) persistNow({ telemetryFinalized: true });
              if (shouldRetryAfterControllerCleanup && !shouldRefreshConversationAfterCleanup) {
                setRecoveryTick((t) => t + 1);
              }
              if (retryFullReplayAfterCleanup) setRecoveryTick((t) => t + 1);
              if (shouldRefreshConversationAfterCleanup) {
                scheduleConversationMessageRefresh(reattachConversationId);
              }
            },
          },
          onRunStatus: (runStatus) => {
            textBuffer.flush();
            /*
             * 回放出来的「活着」不许压过 daemon 的终态裁定 —— 判据与理由见
             * `replayedRunStatusMayLand`。挡下的帧连 `settled` 信号都不发:
             * 什么都没有落定,重连那一行不该被一帧历史扰动。
             */
            if (
              !replayedRunStatusMayLand(
                runStatus,
                reattachTerminalVerdict,
                activeReattachRunId === reattachRunId,
              )
            ) {
              return;
            }
            // 见发送路径同名回调:落终态就把重连那一行让出去。
            pushReconnectSignal({ kind: 'settled', runId, status: runStatus });
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
            if (isTerminalRunStatus(runStatus)) reattachHeardFromDaemon = true;
            if (runStatus === 'canceled') {
              textBuffer.cancel();
              unregisterTextBuffer();
              // Clear stale retry count for canceled run.
              transientFailedRetriesRef.current.delete(runId);
              genericDisconnectRetriesRef.current.delete(runId);
              genericDisconnectBackoffUntilRef.current.delete(runId);
              completeReattachRuns();
              releaseReattachRuns();
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
            }
            if (isTerminalRunStatus(runStatus)) {
              scheduleConversationMessageRefresh(reattachConversationId);
            }
          },
          /* 同上:重连接管的那条 run 被停掉时,来源同样落到它自己的消息上。 */
          onCancelOrigin: (cancelOrigin) => {
            textBuffer.flush();
            updateMessageById(message.id, (prev) => ({ ...prev, cancelOrigin }), true);
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
              setRunError(msg, message.id);
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
            /*
             * **不变量:一次 daemon 一句话都没说的重挂,不构成「再试一次」的理由。**
             *
             * 这条 effect 的依赖里带着 `messages`,而重挂过程中每条回放事件都会
             * `updateMessageById` —— 它的 `setMessages((curr) => curr.map(...))` 永远返回
             * 新数组,所以每条事件都让 effect 重跑一次。正常收场时不要紧:`onDone` /
             * `onError` / 终态 `onRunStatus` 都会 `completeReattachRuns()` 把这条 run 封存,
             * 重跑时在封存那道闸上直接 `continue`。
             *
             * 但流**没给出任何裁定**就结束时,收尾只走这里的 `releaseReattachRuns()`:
             * 认领被释放、又没被封存,于是下一次重跑立刻又订阅一次、又回放一整份日志、
             * 又改一遍 `messages` —— 实测约 120 次/秒,每次都带一次 SSE 订阅和一次
             * `saveMessage`,栈就落在用户报的 `onRunEventId → updateMessageById` 和
             * `persistSoon → persistMessageById` 上。
             *
             * 封存不是死路:重连行的手动重试(`handleManualReconnect`)会把这条 run 从
             * `completedReattachRunsRef` 里删掉,用户始终有出路。
             *
             * 我们自己 abort 掉的那次除外 —— 那是卸载/切会话/按停的收尾,不是
             * 「daemon 没说话」;那些路径各自会重挂或把这一行落终态,封存反而会让
             * 切回来时接不上。
             */
            if (!reattachHeardFromDaemon && !controller.signal.aborted) {
              completeReattachRuns();
            }
            releaseReattachRuns();
            clearActiveRunRefs(reattachConversationId, controller, cancelController);
          });
        /*
         * 组件 22 · 重连 · 连接预算:重挂**排队**,但只排「回放」那一类。
         *
         * `reattachDaemonRun` 的 promise 要等这条流走完才 settle。daemon 还说
         * 这条 run 活着时,那就是「等这次生成结束」——把它放进闸里,后面排队的
         * run 在它跑完之前一个字都收不到,那不是限流,是丢输出。所以活着的 run
         * 直接放行,只有终态回放(有限的事件日志,很快 settle)进闸。
         *
         * 闸只改**同时**开几条,不改开不开:被挡住的那条在前一条 settle 时立刻
         * 补上(见 lib/bounded-concurrency.ts)。
         */
        const reattachIsLiveStream =
          isActiveRunStatus(message.runStatus) || isActiveRunStatus(status.status);
        if (reattachIsLiveStream) {
          void startReattach();
        } else {
          void reattachReplayGate.run(startReattach);
        }
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
    requestOpenTurnArtifacts,
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
        const serverMessages = await listMessages(
          project.id,
          activeConversationId,
          projectRunWorkspaceContext,
        ).catch(() => null);
        if (cancelled) return;
        const recoveryMessages = serverMessages && serverMessages.length > 0
          ? serverMessages
          : messagesRef.current;
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
          const latestRunStatus = await fetchChatRunStatus(
            runId,
            projectRunWorkspaceContext,
          ).catch(() => null);
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
          const producedArtifactToOpen = selectAutoOpenProducedArtifact(produced, {
            ...autoOpenArtifactOptions,
            preTurnFileNames: beforeFileNames,
          });
          if (producedArtifactToOpen) requestOpenFile(producedArtifactToOpen);
          // This message's persisted runStatus was already terminal (a
          // precondition of hasRecoverableArtifactMessage); when it has no
          // stored endedAt, fall back to the daemon's authoritative terminal
          // timestamp (already fetched above as latestRunStatus) instead of
          // this reload/poll's wall-clock time.
          const recoveredArtifactEndedAt = await resolveTerminalEndedAt(
            runId,
            latestRunStatus,
            projectRunWorkspaceContext,
          );
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
    if (queuedChatSendsRef.current.some((candidate) => candidate.id === item.id)) {
      return false;
    }
    const next = [...queuedChatSendsRef.current, item];
    commitQueuedChatSends(next);
    return true;
  }, [commitQueuedChatSends]);

  const removeQueuedChatSend = useCallback((id: string) => {
    const next = queuedChatSendsRef.current.filter((item) => item.id !== id);
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const updateQueuedChatSend = useCallback((id: string, update: QueuedChatSendUpdate) => {
    const next = queuedChatSendsRef.current.map((item) => {
      if (item.id !== id) return item;
      const meta = stripQueueOnlyFromMeta({ ...(item.meta ?? {}), ...(update.meta ?? {}) });
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
    const clientRequestId = input.meta?.clientRequestId ?? randomUUID();
    const queuedMeta = stripQueueOnlyFromMeta({
      ...(input.meta ?? {}),
      clientRequestId,
    });
    const enqueued = enqueueChatSend({
      id: clientRequestId,
      conversationId: input.conversationId,
      prompt: input.prompt,
      attachments: input.attachments,
      commentAttachments: input.commentAttachments,
      ...(queuedMeta === undefined ? {} : { meta: queuedMeta }),
      createdAt: Date.now(),
    });
    if (!enqueued) return;
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
        commitPreviewComments((current) =>
          current.map((comment) =>
            reservedCommentIds.has(comment.id)
              ? { ...comment, status: 'applying' }
              : comment,
          ),
        );
        void Promise.all(
          Array.from(reservedCommentIds, (commentId) =>
            patchPreviewCommentStatus(
              project.id,
              input.conversationId,
              commentId,
              'applying',
              projectRunWorkspaceContext,
            ),
          ),
        ).catch(() => {});
      }
    }
  }, [commitPreviewComments, enqueueChatSend, project.id, projectRunWorkspaceContext]);

  const handleSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[] = commentsToAttachments(attachedComments),
      meta?: ProjectChatSendMeta,
      baseMessages?: ChatMessage[],
    ) => {
      if (projectMutationReadOnly) return false;
      if (!activeConversationId) return false;
      if (messagesConversationIdRef.current !== activeConversationId) return false;
      const clientRequestId = meta?.clientRequestId ?? randomUUID();
      meta = {
        ...(meta ?? {}),
        clientRequestId,
      };
      const runSessionMode = meta?.sessionMode ?? activeSessionMode;
      const retryTarget = meta?.retryOfAssistantId
        ? resolveRetryTarget(messages, meta.retryOfAssistantId)
        : null;
      if (meta?.retryOfAssistantId && !retryTarget) return false;
      const blockedRequestKey = JSON.stringify([
        prompt,
        attachments.map((attachment) => [attachment.path, attachment.name]),
        commentAttachments.map((attachment) => attachment.id),
      ]);
      const pendingBlockedTask = blockedRunTaskRef.current;
      const resumesBlockedTask = !meta?.taskAnalytics
        && !retryTarget
        && pendingBlockedTask?.conversationId === activeConversationId
        && pendingBlockedTask.requestKey === blockedRequestKey;
      if (
        pendingBlockedTask?.conversationId === activeConversationId
        && pendingBlockedTask.requestKey !== blockedRequestKey
      ) {
        blockedRunTaskRef.current = null;
      }
      let taskAnalytics = meta?.taskAnalytics
        ?? (retryTarget
          ? buildRecoveryTaskAnalytics(
              messages,
              retryTarget.failedAssistant,
              'manual_retry',
            )
          : resumesBlockedTask
            ? pendingBlockedTask.taskAnalytics
          : buildInitialTaskAnalytics(randomUUID()));
      const runContext = meta?.context ?? retryTarget?.userMsg.runContext;
      const unclaimedHistoryBase = retryTarget
        ? retryTarget.priorMessages
        : baseMessages ?? messages;
      // Stable user ids are also used by retries and durable queue drains. If
      // the row is already visible, replace its position below instead of
      // appending a second copy of the same logical user turn.
      const historyBase = meta?.userMessageId
        ? unclaimedHistoryBase.filter((message) => message.id !== meta.userMessageId)
        : unclaimedHistoryBase;
      if (
        !retryTarget &&
        !prompt.trim() &&
        attachments.length === 0 &&
        commentAttachments.length === 0
      ) return false;
      // AMR must resolve this project's persisted billing principal before a
      // run can start. Local CLI and BYOK runtimes do not consume the Vela
      // wallet, so old daemons without this endpoint and directory outages
      // must not disable those runtimes.
      if (!projectRunHasBillableAmrPrincipal) return false;
      const effectiveAttachments = mergeChatAttachments(
        attachments,
        ...commentAttachments.map((attachment) =>
          chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
        ),
      );
      const byokOpenCodeProvider = byokOpenCodeProviderFromConfig(config);
      const requiresByokPreflight =
        (config.mode === 'api' && config.apiProtocol !== 'bedrock') ||
        (config.mode === 'daemon' && config.agentId === 'byok-opencode');
      if (requiresByokPreflight && !byokOpenCodeProvider) {
        const blockReason = byokPreflightBlockReason(config) ?? 'config_invalid';
        const recoveryActionInstanceId = `blocked:${taskAnalytics.taskExecutionId}`;
        const recoveryActionType: TrackingRunRecoveryActionType =
          blockReason === 'model_required' || blockReason === 'model_default'
            ? 'switch_model_retry'
            : blockReason === 'api_key_required' || blockReason === 'api_key_invalid'
              ? 'authorize_and_retry'
              : 'manual_retry';
        taskAnalytics = {
          ...taskAnalytics,
          recoveryActionType,
          recoveryActionInstanceId,
        };
        blockedRunTaskRef.current = {
          conversationId: activeConversationId,
          requestKey: blockedRequestKey,
          taskAnalytics,
        };
        trackByokPreflightBlocked(analytics.track, {
          source: 'run',
          reason: blockReason,
          provider_id: byokProtocolToTracking(config.apiProtocol) ?? 'unknown',
          active_execution_mode: executionModeToTracking(config.mode),
        });
        trackRunStartBlockedSurfaceView(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'run_start_blocked',
          task_execution_id: taskAnalytics.taskExecutionId,
          recovery_action_instance_id: recoveryActionInstanceId,
          block_reason: blockReason,
          agent_provider_id: byokProtocolToTracking(config.apiProtocol) ?? 'unknown',
          model_id: config.model?.trim() || 'default',
        });
        setError(BYOK_PROVIDER_REQUIRED_MESSAGE);
        onOpenSettings('execution');
        return false;
      }
      if (!retryTarget && meta?.queueOnly) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode, taskAnalytics },
        });
        // `true` means the send has been durably accepted by this view's
        // queue. Callers that own persisted annotations may only remove them
        // after this acknowledgement; preflight rejection remains `false`.
        return true;
      }
      if (currentConversationBusy) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode, taskAnalytics },
        });
        return meta?.acceptDurableQueue === true;
      }
      /*
       * ── OPEND-2614 【不变量】本地数据画得出来的先画,要跟服务器说的话排后面 ──
       *
       * 「点击发送 → 消息上屏」这一段里唯一的 await 是下面那道 OpenDesign Cloud
       * 预检。它在有工作区身份的项目上是**两条 HTTP 往返**,其中
       * `/api/workspace/billing?…&freshness=authoritative` 会逼 daemon 向上游
       * Vela 取一次新读数(daemon 侧翻成 `requireFresh: true`)。上屏排在它后面,
       * 用户点完发送就要盯着 1–2 秒毫无反馈的界面 —— 报告里的「卡顿」是这一趟
       * 网络,不是渲染慢。
       *
       * 预检**该不该拦这一次 run** 一个字都没变:它仍然在持久化和
       * `POST /api/runs` 之前落定;拦下来时这一轮由 `retractPaintedTurn` 原样收回,
       * 照旧落进发送队列,由余额卡 / 弹窗解释原因。
       *
       * 【前置条件】上屏之前必须走完所有**同步**的拒绝路(只排队、会话忙、预检
       * 并发窗口)。同步就能拒的东西画出去再收回,那是白闪一下 —— 所以预检那道
       * 并发窗口的守卫从 `try` 里提到了这里。
       */
      const amrGateApplies =
        config.mode === 'daemon'
        && config.agentId === 'amr'
        && !meta?.amrGatePrechecked;
      // The gate's await opens a window where the conversation is not yet
      // marked busy. A second send arriving during that window behaves like
      // a busy conversation: it queues instead of racing a duplicate run.
      if (
        amrGateApplies
        && amrGateInFlightConversationsRef.current.has(activeConversationId)
      ) {
        if (retryTarget) return false;
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode, taskAnalytics },
        });
        return meta?.acceptDurableQueue === true;
      }
      const runConversationId = activeConversationId;
      setError(null);
      /*
       * 【和上屏同一批】`chatSeed?.id` 是 `ChatPane` 的 `key` 的一部分 —— 清它会把
       * 整个面板**重挂**。重挂会清掉 anchor-to-top 的那两个 ref,而重挂之后到齐的
       * 转录按定义「不是新发的一轮」(`isNewTailUserTurn`),于是这一轮钉不了顶。
       * 原来它和 `setMessages` 在同一批里,重挂和上屏是同一帧;上屏提前而它留在
       * 预检后面的话,就变成「先画好、1–2 秒后再把面板拆了重来」,反而制造出
       * OPEND-2615 那个症状。两件事必须绑在一起。
       */
      setChatSeed(null);
      const startedAt = Date.now();
      const previousConversation = conversationsRef.current.find(
        (conversation) => conversation.id === runConversationId,
      );
      const previousConversationUpdatedAt = previousConversation?.updatedAt;
      const previousConversationLatestRun = previousConversation?.latestRun;
      const userMsg: ChatMessage = retryTarget?.userMsg ?? {
        id: meta?.userMessageId ?? randomUUID(),
        role: 'user',
        content: prompt,
        createdAt: startedAt,
        clientRequestId,
        sessionMode: runSessionMode,
        taskAnalytics,
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
      const preTurnFileNames = projectFiles.map((f) => f.name);
      const assistantId = meta?.assistantMessageId ?? randomUUID();
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
        taskAnalytics,
        preTurnFileNames,
      };
      let latestAssistantMsg: ChatMessage = assistantMsg;
      // Tracks the runId once POST /api/runs returns so that the live stream
      // onError handler can mark the run as completed in completedReattachRunsRef.
      // This prevents attachRecoverableRuns from attempting to reattach a run
      // that just failed in the current session (the daemon status fetch is only
      // needed on reload, not for runs that are already known to have failed).
      let currentRunId: string | undefined = undefined;
      let daemonArtifactCount: number | undefined;
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
      const nextHistory = retryTarget
        ? [...retryTarget.priorMessages, userMsg]
        : [...historyBase, userMsg];
      const nextVisibleMessages = retryTarget
        ? [...nextHistory, ...retryTarget.preservedAttempts, assistantMsg]
        : [...nextHistory, assistantMsg];
      /*
       * 画出去 —— 同时把画之前的样子记下来。预检拒绝时要**原样**放回去,而
       * 「原样」只有这一刻知道:`messages` 是一份快照,不是能从这一轮反算出来的量
       * (重试那一路尤其:被重试的那条用户消息和保留下来的失败尝试都在里面)。
       */
      const paintedFrom: { messages: ChatMessage[] | null } = { messages: null };
      setMessages((current) => {
        paintedFrom.messages = current;
        return nextVisibleMessages;
      });
      markStreamingConversation(runConversationId);
      /**
       * 把刚画出去的那一轮收回 —— 只有预检拒绝时才走这里。
       *
       * 会话在这期间被切走的话**一个字都不写回去**:`messages` 那份状态此刻属于
       * 另一条会话,把上一条会话的快照盖上去就是覆盖别人的流水(跨 await 的老坑)。
       * 进行中标记仍要清 —— 它是按会话 id 认领的,清的就是这一条。
       */
      const retractPaintedTurn = () => {
        const restore = paintedFrom.messages;
        paintedFrom.messages = null;
        clearStreamingMarker(runConversationId);
        if (restore === null) return;
        if (messagesConversationIdRef.current !== runConversationId) return;
        setMessages(restore);
      };
      // OpenDesign Cloud pre-run balance gate: a definitively insufficient
      // wallet blocks the run BEFORE any message is persisted or a daemon run
      // spawned, surfacing the subscription dialog instead of a mid-run
      // AMR_INSUFFICIENT_BALANCE failure. Sends the home submit already gated
      // (amrGatePrechecked) pass straight through — the user answered there.
      if (amrGateApplies) {
        const gateConversationId = runConversationId;
        amrGateInFlightConversationsRef.current.add(gateConversationId);
        try {
          // A persisted project Workspace is the spawn billing address even
          // when the local membership/scope read is temporarily unavailable.
          // In that state there is no trustworthy member-scoped wallet for a
          // client preflight, so defer authorization and billing to the daemon
          // and Vela backend. Passing `undefined` here would instead inspect
          // the Personal/account wallet and could block a valid Team run (or
          // present a Personal recharge prompt) before the backend sees the
          // project's persisted Workspace id. An unbound project uses an exact
          // Personal preflight only when runWorkspaceIdentity supplied the
          // active Personal adoption witness. Team/absent witnesses skip the
          // account preflight and let the daemon explicitly reject adoption.
          // A resolved Personal or Team scope keeps its exact member-scoped
          // preflight.
          const persistedWorkspaceId = project.workspaceId?.trim() ?? '';
          const deferAmrPreflightToDaemon =
            !projectRunPreflightContext
            && (
              persistedWorkspaceId.length > 0
              || projectWorkspaceScopeState.scope?.kind === 'unbound'
            );
          const amrModelId = effectiveAgentModelId(
            agentsById.get('amr'),
            config.agentModels?.amr,
          );
          const gate =
            deferAmrPreflightToDaemon
              ? { kind: 'allow' as const }
              : await checkAmrBalanceGate(
                  projectRunPreflightContext
                    ? {
                        workspaceType: projectRunPreflightContext.workspaceType,
                        workspaceId: projectRunPreflightContext.workspaceId,
                        workspaceMemberId:
                          projectRunPreflightContext.workspaceMemberId,
                      }
                    : undefined,
                  amrModelId,
                );
          // A blocked send parks in the conversation queue with its FULL
          // payload (prompt, attachments, comment context) — the composer
          // already cleared itself, and a text-only draft restore would
          // silently drop staged attachments. Retries keep their error card
          // and queue drains already have their queue item, so both skip the
          // re-queue. The pause keeps queued items from re-hitting the gate
          // (and re-popping a dialog) on every unrelated state change; any
          // later send that passes the gate lifts it, and a manual "run now"
          // on a queued item bypasses it deliberately.
          const queueGateSend = (): boolean => {
            // 判定拒绝 = 这一轮不会有 run。先把已经画出去的那一轮收回,再决定
            // 它去哪儿 —— 三条拒绝路(会话切走 / 拦截 / 读不到)都经过这里,
            // 所以收回只写一处。放行那两档(soft / allow)碰不到它。
            retractPaintedTurn();
            if (!retryTarget && !meta?.queueDrain) {
              queueChatSendForCurrentConversation({
                conversationId: gateConversationId,
                prompt,
                attachments: effectiveAttachments,
                commentAttachments,
                meta: { ...(meta ?? {}), sessionMode: runSessionMode, taskAnalytics },
              });
              return true;
            }
            return false;
          };
          const parkBlockedSend = (): boolean => {
            const queued = queueGateSend();
            amrGatePausedQueueConversationsRef.current.add(gateConversationId);
            return queued;
          };
          const acceptedDurableQueue = (queued: boolean): boolean => {
            return queued && meta?.acceptDurableQueue === true;
          };
          // The await may have raced a conversation switch; re-run the entry
          // guard before touching any state so this stale closure can't write
          // the old conversation's messages into the now-visible view. The
          // composer has already cleared, so keep the full payload queued for
          // the original conversation instead of dropping it.
          if (messagesConversationIdRef.current !== activeConversationId) {
            return acceptedDurableQueue(queueGateSend());
          }
          if (gate.kind === 'hard') {
            const recoveryActionInstanceId = `blocked:${taskAnalytics.taskExecutionId}`;
            trackRunStartBlockedSurfaceView(analytics.track, {
              page_name: 'chat_panel',
              area: 'chat_composer',
              element: 'run_start_blocked',
              task_execution_id: taskAnalytics.taskExecutionId,
              recovery_action_instance_id: recoveryActionInstanceId,
              block_reason: gate.reason,
              agent_provider_id: 'amr',
              model_id: config.agentModels?.amr?.model?.trim() || 'default',
            });
            taskAnalytics = {
              ...taskAnalytics,
              recoveryActionType: 'manual_retry',
              recoveryActionInstanceId,
            };
            // 「同时唤起什么弹窗」是四组分支唯一的差别(规格 §6.V)。
            //
            // 被登出不在这四组里:那一档说的是登录,不是钱,主按钮是应用内登录,
            // 所以它无条件走原来那张弹窗。
            setAmrBalanceGateBlock({
              reason: gate.reason,
              dialog:
                gate.reason === 'signed_out'
                  ? 'upgrade'
                  : amrBalanceBlockedDialog(amrBalanceBranchRef.current),
              snapshot: gate.snapshot,
              conversationId: gateConversationId,
            });
            // 拦截档:把流水里那张卡点亮 —— 弹窗一关就什么都不剩(Max · owner 那组
            // 干脆没有弹窗),而人回到聊天里仍然需要看到「为什么开不了」。
            //
            // 只对「余额耗尽」出卡。被登出也走这条硬拦截,但那张卡说的是钱的事,
            // 摆一个 $0.00 去解释一次登录过期是在误导 —— 那一档交给弹窗。
            if (gate.reason === 'insufficient') {
              setAmrBalanceCardUsd(amrBalanceCardBalanceUsd(gate.snapshot));
              setAmrBalanceCardProfile(gate.snapshot.profile ?? null);
            }
            return acceptedDurableQueue(parkBlockedSend());
          }
          if (gate.kind === 'unavailable') {
            return acceptedDurableQueue(parkBlockedSend());
          }
          if (gate.kind === 'soft') {
            /*
             * 告警档。产品 2026-08-26 裁决:「告警可继续的不弹窗,只有卡片」——
             * 所以这里**不再拦住这一次发送**,只在流水里留下那张卡,人自己决定
             * 要不要现在去充值(D4 不阻塞)。
             *
             * 这里曾经还夹着一道 `isPaidAmrPlan(await resolveAmrPlan(...))`。
             * 产品 2026-09-03 裁决把它拆了(OPEND-2600):低余额提醒对**所有档位**
             * 可见 —— 免费档的钱包读数同样是他们唯一的约束,不提醒才是坑人。
             * 顺带解掉红线那一条:那道过滤要多打一次套餐读数,把出卡挂在一次网络
             * 往返后面。判定已经把「要不要提醒」算完了,呈现层只管画,不再等任何
             * 东西 —— 这一段现在是同步的,原本跨 await 的会话切换复查也不需要了
             * (进这个分支之前已经复查过一次)。
             */
            setAmrBalanceCardUsd(amrBalanceCardBalanceUsd(gate.snapshot));
            setAmrBalanceCardProfile(gate.snapshot.profile ?? null);
          }
          // 判定放行:撤掉那张卡 —— 余额已经不是问题了,提示不该留在屏幕上。
          if (gate.kind === 'allow') {
            setAmrBalanceCardUsd(null);
            setAmrBalanceCardProfile(null);
          }
          amrGatePausedQueueConversationsRef.current.delete(gateConversationId);
        } finally {
          amrGateInFlightConversationsRef.current.delete(gateConversationId);
        }
      }
      /*
       * 上屏提前带来的**新状态**:预检那一两秒里,这一轮已经在跑的样子摆在屏幕上,
       * 于是〔停止〕这颗按钮**第一次**在建出 run 之前可以按。按下去
       * `handleStop` 会把进行中标记清掉、把这条 assistant 收成「已停止」——
       * 如果这里不看一眼,预检回来之后照样持久化并 `POST /api/runs`,
       * 用户明明叫停了却还是跑起来一轮。
       *
       * 判据用进行中标记本身:它是「这条会话此刻认领着哪一轮」的唯一出处,
       * 停止、切走、被别的轮接管,三种情况一次说清。
       *
       * **不收回画面**:停止那条路已经把这一轮收成终态了(用户消息留着,
       * assistant 标成已停止),这里再按预检那套原样放回去,会把用户刚发的
       * 那条消息一起抹掉。
       */
      if (streamingConversationIdRef.current !== runConversationId) return false;
      if (resumesBlockedTask) blockedRunTaskRef.current = null;
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
      activeCompletionNotificationRunsRef.current.add(assistantId);
      updateConversationLatestRun(config.mode === 'daemon' ? 'running' : 'queued');
      setArtifact(null);
      savedArtifactRef.current = null;
      onTouchProject();
      if (!retryTarget) {
        // A send whose id was decided from its occupancy (an inline question
        // form's answer) claims that row once: the daemon keeps whichever
        // answer landed first and hands it back, and this view adopts it so
        // the transcript shows the answer the surviving run actually read.
        if (meta?.userMessageId) {
          void Promise.resolve(
            saveMessage(project.id, runConversationId, userMsg, {
              createOnly: true,
              workspaceContext: projectRunWorkspaceContext,
            }),
          ).then((stored) => {
            if (!stored || stored.content === userMsg.content) return;
            setMessages((current) =>
              current.map((message) =>
                message.id === userMsg.id ? { ...message, content: stored.content } : message,
              ),
            );
          });
        } else {
          persistMessage(userMsg);
        }
      }
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
        ? t('designFiles.createDesignSystemFromProject')
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
          void patchConversation(
            project.id,
            runConversationId,
            { title },
            projectRunWorkspaceContext,
          );
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
          }, projectRunWorkspaceContext);
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
          void patchConversation(
            project.id,
            runConversationId,
            { title: agentTitle },
            projectRunWorkspaceContext,
          );
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
          }, projectRunWorkspaceContext);
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
      // Per-write file-list reads are intentionally fire-and-forget so a file
      // can open while the run is still streaming. Once terminal completion
      // has selected a turn-level artifact, however, an older Write refresh
      // must not move focus again.
      let completionSelectedAutoOpen = false;
      // A new run gets a clean slate: taking the preview over during the last
      // turn says nothing about this one.
      userTookOverPreviewRef.current = false;
      const clearTraceTouchedFilePaths = () => {
        pendingWrites.clear();
        traceTouchedFilePaths.clear();
      };
      const provenTraceTouchedFiles = () => [...traceTouchedFilePaths]
        .map((touchedPath, index) => {
          const name = provenProjectRelativeToolPath(
            touchedPath,
            projectDetail.resolvedDir,
          );
          return name ? { name, path: name, mtime: index } : null;
        })
        .filter((file): file is { name: string; path: string; mtime: number } => file !== null);

      const parser = createArtifactParser();
      let parsedArtifact: Artifact | null = null;
      let liveHtml = '';
      let streamedText = '';

      const updateAssistant = (updater: (prev: ChatMessage) => ChatMessage) => {
        setMessages((curr) => {
          const messageIndex = curr.findIndex((message) => message.id === assistantId);
          if (messageIndex >= 0) {
            const previous = curr[messageIndex]!;
            const updated = updater(previous);
            latestAssistantMsg = updated;
            if (updated === previous) return curr;
            const next = curr.slice();
            next[messageIndex] = updated;
            return next;
          }

          // A workspace-authority refresh can reload the same conversation
          // while POST /runs is retrying. That authoritative read may still
          // be empty and replace the Home handoff's client-owned user and
          // assistant placeholders. The stream remains attached, however, so
          // dropping later deltas here leaves a successful daemon run blank
          // until a tab switch or reload reads the persisted transcript.
          //
          // Restore only the two rows owned by the live controller for the
          // project and conversation still on screen. A revoked authority is
          // never allowed to resurrect them, and settled historical messages
          // keep the existing clear-on-authority-change behavior.
          if (
            abortRef.current !== controller
            || projectIdRef.current !== project.id
            || activeConversationIdRef.current !== runConversationId
            || projectResourceAuthorityRef.current === 'denied'
          ) {
            return curr;
          }
          const updated = updater(latestAssistantMsg);
          latestAssistantMsg = updated;
          const userAlreadyPresent = curr.some((message) => message.id === userMsg.id);
          return [
            ...curr,
            ...(userAlreadyPresent ? [] : [userMsg]),
            updated,
          ];
        });
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
      const pushedEventDeduper = createAdjacentAgentEventDeduper();
      const pushEvent = (ev: AgentEvent) => {
        textBuffer.flush();
        if (pushedEventDeduper.isDuplicate(ev)) return;
        updateAssistant((prev) => {
          const previousEvents = prev.events ?? [];
          const nextEvents = appendCoalescedAgentEvent(previousEvents, ev);
          return nextEvents === previousEvents
            ? prev
            : { ...prev, events: nextEvents };
        });
        /*
         * `<od-focus open="…">` —— agent 说「现在开这个」。
         *
         * daemon 已经证过三件事:key 是这一轮的、路径落在项目根之内、文件**非空**
         * (空白预览在用户眼里就是 bug,产品明确拍过)。所以这里不再复核那三条,
         * 只判客户端才知道的两条:是不是**本轮新建**的,以及用户有没有自己接管
         * 过预览。判据全在 `decideAgentFocusOpen` 里,那是个纯函数,有独立红测。
         *
         * 事件可能在**回合中途**到达 —— 这正是它存在的意义:agent 写完 index.html
         * 之后还要再花一分半写配套资源,不该让用户对着空白等到回合结束。
         */
        if (ev.kind === 'artifact_focus' && ev.open) {
          const declaredPath = ev.open;
          void refreshProjectFiles().then(async (nextFiles) => {
            const moduleFileNames = /\.(jsx|tsx)$/i.test(declaredPath)
              ? await collectReferencedJsxNames(nextFiles, readProjectHtml)
              : undefined;
            const decision = decideAgentFocusOpen({
              declaredPath,
              projectFiles: nextFiles,
              preTurnFileNames: beforeFileNames,
              userTookOverPreview: userTookOverPreviewRef.current,
              moduleFileNames,
            });
            if (decision.shouldOpen && decision.fileName) {
              // agent 的明示优先于本轮后续的启发式排序:它比 rank/mtime 更知道
              // 哪个才是交付物。置位之后,尾随的配套文件写入不会再抢走焦点。
              completionSelectedAutoOpen = true;
              requestOpenFile(decision.fileName);
            }
          }).catch(() => {
            // 后台读文件列表失败不具权威性 —— 保持现状,等下一个事件。
          });
        }
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
              // Absolute daemon tool paths can prove containment before the
              // asynchronous file-list refresh completes. Open the best
              // proven touched artifact immediately so a terminal status and
              // an external `/files` observer cannot outrun the workspace UI.
              const immediateFileName = provenProjectRelativeToolPath(
                filePath,
                projectDetail.resolvedDir,
              );
              const immediateTouchedFiles = provenTraceTouchedFiles();
              const immediateArtifact = selectAutoOpenProducedArtifact(
                immediateTouchedFiles,
                { ...autoOpenArtifactOptions, preTurnFileNames: beforeFileNames },
              );
              if (
                !completionSelectedAutoOpen
                && immediateFileName
                && immediateArtifact === immediateFileName
              ) {
                requestOpenFile(immediateFileName);
              }
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
                // Several Write refreshes can settle together after the UI
                // already renders the run as Done but before the stream's
                // onDone callback arrives. Rank every file touched so far and
                // let only the best artifact open; otherwise a trailing
                // support-file write (plan.md) immediately replaces the
                // generated deliverable (index.html).
                const bestTouchedArtifact = selectAutoOpenProducedArtifact(
                  provenTraceTouchedFiles(),
                  { ...autoOpenArtifactOptions, preTurnFileNames: beforeFileNames },
                ) ?? selectAutoOpenTurnArtifact([], nextFiles, {
                    ...autoOpenArtifactOptions,
                    preTurnFileNames: beforeFileNames,
                    turnStartedAt: startedAt,
                    agentTouchedFileNames: resolveAgentTouchedFileNames(
                      [...traceTouchedFilePaths],
                      nextFiles,
                      project.id,
                      projectDetail.resolvedDir,
                    ),
                  });
                if (
                  !completionSelectedAutoOpen
                  && bestTouchedArtifact === decision.fileName
                  && decision.shouldOpen
                  && decision.fileName
                ) {
                  requestOpenFile(decision.fileName);
                }
              }).catch(() => {
                // A failed background read is non-authoritative. Keep the
                // current file list and skip auto-open until a later event.
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
      let authoritativeArtifactPaths: string[] | undefined;
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
          if (ev.kind === 'text') {
            pushedEventDeduper.reset();
            textBuffer.appendTextEvent(ev.text);
          } else if (ev.kind === 'thinking') {
            pushedEventDeduper.reset();
            textBuffer.appendEvent(ev);
          } else {
            pushEvent(ev);
          }
        },
        onArtifactCount: (count: number) => {
          daemonArtifactCount = count;
        },
        // 组件 22 · 重连 · S29:掉线期间流水最后一行的读数。传输层如实上报,
        // 该不该显示、显示到几分之几由 reconnect-state 判(它也负责与组件 20 互斥)。
        onReconnect: (state: DaemonReconnectState) => {
          if (!currentRunId) return;
          pushReconnectSignal({
            kind: 'transport',
            runId: currentRunId,
            conversationId: runConversationId,
            attempt: state.attempt,
            max: state.max,
            phase: state.phase,
          });
        },
        // 自动重试:daemon 把 agent 那一轮重跑了。走同一行(交付稿 4058 不许为
        // 同一件事再立第三个模块),读数与预算取运行层自己的那一份。
        onAgentRetry: (state: DaemonAgentRetryState) => {
          if (!currentRunId) return;
          pushReconnectSignal({
            kind: 'agent-retry',
            runId: currentRunId,
            conversationId: runConversationId,
            attempt: state.attempt,
            max: state.max,
            phase: state.phase,
          });
        },
        onAgentReconnect: (state: DaemonAgentReconnectState) => {
          if (!currentRunId) return;
          pushReconnectSignal({
            kind: 'agent-reconnect',
            runId: currentRunId,
            conversationId: runConversationId,
            attempt: state.attempt,
            max: state.max,
            phase: state.phase,
          });
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
            void refreshProjectFiles().catch(() => {
              // Retain the last accepted file list while the daemon recovers.
            });
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
              // A settled shared file-list read from before the daemon exit can
              // otherwise win the race with the file-change invalidation and
              // make this turn persist an empty producedFiles list. Completion
              // attribution needs a fresh post-run snapshot.
              let nextFiles = await refreshProjectFiles({ fresh: true });
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
                  completionSelectedAutoOpen = true;
                  requestOpenFile(sameTurnWrite.name);
                } else {
                  const persistence = await persistArtifact(artifactToPersist, nextFiles, finalText);
                  if (persistence.ok) artifactPersistenceSucceeded = true;
                  else artifactPersistenceError = persistence.error;
                  nextFiles = await refreshProjectFiles({ fresh: true });
                }
              }
              const produced = computeProducedFiles(
                beforeFileNames,
                nextFiles,
                authoritativeArtifactPaths,
                project.id,
                projectDetail.resolvedDir,
              ) ?? [];
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
                [
                  ...traceTouchedFilePaths,
                  ...(authoritativeArtifactPaths ?? []),
                ],
                project.id,
                projectDetail.resolvedDir,
              ) ?? [];
              // OPEND-2588 (product ruling 2026-09-04): the turn is over —
              // open ALL of its primary artifacts, not just the best one.
              // `turnArtifacts.focused` is byte-for-byte the old
              // `selectAutoOpenTurnArtifact` answer, so the focused tab below
              // is decided exactly as it was before; only `.open` is new.
              const turnArtifacts = selectAutoOpenTurnArtifacts(produced, nextFiles, {
                ...autoOpenArtifactOptions,
                preTurnFileNames: beforeFileNames,
                turnStartedAt: startedAt,
                turnEndedAt: endedAt ?? null,
                agentTouchedFileNames: resolveAgentTouchedFileNames(
                  [
                    ...traceTouchedFilePaths,
                    ...(authoritativeArtifactPaths ?? []),
                  ],
                  nextFiles,
                  project.id,
                  projectDetail.resolvedDir,
                ),
              });
              const turnArtifactToOpen = turnArtifacts.focused;
              const producedArtifactToOpen = selectAutoOpenProducedArtifact(
                [
                  ...provenTraceTouchedFiles(),
                  ...(turnArtifactToOpen
                    ? [
                        nextFiles.find((file) => file.name === turnArtifactToOpen)
                          ?? { name: turnArtifactToOpen, path: turnArtifactToOpen },
                      ]
                    : []),
                ],
                { ...autoOpenArtifactOptions, preTurnFileNames: beforeFileNames },
              );
              if (producedArtifactToOpen) {
                completionSelectedAutoOpen = true;
                requestOpenTurnArtifacts(turnArtifacts.open, producedArtifactToOpen);
              }
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
                artifactCount: daemonArtifactCount,
                persistenceSucceeded: artifactPersistenceSucceeded,
                persistenceFailed: artifactPersistenceError !== undefined,
              });
              const finalized = applyDesignDeliveryOutcome(
                deliveryCandidate,
                deliveryOutcome,
                artifactPersistenceError,
              );
              latestAssistantMsg = finalized;
              // Only the live completion path arms the experience survey. The
              // reattach and artifact-recovery paths below also settle on
              // `delivered`, but they do so while replaying a run that
              // finished before this page load — "how was that?" about work
              // the user cannot remember finishing is a worse question than
              // one not asked.
              if (deliveryOutcome === 'delivered') notifyArtifactDelivered();
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
          // POST /api/runs can fail before it yields a run id. That is a failed
          // user send, not a failed assistant run: no assistant process ever
          // existed, so keeping the optimistic placeholder would fabricate a
          // run and route the user to the wrong recovery action.
          if (config.mode === 'daemon' && !currentRunId) {
            if (runMayFinalize) {
              setError(null);
              activeCompletionNotificationRunsRef.current.delete(assistantId);
              setConversations((current) =>
                current.map((conversation) => {
                  if (
                    conversation.id !== runConversationId
                    || conversation.latestRun?.startedAt !== startedAt
                  ) {
                    return conversation;
                  }
                  return {
                    ...conversation,
                    ...(previousConversationUpdatedAt === undefined
                      ? {}
                      : { updatedAt: previousConversationUpdatedAt }),
                    latestRun: previousConversationLatestRun,
                  };
                }),
              );
              setMessages((current) => {
                let failedUser: ChatMessage | null = null;
                const next = current.flatMap((message) => {
                  if (message.id === assistantId) return [];
                  if (message.id !== userMsg.id) return [message];
                  failedUser = { ...message, sendFailed: true };
                  return [failedUser];
                });
                if (failedUser) persistMessage(failedUser);
                return next;
              });
              if (runCommentAttachments.length > 0) {
                void patchAttachedStatuses(runCommentAttachments, 'failed');
              }
            }
            clearCurrentRunStreamingMarker(
              runConversationId,
              controller,
              cancelController,
            );
            return;
          }
          // The daemon refused a duplicate design-system enrichment because the
          // conversation already runs one (HTTP 409
          // DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS). The surviving run is the one
          // the user asked for, so this is not a failure worth a global banner;
          // only the duplicate turn itself records why it went nowhere.
          const duplicateEnrichmentRejected =
            errorCode === 'DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS';
          if (runMayFinalize) {
            if (!duplicateEnrichmentRejected) setRunError(err.message, assistantId);
            appendAssistantErrorEvent(
              assistantId,
              err.message,
              errorCode,
              failure,
              stderrTailFromError(err),
            );
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
                  genericDisconnectBackoffUntilRef.current.delete(runIdForGenericDisconnect);
                  setRecoveryTick((t) => t + 1);
                }, 3000);
                const latestRunStatus = await fetchChatRunStatus(
                  runIdForGenericDisconnect,
                  projectRunWorkspaceContext,
                ).catch(() => null);
                if (latestRunStatus?.artifactPaths) {
                  authoritativeArtifactPaths = latestRunStatus.artifactPaths;
                }
                if (!latestRunStatus || isActiveRunStatus(latestRunStatus.status)) {
                } else if (latestRunStatus.status === 'succeeded') {
                  if (
                    latestRunStatus.agentId === 'amr'
                    && typeof latestRunStatus.artifactCount === 'number'
                  ) {
                    publishDaemonRunFinishedEvent({
                      agentId: latestRunStatus.agentId,
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
          const authoritativeTouchedPaths = [
            ...traceTouchedFilePaths,
            ...(authoritativeArtifactPaths ?? []),
          ];
          void (async () => {
            const nextFiles = await refreshProjectFiles({ fresh: true });
            if (authoritativeArtifactPaths === undefined) return;
            const produced = computeProducedFiles(
              beforeFileNames,
              nextFiles,
              authoritativeArtifactPaths,
              project.id,
              projectDetail.resolvedDir,
            ) ?? [];
            const traceObjectFiles = computeTraceObjectFiles(
              beforeFileNames,
              nextFiles,
              authoritativeTouchedPaths,
              project.id,
              projectDetail.resolvedDir,
            ) ?? [];
            updateMessageById(
              assistantId,
              (prev) => ({ ...prev, producedFiles: produced, traceObjectFiles }),
              true,
              { telemetryFinalized: true },
            );
          })().catch(() => {
            // Retain the last accepted file list while the daemon recovers.
          });
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
          taskExecutionId: taskAnalytics.taskExecutionId,
          initialRunId: taskAnalytics.initialRunId,
          sourceRunId: taskAnalytics.sourceRunId,
          taskRunIndex: taskAnalytics.taskRunIndex,
          recoveryActionType: taskAnalytics.recoveryActionType,
          recoveryActionInstanceId: taskAnalytics.recoveryActionInstanceId,
        };
        void streamViaDaemon({
          agentId: config.agentId,
          history: nextHistory,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          handlers,
          projectId: project.id,
          conversationId: runConversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantId,
          clientRequestId,
          skillId: project.skillId ?? null,
          skillIds: Array.isArray(meta?.skillIds) ? meta.skillIds : [],
          context: runContext,
          designSystemId: runtimeDesignSystemId ?? null,
          workspaceContext: projectRunWorkspaceContext,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          sessionMode: runSessionMode,
          appliedPluginSnapshotId:
            meta?.appliedPluginSnapshotId ?? meta?.appliedPluginSnapshot?.snapshotId ?? null,
          research: meta?.research,
          mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata),
          model: daemonByokOpenCode ? config.model : choice?.model ?? null,
          reasoning: daemonByokOpenCode ? null : choice?.reasoning ?? null,
          serviceTier: daemonByokOpenCode ? null : choice?.serviceTier ?? null,
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
          ...(meta?.strategyTaskExecutionId
            ? { taskExecutionId: meta.strategyTaskExecutionId }
            : {}),
          ...(runAnalyticsHints ? { analyticsHints: runAnalyticsHints } : {}),
          onStrategyTaskSettled: (strategyTask) => {
            const settledFields = strategySettledMessageFields(strategyTask);
            if (!settledFields) return;
            latestAssistantMsg = { ...latestAssistantMsg, ...settledFields };
            updateMessageById(
              assistantId,
              (prev) => ({ ...prev, ...settledFields }),
              true,
            );
          },
          onRunCreated: (runId, strategyTask) => {
            // A successor boundary must include the final predecessor delta
            // and buffered text event even when the 250ms UI batch has not
            // fired yet.
            textBuffer.flush();
            const resolvedTaskAnalytics = {
              ...taskAnalytics,
              initialRunId: taskAnalytics.initialRunId ?? runId,
            };
            const strategyTaskExecutionId = strategyTask?.taskExecutionId
              ?? meta?.strategyTaskExecutionId;
            const isTaskSuccessor = Boolean(
              strategyTask
              && latestAssistantMsg.runId
              && latestAssistantMsg.runId !== runId,
            );
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
              taskAnalytics: resolvedTaskAnalytics,
              ...(strategyTaskExecutionId ? { strategyTaskExecutionId } : {}),
              ...(isTaskSuccessor
                ? {
                    strategyTaskPrefixLength: latestAssistantMsg.content.length,
                    strategyTaskPrefixEventCount: latestAssistantMsg.events?.length ?? 0,
                  }
                : {}),
              lastRunEventId: undefined,
            };
            latestAssistantMsg = pinnedAssistant;
            currentRunId = runId;
            // The view may already be on a different project/conversation;
            // pin the daemon run to the original row so returning can reattach.
            void saveMessage(project.id, runConversationId, pinnedAssistant, {
              workspaceContext: projectRunWorkspaceContext,
            });
            updateMessageById(assistantId, (prev) => ({
              ...prev,
              runId,
              runStatus: 'queued',
              taskAnalytics: resolvedTaskAnalytics,
              ...(strategyTaskExecutionId ? { strategyTaskExecutionId } : {}),
              ...(isTaskSuccessor
                ? {
                    strategyTaskPrefixLength: prev.content.length,
                    strategyTaskPrefixEventCount: prev.events?.length ?? 0,
                  }
                : {}),
              lastRunEventId: undefined,
            }));
          },
          onArtifactPaths: (paths) => {
            authoritativeArtifactPaths = paths;
          },
          onRunStatus: (runStatus) => {
            // streamViaDaemon reports `failed` before onError when POST
            // /api/runs itself fails. Until onRunCreated supplies an id there is
            // no assistant run to finalize or persist; onError moves the failure
            // to the user row instead.
            if (!currentRunId && runStatus === 'failed') return;
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
            // 这一轮落终态,掉线那一行就该消失。canceled 由回合 footer 报结果,
            // succeeded 同样不留「已恢复」。见 reconnect-state 的规则表。
            if (currentRunId) {
              pushReconnectSignal({ kind: 'settled', runId: currentRunId, status: runStatus });
            }
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
          /*
           * 「这一轮是谁停的」——只在服务端答得出来时才落到消息上。
           * 交付稿第 81 格那一行「已手动暂停任务」只认 `user_stop`;
           * 存进消息(而不是只留在 run 对象里)是因为刷新之后那一行还得在,
           * 而且还得是同一个来源(盘点 R8)。
           */
          onCancelOrigin: (cancelOrigin) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, cancelOrigin }), true);
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
        // Forward the per-call BYOK provider snapshot so "Same as chat"
        // memory extraction uses the same vendor, endpoint, key and model as
        // the run. The daemon consumes it for this request only.
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
                byokChatProvider,
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
          {
            omitNativeImageAttachments: usesAnthropicProxy(config),
            workspaceContext: projectRunWorkspaceContext,
          },
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
          userMessageId: userMsg.id,
          assistantMessageId: assistantId,
          clientRequestId,
          skillId: project.skillId ?? null,
          skillIds: Array.isArray(meta?.skillIds) ? meta.skillIds : [],
          context: runContext,
          designSystemId: runtimeDesignSystemId ?? null,
          workspaceContext: projectRunWorkspaceContext,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          sessionMode: runSessionMode,
          appliedPluginSnapshotId:
            meta?.appliedPluginSnapshotId ?? meta?.appliedPluginSnapshot?.snapshotId ?? null,
          research: meta?.research,
          mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata),
          model: config.model,
          reasoning: null,
          serviceTier: null,
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
          ...(meta?.strategyTaskExecutionId
            ? { taskExecutionId: meta.strategyTaskExecutionId }
            : {}),
          analyticsHints: {
            ...(meta?.entryFrom ? { entryFrom: meta.entryFrom } : {}),
            ...(byokSessionTurn
              ? { turnIndex: byokSessionTurn.turnIndex, isFirstRun: byokSessionTurn.isFirstRun }
              : {}),
            ...(byokProjectTurn ? { projectTurnIndex: byokProjectTurn.projectTurnIndex } : {}),
            hasExistingArtifact: byokHasExistingArtifact,
            runtimeType: 'byok',
            taskExecutionId: taskAnalytics.taskExecutionId,
            initialRunId: taskAnalytics.initialRunId,
            sourceRunId: taskAnalytics.sourceRunId,
            taskRunIndex: taskAnalytics.taskRunIndex,
            recoveryActionType: taskAnalytics.recoveryActionType,
            recoveryActionInstanceId: taskAnalytics.recoveryActionInstanceId,
          },
          onRunCreated: (runId, strategyTask) => {
            textBuffer.flush();
            const resolvedTaskAnalytics = {
              ...taskAnalytics,
              initialRunId: taskAnalytics.initialRunId ?? runId,
            };
            const strategyTaskExecutionId = strategyTask?.taskExecutionId
              ?? meta?.strategyTaskExecutionId;
            const isTaskSuccessor = Boolean(
              strategyTask
              && latestAssistantMsg.runId
              && latestAssistantMsg.runId !== runId,
            );
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
              taskAnalytics: resolvedTaskAnalytics,
              ...(strategyTaskExecutionId ? { strategyTaskExecutionId } : {}),
              ...(isTaskSuccessor
                ? {
                    strategyTaskPrefixLength: latestAssistantMsg.content.length,
                    strategyTaskPrefixEventCount: latestAssistantMsg.events?.length ?? 0,
                  }
                : {}),
              lastRunEventId: undefined,
            };
            latestAssistantMsg = pinnedAssistant;
            void saveMessage(project.id, runConversationId, pinnedAssistant, {
              workspaceContext: projectRunWorkspaceContext,
            });
            updateMessageById(assistantId, (prev) => ({
              ...prev,
              runId,
              runStatus: 'queued',
              taskAnalytics: resolvedTaskAnalytics,
              ...(strategyTaskExecutionId ? { strategyTaskExecutionId } : {}),
              ...(isTaskSuccessor
                ? {
                    strategyTaskPrefixLength: prev.content.length,
                    strategyTaskPrefixEventCount: prev.events?.length ?? 0,
                  }
                : {}),
              lastRunEventId: undefined,
            }));
          },
          onRunStatus: (runStatus) => {
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            const runMayFinalize = !supersededRunsRef.current.has(controller);
            // 见 CLI / AMR 路径同名回调:落终态就把重连那一行让出去。
            if (currentRunId) {
              pushReconnectSignal({ kind: 'settled', runId: currentRunId, status: runStatus });
            }
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
          /*
           * 「这一轮是谁停的」——只在服务端答得出来时才落到消息上。
           * 交付稿第 81 格那一行「已手动暂停任务」只认 `user_stop`;
           * 存进消息(而不是只留在 run 对象里)是因为刷新之后那一行还得在,
           * 而且还得是同一个来源(盘点 R8)。
           */
          onCancelOrigin: (cancelOrigin) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, cancelOrigin }), true);
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
      project.workspaceId,
      projectDesignSystemId,
      runtimeDesignSystemId,
      project.name,
      projectFiles,
      refreshProjectFiles,
      refreshLiveArtifacts,
      readProjectHtml,
      requestOpenFile,
      requestOpenTurnArtifacts,
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
      onOpenSettings,
      byokImageModelOverride,
      byokVideoModelOverride,
      byokSpeechModelOverride,
      byokSpeechVoiceOverride,
      byokImageModelOptionsPV,
      byokVideoModelOptionsPV,
      byokSpeechModelOptionsPV,
      projectRunPreflightContext,
      projectRunWorkspaceContext,
      projectRunHasBillableAmrPrincipal,
      projectMutationReadOnly,
      projectWorkspaceScopeState.scope,
    ],
  );

  const handleResendUserMessage = useCallback(
    (failedMessage: ChatMessage) => {
      if (failedMessage.role !== 'user' || !failedMessage.sendFailed) return;
      const currentMessages = messagesRef.current;
      const currentMessage = currentMessages.find((message) => message.id === failedMessage.id);
      if (currentMessage?.role !== 'user' || !currentMessage.sendFailed) return;

      const retryMessage: ChatMessage = { ...currentMessage, sendFailed: undefined };
      function restoreFailedState() {
        updateMessageById(
          retryMessage.id,
          (message) => ({ ...message, sendFailed: true }),
          true,
        );
      }

      // Clear the persistent failure state before the canonical send path runs
      // its preflight checks. A rejected preflight restores the retry action.
      updateMessageById(currentMessage.id, () => retryMessage, true);

      void handleSend(
        retryMessage.content,
        retryMessage.attachments ?? [],
        retryMessage.commentAttachments ?? [],
        {
          clientRequestId: retryMessage.clientRequestId ?? retryMessage.id,
          userMessageId: retryMessage.id,
          acceptDurableQueue: true,
          ...(retryMessage.sessionMode ? { sessionMode: retryMessage.sessionMode } : {}),
          ...(retryMessage.runContext
            ? {
                context: retryMessage.runContext,
                skillIds: retryMessage.runContext.skillIds,
              }
            : {}),
          ...(retryMessage.appliedPluginSnapshot
            ? { appliedPluginSnapshot: retryMessage.appliedPluginSnapshot }
            : {}),
          ...(retryMessage.taskAnalytics ? { taskAnalytics: retryMessage.taskAnalytics } : {}),
        },
      ).then(
        (started) => {
          if (!started) restoreFailedState();
        },
        restoreFailedState,
      );
    },
    [handleSend, updateMessageById],
  );

  const handleComposerSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): Promise<ChatSendOutcome> => {
      if (activeConversationId && cloudModelSelected) {
        const decision = await requestAmrArtifactUpgrade({
          projectId: project.id,
          conversationId: activeConversationId,
          source: 'chat_send',
        });
        if (decision === 'cancel') return 'restore-draft';
      }
      void handleSend(prompt, attachments, commentAttachments, meta);
    },
    [activeConversationId, cloudModelSelected, handleSend, project.id],
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
            bumpFilesRefresh();
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
        commitPreviewComments((current) =>
          current.map((comment) =>
            resetIds.has(comment.id) ? { ...comment, status: 'open' } : comment,
          ),
        );
        void Promise.all(
          stuckApplying.map((comment) =>
            patchPreviewCommentStatus(
              project.id,
              comment.conversationId,
              comment.id,
              'open',
              projectRunWorkspaceContext,
            ),
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
  }, [armSlideNavForQueuedSend, commitPreviewComments, currentConversationBusy, handleSend, handleStop, prioritizeQueuedChatSend, project.id, removeQueuedChatSend, projectRunWorkspaceContext]);

  /*
   * B11 「引导对话」 —— 队列行第三颗按钮什么时候露面(OPEND-2602)。
   *
   * 它原来走的是「一个字都不打断,把消息写进 agent 子进程还开着的 stdin」
   * (`steerChatRun`)。产品 2026-09-03 裁决把这条路整个撤了,两件实测事实:
   *   · 27 个 runtime 里只有 `claude` / `codebuddy` 的 `promptInputFormat` 是
   *     `stream-json`,其余 25 个这颗按钮压根不出现,退回成「发送」;
   *   · 拿装机的真 claude 2.1.259 做对照:轮次跑到一半写进 stdin 的 user 帧
   *     CLI 完全没处理(等 180s 进程活着不动),同一条在 `result` 帧之后写进去
   *     才正常起第二轮 —— 而 daemon 恰恰在 `usage` 那一档就关了 stdin。
   *
   * 现在它按下去干的事是**中断当前这一轮,然后立刻发出这条**,也就是
   * 上面 `sendQueuedChatSendNow` 在会话 busy 时走的那条路 —— 复用它,而不是
   * 另起一条:那条已经处理好三件难的事(把被顶掉的 run 记进 `supersededRunsRef`,
   * 免得 daemon 迟到的终止回调污染新一轮;把卡在 `applying` 的预览批注复位;
   * 靠自动启动效应避免两轮重叠)。
   *
   * 判据只剩「此刻有没有一轮可中断」:中断对所有 27 个 agent 都成立,不存在
   * 「这个 agent 不支持」。而且这里用的谓词和 `sendQueuedChatSendNow` 内部
   * 分支用的是**同一个** `currentConversationBusy` —— 按钮的脸和它按下去
   * 干的事因此不可能对不上(旧代码用的是从 `messages` 推出来的 runId,
   * 那份读数会比 busy 慢一拍)。
   */
  const canSteerCurrentTurn = Boolean(
    currentConversationBusy && !currentConversationQueueDisabled,
  );

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

  /*
   * 〔更换模型〕(E3)。交付稿 `error-ux-design.md:130`(S08)写的是
   * 「更换模型**直接打开模型选择器,选完自动重跑**」。
   *
   * 分两半:这里推一拍信号把 composer 那张 `AvatarMenu` 叫开,并记下是**哪一轮**
   * 在等重跑;等 `onAgentModelChange` 真的换了模型,再把那一轮重发一次。
   *
   * 记 message 而不是只记一个布尔:用户可能在选模型之前又翻了别的会话,
   * 到时候重跑的必须仍是当初按下那颗按钮的那一轮。
   */
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const rerunAfterModelChangeRef = useRef<ChatMessage | null>(null);
  const handleSwitchModel = useCallback((assistantMessage: ChatMessage) => {
    rerunAfterModelChangeRef.current = assistantMessage;
    setModelPickerOpenSignal((n) => n + 1);
  }, []);

  const handleRetry = useCallback(
    (
      assistantMessage: ChatMessage,
      recoveryActionType: TrackingRunRecoveryActionType = 'manual_retry',
    ) => {
      if (currentConversationActionDisabled) return;
      void handleSend('', [], [], {
        retryOfAssistantId: assistantMessage.id,
        taskAnalytics: buildRecoveryTaskAnalytics(
          messages,
          assistantMessage,
          recoveryActionType,
        ),
      });
    },
    [currentConversationActionDisabled, handleSend, messages],
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
    (assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      void handleSend(RESUME_CONTINUE_PROMPT, [], [], {
        entryFrom: 'resume_continue',
        taskAnalytics: buildRecoveryTaskAnalytics(
          messages,
          assistantMessage,
          'resume_run',
        ),
      });
    },
    [currentConversationActionDisabled, handleSend, messages],
  );

  // "Switch to AMR & retry" crosses the Settings route, which intentionally
  // unmounts this ProjectView. Arm the exact failed turn in App before any
  // config or navigation write; a fresh ProjectView may consume it only after
  // re-proving the same project, conversation and Workspace authority.
  const handleSwitchToAmrAndRetry = useCallback(
    (failedAssistant: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      if (
        activeConversationId
        && amrAuthRetryMountIdRef.current
        && onArmAmrAuthRetryContinuation
      ) {
        onArmAmrAuthRetryContinuation({
          projectId: project.id,
          conversationId: activeConversationId,
          assistantId: failedAssistant.id,
          workspaceIdentityKey: projectRunAuthorityKey,
          originMountId: amrAuthRetryMountIdRef.current,
        });
      }
      onModeChange('daemon');
      onAgentChange('amr');
      onOpenAmrSettings?.();
    },
    [
      activeConversationId,
      currentConversationActionDisabled,
      onAgentChange,
      onArmAmrAuthRetryContinuation,
      onModeChange,
      onOpenAmrSettings,
      project.id,
      projectRunAuthorityKey,
    ],
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
    async (
      commentAttachments: ChatCommentAttachment[],
      images: File[] = [],
    ): Promise<CommentSendResult> => {
      if (currentConversationQueueDisabled) {
        return { status: 'rejected', commentIds: [] };
      }
      if (commentAttachments.length === 0 && images.length === 0) {
        return { status: 'rejected', commentIds: [] };
      }
      setWorkspaceFocused(false);
      setCommentInspectorActive(false);
      // Upload any attached images once, then queue. Each comment becomes its
      // own task (so multiple notes => multiple queued tasks); the images ride
      // along the first task rather than being duplicated across every note.
      let uploaded: ChatAttachment[] = [];
      if (images.length > 0) {
        const result = await uploadProjectFiles(
          project.id,
          images,
          undefined,
          projectRunWorkspaceContext,
        );
        if (result.uploaded.length !== images.length) {
          return { status: 'rejected', commentIds: [] };
        }
        uploaded = result.uploaded;
      }
      if (commentAttachments.length === 0) {
        const queued = uploaded.length > 0
          ? await handleSend('', uploaded, [], { queueOnly: true, entryFrom: 'comment' })
          : false;
        return {
          status: queued ? 'queued' : 'rejected',
          commentIds: [],
        };
      }
      const queuedCommentIds: string[] = [];
      for (let i = 0; i < commentAttachments.length; i++) {
        const commentAttachment = commentAttachments[i]!;
        const savedImages = chatAttachmentsFromPreviewCommentImages(commentAttachment.imageAttachments);
        const prompt = commentTaskQuery(commentAttachment);
        // Comment/board pin → run: tag entry_from='comment' so the dashboard
        // separates annotation-driven runs from plain composer sends.
        const queued = await handleSend(
          prompt,
          mergeChatAttachments(i === 0 ? uploaded : [], savedImages),
          [commentTaskContextAttachment(commentAttachment)],
          { queueOnly: true, entryFrom: 'comment' },
        );
        if (!queued) {
          return { status: 'rejected', commentIds: queuedCommentIds };
        }
        queuedCommentIds.push(commentAttachment.id);
      }
      return { status: 'queued', commentIds: queuedCommentIds };
    },
    [handleSend, project.id, currentConversationQueueDisabled, projectRunWorkspaceContext],
  );
  const commentQueueOnSend = currentConversationBusy && !currentConversationQueueDisabled;

  const handleContinueRemainingTasks = useCallback(
    async (_assistantMessage: ChatMessage, todos: TodoItem[]) => {
      if (currentConversationActionDisabled || todos.length === 0) return false;
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
      return handleSend(prompt, [], []);
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
      const pluginWorkflowWorkspaceContext = projectRunWorkspaceContext;
      setHiddenAssistantPluginActionPaths((prev) => new Set(prev).add(relativePath));
      if (action === 'install') {
        setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
        let outcome;
        try {
          outcome = await installGeneratedPluginFolder(
            project.id,
            relativePath,
            pluginWorkflowWorkspaceContext,
          );
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
        taskStart = await startGeneratedPluginShareTask(
          project.id,
          relativePath,
          shareAction,
          pluginWorkflowWorkspaceContext,
        );
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
          const snapshot = await waitGeneratedPluginShareTask(
            taskStart.taskId,
            since,
            25_000,
            pluginWorkflowWorkspaceContext,
          );
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
      projectRunWorkspaceContext,
      replaceConversationMessage,
    ],
  );

  // "Share to OpenDesign" — kicks off the bundled `od-share-to-community`
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
    void patchProject(project.id, { metadata }, projectRunWorkspaceContext);
  }, [onProjectChange, project, projectRunWorkspaceContext]);

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
    if (projectMutationReadOnly) return;
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
      const fresh = await createConversation(project.id, undefined, {
        workspaceContext: projectRunWorkspaceContext,
      });
      if (!fresh) throw new Error('Could not create a conversation for this project.');
      // Eagerly clear messages and update ref so rapid clicks don't create
      // duplicate empty conversations before the effect resolves.
      setMessages([]);
      commitPreviewComments([]);
      setAttachedComments([]);
      setArtifact(null);
      savedArtifactRef.current = null;
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setMessagesConversationId(null);
      messagesConversationIdRef.current = fresh.id;
      messagesAuthorityKeyRef.current = projectRunAuthorityKey;
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
  }, [
    project.id,
    activeConversationId,
    commitPreviewComments,
    messages.length,
    navigate,
    openTabsState.active,
    projectRunWorkspaceContext,
    projectRunAuthorityKey,
    projectMutationReadOnly,
  ]);

  const handleSelectConversation = useCallback((id: string) => {
    if (id === activeConversationId && failedMessagesConversationId !== id) return;
    setMessages([]);
    commitPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setConversationLoadError(null);
    messagesConversationIdRef.current = null;
    messagesAuthorityKeyRef.current = null;
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
  }, [activeConversationId, commitPreviewComments, failedMessagesConversationId, project.id, openTabsState.active]);

  const refreshConversationsForProgrammaticBrandRetry = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const capturedProjectId = project.id;
      const myToken = ++conversationsRefreshTokenRef.current;
      try {
        const list = await listConversations(capturedProjectId, {
          workspaceContext: projectRunWorkspaceContext,
        });
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
    [project.id, projectRunWorkspaceContext],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (projectMutationReadOnly) return;
      const ok = await deleteConversationApi(
        project.id,
        id,
        projectRunWorkspaceContext,
      );
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
          void createConversation(project.id, undefined, {
            workspaceContext: projectRunWorkspaceContext,
          }).then((fresh) => {
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
    [
      project.id,
      activeConversationId,
      onProjectsRefresh,
      projectRunWorkspaceContext,
      projectMutationReadOnly,
    ],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      if (projectMutationReadOnly) return;
      const trimmed = title.trim() || null;
      setConversations((curr) =>
        curr.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
      );
      await patchConversation(
        project.id,
        id,
        { title: trimmed },
        projectRunWorkspaceContext,
      );
    },
    [project.id, projectRunWorkspaceContext, projectMutationReadOnly],
  );

  const handleConversationSessionModeChange = useCallback(
    async (id: string, sessionMode: ChatSessionMode) => {
      if (projectMutationReadOnly) return;
      setConversations((curr) =>
        curr.map((conversation) =>
          conversation.id === id ? { ...conversation, sessionMode } : conversation,
        ),
      );
      const updated = await patchConversation(
        project.id,
        id,
        { sessionMode },
        projectRunWorkspaceContext,
      );
      if (updated) {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === id ? { ...conversation, ...updated } : conversation,
          ),
        );
      }
    },
    [project.id, projectRunWorkspaceContext, projectMutationReadOnly],
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
      if (!activeConversationId || forkingMessageId || projectMutationReadOnly) return;
      const requestId = analytics.newRequestId();
      const startedAt = Date.now();
      /*
       * `assistantMessage` 是**渲染**出来的那一格 —— 一条 OD Next Full Plan 回合的
       * 几个物理 run 被 `foldStrategyTaskTurns` 折成一条,折出来那条带的是头一个 run
       * 的 id。分叉切的是转录,所以先把边界推回这条逻辑回合在转录里的最后一条。
       * 见 `runtime/chat/fork-boundary.ts`。
       */
      const forkIndex = forkBoundaryMessageIndex(messages, assistantMessage.id);
      const forkBoundaryMessage = forkIndex < 0 ? undefined : messages[forkIndex];
      const forkAfterMessageId = forkBoundaryMessage?.id ?? assistantMessage.id;
      const forkContext = {
        page_name: 'chat_panel' as const,
        area: 'chat_panel' as const,
        element: 'assistant_fork_button' as const,
        action: 'fork_conversation' as const,
        project_id: project.id,
        project_kind: projectKindFromMetadataToTracking(project.metadata),
        conversation_id: activeConversationId,
        assistant_message_id: assistantMessage.id,
        source_run_id: assistantMessage.runId ?? null,
        source_agent_id: assistantMessage.agentId ?? 'unknown',
        agent_provider_id: runAgentProviderId(assistantMessage.agentId ?? 'unknown'),
        session_mode: sessionModeToTracking(activeSessionMode),
        fork_point: conversationForkPoint(messages, forkAfterMessageId, forkIndex),
        seed_message_count: forkIndex < 0 ? null : forkIndex + 1,
        conversation_message_count: messages.length,
        messages_after_fork_count: forkIndex < 0 ? null : messages.length - forkIndex - 1,
      };
      trackConversationForkClick(analytics.track, forkContext, { requestId });
      setForkingMessageId(assistantMessage.id);
      setConversationLoadError(null);
      let emptyResponse = false;
      try {
        const forkFallbackPredecessorMessageId = forkIndex < 0
          ? undefined
          : (messages[forkIndex - 1]?.id ?? null);
        /*
         * 标题**不传** —— 归 daemon 起(`apps/daemon/src/conversation-fork-title.ts`)。
         *
         * 2026-09-03 产品裁决把「{原标题} 分叉」换成了自增编号「{原标题} (n)」。编号要
         * 唯一就得先看一眼这个项目里已有哪些标题,那份名单只有 daemon 手上是权威的:
         * 这里的 `conversations` 是可能过期的快照,两个客户端各拿各的快照算同一个号
         * 必然撞。daemon 那边「读名单 → 算号 → 落库」中间没有 await,同进程内原子。
         *
         * 顺带白拿了 CLI 那条路(`od chat new --fork-after`),它本来就不传标题。
         * `fresh.title` 是 daemon 返回的真实标题,下面直接进 `conversations`,
         * 所以这里也不需要乐观标题。
         */
        const fresh = await createConversation(project.id, undefined, {
          seedFromConversationId: activeConversationId,
          forkAfterMessageId,
          sessionMode: activeSessionMode,
          /*
           * 兜底送的是**边界那条转录消息**,不是屏幕上那条折叠出来的 —— 折叠那条的正文
           * 是几个 run 拼起来的,真走到兜底路径就会把同一段内容再塞一遍。
           */
          forkFallbackMessage:
            forkFallbackPredecessorMessageId === undefined
              ? undefined
              : (forkBoundaryMessage ?? assistantMessage),
          forkFallbackPredecessorMessageId,
          workspaceContext: projectRunWorkspaceContext,
          throwOnError: true,
        });
        if (!fresh) {
          emptyResponse = true;
          throw new Error(t('chat.forkConversationFailed'));
        }
        trackConversationForkResult(
          analytics.track,
          {
            ...forkContext,
            target_conversation_id: fresh.id,
            result: 'success',
            duration_ms: Math.max(0, Date.now() - startedAt),
          },
          { requestId },
        );
        /*
         * 分界线**不落在源会话**(2026-08-26 用户裁决:「要在新的 fork 里出现,
         * 而不是旧会话里出现啊」)。
         *
         * 这里原来给源会话那条助手消息盖 `forkedInto`,理由是「分支要留在它被拉出来
         * 的地方」。但点完分叉页面就**跳到新会话**,人此刻站在那边 —— 源会话上的那条线
         * 除非专门翻回去否则永远看不到;而那行脚注「上文已带过来,接着说就行」
         * 对着原地没动的源会话说也不成立。
         *
         * 标记改由 daemon 在建新会话时盖在**带过来的最后一条**上,见
         * `apps/daemon/src/routes/project/conversations.ts` 的 fork 分支。
         * 放在 daemon 还顺带白拿了 CLI 那条路(`od project conversation --fork-after`)。
         */
        setMessages([]);
        commitPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setStreaming(false);
        streamingConversationIdRef.current = null;
        setStreamingConversationId(null);
        setMessagesConversationId(null);
        messagesConversationIdRef.current = null;
        messagesAuthorityKeyRef.current = null;
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
        trackConversationForkResult(
          analytics.track,
          {
            ...forkContext,
            target_conversation_id: null,
            result: 'failed',
            error_code: emptyResponse ? 'empty_response' : conversationForkErrorCode(err),
            duration_ms: Math.max(0, Date.now() - startedAt),
          },
          { requestId },
        );
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
      analytics,
      commitPreviewComments,
      forkingMessageId,
      messages,
      navigate,
      onProjectsRefresh,
      openTabsState.active,
      project.id,
      project.metadata,
      projectMutationReadOnly,
      t,
      updateMessageById,
    ],
  );

  const projectRenameStatesRef = useRef<Map<string, {
    key: string;
    generation: number;
    confirmed: Project;
    pending: number;
    tail: Promise<void>;
  }>>(new Map());
  const handleProjectRename = useCallback(
    (newName: string) => {
      if (projectMutationReadOnly) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === project.name) return;
      const previousName = project.name;
      const renameContext = projectRunWorkspaceContextRef.current;
      const renameWorkspaceIdentity = workspaceIdentityCacheKey(renameContext);
      const renameKey = JSON.stringify([
        project.id,
        project.workspaceId ?? null,
        renameWorkspaceIdentity,
      ]);
      let renameState = projectRenameStatesRef.current.get(renameKey);
      if (!renameState || renameState.pending === 0) {
        renameState = {
          key: renameKey,
          generation: 0,
          confirmed: project,
          pending: 0,
          tail: Promise.resolve(),
        };
        projectRenameStatesRef.current.set(renameKey, renameState);
      }
      const renameGeneration = ++renameState.generation;
      renameState.pending += 1;
      const metadata = project.metadata
        ? { ...project.metadata, nameSource: 'user' as const }
        : undefined;
      const updated: Project = {
        ...project,
        name: trimmed,
        ...(metadata ? { metadata } : {}),
        updatedAt: Date.now(),
      };
      const renameFenceToken = onProjectRenameStarted?.(updated) ?? null;
      onProjectChange(updated);
      const runRename = async () => {
        const persisted = await patchProject(project.id, {
          name: trimmed,
          ...(metadata ? { metadata } : {}),
        }, renameContext);
        if (persisted) renameState.confirmed = persisted;
        const isLatestQueuedRename =
          projectRenameStatesRef.current.get(renameKey) !== renameState
          ? false
          : renameState.generation === renameGeneration;
        if (!isLatestQueuedRename) return;
        const settledProject = persisted ?? renameState.confirmed;
        onProjectRenameSettled?.(renameFenceToken, settledProject);
        if (
          projectRef.current.id !== project.id
          || workspaceIdentityCacheKey(projectRunWorkspaceContextRef.current)
            !== renameWorkspaceIdentity
          || (
            projectRef.current.name !== previousName
            && projectRef.current.name !== trimmed
          )
        ) return;
        if (!persisted) {
          if (projectRef.current.name === trimmed) {
            const rollback = {
              ...projectRef.current,
              name: renameState.confirmed.name,
              metadata: renameState.confirmed.metadata,
              updatedAt: renameState.confirmed.updatedAt,
            };
            onProjectChange(rollback);
            try {
              await onProjectsRefresh();
            } catch {
              // The rollback is already projected locally. A later list read
              // closes the stale-request fence if this refresh is unavailable.
            }
          }
          return;
        }
        const confirmed = {
          ...projectRef.current,
          name: persisted.name,
          metadata: persisted.metadata,
          updatedAt: persisted.updatedAt,
        };
        onProjectChange(confirmed);
        try {
          await onProjectsRefresh();
        } catch {
          // The rename is already persisted. Existing list retry/reconnect
          // paths will reconcile a transient projection refresh failure.
        }
      };
      const queued = renameState.tail.then(runRename, runRename);
      renameState.tail = queued.then(
        () => undefined,
        () => undefined,
      ).finally(() => {
        renameState.pending -= 1;
        if (
          renameState.pending === 0
          && projectRenameStatesRef.current.get(renameKey) === renameState
        ) {
          projectRenameStatesRef.current.delete(renameKey);
        }
      });
    },
    [
      onProjectChange,
      onProjectRenameSettled,
      onProjectRenameStarted,
      onProjectsRefresh,
      project,
      projectMutationReadOnly,
    ],
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
            errorSourceAssistantId:
              conversationLoadError ? null : errorSourceAssistantId,
            onSend: handleComposerSend,
            onRetry: handleRetry,
            onStop: handleStop,
            onRemoveQueuedSend: removeQueuedChatSend,
            onUpdateQueuedSend: updateQueuedChatSend,
            onReorderQueuedSends: reorderCurrentConversationQueuedChatSends,
            onSendQueuedNow: sendQueuedChatSendNow,
            // B11: handed over only while there is a turn to interrupt. Same
            // handler as「立即发送」on purpose — it already branches on
            // `currentConversationBusy` into stop-then-resend.
            onSteerQueuedSend: canSteerCurrentTurn ? sendQueuedChatSendNow : undefined,
            onAssistantFeedback: handleAssistantFeedback,
          }
        : undefined,
    [
      activeConversationId,
      canSteerCurrentTurn,
      conversationLoadError,
      currentConversationActionDisabled,
	      currentConversationQueuedItems,
	      currentConversationSendDisabled,
	      currentConversationLoading,
	      currentConversationControlStreaming,
      error,
      errorSourceAssistantId,
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
      if (projectMutationReadOnly) return;
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
      void patchProject(project.id, { designSystemId: nextId }, projectRunWorkspaceContext);
    },
    [
      project,
      projectDesignSystemId,
      onProjectChange,
      designSystems,
      analytics.track,
      projectMutationReadOnly,
      projectRunWorkspaceContext,
    ],
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
  // recvqb6mfyqXLD: `designSystemProject.teamSynced`/`canMutate` come off the
  // exact same `GET /api/design-systems` list this project's design-system
  // tab already reads (via the `designSystems` prop) — this is a genuinely
  // separate signal from `projectCollab.viewerOnly` above. Team-sharing a
  // design system does NOT also register its backing project with the
  // project-level collab/hub (`/api/projects/:id/collab/status` stays
  // `local_only` for a teammate's synced copy), so `viewerOnly` alone never
  // catches this: a plain member opening a teammate's team-synced design
  // system through this in-project tab (reachable once `DesignSystemFlow`'s
  // `ensureUserDesignSystemWorkspaceProject` materializes a local project for
  // it) used to see a fully-live Publish toggle, DESIGN.md editor, and the
  // logo/image/color edit + delete-project affordances below with no
  // ownership check at all. `canMutate` mirrors the daemon's own
  // `canMutateUserDesignSystem` PATCH/DELETE verdict, so this stays in
  // lockstep with whatever the backend actually allows; `undefined` (not
  // `teamSynced`, i.e. the caller's own system or a built-in preset) reads as
  // editable, matching every other consumer of this field.
  const designSystemEditable =
    !projectCollab.materializationPending &&
    designSystemProject?.canMutate !== false &&
    (
      !projectIsProgrammaticBrandExtraction ||
      brandExtractionAllowsEditing(effectiveBrandExtractionStatus) ||
      Boolean(brandReady)
    );
  // The brand-extraction-only half of the formula above, kept separate from
  // ownership: FileWorkspace's "Extracting design system…" status pill must
  // key off whether generation is genuinely still running, not off whether
  // the caller happens to own the (possibly fully-published) design system —
  // conflating the two would show a non-owner "still extracting" over a
  // finished, published teammate's system just because they cannot manage it.
  const designSystemExtractionInProgress =
    projectIsProgrammaticBrandExtraction &&
    !brandExtractionAllowsEditing(effectiveBrandExtractionStatus) &&
    !brandReady;
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
    (fileName: string, anchorId?: string) => {
      requestOpenFile(fileName);
      setShareRequest({ name: fileName, nonce: Date.now(), ...(anchorId ? { anchorId } : {}) });
    },
    [requestOpenFile],
  );
  // Mirrors share, but opens the workspace's Download/Export menu (PDF / image /
  // zip / standalone HTML / save-as-template) instead of a bare file download.
  /*
   * `format` **只有产物卡的格式浮层会传**:多格式产物在卡上就把格式选完了,
   * 不该把人送进预览区的菜单再选第二遍(产品 2026-08-27「导出浮层贴着按钮开」)。
   * 不带 `format` 的调用(「下一步引导」那行〔下载〕)沿用原语义:打开文件、
   * 展开导出菜单。
   */
  const handleArtifactDownload = useCallback(
    (fileName: string, anchorId?: string) => {
      requestOpenFile(fileName);
      setDownloadRequest({ name: fileName, nonce: Date.now(), ...(anchorId ? { anchorId } : {}) });
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
  // The comment panel floats over the workspace now, so opening it must not
  // touch the split at all: the chat column keeps the width the user set.
  // (It used to take over this column at COMMENT_INSPECTOR_PANEL_WIDTH.)
  const splitLeftPanelWidth = chatPanelWidthRef.current;
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
    applySplitChatPanelWidth(splitRef.current, next, workspacePanelTrack, workspaceFocusedRef.current);
    if (options.commitState !== false) setChatPanelWidth(next);
    return next;
  }, [workspacePanelTrack]);
  // Deliberately excludes `workspaceFocused`: the ResizeObserver effect below
  // is keyed on this callback's identity, and recreating the observer on
  // every focus toggle forced a synchronous `clientWidth` reflow + style
  // rewrite in the same commit as the collapse/expand — a second, more
  // subtle jitter source layered on top of the grid hard-cut this file's
  // change fixes. `workspaceFocusedRef` (kept fresh during render) gives the callback
  // body the current value without making it a dependency.

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
    const resized = resizeStateRef.current?.hasMoved === true;
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    if (pointerFrameRef.current !== null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerClientXRef.current = null;
    resizeStateRef.current = null;
    setResizingChatPanel(false);
    if (saveFinalWidth && resized) {
      const finalWidth = renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current);
      chatPanelWidthCustomizedRef.current = true;
      saveChatPanelWidth(finalWidth);
    }
  }, [renderPreferredChatPanelWidth]);

  // `chatPanelWidthRef` and the `--project-chat-panel-width` DOM write are
  // already kept in sync by `renderPreferredChatPanelWidth` (which sets the
  // ref and calls `applySplitChatPanelWidth` in the same statement, right
  // before `setChatPanelWidth`). A mirroring effect keyed on `chatPanelWidth`
  // would just replay that identical write a tick later — dropped as
  // redundant. `projectSplitStyle` (the JSX `style` prop below) is the only
  // other writer, and it already re-renders whenever `chatPanelWidth` changes.

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
      const preferredWidth = chatPanelWidthCustomizedRef.current
        ? preferredChatPanelWidthRef.current
        : defaultChatPanelWidthForSplit(splitWidth);
      renderPreferredChatPanelWidth(preferredWidth, nextMax);
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

  // The chat slot stays in grid flow even after the collapse finishes. Using
  // the native `hidden` attribute here removes the first grid item with
  // `display: none`, which shifts FileWorkspace into the zero-width handle
  // track and leaves the full-width workspace track empty. The settled class
  // below only hides the collapsed chat visually, preserving all three grid
  // item positions. Expanding removes it immediately so the content is
  // visible while the chat column grows back in.
  useEffect(() => {
    if (!workspaceFocused) {
      setChatSlotHidden(false);
      return undefined;
    }
    const split = splitRef.current;
    if (!split) {
      setChatSlotHidden(true);
      return undefined;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setChatSlotHidden(true);
    };
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== split) return;
      if (
        event.propertyName !== '--project-chat-panel-width'
        && event.propertyName !== '--project-chat-handle-width'
      ) {
        return;
      }
      finish();
    };
    split.addEventListener('transitionend', handleTransitionEnd);
    // Collapse is 140ms (shell.css `.split.split-focus`); the margin above
    // that covers `prefers-reduced-motion` (duration collapses to ~0 globally,
    // which some engines never fire a `transitionend` for) and any
    // already-collapsed-width edge case where the property never changes.
    const fallback = window.setTimeout(finish, 220);
    return () => {
      split.removeEventListener('transitionend', handleTransitionEnd);
      window.clearTimeout(fallback);
    };
  }, [workspaceFocused]);

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
    chatPanelWidthCustomizedRef.current = true;
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
  const autoSendAmrGateWitnessRef = useRef<AmrBalanceGateScope | undefined>(
    undefined,
  );
  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    let amrGateWitness: AmrBalanceGateScope | undefined;
    try {
      isAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
      amrGateWitness = readAutoSendAmrGateWitness(project.id);
    } catch {
      /* sessionStorage may be unavailable; treat as manual flow. */
    }
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendAmrGateWitnessRef.current = isAutoSend
      ? amrGateWitness
      : undefined;
    autoSendSeedRef.current = isAutoSend
      ? (readAutoSendPrompt(project.id) ?? project.pendingPrompt ?? '')
      : '';
    autoSendAttachmentsRef.current = isAutoSend ? readAutoSendAttachments(project.id) : [];
    autoSendContextRef.current = isAutoSend ? readAutoSendContext(project.id) : null;
  }
  /**
   * The Home batch that is still going up for this project.
   *
   * This is what un-blocks the first paint. The server paths the auto-send
   * needs are written only after the last upload answers, and reading them at
   * mount is what used to keep the whole project frame behind the uploads.
   * They are needed by the SEND, not by the paint: the frame opens now, draws
   * these cards from the local bytes the picker already handed us, and the
   * auto-send below waits for this list to empty out before it reads the real
   * paths — see `readAutoSendAttachments` at the dispatch site.
   */
  const homeAttachmentUploads = useSyncExternalStore(
    subscribeHomeAttachmentUploads,
    () => homeAttachmentUploadsFor(project.id),
    () => homeAttachmentUploadsFor(project.id),
  );
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
      bumpFilesRefresh();
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
  // The synchronous single-flight wrapper below (not this state flag) is what
  // stops a double trigger: `brandEnrichmentStarting` only updates after a
  // re-render, so it cannot reject a second call inside the same tick.
  const startBrandEnrichment = useCallback(() => {
    if (config.mode !== 'daemon') return;
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
    return handleSend(
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
    config.mode,
    designSystemProject,
    handleSend,
    currentProject.metadata,
    projectDesignSystemId,
    projectFiles,
    skills,
  ]);
  const handleBrandEnrichment = useSingleFlightCallback(startBrandEnrichment);

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
      }, resolvedWorkspaceContextForWrite(workspaceContextState));
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
  }, [locale, t, workspaceContextState]);
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
  const autoSendInFlightRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (autoSendInFlightRef.current) return;
    if (!activeConversationId) return;
    // `messagesInitialized` is React state, while the conversation ownership
    // guard used by handleSend is a ref. Require both to agree before consuming
    // the one-shot handoff: during a project/context transition there can be a
    // render where the state is ready but the ref has already been invalidated
    // for a fresh scoped reload.
    if (messagesConversationIdRef.current !== activeConversationId) return;
    if (!projectRunHasBillableAmrPrincipal) return;
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
    // The picked files are still going up. Sending now would ship the prompt
    // with whichever attachments happened to have landed — which, at the
    // moment this frame opens, is none of them. This effect re-runs when the
    // batch drains (`homeAttachmentUploads` is a dependency), so waiting here
    // costs the send exactly the upload time it always cost, and costs the
    // first paint nothing.
    if (homeAttachmentUploads.length > 0) return;
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
    // Read the server paths HERE, not at mount. The mount snapshot is taken
    // while the batch may still be uploading, so it can legitimately be empty
    // for a project that does have attachments; the session values are only
    // cleared once a send is accepted, so a fresh read is the newer of the two
    // whenever it has anything, and the snapshot still covers the case where
    // sessionStorage stopped answering after mount.
    const freshAttachments = readAutoSendAttachments(project.id);
    const attachments = freshAttachments.length > 0
      ? freshAttachments
      : autoSendAttachmentsRef.current ?? [];
    const context = autoSendContextRef.current ?? readAutoSendContext(project.id);
    if (!seed && attachments.length === 0) {
      return;
    }
    const autoSendGateStillMatches =
      autoSendAmrGateWitnessRef.current !== undefined &&
      amrBalanceGateScopesMatch(
        autoSendAmrGateWitnessRef.current,
        amrBalanceGateScopeForWorkspaceContext(projectRunPreflightContext),
      );
    autoSendInFlightRef.current = true;
    void handleSend(seed, attachments, [], {
        ...(context ? { context } : {}),
        ...homeAutoSendIdentity(project.id),
        acceptDurableQueue: true,
        // Only reuse Home's decision for the exact persisted project scope.
        // A workspace/member mismatch falls through to handleSend's normal gate.
        ...(autoSendGateStillMatches ? { amrGatePrechecked: true } : {}),
      })
      .then((accepted) => {
        if (!accepted) {
          // The handoff was not accepted (for example a transient project
          // scope/conversation transition or a recoverable preflight block).
          // Keep every session value intact; a later dependency change can
          // retry the exact same prompt and attachments.
          autoSendInFlightRef.current = false;
          return;
        }
        autoSentRef.current = true;
        if (isDesignSystemWorkspaceMetadata(project.metadata)) {
          markDesignSystemAuditAutoRepairEligible(project.id);
        }
        clearAutoSendSession(project.id);
        autoSendAttachmentsRef.current = [];
        autoSendInFlightRef.current = false;
      })
      .catch(() => {
        // `handleSend` normally reports a rejected preflight as `false`, but
        // transport/provider setup may still throw. Preserve the handoff for a
        // later retry instead of silently consuming the user's first prompt.
        autoSendInFlightRef.current = false;
      });
  }, [
    activeConversationId,
    homeAttachmentUploads,
    messagesInitialized,
    streaming,
    messages.length,
    project.id,
    projectIsProgrammaticBrandExtraction,
    project.metadata,
    initialDraft,
    project.pendingPrompt,
    projectRunHasBillableAmrPrincipal,
    projectRunBillingContext,
    projectRunPreflightContext,
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
          /*
           * 「选完自动重跑」的那一半。只有确实是从报错卡那颗〔更换模型〕进来的
           * 才会有待重跑的那一轮 —— 平时手动换模型不该无端重发。
           */
          const pending = rerunAfterModelChangeRef.current;
          rerunAfterModelChangeRef.current = null;
          if (pending) handleRetry(pending, 'switch_model_retry');
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
        openSignal={modelPickerOpenSignal}
        placement="up"
        projectWorkspaceScope={projectWorkspaceScopeState}
      />
    </>
  );

  // The `.app` shell belongs to the caller, not to this component. App.tsx
  // renders the same `div.app` around both this view and
  // ProjectCreationPendingView so React reconciles one element across the
  // hand-off. Owning the shell here would make each view mount its own
  // element and replay the `.app` entrance animation, which reads as the
  // project frame flashing twice on the way in from Home.
  return (
    <CollabProvider value={collabValue}>
      <CritiqueTheaterMount
        projectId={project.id}
        enabled={critiqueTheaterEnabled}
        workspaceContext={projectRunWorkspaceContext}
      />
      {/* ProjectActionsToolbar removed per 00efdcba — hide finalize-design
          toolbar from project header. Restore from cf1cd9bb if product
          wants the Finalize + Continue-in-CLI buttons back in the chrome. */}
      <div
        ref={splitRef}
        className={[
          projectSplitClassName(workspaceFocused),
          resizingChatPanel && !workspaceFocused ? 'is-resizing-chat' : '',
        ].filter(Boolean).join(' ')}
        style={projectSplitStyle(workspaceFocused, splitLeftPanelWidth, workspacePanelTrack)}
      >
        <div
          className={[
            'split-chat-slot',
            chatSlotHidden ? 'split-chat-slot-hidden' : '',
          ].filter(Boolean).join(' ')}
          aria-hidden={chatSlotHidden || undefined}
        >
          {/* Workspace tab strip dock: on the project route the strip leaves
              the full-width chrome row and sits here, directly above the chat
              card, level with the workspace column's tab row (which rises to
              the window top since the chrome row collapses). Unmounting
              (workspace-focused mode, leaving the route) automatically
              returns the strip to the chrome row. */}
          {!workspaceFocused ? (
            <div
              className="split-chat-tabs-dock"
              data-testid="workspace-tabs-dock"
              ref={chatTabsDockRef}
            >
              {/* Collapse-chat control, lifted out of the chat card header to
                  sit left of the docked tab dropdown (the dropdown portals in
                  after this button, so flex order stays button → dropdown). */}
              <button
                type="button"
                className="split-chat-collapse od-tooltip"
                onClick={() => setWorkspaceFocused(true)}
                title={t('chat.collapsePane')}
                aria-label={t('chat.collapsePane')}
                data-tooltip={t('chat.collapsePane')}
                data-tooltip-placement="bottom"
                data-testid="chat-collapse-toggle"
              >
                <Icon name="panel-left" size={16} />
              </button>
            </div>
          ) : null}
          {activeConversationId || conversationLoadError || emptyConversationReadOnlySettled ? (
            <ChatPane
              // The conversation id is part of the key so switching conversations
              // resets internal scroll/draft state inside ChatPane and ChatComposer.
              key={`${project.id}:${activeConversationId ?? 'conversation-unavailable'}:${chatSeed?.id ?? 'ready'}`}
              messages={messages}
              streaming={currentConversationControlStreaming}
              loading={currentConversationLoading}
              // A read-only viewer of a team-shared project cannot drive artifact
              // changes through chat (comments go through the separate overlay).
              // Home's own prompt has not gone out yet — it is waiting for this
              // same batch. Letting a second prompt overtake it would consume
              // the turn the Home prompt was going to use, and go out without
              // the attachments the user picked for it. Typing stays open;
              // only the send waits, and it waits exactly as long as the
              // uploads do.
              // Home's own prompt has not gone out yet — it is waiting for this
              // same batch. Letting a second prompt overtake it would consume
              // the turn the Home prompt was going to use, and go out without
              // the attachments the user picked for it. Typing stays open;
              // only the send waits, and it waits exactly as long as the
              // uploads do.
              sendDisabled={
                currentConversationSendDisabled
                || projectMutationReadOnly
                || homeAttachmentUploads.length > 0
              }
              viewerOnly={projectMutationReadOnly}
              composerPlaceholder={
                projectCollab.materializationPending
                  ? t('designFiles.syncing')
                  : projectMutationReadOnly
                  ? (projectCollab.ownerDisplayName
                      ? t('workspace.readonlyNoticeBy', { owner: projectCollab.ownerDisplayName })
                      : t('workspace.readonlyNotice'))
                  : undefined
              }
              queuedItems={currentConversationQueuedItems}
              error={conversationLoadError ?? error}
              errorSourceAssistantId={
                conversationLoadError ? null : errorSourceAssistantId
              }
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
              onResendUserMessage={handleResendUserMessage}
              onRetry={handleRetry}
              onSwitchModel={handleSwitchModel}
              amrAuthRetryContinuation={amrAuthRetryContinuation}
              amrAuthRetryMountId={amrAuthRetryMountIdRef.current}
              amrAuthRetryWorkspaceIdentityKey={projectRunAuthorityKey}
              amrAuthRetryPersonalAdoptionWitness={amrAuthRetryPersonalAdoptionWitness}
              onArmAmrAuthRetryContinuation={onArmAmrAuthRetryContinuation}
              onConsumeAmrAuthRetryContinuation={onConsumeAmrAuthRetryContinuation}
              onDiscardAmrAuthRetryContinuation={onDiscardAmrAuthRetryContinuation}
              onResumeRun={handleResumeRun}
              onStop={handleStop}
              // 组件 22 · 重连 · S29:掉线时流水的最后一行。按当前会话过一道 ——
              // 后台重挂可能发生在别的会话上,那一行不该串进这一屏。
              reconnect={reconnectViewForConversation(reconnectView, activeConversationId)}
              onManualReconnect={handleManualReconnect}
              onRemoveQueuedSend={removeQueuedChatSend}
              onUpdateQueuedSend={updateQueuedChatSend}
              onReorderQueuedSends={reorderCurrentConversationQueuedChatSends}
              onSendQueuedNow={sendQueuedChatSendNow}
              onSteerQueuedSend={canSteerCurrentTurn ? sendQueuedChatSendNow : undefined}
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
              questionFormSubmitDisabled={currentConversationActionDisabled}
              onSubmitQuestionForm={async (text, attachments = [], context, sourceAssistantMessageId, formId) => {
                if (currentConversationActionDisabled) return false;
                let sourceAssistant = sourceAssistantMessageId
                  ? messages.find((message) => message.id === sourceAssistantMessageId)
                  : undefined;
                const strategyTaskExecutionId = await resolveQuestionFormStrategyTaskExecutionId({
                  ...(sourceAssistant?.strategyTaskExecutionId
                    ? { persistedTaskExecutionId: sourceAssistant.strategyTaskExecutionId }
                    : {}),
                  ...(sourceAssistant?.runId ? { sourceRunId: sourceAssistant.runId } : {}),
                  fetchRunStatus: (runId) => fetchChatRunStatus(
                    runId,
                    projectRunWorkspaceContext,
                  ),
                });
                if (sourceAssistant && strategyTaskExecutionId) {
                  sourceAssistant = {
                    ...sourceAssistant,
                    strategyTaskExecutionId,
                  };
                }
                const questionTaskAnalytics = sourceAssistant
                  ? buildRecoveryTaskAnalytics(
                      messages,
                      sourceAssistant,
                      'question_answer',
                    )
                  : undefined;
                if (sourceAssistant && questionTaskAnalytics) {
                  trackRunRecoveryActionClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'chat_panel',
                    element: 'run_recovery_action',
                    task_execution_id: questionTaskAnalytics.taskExecutionId,
                    recovery_action_instance_id:
                      questionTaskAnalytics.recoveryActionInstanceId!,
                    recovery_action_type: 'question_answer',
                    ...(questionTaskAnalytics.sourceRunId
                      ? { source_run_id: questionTaskAnalytics.sourceRunId }
                      : {}),
                    ...(sourceAssistant.agentId
                      ? { source_agent_provider_id: runAgentProviderId(sourceAssistant.agentId) }
                      : {}),
                  });
                }
                return handleSend(text, attachments, [], {
                  entryFrom: 'question_answer',
                  ...questionFormAnswerIdentity(sourceAssistantMessageId, formId),
                  // The form owns the only copy of this answer (and of any
                  // file it uploaded). A send that parks in the conversation
                  // queue is durably accepted, not refused: reporting it as
                  // refused would unlock the form and roll back the uploads
                  // the queued send still points at, so the user re-answers
                  // and the drain sends the same brief twice.
                  acceptDurableQueue: true,
                  ...(context ? { context } : {}),
                  ...(questionTaskAnalytics
                    ? { taskAnalytics: questionTaskAnalytics }
                    : {}),
                  ...(strategyTaskExecutionId
                    ? { strategyTaskExecutionId }
                    : {}),
                });
              }}
              onContinueRemainingTasks={handleContinueRemainingTasks}
              onAssistantFeedback={handleAssistantFeedback}
              onArtifactShare={handleArtifactShare}
              onArtifactDownload={handleArtifactDownload}
              onForkFromMessage={
                projectMutationReadOnly ? undefined : handleForkFromMessage
              }
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
              amrBalanceCardUsd={amrBalanceCardUsd}
              amrBalanceCardUnavailable={amrBalanceFailureWalletUnavailable}
              onAmrBalanceUpgrade={handleAmrBalanceCardUpgrade}
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
              // The Home batch, drawn from the local bytes while it uploads.
              // Same tray, same cards, same "uploading" treatment the composer
              // already gives files picked from inside the project.
              homeAttachmentUploads={homeAttachmentUploads}
              onDismissHomeAttachmentUpload={(cardId) =>
                dismissHomeAttachmentUpload(project.id, cardId)}
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
              onProjectMetadataChange={onProjectChange}
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
              onCollapse={() => setWorkspaceFocused(true)}
              collapseControlLifted={!workspaceFocused}
              backLabel={t('project.backToProjects')}
              composerFooterAccessory={executionControls}
              projectHeader={(
                <span className="chat-project-title-line">
                  <span
                    className={`title${projectMutationReadOnly ? ' readonly' : ' editable'}`}
                    data-testid="project-title"
                    title={projectTitleTooltip}
                    tabIndex={projectMutationReadOnly ? -1 : 0}
                    role={projectMutationReadOnly ? undefined : 'textbox'}
                    suppressContentEditableWarning
                    contentEditable={!projectMutationReadOnly}
                    onBlur={(e) => {
                      if (projectMutationReadOnly) return;
                      handleProjectRename(e.currentTarget.textContent ?? '');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                  >
                    {currentProject.name}
                  </span>
                  {projectTypeLabel ? (
                    <span className="meta" data-testid="project-meta">{projectTypeLabel}</span>
                  ) : null}
                </span>
              )}
              designSystemPicker={(
                <DesignSystemPicker
                  variant="icon"
                  designSystems={designSystems}
                  selectedId={projectDesignSystemId ?? null}
                  workspaceContext={projectRunWorkspaceContext}
                  disabled={projectMutationReadOnly}
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
        {/* The comment panel is a floating card over the workspace in EVERY
            state (per product: 任何状态下评论卡片都在这个位置). It used to dock
            inside the chat column, which put it in a different place —  and
            made it invisible in full-screen preview, where that column is
            hidden. Keep the empty host mounted so FileViewer can resolve its
            portal before opening; `:empty` hides all chrome and hit testing
            until the localized comment panel is portaled in. Exactly one
            element ever carries `commentInspectorPortalId`. */}
        <div
          id={commentInspectorPortalId}
          className="comment-float-host"
          data-testid="comment-float-host"
        />
        {!workspaceFocused ? (
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
        ) : null}
        <FileWorkspace
          projectId={project.id}
          projectName={currentProject.name}
          viewerOnly={projectMutationReadOnly}
          materializationPending={projectCollab.materializationPending}
          readonlyNotice={
            projectCollab.materializationPending
              ? t('designFiles.syncing')
              : readonlyNoticeText
          }
          fileSyncBadge={fileSyncBadge}
          projectKind={projectKindFromMetadataToTrackingOrLegacyDefault(currentProject.metadata)}
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
          filesRefreshKey={committedFilesRefreshKey}
          filesGeneration={committedFilesGeneration}
          onRefreshFiles={refreshFileWorkspace}
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
          onReorderPreviewComment={reorderPreviewComment}
          onSendBoardCommentAttachments={handleSendBoardCommentAttachments}
          onBrandExtractionStopRequest={projectIsProgrammaticBrandExtraction ? handleStop : undefined}
          onRequestBrowserUsePrompt={handleBrowserUsePrompt}
          onPluginFolderAgentAction={handlePluginFolderAgentAction}
          activePluginActionPaths={activePluginActionPaths}
          focusMode={workspaceFocused}
          onFocusModeChange={setWorkspaceFocused}
          designSystemProject={designSystemProject}
          designSystemBrandId={designSystemBrandId}
          designSystemEditable={designSystemEditable}
          designSystemExtractionInProgress={designSystemExtractionInProgress}
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
          fileActionsBefore={projectCollab.enabled ? (
            <PresenceBar
              members={projectCollab.present}
              selfMember={projectCollab.member}
              resolveMember={resolvePresenceMember}
              {...(projectCollab.member ? { selfMemberId: projectCollab.member.memberId } : {})}
            />
          ) : null}
          chatConfig={config}
          chatAgentsById={agentsById}
          handoffAgents={agents}
          handoffArtifactId={headerArtifact.artifact_id}
          handoffArtifactKind={headerArtifact.artifact_kind}
          metricsConsent={config.telemetry?.metrics === true}
          installationId={config.installationId}
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
        />
      </div>
      {contextPluginDetails ? (
        <PluginDetailsModal
          record={contextPluginDetails}
          workspaceContext={projectRunWorkspaceContext}
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
          workspaceContext={projectRunWorkspaceContext}
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
      {amrBalanceGateBlock?.dialog === 'ask_owner' || amrOwnerTopUpFromCard ? (
        /*
         * 非 owner 的成员。他拿不到账单动作,所以这张弹窗不外跳,而是给他一句
         * 可以直接发给所有者的话 —— 在此之前这一档只有一颗「暂不需要」(§6.Y)。
         */
        <AmrOwnerTopUpDialog
          onClose={() => {
            setAmrOwnerTopUpFromCard(false);
            // 和现有弹窗的「暂不需要」同义:任务留在队列里,只是不再是唯一选项。
            setAmrBalanceGateBlock(null);
          }}
        />
      ) : null}
      {amrBalanceGateBlock?.dialog === 'upgrade' ? (
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
    </CollabProvider>
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

export function selectPrimaryProjectFile(
  files: ProjectFile[],
  excludedFileNames: ReadonlySet<string> = new Set(),
): ProjectFile | null {
  const normalizedExcludedFileNames = new Set(
    [...excludedFileNames].map(normalizeProjectFileName),
  );
  const candidates = files
    .filter(
      (file) =>
        !isProcessArtifactFile(file.name)
        && !normalizedExcludedFileNames.has(normalizeProjectFileName(file.name))
        && !(
          file.path
          && normalizedExcludedFileNames.has(normalizeProjectFileName(file.path))
        ),
    )
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
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<number> {
  if (candidate && !isActiveRunStatus(candidate.status)) {
    return candidate.updatedAt;
  }
  const probed = await fetchChatRunStatus(runId, workspaceContext).catch(() => null);
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
  if (designDeliveryVerificationPending(message)) {
    // #6505: a historical succeeded Design row whose delivery metadata never
    // materialized must not be replayed/reattached on every reload. Bound
    // reconciliation to a short window after the run's terminal time; past it,
    // the row renders as a terminal outcome instead of looping through replay.
    if (designDeliveryReconciliationStale(message)) return false;
    return true;
  }
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
    const seenIds = new Set<string>();
    return parsed
      .filter(isQueuedChatSend)
      .filter((item) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      .slice(0, 100);
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

function stripQueueOnlyFromMeta(
  meta: ProjectChatSendMeta | ChatSendMeta | undefined,
): ProjectChatSendMeta | undefined {
  if (!meta) return undefined;
  const {
    queueOnly: _queueOnly,
    acceptDurableQueue: _acceptDurableQueue,
    ...rest
  } = meta as ProjectChatSendMeta;
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
  return action === 'publish' ? 'Publish repo' : 'OpenDesign PR';
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
    'Ensure the OpenDesign fork exists',
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
  'The design result was generated, but OpenDesign could not save it to the project.';

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
  authoritativePaths?: readonly string[],
  projectId?: string,
  projectRoot?: string | null,
): ProjectFile[] | undefined {
  const beforeSet = beforeNames
    ? beforeNames instanceof Set
      ? beforeNames
      : new Set(beforeNames)
    : null;
  if (authoritativePaths !== undefined) {
    const byName = new Map<string, ProjectFile>();
    // The daemon's authoritative list intentionally covers user-facing
    // artifacts and render dependencies, not every file an agent can create
    // (for example plugin manifests and Markdown). Preserve all files that are
    // provably new from the turn baseline, then use authoritative paths to add
    // modified existing artifacts without attributing untouched inputs.
    if (beforeSet) {
      for (const file of next) {
        if (!beforeSet.has(file.name)) byName.set(file.name, file);
      }
    }
    for (const rawPath of authoritativePaths) {
      const file = findTouchedProjectFile(rawPath, next, projectId, projectRoot);
      if (file) byName.set(file.name, file);
    }
    return filterImplicitProducedFiles([...byName.values()]);
  }
  if (!beforeSet) return undefined;
  return filterImplicitProducedFiles(next.filter((f) => !beforeSet.has(f.name)));
}

export function computeTraceObjectFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
  touchedPaths: Iterable<string> = [],
  projectId?: string,
  projectRoot?: string | null,
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  const byName = new Map<string, ProjectFile>();
  for (const file of filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)))) {
    byName.set(file.name, { ...file, traceObjectReason: 'new' });
  }
  for (const rawPath of touchedPaths) {
    const file = findTouchedProjectFile(rawPath, next, projectId, projectRoot);
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
  projectRoot?: string | null,
): ProjectFile | null {
  const slashed = rawPath.replace(/\\/g, '/');
  // Lexically resolve `.`/`..` first: a path whose `..` climbs above its own
  // anchor can never be proven to stay anywhere, so it is rejected outright —
  // before any suffix matching could pair it with an in-project file.
  const segments = lexicallyNormalizePathSegments(slashed);
  if (!segments || segments.length === 0) return null;
  let normalized = segments.join('/');
  // A managed-project alias (`…/projects/<projectId>/…`) identifies the file's
  // project-relative form regardless of where the alias mount lives, so it is
  // trusted as-is; containment below only anchors paths without that marker.
  const managedProjectRelativePath = relativePathFromManagedProjectAlias(normalized, projectId);
  if (!managedProjectRelativePath && isAbsoluteToolPath(slashed)) {
    const rootSegments = projectRoot
      ? lexicallyNormalizePathSegments(projectRoot.replace(/\\/g, '/'))
      : null;
    if (rootSegments && rootSegments.length > 0) {
      // An absolute tool path is only trusted when it provably lives under
      // the project root: require the root's segments as a prefix and match
      // on the remaining project-relative form (/workspace/index.html →
      // index.html). Out-of-root paths (including `..` escapes that resolve
      // outside the root) are rejected here rather than falling through to
      // suffix matching, where /tmp/site/index.html could otherwise pick the
      // project's own index.html.
      if (segments.length <= rootSegments.length) return null;
      for (let i = 0; i < rootSegments.length; i += 1) {
        if (segments[i] !== rootSegments[i]) return null;
      }
      normalized = segments.slice(rootSegments.length).join('/');
    }
    // Without a usable root there is no anchor to judge containment against;
    // keep the legacy suffix behavior below.
  }
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

// Return a project-relative tool path only when an absolute Write/Edit path
// can be proven to live under the resolved project root. This runs before the
// refreshed inventory is available, so aliases, relative paths, and paths with
// only a matching `projects/<id>` suffix must wait for that later authoritative
// match instead of creating a persistent placeholder tab.
function provenProjectRelativeToolPath(
  rawPath: string,
  projectRoot?: string | null,
): string | null {
  const slashed = rawPath.replace(/\\/g, '/');
  if (!isAbsoluteToolPath(slashed) || !projectRoot) return null;
  const segments = lexicallyNormalizePathSegments(slashed);
  if (!segments || segments.length === 0) return null;
  const rootSegments = lexicallyNormalizePathSegments(projectRoot.replace(/\\/g, '/'));
  if (!rootSegments || segments.length <= rootSegments.length) return null;
  for (let index = 0; index < rootSegments.length; index += 1) {
    if (segments[index] !== rootSegments[index]) return null;
  }
  return segments.slice(rootSegments.length).join('/') || null;
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

// Lexically resolve `.`/`..` segments. Returns null when a `..` climbs above
// the path's own anchor — such a path cannot be proven to resolve anywhere.
function lexicallyNormalizePathSegments(path: string): string[] | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out;
}

function isAbsoluteToolPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path);
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
  projectRoot?: string | null,
): Set<string> {
  const names = new Set<string>();
  for (const rawPath of touchedPaths) {
    const file = findTouchedProjectFile(rawPath, files, projectId, projectRoot);
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

/**
 * 升级卡要显示的余额。读数拿不准就返回 `null` —— 这张卡把数字念给用户听,
 * 念错比不念更糟(付费档的 $0.00 本来就常态,见 #7190)。
 *
 * 判定用的是 `amrWalletBalanceUsd` 同一条解析规则,两处不另算。
 */
export function amrBalanceCardBalanceUsd(
  snapshot: AmrWalletSnapshot | null | undefined,
): number | null {
  const balance = amrWalletBalanceUsd(snapshot);
  if (balance == null) return null;
  return Math.max(0, balance);
}

/**
 * daemon 在 run 里判定的「余额不足」错误码。写在这里而不是从 `amr-guidance`
 * 里借:那个模块导出的是**卡面映射**,不是错误码本身,而这一条要回答的是
 * 「这一轮是不是死在钱上」。
 */
const AMR_INSUFFICIENT_BALANCE_CODE = 'AMR_INSUFFICIENT_BALANCE';

/**
 * **最后一轮是不是跑到一半死在余额上** —— 是就返回那条助手消息的 id,不是就 `null`。
 *
 * 这是升级卡在「跑到一半」那条路上的唯一触发点(用户 2026-09-02 裁决:钱的事
 * 只有升级卡一张,没有第二张白色通用报错卡)。发送前那道闸门是另一个触发点,
 * 两者写的是同一个 `amrBalanceCardUsd`。
 *
 * 三条刻意的窄化:
 *
 * - **只看最后一条助手消息。** 卡说的是「你现在的额度」,不是「历史上某一轮
 *   曾经缺过钱」。上一轮缺钱、这一轮跑通了,卡就该下去。
 * - **只认结构化错误码**,不去猜原文。错误码由 daemon 的
 *   `classifyAmrAccountFailure` 判定,那是唯一的判据来源;web 再猜一遍就是
 *   两处各说各话。这条码本身只对 AMR 发出,所以不另加 agent 判据 ——
 *   多一道会在 agentId 没落盘的历史消息上把卡吃掉。
 * - **只认终态失败。** 还在跑的一轮不谈余额。
 */
export function amrInsufficientBalanceFailureMessageId(
  messages: ChatMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'assistant') continue;
    if (message.runStatus !== 'failed') return null;
    const events = message.events ?? [];
    for (let j = events.length - 1; j >= 0; j--) {
      const event = events[j];
      if (event?.kind !== 'status' || event.label !== 'error') continue;
      return event.code === AMR_INSUFFICIENT_BALANCE_CODE ? message.id : null;
    }
    return null;
  }
  return null;
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

/**
 * 重放窗口关掉的判据:这条流安静这么久,就当 daemon 的缓冲已经放完了。
 *
 * 为什么是「安静多久」而不是某个信号:`/api/runs/:id/events` 上**没有**历史与直播的
 * 分界。daemon(`runtimes/runs.ts` 的 `stream`)是先同步把 `run.events` 整个写出去,
 * 写完才把这条连接加进 `run.clients` 收直播 —— 两段同一个通道、同一套 `id`、同一种帧。
 * 客户端唯一能如实观察到的差别是**到货节奏**:重放那一段是一次灌下来的,直播那一段
 * 按模型出字的速度来。所以这里造的分界就是「第一次安静下来」。
 */
export const HISTORY_REPLAY_SETTLE_MS = 160;
/**
 * 兜底:模型此刻正在密集出字时,重放和直播的节奏可能一直分不开。窗口最多开这么久,
 * 到点无论如何都切回逐块直播 —— 宁可把开头那一小段直播也一次性铺出来,
 * 也不能把「运行中、agent 新输出」的流式效果永久关掉。
 */
export const HISTORY_REPLAY_MAX_MS = 1_200;

export function createBufferedTextUpdates({
  updateMessage,
  persistSoon,
  flushAndPersistNow,
  onContentDelta,
  replayingHistory = false,
}: {
  updateMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  persistSoon: () => void;
  // Synchronous flush + persist with a transport that survives page
  // unload (PUT with keepalive). Invoked by the pagehide handler so the
  // last buffered chunk isn't lost when the user reloads mid-stream.
  flushAndPersistNow?: () => void;
  onContentDelta?: (delta: string) => void;
  /**
   * 这条流开头是 daemon 从缓冲里重推的历史(重挂时 `?after=` 不带游标,从第 0 条起)。
   * 开着的时候,落地动作全部攒住,窗口关掉时一次性提交 —— 历史不该一段一段地
   * 走一遍入场动画,那是「运行中、agent 新输出」才有的样子(OPEND-2590)。
   */
  replayingHistory?: boolean;
}) {
  let pendingContentDelta = '';
  let pendingTextEventDelta = '';
  let pendingThinkingEventDelta = '';
  /**
   * **来过几帧**思考,和它们**带了多少字**是两件事(W102,2026-09-03)。
   *
   * claude 的思考帧正文 100% 是空串,攒起来还是空串。只看 `pendingThinkingEventDelta`
   * 就等于「一帧都没来过」,于是 `{ kind: 'thinking' }` 一条都不进 `message.events`,
   * 而壳头的「思考中」(`buildTurnBlocks` 的 `shell.thinking`)**只**认这种事件 ——
   * 那一格就永远不亮,用户盯着几分钟空白。规格 W11 写死:`thinking_delta` 到达
   * **哪怕 delta 为空**也要进入思考中。所以帧数要单独记。
   */
  let pendingThinkingEventFrames = 0;
  let flushFrame: number | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let flushing = false;
  let needsFlush = false;
  const nonDeltaEventDeduper = createAdjacentAgentEventDeduper();
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

  // ── 重放窗口(OPEND-2590)────────────────────────────────────────────────
  // 窗口开着时,每一次「提交给 React」都改成排队。攒住的是 updater 函数本身,
  // 所以去重、合并、事件与正文的先后全部保持原样;关窗口时按顺序叠成一次提交。
  let replayOpen = replayingHistory;
  let replayQueue: Array<(prev: ChatMessage) => ChatMessage> = [];
  let replayContentDelta = '';
  let replaySettleTimer: ReturnType<typeof setTimeout> | null = null;
  let replayCapTimer: ReturnType<typeof setTimeout> | null = null;

  const clearReplayTimers = () => {
    if (replaySettleTimer !== null) {
      clearTimeout(replaySettleTimer);
      replaySettleTimer = null;
    }
    if (replayCapTimer !== null) {
      clearTimeout(replayCapTimer);
      replayCapTimer = null;
    }
  };

  /** 把攒住的历史一次性交出去。队列空就什么都不做。 */
  const drainReplayQueue = () => {
    if (replayQueue.length === 0) {
      replayContentDelta = '';
      return;
    }
    const queued = replayQueue;
    const contentDelta = replayContentDelta;
    replayQueue = [];
    replayContentDelta = '';
    // 化开只服务「模型此刻正在吐的字」。这一整块是 daemon 从缓冲里重推的旧内容,
    // 打个标记让 `useCharReveal` 把它直接落地,不走入场动画。
    markHistoryReplayLanded();
    updateMessage((prev) => queued.reduce((message, updater) => updater(message), prev));
    persistSoon();
    if (contentDelta) onContentDelta?.(contentDelta);
  };

  const closeReplayWindow = () => {
    clearReplayTimers();
    if (!replayOpen) return;
    replayOpen = false;
    drainReplayQueue();
  };

  /** 又有东西到货:窗口还开着就把「安静」的判定往后推。 */
  const noteReplayActivity = () => {
    if (!replayOpen || disposed) return;
    if (replaySettleTimer !== null) clearTimeout(replaySettleTimer);
    replaySettleTimer = setTimeout(closeReplayWindow, HISTORY_REPLAY_SETTLE_MS);
  };

  /** 落地一次改动:窗口开着就排队,否则照旧直接提交。 */
  const commit = (updater: (prev: ChatMessage) => ChatMessage) => {
    if (replayOpen) {
      replayQueue.push(updater);
      return;
    }
    updateMessage(updater);
  };

  const commitPersistSoon = () => {
    if (replayOpen) return;
    persistSoon();
  };

  if (replayOpen) {
    replayCapTimer = setTimeout(closeReplayWindow, HISTORY_REPLAY_MAX_MS);
    noteReplayActivity();
  }

  const flushPending = () => {
    if (disposed) return;
    if (flushing) {
      needsFlush = true;
      return;
    }
    cancelScheduledFlush();
    if (
      !pendingContentDelta
      && !pendingTextEventDelta
      && !pendingThinkingEventDelta
      && pendingThinkingEventFrames === 0
      && !needsFlush
    ) return;
    flushing = true;
    needsFlush = false;
    const contentDelta = pendingContentDelta;
    const textEventDelta = pendingTextEventDelta;
    const thinkingEventDelta = pendingThinkingEventDelta;
    const thinkingFramesArrived = pendingThinkingEventFrames > 0;
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    pendingThinkingEventDelta = '';
    pendingThinkingEventFrames = 0;
    try {
      commit((prev) => {
        const previousEvents = prev.events ?? [];
        const nextEvents = appendBufferedAgentDeltas(
          previousEvents,
          textEventDelta,
          thinkingEventDelta,
          thinkingFramesArrived,
        );
        // 一串空思考帧里只有第一帧会改动数组;其余帧什么都没变,别白换一次消息身份
        if (nextEvents === previousEvents && !contentDelta) return prev;
        return { ...prev, content: prev.content + contentDelta, events: nextEvents };
      });
      if (replayOpen) {
        replayContentDelta += contentDelta;
      } else {
        persistSoon();
        if (contentDelta) onContentDelta?.(contentDelta);
      }
    } finally {
      flushing = false;
    }
    if (
      pendingContentDelta
      || pendingTextEventDelta
      || pendingThinkingEventDelta
      || pendingThinkingEventFrames > 0
      || needsFlush
    ) {
      needsFlush = false;
      scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    if (disposed || flushFrame !== null || flushTimer !== null) return;
    flushFrame = requestAnimationFrame(() => {
      flushFrame = null;
      flushPending();
    });
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPending();
    }, 250);
  };

  /**
   * 对外的 `flush()` 是「**现在**就要看到已落地的状态」—— 落盘、卸载、收尾都靠它,
   * 所以它连重放队列一起交出去。模块内部为了排序而做的 flush 走 `flushPending()`,
   * 那种只是把待定的正文变成一条 text 事件,不该把重放窗口提前关掉。
   */
  const flush = () => {
    flushPending();
    drainReplayQueue();
  };

  const appendContent = (delta: string) => {
    if (disposed) return;
    pendingContentDelta += delta;
    needsFlush = true;
    noteReplayActivity();
    scheduleFlush();
  };

  const appendTextEvent = (delta: string) => {
    if (disposed) return;
    // 攒着的思考先交出去 —— 空帧也算,否则思考与正文的先后会错位
    if (pendingThinkingEventDelta || pendingThinkingEventFrames > 0) flushPending();
    nonDeltaEventDeduper.reset();
    pendingTextEventDelta += delta;
    needsFlush = true;
    noteReplayActivity();
    scheduleFlush();
  };

  const appendEvent = (ev: AgentEvent) => {
    if (disposed) return;
    if (ev.kind === 'text') {
      appendTextEvent(ev.text);
      return;
    }
    if (ev.kind === 'thinking') {
      if (pendingTextEventDelta) flushPending();
      nonDeltaEventDeduper.reset();
      pendingThinkingEventDelta += ev.text;
      // 帧数单独记:claude 的 delta 全是空串,只看上面那行等于「一帧都没来过」
      pendingThinkingEventFrames += 1;
      needsFlush = true;
      noteReplayActivity();
      scheduleFlush();
      return;
    }
    flushPending();
    noteReplayActivity();
    if (nonDeltaEventDeduper.isDuplicate(ev)) return;
    commit((prev) => {
      const previousEvents = prev.events ?? [];
      const nextEvents = appendCoalescedAgentEvent(previousEvents, ev);
      return nextEvents === previousEvents
        ? prev
        : { ...prev, events: nextEvents };
    });
    commitPersistSoon();
  };

  const cancel = () => {
    // 攒住的历史不能跟着 buffer 一起消失:重挂开始时这条消息已经被清空了,
    // 丢掉队列等于把正文留在空白上。先交出去再拆。
    clearReplayTimers();
    replayOpen = false;
    drainReplayQueue();
    disposed = true;
    cancelScheduledFlush();
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    pendingThinkingEventDelta = '';
    pendingThinkingEventFrames = 0;
    needsFlush = false;
    nonDeltaEventDeduper.reset();
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

function isSnapshotAgentEvent(event: AgentEvent): event is Extract<AgentEvent, { kind: 'tool_use' }> {
  return event.kind === 'tool_use' && isTodoWriteToolName(event.name);
}

function agentEventsAreIdentical(left: AgentEvent, right: AgentEvent): boolean {
  if (left === right) return true;
  if (
    !isSnapshotAgentEvent(left)
    || !isSnapshotAgentEvent(right)
    || left.id !== right.id
    || left.name !== right.name
  ) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function createAdjacentAgentEventDeduper() {
  let previous: AgentEvent | null = null;
  let previousJson: string | null = null;
  return {
    isDuplicate(event: AgentEvent): boolean {
      if (!isSnapshotAgentEvent(event)) {
        previous = null;
        previousJson = null;
        return false;
      }
      if (!previous || !isSnapshotAgentEvent(previous)) {
        previous = event;
        return false;
      }
      if (previous === event) return true;
      if (previous.id !== event.id || previous.name !== event.name) {
        previous = event;
        previousJson = null;
        return false;
      }
      const eventJson = JSON.stringify(event);
      const priorJson = previousJson ?? JSON.stringify(previous);
      if (eventJson === priorJson) {
        previousJson = priorJson;
        return true;
      }
      previous = event;
      previousJson = eventJson;
      return false;
    },
    reset(): void {
      previous = null;
      previousJson = null;
    },
  };
}

function appendCoalescedAgentEvent(events: AgentEvent[], event: AgentEvent): AgentEvent[] {
  const last = events[events.length - 1];
  if (
    (event.kind === 'text' || event.kind === 'thinking')
    && last?.kind === event.kind
  ) {
    return [
      ...events.slice(0, -1),
      { ...last, text: last.text + event.text },
    ];
  }
  if (
    last
    && event.kind !== 'text'
    && event.kind !== 'thinking'
    && isSnapshotAgentEvent(last)
    && isSnapshotAgentEvent(event)
    && agentEventsAreIdentical(last, event)
  ) {
    return events;
  }
  return [...events, event];
}

/**
 * 把这一批攒住的增量落进事件流。
 *
 * `thinkingFramesArrived` 和 `thinkingDelta` 分开传,是 W102(2026-09-03)的判据:
 * **帧到了**和**帧里有字**是两件事。claude 的思考帧正文 100% 是空串,只看
 * `thinkingDelta` 就等于「一帧都没来过」——「思考中」那一格于是永远不亮
 * (规格 W11:`thinking_delta` 到达**哪怕 delta 为空**就进入思考中)。
 *
 * 空帧只需要在流里留下「在想」这一个事实,所以已经有一段思考在收尾时就什么都不做:
 * 数组身份不变,上面的 `commit` 会原样返回,连着几十帧空的也不会换一次消息身份。
 * 空串本身不成段 —— `build-turn-blocks.ts` 那两道 `!text.trim()` 管这件事。
 */
function appendBufferedAgentDeltas(
  events: AgentEvent[],
  textDelta: string,
  thinkingDelta: string,
  thinkingFramesArrived = false,
): AgentEvent[] {
  let next = events;
  if (textDelta) next = appendCoalescedAgentEvent(next, { kind: 'text', text: textDelta });
  if (thinkingDelta) {
    next = appendCoalescedAgentEvent(next, { kind: 'thinking', text: thinkingDelta });
  } else if (thinkingFramesArrived && next[next.length - 1]?.kind !== 'thinking') {
    next = appendCoalescedAgentEvent(next, { kind: 'thinking', text: '' });
  }
  return next;
}
