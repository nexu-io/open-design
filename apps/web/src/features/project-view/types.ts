// UI-only / helper types owned by the project-view slice. Wire DTOs live in
// `@open-design/contracts`; these are small local shapes the slice's pure
// helpers produce or consume.
import type { CSSProperties } from 'react';
import type { ChatAttachment, ChatCommentAttachment, ChatMessage } from '../../types';
import type { ChatAnalyticsEntryFrom, ChatSessionMode } from '@open-design/contracts';
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
