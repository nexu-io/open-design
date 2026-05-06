// @ts-nocheck
/**
 * Parses Qoder CLI's `--output-format stream-json` JSONL stream into the
 * small event set consumed by the chat UI. Qoder's top-level records are
 * wrapper objects (`system`, `assistant`, `result`) with adapter-specific
 * fields, so keep this parser separate from Claude/Codex-compatible streams.
 */

function stringifyContent(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function textFromContentBlock(block) {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'text' && typeof block.text === 'string') return block.text;
  if (typeof block.text === 'string') return block.text;
  return '';
}

export function createQoderStreamHandler(onEvent) {
  let buffer = '';
  let emittedThinkingStart = false;

  function handleObject(obj, rawLine) {
    if (!obj || typeof obj !== 'object') return;

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

    if (obj.type === 'assistant' && obj.message) {
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
          block &&
          typeof block === 'object' &&
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
        onEvent({ type: 'raw', line: rawLine });
      }
      return;
    }

    if (obj.type === 'result') {
      onEvent({
        type: 'usage',
        usage: obj.usage ?? null,
        modelUsage: obj.modelUsage ?? undefined,
        costUsd: obj.total_cost_usd ?? null,
        durationMs: typeof obj.duration_ms === 'number' ? obj.duration_ms : null,
        stopReason: obj.stop_reason ?? null,
        isError: Boolean(obj.is_error),
      });
      return;
    }

    onEvent({ type: 'raw', line: rawLine });
  }

  function handleLine(line) {
    try {
      handleObject(JSON.parse(line), line);
    } catch {
      onEvent({ type: 'raw', line });
    }
  }

  function feed(chunk) {
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
