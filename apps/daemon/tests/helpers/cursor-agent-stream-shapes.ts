/**
 * Synthetic cursor-agent `--output-format stream-json` lines, shaped after the
 * lines OD 0.22.x persisted verbatim as `raw` events (incident 2026-09-14).
 *
 * Only the SHAPES come from the incident: every value here is generated. The
 * two lines that made one assistant turn weigh ~1.4 MB are reproduced by size:
 *
 * - `tool_call` / `completed` / `editToolCall` carries the whole edited file
 *   twice (`beforeFullFileContent` + `afterFullFileContent`);
 * - the `user` line echoes the entire composed prompt, which itself grows with
 *   the transcript.
 *
 * The OD cursor-agent parser only recognises `system/init`, `assistant` and
 * `result`, so every other line here falls through to `{ type: 'raw', line }`.
 */

export const CURSOR_SESSION_ID = '00000000-0000-4000-8000-00000000c0de';
export const CURSOR_MODEL = 'synthetic-cursor-model';

/**
 * Sits in the middle of every synthetic file body, i.e. only inside the bulk
 * tool payloads: a read whose rows contain it handed an event log's payload
 * to JS.
 */
export const EVENT_LOG_PAYLOAD_SENTINEL = 'od-event-log-payload-sentinel';

/** A deterministic HTML-ish document of roughly `bytes` UTF-8 bytes. */
export function syntheticHtmlDocument(bytes: number, seed = 'doc'): string {
  const lines: string[] = ['<!doctype html>', '<html><body>'];
  let size = lines.join('\n').length;
  let sentinelPlaced = false;
  for (let index = 0; size < bytes; index += 1) {
    if (!sentinelPlaced && size >= bytes / 2) {
      lines.push(`  <!-- ${EVENT_LOG_PAYLOAD_SENTINEL} -->`);
      sentinelPlaced = true;
    }
    const line = `  <div class="row-${seed}-${index}" data-index="${index}">synthetic row ${index} of ${seed}</div>`;
    lines.push(line);
    size += line.length + 1;
  }
  lines.push('</body></html>');
  return lines.join('\n');
}

/** A deterministic prompt-like text of roughly `bytes` UTF-8 bytes. */
export function syntheticPromptEcho(bytes: number): string {
  const parts: string[] = ['## user', 'Synthetic composed prompt.'];
  let size = 0;
  for (let index = 0; size < bytes; index += 1) {
    const part = `## assistant\nSynthetic prior turn ${index}: "quoted" text, a \\ backslash and a tab\t.`;
    parts.push(part);
    size += part.length + 1;
  }
  return parts.join('\n');
}

export function cursorSystemInitLine(): string {
  return JSON.stringify({
    type: 'system',
    subtype: 'init',
    apiKeySource: 'login',
    cwd: '/synthetic/project',
    session_id: CURSOR_SESSION_ID,
    model: CURSOR_MODEL,
    permissionMode: 'default',
  });
}

export function cursorUserEchoLine(promptBytes: number): string {
  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: syntheticPromptEcho(promptBytes) }],
    },
    session_id: CURSOR_SESSION_ID,
  });
}

export function cursorThinkingDeltaLine(text: string, timestampMs: number): string {
  return JSON.stringify({
    type: 'thinking',
    subtype: 'delta',
    text,
    session_id: CURSOR_SESSION_ID,
    timestamp_ms: timestampMs,
  });
}

export function cursorAssistantDeltaLine(text: string, timestampMs: number): string {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    session_id: CURSOR_SESSION_ID,
    timestamp_ms: timestampMs,
  });
}

export function cursorAssistantFinalLine(text: string, modelCallId: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    session_id: CURSOR_SESSION_ID,
    model_call_id: modelCallId,
  });
}

export function cursorEditStartedLine(callId: string, filePath: string): string {
  return JSON.stringify({
    type: 'tool_call',
    subtype: 'started',
    call_id: callId,
    tool_call: {
      editToolCall: { args: { path: filePath, streamContent: '<div>synthetic edit</div>' } },
      hookAdditionalContexts: [],
      toolCallId: callId,
      startedAtMs: '1789392705165',
    },
    model_call_id: `${callId}-model`,
    session_id: CURSOR_SESSION_ID,
    timestamp_ms: 1789392705165,
  });
}

export interface CursorEditCompletedFixture {
  line: string;
  filePath: string;
  diffString: string;
  before: string;
  after: string;
}

export function cursorEditCompletedLine(
  callId: string,
  filePath: string,
  fileBytes: number,
): CursorEditCompletedFixture {
  const before = syntheticHtmlDocument(fileBytes, callId);
  const after = before.replace('synthetic row 0 of', 'edited row 0 of');
  const diffString = '@@ -3,1 +3,1 @@\n-  synthetic row 0\n+  edited row 0\n';
  const line = JSON.stringify({
    type: 'tool_call',
    subtype: 'completed',
    call_id: callId,
    tool_call: {
      editToolCall: {
        args: { path: filePath, streamContent: '<div>synthetic edit</div>' },
        result: {
          success: {
            path: filePath,
            linesAdded: 1,
            linesRemoved: 1,
            diffString,
            beforeFullFileContent: before,
            afterFullFileContent: after,
            message: `Edited ${filePath}`,
          },
        },
      },
      hookAdditionalContexts: [],
      toolCallId: callId,
      startedAtMs: '1789392705165',
      completedAtMs: '1789392705981',
    },
    model_call_id: `${callId}-model`,
    session_id: CURSOR_SESSION_ID,
    timestamp_ms: 1789392705981,
  });
  return { line, filePath, diffString, before, after };
}

export function cursorReadCompletedLine(
  callId: string,
  filePath: string,
  contentBytes: number,
): string {
  const content = syntheticHtmlDocument(contentBytes, `${callId}-read`);
  return JSON.stringify({
    type: 'tool_call',
    subtype: 'completed',
    call_id: callId,
    tool_call: {
      readToolCall: {
        args: { path: filePath, offset: 1, limit: 100_000 },
        result: {
          success: {
            content,
            isEmpty: false,
            exceededLimit: false,
            totalLines: content.split('\n').length,
            fileSize: content.length,
            path: filePath,
            readRange: { startLine: 1, endLine: content.split('\n').length },
            relatedCursorRulePaths: [],
            relatedCursorRules: [],
          },
        },
      },
      hookAdditionalContexts: [],
      toolCallId: callId,
      startedAtMs: '1789392598150',
      completedAtMs: '1789392598537',
    },
    model_call_id: `${callId}-model`,
    session_id: CURSOR_SESSION_ID,
    timestamp_ms: 1789392598537,
  });
}

export function cursorShellCompletedLine(callId: string, stdoutBytes: number): string {
  const stdout = syntheticPromptEcho(stdoutBytes);
  return JSON.stringify({
    type: 'tool_call',
    subtype: 'completed',
    call_id: callId,
    tool_call: {
      shellToolCall: {
        args: { command: 'ls -la synthetic', workingDirectory: '', timeout: 30000, toolCallId: callId },
        result: {
          success: {
            command: 'ls -la synthetic',
            workingDirectory: '',
            exitCode: 0,
            signal: '',
            stdout,
            stderr: '',
            executionTime: 387,
            interleavedOutput: stdout,
            localExecutionTimeMs: 46,
          },
          isBackground: false,
        },
        description: 'List synthetic files',
      },
      hookAdditionalContexts: [],
      toolCallId: callId,
      startedAtMs: '1789392625244',
      completedAtMs: '1789392625703',
    },
    model_call_id: `${callId}-model`,
    session_id: CURSOR_SESSION_ID,
    timestamp_ms: 1789392625703,
  });
}

export function cursorResultLine(): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 4200,
    result: 'done',
    session_id: CURSOR_SESSION_ID,
    usage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 800, cacheWriteTokens: 0 },
  });
}

/** UTF-8 size of a value's JSON serialization. */
export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * One 0.22.x-shaped persisted assistant turn: the event list OD wrote into
 * `messages.events_json` when every cursor-agent tool line was kept verbatim.
 * Used to seed legacy rows that predate the payload budget.
 */
export function legacyCursorTurnEvents(input: {
  turn: number;
  doneKey: string;
  fileBytes?: number;
  promptBytes?: number;
}): Array<Record<string, unknown>> {
  const callId = `call-${input.turn}`;
  const edit = cursorEditCompletedLine(callId, `/synthetic/project/index-${input.turn}.html`, input.fileBytes ?? 620_000);
  return [
    { kind: 'status', label: 'starting', detail: 'cursor-agent' },
    { kind: 'done_key', key: input.doneKey },
    { kind: 'status', label: 'initializing', detail: CURSOR_MODEL },
    { kind: 'raw', line: cursorUserEchoLine(input.promptBytes ?? 200_000) },
    { kind: 'raw', line: cursorThinkingDeltaLine('Planning the synthetic edit.', 1789392588539 + input.turn) },
    { kind: 'raw', line: cursorEditStartedLine(callId, edit.filePath) },
    { kind: 'raw', line: edit.line },
    { kind: 'text', text: `Synthetic answer for turn ${input.turn}.` },
    { kind: 'usage', inputTokens: 1200, outputTokens: 340, durationMs: 4200 },
  ];
}
