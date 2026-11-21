/**
 * Parses Grok Build CLI `--output-format streaming-json` NDJSON into the
 * small event set consumed by the chat UI.
 *
 * Observed event shape (Grok CLI ~0.2.x):
 *   {"type":"thought","data":"..."}
 *   {"type":"text","data":"..."}
 *   {"type":"end","stopReason":"EndTurn","sessionId":"...","usage":{...},...}
 *   {"type":"error","message":"..."}
 *
 * Grok does not currently emit tool_use / file-write frames on this stream.
 * Design artifacts rely on reconstructed assistant text (plain-stream
 * `<artifact>` extraction) and/or files the CLI writes into the project cwd.
 */

type JsonRecord = Record<string, unknown>;
type GrokEvent = Record<string, unknown>;
type GrokEventSink = (event: GrokEvent) => void;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function dataString(obj: JsonRecord): string {
  if (typeof obj.data === 'string') return obj.data;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.delta === 'string') return obj.delta;
  return '';
}

export function createGrokStreamHandler(onEvent: GrokEventSink) {
  let buffer = '';
  let reconstructedText = '';
  let emittedThinkingStart = false;
  let emittedThinkingEnd = false;

  function handleObject(obj: unknown, rawLine: string) {
    if (!isRecord(obj)) return;
    const type = typeof obj.type === 'string' ? obj.type : '';

    if (type === 'thought') {
      const delta = dataString(obj);
      if (!delta) return;
      if (!emittedThinkingStart) {
        emittedThinkingStart = true;
        onEvent({ type: 'thinking_start' });
      }
      onEvent({ type: 'thinking_delta', delta });
      return;
    }

    if (type === 'text') {
      const delta = dataString(obj);
      if (!delta) return;
      if (emittedThinkingStart && !emittedThinkingEnd) {
        emittedThinkingEnd = true;
        onEvent({ type: 'thinking_end' });
      }
      reconstructedText += delta;
      onEvent({ type: 'text_delta', delta });
      return;
    }

    if (type === 'end') {
      if (emittedThinkingStart && !emittedThinkingEnd) {
        emittedThinkingEnd = true;
        onEvent({ type: 'thinking_end' });
      }
      const sessionId =
        typeof obj.sessionId === 'string' && obj.sessionId.length > 0
          ? obj.sessionId
          : typeof obj.session_id === 'string' && obj.session_id.length > 0
            ? obj.session_id
            : undefined;
      if (sessionId) {
        // Capture-style resume: server.ts reads status.sessionId when
        // capturesSessionIdFromStream is set on the runtime def.
        onEvent({ type: 'status', label: 'completed', sessionId });
      }
      onEvent({
        type: 'usage',
        usage: obj.usage ?? null,
        modelUsage: obj.modelUsage ?? undefined,
        costUsd: obj.total_cost_usd ?? null,
        stopReason: obj.stopReason ?? obj.stop_reason ?? null,
        numTurns: typeof obj.num_turns === 'number' ? obj.num_turns : null,
        requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
        isError: false,
      });
      return;
    }

    if (type === 'error') {
      const message =
        typeof obj.message === 'string' && obj.message.length > 0
          ? obj.message
          : typeof obj.error === 'string' && obj.error.length > 0
            ? obj.error
            : 'Grok Build stream error';
      onEvent({ type: 'error', message, raw: rawLine });
      return;
    }

    // Forward-compatible: ignore max_turns_reached, auto_compact_*, etc.
    onEvent({ type: 'raw', line: rawLine });
  }

  function handleLine(line: string) {
    try {
      handleObject(JSON.parse(line), line);
    } catch {
      onEvent({ type: 'raw', line });
    }
  }

  function feed(chunk: unknown) {
    buffer += stringifyContent(chunk);
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      handleLine(line);
    }
  }

  function flush() {
    const rem = buffer.trim();
    buffer = '';
    if (!rem) return;
    handleLine(rem);
  }

  function getReconstructedText(): string {
    return reconstructedText;
  }

  return { feed, flush, getReconstructedText };
}
