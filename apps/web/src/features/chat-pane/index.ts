// Public API of the chat-pane slice. Consumers (the ChatPane orchestrator,
// which lives outside the slice at components/ChatPane.tsx, and any other
// app code) import ONLY from here — never from the slice's internal files.
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import
// that reaches past this barrel (ADR 0002).

// Pure rules the orchestrator reads directly.
export {
  buildRunErrorDiagnosticText,
  compactCount,
  conversationMessageCount,
  conversationMetaLabel,
  filterConversations,
  importedFolderArtifactsFor,
  isActiveRunStatus,
  isAssistantMessageStreaming,
  isBrandExtractionNextStepProject,
  isDesignSystemNextStepProject,
  isProgrammaticBrandAssistantMessage,
  isTerminalRunStatus,
  nextUserContentByAssistantIdFor,
  pickStarters,
  queuedDropEdgeForPosition,
  reorderQueuedSendIds,
  retryableAssistantMessage,
  shouldHideEmptyBrandAssistantMessage,
  sortArtifactsByModified,
  summarizeQueuedPrompt,
} from './rules';

export type { AssistantCallbacks, QueuedSendDragState, QueuedSendDropEdge, QueuedSendItem, QueuedSendUpdate, RunErrorDiagnosticInput, StarterPrompt } from './types';

export { ChatConversationLoading } from './components/ChatConversationLoading';
export { ChatRows } from './components/ChatRows';
export { CommentsPanel } from './components/CommentsPanel';
export { ConversationRow } from './components/ConversationRow';
export { ImportedFolderArtifacts } from './components/ImportedFolderArtifacts';
export { QueuedSendStrip } from './components/QueuedSendStrip';

export { useChatLogScrollAnchor } from './hooks/useChatLogScrollAnchor.hooks';
export { useComposerDraftSync } from './hooks/useComposerDraftSync.hooks';
export { useComposerPortalLayout } from './hooks/useComposerPortalLayout.hooks';
export { useComposerStarterScenarios } from './hooks/useComposerStarterScenarios.hooks';
export { useConversationHistory } from './hooks/useConversationHistory.hooks';
export { useQueuedSendEditing } from './hooks/useQueuedSendEditing.hooks';
export { useRunErrorState } from './hooks/useRunErrorState.hooks';
