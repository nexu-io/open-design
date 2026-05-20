import type { ProjectFile } from './files';
import type {
  PreviewCommentMember,
  PreviewCommentPosition,
  PreviewCommentSelectionKind,
  PreviewVisualMarkKind,
} from './comments';
import type { ResearchOptions } from './research';
import type { RunContextSelection } from './context.js';

export type ChatRole = 'user' | 'assistant';
export type ChatCommentSelectionKind = PreviewCommentSelectionKind | 'visual';

export interface ChatRequest {
  agentId: string;
  message: string;
  /** The latest user turn only, used for per-turn telemetry content. */
  currentPrompt?: string;
  systemPrompt?: string;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  // Per-turn skill ids picked via the composer's @-mention popover. The
  // daemon concatenates each skill's body into the system prompt for
  // this run only — they are NOT persisted on the project. Use this to
  // assemble multiple capabilities (e.g. @web-search + @summarize) for
  // a single turn without binding the project to one of them.
  skillIds?: string[];
  designSystemId?: string | null;
  attachments?: string[];
  commentAttachments?: ChatCommentAttachment[];
  model?: string | null;
  reasoning?: string | null;
  research?: ResearchOptions;
  context?: RunContextSelection;
  /**
   * Marks this run as part of a multi-CLI fan-out group. When the client
   * fires the same brief at N agents in parallel, every POST /api/runs
   * carries the same fanoutGroupId so the Compare view can list siblings.
   * The daemon persists it as an opaque string and exposes a list filter
   * `GET /api/runs?fanoutGroupId=...` — no orchestration logic on the
   * daemon side; the web client coordinates the fan-out.
   */
  fanoutGroupId?: string | null;
}

export interface ChatRunCreateRequest extends ChatRequest {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  clientRequestId: string;
}

export type ChatRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type ChatMessageFeedbackRating = 'positive' | 'negative';

export type ChatMessageFeedbackReasonCode =
  | 'matched_request'
  | 'strong_visual'
  | 'useful_structure'
  | 'easy_to_continue'
  | 'missed_request'
  | 'weak_visual'
  | 'incomplete_output'
  | 'hard_to_use'
  | 'other';

export interface ChatMessageFeedback {
  rating: ChatMessageFeedbackRating;
  reasonCodes?: ChatMessageFeedbackReasonCode[];
  customReason?: string;
  reasonsSubmittedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface ChatRunCreateResponse {
  runId: string;
  appliedPluginSnapshotId?: string;
  pluginId?: string;
}

export interface ChatRunStatusResponse {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  fanoutGroupId?: string | null;
  /** Present on fan-out group responses so Compare can render completed output. */
  outputText?: string | null;
  /**
   * `git stash create` hash captured immediately before the agent
   * started writing files. Set when the project is a git repo. The
   * web UI surfaces this as a one-click "Roll back to before this
   * run" affordance via `git stash apply <hash>`.
   */
  preRunStashHash?: string | null;
}

export interface ChatRunListResponse {
  runs: ChatRunStatusResponse[];
}

/**
 * Query filter for `GET /api/runs`. All fields are optional and ANDed.
 * Extracted as a named shape so the daemon list-handler, the web Compare
 * view, and `od fanout`'s status command can share a single source of
 * truth for the query surface.
 */
export interface ChatRunListQuery {
  projectId?: string;
  conversationId?: string;
  fanoutGroupId?: string;
  limit?: number;
}

export interface FanoutGroupSummary {
  fanoutGroupId: string;
  /** First user-facing line of the shared brief, derived from any sibling's currentPrompt. */
  brief: string;
  createdAt: number;
  /** Latest update timestamp across siblings — drives Compare list ordering. */
  updatedAt: number;
  /** Sibling runs ordered by createdAt asc. */
  runs: ChatRunStatusResponse[];
  /** Run id the user marked as the winner via the Compare view picker, if any. */
  winnerRunId?: string | null;
}

export interface FanoutGroupListResponse {
  groups: FanoutGroupSummary[];
}

/**
 * Synthesizer "Suggest Winner" — picks one sibling as the best
 * answer for the shared brief and returns a short rationale. The
 * daemon also flips the winner flag on the run record so the
 * Compare card's star badge stays in sync without a separate
 * winner-set call from the client.
 */
export interface FanoutSuggestWinnerResponse {
  winnerRunId: string;
  rationale: string;
  candidates: {
    runId: string;
    agentId: string | null;
    textLength: number;
  }[];
}

export interface ChatRunCancelResponse {
  ok: true;
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
}

export interface ChatCommentAttachment {
  id: string;
  order: number;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  comment: string;
  currentText: string;
  pagePosition: PreviewCommentPosition;
  htmlHint: string;
  selectionKind?: ChatCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  screenshotPath?: string;
  markKind?: PreviewVisualMarkKind;
  intent?: string;
  source?: 'saved-comment' | 'board-batch';
}

export type PersistedAgentEvent =
  | { kind: 'status'; label: string; detail?: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'live_artifact';
      action: 'created' | 'updated' | 'deleted';
      projectId: string;
      artifactId: string;
      title: string;
      refreshStatus?: string;
    }
  | {
      kind: 'live_artifact_refresh';
      phase: 'started' | 'succeeded' | 'failed';
      projectId: string;
      artifactId: string;
      refreshId?: string;
      title?: string;
      refreshedSourceCount?: number;
      error?: string;
    }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; durationMs?: number }
  | { kind: 'raw'; line: string };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  agentId?: string;
  agentName?: string;
  events?: PersistedAgentEvent[];
  createdAt?: number;
  runId?: string;
  runStatus?: ChatRunStatus;
  lastRunEventId?: string;
  startedAt?: number;
  endedAt?: number;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  producedFiles?: ProjectFile[];
  // When set, this assistant message was part of a multi-CLI fan-out
  // group. The chat thread shows a "View in Compare" link that deep-
  // links to /compare?group=<id> with the group pre-expanded.
  fanoutGroupId?: string | null;
  feedback?: ChatMessageFeedback;
  /**
   * Request-only marker for the final assistant-message persistence pass.
   * The daemon does not store or return this field; it only uses it to
   * avoid telemetry reads before content and producedFiles are finalized.
   */
  telemetryFinalized?: boolean;
}
