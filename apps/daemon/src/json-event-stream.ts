type JsonObject = Record<string, unknown>;
type StreamEvent = Record<string, unknown>;
type StreamEventHandler = (event: StreamEvent) => void;
type ParserKind = string;

type ParserState = {
  cursorTextSoFar: string;
  cursorTurnStart: number;
  openCodeToolUses: Set<string>;
  codexToolUses: Set<string>;
  codexErrorEmitted: boolean;
  codexPreviousEventWasAgentMessage: boolean;
  codexLastAgentMessageEndedWithNewline: boolean;
  suppressNextArtifactText: boolean;
  suppressDuplicateArtifactText: boolean;
  artifactOpenCandidate: string;
  pendingArtifactText: string;
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

function handleGeminiEvent(obj: unknown, onEvent: StreamEventHandler, state: ParserState): boolean {
  if (!isRecord(obj)) return false;

  const isAssistantTextMessage =
    obj.type === 'message' &&
    obj.role === 'assistant' &&
    typeof obj.content === 'string' &&
    obj.content.length > 0;
  if (!isAssistantTextMessage) {
    flushPendingArtifactText(state, onEvent);
  }

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
    const delta = stripDuplicateArtifactText(obj.content, state);
    if (delta) onEvent({ type: 'text_delta', delta });
    return true;
  }

  if (
    obj.type === 'tool_use' &&
    typeof obj.tool_id === 'string' &&
    typeof obj.tool_name === 'string'
  ) {
    const input = safeParseJson(obj.parameters) ?? obj.parameters ?? null;
    if (obj.tool_name === 'write_todos') {
      const todoInput = todoWriteInputFromParsedValue(input);
      if (todoInput) {
        onEvent({
          type: 'tool_use',
          id: `${obj.tool_id}:todo-native`,
          name: 'TodoWrite',
          input: todoInput,
        });
        return true;
      }
    }
    if (isFileWriteToolUse(obj.tool_name, input)) {
      state.suppressNextArtifactText = true;
    }
    onEvent({
      type: 'tool_use',
      id: obj.tool_id,
      name: obj.tool_name,
      input,
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

function handleKimiEvent(obj: unknown, onEvent: StreamEventHandler): boolean {
  if (!isRecord(obj)) return false;

  if (obj.role === 'assistant' && Array.isArray(obj.tool_calls)) {
    for (const rawCall of obj.tool_calls) {
      const call = isRecord(rawCall) ? rawCall : null;
      const fn = isRecord(call?.function) ? call.function : null;
      const id = typeof call?.id === 'string' && call.id.trim()
        ? call.id.trim()
        : null;
      const name = typeof fn?.name === 'string' && fn.name.trim()
        ? fn.name.trim()
        : null;
      if (!id || !name) continue;
      const input = safeParseJson(fn?.arguments) ?? fn?.arguments ?? null;
      onEvent({ type: 'tool_use', id, name, input });
    }
    return true;
  }

  if (
    obj.role === 'tool' &&
    typeof obj.tool_call_id === 'string' &&
    obj.tool_call_id.trim()
  ) {
    onEvent({
      type: 'tool_result',
      toolUseId: obj.tool_call_id.trim(),
      content: stringifyContent(obj.content),
      isError: false,
    });
    return true;
  }

  if (
    obj.role === 'assistant' &&
    typeof obj.content === 'string' &&
    obj.content.length > 0
  ) {
    onEvent({ type: 'text_delta', delta: obj.content });
    return true;
  }

  if (obj.role === 'meta' && obj.type === 'session.resume_hint') {
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

function normalizeTodoStatus(value: unknown): string {
  const status = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[-\s]+/g, '_')
    : '';
  if (status === 'completed' || status === 'complete' || status === 'done' || status.startsWith('completed')) {
    return 'completed';
  }
  if (status === 'in_progress' || status === 'doing' || status === 'active' || status.startsWith('in_progress')) {
    return 'in_progress';
  }
  if (
    status === 'stopped' ||
    status === 'failed' ||
    status === 'blocked' ||
    status === 'canceled' ||
    status === 'cancelled' ||
    status.startsWith('stopped') ||
    status.startsWith('failed') ||
    status.startsWith('blocked') ||
    status.startsWith('canceled') ||
    status.startsWith('cancelled')
  ) {
    return 'stopped';
  }
  return 'pending';
}

function todoWriteInputFromItems(items: unknown): JsonObject | null {
  if (!Array.isArray(items)) return null;
  const todos = items
    .map((raw): JsonObject | null => {
      if (!isRecord(raw)) return null;
      const content = typeof raw.content === 'string'
        ? raw.content
        : typeof raw.label === 'string'
          ? raw.label
          : typeof raw.description === 'string'
            ? raw.description
            : typeof raw.text === 'string'
              ? raw.text
              : '';
      if (!content) return null;
      return {
        content,
        status: raw.completed === true
          ? 'completed'
          : normalizeTodoStatus(raw.status),
      };
    })
    .filter((todo): todo is JsonObject => todo !== null);
  return todos.length > 0 ? { todos } : null;
}

function todoWriteInputFromParsedValue(value: unknown): JsonObject | null {
  if (Array.isArray(value)) return todoWriteInputFromItems(value);
  if (!isRecord(value)) return null;
  if (Array.isArray(value.todos)) return todoWriteInputFromItems(value.todos);
  if (Array.isArray(value.todo)) return todoWriteInputFromItems(value.todo);
  return null;
}

function stripDuplicateArtifactText(text: string, state: ParserState): string {
  if (
    !state.suppressNextArtifactText &&
    !state.suppressDuplicateArtifactText &&
    state.artifactOpenCandidate.length === 0
  ) {
    return text;
  }
  const openTag = '<artifact';
  const current = `${state.artifactOpenCandidate}${text}`;
  state.artifactOpenCandidate = '';
  if (state.suppressDuplicateArtifactText) {
    const closeIndex = current.indexOf('</artifact>');
    if (closeIndex === -1) return '';
    state.suppressDuplicateArtifactText = false;
    state.suppressNextArtifactText = false;
    return stripDuplicateArtifactText(current.slice(closeIndex + '</artifact>'.length), state);
  }
  const openIndex = current.indexOf(openTag);
  if (openIndex === -1) {
    const candidateLength = artifactOpenCandidateLength(current, openTag);
    if (state.suppressNextArtifactText && candidateLength > 0) {
      state.artifactOpenCandidate = current.slice(-candidateLength);
      return current.slice(0, -candidateLength);
    }
    if (state.suppressNextArtifactText) {
      state.suppressNextArtifactText = false;
      return current;
    }
    return current;
  }
  state.suppressDuplicateArtifactText = true;
  state.suppressNextArtifactText = false;
  const prefix = `${state.pendingArtifactText}${current.slice(0, openIndex)}`;
  state.pendingArtifactText = '';
  return `${prefix}${stripDuplicateArtifactText(current.slice(openIndex), state)}`;
}

function artifactOpenCandidateLength(text: string, openTag: string): number {
  const max = Math.min(openTag.length - 1, text.length);
  for (let len = max; len > 0; len -= 1) {
    if (openTag.startsWith(text.slice(-len))) return len;
  }
  return 0;
}

function flushPendingArtifactText(state: ParserState, onEvent: StreamEventHandler): void {
  const delta = `${state.pendingArtifactText}${state.artifactOpenCandidate}`;
  if (!delta) return;
  state.pendingArtifactText = '';
  state.artifactOpenCandidate = '';
  state.suppressNextArtifactText = false;
  onEvent({ type: 'text_delta', delta });
}

function isFileWriteToolUse(toolName: string, input: unknown): boolean {
  if (!isRecord(input)) return false;
  const path = typeof input.file_path === 'string'
    ? input.file_path
    : typeof input.path === 'string'
      ? input.path
      : '';
  const writesFile = toolName === 'write_file' ||
    toolName === 'write' ||
    toolName === 'replace' ||
    toolName === 'edit';
  if (!writesFile) return false;
  if (/\.(html|htm|css|js|jsx|ts|tsx|md)$/iu.test(path)) return true;
  return typeof input.content === 'string' || typeof input.new_string === 'string';
}

function codexTodoListInput(item: JsonObject): JsonObject | null {
  if (item.type !== 'todo_list' || !Array.isArray(item.items)) return null;
  return todoWriteInputFromItems(item.items);
}

function emitCodexTodoList(item: JsonObject, onEvent: StreamEventHandler): boolean {
  if (typeof item.id !== 'string') return false;
  const input = codexTodoListInput(item);
  if (!input) return false;
  onEvent({
    type: 'tool_use',
    id: item.id,
    name: 'TodoWrite',
    input,
  });
  return true;
}

function emitCursorTextDelta(text: string, onEvent: StreamEventHandler, state: ParserState): void {
  // Timestamped assistant events WITHOUT `model_call_id` are cursor-agent's
  // real-time incremental deltas (`--stream-partial-output`): the final turn
  // text is the in-order concatenation of every such delta. Emit each one
  // verbatim — do NOT dedupe by content. Legitimately repeated deltas
  // (`"ha"`, `"ha"` -> `"haha"`) or a delta that happens to be a prefix of
  // earlier text are real content, not duplicates; content-based prefix or
  // equality checks would silently drop them. Duplicate suppression and
  // dropped-chunk recovery belong to the buffered terminal replay paths
  // (`model_call_id` and no-timestamp events) via reconcileCursorTurnReplay.
  if (!text) return;
  state.cursorTextSoFar += text;
  onEvent({ type: 'text_delta', delta: text });
}

/**
 * Reconcile a Cursor terminal replay against the text already emitted for the
 * CURRENT turn. A terminal replay (either a `model_call_id` message or a
 * non-timestamped final assistant message) carries the full text for the
 * current turn only, so it must be compared against
 * `cursorTextSoFar.slice(cursorTurnStart)` — NOT the whole cross-turn buffer,
 * which would miss the current-turn prefix on later turns and re-append the
 * whole replay (duplicate output like "secondsecond turn").
 *
 * Only a verified prefix permits suffix recovery: if the emitted turn text is
 * a prefix of the replay (including the empty case where no chunk arrived),
 * emit the missing suffix. On divergence (a non-final chunk was dropped, so
 * the emitted text is not a prefix) leave the append-only stream untouched
 * rather than duplicate already-shown text. Always advances the turn boundary.
 */
function reconcileCursorTurnReplay(text: string, onEvent: StreamEventHandler, state: ParserState): void {
  const emittedTurn = state.cursorTextSoFar.slice(state.cursorTurnStart);
  if (text && text !== emittedTurn && text.startsWith(emittedTurn)) {
    const suffix = text.slice(emittedTurn.length);
    if (suffix) onEvent({ type: 'text_delta', delta: suffix });
    state.cursorTextSoFar += suffix;
  }
  state.cursorTurnStart = state.cursorTextSoFar.length;
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
    // Cursor sends a final assistant message that replays the full text for
    // the current turn — either tagged with `model_call_id`, or (fallback)
    // as a non-timestamped terminal assistant message. Both are reconciled
    // against the current turn's emitted text via reconcileCursorTurnReplay.
    if (typeof obj.model_call_id === 'string') {
      const text = extractCursorText(obj.message);
      reconcileCursorTurnReplay(text, onEvent, state);
      return true;
    }
    const text = extractCursorText(obj.message);
    if (!text) return false;
    if (typeof obj.timestamp_ms === 'number') {
      // Incremental streaming chunk within a turn — accumulate as usual.
      emitCursorTextDelta(text, onEvent, state);
      return true;
    }
    // Non-timestamped final assistant message: a terminal replay that marks a
    // turn boundary. Reconcile against the current turn (not the whole
    // cross-turn buffer) so later fallback-terminated turns do not duplicate
    // output, then advance the turn boundary.
    reconcileCursorTurnReplay(text, onEvent, state);
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
    onEvent({ type: 'status', label: 'thinking' });
    return true;
  }

  if (obj.type === 'item.started' && isRecord(obj.item)) {
    const item = obj.item;
    if (emitCodexTodoList(item, onEvent)) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      return true;
    }
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

  if (obj.type === 'item.updated' && isRecord(obj.item)) {
    const item = obj.item;
    if (emitCodexTodoList(item, onEvent)) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      return true;
    }
  }

  if (obj.type === 'item.completed' && isRecord(obj.item)) {
    const item = obj.item;
    if (emitCodexTodoList(item, onEvent)) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      return true;
    }
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
    if (typeof obj.usage.reasoning_output_tokens === 'number') {
      usage.thought_tokens = obj.usage.reasoning_output_tokens;
    }
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
    cursorTurnStart: 0,
    openCodeToolUses: new Set<string>(),
    codexToolUses: new Set<string>(),
    codexErrorEmitted: false,
    codexPreviousEventWasAgentMessage: false,
    codexLastAgentMessageEndedWithNewline: false,
    suppressNextArtifactText: false,
    suppressDuplicateArtifactText: false,
    artifactOpenCandidate: '',
    pendingArtifactText: '',
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
    if (kind === 'gemini' && handleGeminiEvent(obj, onEvent, state)) return;
    if (kind === 'kimi' && handleKimiEvent(obj, onEvent)) return;
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
    if (rem) handleLine(rem);
    flushPendingArtifactText(state, onEvent);
  }

  return { feed, flush };
}
