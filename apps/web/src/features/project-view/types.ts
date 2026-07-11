// UI-only / helper types owned by the project-view slice. Wire DTOs live in
// `@open-design/contracts`; these are small local shapes the slice's pure
// helpers produce or consume.
import type { CSSProperties } from 'react';
import type { ChatAttachment, ChatCommentAttachment, ChatMessage, ProjectMetadata } from '../../types';
import type {
  ChatAnalyticsEntryFrom,
  ChatRunStatusResponse,
  ChatSessionMode,
  LiveArtifactRefreshSsePayload,
  LiveArtifactSsePayload,
  ProjectConversationCreatedSsePayload,
} from '@open-design/contracts';
import type { ChatSendMeta } from '../../components/ChatComposer';

/** Normalized parts of a brand-extraction source URL, for source-vs-snapshot
 *  comparison. Produced by `browserExtractionUrlParts` in `rules.ts`. */
export interface BrowserExtractionUrlParts {
  host: string;
  pathname: string;
  search: string;
}

/** Inline style for the project split container, with the CSS custom properties
 *  the split layout reads. Produced by `projectSplitStyle` in `rules.ts`. */
export type ProjectSplitStyle = CSSProperties & {
  '--project-chat-panel-width': string;
  '--project-workspace-panel-track': string;
};

/** Resolved retry target for a failed assistant message. Produced by
 *  `resolveRetryTarget` in `rules.ts`. */
export interface RetryTarget {
  failedAssistant: ChatMessage;
  userMsg: ChatMessage;
  priorMessages: ChatMessage[];
  preservedAttempts: ChatMessage[];
}

/** Send-time metadata for a project chat turn, layered on the composer's
 *  `ChatSendMeta` with project-view-specific queueing/analytics/gating flags. */
export type ProjectChatSendMeta = ChatSendMeta & {
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
  /** The Open Design Cloud balance gate already ran for this exact send at
   *  the home submit (with any soft warning answered there); skip re-gating
   *  so the user is never double-prompted for one task. */
  amrGatePrechecked?: boolean;
};

/** A chat send persisted to the local queued-sends store while offline or
 *  blocked on a gate. Produced/consumed by the queued-chat-sends provider. */
export interface QueuedChatSend {
  id: string;
  conversationId: string;
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ProjectChatSendMeta;
  createdAt: number;
}

/** Handlers a chat-panel pointer-drag subscription drives (port result type,
 *  kept in-slice per ADR 0002 — the guard forbids importing a provider's own
 *  types even via `import type`). Bound structurally to the provider's
 *  `ChatPanelPointerDragHandlers` in `dependencies.ts`. */
export interface ChatPanelPointerDragHandlers {
  onMove: (clientX: number) => void;
  onEnd: () => void;
  onCancel: () => void;
}

/** One design-system section's review entry, persisted on
 *  `project.metadata.designSystemReview`. */
export type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];

/** The agent task queued/sent for a "needs work" review decision. */
export type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;

/** Optional detail fields carried by a design-system-review decision. */
export interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}

/** A daemon run-status snapshot, as returned by `fetchChatRunStatus`/
 *  `listActiveChatRuns`. A direct alias of the wire DTO (not redeclared). */
export type RunStatusSnapshot = ChatRunStatusResponse;

/** Handlers the buffered-text-updates flush-triggers bridge drives (port
 *  result type, kept in-slice per ADR 0002). Bound structurally to the
 *  provider's `BufferedTextFlushHandlers` in `dependencies.ts`. */
export interface BufferedTextFlushHandlers {
  onHiddenFlush: () => void;
  onPageHideFlush: () => void;
}

/** A project's live SSE/file-change event, structurally matching `ProjectEvent`
 *  from `providers/project-events.ts` (kept in-slice per ADR 0002 — that type
 *  isn't a port result, but a plain param the provider's own file-changed
 *  variant isn't a wire DTO, so it's re-declared here rather than imported). */
export type ProjectLiveEvent =
  | { type: 'file-changed'; path: string; kind: 'add' | 'change' | 'unlink' }
  | ProjectConversationCreatedSsePayload
  | LiveArtifactSsePayload
  | LiveArtifactRefreshSsePayload;

/** A brand-browser-assist snapshot read from the embedded webview, or the
 *  reason none was available. Produced by `readBrandBrowserSnapshot*`
 *  (still resident in the orchestrator; not yet extracted). */
export type BrandBrowserSnapshot =
  | { status: 'ready'; html: string; css: string; baseUrl: string }
  | { status: 'unavailable'; message: string }
  | { status: 'read-failed'; message: string };

/** Result of continuing a brand extraction from a browser snapshot: either
 *  the snapshot handled the continuation, or it missed and the caller should
 *  fall back to the next strategy in the chain. */
export type BrandBrowserSnapshotExtractionResult =
  | { status: 'handled' }
  | { status: 'miss'; message: string | null };

/** Options for a single message-persist write, forwarded to the transport
 *  port's `saveMessage`. A direct structural mirror of `state/projects`'
 *  `SaveMessageOptions` (kept in-slice per ADR 0002 — the guard forbids a
 *  slice file importing that module directly). */
export interface SaveMessageOptions {
  telemetryFinalized?: boolean;
  keepalive?: boolean;
}
