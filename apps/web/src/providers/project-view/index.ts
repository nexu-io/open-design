// Barrel for the project-view transport resource home. The slice's
// `dependencies.ts` binds these adapters onto its port; nothing else imports
// them directly.
export { fetchProjectRawText } from './raw-text';
export { postMemoryExtract } from './memory-extract';
export { loadQueuedChatSends, saveQueuedChatSends } from './queued-chat-sends';
export { readSavedChatPanelWidth, saveChatPanelWidth } from './chat-panel-width';
export {
  readAutoSendAttachments,
  readAutoSendContext,
  clearAutoSendSession,
  markDesignSystemAuditAutoRepairEligible,
  consumeDesignSystemAuditAutoRepair,
  clearDesignSystemAuditAutoRepair,
} from './auto-send-session';
export {
  subscribeSplitResize,
  getSplitIsRtl,
  subscribeChatPanelPointerDrag,
} from './chat-panel-resize-dom';
export {
  fetchGithubConnectorConnected,
  subscribeGithubConnectRefreshTriggers,
} from './github-connect';
export {
  fetchAppliedPluginSnapshot,
  listPlugins,
  duplicatePluginAsProject,
} from './plugin-context';
export { copyTextToClipboard } from './clipboard';
export { subscribeCapturedKeyDown } from './keyboard-shortcuts';
export { patchProjectMetadata, patchProjectName } from './patch-project-metadata';
export {
  listConversations,
  createConversation,
  patchConversation,
  deleteConversation,
} from './conversations';
export { subscribeBufferedTextFlushTriggers } from './buffered-text-flush-triggers';
export { isDocumentHidden, isDocumentFocused, focusWindow } from './document-visibility';
export { listMessages, saveMessage, fetchPreviewComments } from './messages';
export {
  uploadPreviewCommentImages,
  savePreviewComment,
  patchPreviewCommentStatus,
  deletePreviewComment,
} from './preview-comment-actions';
export { loadOpenTabs, cacheOpenTabsLocally, persistOpenTabsToDaemon } from './open-tabs';
export { fetchProjectFiles, fetchLiveArtifacts, writeProjectTextFile } from './project-files';
