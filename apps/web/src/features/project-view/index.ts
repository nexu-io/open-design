// Public API of the project-view slice. Consumers (the `ProjectView`
// orchestrator, which lives outside the slice) import ONLY from here — never
// from the slice's internal files. Barrels mark boundaries: this is the slice
// boundary, and `scripts/check-web-slice-boundaries.ts` fails any outside-in
// deep import that reaches past it (ADR 0002).

// Layout constants shared with the orchestrator's resize interactions.
export {
  MIN_CHAT_PANEL_WIDTH,
  MAX_CHAT_PANEL_WIDTH,
  MIN_WORKSPACE_PANEL_WIDTH,
  SPLIT_RESIZE_HANDLE_WIDTH,
  MIN_NORMAL_SPLIT_WIDTH,
  DEFAULT_CHAT_PANEL_WIDTH,
  CHAT_PANEL_WIDTH_STORAGE_KEY,
  DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS,
  BRAND_KIT_FILE,
  BRAND_EMPTY_TRANSCRIPT_RETRY_DELAYS_MS,
  COMMENT_INSPECTOR_PANEL_WIDTH,
  BYOK_OPENCODE_UNAVAILABLE_MESSAGE,
  BEDROCK_BYOK_UNSUPPORTED_MESSAGE,
  TAB_PERSIST_DEBOUNCE_MS,
} from './constants';

// Local helper types.
export type {
  BrowserExtractionUrlParts,
  ProjectSplitStyle,
  RetryTarget,
  ProjectChatSendMeta,
  QueuedChatSend,
  DesignSystemReviewEntry,
  DesignSystemReviewAgentTask,
  DesignSystemReviewDetails,
  RunStatusSnapshot,
  BufferedTextFlushHandlers,
  ProjectLiveEvent,
  BrandBrowserSnapshot,
  BrandBrowserSnapshotExtractionResult,
} from './types';

// Pure decision rules.
export {
  mergeSavedPreviewComment,
  mergeServerMessagesIntoConversation,
  ensureConversationPresent,
  workspacePanelMinWidthForSplit,
  maxChatPanelWidthForSplit,
  workspacePanelTrackFor,
  clampPreferredChatPanelWidth,
  clampChatPanelWidth,
  projectSplitClassName,
  projectSplitStyle,
  applySplitChatPanelWidth,
  buildQuestionFormKey,
  normalizedBrandBrowserPathname,
  browserExtractionUrlParts,
  isBrandBrowserHomeRedirectPath,
  brandBrowserSnapshotMatchesSource,
  workspaceContextItemEqual,
  workspaceContextItemsEqual,
  isDesignSystemWorkspaceMetadata,
  isStoredChatAttachment,
  isStoredStringArray,
  isStoredWorkspaceContextItem,
  isStoredRunContextSelection,
  isBrandStatusValue,
  brandExtractionAllowsEditing,
  projectMediaModelSeed,
  projectMediaVoiceSeed,
  byokModelSeedForProtocol,
  firstNonBlank,
  byokMediaDefaultsForRun,
  isGenericDaemonDisconnect,
  hasGenericDisconnectFailureEvent,
  appendLiveArtifactEventItem,
  artifactExtensionFor,
  artifactBaseNameFor,
  filterProjectFilesByMinMtime,
  artifactFromRecoverableSourceText,
  isFileWriteToolName,
  extractFileWriteToolPath,
  conversationHasBrandBrowserAssist,
  findExistingArtifactProjectFile,
  findExistingNonHtmlArtifactProjectFile,
  findSameTurnNonHtmlWriteForRecoveredArtifact,
  findSameTurnWriteForRecoveredArtifact,
  selectPrimaryProjectFile,
  assistantAgentDisplayName,
  isTerminalRunStatus,
  isActiveRunStatus,
  isProgrammaticBrandExtractionStatusMessage,
  hasRecoverableArtifactMessage,
  shouldReplayTerminalRunMessage,
  textContentFromAgentEvents,
  resolveRetryTarget,
  latestDesignSystemActivityEvents,
  isPhantomDaemonRunMessage,
  isStoppableAssistantMessage,
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
  stripQueueOnlyFromMeta,
  autoSendFirstMessageKey,
  autoSendAttachmentsKey,
  autoSendContextKey,
  autoSendAmrGateOkKey,
  designSystemAuditAutoRepairKey,
  isContinueInCliShortcut,
  brandExtractionPreviewFileName,
  byokOpenCodeProviderFromConfig,
  selectedKnownProviderForConfig,
  isOpenCodeByokChatProtocol,
  projectEventToAgentEvent,
  artifactWithHtml,
} from './rules';

// Pure formatters (prompt / attachment / summary builders).
export {
  designSystemFeedbackAttachments,
  buildBrandAgentExtractionContinuationPrompt,
  designSystemNameForSourceProject,
  buildCreateDesignSystemFromProjectPrompt,
  chatAttachmentsFromPreviewCommentImages,
  mergeChatAttachments,
  historyWithWorkspaceContext,
  commentTaskQuery,
  commentTaskContextAttachment,
  designSystemNeedsWorkPrompt,
  fallbackDesignSystemSummaryForProject,
  pluginWorkflowTitle,
  pluginWorkflowCliCommand,
  pluginWorkflowPlannedSteps,
  pluginWorkflowPlannedEvents,
  pluginWorkflowResultEvents,
  pluginWorkflowStartContent,
  pluginWorkflowSuccessContent,
  pluginWorkflowFailureContent,
  stripTrailingUrl,
} from './formatters';

// Streaming-text buffering (chat-send + run-reattach shared utility).
export type { BufferedTextUpdates } from './streaming-text-buffer';
export { resolveTerminalEndedAt, createBufferedTextUpdates } from './streaming-text-buffer';

// Transport port + its default binding.
export type { ProjectViewTransportPort } from './ports';
export { projectViewTransportPort } from './dependencies';

// Feature-local hooks.
export type { ChatPanelResizeController } from './hooks/useChatPanelResize.hooks';
export { useChatPanelResize, useWiredChatPanelResize } from './hooks/useChatPanelResize.hooks';
export type { ByokModelOverridesController } from './hooks/useByokModelOverrides.hooks';
export { useByokModelOverrides } from './hooks/useByokModelOverrides.hooks';
export type { GithubConnectRepoController } from './hooks/useGithubConnectRepo.hooks';
export { useGithubConnectRepo, useWiredGithubConnectRepo } from './hooks/useGithubConnectRepo.hooks';
export type { PluginContextDetailsController } from './hooks/usePluginContextDetails.hooks';
export {
  usePluginContextDetails,
  useWiredPluginContextDetails,
} from './hooks/usePluginContextDetails.hooks';
export type {
  ProjectFinalizeActionsController,
  ProjectFinalizeToast,
} from './hooks/useProjectFinalizeActions.hooks';
export {
  useProjectFinalizeActions,
  useWiredProjectFinalizeActions,
} from './hooks/useProjectFinalizeActions.hooks';
export type {
  ProjectActionsController,
  ProjectActionsToast,
} from './hooks/useProjectActions.hooks';
export { useProjectActions } from './hooks/useProjectActions.hooks';
export type { ShareToOpenDesignController } from './hooks/useShareToOpenDesign.hooks';
export { useShareToOpenDesign } from './hooks/useShareToOpenDesign.hooks';
export type { DesignSystemReviewController } from './hooks/useDesignSystemReview.hooks';
export {
  useDesignSystemReview,
  useWiredDesignSystemReview,
} from './hooks/useDesignSystemReview.hooks';
export type { ConversationManagementController } from './hooks/useConversationManagement.hooks';
export {
  useConversationManagement,
  useWiredConversationManagement,
} from './hooks/useConversationManagement.hooks';
export type { ProjectTimeoutsController } from './hooks/useProjectTimeouts.hooks';
export { useProjectTimeouts } from './hooks/useProjectTimeouts.hooks';
export type {
  RunCompletionNotificationsConfig,
  RunCompletionNotificationsController,
} from './hooks/useRunCompletionNotifications.hooks';
export {
  useRunCompletionNotifications,
  useWiredRunCompletionNotifications,
} from './hooks/useRunCompletionNotifications.hooks';
export type { QuestionFormPanelController } from './hooks/useQuestionFormPanel.hooks';
export { useQuestionFormPanel } from './hooks/useQuestionFormPanel.hooks';

// Dumb components.
export type { ExecutionControlsProps } from './components/ExecutionControls';
export { ExecutionControls } from './components/ExecutionControls';
