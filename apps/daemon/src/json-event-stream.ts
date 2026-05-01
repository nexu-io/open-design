// @ts-nocheck
function safeParseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringifyContent(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatOpenCodeUsage(tokens) {
  if (!tokens || typeof tokens !== 'object') return null;
  const usage = {};
  if (typeof tokens.input === 'number') usage.input_tokens = tokens.input;
  if (typeof tokens.output === 'number') usage.output_tokens = tokens.output;
  if (typeof tokens.reasoning === 'number') usage.thought_tokens = tokens.reasoning;
  if (tokens.cache && typeof tokens.cache === 'object') {
    if (typeof tokens.cache.read === 'number') usage.cached_read_tokens = tokens.cache.read;
    if (typeof tokens.cache.write === 'number') usage.cached_write_tokens = tokens.cache.write;
  }
  return Object.keys(usage).length > 0 ? usage : null;
}

function handleOpenCodeEvent(obj, onEvent, state) {
  if (!obj || typeof obj !== 'object') return false;
  const part = obj.part && typeof obj.part === 'object' ? obj.part : {};

  if (obj.type === 'step_start') {
    onEvent({ type: 'status', label: 'running' });
    return true;
  }

  if (obj.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
    onEvent({ type: 'text_delta', delta: part.text });
    return true;
  }

  if (obj.type === 'tool_use' && typeof part.tool === 'string' && typeof part.callID === 'string') {
    const statePart = part.state && typeof part.state === 'object' ? part.state : null;
    const key = `${obj.sessionID || 'session'}:${part.callID}`;
    if (!state.openCodeToolUses.has(key)) {
      state.openCodeToolUses.add(key);
      onEvent({
        type: 'tool_use',
        id: part.callID,
        name: part.tool,
        input: safeParseJson(statePart?.input) ?? statePart?.input ?? null,
      });
    }
    if (statePart?.status === 'completed') {
      onEvent({
        type: 'tool_result',
        toolUseId: part.callID,
        content: stringifyContent(statePart.output),
        isError: false,
      });
    }
    return true;
  }

  if (obj.type === 'step_finish') {
    const usage = formatOpenCodeUsage(part.tokens);
    if (usage) {
      onEvent({
        type: 'usage',
        usage,
        costUsd: typeof part.cost === 'number' ? part.cost : undefined,
      });
    }
    return true;
  }

  if (obj.type === 'error') {
    const message =
      (obj.error && typeof obj.error === 'object' && obj.error.data?.message) ||
      (obj.error && typeof obj.error === 'object' && obj.error.name) ||
      'OpenCode error';
    onEvent({ type: 'raw', line: stringifyContent({ type: 'error', message }) });
    return true;
  }

  return false;
}

function handleGeminiEvent(obj, onEvent) {
  if (!obj || typeof obj !== 'object') return false;

  if (obj.type === 'init') {
    onEvent({
      type: 'status',
      label: 'initializing',
      model: typeof obj.model === 'string' ? obj.model : undefined,
    });
    return true;
  }

  if (
    obj.type === 'message' &&
    obj.role === 'assistant' &&
    typeof obj.content === 'string' &&
    obj.content.length > 0
  ) {
    onEvent({ type: 'text_delta', delta: obj.content });
    return true;
  }

  if (obj.type === 'result' && obj.stats && typeof obj.stats === 'object') {
    const usage = {};
    if (typeof obj.stats.input_tokens === 'number') usage.input_tokens = obj.stats.input_tokens;
    if (typeof obj.stats.output_tokens === 'number') usage.output_tokens = obj.stats.output_tokens;
    if (typeof obj.stats.cached === 'number') usage.cached_read_tokens = obj.stats.cached;
    onEvent({
      type: 'usage',
      usage,
      durationMs: typeof obj.stats.duration_ms === 'number' ? obj.stats.duration_ms : undefined,
    });
    return true;
  }

  return false;
}

function extractCursorText(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function emitCursorTextDelta(text, onEvent, state) {
  if (!state.cursorTextSoFar) {
    state.cursorTextSoFar = text;
    onEvent({ type: 'text_delta', delta: text });
    return;
  }
  if (text === state.cursorTextSoFar) {
    return;
  }
  if (text.startsWith(state.cursorTextSoFar)) {
    const delta = text.slice(state.cursorTextSoFar.length);
    if (delta) onEvent({ type: 'text_delta', delta });
    state.cursorTextSoFar = text;
    return;
  }
  state.cursorTextSoFar += text;
  onEvent({ type: 'text_delta', delta: text });
}

function handleCursorEvent(obj, onEvent, state) {
  if (!obj || typeof obj !== 'object') return false;

  if (obj.type === 'system' && obj.subtype === 'init') {
    onEvent({
      type: 'status',
      label: 'initializing',
      model: typeof obj.model === 'string' ? obj.model : undefined,
    });
    return true;
  }

  if (obj.type === 'assistant' && obj.message) {
    const text = extractCursorText(obj.message);
    if (!text) return false;
    if (typeof obj.timestamp_ms === 'number') {
      emitCursorTextDelta(text, onEvent, state);
      return true;
    }
    emitCursorTextDelta(text, onEvent, state);
    return true;
  }

  if (obj.type === 'result' && obj.usage && typeof obj.usage === 'object') {
    const usage = {};
    if (typeof obj.usage.inputTokens === 'number') usage.input_tokens = obj.usage.inputTokens;
    if (typeof obj.usage.outputTokens === 'number') usage.output_tokens = obj.usage.outputTokens;
    if (typeof obj.usage.cacheReadTokens === 'number') {
      usage.cached_read_tokens = obj.usage.cacheReadTokens;
    }
    if (typeof obj.usage.cacheWriteTokens === 'number') {
      usage.cached_write_tokens = obj.usage.cacheWriteTokens;
    }
    onEvent({
      type: 'usage',
      usage,
      durationMs: typeof obj.duration_ms === 'number' ? obj.duration_ms : undefined,
    });
    return true;
  }

  return false;
}

function handleCodexEvent(obj, onEvent, state) {
  if (!obj || typeof obj !== 'object') return false;

  if (obj.type === 'thread.started') {
    onEvent({ type: 'status', label: 'initializing' });
    return true;
  }

  if (obj.type === 'turn.started') {
    onEvent({ type: 'status', label: 'running' });
    return true;
  }

  if (obj.type === 'item.started' && obj.item && typeof obj.item === 'object') {
    const item = obj.item;
    if (item.type === 'command_execution' && typeof item.id === 'string') {
      if (!state.codexToolUses.has(item.id)) {
        state.codexToolUses.add(item.id);
        onEvent({
          type: 'tool_use',
          id: item.id,
          name: 'Bash',
          input: {
            command: typeof item.command === 'string' ? item.command : '',
          },
        });
      }
      return true;
    }
  }

  if (obj.type === 'item.completed' && obj.item && typeof obj.item === 'object') {
    const item = obj.item;
    if (item.type === 'command_execution' && typeof item.id === 'string') {
      if (!state.codexToolUses.has(item.id)) {
        state.codexToolUses.add(item.id);
        onEvent({
          type: 'tool_use',
          id: item.id,
          name: 'Bash',
          input: {
            command: typeof item.command === 'string' ? item.command : '',
          },
        });
      }
      onEvent({
        type: 'tool_result',
        toolUseId: item.id,
        content: stringifyContent(item.aggregated_output ?? ''),
        isError: typeof item.exit_code === 'number' ? item.exit_code !== 0 : item.status === 'failed',
      });
      return true;
    }
  }

  if (
    obj.type === 'item.completed' &&
    obj.item &&
    typeof obj.item === 'object' &&
    obj.item.type === 'agent_message' &&
    typeof obj.item.text === 'string' &&
    obj.item.text.length > 0
  ) {
    onEvent({ type: 'text_delta', delta: obj.item.text });
    return true;
  }

  if (obj.type === 'turn.completed' && obj.usage && typeof obj.usage === 'object') {
    const usage = {};
    if (typeof obj.usage.input_tokens === 'number') usage.input_tokens = obj.usage.input_tokens;
    if (typeof obj.usage.output_tokens === 'number') usage.output_tokens = obj.usage.output_tokens;
    if (typeof obj.usage.cached_input_tokens === 'number') {
      usage.cached_read_tokens = obj.usage.cached_input_tokens;
    }
    onEvent({ type: 'usage', usage });
    return true;
  }

  return false;
}

export function createJsonEventStreamHandler(kind, onEvent) {
  let buffer = '';
  const state = {
    cursorTextSoFar: '',
    openCodeToolUses: new Set(),
    codexToolUses: new Set(),
  };

  function handleLine(line) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      onEvent({ type: 'raw', line });
      return;
    }

    if (kind === 'opencode' && handleOpenCodeEvent(obj, onEvent, state)) return;
    if (kind === 'gemini' && handleGeminiEvent(obj, onEvent)) return;
    if (kind === 'cursor-agent' && handleCursorEvent(obj, onEvent, state)) return;
    if (kind === 'codex' && handleCodexEvent(obj, onEvent, state)) return;

    onEvent({ type: 'raw', line });
  }

  function feed(chunk) {
    buffer += chunk;
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
