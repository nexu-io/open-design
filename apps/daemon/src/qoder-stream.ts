/**
 * Parses Qoder CLI's `--output-format stream-json` JSONL stream into the
 * small event set consumed by the chat UI. Qoder's top-level records are
 * wrapper objects (`system`, `assistant`, `result`) with adapter-specific
 * fields, so keep this parser separate from Claude/Codex-compatible streams.
 */

import { Buffer } from 'node:buffer';

type JsonRecord = Record<string, unknown>;
type QoderEvent = Record<string, unknown>;
type QoderEventSink = (event: QoderEvent) => void;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object';
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function textFromContentBlock(block: unknown): string {
  if (!isRecord(block)) return '';
  if (block.type === 'text' && typeof block.text === 'string') return block.text;
  if (typeof block.text === 'string') return block.text;
  return '';
}

function messageFromError(error: unknown): string {
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unknown Qoder error';
}

function messageFromResult(obj: JsonRecord): string {
  if (typeof obj.error === 'string' && obj.error.length > 0) return obj.error;
  if (
    isRecord(obj.error) &&
    typeof obj.error.message === 'string' &&
    obj.error.message.length > 0
  ) {
    return obj.error.message;
  }
  if (typeof obj.message === 'string' && obj.message.length > 0) {
    return obj.message;
  }
  if (typeof obj.stop_reason === 'string' && obj.stop_reason.length > 0) {
    return `Qoder run failed: ${obj.stop_reason}`;
  }
  return 'Qoder run failed';
}

export function createQoderStreamHandler(onEvent: QoderEventSink) {
  let buffer = '';
  let emittedThinkingStart = false;

  function handleObject(obj: unknown, rawLine: string) {
    if (!isRecord(obj)) return;

    if (obj.type === 'system' && obj.subtype === 'init') {
      onEvent({
        type: 'status',
        label: 'initializing',
        model: typeof obj.model === 'string' ? obj.model : undefined,
        sessionId: typeof obj.session_id === 'string' ? obj.session_id : undefined,
        qodercliVersion:
          typeof obj.qodercli_version === 'string'
            ? obj.qodercli_version
            : undefined,
      });
      return;
    }

    if (obj.type === 'assistant' && isRecord(obj.message)) {
      const content = Array.isArray(obj.message.content)
        ? obj.message.content
        : [];
      let emittedText = false;
      for (const block of content) {
        const text = textFromContentBlock(block);
        if (text.length > 0) {
          emittedText = true;
          onEvent({ type: 'text_delta', delta: text });
          continue;
        }
        if (
          isRecord(block) &&
          block.type === 'thinking' &&
          typeof block.thinking === 'string' &&
          block.thinking.length > 0
        ) {
          if (!emittedThinkingStart) {
            emittedThinkingStart = true;
            onEvent({ type: 'thinking_start' });
          }
          onEvent({ type: 'thinking_delta', delta: block.thinking });
        }
      }
      if (!emittedText && typeof obj.message.content === 'string') {
        onEvent({ type: 'text_delta', delta: obj.message.content });
        emittedText = true;
      }
      if (obj.error && !emittedText) {
        onEvent({
          type: 'error',
          message: messageFromError(obj.error),
          raw: rawLine,
        });
      }
      return;
    }

    if (obj.type === 'result') {
      const isError = Boolean(obj.is_error);
      onEvent({
        type: 'usage',
        usage: obj.usage ?? null,
        modelUsage: obj.modelUsage ?? undefined,
        costUsd: obj.total_cost_usd ?? null,
        durationMs: typeof obj.duration_ms === 'number' ? obj.duration_ms : null,
        stopReason: obj.stop_reason ?? null,
        isError,
      });
      if (isError) {
        onEvent({
          type: 'error',
          message: messageFromResult(obj),
          raw: rawLine,
        });
      }
      return;
    }

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
    let nl;
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

  return { feed, flush };
}
