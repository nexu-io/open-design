import {
  createOpenCodeRootTaskEvidenceCollector,
  type OpenCodeTaskTerminalCandidate,
} from './opencode-child-evidence.js';

type JsonObject = Record<string, unknown>;
type StreamEvent = Record<string, unknown>;
type StreamEventHandler = (event: StreamEvent) => void;
type ParserKind = string;

type ParserState = {
  cursorTextSoFar: string;
  cursorTurnStart: number;
  openCodeToolUses: Set<string>;
  openCodeToolResults: Set<string>;
  codexToolUses: Set<string>;
  codexErrorEmitted: boolean;
  codexPreviousEventWasAgentMessage: boolean;
  codexLastAgentMessageEndedWithNewline: boolean;
  // Per reasoning-item chars already emitted as thinking deltas, keyed by
  // item id. Codex replays the accumulated summary text on every lifecycle
  // event of the same item (started → updated → completed), so only the
  // unseen suffix may be re-emitted.
  codexReasoningEmittedByItem: Map<string, number>;
  codexReasoningEmittedAny: boolean;
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

function recoverableCodexReconnectProgress(
  message: string,
): { attempt: number; max: number } | null {
  if (
    !message.includes('timeout waiting for child process to exit') &&
    !message.includes('stream disconnected before completion')
  ) {
    return null;
  }
  const match = /^Reconnecting\.\.\.\s+(\d+)\/(\d+)\b/u.exec(message);
  if (!match) return null;
  const attempt = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(attempt) || attempt <= 0 || !Number.isFinite(max) || max <= 0) {
    return null;
  }
  return { attempt, max };
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

function isPowerShellErrorRecord(toolName: string, output: unknown): boolean {
  const normalizedTool = toolName.toLowerCase();
  if (normalizedTool !== 'bash' && normalizedTool !== 'shell') return false;
  if (typeof output !== 'string') return false;

  // A PowerShell non-terminating error can leave the shell process at exit 0.
  // Require both canonical ErrorRecord fields so ordinary output containing a
  // word such as "failed" does not become an error result.
  return (
    /(?:^|\r?\n)\s*\+\s*CategoryInfo\s*:/u.test(output) &&
    /(?:^|\r?\n)\s*\+\s*FullyQualifiedErrorId\s*:/u.test(output)
  );
}

function openCodeToolResult(
  toolName: string,
  statePart: JsonObject,
): { content: string; isError: boolean } | null {
  const status = typeof statePart.status === 'string' ? statePart.status.toLowerCase() : '';
  if (status !== 'completed' && status !== 'error' && status !== 'failed') return null;

  const metadata = isRecord(statePart.metadata) ? statePart.metadata : {};
  const exitCodes = [statePart.exit, statePart.exitCode, metadata.exit];
  const hasNonZeroExit = exitCodes.some(
    (exitCode) => typeof exitCode === 'number' && Number.isFinite(exitCode) && exitCode !== 0,
  );
  const explicitError =
    (typeof statePart.error === 'string' && statePart.error.trim().length > 0) ||
    (isRecord(statePart.error) && Object.keys(statePart.error).length > 0)
      ? statePart.error
      : null;
  const isError =
    status === 'error' ||
    status === 'failed' ||
    explicitError !== null ||
    hasNonZeroExit ||
    isPowerShellErrorRecord(toolName, statePart.output);
  const contentSource = explicitError ?? statePart.output;

  return { content: stringifyContent(contentSource), isError };
}

function handleOpenCodeEvent(obj: unknown, onEvent: StreamEventHandler, state: ParserState): boolean {
  if (!isRecord(obj)) return false;
  const part = isRecord(obj.part) ? obj.part : {};

  if (obj.type === 'step_start') {
    // `sessionID` is OpenCode's own session handle (capture-style resume).
    // Surface it on the step-start status so the daemon can persist it to
    // `agent_sessions` and replay it as `run -s <id>` next turn. OpenCode
    // stamps it on every stream event; step_start is the turn opener, so a
    // create turn always exposes it here.
    const sessionId =
      typeof obj.sessionID === 'string' && obj.sessionID.length > 0
        ? obj.sessionID
        : null;
    onEvent({ type: 'status', label: 'running', sessionId });
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
    const result = statePart ? openCodeToolResult(part.tool, statePart) : null;
    if (result && !state.openCodeToolResults.has(key)) {
      state.openCodeToolResults.add(key);
      onEvent({
        type: 'tool_result',
        toolUseId: part.callID,
        content: result.content,
        isError: result.isError,
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

/**
 * Codex streams model reasoning as summary items (`item.started` /
 * `item.updated` / `item.completed` with `item.type === 'reasoning'`, the
 * summary text accumulated on `item.text`). Emit the unseen suffix of each
 * item as `thinking_delta` so the web's collapsible thinking block has real
 * content behind the "Thinking" label; distinct reasoning items are joined
 * with a blank line because the web folds consecutive thinking deltas into
 * one block. Idempotent across repeated lifecycle events of the same item.
 */
function emitCodexReasoningItem(
  obj: JsonObject,
  onEvent: StreamEventHandler,
  state: ParserState,
): boolean {
  if (
    obj.type !== 'item.started' &&
    obj.type !== 'item.updated' &&
    obj.type !== 'item.completed'
  ) {
    return false;
  }
  if (!isRecord(obj.item) || obj.item.type !== 'reasoning') return false;
  const key = typeof obj.item.id === 'string' ? obj.item.id : '';
  const text = typeof obj.item.text === 'string' ? obj.item.text : '';
  const emitted = state.codexReasoningEmittedByItem.get(key) ?? 0;
  if (text.length > emitted) {
    const suffix = text.slice(emitted);
    const delta =
      emitted === 0 && state.codexReasoningEmittedAny ? `\n\n${suffix}` : suffix;
    onEvent({ type: 'thinking_delta', delta });
    state.codexReasoningEmittedByItem.set(key, text.length);
    state.codexReasoningEmittedAny = true;
  }
  return true;
}

/**
 * Codex never names the tool it patched a file with: the only trace a write
 * leaves in the stream is a `file_change` ITEM. Recorded shape, verbatim:
 *
 *   {"type":"item.started","item":{"id":"item_3","type":"file_change",
 *     "changes":[{"path":"…/page.html","kind":"add"}],"status":"in_progress"}}
 *
 * That frame really does carry a path and a kind and nothing else — but it is
 * only ONE of the two codex wires, and no longer the shipping one.
 * `codex exec --json` still sends exactly the above on codex-cli 0.151.0
 * (probed 2026-09-03, the same build as the app-server probe below), and
 * `OD_CODEX_TRANSPORT=exec-json` still selects it as the rollback path.
 * The shipping default since `2b9a03a4a4` is `codex app-server`, whose
 * `fileChange` item carries a THIRD field next to those two:
 *
 *   {"path":"…/note.md","kind":{"type":"update","move_path":null},
 *    "diff":"@@ -2,3 +2,4 @@\n beta\n-gamma\n+GAMMA-1\n+GAMMA-2\n delta\n"}
 *
 * `FileUpdateChange` in codex's own generated protocol (`codex app-server
 * generate-ts`, 0.151.0) declares `diff` as a REQUIRED string, and the repo's
 * own recorded fixture `tests/fixtures/codex-app-server/turn-app-server.jsonl`
 * has carried one since the transport landed. It was thrown away one layer up,
 * in `codex-app-server/normalize.ts`, which rebuilt the change as `{path,
 * kind}` to feed this handler — so from here the wire looked unchanged and this
 * comment kept reading as true. Codex file rows therefore showed elapsed time
 * where the same row under Claude showed `+N −M`.
 *
 * Until this branch existed both lifecycle events fell through to `raw`, so a
 * codex turn that created or edited a file showed NO row in the execution
 * record while the same turn under Claude showed one.
 *
 * One item can carry SEVERAL changes (writing an artifact plus its brand spec
 * is one item with two paths), so every change becomes its own call under a
 * derived id `<item id>#<index>`. The chat row model is one file per row, and
 * the web dedupes `tool_use` by id — a shared id would collapse the batch
 * into a single row and hide the rest.
 *
 * The emitted pair is the canonical Write/Edit shape (`file_path` in the
 * input) that `apps/web/src/runtime/chat/tool-kind.ts` already resolves to
 * 「新建」/「改写」 plus a file button, so nothing downstream needs a new event
 * kind. When a patch is present its two line counts ride along under
 * `od_diff_stat` and the patch itself is dropped here — see
 * `codexChangeDiffStat`. When it is absent (`exec --json`) the input keeps its
 * old single-key shape, `diffStat` returns null, and the row shows elapsed time
 * rather than a fabricated `+N −M`.
 *
 * `kind` values other than `add`/`update` (codex also patches by deleting)
 * stay `raw` on purpose. The record has no delete verb, and labelling a
 * deletion 「新建」 or 「改写」 would be a lie; a raw line remains the visible
 * signal that a shape is still unhandled.
 */
const CODEX_FILE_CHANGE_TOOL_BY_KIND: Record<string, string> = {
  add: 'Write',
  update: 'Edit',
};

interface CodexFileChange {
  /** Per-change tool id derived from the item id, unique within the run. */
  id: string;
  /** Canonical tool name the web already knows how to render. */
  name: string;
  path: string;
  /** Line counts read off the change's patch, or null when it carried none. */
  stat: CodexDiffStat | null;
}

interface CodexDiffStat {
  added: number;
  removed: number;
}

/**
 * Count one codex change the way `diffStat` counts the equivalent Claude call,
 * so the two agents cannot disagree about the same edit.
 *
 * `diffStat` (apps/web/src/runtime/chat/format.ts) has exactly two rules and
 * both map onto a codex kind without inventing a third:
 *
 *   Write  added = content.split('\n').length,  removed = 0
 *   Edit   added = new_string lines,            removed = old_string lines
 *
 * An `add` change's `diff` IS the file's whole text — codex sends the content
 * with no `+` prefixes at all — so `add` uses the Write expression verbatim,
 * trailing-newline quirk included: a five-line file reports 6 under BOTH agents.
 * Matching Claude is the requirement; being independently "right" about the
 * trailing newline would put two different numbers on the same file.
 *
 * An `update` change's `diff` is a unified diff, so the "lines that appear in
 * new" and "lines that appear in old" of the Edit rule are its `+` and `-`
 * lines. Counting them directly rather than rebuilding the two texts and
 * splitting keeps `+0` distinguishable from "one empty line" — `''.split('\n')`
 * is 1, which would have made every deletion-only patch read `+1`.
 *
 * Returns null when there is nothing to count: `exec --json` sends no `diff`,
 * and a non-string `diff` from some future shape must degrade to the old
 * elapsed-time row rather than to `+0 −0`.
 */
function codexChangeDiffStat(kind: string, diff: unknown): CodexDiffStat | null {
  if (typeof diff !== 'string' || diff.length === 0) return null;
  if (kind === 'add') return { added: diff.split('\n').length, removed: 0 };
  if (kind !== 'update') return null;
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    // `+++`/`---` are file headers, not content. Codex's own patches omit them,
    // but a diff pasted through some other producer would double-count without
    // this guard.
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
  }
  return added === 0 && removed === 0 ? null : { added, removed };
}

/**
 * Read a codex `file_change` item into one call per changed file, or null when
 * the item is not a fully recognized `file_change` (wrong item type, no id, no
 * changes, or ANY change whose kind we cannot name honestly). Returning null
 * for a partially unknown item is deliberate: emitting the recognized half
 * would silently drop the rest, whereas a null keeps the whole line visible as
 * `raw`.
 *
 * The patch text is read here and NOT kept: one recorded patch was 20k+
 * characters, and every field of a `tool_use` input is persisted verbatim by
 * `chat-run-messages.ts`. Two integers survive the call; the patch does not.
 */
function codexFileChanges(item: JsonObject): CodexFileChange[] | null {
  if (item.type !== 'file_change') return null;
  const itemId = typeof item.id === 'string' ? item.id : '';
  if (!itemId) return null;
  if (!Array.isArray(item.changes) || item.changes.length === 0) return null;
  const changes: unknown[] = item.changes;
  const out: CodexFileChange[] = [];
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    if (!isRecord(change)) return null;
    const filePath = typeof change.path === 'string' ? change.path : '';
    const kind = typeof change.kind === 'string' ? change.kind : '';
    const name = kind ? CODEX_FILE_CHANGE_TOOL_BY_KIND[kind] : undefined;
    if (!filePath || !name) return null;
    out.push({
      id: `${itemId}#${index}`,
      name,
      path: filePath,
      stat: codexChangeDiffStat(kind, change.diff),
    });
  }
  return out;
}

/**
 * Emit the `tool_use` half of each file change, once per derived id.
 *
 * Called from `item.started` so the row gets a real duration: `tool-timing.ts`
 * stamps `startedAt` at the single event exit, and a `tool_use` that arrives
 * together with its `tool_result` reads as "unknown", not "instant". The
 * `codexToolUses` guard makes the later `item.completed` a no-op, and equally
 * makes `item.completed` self-sufficient when the started event never arrived.
 */
function emitCodexFileChangeToolUses(
  changes: readonly CodexFileChange[],
  onEvent: StreamEventHandler,
  state: ParserState,
): void {
  for (const change of changes) {
    if (state.codexToolUses.has(change.id)) continue;
    state.codexToolUses.add(change.id);
    onEvent({
      type: 'tool_use',
      id: change.id,
      name: change.name,
      // Absent, not null, when there is nothing to report: an input that keeps
      // its single-key shape is byte-identical to what `exec --json` produced
      // before this existed, so the rollback transport cannot drift.
      input: change.stat
        ? { file_path: change.path, od_diff_stat: change.stat }
        : { file_path: change.path },
    });
  }
}

/**
 * Codex reports a call to a connected MCP server as an `mcp_tool_call` ITEM.
 * Recorded shape, verbatim (codex-cli 0.149.1):
 *
 *   {"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call",
 *     "server":"echofacts","tool":"echo_fact","arguments":{"topic":"…"},
 *     "result":null,"error":null,"status":"in_progress"}}
 *   {"type":"item.completed","item":{…,"error":{"message":"…"},"status":"failed"}}
 *
 * This is a live surface, not a hypothetical: `mcp-agent-install.ts` registers
 * every connected MCP server into codex with `codex mcp add`, so any user with
 * a connector sees these frames. Until this branch existed both lifecycle
 * events fell through to `raw`, and `build-turn-blocks.ts` skips `raw`
 * outright — so a codex turn that called a connector showed NO row at all,
 * success or failure alike.
 *
 * `mcp__<server>__<tool>` is the repository's existing name shape for an
 * MCP-provided tool (`tool-kind.ts` documents `mcp__*__todo_write`, and the
 * canonical `isTodoWriteToolName` matches on the `__` boundary), so a snapshot
 * tool injected over MCP keeps being recognised as one. Returns null when the
 * item is not a fully named MCP call — a partially known frame stays `raw`
 * rather than becoming a row labelled with a blank server or tool.
 */
function codexMcpToolName(item: JsonObject): string | null {
  if (item.type !== 'mcp_tool_call') return null;
  const server = typeof item.server === 'string' ? item.server : '';
  const tool = typeof item.tool === 'string' ? item.tool : '';
  if (!server || !tool) return null;
  return `mcp__${server}__${tool}`;
}

/**
 * Emit the `tool_use` half of an MCP call, once per item id.
 *
 * Called from `item.started` because every field the row needs (server, tool,
 * arguments) is already present there — holding it back to `item.completed`
 * would cost the row its duration for nothing (`tool-timing.ts` stamps
 * `startedAt` at the single event exit). The `codexToolUses` guard makes the
 * later `item.completed` a no-op, and equally makes `item.completed`
 * self-sufficient when the started event never arrived.
 */
function emitCodexMcpToolUse(
  item: JsonObject,
  id: string,
  name: string,
  onEvent: StreamEventHandler,
  state: ParserState,
): void {
  if (state.codexToolUses.has(id)) return;
  state.codexToolUses.add(id);
  onEvent({
    type: 'tool_use',
    id,
    name,
    input: isRecord(item.arguments) ? item.arguments : {},
  });
}

/**
 * An MCP call reports failure through BOTH `status: 'failed'` and a populated
 * `error` object; either alone is enough to mark the row failed. The message is
 * the only thing the failure case carries (`result` stays null), and during a
 * denied call it is the sole explanation the user would ever get.
 *
 * NOT VERIFIED: the payload shape of a SUCCESSFUL `result`. `codex exec` runs
 * with approval policy `never` and refuses every MCP call before it reaches the
 * server, so no successful frame could be captured. `stringifyContent` is the
 * deliberate generic fallback rather than a guessed field path.
 */
function codexMcpToolResult(item: JsonObject): { content: string; isError: boolean } {
  const error = isRecord(item.error) ? item.error : null;
  const isError = item.status === 'failed' || error !== null;
  const message = error && typeof error.message === 'string' ? error.message : '';
  return { content: message || stringifyContent(item.result ?? ''), isError };
}

/**
 * Read a codex `web_search` item into the query it actually searched for, or
 * null when the frame carries no search we can render honestly.
 *
 * Recorded shape, verbatim (codex-cli 0.149.1 — web search is ON by default,
 * no flag needed, so this reaches every codex user):
 *
 *   {"type":"item.started","item":{"id":"item_2","type":"web_search",
 *     "id":"exec-9fb8985e-…","query":"","action":{"type":"other"}}}
 *   {"type":"item.completed","item":{"id":"item_2","type":"web_search",
 *     "id":"exec-9fb8985e-…","query":"OpenAI Codex CLI release notes",
 *     "action":{"type":"search","query":"OpenAI Codex CLI release notes"}}}
 *
 * Two codex oddities are load-bearing here. First, `id` is serialised TWICE;
 * `JSON.parse` keeps the last, so the tool id is the `exec-…` value. It is
 * stable across the pair, so the pairing still holds. Second, the started
 * frame's `query` is EMPTY — the query only exists at completion, and the query
 * IS the row (`toolTitle` and `searchPattern` both read it). That is why the
 * pair is emitted at `item.completed` and the started frame emits nothing.
 *
 * Only `action.type === 'search'` is recognised. codex's action taxonomy has
 * more members (the started frame shows `other`) and we have captured only this
 * one; calling a page fetch a 「搜索」 is the same class of lie as calling a file
 * deletion 「新建」, so anything else stays `raw` — the visible signal that a
 * shape is still unhandled.
 */
function codexWebSearchQuery(item: JsonObject): string | null {
  if (item.type !== 'web_search') return null;
  const action = isRecord(item.action) ? item.action : null;
  if (!action || action.type !== 'search') return null;
  const query = typeof item.query === 'string' ? item.query : '';
  return query.length > 0 ? query : null;
}

function handleCodexEvent(obj: unknown, onEvent: StreamEventHandler, state: ParserState): boolean {
  if (!isRecord(obj)) return false;

  if (obj.type === 'error') {
    const message = extractErrorMessage(obj.message ?? obj.error, 'Codex error');
    // Codex reports its own upstream reconnect loop as error-shaped JSONL.
    // Normalize it into an ephemeral machine status: the web renders one
    // in-place reconnect row, while the daemon persistence layer drops it.
    // Never put the raw SDK sentence in assistant history.
    const reconnect = recoverableCodexReconnectProgress(message);
    if (reconnect) {
      onEvent({
        type: 'status',
        label: 'agent_reconnecting',
        detail: `${reconnect.attempt}/${reconnect.max}`,
      });
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
    // `thread_id` is Codex's own session handle, surfaced on the same
    // `sessionId` status channel claude uses (claude-stream.ts). It serves two
    // consumers: (1) the daemon persists it to `agent_sessions` and replays it
    // as `exec resume <thread_id>` on the next turn (capture-style resume), and
    // (2) it identifies this run's rollout file
    // (`$CODEX_HOME/sessions/**/rollout-*-<thread_id>.jsonl`), the only place
    // codex records per-call usage, which run_finished reads to recover the
    // turn's first-call cache hit (codex's stream usage is cumulative only).
    // Codex emits this both for a fresh `exec` and for `exec resume` (echoing
    // the resumed id), so it is a stable capture point either way.
    const threadId =
      typeof obj.thread_id === 'string' && obj.thread_id.length > 0
        ? obj.thread_id
        : null;
    onEvent({ type: 'status', label: 'initializing', sessionId: threadId });
    return true;
  }

  if (obj.type === 'turn.started') {
    state.codexPreviousEventWasAgentMessage = false;
    state.codexLastAgentMessageEndedWithNewline = false;
    onEvent({ type: 'status', label: 'thinking' });
    return true;
  }

  if (emitCodexReasoningItem(obj, onEvent, state)) return true;

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
    const startedFileChanges = codexFileChanges(item);
    if (startedFileChanges) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      emitCodexFileChangeToolUses(startedFileChanges, onEvent, state);
      return true;
    }
    const startedMcpToolName = codexMcpToolName(item);
    if (startedMcpToolName && typeof item.id === 'string' && item.id) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      emitCodexMcpToolUse(item, item.id, startedMcpToolName, onEvent, state);
      return true;
    }
    if (item.type === 'web_search') {
      // The started frame's `query` really is always empty (`action.type` is
      // `"other"` here; the term only exists on `item.completed`). This used to
      // emit nothing at all for that reason — "a 「搜索」 row with no term is
      // worse than no row".
      //
      // The product overruled that trade-off on 2026-09-03: a call must reach
      // the screen and start its clock when it is made, never only once it
      // returns. A row with no term still answers the question the user is
      // actually asking — where is it stuck — because it carries the stopwatch.
      // There is no local `web_search` sample to time, so the size is taken
      // from the same class of call: claude's `WebFetch` runs 7.42s.
      //
      // `tool_in_flight` is the generic early form, not an ACP-only event: the
      // client retires it into the settled `tool_use` that shares its id
      // (`dropSupersededInFlightToolUses`), so this is one row with one clock,
      // not a second row. The settled pair below is untouched and still carries
      // the term. `startedAt` is filled at the single emission gateway
      // (`stampToolTiming`) because this parser holds no clock.
      //
      // ⚠️ `item.id` is the id AFTER `JSON.parse` deduplicates codex's twice-
      // serialised `id` key — the `exec-…` value, not `item_2`. The completed
      // frame resolves to the same one, which is exactly why the early row
      // retires instead of drawing a second search row.
      if (typeof item.id === 'string' && item.id) {
        state.codexPreviousEventWasAgentMessage = false;
        state.codexLastAgentMessageEndedWithNewline = false;
        onEvent({ type: 'tool_in_flight', id: item.id, name: 'web_search', input: {} });
      }
      // Boundary state is otherwise deliberately NOT cleared here — it is
      // cleared where the settled row is emitted, so an unrecognised action
      // still reads as no tool row.
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
    // Codex reports non-fatal in-stream notices (e.g. the skills
    // context-budget warning) as `error` ITEMS while the turn keeps running;
    // fatal failures arrive separately as top-level `error` / `turn.failed`
    // events. Surface these as a visible warning pill instead of dropping
    // them as raw noise — during a silent provider hang such an item can be
    // the only signal the user ever gets (incident recvqgLmAkUM6G).
    if (item.type === 'error' && typeof item.message === 'string' && item.message.length > 0) {
      onEvent({ type: 'status', label: 'warning', detail: item.message });
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
    const completedFileChanges = codexFileChanges(item);
    if (completedFileChanges) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      emitCodexFileChangeToolUses(completedFileChanges, onEvent, state);
      // The result carries no content on purpose. `exec --json` genuinely
      // reports no per-file output; `app-server` does send the patch, but a
      // patch is not command output — it belongs on the row as `+N −M` (read
      // by `codexChangeDiffStat` above), not in the terminal panel a
      // `tool_result` body opens. `status: 'failed'` is the only failure
      // signal on the item, on both wires.
      const isError = item.status === 'failed';
      for (const change of completedFileChanges) {
        onEvent({ type: 'tool_result', toolUseId: change.id, content: '', isError });
      }
      return true;
    }
    const completedMcpToolName = codexMcpToolName(item);
    if (completedMcpToolName && typeof item.id === 'string' && item.id) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      emitCodexMcpToolUse(item, item.id, completedMcpToolName, onEvent, state);
      const { content, isError } = codexMcpToolResult(item);
      onEvent({ type: 'tool_result', toolUseId: item.id, content, isError });
      return true;
    }
    const completedSearchQuery = codexWebSearchQuery(item);
    if (completedSearchQuery && typeof item.id === 'string' && item.id) {
      state.codexPreviousEventWasAgentMessage = false;
      state.codexLastAgentMessageEndedWithNewline = false;
      if (!state.codexToolUses.has(item.id)) {
        state.codexToolUses.add(item.id);
        onEvent({
          type: 'tool_use',
          id: item.id,
          name: 'web_search',
          input: { query: completedSearchQuery },
        });
      }
      // The result carries no content, so the row shows 「搜索 <query>」 without
      // a fabricated 「N 处」. There is no failure field on the captured shape.
      //
      // Not because codex has nothing to say any more: `WebSearchItem` in the
      // 0.151.0 generated protocol declares `results: Array<JsonValue> | null`
      // ("structured search results returned out-of-band"), so the field the
      // original note said did not exist now does. What has NOT been measured
      // is whether codex populates it in this integration, and
      // `codex-app-server/normalize.ts` drops it on the way in regardless — so
      // a hit count here would be invented, not read. Measure the wire before
      // changing this; do not infer a count from the type alone.
      onEvent({ type: 'tool_result', toolUseId: item.id, content: '', isError: false });
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

function createParserState(): ParserState {
  return {
    cursorTextSoFar: '',
    cursorTurnStart: 0,
    openCodeToolUses: new Set<string>(),
    openCodeToolResults: new Set<string>(),
    codexToolUses: new Set<string>(),
    codexErrorEmitted: false,
    codexPreviousEventWasAgentMessage: false,
    codexLastAgentMessageEndedWithNewline: false,
    codexReasoningEmittedByItem: new Map<string, number>(),
    codexReasoningEmittedAny: false,
    suppressNextArtifactText: false,
    suppressDuplicateArtifactText: false,
    artifactOpenCandidate: '',
    pendingArtifactText: '',
  };
}

/**
 * Feed already-parsed codex stream frames (the `exec --json` object shapes)
 * through the same branch `createJsonEventStreamHandler('codex', …)` uses.
 *
 * This exists so the app-server transport can reuse the shipping item ->
 * tool_use/tool_result/thinking mapping verbatim instead of maintaining a
 * second copy that would drift. The app-server bridge translates its camelCase
 * JSON-RPC notifications into these frames and routes them here; anything the
 * codex branch does not recognise reports `false` so the caller can decide
 * whether to ignore it or surface it.
 */
export function createCodexFrameHandler(onEvent: StreamEventHandler) {
  const state = createParserState();
  return {
    /** Returns true when the codex branch consumed the frame. */
    handleFrame(frame: JsonObject): boolean {
      return handleCodexEvent(frame, onEvent, state);
    },
  };
}

export interface JsonEventStreamHandlerOptions {
  openCodeChildEvidence?: {
    rootSessionId?: string;
    cliVersion: string;
    onCandidate: (candidate: OpenCodeTaskTerminalCandidate) => void;
    now?: () => number;
  };
}

export function createJsonEventStreamHandler(
  kind: ParserKind,
  onEvent: StreamEventHandler,
  options: JsonEventStreamHandlerOptions = {},
) {
  let buffer = '';
  const state: ParserState = createParserState();
  const openCodeChildEvidence = kind === 'opencode' && options.openCodeChildEvidence
    ? createOpenCodeRootTaskEvidenceCollector(options.openCodeChildEvidence)
    : null;

  function handleLine(line: string): void {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      onEvent({ type: 'raw', line });
      return;
    }

    openCodeChildEvidence?.observe(obj);

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

  function childEvidenceCoverage(streamComplete: boolean) {
    return openCodeChildEvidence?.coverage(streamComplete);
  }

  // The terminal candidates are the only carrier of the child id, its parent
  // binding, and the native Task time window. The close handler needs them
  // after the stream is gone in order to request each child's sanitized
  // export, so they are read back here rather than re-derived.
  function childEvidenceCandidates(): readonly OpenCodeTaskTerminalCandidate[] {
    return openCodeChildEvidence?.candidates() ?? [];
  }

  return { feed, flush, childEvidenceCoverage, childEvidenceCandidates };
}
