// The project-view slice's dependency on transport, expressed as an interface it
// owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks (ADR 0002).
import type {
  AppliedPluginSnapshot,
  ExtractMemoryRequest,
  InstalledPluginRecord,
  PluginDuplicateProjectResponse,
  RunContextSelection,
} from '@open-design/contracts';
import type { ChatAttachment } from '../../types';
import type { ChatPanelPointerDragHandlers, QueuedChatSend } from './types';

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
}
