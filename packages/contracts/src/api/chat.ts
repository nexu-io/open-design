import type { ProjectFile } from './files';
import type {
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewCommentPosition,
  PreviewCommentSelectionKind,
  PreviewAnnotationStyle,
  PreviewVisualMarkKind,
} from './comments';
import type { ResearchOptions } from './research';
import type { RunContextSelection } from './context.js';
import type { MediaExecutionPolicy } from './media.js';
import type { AppliedPluginSnapshot } from '../plugins/apply.js';
import type { McpAuthMode, McpServerConfig, McpTransport } from './mcp';

export type ChatRole = 'user' | 'assistant';
export type ChatSessionMode = 'design' | 'chat';
export type ChatCommentSelectionKind = PreviewCommentSelectionKind | 'visual';

export interface ChatRequest {
  agentId: string;
  message: string;
  /** The latest user turn only, used for per-turn telemetry content. */
  currentPrompt?: string;
  systemPrompt?: string;
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
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
  /** UI locale selected by the client, used by prompt composition for user-visible generated UI. */
  locale?: string;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshotId?: string | null;
  /**
   * Run-scoped media execution policy. Omitted means current Open Design
   * behavior: media generation is enabled and OD may execute its configured
   * local providers.
   */
  mediaExecution?: MediaExecutionPolicy;
  /**
   * Ask the selected run agent to emit a short title for this first turn.
   * The daemon strips the title marker from visible assistant text and falls
   * back to client-side naming when the marker is absent or malformed.
   */
  titleGeneration?: {
    enabled?: boolean;
  };
  /**
   * Run-scoped tool bundle supplied by an external orchestrator.
   * These servers are made available only to the spawned agent for this run
   * and are never written into the persistent Settings MCP registry.
   */
  toolBundle?: RunScopedToolBundle;
  /**
   * Optional analytics context for the v2 run_created / run_finished
   * events. The daemon never trusts these for behavior — they only
   * shape PostHog props. `entryFrom` is one of the documented
   * `entry_from` enums; `designSystemRunContext` carries the
   * DS-variant context (source counts, brand description length
   * bucket, DS origin) used by the design_system_project run shape.
   */
  analyticsHints?: ChatAnalyticsHints;
}

export type ChatAnalyticsEntryFrom =
  | 'new_project'
  | 'chat_composer'
  | 'design_system_create'
  | 'onboarding_design_system'
  | 'regenerate_from_review'
  // A turn started by the "Continue the run" affordance on a resumable failed
  // run. Lets run_created / run_finished isolate resume-continuations so the
  // recovery mechanism's usage and success rate are measurable.
  | 'resume_continue'
  // A turn started from a preview annotation: `comment` is the comment/board
  // pin flow (chat-new-line tool), `mark` is the Mark draw-overlay flow
  // (mark-pen tool). Both edit an existing artifact, so isolating them lets the
  // dashboard separate annotation-driven runs from plain composer sends.
  | 'comment'
  | 'mark'
  // A turn whose composer was seeded by a guided Next-step action (the
  // next-step card prefills a skill/prompt; the run fires on the following
  // Send). Best-effort: the pending tag is consumed by the next send.
  | 'next_step'
  // A turn that submits answers to an inline `<question-form>` clarification
  // (the question still being clarified, not a fresh create/edit intent).
  | 'question_answer';

export type ChatAnalyticsLengthBucket =
  | '0'
  | '1_50'
  | '51_200'
  | '201_500'
  | '500_plus';

export type ChatAnalyticsDesignSystemOrigin =
  | 'onboarding'
  | 'manual_create'
  | 'github_repo'
  | 'local_code'
  | 'fig'
  | 'assets'
  | 'official_preset'
  | 'enterprise'
  | 'template'
  | 'mixed'
  | 'unknown';

export interface ChatAnalyticsDesignSystemRunContext {
  origin?: ChatAnalyticsDesignSystemOrigin;
  sourceCount?: number;
  hasBrandDescription?: boolean;
  brandDescriptionLengthBucket?: ChatAnalyticsLengthBucket;
  githubRepoCount?: number;
  localFolderCount?: number;
  figFileCount?: number;
  assetFileCount?: number;
}

export interface ChatAnalyticsHints {
  entryFrom?: ChatAnalyticsEntryFrom;
  projectKind?:
    | 'prototype'
    | 'live_artifact'
    | 'slide_deck'
    | 'template'
    | 'image'
    | 'video'
    | 'audio'
    | 'design_system'
    | 'other';
  designSystemRunContext?: ChatAnalyticsDesignSystemRunContext;
  // Session-dimension run context, computed client-side and stamped onto
  // run_created / run_finished so a session's run sequence is analysable
  // ("did this session reach an artifact, and on which turn?").
  // `turnIndex` is 0-based within the browser analytics session;
  // `isFirstRun` === (turnIndex === 0). `hasExistingArtifact` is true when the
  // project already had a generated artifact when this run was started
  // (project-scoped) — the run is an edit rather than a first creation.
  turnIndex?: number;
  isFirstRun?: boolean;
  hasExistingArtifact?: boolean;
}

export interface RunScopedMcpServerConfig extends Omit<McpServerConfig, 'enabled'> {
  /**
   * Omitted means enabled for this run. The daemon normalizes run-scoped
   * inputs through the same sanitizer as persisted MCP config, but callers
   * should not need to send persisted-settings boilerplate for disposable
   * tool bundles.
   */
  enabled?: boolean;
}

export interface RunScopedToolBundle {
  mcpServers?: RunScopedMcpServerConfig[];
}

export interface RunScopedToolBundleSummary {
  mcpServers: Array<{
    id: string;
    label?: string;
    templateId?: string;
    transport: McpTransport;
    enabled: boolean;
    authMode?: McpAuthMode;
  }>;
}

export type BrowserUseUnavailableReason = 'no-matching-browser-backend';

export type BrowserUseProbeFailureCategory =
  | 'not-probed'
  | 'registry-missing'
  | 'registry-unreadable';

export interface BrowserUseDiscoveryFacts {
  registryPath: string;
  registryExists: boolean;
  socketCount: number;
  candidateCount: number;
  staleCount: number;
  currentSessionIdPresent: boolean | null;
  probeFailureCategory: BrowserUseProbeFailureCategory;
  newestSocketAgeMs?: number;
  staleThresholdMs: number;
}

export interface BrowserUseRunState {
  requested: boolean;
  available: boolean;
  reason?: BrowserUseUnavailableReason;
  diagnostics: BrowserUseDiscoveryFacts;
}

export interface ChatRunCreateRequest extends ChatRequest {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  clientRequestId: string;
}

/**
 * Minimal POST /api/runs shape accepted from MCP / SDK callers that do not
 * manage conversation state client-side. Only `projectId` is required;
 * `message` and `agentId` are optional — the daemon resolves `agentId` from
 * the saved app-config when it is omitted.
 */
export interface McpRunCreateRequest {
  projectId: string;
  message?: string;
  agentId?: string;
  skillId?: string;
  pluginId?: string;
  model?: string;
  pluginInputs?: Record<string, unknown>;
  mediaExecution?: MediaExecutionPolicy;
  toolBundle?: RunScopedToolBundle;
}

export const CHAT_RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const;

export type ChatRunStatus = (typeof CHAT_RUN_STATUSES)[number];

export type ChatMessageFeedbackRating = 'positive' | 'negative';

export type ChatMessageFeedbackReasonCode =
  | 'matched_request'
  | 'strong_visual'
  | 'useful_structure'
  | 'easy_to_continue'
  | 'followed_design_system'
  | 'missed_request'
  | 'weak_visual'
  | 'incomplete_output'
  | 'hard_to_use'
  | 'missed_design_system'
  | 'other';

export interface ChatMessageFeedback {
  rating: ChatMessageFeedbackRating;
  reasonCodes?: ChatMessageFeedbackReasonCode[];
  customReason?: string;
  reasonsSubmittedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

/**
 * POST /api/runs/:runId/feedback — relays the user's assistant-turn rating
 * to Langfuse as a `score-create` so evals can filter traces by feedback.
 * The daemon is the single network egress point for telemetry (web never
 * talks to Langfuse directly), and gates this on `telemetry.metrics +
 * telemetry.content` consent independently of what the browser thinks.
 *
 * `customReason` ships the raw free text the user typed in the "other"
 * input (trimmed). Product confirmed on 2026-05-13 that analysts need the
 * text to make sense of the feedback; this is consent-gated behind
 * `telemetry.content` like the rest of the message-content telemetry.
 */
export interface ChatRunFeedbackRequest {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  rating: ChatMessageFeedbackRating;
  reasonCodes: ChatMessageFeedbackReasonCode[];
  hasCustomReason: boolean;
  /** Raw "other" free text (trimmed). Empty string when no custom reason. */
  customReason: string;
}

export interface ChatRunFeedbackResponse {
  /** `'accepted'` once the daemon has enqueued (or skipped due to consent). */
  status: 'accepted' | 'skipped_consent' | 'skipped_no_sink';
}

export interface ChatRunCreateResponse {
  runId: string;
  // Daemon-resolved conversation/message ids — populated for MCP /
  // SDK callers that POST /api/runs with only projectId. The web flow
  // normally sends these in already; daemon falls back to the
  // project's default conversation otherwise.
  conversationId?: string | null;
  assistantMessageId?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
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
  cancelRequested?: boolean;
  childPid?: number | null;
  processGroupId?: number | null;
  childExited?: boolean;
  childExitObservedAt?: number | null;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  /** True when this terminal failure can be recovered by resuming the agent's
   *  existing CLI session (a transient upstream drop / inactivity timeout on a
   *  session-resuming runtime), rather than only restarting from scratch. The
   *  chat uses it to offer a Continue affordance; the next turn in the same
   *  conversation resumes the persisted session. Absent/false on success,
   *  non-resumable failures, and runtimes without CLI session resume. */
  resumable?: boolean;
  /** Absolute path to the per-run JSONL event log the daemon mirrors
   *  the SSE stream to (see runs.ts `runsLogDir`). Null when the
   *  daemon was launched without event persistence configured. */
  eventsLogPath?: string | null;
  /** Present on daemon run status responses that know the effective run policy. */
  mediaExecution?: MediaExecutionPolicy;
  /** Run-scoped tool bundle summary with secrets and command details redacted. */
  toolBundle?: RunScopedToolBundleSummary;
  /** Browser Use availability for runs that requested in-app browser automation. */
  browserUse?: BrowserUseRunState;
}

export interface ChatRunListResponse {
  runs: ChatRunStatusResponse[];
}

export interface ChatRunCancelResponse {
  ok: true;
  run?: ChatRunStatusResponse;
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
  /**
   * User-visible attachment order for this turn. Older messages may omit it;
   * consumers should fall back to array position.
   */
  order?: number;
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
  style?: PreviewAnnotationStyle;
  selectionKind?: ChatCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  // Zero-based slide the marked element lives on, for deck artifacts. Carried
  // so the host can flip the preview to that slide when the send starts.
  slideIndex?: number;
  screenshotPath?: string;
  markKind?: PreviewVisualMarkKind;
  intent?: string;
  imageAttachments?: PreviewCommentAttachment[];
  /** `'query'` means `comment` was promoted to the message text; keep target data as context only. */
  commentContext?: 'context' | 'query';
  source?: 'saved-comment' | 'board-batch';
}

export type PersistedAgentEvent =
  // `code` carries the structured API error code for `label: 'error'`
  // status events (e.g. AGENT_AUTH_REQUIRED, RATE_LIMITED). Clients use it to
  // decide error-specific affordances such as the hosted-AMR nudge.
  | { kind: 'status'; label: string; detail?: string; code?: string }
  | { kind: 'text'; text: string }
  | { kind: 'conversation_title'; title: string }
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
  | {
      kind: 'plugin_candidate';
      candidateId: string;
      title: string;
      description?: string;
      confidence?: number;
      draftPath?: string | null;
    }
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
  /** True when this message's failed run can be recovered by resuming the
   *  agent's CLI session (transient upstream drop / inactivity on a
   *  session-resuming runtime). Drives the chat's Continue affordance; mirrors
   *  ChatRunStatusResponse.resumable. */
  resumable?: boolean;
  lastRunEventId?: string;
  startedAt?: number;
  endedAt?: number;
  sessionMode?: ChatSessionMode;
  runContext?: RunContextSelection;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  producedFiles?: ProjectFile[];
  // Diff baseline so reattach can rebuild producedFiles after reload.
  preTurnFileNames?: string[];
  feedback?: ChatMessageFeedback;
  /**
   * Request-only marker for the final assistant-message persistence pass.
   * The daemon does not store or return this field; it only uses it to
   * avoid telemetry reads before content and producedFiles are finalized.
   */
  telemetryFinalized?: boolean;
}
