type JsonObject = Record<string, unknown>;
type StreamEvent = Record<string, unknown>;
type StreamEventHandler = (event: StreamEvent) => void;
type ParserKind = string;

type ParserState = {
  cursorTextSoFar: string;
  openCodeToolUses: Set<string>;
  codexToolUses: Set<string>;
  codexErrorEmitted: boolean;
  codexPreviousEventWasAgentMessage: boolean;
  codexLastAgentMessageEndedWithNewline: boolean;
};

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  thought_tokens?: number;
  cached_read_tokens?: number;
  cached_write_tokens?: number;
};

function isRecord(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function safeParseJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function parseJsonObjectsFromContent(value: string): JsonObject[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const direct = safeParseJson(trimmed);
  if (isRecord(direct)) return [direct];
  const objects: JsonObject[] = [];
  for (const line of trimmed.split(/\r?\n/u)) {
    const parsedLine = safeParseJson(line.trim());
    if (isRecord(parsedLine)) objects.push(parsedLine);
  }
  return objects;
}

function extractConnectorApiError(value: JsonObject): JsonObject | null {
  if (isRecord(value.error)) {
    if (typeof value.error.code === 'string') return value.error;
    if (isRecord(value.error.data) && isRecord(value.error.data.error)) {
      const wrappedError = value.error.data.error;
      if (typeof wrappedError.code === 'string') return wrappedError;
    }
  }
  return null;
}

function connectorToolSelectionErrorMessage(content: string): string | null {
  if (!content.includes('CONNECTOR_TOOL_NOT_FOUND')) return null;
  let error: JsonObject | null = null;
  for (const parsed of parseJsonObjectsFromContent(content)) {
    const parsedError = extractConnectorApiError(parsed);
    if (parsedError?.code === 'CONNECTOR_TOOL_NOT_FOUND') {
      error = parsedError;
      break;
    }
  }
  if (!error) return null;
  const details = isRecord(error.details) ? error.details : {};
  const connectorId = typeof details.connectorId === 'string' && details.connectorId
    ? details.connectorId
    : undefined;
  const toolName = typeof details.toolName === 'string' && details.toolName
    ? details.toolName
    : 'the requested connector tool';
  const target = connectorId
    ? `Connector tool ${toolName} is not allowed for connector ${connectorId}.`
    : `Connector tool ${toolName} is not allowed.`;
  return `${target} Re-list the connector catalog and choose one of the currently allowed read-only tools.`;
}

function extractErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const parsed = safeParseJson(value);
    if (parsed && typeof parsed === 'object') {
      return extractErrorMessage(parsed, value);
    }
    return value;
  }
  if (isRecord(value)) {
    if (typeof value.detail === 'string' && value.detail) return value.detail;
    if (typeof value.message === 'string' && value.message) {
      return extractErrorMessage(value.message, value.message);
    }
    if (typeof value.error === 'string' && value.error) return value.error;
    if (value.error && typeof value.error === 'object') {
      return extractErrorMessage(value.error, fallback);
    }
    if (value.data && typeof value.data === 'object') {
      const dataMessage = extractErrorMessage(value.data, '');
      if (dataMessage) return dataMessage;
    }
    if (typeof value.name === 'string' && value.name) return value.name;
  }
  return fallback;
}

function isRecoverableCodexReconnect(message: string): boolean {
  return (
    message.startsWith('Reconnecting...') &&
    (
      message.includes('timeout waiting for child process to exit') ||
      message.includes('stream disconnected before completion')
    )
  );
}

function formatOpenCodeUsage(tokens: unknown): Usage | null {
  if (!isRecord(tokens)) return null;
  const usage: Usage = {};
  if (typeof tokens.input === 'number') usage.input_tokens = tokens.input;
  if (typeof tokens.output === 'number') usage.output_tokens = tokens.output;
  if (typeof tokens.reasoning === 'number') usage.thought_tokens = tokens.reasoning;
  if (isRecord(tokens.cache)) {
    if (typeof tokens.cache.read === 'number') usage.cached_read_tokens = tokens.cache.read;
    if (typeof tokens.cache.write === 'number') usage.cached_write_tokens = tokens.cache.write;
  }
  return Object.keys(usage).length > 0 ? usage : null;
}

function handleOpenCodeEvent(obj: unknown, onEvent: StreamEventHandler, state: ParserState): boolean {
  if (!isRecord(obj)) return false;
  const part = isRecord(obj.part) ? obj.part : {};

  if (obj.type === 'step_start') {
    onEvent({ type: 'status', label: 'running' });
    return true;
  }

  if (obj.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
    onEvent({ type: 'text_delta', delta: part.text });
    return true;
  }

  if (obj.type === 'tool_use' && typeof part.tool === 'string' && typeof part.callID === 'string') {
    const statePart = isRecord(part.state) ? part.state : null;
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
    // OpenCode emits structured error frames on stdout (e.g. provider auth
    // failures, network errors, schema mismatches) and still exits 0. Surface
    // them as proper `error` events so server.ts's `sendAgentEvent` wrapper
    // can flip the run to `failed` and forward a visible SSE error to the
    // chat UI. Previously we downgraded these to `type:'raw'`, which is not
    // rendered as an assistant message — the run looked like a fast clean
    // success while the user actually got nothing back. See issue #691.
    //
    // Shape mirrors the qoder-stream contract (`{type, message, raw}`) so
    // the daemon's existing error-handling path recognises it without
    // further wiring.
    const message = extractErrorMessage(
      obj.error ?? obj.message,
      'OpenCode error',
    );
    onEvent({ type: 'error', message, raw: stringifyContent(obj) });
    return true;
  }

  return false;
}

function handleGeminiEvent(obj: unknown, onEvent: StreamEventHandler): boolean {
  if (!isRecord(obj)) return false;

  if (obj.type === 'init') {
    onEvent({
      type: 'status',
      label: 'initializing',
      model: typeof obj.model === 'string' ? obj.model : undefined,
    });
    return true;
  }

  if (obj.type === 'message' && obj.role === 'user') {
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

  if (
    obj.type === 'tool_use' &&
    typeof obj.tool_id === 'string' &&
    typeof obj.tool_name === 'string'
  ) {
    onEvent({
      type: 'tool_use',
      id: obj.tool_id,
      name: obj.tool_name,
      input: safeParseJson(obj.parameters) ?? obj.parameters ?? null,
    });
    return true;
  }

  if (obj.type === 'tool_result' && typeof obj.tool_id === 'string') {
    const error = isRecord(obj.error) ? obj.error : null;
    const errorMessage = error ? extractErrorMessage(error, '') : '';
    const output = typeof obj.output === 'string'
      ? obj.output
      : errorMessage || stringifyContent(obj.output);
    onEvent({
      type: 'tool_result',
      toolUseId: obj.tool_id,
      content: output,
      isError: obj.status === 'error' || Boolean(error),
    });
    return true;
  }

  if (obj.type === 'error') {
    const severity = typeof obj.severity === 'string' ? obj.severity.toLowerCase() : '';
    const message = extractErrorMessage(
      obj.message ?? obj.error,
      severity === 'warning' ? 'Gemini CLI warning' : 'Gemini CLI error',
    );
    if (severity === 'warning') {
      onEvent({ type: 'status', label: 'warning', detail: message });
    } else {
      onEvent({ type: 'error', message, raw: stringifyContent(obj) });
    }
    return true;
  }

  if (obj.type === 'result') {
    if (obj.status === 'error' || isRecord(obj.error)) {
      onEvent({
        type: 'error',
        message: extractErrorMessage(obj.error, 'Gemini CLI error'),
        raw: stringifyContent(obj),
      });
      return true;
    }
    if (!isRecord(obj.stats)) return true;
    const usage: Usage = {};
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

function extractCursorText(message: unknown): string {
  const content = isRecord(message) ? message.content : undefined;
  const blocks = Array.isArray(content) ? content : [];
  return blocks
    .filter((block): block is { type: 'text'; text: string } => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function emitCursorTextDelta(text: string, onEvent: StreamEventHandler, state: ParserState): void {
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

function handleCursorEvent(obj: unknown, onEvent: StreamEventHandler, state: ParserState): boolean {
  if (!isRecord(obj)) return false;

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

  if (obj.type === 'result' && isRecord(obj.usage)) {
    const usage: Usage = {};
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

function handleCodexEvent(obj: unknown, onEvent: StreamEventHandler, state: ParserState): boolean {
  if (!isRecord(obj)) return false;

if (obj.type === 'error') {
  const message = extractErrorMessage(obj.message ?? obj.error, 'Codex error');
  // Reconnecting events are recoverable — treat as status warning, not fatal
  if (isRecoverableCodexReconnect(message)) {
    onEvent({ type: 'status', label: message });
    return true;
  }
  if (!state.codexErrorEmitted) {
    state.codexErrorEmitted = true;
    onEvent({ type: 'error', message });
  }
  return true;
}

  if (obj.type === 'turn.failed') {
    if (!state.codexErrorEmitted) {
      state.codexErrorEmitted = true;
      onEvent({
        type: 'error',
        message: extractErrorMessage(obj.error ?? obj.message, 'Codex turn failed'),
      });
    }
    return true;
  }

  if (obj.type === 'thread.started') {
    onEvent({ type: 'status', label: 'initializing' });
    return true;
  }

  if (obj.type === 'turn.started') {
    state.codexPreviousEventWasAgentMessage = false;
    state.codexLastAgentMessageEndedWithNewline = false;
    onEvent({ type: 'status', label: 'running' });
    return true;
  }

  if (obj.type === 'item.started' && isRecord(obj.item)) {
    const item = obj.item;
    if (item.type === 'command_execution' && typeof item.id === 'string') {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
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

  if (obj.type === 'item.completed' && isRecord(obj.item)) {
    const item = obj.item;
    if (item.type === 'command_execution' && typeof item.id === 'string') {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
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
      const content = stringifyContent(item.aggregated_output ?? '');
      onEvent({
        type: 'tool_result',
        toolUseId: item.id,
        content,
        isError: typeof item.exit_code === 'number' ? item.exit_code !== 0 : item.status === 'failed',
      });
      const connectorToolError = connectorToolSelectionErrorMessage(content);
      if (connectorToolError && !state.codexErrorEmitted) {
        state.codexErrorEmitted = true;
        onEvent({ type: 'error', message: connectorToolError });
      }
      return true;
    }
  }

  if (
    obj.type === 'item.completed' &&
    isRecord(obj.item) &&
    obj.item.type === 'agent_message' &&
    typeof obj.item.text === 'string' &&
    obj.item.text.length > 0
  ) {
    const text = obj.item.text;
    const needsBoundary =
      state.codexPreviousEventWasAgentMessage &&
      !state.codexLastAgentMessageEndedWithNewline &&
      !text.startsWith('\n');
    const delta = needsBoundary ? `\n${text}` : text;
    onEvent({ type: 'text_delta', delta });
    state.codexPreviousEventWasAgentMessage = true;
    state.codexLastAgentMessageEndedWithNewline = text.endsWith('\n');
    return true;
  }

  if (obj.type === 'turn.completed' && isRecord(obj.usage)) {
    const usage: Usage = {};
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

export function createJsonEventStreamHandler(kind: ParserKind, onEvent: StreamEventHandler) {
  let buffer = '';
  const state: ParserState = {
    cursorTextSoFar: '',
    openCodeToolUses: new Set<string>(),
    codexToolUses: new Set<string>(),
    codexErrorEmitted: false,
    codexPreviousEventWasAgentMessage: false,
    codexLastAgentMessageEndedWithNewline: false,
  };

  function handleLine(line: string): void {
    let obj: unknown;
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

  function feed(chunk: string): void {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      handleLine(line);
    }
  }

  function flush(): void {
    const rem = buffer.trim();
    buffer = '';
    if (!rem) return;
    handleLine(rem);
  }

  return { feed, flush };
}
