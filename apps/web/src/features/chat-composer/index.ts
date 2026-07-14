// Public API of the chat-composer slice. Consumers (the ChatComposer
// orchestrator, which lives outside the slice at components/ChatComposer.tsx)
// import ONLY from here — never from the slice's internal files.
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import that
// reaches past this barrel (ADR 0002).

// Pure rules the orchestrator (and future hooks/components) read.
export {
  isFiniteAttachmentOrder,
  formatElementHtmlBlock,
  normalizeChatAttachmentOrders,
  assignChatAttachmentOrders,
  nextChatAttachmentOrder,
  sortChatAttachmentsByOrder,
  sortChatCommentAttachmentsByOrder,
  workspaceContextIcon,
  workspaceContextTitle,
  workspaceContextDescription,
  lastPathSegment,
  projectFileMentionTitle,
  projectFileMentionDescription,
  workspaceContextSearchText,
  workspaceContextKindLabel,
  escapeRegExp,
  stripInlineMentionToken,
  stripInlineMentionLabels,
  pluginMatchesQuery,
  buildDesignToolboxResources,
  designToolboxResourceMatchesQuery,
  designToolboxDefaultResources,
  designToolboxResourceKindLabel,
  designToolboxResourceIsActive,
  designToolboxSkillBadge,
  designToolboxSkillIcon,
  designToolboxContextLine,
  designToolboxDraftLine,
  designToolboxWorkspaceKindLabel,
  designToolboxActionPrompt,
  designToolboxSkillPrompt,
  designToolboxResourcePrompt,
  designToolboxResourceIndexLines,
  designToolboxCompactLine,
  skillMentionRank,
  mcpServerMatchesQuery,
  mcpTemplateMatchesQuery,
  pluginSourceLabel,
  pluginsAllowedForComposer,
  computeToolboxDetailPosition,
  designToolboxResourceTracking,
  linkedDirsWithWorkspaceContext,
  dropWorkspaceLinkedDirAdds,
  dedupeWorkspaceContextItems,
  trackedWorkspaceLinkedDirsForContexts,
  workspaceContextDirStillReferenced,
  buildComposerMentionEntities,
  inlineBackedPluginFromRestoredDraft,
  queueMeta,
  composerSendGate,
  expandHatchCommand,
  expandSearchCommand,
} from './rules';

export type {
  DetailAnchorRect,
  DetailViewport,
  DetailPositionOptions,
  ComposerSendGateInput,
  ComposerSendGate,
} from './rules';

// Pure display formatters.
export { looksLikeImage, prettySize } from './formatters';

// UI-facing types the orchestrator (and rules) share.
export type {
  TranslateFn,
  DesignToolboxResourceKind,
  DesignToolboxResourceIndex,
  DesignToolboxResourceBase,
  DesignToolboxResource,
  MentionTab,
  SlashCommand,
  TrackedWorkspaceLinkedDir,
  ChatSendMeta,
} from './types';

// Dumb components the orchestrator composes.
export { StagedCommentAttachments } from './components/StagedCommentAttachments';
export { ToolsPluginsPanel } from './components/ToolsPluginsPanel';
export { ToolsMcpPanel } from './components/ToolsMcpPanel';
export { ToolboxItemRow } from './components/ToolboxItemRow';
export { ToolsSkillsPanel } from './components/ToolsSkillsPanel';
export { ToolsImportPanel } from './components/ToolsImportPanel';
export { ImportItem } from './components/ImportItem';
export { SlashPopover } from './components/SlashPopover';
export { MentionPopover } from './components/MentionPopover';
export { DesignToolboxPanel } from './components/DesignToolboxPanel';
export { StagedRunContexts } from './components/StagedRunContexts';

// Feature-local hooks the orchestrator wires directly.
export { useComposerModals } from './hooks/useComposerModals.hooks';
export type { ComposerDetailsSkill, ComposerModalsController } from './hooks/useComposerModals.hooks';
export { useComposerUpload } from './hooks/useComposerUpload.hooks';
export type { ComposerUploadController } from './hooks/useComposerUpload.hooks';
export {
  useWorkingDirStatus,
  useWiredWorkingDirStatus,
} from './hooks/useWorkingDirStatus.hooks';
export type { WorkingDirStatusController } from './hooks/useWorkingDirStatus.hooks';
export type { WorkingDirPort } from './ports';
export { useSlashPopover } from './hooks/useSlashPopover.hooks';
export type { SlashPopoverParams, SlashPopoverController } from './hooks/useSlashPopover.hooks';
export { useCommentAttachments } from './hooks/useCommentAttachments.hooks';
export type {
  CommentAttachmentsParams,
  CommentAttachmentsController,
} from './hooks/useCommentAttachments.hooks';
export {
  useComposerCatalogue,
  useWiredComposerCatalogue,
} from './hooks/useComposerCatalogue.hooks';
export type {
  ComposerCatalogueParams,
  ComposerCatalogueController,
} from './hooks/useComposerCatalogue.hooks';
export type { ComposerCataloguePort } from './ports';
export { useWorkspaceContextLinking } from './hooks/useWorkspaceContextLinking.hooks';
export type {
  WorkspaceContextLinkingParams,
  WorkspaceContextLinkingController,
} from './hooks/useWorkspaceContextLinking.hooks';
export { useMentionPopover } from './hooks/useMentionPopover.hooks';
export type {
  MentionPopoverParams,
  MentionPopoverController,
} from './hooks/useMentionPopover.hooks';
export { useStagedRunContext } from './hooks/useStagedRunContext.hooks';
export type {
  StagedRunContextParams,
  StagedRunContextController,
} from './hooks/useStagedRunContext.hooks';
export { useAppliedPlugin } from './hooks/useAppliedPlugin.hooks';
export type {
  InlineBackedPlugin,
  AppliedPluginParams,
  AppliedPluginController,
} from './hooks/useAppliedPlugin.hooks';
export {
  useComposerDraft,
  useWiredComposerDraft,
} from './hooks/useComposerDraft.hooks';
export type {
  ComposerDraftParams,
  ComposerDraftController,
} from './hooks/useComposerDraft.hooks';
export type { ComposerDraftPort } from './ports';

// Orchestration functions with injected deps (real branching/side-effect
// logic; unlike rules.ts, these are not pure).
export {
  trackComposerBar,
  trackDesignToolbox,
  duplicatePluginRecordAsProject,
  stageSkillForCurrentTurn,
  applyDesignToolboxDraft,
  applyDesignToolboxPrompt,
  applyDesignToolboxAction,
  applyDesignToolboxSkill,
  applyDesignToolboxResource,
  removeStagedSkill,
  removeStagedMcpServer,
  removeStagedConnector,
  setWorkingDirFolder,
  handlePickWorkingDir,
  clearWorkingDir,
  pickSlash,
  tryHandleMcpSlash,
  tryHandlePetSlash,
  appendWorkspacePrompt,
  addLinkedDirs,
  addLinkedDir,
  handleReferenceProjects,
  handleLinkLocalCodeContext,
  handleLinkFolder,
  removeTrackedWorkspaceLinkedDir,
  removeWorkspaceContext,
  handleEditorTrigger,
  handlePopoverKey,
  pickMentionByFlatIndex,
  insertMention,
  insertPluginMention,
  insertMcpMention,
  insertConnectorMention,
  insertWorkspaceMention,
  applyProjectSkill,
  insertSkillMention,
  handleEditorChange,
  currentRunContextMeta,
  reset,
  sendComposedTurn,
  submit,
} from './actions';
export type {
  ComposerTrackDeps,
  DuplicatePluginDeps,
  DesignToolboxApplyDeps,
  StagedRemovalDeps,
  WorkingDirActionDeps,
  PickSlashDeps,
  McpSlashDeps,
  PetSlashDeps,
  AppendWorkspacePromptDeps,
  LinkedDirActionDeps,
  ReferenceProjectsDeps,
  LinkLocalCodeContextDeps,
  RemoveWorkspaceContextDeps,
  MentionActionDeps,
  EditorChangeDeps,
  SendActionDeps,
} from './actions';

// Staged-attachment / upload orchestration functions (Phase 6, cluster 7) —
// split into their own file since combining with actions.ts would exceed
// the slice's size budget; same deps-bag convention.
export {
  reserveAttachmentOrders,
  appendOrderedStagedAttachments,
  appendContextAttachment,
  ensureProject,
  uploadFiles,
  addAssetsFromLibrary,
  uploadClipboardImagesFromAsyncClipboard,
  handlePasteFiles,
  handleDrop,
  removeStaged,
  handleAnnotationEvent,
  flushDeferredAnnotationSend,
} from './attachment-actions';
export type {
  UploadActionDeps,
  AnnotationActionDeps,
  DeferredAnnotationSendDeps,
} from './attachment-actions';
export type { UploadFilesFailure, UploadFilesResult } from './types';
