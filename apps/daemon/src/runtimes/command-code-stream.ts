/**
 * Parses Command Code's `--output-format json` NDJSON stream into the small
 * event set consumed by the chat UI.
 *
 * Every line is one JSON object in one of two shapes: a `{"type":"event",
 * "event":{…}}` frame while the run advances, and a single terminal
 * `{"type":"result",…}` frame carrying the final text, the session id, the
 * usage totals and the outcome. The frame vocabulary below was read off the
 * installed CLI (1.69.0) rather than the published table, which documents only
 * the result frame and one example frame:
 *
 *   run_start           {sessionId}                      → status (session id)
 *   model_request_start {model}                          → status (model, once)
 *   text_delta          {delta}                          → text_delta
 *   tool_queued         {toolCallId,toolName,input}      → tool_use
 *   tool_running        {toolCallId,toolName,description}
 *   tool_completed      {toolCallId,toolName,result:[…]} → tool_result
 *   tool_errored        {toolCallId,toolName,…}          → tool_result (isError)
 *   result              {subtype,sessionId,stopReason,usage,durationMs,finalText}
 *
 * Three properties of the real stream shape this parser:
 *
 *  - The assistant text arrives BOTH as `text_delta` frames and, repeated in
 *    full, in the terminal result frame. Emitting both would print the answer
 *    twice, so `finalText` is used only when no delta was streamed at all.
 *  - `message_update` repeats the ENTIRE message after every delta, and
 *    `message_end` / `run_end` carry it again (the last one alongside the whole
 *    session state). Those frames are dropped rather than stored as `raw`
 *    events — kept verbatim they grow quadratically, and they say nothing the
 *    delta stream and the result frame do not already say.
 *  - Tool calls are announced by `tool_queued` WITH their input (that is where
 *    a row's file path or command comes from); `tool_running` follows with a
 *    `description` that may be null. A call with no terminal frame is settled
 *    by `flush()`, so a stopped or crashed run cannot leave a row spinning
 *    forever — that fallback attaches no `completedAt`, because a stopwatch
 *    running to end-of-turn would be a fabricated duration.
 *
 * Unknown frame types stay forward-compatible: they become bounded `raw`
 * events, which nothing renders, so a frame this parser has never seen can
 * never corrupt the transcript the way a mis-mapped one could.
 */

import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

import { boundedRawAgentEvent } from './run-event-payload-budget.js';

type JsonRecord = Record<string, unknown>;
type CommandCodeEvent = Record<string, unknown>;
type CommandCodeEventSink = (event: CommandCodeEvent) => void;

/**
 * Frames this parser recognises and deliberately does not turn into UI events.
 * Each one is either the CLI's own bookkeeping or a cumulative repeat of
 * content already emitted (see the module docblock); keeping them would only
 * bloat the stored transcript. Anything not in this set and not mapped below is
 * forwarded as a bounded `raw` event instead, so a future frame type is
 * preserved for debugging rather than silently swallowed.
 */
const UNRENDERED_FRAME_TYPES = new Set([
  'turn_start',
  'turn_end',
  'message_start',
  'message_update',
  'message_end',
  'model_request_end',
  'model_trace',
  'run_end',
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Decode one stdout chunk, given a decoder that carries state between chunks.
 *
 * The decoder is the whole point. A chunk boundary lands wherever the pipe
 * decides, which for any non-ASCII output means it will eventually land in the
 * middle of a multi-byte character — `Buffer.toString('utf8')` turns that
 * half-character into U+FFFD on both sides and the character is gone for good.
 * `StringDecoder` holds the incomplete bytes until the next chunk completes
 * them, which is the same guarantee the other runtimes get for free from
 * `child.stdout.setEncoding('utf8')`.
 */
function stringifyContent(value: unknown, decoder: StringDecoder): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return decoder.write(value);
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * The input a tool row renders from. `tool_queued` carries the real arguments,
 * so they pass through as-is; the `description` a `tool_running` frame may add
 * (null on the verified build, and null is not forwarded) is the fallback that
 * `toolTitle()` reads first. The daemon's own `boundPersistedAgentEvent` caps
 * `tool_use.input` centrally — a ceiling, not a reason to forward an unbounded
 * frame.
 */
function toolInputFromFrame(frame: JsonRecord): JsonRecord {
  const input = isRecord(frame.input) ? { ...frame.input } : {};
  const description = readNonEmptyString(frame.description);
  if (description && input.description === undefined) input.description = description;
  return input;
}

/**
 * Text a terminal tool frame reports. `tool_completed` carries an array of
 * content blocks; the error frames are not pinned to one shape, so a plain
 * string and a nested `{text}` / `{message}` are read before giving up.
 */
function toolResultText(frame: JsonRecord): string {
  const result = frame.result;
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result
      .map((block) => (isRecord(block) ? readNonEmptyString(block.text) ?? '' : ''))
      .filter((text) => text.length > 0)
      .join('\n');
  }
  if (isRecord(result)) {
    const nested = readNonEmptyString(result.text) ?? readNonEmptyString(result.message);
    if (nested) return nested;
  }
  return readNonEmptyString(frame.error) ?? readNonEmptyString(frame.message) ?? '';
}

/**
 * Usage as the daemon's `usage` event declares it. Command Code reports the AI
 * SDK shape (`inputTokens` / `outputTokens`); snake_case is accepted as well so
 * a build that switches spelling keeps reporting tokens instead of silently
 * dropping them.
 */
function usageFromResult(result: JsonRecord): { input_tokens?: number; output_tokens?: number } | null {
  const usage = isRecord(result.usage) ? result.usage : null;
  if (!usage) return null;
  const input = readFiniteNumber(usage.input_tokens ?? usage.inputTokens ?? usage.promptTokens);
  const output = readFiniteNumber(usage.output_tokens ?? usage.outputTokens ?? usage.completionTokens);
  if (input === null && output === null) return null;
  return {
    ...(input !== null ? { input_tokens: input } : {}),
    ...(output !== null ? { output_tokens: output } : {}),
  };
}

/**
 * The failure sentence for a `subtype: "error"` result. `error` carries the
 * machine-readable copy, but its shape is not pinned, so a string, a
 * `{message}` object and the result's own `message` are all read before
 * falling back to a generic sentence.
 */
function resultErrorMessage(result: JsonRecord): string {
  const error = result.error;
  const direct = readNonEmptyString(error);
  if (direct) return direct;
  if (isRecord(error)) {
    const nested = readNonEmptyString(error.message);
    if (nested) return nested;
  }
  const message = readNonEmptyString(result.message);
  if (message) return message;
  return 'Command Code reported a failed run.';
}

export function createCommandCodeStreamHandler(onEvent: CommandCodeEventSink) {
  let buffer = '';
  /*
   * Per-handler, never module-level: the decoder's whole job is to remember the
   * trailing bytes of the previous chunk, so two concurrent runs sharing one
   * would splice each other's characters together.
   */
  const decoder = new StringDecoder('utf8');
  // Calls announced but not yet settled. `announcedToolCallIds` dedupes the
  // queued/running pair; the open set is what `flush()` closes.
  const announcedToolCallIds = new Set<string>();
  const openToolCallIds = new Set<string>();
  let fallbackToolSeq = 0;
  // Facts already reported, so the terminal result frame does not repeat them
  // (see the module docblock).
  let sawTextDelta = false;
  let sawSessionId = false;
  let sawModel = false;

  function announceToolCall(toolCallId: string, name: string, input: JsonRecord) {
    announcedToolCallIds.add(toolCallId);
    openToolCallIds.add(toolCallId);
    onEvent({
      type: 'tool_use',
      id: toolCallId,
      name,
      input,
      // The frame is the start: the CLI emits it as the call is dispatched.
      startedAt: Date.now(),
    });
  }

  function settleToolCall(frame: JsonRecord, isError: boolean) {
    const toolCallId = readNonEmptyString(frame.toolCallId);
    if (!toolCallId) return;
    // A terminal frame for a call that was never announced still deserves a
    // row, so its result is not orphaned against nothing.
    if (!announcedToolCallIds.has(toolCallId)) {
      announceToolCall(
        toolCallId,
        readNonEmptyString(frame.toolName) ?? 'tool',
        toolInputFromFrame(frame),
      );
    }
    openToolCallIds.delete(toolCallId);
    onEvent({
      type: 'tool_result',
      toolUseId: toolCallId,
      content: toolResultText(frame),
      isError,
      completedAt: Date.now(),
    });
  }

  function handleResult(result: JsonRecord, rawLine: string) {
    // Session first: the id is the resume handle for the next turn, and it must
    // reach the daemon's capture path even when the run itself failed.
    const sessionId = readNonEmptyString(result.sessionId);
    if (sessionId && !sawSessionId) {
      sawSessionId = true;
      onEvent({ type: 'status', label: 'initializing', sessionId });
    }
    const finalText = sawTextDelta ? null : readNonEmptyString(result.finalText);
    if (finalText) {
      onEvent({ type: 'text_delta', delta: finalText });
    }
    onEvent({
      type: 'usage',
      usage: usageFromResult(result),
      durationMs: readFiniteNumber(result.durationMs),
      stopReason: readNonEmptyString(result.stopReason),
      isError: result.subtype === 'error',
    });
    if (result.subtype === 'error') {
      onEvent({ type: 'error', message: resultErrorMessage(result), raw: rawLine });
      return;
    }
    if (result.subtype === 'max_turns') {
      onEvent({
        type: 'error',
        message:
          'Command Code reached its --max-turns cap before finishing this turn. '
          + 'Send a smaller request or split the task.',
        raw: rawLine,
      });
    }
  }

  function handleFrame(frame: JsonRecord, rawLine: string) {
    switch (readNonEmptyString(frame.type)) {
      case 'run_start': {
        const sessionId = readNonEmptyString(frame.sessionId);
        if (sessionId) {
          sawSessionId = true;
          // Early capture matters: a run that dies mid-turn still leaves the
          // daemon a resumable session handle.
          onEvent({ type: 'status', label: 'initializing', sessionId });
        }
        return;
      }
      case 'model_request_start': {
        const model = readNonEmptyString(frame.model);
        if (model && !sawModel) {
          sawModel = true;
          // Once per run: the shared connection-test collector reads the
          // resolved model off a `status` event.
          onEvent({ type: 'status', label: 'initializing', model });
        }
        return;
      }
      case 'text_delta': {
        const delta = readNonEmptyString(frame.delta);
        if (delta) {
          sawTextDelta = true;
          onEvent({ type: 'text_delta', delta });
        }
        return;
      }
      case 'tool_queued': {
        const toolCallId = readNonEmptyString(frame.toolCallId)
          ?? `command-code-tool-${(fallbackToolSeq += 1)}`;
        if (announcedToolCallIds.has(toolCallId)) return;
        announceToolCall(
          toolCallId,
          readNonEmptyString(frame.toolName) ?? 'tool',
          toolInputFromFrame(frame),
        );
        return;
      }
      case 'tool_running': {
        const toolCallId = readNonEmptyString(frame.toolCallId)
          ?? `command-code-tool-${(fallbackToolSeq += 1)}`;
        // The queued frame already announced this call together with its
        // input; this one only adds a description, which is not a second row.
        if (announcedToolCallIds.has(toolCallId)) return;
        announceToolCall(
          toolCallId,
          readNonEmptyString(frame.toolName) ?? 'tool',
          toolInputFromFrame(frame),
        );
        return;
      }
      case 'tool_completed':
        settleToolCall(frame, false);
        return;
      case 'tool_errored':
        settleToolCall(frame, true);
        return;
      case 'result':
        handleResult(frame, rawLine);
        return;
      default: {
        const type = readNonEmptyString(frame.type);
        if (type && UNRENDERED_FRAME_TYPES.has(type)) return;
        onEvent(boundedRawAgentEvent(rawLine, frame));
      }
    }
  }

  function handleObject(obj: JsonRecord, rawLine: string) {
    if (obj.type === 'event' && isRecord(obj.event)) {
      handleFrame(obj.event, rawLine);
      return;
    }
    if (obj.type === 'result') {
      handleResult(obj, rawLine);
      return;
    }
    onEvent(boundedRawAgentEvent(rawLine, obj));
  }

  function handleLine(line: string) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) {
        handleObject(parsed, line);
        return;
      }
      onEvent(boundedRawAgentEvent(line, parsed));
    } catch {
      onEvent(boundedRawAgentEvent(line));
    }
  }

  function feed(chunk: unknown) {
    buffer += stringifyContent(chunk, decoder);
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      handleLine(line);
    }
  }

  function flush() {
    // Stream over: `end()` releases any bytes the decoder was still holding.
    // A truncated character at EOF is genuinely truncated and surfaces as
    // U+FFFD, which is the honest outcome; what matters is that it cannot
    // silently drop a line the parser would otherwise have seen.
    const rem = (buffer + decoder.end()).trim();
    buffer = '';
    if (rem) handleLine(rem);
    // Settle tool rows this stream can never complete (a cancelled or crashed
    // run). `content` is empty and no `completedAt` is attached: the call
    // happened, its output and end time are not ours to guess. Ordered after
    // the last line so a late frame still lands first.
    for (const toolCallId of openToolCallIds) {
      onEvent({ type: 'tool_result', toolUseId: toolCallId, content: '', isError: false });
    }
    openToolCallIds.clear();
  }

  return { feed, flush };
}
