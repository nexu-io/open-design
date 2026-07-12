// The project-view slice's dependency on transport, expressed as an interface it
// owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks (ADR 0002).
import type {
  AppliedPluginSnapshot,
  ChatSessionMode,
  DesignSystemPackageAudit,
  ExtractMemoryRequest,
  InstalledPluginRecord,
  PluginDuplicateProjectResponse,
  PluginInstallOutcome,
  ProjectMetadata,
  RunContextSelection,
} from '@open-design/contracts';
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  LiveArtifactSummary,
  OpenTabsState,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentTarget,
  ProjectFile,
} from '../../types';
import type { ArtifactManifest } from '../../artifacts/types';
import type {
  BufferedTextFlushHandlers,
  ChatPanelPointerDragHandlers,
  FinalizeBrandProjectOutcome,
  PluginShareTaskSnapshot,
  PluginShareTaskStart,
  ProjectLiveEvent,
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
  /** Whether the home-create -> project first-turn auto-send flag is armed
   *  for this project (session-storage backed). */
  hasAutoSendFirstMessageFlag(projectId: string): boolean;
  /** Whether the AMR balance gate was already precleared for this project's
   *  auto-send (session-storage backed). */
  readAmrGateOkFlag(projectId: string): boolean;
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
  /** Load the project's persisted open-tabs state, reconciling the local
   *  cache against the daemon by `updatedAt`. Best-effort: falls back to the
   *  cache (or an empty state) on failure. */
  loadOpenTabs(projectId: string): Promise<OpenTabsState>;
  /** Write tab state to the local cache only (synchronous), returning the
   *  `updatedAt`-stamped state. */
  cacheOpenTabsLocally(projectId: string, state: OpenTabsState): OpenTabsState;
  /** Persist already-stamped tab state to the daemon (the debounced write).
   *  Best-effort: never rejects. */
  persistOpenTabsToDaemon(projectId: string, state: OpenTabsState): Promise<void>;
  /** List a project's files. Best-effort: resolves `[]` on failure. */
  fetchProjectFiles(projectId: string): Promise<ProjectFile[]>;
  /** List a project's live artifacts. Best-effort: resolves `[]` on failure. */
  fetchLiveArtifacts(projectId: string): Promise<LiveArtifactSummary[]>;
  /** Write a project text file (e.g. a persisted HTML artifact). Resolves
   *  `null` on failure. */
  writeProjectTextFile(
    projectId: string,
    name: string,
    content: string,
    options?: { artifactManifest?: ArtifactManifest },
  ): Promise<ProjectFile | null>;
  /** Subscribe to a project's filesystem-change SSE stream. Returns an
   *  unsubscribe. No-ops when `EventSource` isn't available (SSR / a test
   *  environment without it). */
  subscribeProjectFileEvents(
    projectId: string,
    onEvent: (evt: ProjectLiveEvent) => void,
  ): () => void;
  /** Read a project file as text (distinct from `readProjectRawText`: this one
   *  supports a cache-bust key for freshly-written manifest/snapshot files).
   *  Best-effort: resolves `null` on a non-ok response or a network error. */
  fetchProjectFileText(
    projectId: string,
    name: string,
    options?: { cache?: RequestCache; cacheBustKey?: string | number },
  ): Promise<string | null>;
  /** Install a generated plugin folder into the plugin registry. */
  installGeneratedPluginFolder(
    projectId: string,
    relativePath: string,
  ): Promise<PluginInstallOutcome>;
  /** Start a plugin-folder GitHub share workflow (publish repo / open-design PR). */
  startGeneratedPluginShareTask(
    projectId: string,
    relativePath: string,
    action: 'publish-github' | 'contribute-open-design',
  ): Promise<PluginShareTaskStart>;
  /** Long-poll a plugin-folder share task for new progress/terminal status. */
  waitGeneratedPluginShareTask(
    taskId: string,
    since: number,
    timeoutMs?: number,
  ): Promise<PluginShareTaskSnapshot>;
  /** Finalize a brand project into its derived design-system kit. */
  finalizeBrandProject(brandId: string, projectId: string): Promise<FinalizeBrandProjectOutcome>;
  /** Fetch a project's design-system package audit. Resolves `null` on failure. */
  fetchDesignSystemPackageAudit(projectId: string): Promise<DesignSystemPackageAudit | null>;
  /** Persist a project's active `designSystemId`. Best-effort: never rejects. */
  patchProjectDesignSystemId(projectId: string, designSystemId: string | null): Promise<void>;
}
