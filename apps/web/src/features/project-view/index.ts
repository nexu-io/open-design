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
} from './constants';

// Local helper types.
export type {
  BrowserExtractionUrlParts,
  ProjectSplitStyle,
  RetryTarget,
  ProjectChatSendMeta,
  QueuedChatSend,
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

// Transport port + its default binding.
export type { ProjectViewTransportPort } from './ports';
export { projectViewTransportPort } from './dependencies';

// Feature-local hooks.
export type { ChatPanelResizeController } from './hooks/useChatPanelResize.hooks';
export { useChatPanelResize, useWiredChatPanelResize } from './hooks/useChatPanelResize.hooks';
export type { ByokModelOverridesController } from './hooks/useByokModelOverrides.hooks';
export { useByokModelOverrides } from './hooks/useByokModelOverrides.hooks';
