/**
 * Maps zcode app-server protocol frames into the small OD event set the chat UI
 * consumes (text_delta / thinking / tool_use / tool_result / usage / status /
 * error / conversation_title).
 *
 * Input is the parsed frame objects surfaced by `createZcodeProtocolClient`'s
 * `onNotification` channel — `session/event` notifications (whose `params.payload`
 * carries the real semantics) and `state.updated` status patches. zcode's
 * streaming vocabulary is unlike the Claude/Codex-compatible `type:'text'/'tool_use'`
 * JSONL, so this stays a dedicated parser.
 *
 * Two rules worth keeping in mind when editing:
 *  - Turn end is the single `final-result` payload (`resultType` + cumulative
 *    `usage`), NOT the per-iteration `turn-result` (which carries `stopReason`
 *    and fires once per model round-trip in a multi-step tool loop).
 *  - Security: model-request telemetry frames carry `requestHeaders` /
 *    `responseHeaders` that can include `x-api-key` / `authorization`. This
 *    parser never forwards them — unrecognised payloads are dropped, not
 *    re-emitted as `raw`.
 */

type JsonRecord = Record<string, unknown>;
type ZcodeEvent = Record<string, unknown>;
type ZcodeEventSink = (event: ZcodeEvent) => void;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** zcode usage (camelCase) → OD usage (snake_case, matches json-event-stream). */
function mapUsage(usage: unknown): JsonRecord | null {
  if (!isRecord(usage)) return null;
  const out: JsonRecord = {};
  if (typeof usage.inputTokens === 'number') out.input_tokens = usage.inputTokens;
  if (typeof usage.outputTokens === 'number') out.output_tokens = usage.outputTokens;
  if (typeof usage.reasoningTokens === 'number') out.thought_tokens = usage.reasoningTokens;
  if (typeof usage.cacheReadTokens === 'number') out.cached_read_tokens = usage.cacheReadTokens;
  if (typeof usage.cacheWriteTokens === 'number') out.cached_write_tokens = usage.cacheWriteTokens;
  return Object.keys(out).length > 0 ? out : null;
}

export function createZcodeStreamHandler(onEvent: ZcodeEventSink) {
  // Fire `thinking_start` once per turn, before the first reasoning delta.
  let emittedThinkingStart = false;

  function startTurn() {
    emittedThinkingStart = false;
  }

  function handlePayload(payload: JsonRecord) {
    const kind = typeof payload.kind === 'string' ? payload.kind : undefined;

    if (kind === 'reasoning_delta') {
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta.length === 0) return;
      if (!emittedThinkingStart) {
        emittedThinkingStart = true;
        onEvent({ type: 'thinking_start' });
      }
      onEvent({ type: 'thinking_delta', delta });
      return;
    }

    if (kind === 'text_delta') {
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta.length > 0) onEvent({ type: 'text_delta', delta });
      return;
    }

    if (kind === 'tool_call') {
      const id = typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined;
      const name = typeof payload.toolName === 'string' ? payload.toolName : undefined;
      if (id && name) {
        onEvent({ type: 'tool_use', id, name, input: payload.input ?? null });
      }
      return;
    }

    if (kind === 'result') {
      const id = typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined;
      if (!id) return;
      const result = isRecord(payload.result) ? payload.result : {};
      onEvent({
        type: 'tool_result',
        toolUseId: id,
        content: stringifyContent(result.content),
        isError: result.success === false,
      });
      return;
    }

    // tool_input_start/delta/end (args streamed as JSON shards), scheduler/exec
    // bookkeeping (scheduled/started/batch) and the tool_result commit anchor
    // add nothing beyond the assembled tool_call + result above.
    if (kind) return;

    // --- kind-less payloads, distinguished by field shape ---

    // final-result: the single cumulative end-of-turn summary (success path).
    if ('resultType' in payload && 'usage' in payload) {
      const usage = mapUsage(payload.usage);
      const durationMs = typeof payload.duration === 'number' ? payload.duration : undefined;
      onEvent({
        type: 'usage',
        ...(usage ? { usage } : {}),
        ...(durationMs != null ? { durationMs } : {}),
      });
      return;
    }

    // Turn-level failure.
    if (isRecord(payload.error)) {
      const err = payload.error;
      const message =
        typeof err.message === 'string' && err.message.length > 0
          ? err.message
          : 'zcode turn failed';
      const raw = typeof err.detail === 'string' ? err.detail : stringifyContent(err);
      onEvent({ type: 'error', message, raw });
      return;
    }

    // Turn start: reset per-turn state so thinking_start fires once per turn.
    if ('turnNumber' in payload && 'queryId' in payload) {
      startTurn();
      return;
    }

    // Only the post-turn generated title is useful; the first_input title just
    // echoes the user's prompt.
    if (typeof payload.title === 'string' && payload.source === 'generated') {
      onEvent({ type: 'conversation_title', title: payload.title });
      return;
    }

    // Everything else (per-iteration turn-result, model-request telemetry with
    // headers, iteration markers, first_input title) is intentionally dropped.
  }

  function handleStateUpdated(params: JsonRecord) {
    switch (params.reason) {
      case 'prompt_started':
        startTurn();
        onEvent({ type: 'status', label: 'running' });
        return;
      case 'prompt_completed':
        onEvent({ type: 'status', label: 'completed' });
        return;
      case 'prompt_failed':
        // The human-readable error already arrived as an `error` payload; this
        // is just the terminal status transition.
        onEvent({ type: 'status', label: 'failed' });
        return;
      default:
        // model_provider_upserted / workspace_default_model_changed /
        // mode_changed: config noise, not stream content.
        return;
    }
  }

  function handleFrame(frame: unknown) {
    if (!isRecord(frame)) return;
    const params = isRecord(frame.params) ? frame.params : undefined;
    if (frame.method === 'session/event') {
      if (params && isRecord(params.payload)) handlePayload(params.payload);
      return;
    }
    if (frame.method === 'state.updated') {
      if (params) handleStateUpdated(params);
      return;
    }
    // Responses and server→client requests are not stream content.
  }

  return { handleFrame };
}
