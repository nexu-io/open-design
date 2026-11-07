/**
 * Map native `@opencode/sdk` server events onto the record shape consumed by
 * `handleOpenCodeEvent` in `json-event-stream.ts` (`step_start`, `text`,
 * `reasoning`, `tool_use`, `step_finish`, `error`, plus the
 * `od_opencode_tool` preview the file plugin used to emit).
 *
 * The SDK path feeds `events.subscribe()` frames through here first so the
 * SDK shares one parser, one preview state machine, and one usage/error
 * contract with the historical CLI JSONL shape.
 *
 * Two wire generations are accepted:
 *
 * - CLI JSONL passthrough (`step_start` / `text` / `reasoning` /
 *   `tool_use` / `step_finish` / `error` / `od_opencode_tool`) — forwarded
 *   untouched for back-compat with recorded fixtures.
 * - Legacy `message.part.updated` server frames (`part.type` text /
 *   reasoning / tool) — mapped onto the same records.
 * - Native granular `session.*` events (`session.text.delta`,
 *   `session.reasoning.delta/ended`, `session.tool.input.started/called`,
 *   `session.tool.success/failed`, `session.usage.updated`,
 *   `session.execution.failed`, `session.created`, `session.idle`) — mapped
 *   onto the same records. Tool names arrive on `input.started` while
 *   `called` / `success` / `failed` carry only the call id, so a small
 *   per-process correlator remembers `id -> tool` (cleared per run via
 *   `clearSdkToolCorrelation`).
 */

export type SdkStreamRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function partText(part: Record<string, unknown>): string | null {
  const text = part.text ?? part.content ?? part.data;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

function eventData(event: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(event.properties) && isRecord((event.properties as Record<string, unknown>).data)) {
    return (event.properties as Record<string, unknown>).data as Record<string, unknown>;
  }
  if (isRecord(event.data)) return event.data as Record<string, unknown>;
  if (isRecord(event.properties)) return event.properties as Record<string, unknown>;
  return event;
}

function sessionIDOf(event: Record<string, unknown>, data: Record<string, unknown>): string | undefined {
  for (const candidate of [data.sessionID, data.sessionId, event.sessionID, event.sessionId]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  const properties = isRecord(event.properties) ? (event.properties as Record<string, unknown>) : null;
  if (properties) {
    for (const candidate of [properties.sessionID, properties.sessionId]) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    if (isRecord(properties.session) && typeof (properties.session as Record<string, unknown>).id === 'string') {
      return (properties.session as Record<string, unknown>).id as string;
    }
  }
  return undefined;
}

// `session.tool.called` / `success` / `failed` carry the call id but not the
// tool name; `session.tool.input.started` carries the name. Remember the
// mapping so terminal records can name the tool honestly. Keyed by
// `<sessionID>:<callID>` so concurrent runs never cross.
const sdkToolNameByCall = new Map<string, string>();

export function clearSdkToolCorrelation(): void {
  sdkToolNameByCall.clear();
}

function toolKey(sessionID: string | undefined, callID: string): string {
  return `${sessionID ?? ''}:${callID}`;
}

function rememberSdkToolName(sessionID: string | undefined, callID: string, tool: string): void {
  if (!callID || !tool) return;
  if (sdkToolNameByCall.size > 2048) sdkToolNameByCall.clear();
  sdkToolNameByCall.set(toolKey(sessionID, callID), tool);
}

function recallSdkToolName(sessionID: string | undefined, callID: string): string | null {
  return sdkToolNameByCall.get(toolKey(sessionID, callID)) ?? null;
}

function forgetSdkToolName(sessionID: string | undefined, callID: string): void {
  sdkToolNameByCall.delete(toolKey(sessionID, callID));
}

function filePathOf(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  for (const key of ['filePath', 'file_path', 'path']) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function toolContentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function usageRecord(
  sessionID: string | undefined,
  tokens: unknown,
  cost: unknown,
): SdkStreamRecord | null {
  if (!isRecord(tokens)) return null;
  const part: Record<string, unknown> = { tokens };
  if (typeof cost === 'number' && Number.isFinite(cost)) part.cost = cost;
  return { type: 'step_finish', sessionID, part };
}

/**
 * Normalize one SDK server event into zero or more parser records.
 * Unknown shapes pass through as `{ type: 'raw' }` so the caller can
 * preserve fallback behavior (no silent drops).
 */
export function sdkEventToStreamRecords(event: unknown): SdkStreamRecord[] {
  if (!isRecord(event)) return [{ type: 'raw', event }];
  const type = typeof event.type === 'string' ? event.type : '';
  const properties = isRecord(event.properties) ? event.properties : event;

  // Already in CLI JSONL shape — forward untouched.
  if (
    type === 'step_start' ||
    type === 'text' ||
    type === 'reasoning' ||
    type === 'tool_use' ||
    type === 'step_finish' ||
    type === 'error' ||
    type === 'od_opencode_tool'
  ) {
    return [event];
  }

  // Server channel: message part updates carry text / reasoning / tool calls.
  if (type === 'message.part.updated') {
    const part = isRecord(properties.part) ? properties.part : null;
    if (!part) return [{ type: 'raw', event }];
    const sessionID =
      typeof part.sessionID === 'string'
        ? part.sessionID
        : typeof properties.sessionID === 'string'
          ? (properties.sessionID as string)
          : undefined;
    const partType = typeof part.type === 'string' ? part.type : '';

    if (partType === 'text') {
      const text = partText(part);
      if (!text) return [];
      return [{ type: 'text', sessionID, part: { text } }];
    }
    if (partType === 'reasoning') {
      const text = partText(part);
      if (!text) return [];
      return [{ type: 'reasoning', sessionID, part: { text } }];
    }
    if (partType === 'tool') {
      const tool = typeof part.tool === 'string' ? part.tool : 'unknown';
      const callID =
        typeof part.callID === 'string'
          ? part.callID
          : typeof part.id === 'string'
            ? part.id
            : `${Date.now()}-sdk`;
      const state = isRecord(part.state) ? part.state : {};
      const status = typeof state.status === 'string' ? state.status : '';
      // Emit the preview record the CLI file-plugin used to emit, then the
      // terminal tool_use record once the tool completes/errors.
      const input = isRecord(state.input) ? state.input : {};
      const filePath = typeof input.filePath === 'string' ? input.filePath : undefined;
      if (status === 'pending' || status === 'running') {
        return [
          {
            type: 'od_opencode_tool',
            version: 1,
            sessionID,
            callID,
            tool,
            ...(filePath ? { path: filePath } : {}),
          },
        ];
      }
      return [
        {
          type: 'tool_use',
          sessionID,
          part: { tool, callID, state: { input, output: state.output ?? null, ...state } },
        },
      ];
    }
    return [{ type: 'raw', event }];
  }

  const data = eventData(event);
  const sessionID = sessionIDOf(event, data);

  // ---- Native granular session events (current SDK wire) ----

  if (type === 'session.created' || type === 'session.updated') {
    const session = isRecord(properties.session) ? properties.session : data;
    const id = typeof (session as Record<string, unknown>).id === 'string'
      ? ((session as Record<string, unknown>).id as string)
      : sessionID;
    if (id) return [{ type: 'step_start', sessionID: id }];
    return [];
  }

  if (type === 'session.text.delta') {
    const delta = typeof data.delta === 'string' ? data.delta : null;
    if (!delta) return [];
    return [{ type: 'text', sessionID, part: { text: delta } }];
  }

  if (type === 'session.text.started' || type === 'session.text.ended') {
    const text = typeof data.text === 'string' ? data.text : null;
    if (!text) return [];
    // `ended` replays the full block; the parser treats each `text` record
    // as additive, so only emit when this is the sole text signal. Deltas
    // are the common path — `ended` without prior deltas still yields text.
    return [{ type: 'text', sessionID, part: { text } }];
  }

  if (type === 'session.reasoning.delta') {
    const delta = typeof data.delta === 'string' ? data.delta : null;
    if (!delta) return [];
    return [{ type: 'reasoning', sessionID, part: { text: delta } }];
  }

  if (type === 'session.reasoning.ended' || type === 'session.reasoning.started') {
    const text = typeof data.text === 'string' ? data.text : null;
    if (!text) return [];
    return [{ type: 'reasoning', sessionID, part: { text } }];
  }

  if (type === 'session.tool.input.started') {
    const callID = typeof data.id === 'string' ? data.id : null;
    const tool = typeof data.name === 'string' ? data.name : null;
    if (!callID || !tool) return [{ type: 'raw', event }];
    rememberSdkToolName(sessionID, callID, tool);
    return [{ type: 'od_opencode_tool', version: 1, sessionID, callID, tool }];
  }

  if (type === 'session.tool.called') {
    const callID = typeof data.id === 'string' ? data.id : null;
    if (!callID) return [{ type: 'raw', event }];
    const recalled = recallSdkToolName(sessionID, callID);
    const native = isRecord(data.native) ? (data.native as Record<string, unknown>) : null;
    const tool = recalled
      ?? (native && typeof native.tool === 'string' ? (native.tool as string) : null)
      ?? (typeof data.tool === 'string' ? (data.tool as string) : null)
      ?? 'unknown';
    if (!recalled && tool !== 'unknown') rememberSdkToolName(sessionID, callID, tool);
    const input = isRecord(data.input) ? (data.input as Record<string, unknown>) : {};
    const filePath = filePathOf(input);
    return [
      {
        type: 'od_opencode_tool',
        version: 1,
        sessionID,
        callID,
        tool,
        ...(filePath ? { path: filePath } : {}),
      },
    ];
  }

  if (type === 'session.tool.success' || type === 'session.tool.failed') {
    const callID = typeof data.id === 'string' ? data.id : null;
    if (!callID) return [{ type: 'raw', event }];
    const recalled = recallSdkToolName(sessionID, callID);
    const tool = recalled
      ?? (typeof data.tool === 'string' ? (data.tool as string) : null)
      ?? 'unknown';
    const isError = type === 'session.tool.failed';
    const input = isRecord(data.input) ? (data.input as Record<string, unknown>) : {};
    const output = isError
      ? (isRecord(data.error) ? data.error : { message: 'Tool failed' })
      : (data.content ?? null);
    const status = isError ? 'error' : 'completed';
    forgetSdkToolName(sessionID, callID);
    return [
      {
        type: 'tool_use',
        sessionID,
        part: {
          tool,
          callID,
          state: { status, input, output, ...(isError ? { error: data.error ?? true } : {}) },
        },
      },
    ];
  }

  if (type === 'session.usage.updated' || type === 'session.usage.recorded') {
    const record = usageRecord(sessionID, data.tokens, data.cost);
    return record ? [record] : [];
  }

  if (type === 'session.execution.failed') {
    const error = isRecord(data.error) ? (data.error as Record<string, unknown>) : null;
    const message = (error && typeof error.message === 'string' && error.message)
      || (typeof data.message === 'string' && data.message)
      || 'OpenCode session execution failed';
    return [{ type: 'error', sessionID, message, error: error ?? data }];
  }

  if (type === 'session.error' || type === 'server.error' || type === 'error') {
    const message =
      (isRecord(properties.error) && typeof properties.error.message === 'string'
        ? (properties.error.message as string)
        : typeof properties.message === 'string'
          ? (properties.message as string)
          : typeof properties.error === 'string'
            ? (properties.error as string)
            : 'OpenCode SDK error');
    return [{ type: 'error', sessionID, message, error: properties.error ?? event }];
  }

  // Terminal lifecycle markers carry no user-visible payload; the prompt
  // promise settling is the completion signal. Swallow them so they never
  // surface as `raw` rows.
  if (
    type === 'session.idle' ||
    type === 'session.execution.started' ||
    type === 'session.execution.succeeded' ||
    type === 'session.execution.interrupted' ||
    type === 'session.status' ||
    type === 'session.step.started' ||
    type === 'session.step.streamed' ||
    type === 'session.step.ended' ||
    type === 'session.step.failed'
  ) {
    return [];
  }

  return [{ type: 'raw', event }];
}
