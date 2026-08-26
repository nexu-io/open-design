import type { LiveArtifactRefreshStatus } from '../api/live-artifacts.js';
import type { RunFailureCategory, RunFailureDetail } from '../api/chat.js';
import type { StrategyTaskProjectionV2 } from '../plugins/strategy-v2.js';
import type { SseErrorPayload } from '../errors.js';
import type { SseTransportEvent } from './common.js';

export type LiveArtifactSseAction = 'created' | 'updated' | 'deleted';
export type LiveArtifactRefreshSsePhase = 'started' | 'succeeded' | 'failed';

export interface LiveArtifactSsePayload {
  type: 'live_artifact';
  action: LiveArtifactSseAction;
  projectId: string;
  artifactId: string;
  title: string;
  /**
   * Refresh lifecycle state of the artifact at emit time. Typed against the
   * canonical `LiveArtifactRefreshStatus` enum used by the REST API so that
   * SSE consumers (web, CLI) can switch on the same union members without
   * widening to `string`. Optional because the daemon may omit the field on
   * legacy events; consumers must still null-check before narrowing.
   */
  refreshStatus?: LiveArtifactRefreshStatus;
}

export interface LiveArtifactRefreshSsePayload {
  type: 'live_artifact_refresh';
  phase: LiveArtifactRefreshSsePhase;
  projectId: string;
  artifactId: string;
  refreshId?: string;
  title?: string;
  refreshedSourceCount?: number;
  error?: string;
}

export interface PlainStreamArtifactSsePayload {
  type: 'artifact';
  source: 'plain-stream';
  name: string;
  path?: string;
  identifier?: string;
  artifactType?: string;
}

/**
 * Emitted by the daemon on `/api/projects/:id/events` when a new
 * conversation is inserted into a project from a path the open
 * project view can't observe through its own state — currently
 * Routines "Run now" in reuse-an-existing-project mode (#1361).
 *
 * Lives in `packages/contracts` so the daemon producer and the web
 * consumer share one type and can't drift as the stream grows.
 */
export interface ProjectConversationCreatedSsePayload {
  type: 'conversation-created';
  projectId: string;
  conversationId: string;
  title: string | null;
  createdAt: number;
}

export const CHAT_SSE_PROTOCOL_VERSION = 1;

export interface ChatSseStartPayload {
  runId?: string;
  agentId?: string;
  bin: string;
  protocolVersion?: typeof CHAT_SSE_PROTOCOL_VERSION;
  /** Legacy daemon-internal absolute cwd. Kept for compatibility during W2 adoption. */
  cwd?: string | null;
  projectId?: string | null;
  model?: string | null;
  reasoning?: string | null;
  serviceTier?: string | null;
}

export interface ChatSseChunkPayload {
  chunk: string;
}

export interface ChatSseEndPayload {
  code: number | null;
  signal?: string | null;
  status?: 'succeeded' | 'failed' | 'canceled';
  /** Authoritative count of artifact files created or modified by this run.
   *  Present when the daemon resolved the run's filesystem/tool-stream diff
   *  before publishing the terminal frame. */
  artifactCount?: number;
  /** Project-relative artifact paths created or modified by this run. */
  artifactPaths?: string[];
  /** True when a `failed` run can be recovered by resuming the agent's CLI
   *  session (transient upstream drop / inactivity on a session-resuming
   *  runtime). Lets the chat offer a Continue affordance without a separate
   *  run-status fetch. Mirrors ChatRunStatusResponse.resumable. */
  resumable?: boolean;
  /** True when this terminal run ended with unfinished declared work (a
   *  non-`completed` TodoWrite task, or a max_tokens truncation). The browser
   *  reads it straight off the terminal frame and carries it onto the persisted
   *  assistant message so every status surface avoids showing "Completed" for an
   *  incomplete run. Mirrors ChatRunStatusResponse.endedWithUnfinishedWork. */
  endedWithUnfinishedWork?: boolean;
  /** Daemon failure classification for a `failed` run, so the chat can render
   *  specific guidance straight off the terminal frame without a status refetch.
   *  Mirror ChatRunStatusResponse.failureCategory / failureDetail. */
  failureCategory?: RunFailureCategory | null;
  failureDetail?: RunFailureDetail | null;
  strategyTask?: StrategyTaskProjectionV2;
}

export type DaemonAgentPayload =
  | { type: 'status'; label: string; model?: string; ttftMs?: number; detail?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'conversation_title'; title: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_start' }
  | LiveArtifactSsePayload
  | LiveArtifactRefreshSsePayload
  | PlainStreamArtifactSsePayload
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
      /** Optional wall-clock ms when the tool first started (e.g. ACP first frame). */
      startedAt?: number;
    }
  /**
   * Live-only incremental tool-input fragment, emitted while the model is still
   * streaming a tool call's JSON arguments (Claude `input_json_delta`). `delta`
   * is a raw, possibly mid-token JSON fragment — not parseable on its own.
   * Consumers accumulate by `id` (the content-block id, equal to the eventual
   * `tool_use.id`) for real-time display and discard once the full `tool_use`
   * arrives. `name` is the tool name (known at content-block start) so the UI
   * can gate the live preview to code-writing tools. NOT persisted — see
   * `daemonAgentPayloadToPersistedAgentEvent`.
   */
  | { type: 'tool_input_delta'; id: string; name: string; delta: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'usage'; usage?: { input_tokens?: number; output_tokens?: number }; costUsd?: number; durationMs?: number; stopReason?: string | null }
  | { type: 'fabricated_role_marker'; marker: string; messageId?: string }
  // The agent is stuck repeating failing tool calls (see tool-loop-guard.ts).
  // `action: 'warn'` is an early heads-up the run may be looping; `'halt'` means
  // the daemon terminated the run at the hard ceiling. `signature` is a
  // truncated, human-readable form of the repeated action; `count` is how many
  // times it failed (consecutive run, or repeats of this exact action).
  | {
      type: 'tool_loop';
      reason: 'consecutive-errors' | 'repeated-failure';
      action: 'warn' | 'halt';
      toolName: string;
      signature: string;
      count: number;
    }
  | { type: 'raw'; line: string };

/**
 * Out-of-band run diagnostics. The payload is discriminated by `type` and is
 * additive: a client ignores the types it does not know.
 */
export interface ChatSseDiagnosticPayload {
  type: string;
  [key: string]: unknown;
}

/**
 * The daemon is continuing the SAME logical task in a new physical Run. A Full
 * Plan turn spans several Runs (request -> production) that the user asked for
 * once, and the continuation carries no user prompt of its own.
 *
 * Observability only — it marks the hand-off in the source Run's event log so a
 * multi-Run turn can be reconstructed when diagnosing one. Rendering does NOT
 * read it: the client keeps the turn whole from each message's
 * `strategyTaskRunIndex`, folding the task's messages at render time. A client
 * that instead re-pointed the originating message at `nextRunId` would end up
 * showing the continuation's answer twice, next to the row the daemon persists
 * for that Run.
 */
export interface StrategyTaskContinuationDiagnostic extends ChatSseDiagnosticPayload {
  type: 'strategy_task_continuation';
  taskExecutionId: string | null;
  sourceRunId: string;
  nextRunId: string;
  inputStage: string | null;
  taskRunIndex: number | null;
}

export type ChatSseEvent =
  | SseTransportEvent<'start', ChatSseStartPayload>
  | SseTransportEvent<'agent', DaemonAgentPayload>
  | SseTransportEvent<'stdout', ChatSseChunkPayload>
  | SseTransportEvent<'stderr', ChatSseChunkPayload>
  | SseTransportEvent<'diagnostic', ChatSseDiagnosticPayload>
  | SseTransportEvent<'error', SseErrorPayload>
  | SseTransportEvent<'end', ChatSseEndPayload>;
