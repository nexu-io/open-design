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
import { createJsonLineStream } from '../core/index.js';
import type { JsonRpcId, JsonObject, TimerHandle, AcpChildProcess } from './types.js';
import {
  ACP_PROTOCOL_VERSION,
  DEFAULT_STAGE_TIMEOUT_MS,
  ACP_ARTIFACT_ECHO_START_RE,
  ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT,
  AMR_STDERR_RETRY_TAIL_LIMIT,
} from './constants.js';
import { errorMessage, asObject, extractAcpUpdateText } from './json.js';
import {
  sendRpc,
  sendRpcResult,
  isJsonRpcId,
  rpcErrorMessage,
  rpcErrorData,
  rpcErrorRetryable,
  promotedOpenCodeSessionErrorPayload,
  formatUsage,
  choosePermissionOutcome,
} from './rpc.js';
import {
  acpRawEventShape,
  isAcpCompletedStatus,
  isAcpTerminalFailureStatus,
  acpToolCallId,
  isAcpArtifactWriteLabel,
  isAcpArtifactWriteUpdate,
  acpArtifactWritePath,
  promotedAmrRetryStatusPayload,
  promotedAmrStderrPayload,
} from './updates.js';
import {
  findModelConfigOption,
  currentModelFromSessionResult,
  modelSelectionErrorIsRecoverable,
} from './models.js';
import { buildAcpSessionNewParams, buildPromptBlocks, type AcpMcpServerInput } from './session-params.js';

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
  mcpServers?: AcpMcpServerInput[];
  // Passed through to buildAcpSessionNewParams — see AcpSessionOptions.
  envFormat?: 'array' | 'map';
  send: (event: string, payload: unknown) => void;
  clientName?: string;
  clientVersion?: string;
  stageTimeoutMs?: number;
  executionProfile?: ExecutionProfile;
  modelUnavailableErrorCode?: 'AMR_MODEL_UNAVAILABLE';
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
  // Both are best-effort and the caller dedupes, so extra calls are harmless.
  onCliReady?: () => void;
  onSessionInit?: () => void;
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
 *    - `tool_call` / `tool_call_update` → deferred `tool_use` / `tool_result` pairs
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
  mcpServers,
  envFormat = 'array',
  send,
  clientName = 'open-design',
  clientVersion = 'runtime-adapter',
  stageTimeoutMs = DEFAULT_STAGE_TIMEOUT_MS,
  executionProfile = 'filesystem',
  modelUnavailableErrorCode,
  resumeSessionId,
  onCliReady,
  onSessionInit,
}: AttachAcpSessionOptions) {
  const runStartedAt = Date.now();
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
  let amrStderrRetryTail = '';
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
  const acpArtifactWriteToolCallIds = new Set<string>();
  // Per artifact-write tool call, accumulate the best concrete file path seen
  // across its frames and whether we have already mirrored it into canonical
  // tool_use/tool_result events. Emission is deferred to the terminal frame so
  // a `locations`/`rawInput` path that ACP only sends on a later update is used
  // for classification, instead of locking in a first-frame guess.
  const acpArtifactRunEventState = new Map<string, { path: string | null; emitted: boolean }>();

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
      value.includes('invalid model')
    );
  };

  const failWithPayload = (payload: unknown) => {
    if (finished) return;
    finished = true;
    fatal = true;
    clearStageTimer();
    send('error', payload);
    if (!child.killed) child.kill('SIGTERM');
  };

  const fail = (
    message: string,
    options: { forceModelUnavailable?: boolean; details?: unknown; retryable?: boolean } = {},
  ) => {
    if (finished) return;
    finished = true;
    fatal = true;
    clearStageTimer();
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
    if (!child.killed) child.kill('SIGTERM');
  };

  const writeRpc = (id: JsonRpcId, method: string, params: unknown, timeoutLabel: string) => {
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
        prompt: buildPromptBlocks(prompt, imagePaths),
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

  const finishCleanPrompt = (usageSource?: unknown) => {
    if (finished) return;
    const flushedToolText = toolCallTextSuppressor.flush();
    noteToolCallTextSuppression('tool_call_xml_flush');
    const flushedText = flushedToolText ? (dsmlArtifactSuppressor?.strip(flushedToolText) ?? flushedToolText) : '';
    if (flushedText) {
      emitVisibleTextDelta(flushedText);
    }
    noteArtifactTextSuppression('artifact_flush');
    emitToolCallTextSuppressionSummary();
    emitArtifactTextSuppressionSummary();
    const usage = formatUsage(usageSource);
    if (usage) {
      send('agent', {
        type: 'usage',
        usage,
        durationMs: Date.now() - runStartedAt,
      });
    }
    finished = true;
    clearStageTimer();
    stdin.end();
    // Some ACP agents keep the child process alive after stdin closes,
    // waiting for another prompt. Each Open Design run owns one process per
    // turn, so close it once this prompt is cleanly complete.
    const cleanExitTimer = setTimeout(() => {
      if (!child.killed) child.kill('SIGTERM');
    }, 500);
    child.once('close', () => clearTimeout(cleanExitTimer));
  };

  const replyPermission = (raw: JsonObject) => {
    const params = asObject(raw.params);
    const optionId = choosePermissionOutcome(params?.options);
    if (!optionId || !isJsonRpcId(raw.id)) {
      fail(`unhandled ACP permission request: ${JSON.stringify(raw)}`);
      return;
    }
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
      // selection failures are recoverable; all other RPC errors are real
      // protocol failures for initialize/session/new/session/prompt.
      if (
        obj.id === setModelRequestId &&
        modelSelectionErrorIsRecoverable(error?.code) &&
        promptRequestId === null
      ) {
        recoverFromModelSelectionError();
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
      const retryable = rpcErrorRetryable(details);
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
      if (update.sessionUpdate !== 'agent_message_chunk' && update.sessionUpdate !== 'agent_thought_chunk') {
        send('agent', {
          type: 'status',
          label: String(update.sessionUpdate || 'session_update'),
          elapsedMs: Date.now() - runStartedAt,
        });
        emitAcpRawShapeDiagnostic(update);
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
        // Mirror artifact-write tool calls into the daemon's canonical
        // tool_use/tool_result event shape so `countNewArtifacts`
        // (run-artifacts.ts) can see ACP file writes. Without this, every ACP
        // agent (AMR, Hermes, Kilo, Kiro, Devin, Vibe, …) reported
        // run_finished.artifact_count: 0 even when the run wrote artifacts,
        // because the ACP adapter emitted only text/status/thinking events and
        // never the tool_use/tool_result pair the counter scans for.
        //
        // This path only feeds the NO-PROJECT fallback (project runs use the
        // filesystem snapshot). Two correctness rules, both learned the hard
        // way in review:
        //   1. Defer emission to the TERMINAL frame and accumulate the best
        //      concrete path across frames — ACP often sends `locations` only
        //      on the completing update, and emitting on the first frame would
        //      lock in a wrong/empty guess that a later path can't correct.
        //   2. Never fabricate an artifact extension. `isArtifactPath` is what
        //      decides whether a write counts; feeding it a real path lets it
        //      correctly EXCLUDE non-artifact edits (`config.json`, `README.md`)
        //      and INCLUDE real artifacts. A write that never carries a concrete
        //      path stays keyed on its (extension-less) toolCallId, so it is
        //      simply not counted rather than inflating the metric with a
        //      synthetic `.html` — under-counting a truly opaque write is
        //      acceptable; a false-positive artifact is not.
        if (toolCallId) {
          const isWriteCall =
            isAcpArtifactWriteLabel(update) || acpArtifactWriteToolCallIds.has(toolCallId);
          if (isWriteCall) {
            let st = acpArtifactRunEventState.get(toolCallId);
            if (!st) {
              st = { path: null, emitted: false };
              acpArtifactRunEventState.set(toolCallId, st);
            }
            if (!st.path) st.path = acpArtifactWritePath(update);
            const failed = isAcpTerminalFailureStatus(update);
            if (!st.emitted && (failed || isAcpCompletedStatus(update))) {
              st.emitted = true;
              send('agent', {
                type: 'tool_use',
                id: toolCallId,
                name: 'Write',
                input: { file_path: st.path ?? toolCallId },
              });
              send('agent', { type: 'tool_result', toolUseId: toolCallId, isError: failed });
              emittedConcreteToolEvent = true;
            }
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
        writeRpc(
          nextId,
          'session/new',
          buildAcpSessionNewParams(
            effectiveCwd,
            mcpServers ? { mcpServers, envFormat } : { envFormat },
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
      const usage = formatUsage(result.usage);
      if (!emittedVisibleTextChunk && !emittedConcreteToolEvent && modelUnavailableErrorCode) {
        const outputTokens = usage?.output_tokens;
        const hadCompletionTokens = typeof outputTokens === 'number' && outputTokens > 0;
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
    if (!modelUnavailableErrorCode || finished) return;
    amrStderrRetryTail = `${amrStderrRetryTail}${String(chunk)}`.slice(
      -AMR_STDERR_RETRY_TAIL_LIMIT,
    );
    const promotedPayload = promotedAmrStderrPayload(amrStderrRetryTail);
    if (promotedPayload) failWithPayload(promotedPayload);
  });
  child.on('close', (code, signal) => {
    clearStageTimer();
    parser.flush();
    if (!finished && !aborted && !fatal) {
      fail(`ACP session exited before completion (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    }
  });
  child.on('error', (err: Error) => fail(err.message));
  stdin.on('error', (err: Error) => fail(`stdin error: ${err.message}`));

  writeRpc(1, 'initialize', {
    protocolVersion: ACP_PROTOCOL_VERSION,
    clientCapabilities: { terminal: false },
    clientInfo: { name: clientName, version: clientVersion },
  }, 'initialize');

  return {
    /** Returns `true` when the session ended with a fatal protocol or transport error, allowing the caller to surface the failure. */
    hasFatalError() {
      return fatal;
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
      return finished && !fatal && !aborted;
    },
    /**
     * Aborts an in-progress ACP session. Sends `session/cancel` when a session
     * id has already been established, then always closes stdin so the agent
     * receives EOF and can tear down its own runtime (e.g. vela's private
     * OpenCode server). Idempotent — subsequent calls are no-ops.
     */
    abort() {
      if (aborted || finished) return;
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
