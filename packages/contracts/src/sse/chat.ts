import type { LiveArtifactRefreshStatus } from '../api/live-artifacts.js';
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
}

export interface ChatSseChunkPayload {
  chunk: string;
}

export interface ChatSseEndPayload {
  code: number | null;
  signal?: string | null;
  status?: 'succeeded' | 'failed' | 'canceled';
  /** True when a `failed` run can be recovered by resuming the agent's CLI
   *  session (transient upstream drop / inactivity on a session-resuming
   *  runtime). Lets the chat offer a Continue affordance without a separate
   *  run-status fetch. Mirrors ChatRunStatusResponse.resumable. */
  resumable?: boolean;
}

export type DaemonAgentPayload =
  | { type: 'status'; label: string; model?: string; ttftMs?: number; detail?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'conversation_title'; title: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_start' }
  | LiveArtifactSsePayload
  | LiveArtifactRefreshSsePayload
  | { type: 'tool_use'; id: string; name: string; input: unknown }
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
  | { type: 'usage'; usage?: { input_tokens?: number; output_tokens?: number }; costUsd?: number; durationMs?: number }
  | { type: 'fabricated_role_marker'; marker: string; messageId?: string }
  | { type: 'raw'; line: string };

export type ChatSseEvent =
  | SseTransportEvent<'start', ChatSseStartPayload>
  | SseTransportEvent<'agent', DaemonAgentPayload>
  | SseTransportEvent<'stdout', ChatSseChunkPayload>
  | SseTransportEvent<'stderr', ChatSseChunkPayload>
  | SseTransportEvent<'error', SseErrorPayload>
  | SseTransportEvent<'end', ChatSseEndPayload>;
