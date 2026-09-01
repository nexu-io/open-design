/** @module agent-protocol/acp/session
 * ACP session orchestrator: performs the full initialize → session/new (or
 * session/load) → session/prompt handshake with an already-spawned ACP
 * subprocess, streams updates to the daemon event bus, handles permission
 * replies, artifact-write mirroring, DSML text suppression, and clean abort.
 * Depends on every other acp/ file and the core JSON-line stream. Consumed by
 * connectionTest.ts and server.ts (via the acp/ barrel).
 */
import path from 'node:path';
import type { ExecutionProfile } from '@open-design/contracts';
import {
  createDsmlArtifactTextSuppressor,
  createToolCallTextSuppressor,
  type ArtifactTextSuppressor,
} from '../../artifacts/text-suppression.js';
import { redactSecrets } from '../../redact.js';
import { createJsonLineStream } from '../core/index.js';
import type { JsonRpcId, JsonObject, TimerHandle, AcpChildProcess } from './types.js';
import {
  ACP_PROTOCOL_VERSION,
  DEFAULT_STAGE_TIMEOUT_MS,
  ACP_ARTIFACT_ECHO_START_RE,
  ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT,
  AMR_STDERR_RETRY_TAIL_LIMIT,
  ACP_STDERR_DIAGNOSTIC_TAIL_LIMIT,
} from './constants.js';
import { errorMessage, asObject, extractAcpUpdateText, extractAcpStatusDetail } from './json.js';
import {
  sendRpc,
  sendRpcResult,
  isJsonRpcId,
  rpcErrorMessage,
  rpcErrorData,
  rpcErrorRetryable,
  inferRpcErrorRetryable,
  promotedOpenCodeSessionErrorPayload,
  formatUsage,
  choosePermissionOutcome,
} from './rpc.js';
import {
  acpRawEventShape,
  isAcpTerminalFailureStatus,
  acpToolCallId,
  isAcpArtifactWriteLabel,
  isAcpArtifactWriteUpdate,
  isAcpTerminalToolStatus,
  isAcpThinkOnlyTool,
  isAcpRecognizedKind,
  acpArtifactWritePathRanked,
  acpToolName,
  acpToolInput,
  acpToolResultContent,
  acpSafeToolResultContent,
  acpTelemetryToolCallId,
  promotedAmrRetryStatusPayload,
  promotedAmrStderrPayload,
} from './updates.js';
import {
  findModelConfigOption,
  currentModelFromSessionResult,
  modelSelectionErrorIsRecoverable,
} from './models.js';
import { buildAcpSessionNewParams, buildPromptBlocks, type AcpMcpServerInput } from './session-params.js';
import { withholdStdioMcpServersForBuild } from './stdio-mcp.js';
import { createVelaChildEvidenceConsumer } from '../../runtimes/vela-child-evidence.js';
import { withAcpEmissionProvenance, type AcpEmissionMeta } from './emission-provenance.js';
import {
  createToolExecutionLifecycleDeduper,
  sanitizeToolExecutionLifecycleUpdate,
} from './tool-execution-lifecycle.js';

const NON_DISPLAYABLE_ACP_SESSION_UPDATES = new Set([
  'usage_update',
  'session_info_update',
  'available_commands_update',
]);

/**
 * Out-of-band provenance for a single `send` from this bridge.
 *
 * Deliberately NOT part of the event payload: this says where the emission came
 * from, not what it contains, and it must not reach the persisted transcript,
 * the SSE wire, or Langfuse metadata.
 *
 * `hostSynthesized` marks an event the daemon manufactured while closing its own
 * books — the terminal `tool_use`/`tool_result` pair `flushOpenAcpTools` writes
 * for a tool the agent never terminated. The agent produced no bytes for it.
 * Consumers that measure *agent* liveness (the chat run's progress clock) must
 * exclude these; consumers that build the transcript still want them, which is
 * why the pair is emitted rather than dropped.
 */
export type { AcpEmissionMeta } from './emission-provenance.js';

/**
 * Options for `attachAcpSession`. All fields except `child`, `prompt`, and
 * `send` are optional and carry sensible defaults.
 */
export interface AttachAcpSessionOptions {
  child: AcpChildProcess;
  prompt: string;
  cwd?: string;
  model?: string | null;
  imagePaths?: string[];
  /** Frozen non-image/image resources delivered as ACP resource_link blocks. */
  resourcePaths?: string[];
  mcpServers?: AcpMcpServerInput[];
  // Passed through to buildAcpSessionNewParams — see AcpSessionOptions.
  envFormat?: 'array' | 'map';
  // First version of this agent that rejects stdio MCP servers on `session/new`
  // (`RuntimeAgentDef.acpStdioMcpRemovedInVersion`). When set, stdio entries are
  // withheld from any build at or above it, judged against the version the agent
  // reports in its own `initialize` result. Leave unset for agents that accept
  // stdio MCP servers at every version.
  stdioMcpRemovedInVersion?: string | null;
  send: (event: string, payload: unknown, meta?: AcpEmissionMeta) => void;
  clientName?: string;
  clientVersion?: string;
  stageTimeoutMs?: number;
  executionProfile?: ExecutionProfile;
  modelUnavailableErrorCode?: 'AMR_MODEL_UNAVAILABLE';
  // Some ACP adapters expose an explicit `turn_end` session update as their
  // terminal turn signal instead of returning the pending session/prompt RPC.
  // Keep this opt-in so standard ACP adapters still require the response.
  completePromptOnTurnEnd?: boolean;
  // When set, resume an existing upstream session instead of creating a new
  // one: the handshake sends `session/load { sessionId }` (the durable handle
  // captured from a prior run via `getDurableSessionId()`) rather than
  // `session/new`. The agent verifies the session and, if it is gone, returns a
  // structured `resume_failed` error the caller maps to its reseed path.
  resumeSessionId?: string | null;
  // Subsegment timing markers for spawn->first-token attribution (#3408 §4).
  // `onCliReady` fires once on the first well-formed ACP JSON-RPC message
  // (the CLI is up and speaking the protocol); `onSessionInit` fires once when
  // the `session/new` handshake is acknowledged (a session id is established).
  // `onPromptComplete` fires once when a clean `session/prompt` result is
  // accepted. Error paths never invoke it.
  onCliReady?: () => void;
  onSessionInit?: () => void;
  onPromptComplete?: () => void;
  /**
   * Transfers process-tree teardown ownership to the caller once this
   * one-prompt session has a clean or fatal verdict. When provided, the ACP
   * bridge does not fall back to direct-child SIGTERM; the caller must stop the
   * complete owned tree and gate terminal publication on its quiescence.
   */
  onTerminal?: (kind: 'completed' | 'fatal') => void;
}
/**
 * Attaches an ACP protocol session to an already-spawned child process and
 * drives the full JSON-RPC conversation from handshake to prompt completion.
 *
 * Sequence:
 * 1. Sends `initialize` to confirm the protocol version.
 * 2. Sends `session/new` (or `session/load` when `resumeSessionId` is set).
 * 3. Optionally sends `session/set_model` when a non-default model is requested.
 * 4. Sends `session/prompt` with the user's prompt and any image attachments.
 * 5. Streams `session/update` events to the `send` callback, translating:
 *    - `agent_thought_chunk` → `thinking_start` / `thinking_delta`
 *    - `agent_message_chunk` → `text_delta` (with DSML and tool-call text suppression)
 *    - `tool_call` / `tool_call_update` → full `tool_use` / `tool_result` transcript
 *      (all tools; write tools keep Claude-shaped names + `file_path` for artifact count)
 *    - status updates → `agent.status` events
 * 6. Handles `session/request_permission` calls by auto-approving.
 * 7. On prompt completion, flushes suppression buffers, emits usage, and closes stdin.
 *
 * Returns a controller object that the caller may use to query session state
 * and to abort the in-progress turn.
 *
 * @param options - See `AttachAcpSessionOptions` for all fields.
 * @returns A controller with `hasFatalError`, `getDurableSessionId`,
 *   `completedSuccessfully`, and `abort` methods.
 */
export function attachAcpSession({
  child,
  prompt,
  cwd,
  model,
  imagePaths = [],
  resourcePaths = [],
  mcpServers,
  envFormat = 'array',
  stdioMcpRemovedInVersion,
  send,
  clientName = 'open-design',
  clientVersion = 'runtime-adapter',
  stageTimeoutMs = DEFAULT_STAGE_TIMEOUT_MS,
  executionProfile = 'filesystem',
  modelUnavailableErrorCode,
  completePromptOnTurnEnd = false,
  resumeSessionId,
  onCliReady,
  onSessionInit,
  onPromptComplete,
  onTerminal,
}: AttachAcpSessionOptions) {
  const runStartedAt = Date.now();
  const toolExecutionLifecycleDeduper = createToolExecutionLifecycleDeduper();
  const effectiveCwd = path.resolve(cwd || process.cwd());
  if (!child.stdin || !child.stdout) {
    throw new Error('ACP child process must expose stdin and stdout streams');
  }
  const stdin = child.stdin;
  const stdout = child.stdout;
  let expectedId = 1;
  let nextId = 2;
  let promptRequestId: JsonRpcId | null = null;
  let setModelRequestId: JsonRpcId | null = null;
  let sessionId: string | null = null;
  // The durable upstream session handle reported by the agent on session/new or
  // session/load (vela's `openCodeSessionId`). The caller stores it per
  // conversation to resume next turn. Distinct from `sessionId`, which is the
  // ACP wrapper id ("vela-opencode-1").
  let durableSessionId: string | null = null;
  let activeModel: string | null = null;
  let modelConfigId: string | null = null;
  let emittedThinkingStart = false;
  let emittedFirstTokenStatus = false;
  let emittedTextChunk = false;
  let emittedVisibleTextChunk = false;
  let emittedToolCall = false;
  let emittedConcreteToolEvent = false;
  let emittedTextBuffer = '';
  let rawAcpShapeDiagnosticCount = 0;
  let artifactSuppressionDiagnosticCount = 0;
  let velaChildRejectionDiagnosticCount = 0;
  let acpStderrTail = '';
  let currentStage = 'initialize';
  let finished = false;
  let fatal = false;
  let aborted = false;
  let stageTimer: TimerHandle | null = null;
  let dsmlArtifactSuppressor: ArtifactTextSuppressor | null = null;
  let dsmlArtifactSuppressorLastSuppressedChars = 0;
  let dsmlArtifactSuppressorToolCallId: string | null = null;
  let dsmlArtifactSuppressorArmedAfterText = false;
  let dsmlArtifactSuppressorSawIncrementalProse = false;
  const toolCallTextSuppressor = createToolCallTextSuppressor();
  let toolCallTextSuppressorLastSuppressedChars = 0;
  const artifactTextSuppressionSummary = {
    suppressedChars: 0,
    suppressedChunks: 0,
    openedBlocks: 0,
    closedBlocks: 0,
  };
  const toolCallTextSuppressionSummary = {
    suppressedChars: 0,
    suppressedChunks: 0,
    openedBlocks: 0,
    closedBlocks: 0,
  };
  // The AMR discriminator is deliberately required here. A generic ACP agent
  // advertising a same-named extension must not silently expand the daemon's
  // accepted protocol surface.
  const velaChildEvidenceConsumer = modelUnavailableErrorCode
    ? createVelaChildEvidenceConsumer({
        onFact: (fact) => {
          send('agent', {
            type: 'diagnostic',
            name: 'vela_opencode_child_agent_lifecycle',
            source: 'amr-opencode',
            elapsedMs: Date.now() - runStartedAt,
            ...fact,
          });
        },
      })
    : null;
  const acpArtifactWriteToolCallIds = new Set<string>();
  // Per toolCallId: accumulate name/input/path/result across partial ACP frames
  // and emit exactly one tool_use + one tool_result at terminal status (or on
  // prompt flush for still-open tools). Think-only tools are tracked but never
  // transcribed and never flip emittedConcreteToolEvent. Entries stay after
  // emit so a repeated terminal frame cannot re-create + re-emit.
  type AcpToolNameSource = 'kind' | 'other';
  type AcpToolRunState = {
    name: string;
    nameSource: AcpToolNameSource;
    input: Record<string, unknown>;
    path: string | null;
    pathRank: number;
    resultContent: string;
    /** Sticky: once true, never cleared by later status-only frames. */
    thinkOnly: boolean;
    firstSeenAt: number;
    emitted: boolean;
  };
  const acpToolRunEventState = new Map<string, AcpToolRunState>();

  const buildToolUseInput = (st: AcpToolRunState): Record<string, unknown> => {
    const input = { ...st.input };
    if (st.path) input.file_path = st.path;
    else delete input.file_path;
    return input;
  };

  // Where a terminal tool pair came from. `agent_frame` means the agent sent a
  // terminal `tool_call_update` and we are transcribing it. `host_flush` means
  // the agent never did, and we are closing the tool ourselves so the pair is
  // not lost — see `flushOpenAcpTools`.
  type AcpTerminalToolOrigin = 'agent_frame' | 'host_flush';

  const emitTerminalToolPair = (
    toolCallId: string,
    st: AcpToolRunState,
    isError: boolean,
    origin: AcpTerminalToolOrigin = 'agent_frame',
  ) => {
    if (st.emitted) return;
    st.emitted = true;
    // Think/reason frames are activity noise for AMR no-output detection and
    // must not appear as concrete tool_use/tool_result events.
    if (st.thinkOnly) return;
    // A host flush is the daemon writing the tool's ending for it, not the agent
    // reporting one. Same payload either way — only the provenance differs, and
    // it travels out-of-band so the transcript is unchanged.
    const meta: AcpEmissionMeta | undefined =
      origin === 'host_flush' ? { hostSynthesized: true } : undefined;
    // Raw ACP toolCallId stays as the local Map key for frame correlation; the
    // transcript/telemetry id is always an opaque hash so adapter-supplied
    // ids (paths, tokens, JWTs) never leak into Langfuse span ids or
    // metadata.toolCallId.
    const telemetryToolCallId = acpTelemetryToolCallId(toolCallId);
    send('agent', withAcpEmissionProvenance({
      type: 'tool_use',
      id: telemetryToolCallId,
      name: st.name,
      input: buildToolUseInput(st),
      // Wall-clock start of the first ACP frame for this toolCallId so analytics
      // can compute real duration even though tool_use is emitted at terminal.
      startedAt: st.firstSeenAt,
    }, meta), meta);
    send('agent', withAcpEmissionProvenance({
      type: 'tool_result',
      toolUseId: telemetryToolCallId,
      // Bash/execute stdout can dump private files (cat .env). Langfuse only
      // lexically masks Bash, so redact before the canonical transcript ships.
      content: acpSafeToolResultContent(st.name, st.resultContent),
      isError,
    }, meta), meta);
    // Concrete only on terminal tool_result for a real (non-think) tool.
    emittedConcreteToolEvent = true;
  };

  // Flush tools that never received a terminal `tool_call_update`. Clean
  // completion uses isError=false (best-effort close); fail paths use
  // isError=true so Langfuse/PostHog and the persisted transcript keep the
  // open tool as an errored result instead of dropping it entirely.
  //
  // Do not clear the map after flush. Emitted entries must stay until the
  // session ends so a late/racy terminal `tool_call_update` (timeout/abort/
  // prompt-response flush racing buffered stdout) cannot recreate the same
  // id as a fresh open tool and emit a second, possibly contradictory
  // tool_use/tool_result pair. `st.emitted` already suppresses re-emission.
  const flushOpenAcpTools = (isError = false) => {
    for (const [toolCallId, st] of acpToolRunEventState) {
      if (st.emitted) continue;
      emitTerminalToolPair(toolCallId, st, isError, 'host_flush');
    }
  };

  const stageWatchdogDisabled = stageTimeoutMs <= 0;
  const resetStageTimer = (label: string) => {
    if (stageTimer) clearTimeout(stageTimer);
    // `stageTimeoutMs <= 0` disables the watchdog. Mirrors the outer chat
    // inactivity watchdog escape hatch (see server.ts → inactivityTimer).
    // Without this, an operator setting `OD_ACP_STAGE_TIMEOUT_MS=0` would
    // schedule a 0ms timeout that fires on the next tick and kills the
    // session immediately.
    if (stageWatchdogDisabled) return;
    stageTimer = setTimeout(() => {
      fail(`ACP ${label} timed out after ${stageTimeoutMs}ms`);
    }, stageTimeoutMs);
  };

  const clearStageTimer = () => {
    if (stageTimer) clearTimeout(stageTimer);
    stageTimer = null;
  };

  const amrModelUnavailablePayload = (message: string) => ({
    message,
    error: {
      code: 'AMR_MODEL_UNAVAILABLE',
      message,
      retryable: false,
      details: { kind: 'amr_model', action: 'choose_model' },
    },
  });

  const isModelUnavailableError = (message: string) => {
    const value = message.toLowerCase();
    return (
      value.includes('model not found') ||
      value.includes('providermodelnotfounderror') ||
      value.includes('unknown model') ||
      value.includes('invalid model') ||
      value.includes('modelid is not available')
    );
  };

  const failWithPayload = (payload: unknown) => {
    if (finished) return;
    // Emit pending tools as errored before terminal state so deferred
    // tool_use pairs are not lost on timeout / process death / RPC error.
    flushOpenAcpTools(true);
    finished = true;
    fatal = true;
    clearStageTimer();
    let terminalOwnedByCaller = false;
    try {
      onTerminal?.('fatal');
      terminalOwnedByCaller = onTerminal != null;
    } catch {
      // Fall back to direct-child termination below.
    }
    send('error', payload);
    if (!terminalOwnedByCaller && !child.killed) child.kill('SIGTERM');
  };

  const fail = (
    message: string,
    options: { forceModelUnavailable?: boolean; details?: unknown; retryable?: boolean } = {},
  ) => {
    if (finished) return;
    // Emit pending tools as errored before terminal state so deferred
    // tool_use pairs are not lost on timeout / process death / RPC error.
    flushOpenAcpTools(true);
    finished = true;
    fatal = true;
    clearStageTimer();
    let terminalOwnedByCaller = false;
    try {
      onTerminal?.('fatal');
      terminalOwnedByCaller = onTerminal != null;
    } catch {
      // Fall back to direct-child termination below.
    }
    const useModelUnavailable =
      modelUnavailableErrorCode &&
      (options.forceModelUnavailable || isModelUnavailableError(message));
    send(
      'error',
      useModelUnavailable
        ? amrModelUnavailablePayload(message)
        : options.details === undefined && options.retryable === undefined
          ? { message }
          : {
              message,
              error: {
                code: 'AGENT_EXECUTION_FAILED',
                message,
                retryable: options.retryable ?? false,
                ...(options.details === undefined ? {} : { details: options.details }),
              },
            },
    );
    if (!terminalOwnedByCaller && !child.killed) child.kill('SIGTERM');
  };

  const writeRpc = (id: JsonRpcId, method: string, params: unknown, timeoutLabel: string) => {
    currentStage = timeoutLabel;
    resetStageTimer(timeoutLabel);
    try {
      sendRpc(stdin, id, method, params);
    } catch (err) {
      fail(`stdin write failed: ${errorMessage(err)}`);
    }
  };

  const emitAcpRawShapeDiagnostic = (update: JsonObject) => {
    if (!modelUnavailableErrorCode) return;
    if (rawAcpShapeDiagnosticCount >= ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT) return;
    rawAcpShapeDiagnosticCount += 1;
    send('agent', {
      type: 'diagnostic',
      name: 'acp_raw_event_shape',
      source: 'acp-json-rpc',
      elapsedMs: Date.now() - runStartedAt,
      shape: acpRawEventShape(update),
    });
  };

  const emitAcpExecutionObservability = (update: JsonObject): boolean => {
    const name = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
    if (name === 'tool_execution_lifecycle') {
      if (modelUnavailableErrorCode) {
        const diagnostic = sanitizeToolExecutionLifecycleUpdate(update);
        if (diagnostic && toolExecutionLifecycleDeduper.accept(diagnostic)) {
          send('agent', {
            ...diagnostic,
            elapsedMs: Date.now() - runStartedAt,
          });
        }
      }
      // Private adapter diagnostics never fall through to generic status or
      // tool-result projection, including unknown schema versions.
      return true;
    }
    if (
      name !== 'assistant_message_lifecycle' &&
      name !== 'model_step_lifecycle' &&
      name !== 'model_retry' &&
      name !== 'opencode_compaction'
    ) {
      return false;
    }
    const numberField = (key: string) => {
      const value = update[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    };
    const stringField = (key: string) => {
      const value = update[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const usage = asObject(update.usage);
    send('agent', {
      type: 'diagnostic',
      name,
      source: 'amr-opencode',
      elapsedMs: Date.now() - runStartedAt,
      ...(stringField('phase') ? { phase: stringField('phase') } : {}),
      ...(stringField('status') ? { status: stringField('status') } : {}),
      ...(stringField('reason') ? { reason: stringField('reason') } : {}),
      ...(stringField('provider') ? { provider: stringField('provider') } : {}),
      ...(stringField('model') ? { model: stringField('model') } : {}),
      ...(stringField('errorClass') ? { errorClass: stringField('errorClass') } : {}),
      ...(stringField('timingEvidence')
        ? { timingEvidence: stringField('timingEvidence') }
        : {}),
      ...(numberField('assistantMessageIndex') !== undefined
        ? { assistantMessageIndex: numberField('assistantMessageIndex') }
        : {}),
      ...(numberField('stepIndex') !== undefined
        ? { stepIndex: numberField('stepIndex') }
        : {}),
      ...(numberField('startedAtMs') !== undefined
        ? { startedAtMs: numberField('startedAtMs') }
        : {}),
      ...(numberField('endedAtMs') !== undefined
        ? { endedAtMs: numberField('endedAtMs') }
        : {}),
      ...(numberField('durationMs') !== undefined
        ? { durationMs: numberField('durationMs') }
        : {}),
      ...(numberField('attempt') !== undefined
        ? { attempt: numberField('attempt') }
        : {}),
      ...(usage
        ? {
            usage: {
              ...(typeof usage.inputTokens === 'number'
                ? { inputTokens: usage.inputTokens }
                : {}),
              ...(typeof usage.outputTokens === 'number'
                ? { outputTokens: usage.outputTokens }
                : {}),
              ...(typeof usage.totalTokens === 'number'
                ? { totalTokens: usage.totalTokens }
                : {}),
              ...(typeof usage.reasoningTokens === 'number'
                ? { reasoningTokens: usage.reasoningTokens }
                : {}),
              ...(typeof usage.cacheReadTokens === 'number'
                ? { cacheReadTokens: usage.cacheReadTokens }
                : {}),
              ...(typeof usage.cacheWriteTokens === 'number'
                ? { cacheWriteTokens: usage.cacheWriteTokens }
                : {}),
            },
          }
        : {}),
    });
    return true;
  };

  const emitVisibleTextDelta = (delta: string) => {
    if (!delta) return;
    emittedVisibleTextChunk = true;
    if (!emittedFirstTokenStatus) {
      emittedFirstTokenStatus = true;
      send('agent', {
        type: 'status',
        label: 'streaming',
        ttftMs: Date.now() - runStartedAt,
      });
    }
    send('agent', { type: 'text_delta', delta });
  };

  const noteArtifactTextSuppression = (reason: string) => {
    if (!dsmlArtifactSuppressor) return;
    const stats = dsmlArtifactSuppressor.stats();
    const suppressedDelta = stats.suppressedChars - dsmlArtifactSuppressorLastSuppressedChars;
    if (suppressedDelta <= 0) return;
    dsmlArtifactSuppressorLastSuppressedChars = stats.suppressedChars;
    artifactTextSuppressionSummary.suppressedChars += suppressedDelta;
    artifactTextSuppressionSummary.suppressedChunks = stats.suppressedChunks;
    artifactTextSuppressionSummary.openedBlocks = stats.openedBlocks;
    artifactTextSuppressionSummary.closedBlocks = stats.closedBlocks;
    if (artifactSuppressionDiagnosticCount >= ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT) return;
    artifactSuppressionDiagnosticCount += 1;
    send('agent', {
      type: 'diagnostic',
      name: 'acp_artifact_text_suppression',
      source: 'acp-json-rpc',
      elapsedMs: Date.now() - runStartedAt,
      reason,
      suppressedChars: artifactTextSuppressionSummary.suppressedChars,
      suppressedChunks: artifactTextSuppressionSummary.suppressedChunks,
      openedBlocks: artifactTextSuppressionSummary.openedBlocks,
      closedBlocks: artifactTextSuppressionSummary.closedBlocks,
      pendingCandidateChars: stats.pendingCandidateChars,
      suppressing: stats.suppressing,
    });
  };

  const emitArtifactTextSuppressionSummary = () => {
    if (artifactTextSuppressionSummary.suppressedChars <= 0) return;
    if (executionProfile === 'filesystem') {
      send('agent', {
        type: 'diagnostic',
        name: 'unexpected_text_artifact_in_filesystem_run',
        source: 'acp-json-rpc',
        elapsedMs: Date.now() - runStartedAt,
        suppressedChars: artifactTextSuppressionSummary.suppressedChars,
        suppressedChunks: artifactTextSuppressionSummary.suppressedChunks,
        openedBlocks: artifactTextSuppressionSummary.openedBlocks,
        closedBlocks: artifactTextSuppressionSummary.closedBlocks,
      });
    }
    send('agent', {
      type: 'diagnostic',
      name: 'acp_artifact_text_suppression_summary',
      source: 'acp-json-rpc',
      elapsedMs: Date.now() - runStartedAt,
      ...artifactTextSuppressionSummary,
    });
  };

  const noteToolCallTextSuppression = (reason: string) => {
    const stats = toolCallTextSuppressor.stats();
    const suppressedDelta = stats.suppressedChars - toolCallTextSuppressorLastSuppressedChars;
    if (suppressedDelta <= 0) return;
    toolCallTextSuppressorLastSuppressedChars = stats.suppressedChars;
    toolCallTextSuppressionSummary.suppressedChars += suppressedDelta;
    toolCallTextSuppressionSummary.suppressedChunks = stats.suppressedChunks;
    toolCallTextSuppressionSummary.openedBlocks = stats.openedBlocks;
    toolCallTextSuppressionSummary.closedBlocks = stats.closedBlocks;
    if (artifactSuppressionDiagnosticCount >= ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT) return;
    artifactSuppressionDiagnosticCount += 1;
    send('agent', {
      type: 'diagnostic',
      name: 'acp_tool_call_text_suppression',
      source: 'acp-json-rpc',
      elapsedMs: Date.now() - runStartedAt,
      reason,
      suppressedChars: toolCallTextSuppressionSummary.suppressedChars,
      suppressedChunks: toolCallTextSuppressionSummary.suppressedChunks,
      openedBlocks: toolCallTextSuppressionSummary.openedBlocks,
      closedBlocks: toolCallTextSuppressionSummary.closedBlocks,
      pendingCandidateChars: stats.pendingCandidateChars,
      suppressing: stats.suppressing,
    });
  };

  const emitToolCallTextSuppressionSummary = () => {
    if (toolCallTextSuppressionSummary.suppressedChars <= 0) return;
    send('agent', {
      type: 'diagnostic',
      name: 'acp_tool_call_text_suppression_summary',
      source: 'acp-json-rpc',
      elapsedMs: Date.now() - runStartedAt,
      ...toolCallTextSuppressionSummary,
    });
  };

  const sendPrompt = () => {
    promptRequestId = nextId;
    expectedId = promptRequestId;
    writeRpc(
      promptRequestId,
      'session/prompt',
      {
        sessionId,
        prompt: buildPromptBlocks(prompt, [...resourcePaths, ...imagePaths]),
      },
      'session/prompt',
    );
    send('agent', {
      type: 'status',
      label: 'waiting_for_first_output',
      elapsedMs: Date.now() - runStartedAt,
    });
    nextId += 1;
  };

  // Best-effort: emit provider usage before terminal fail/success so failed
  // ACP runs still contribute token fields to PostHog/Langfuse when the agent
  // returned a usage object on the prompt result.
  const emitUsageIfPresent = (usageSource?: unknown) => {
    const usage = formatUsage(usageSource);
    if (!usage) return;
    send('agent', {
      type: 'usage',
      usage,
      durationMs: Date.now() - runStartedAt,
    });
  };

  const finishCleanPrompt = (usageSource?: unknown) => {
    if (finished) return;
    // Mark the prompt finished before notifying observers so duplicate results
    // and callback re-entry cannot report clean completion more than once.
    finished = true;
    onPromptComplete?.();
    // Flush any tools still open when the prompt completes so traces stay
    // complete (one tool_use + tool_result per id).
    flushOpenAcpTools();
    const flushedToolText = toolCallTextSuppressor.flush();
    noteToolCallTextSuppression('tool_call_xml_flush');
    const flushedText = flushedToolText ? (dsmlArtifactSuppressor?.strip(flushedToolText) ?? flushedToolText) : '';
    if (flushedText) {
      emitVisibleTextDelta(flushedText);
    }
    noteArtifactTextSuppression('artifact_flush');
    emitToolCallTextSuppressionSummary();
    emitArtifactTextSuppressionSummary();
    emitUsageIfPresent(usageSource);
    clearStageTimer();
    stdin.end();
    let terminalOwnedByCaller = false;
    try {
      onTerminal?.('completed');
      terminalOwnedByCaller = onTerminal != null;
    } catch {
      // Fall back to the direct-child timer below.
    }
    // Some ACP agents keep the child process alive after stdin closes,
    // waiting for another prompt. Each OpenDesign run owns one process per
    // turn, so close it once this prompt is cleanly complete.
    if (!terminalOwnedByCaller) {
      const cleanExitTimer = setTimeout(() => {
        if (!child.killed) child.kill('SIGTERM');
      }, 500);
      child.once('close', () => clearTimeout(cleanExitTimer));
    }
  };

  const replyPermission = (raw: JsonObject) => {
    const params = asObject(raw.params);
    const optionId = choosePermissionOutcome(params?.options);
    if (!optionId || !isJsonRpcId(raw.id)) {
      fail(`unhandled ACP permission request: ${JSON.stringify(raw)}`);
      return;
    }
    // E-lite: the ACP path is the only daemon-observable approval gate. Surface
    // it so `run_finished.approval_requested` can attribute a `tool_execution`
    // stall to an approval hang even though we auto-approve here.
    send('agent', {
      type: 'diagnostic',
      name: 'acp_approval_request',
      source: 'acp-json-rpc',
      elapsedMs: Date.now() - runStartedAt,
      optionId,
    });
    resetStageTimer('session/request_permission');
    try {
      sendRpcResult(stdin, raw.id, {
        outcome: { outcome: 'selected', optionId },
      });
    } catch (err) {
      fail(`stdin write failed: ${errorMessage(err)}`);
    }
  };

  const recoverFromModelSelectionError = () => {
    setModelRequestId = null;
    activeModel = activeModel || 'default';
    send('agent', { type: 'status', label: 'model', model: activeModel });
    sendPrompt();
  };

  const parser = createJsonLineStream((raw, rawLine) => {
    if (aborted || finished) return;
    resetStageTimer('response');
    const obj = asObject(raw);
    if (!obj) return;
    // First well-formed ACP JSON-RPC message = CLI ready (#3408 §4). Caller
    // dedupes, so re-notifying on later messages is harmless.
    onCliReady?.();
    const error = asObject(obj.error);
    const params = asObject(obj.params);
    const result = asObject(obj.result);
    const rpcErr = rpcErrorMessage(obj);
    if (rpcErr) {
      // After response completion, any late-arriving errors from the agent
      // (pipe-broken, cleanup race conditions, etc.) are safe to ignore.
      if (finished) return;
      // JSON-RPC error handling:
      // -32603 unexpected-id errors are cleanup noise. Expected-id model
      // selection failures are recoverable for agents with an implicit
      // default. AMR/Vela requires an explicit selection before prompt, so a
      // rejected model must stay terminal instead of creating a secondary
      // `session/set_model must be called before session/prompt` failure.
      if (
        obj.id === setModelRequestId &&
        modelSelectionErrorIsRecoverable(error?.code) &&
        promptRequestId === null
      ) {
        if (modelUnavailableErrorCode) {
          fail(rpcErr, { details: rpcErrorData(obj), retryable: false });
        } else {
          recoverFromModelSelectionError();
        }
        return;
      }
      if (error?.code === -32603 && obj.id !== expectedId) {
        return;
      }
      const details = rpcErrorData(obj);
      const promotedPayload = promotedOpenCodeSessionErrorPayload(details, rpcErr);
      if (promotedPayload) {
        failWithPayload(promotedPayload);
        return;
      }
      const retryable = rpcErrorRetryable(details) ?? inferRpcErrorRetryable(rpcErr, details);
      fail(rpcErr, {
        details,
        ...(retryable === undefined ? {} : { retryable }),
      });
      return;
    }
    if (obj.method === 'session/request_permission') {
      replyPermission(obj);
      return;
    }
    const update = asObject(params?.update);
    if (obj.method === 'session/update' && update) {
      if (modelUnavailableErrorCode) {
        const promotedPayload = promotedAmrRetryStatusPayload(update);
        if (promotedPayload) {
          failWithPayload(promotedPayload);
          return;
        }
      }
      const velaChildResult = velaChildEvidenceConsumer?.observe({
        expectedAcpSessionId: sessionId,
        envelopeAcpSessionId: params?.sessionId,
        update,
      });
      if (velaChildResult?.handled) {
        if (
          velaChildResult.reason &&
          velaChildRejectionDiagnosticCount < ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT
        ) {
          velaChildRejectionDiagnosticCount += 1;
          send('agent', {
            type: 'diagnostic',
            name: 'vela_opencode_child_evidence_rejected',
            source: 'amr-opencode',
            elapsedMs: Date.now() - runStartedAt,
            reason: velaChildResult.reason,
          });
        }
        // Accepted facts are emitted by onFact. Rejected child frames must not
        // fall through to generic status/raw diagnostics, which could copy
        // unallowlisted producer fields.
        return;
      }
      if (emitAcpExecutionObservability(update)) {
        return;
      }
      if (
        typeof update.sessionUpdate === 'string' &&
        NON_DISPLAYABLE_ACP_SESSION_UPDATES.has(update.sessionUpdate)
      ) {
        return;
      }
      if (update.sessionUpdate !== 'agent_message_chunk' && update.sessionUpdate !== 'agent_thought_chunk') {
        const detail = extractAcpStatusDetail(update);
        send('agent', {
          type: 'status',
          label: String(update.sessionUpdate || 'session_update'),
          ...(detail ? { detail } : {}),
          elapsedMs: Date.now() - runStartedAt,
        });
        emitAcpRawShapeDiagnostic(update);
      }
      if (
        completePromptOnTurnEnd &&
        promptRequestId !== null &&
        update.sessionUpdate === 'turn_end'
      ) {
        finishCleanPrompt(update.usage);
        return;
      }
      if (update.sessionUpdate === 'agent_thought_chunk') {
        emitAcpRawShapeDiagnostic(update);
        const text = extractAcpUpdateText(update);
        if (text) {
          if (!emittedThinkingStart) {
            emittedThinkingStart = true;
            send('agent', { type: 'thinking_start' });
          }
          send('agent', { type: 'thinking_delta', delta: text });
        }
        return;
      }
      if (update.sessionUpdate === 'agent_message_chunk') {
        emitAcpRawShapeDiagnostic(update);
        const text = extractAcpUpdateText(update);
        if (text) {
          const isCumulativeSnapshot = text.startsWith(emittedTextBuffer);
          const delta = isCumulativeSnapshot
            ? text.slice(emittedTextBuffer.length)
            : text;
          if (delta.length > 0) {
            emittedTextChunk = true;
            emittedTextBuffer += delta;
            const wasSuppressingToolCall = toolCallTextSuppressor.isSuppressing();
            const toolCallStrippedDelta = toolCallTextSuppressor.strip(delta);
            noteToolCallTextSuppression(
              wasSuppressingToolCall || toolCallStrippedDelta !== delta
                ? 'tool_call_xml'
                : 'tool_call_candidate',
            );
            if (!toolCallStrippedDelta) {
              return;
            }
            if (dsmlArtifactSuppressor) {
              const wasSuppressingArtifact = dsmlArtifactSuppressor.isSuppressing();
              const hadPendingArtifactCandidate = dsmlArtifactSuppressor.hasPendingCandidate();
              const strippedDelta = dsmlArtifactSuppressor.strip(toolCallStrippedDelta);
              noteArtifactTextSuppression(
                wasSuppressingArtifact || strippedDelta !== toolCallStrippedDelta
                  ? 'artifact_echo'
                  : 'artifact_candidate',
              );
              const hasOpenArtifactCandidate =
                dsmlArtifactSuppressor.isSuppressing() || dsmlArtifactSuppressor.hasPendingCandidate();
              const consumedArtifactText = wasSuppressingArtifact || strippedDelta !== delta;
              const shouldPreserveIncrementalProse =
                !isCumulativeSnapshot &&
                !wasSuppressingArtifact &&
                !hadPendingArtifactCandidate &&
                !hasOpenArtifactCandidate &&
                (
                  strippedDelta === toolCallStrippedDelta ||
                  (
                    !dsmlArtifactSuppressorArmedAfterText &&
                    dsmlArtifactSuppressorSawIncrementalProse &&
                    !ACP_ARTIFACT_ECHO_START_RE.test(toolCallStrippedDelta)
                  )
                );
              const outputDelta = shouldPreserveIncrementalProse ? toolCallStrippedDelta : strippedDelta;
              if (outputDelta) {
                emitVisibleTextDelta(outputDelta);
              }
              if (
                strippedDelta === toolCallStrippedDelta &&
                !wasSuppressingArtifact &&
                !hadPendingArtifactCandidate &&
                !hasOpenArtifactCandidate
              ) {
                dsmlArtifactSuppressorSawIncrementalProse = true;
              }
              if (consumedArtifactText && !hasOpenArtifactCandidate) {
                dsmlArtifactSuppressor = null;
                dsmlArtifactSuppressorToolCallId = null;
                dsmlArtifactSuppressorArmedAfterText = false;
                dsmlArtifactSuppressorSawIncrementalProse = false;
              }
            } else {
              emitVisibleTextDelta(toolCallStrippedDelta);
            }
          }
        }
        return;
      }
      if (
        update.sessionUpdate === 'tool_call' ||
        update.sessionUpdate === 'tool_call_update'
      ) {
        // The turn did real work (a tool call / file edit), which is valid output even
        // when the model emits no closing assistant text. Track it so the prompt-complete
        // handler does not misreport such a turn as "no output / model unavailable".
        emittedToolCall = true;
        const toolCallId = acpToolCallId(update);
        if (toolCallId && isAcpArtifactWriteLabel(update)) {
          acpArtifactWriteToolCallIds.add(toolCallId);
        }
        // Full ACP tool transcript → canonical tool_use/tool_result events for
        // Langfuse/PostHog and `countNewArtifacts` (run-artifacts.ts). Every
        // non-think tool is mirrored once at terminal status (accumulate
        // partial frames first). Write tools keep Claude-shaped Write/Edit
        // names and a real `file_path` when present. Never use toolCallId as
        // file_path.
        if (toolCallId) {
          const nextName = acpToolName(update);
          const nextInput = acpToolInput(update);
          const nextPath = acpArtifactWritePathRanked(update);
          const nextResult = acpToolResultContent(update);
          const nextThinkOnly = isAcpThinkOnlyTool(update);
          const kindRaw = typeof update.kind === 'string' ? update.kind.trim() : '';
          const nameFromKind = Boolean(kindRaw && isAcpRecognizedKind(kindRaw));
          let st = acpToolRunEventState.get(toolCallId);
          if (!st) {
            st = {
              name: nextName,
              nameSource: nameFromKind ? 'kind' : 'other',
              input: nextInput,
              path: nextPath?.path ?? null,
              pathRank: nextPath?.rank ?? 0,
              resultContent: nextResult,
              thinkOnly: nextThinkOnly,
              firstSeenAt: Date.now(),
              emitted: false,
            };
            acpToolRunEventState.set(toolCallId, st);
          } else if (!st.emitted) {
            // Kind-locked names must not be overwritten by later title-only frames
            // (e.g. kind:read then title "Update cache" must stay Read).
            if (nameFromKind) {
              st.name = nextName;
              st.nameSource = 'kind';
            } else if (st.nameSource !== 'kind') {
              // Prefer a more specific name over the generic fallback.
              if (nextName !== 'Tool' || st.name === 'Tool') st.name = nextName;
            }
            // Shallow merge rawInput; later keys win.
            st.input = { ...st.input, ...nextInput };
            // Upgrade path when a higher-precedence source appears.
            if (nextPath && (!st.path || nextPath.rank >= st.pathRank)) {
              st.path = nextPath.path;
              st.pathRank = nextPath.rank;
            }
            // Keep last non-empty result payload (terminal may be status-only).
            if (nextResult) st.resultContent = nextResult;
            // Sticky think-only: once classified, never clear on later frames
            // (terminal status-only frames have no title and would otherwise
            // flip thinkOnly false and emit a fake concrete tool).
            if (nextThinkOnly) st.thinkOnly = true;
          }
          if (isAcpTerminalToolStatus(update)) {
            const failed = isAcpTerminalFailureStatus(update);
            emitTerminalToolPair(toolCallId, st, failed);
            // Keep the entry (emitted=true) so a repeated terminal cannot re-emit.
          }
        }
        if (isAcpArtifactWriteUpdate(update, acpArtifactWriteToolCallIds)) {
          dsmlArtifactSuppressor = createDsmlArtifactTextSuppressor();
          dsmlArtifactSuppressorLastSuppressedChars = 0;
          dsmlArtifactSuppressorToolCallId = toolCallId;
          dsmlArtifactSuppressorArmedAfterText = emittedTextBuffer.length > 0;
          dsmlArtifactSuppressorSawIncrementalProse = false;
          if (toolCallId) acpArtifactWriteToolCallIds.delete(toolCallId);
        } else if (toolCallId && isAcpTerminalFailureStatus(update)) {
          const ownsPendingWriteSuppression = toolCallId === dsmlArtifactSuppressorToolCallId;
          const ownsPendingWriteCall = acpArtifactWriteToolCallIds.has(toolCallId);
          acpArtifactWriteToolCallIds.delete(toolCallId);
          if (ownsPendingWriteSuppression || ownsPendingWriteCall) {
            dsmlArtifactSuppressor = null;
            dsmlArtifactSuppressorToolCallId = null;
            dsmlArtifactSuppressorArmedAfterText = false;
            dsmlArtifactSuppressorSawIncrementalProse = false;
          }
        }
        return;
      }
      return;
    }
    if (obj.id !== expectedId || !result) {
      return;
    }
    if (expectedId === 1) {
      const negotiation = velaChildEvidenceConsumer?.negotiate(result);
      if (negotiation?.advertised) {
        send('agent', {
          type: 'diagnostic',
          name: 'vela_opencode_child_evidence_capability',
          source: 'amr-opencode',
          elapsedMs: Date.now() - runStartedAt,
          ...negotiation,
        });
      }
      expectedId = nextId;
      if (resumeSessionId) {
        // Resume the prior upstream session instead of creating a fresh one.
        writeRpc(
          nextId,
          'session/load',
          { sessionId: resumeSessionId, cwd: effectiveCwd },
          'session/load',
        );
      } else {
        // The build that just answered `initialize` is the one about to parse
        // `session/new`, so the version it reports for itself is the authority
        // on which MCP transports this payload may carry. Preferred over any
        // earlier `--version` probe, which can be stale by the time a run
        // starts (upgrade between probe and run, PATH shim, detection refresh).
        const agentInfo = (result as { agentInfo?: { version?: unknown } }).agentInfo;
        const reportedVersion =
          typeof agentInfo?.version === 'string' ? agentInfo.version : null;
        const sessionMcp = mcpServers
          ? withholdStdioMcpServersForBuild(mcpServers, {
              reportedVersion,
              removedInVersion: stdioMcpRemovedInVersion,
            })
          : null;
        if (sessionMcp && sessionMcp.withheldNames.length > 0) {
          // Daemon-log only: the transcript is user-facing and localized, and a
          // withheld MCP server is an operator-diagnostic detail, not something
          // the user can act on mid-turn.
          console.warn(
            `[acp] agent build ${reportedVersion ?? 'unknown'} does not accept stdio MCP servers; withheld ${sessionMcp.withheldNames.join(', ')}`,
          );
        }
        writeRpc(
          nextId,
          'session/new',
          buildAcpSessionNewParams(
            effectiveCwd,
            sessionMcp ? { mcpServers: sessionMcp.servers, envFormat } : { envFormat },
          ),
          'session/new',
        );
      }
      nextId += 1;
      return;
    }
    if (expectedId === 2) {
      sessionId = typeof result.sessionId === 'string' ? result.sessionId : null;
      // The durable handle for resuming this session on the next turn.
      durableSessionId =
        typeof result.openCodeSessionId === 'string' ? result.openCodeSessionId : null;
      // session/new acknowledged with a session id = handshake done (#3408 §4).
      if (sessionId) onSessionInit?.();
      const modelConfig = findModelConfigOption(result.configOptions);
      modelConfigId = modelConfig?.configId ?? null;
      activeModel = currentModelFromSessionResult(result);
      if (sessionId && activeModel) {
        send('agent', { type: 'status', label: 'model', model: activeModel });
      }
      if (sessionId && model && model !== 'default') {
        setModelRequestId = nextId;
        expectedId = nextId;
        const setModelMethod = modelConfigId ? 'session/set_config_option' : 'session/set_model';
        const setModelParams = modelConfigId
          ? { sessionId, configId: modelConfigId, value: model }
          : { sessionId, modelId: model };
        writeRpc(
          nextId,
          setModelMethod,
          setModelParams,
          setModelMethod,
        );
        nextId += 1;
        return;
      }
      if (!sessionId) {
        fail(`invalid session/new response: ${rawLine}`);
        return;
      }
      sendPrompt();
      return;
    }
    if (promptRequestId !== null && obj.id === promptRequestId) {
      // Flush still-open tools before AMR no-output classification. A successful
      // session/prompt may omit a terminal tool_call_update; clean-closing those
      // pending non-think tools flips emittedConcreteToolEvent so we take
      // finishCleanPrompt instead of acp_no_visible_output (which would re-flush
      // them as isError via fail()). Think-only open tools do not flip the flag.
      flushOpenAcpTools();
      const usage = formatUsage(result.usage);
      if (!emittedVisibleTextChunk && !emittedConcreteToolEvent && modelUnavailableErrorCode) {
        const outputTokens = usage?.output_tokens;
        const hadCompletionTokens = typeof outputTokens === 'number' && outputTokens > 0;
        // Emit usage before fail so analytics still sees provider tokens.
        emitUsageIfPresent(result.usage);
        if (hadCompletionTokens || emittedToolCall || emittedTextChunk) {
          fail(
            'ACP session completed after reporting model activity, but did not produce visible assistant text, concrete tool results, or artifacts.',
            {
              retryable: true,
              details: {
                kind: 'acp_no_visible_output',
                output_tokens: outputTokens,
                raw_tool_update_seen: emittedToolCall,
                text_chunk_seen: emittedTextChunk,
              },
            },
          );
        } else {
          fail(
            'ACP session completed without producing any assistant text. Refresh the AMR model list, choose a supported model, and retry this run.',
            { forceModelUnavailable: true },
          );
        }
        return;
      }
      finishCleanPrompt(result.usage);
      return;
    }
    if (sessionId && model && model !== 'default' && obj.id === expectedId) {
      activeModel = currentModelFromSessionResult(result) ?? model;
      send('agent', { type: 'status', label: 'model', model: activeModel });
      sendPrompt();
    }
  });

  stdout.on('data', (chunk: string) => parser.feed(chunk));
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    if (finished) return;
    acpStderrTail = `${acpStderrTail}${String(chunk)}`.slice(
      -AMR_STDERR_RETRY_TAIL_LIMIT,
    );
    if (!modelUnavailableErrorCode) return;
    const promotedPayload = promotedAmrStderrPayload(acpStderrTail);
    if (promotedPayload) failWithPayload(promotedPayload);
  });
  child.on('close', (code, signal) => {
    clearStageTimer();
    parser.flush();
    if (!finished && !aborted && !fatal) {
      const stderrTail = redactSecrets(
        acpStderrTail
          .replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '')
          .replace(/\r\n?/gu, '\n')
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ''),
      )
        .trim()
        .slice(-ACP_STDERR_DIAGNOSTIC_TAIL_LIMIT);
      fail(
        `ACP session exited before completion (code=${code ?? 'null'}, signal=${signal ?? 'none'})`,
        {
          details: {
            kind: 'acp_child_exit',
            phase: currentStage,
            exit_code: code,
            signal,
            ...(stderrTail ? { stderr_tail: stderrTail } : {}),
          },
        },
      );
    }
  });
  child.on('error', (err: Error) => fail(err.message));
  stdin.on('error', (err: Error) => fail(`stdin error: ${err.message}`));

  writeRpc(1, 'initialize', {
    protocolVersion: ACP_PROTOCOL_VERSION,
    clientCapabilities: { terminal: false },
    clientInfo: { name: clientName, version: clientVersion },
  }, 'initialize');

  /**
   * The prompt request resolved without a fatal protocol/transport error and
   * without an abort. Any other ending may have dropped ACP updates that were
   * still in flight, so evidence collected in this run cannot claim to be
   * complete.
   */
  const promptCompletedCleanly = () => finished && !fatal && !aborted;

  return {
    /** Returns `true` when the session ended with a fatal protocol or transport error, allowing the caller to surface the failure. */
    hasFatalError() {
      return fatal;
    },
    /**
     * Child-evidence coverage for this ACP run, or `undefined` when the agent
     * is not the AMR-discriminated runtime and therefore has no child-evidence
     * consumer. The daemon publishes this as the `child_evidence_coverage_v1`
     * diagnostic at child close; without it every AMR task aggregates as
     * `child_lifecycle_unavailable_not_zero`, which cannot distinguish a run
     * that had no Child agents from a run nobody was observing.
     */
    childEvidenceCoverage() {
      return velaChildEvidenceConsumer?.childEvidenceCoverage({
        sessionComplete: promptCompletedCleanly(),
      });
    },
    // The durable upstream session handle to persist for resume, or null when
    // none was reported (older agents, or a handshake that never established a
    // session). Mirrors pi-rpc's getLastSessionPath().
    /** Returns the durable upstream session id (e.g. vela's `openCodeSessionId`) to persist for next-turn resume, or `null` when the agent did not report one. */
    getDurableSessionId() {
      return durableSessionId;
    },
    /** Returns `true` when the prompt request resolved cleanly without a fatal error and without an abort, even if the child process later exited via SIGTERM. */
    completedSuccessfully() {
      // Returns true when the prompt request resolved without a fatal error
      // and was not aborted. The chat consumer treats this as a successful
      // run even if the child process subsequently exited via SIGTERM
      // (which is expected for agents that don't shut down on stdin.end()).
      return promptCompletedCleanly();
    },
    /**
     * Aborts an in-progress ACP session. Sends `session/cancel` when a session
     * id has already been established, then always closes stdin so the agent
     * receives EOF and can tear down its own runtime (e.g. vela's private
     * OpenCode server). Idempotent — subsequent calls are no-ops.
     */
    abort() {
      if (aborted || finished) return;
      // Flush deferred tool pairs as errored before terminal cancel. Tools are
      // held until a terminal tool_call_update; without this flush, user cancel
      // (runs.ts → acpSession.abort) drops in-progress tools from the transcript
      // and from Langfuse/PostHog — unlike timeout and child-exit fail paths.
      flushOpenAcpTools(true);
      aborted = true;
      finished = true;
      clearStageTimer();
      if (!child.stdin || child.stdin.destroyed || child.stdin.writableEnded)
        return;
      // Only cancel an established session; before session/new resolves there
      // is no sessionId to cancel, but we must still close stdin below.
      if (sessionId) {
        try {
          sendRpc(child.stdin, nextId, 'session/cancel', { sessionId });
          nextId += 1;
        } catch {
          // The caller owns process-signal fallback if the ACP transport is gone.
        }
      }
      // Always close stdin so the agent receives EOF and shuts down its own
      // runtime — the vela ACP bridge tears down its private OpenCode server on
      // EOF — instead of lingering (and leaking that server) until the caller's
      // SIGTERM fallback fires. This also covers aborts during ACP startup,
      // before session/new returns. Mirrors the clean-completion path above.
      try {
        child.stdin.end();
      } catch {
        // Best effort; the caller still owns the SIGTERM/SIGKILL fallback.
      }
    },
  };
}
