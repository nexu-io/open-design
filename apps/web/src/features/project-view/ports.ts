// The project-view slice's dependency on transport, expressed as an interface it
// owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks (ADR 0002).
import type { ExtractMemoryRequest, RunContextSelection } from '@open-design/contracts';
import type { ChatAttachment } from '../../types';
import type { QueuedChatSend } from './types';

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
}
