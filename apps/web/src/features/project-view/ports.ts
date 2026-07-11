// The project-view slice's dependency on transport, expressed as an interface it
// owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks (ADR 0002).
import type {
  AppliedPluginSnapshot,
  ChatSessionMode,
  ExtractMemoryRequest,
  InstalledPluginRecord,
  PluginDuplicateProjectResponse,
  ProjectMetadata,
  RunContextSelection,
} from '@open-design/contracts';
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentTarget,
} from '../../types';
import type {
  BufferedTextFlushHandlers,
  ChatPanelPointerDragHandlers,
  QueuedChatSend,
  RunStatusSnapshot,
  SaveMessageOptions,
} from './types';

/** Transport the project-view orchestrator needs from the outside world. */
export interface ProjectViewTransportPort {
  /**
   * Read a project file's raw text. Best-effort: resolves `null` on a non-ok
   * response or a network error so the caller can cache the miss.
   */
  readProjectRawText(projectId: string, filePath: string): Promise<string | null>;
  /**
   * Fire a per-turn memory extraction. Best-effort: never rejects, so a failed
   * request cannot block or break the chat.
   */
  extractMemory(request: ExtractMemoryRequest): Promise<void>;
  /** Read the queued-chat-sends store for a project (local-storage backed). */
  loadQueuedChatSends(projectId: string): QueuedChatSend[];
  /** Persist the queued-chat-sends store for a project (local-storage backed). */
  saveQueuedChatSends(projectId: string, items: QueuedChatSend[]): void;
  /** Read the saved chat-panel-width preference (local-storage backed). */
  readSavedChatPanelWidth(): number;
  /** Persist the chat-panel-width preference (local-storage backed). */
  saveChatPanelWidth(width: number): void;
  /** Read the auto-send attachments staged for a project's first turn (session-storage backed). */
  readAutoSendAttachments(projectId: string): ChatAttachment[];
  /** Read the auto-send run-context staged for a project's first turn (session-storage backed). */
  readAutoSendContext(projectId: string): RunContextSelection | null;
  /** Clear the auto-send session handoff for a project (session-storage backed). */
  clearAutoSendSession(projectId: string): void;
  /** Arm design-system-audit auto-repair attempts for a project (session-storage backed). */
  markDesignSystemAuditAutoRepairEligible(projectId: string): void;
  /** Consume one armed design-system-audit auto-repair attempt, if any remain (session-storage backed). */
  consumeDesignSystemAuditAutoRepair(projectId: string): boolean;
  /** Clear the design-system-audit auto-repair eligibility flag for a project (session-storage backed). */
  clearDesignSystemAuditAutoRepair(projectId: string): void;
  /** Watch a split element's width, calling back immediately and on every
   *  resize; returns an unsubscribe. */
  subscribeSplitResize(split: HTMLDivElement, onResize: (splitWidth: number) => void): () => void;
  /** Whether a split element's computed text direction is RTL. */
  getSplitIsRtl(split: HTMLDivElement | null): boolean;
  /** Start a chat-panel resize pointer drag; returns an unsubscribe. */
  subscribeChatPanelPointerDrag(handlers: ChatPanelPointerDragHandlers): () => void;
  /** Whether the GitHub connector is currently connected (best-effort; resolves `false` on failure). */
  checkGithubConnected(options?: { signal?: AbortSignal }): Promise<boolean>;
  /** Subscribe to browser signals (focus/tab visibility) that should re-check GitHub connection status. */
  subscribeGithubConnectRefreshTriggers(onTrigger: () => void): () => void;
  /** Fetch an applied-plugin snapshot by id. Best-effort: resolves `null` on failure. */
  fetchAppliedPluginSnapshot(snapshotId: string): Promise<AppliedPluginSnapshot | null>;
  /** List installed plugins, optionally including hidden ones. */
  listPlugins(options?: { includeHidden?: boolean }): Promise<InstalledPluginRecord[]>;
  /** Duplicate an installed plugin as a new project. Throws on a non-ok response. */
  duplicatePluginAsProject(
    pluginId: string,
    input?: { name?: string },
  ): Promise<PluginDuplicateProjectResponse>;
  /** Copy text to the clipboard. Resolves `false` if every fallback path fails. */
  copyTextToClipboard(text: string): Promise<boolean>;
  /** Subscribe to capture-phase keydown events on window; returns an unsubscribe. */
  subscribeCapturedKeyDown(onKeyDown: (event: KeyboardEvent) => void): () => void;
  /** Persist a project's `metadata` field. Best-effort: never rejects. */
  patchProjectMetadata(projectId: string, metadata: ProjectMetadata): Promise<void>;
  /** Persist a project's `name` (and optionally `metadata`) fields. Best-effort: never rejects. */
  patchProjectName(projectId: string, patch: { name: string; metadata?: ProjectMetadata }): Promise<void>;
  /** List a project's conversations. Best-effort: resolves `[]` on failure. */
  listConversations(projectId: string): Promise<Conversation[]>;
  /** Create a conversation, optionally seeded from a fork point. Best-effort:
   *  resolves `null` on failure. */
  createConversation(
    projectId: string,
    title?: string,
    opts?: {
      seedFromConversationId?: string | null;
      forkAfterMessageId?: string | null;
      sessionMode?: ChatSessionMode;
      seedMessages?: ChatMessage[];
    },
  ): Promise<Conversation | null>;
  /** Patch a conversation (title/sessionMode/etc). Best-effort: resolves
   *  `null` on failure. */
  patchConversation(
    projectId: string,
    conversationId: string,
    patch: Partial<Conversation>,
  ): Promise<Conversation | null>;
  /** Delete a conversation. Resolves `false` on failure. */
  deleteConversation(projectId: string, conversationId: string): Promise<boolean>;
  /** Fetch a run's current status snapshot. Best-effort: resolves `null` on
   *  a non-terminal-safe fetch failure. */
  fetchRunStatus(runId: string): Promise<RunStatusSnapshot | null>;
  /** Subscribe to the buffered-text-updates flush triggers (tab hidden /
   *  page hide); returns an unsubscribe. */
  subscribeBufferedTextFlushTriggers(handlers: BufferedTextFlushHandlers): () => void;
  /** Whether the document is currently hidden (backgrounded tab). */
  isDocumentHidden(): boolean;
  /** Whether the document currently has focus. */
  isDocumentFocused(): boolean;
  /** Focuses the browser window, if one exists. */
  focusWindow(): void;
  /** List a conversation's messages. Best-effort: resolves `[]` on failure. */
  listMessages(projectId: string, conversationId: string): Promise<ChatMessage[]>;
  /** Persist a single message. Best-effort: never rejects. */
  saveMessage(
    projectId: string,
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
  ): Promise<void>;
  /** List a conversation's preview comments. Best-effort: resolves `[]` on failure. */
  fetchPreviewComments(projectId: string, conversationId: string): Promise<PreviewComment[]>;
  /** Upload preview-comment images ahead of saving. Best-effort: resolves only
   *  the images that succeeded, so the caller can detect a partial failure by
   *  comparing lengths against the input. */
  uploadPreviewCommentImages(
    projectId: string,
    images: File[],
  ): Promise<PreviewCommentAttachment[]>;
  /** Create or update a preview comment. Best-effort: resolves `null` on failure. */
  savePreviewComment(
    projectId: string,
    conversationId: string,
    input: { target: PreviewCommentTarget; note: string; attachments?: PreviewCommentAttachment[] },
  ): Promise<PreviewComment | null>;
  /** Patch a preview comment's status. Best-effort: resolves `null` on failure. */
  patchPreviewCommentStatus(
    projectId: string,
    conversationId: string,
    commentId: string,
    status: PreviewComment['status'],
  ): Promise<PreviewComment | null>;
  /** Delete a preview comment. Resolves `false` on failure. */
  deletePreviewComment(projectId: string, conversationId: string, commentId: string): Promise<boolean>;
}
