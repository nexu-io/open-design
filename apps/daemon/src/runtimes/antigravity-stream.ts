/**
 * Parses Antigravity CLI's `--output-format stream-json` JSONL stream into
 * Open Design UI events (status, text_delta, tool_use, tool_result, usage).
 *
 * Antigravity emits top-level events:
 *   - init        : { event: 'init', conversation_id, init: { tools, cwd } }
 *   - step_update : { event: 'step_update', step_update: { step_index, state, step_type, text_delta, tool_name, tool_info, usage } }
 *   - result      : { event: 'result', result: { status, response, duration_seconds, usage } }
 *
 * Also maintains compatibility with legacy Gemini JSONL frames:
 *   - { type: 'init', session_id, model }
 *   - { type: 'message', role: 'assistant', content, delta }
 *   - { type: 'result', status, stats }
 */

import { Buffer } from 'node:buffer';

type JsonRecord = Record<string, unknown>;
export type AntigravityStreamEvent = Record<string, unknown>;
export type AntigravityEventSink = (event: AntigravityStreamEvent) => void;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function isAntigravityOAuthLine(line: string): boolean {
  return (
    /authentication required/i.test(line) ||
    /accounts\.google\.com\/o\/oauth2\/auth/i.test(line) ||
    /waiting for authentication/i.test(line) ||
    /authentication timed out/i.test(line)
  );
}

export function createAntigravityStreamHandler(onEvent: AntigravityEventSink) {
  let buffer = '';
  let hasEmittedTextDelta = false;
  let hasSeenInit = false;
  const activeToolSteps = new Set<number>();

  function handleObject(obj: JsonRecord, rawLine: string) {
    const eventType = obj.event;

    // 1. Session initialization (native event: 'init' or legacy type: 'init')
    if (eventType === 'init' || (!eventType && obj.type === 'init')) {
      hasSeenInit = true;
      const initData = isRecord(obj.init) ? obj.init : {};
      const sessionId =
        typeof obj.conversation_id === 'string'
          ? obj.conversation_id
          : typeof obj.session_id === 'string'
            ? obj.session_id
            : undefined;

      onEvent({
        type: 'status',
        label: 'initializing',
        sessionId,
        tools: Array.isArray(initData.tools) ? initData.tools : undefined,
        cwd: typeof initData.cwd === 'string' ? initData.cwd : undefined,
      });
      return;
    }

    // Legacy Gemini JSONL: { type: 'message', role: 'assistant', content, delta }
    if (!eventType && obj.type === 'message' && hasSeenInit) {
      if (obj.role === 'assistant') {
        const content = typeof obj.content === 'string' ? obj.content : '';
        if (content.length > 0) {
          hasEmittedTextDelta = true;
          onEvent({ type: 'text_delta', delta: content });
        }
      }
      return;
    }

    // Legacy Gemini JSONL: { type: 'result', status, stats }
    if (!eventType && obj.type === 'result' && hasSeenInit) {
      const status = typeof obj.status === 'string' ? obj.status : 'success';
      const isError = status.toLowerCase() === 'error';
      let usage: JsonRecord | null = null;
      let durationMs: number | null = null;
      if (isRecord(obj.stats)) {
        usage = {
          input_tokens: obj.stats.input_tokens,
          output_tokens: obj.stats.output_tokens,
          cached_tokens: obj.stats.cached,
        };
        if (typeof obj.stats.duration_ms === 'number') {
          durationMs = obj.stats.duration_ms;
        }
      } else if (isRecord(obj.usage)) {
        usage = obj.usage;
      }

      onEvent({
        type: 'usage',
        usage,
        durationMs,
        stopReason: status,
        isError,
      });
      if (isError) {
        onEvent({
          type: 'error',
          message:
            typeof obj.message === 'string' ? obj.message : 'Antigravity execution failed',
          raw: rawLine,
        });
      }
      return;
    }

    // 2. Step updates (agent response or tool call)
    if (eventType === 'step_update' && isRecord(obj.step_update)) {
      const step = obj.step_update;
      const stepIndex = typeof step.step_index === 'number' ? step.step_index : 0;
      const stepType = step.step_type;
      const state = step.state;

      // Agent text response streaming
      if (stepType === 'agent_response') {
        if (typeof step.text_delta === 'string' && step.text_delta.length > 0) {
          hasEmittedTextDelta = true;
          onEvent({ type: 'text_delta', delta: step.text_delta });
        }
        return;
      }

      // Tool call lifecycle
      if (stepType === 'tool') {
        const toolUseId = `agy-step-${stepIndex}`;
        const toolInfo = isRecord(step.tool_info) ? step.tool_info : {};
        const toolName =
          typeof step.tool_name === 'string' && step.tool_name.length > 0
            ? step.tool_name
            : typeof toolInfo.name === 'string' && toolInfo.name.length > 0
              ? toolInfo.name
              : 'unknown_tool';

        if (state === 'ACTIVE') {
          activeToolSteps.add(stepIndex);
          const input = isRecord(toolInfo.parameters) ? toolInfo.parameters : {};
          onEvent({
            type: 'tool_use',
            id: toolUseId,
            name: toolName,
            input,
          });
          return;
        }

        if (state === 'DONE') {
          activeToolSteps.delete(stepIndex);
          const output =
            typeof toolInfo.output === 'string'
              ? toolInfo.output
              : toolInfo.output != null
                ? JSON.stringify(toolInfo.output)
                : '';
          const durationMs =
            typeof step.duration_seconds === 'number'
              ? Math.round(step.duration_seconds * 1000)
              : undefined;

          onEvent({
            type: 'tool_result',
            toolUseId,
            tool_use_id: toolUseId,
            content: output,
            isError: false,
            is_error: false,
            ...(durationMs != null ? { durationMs } : {}),
          });
          return;
        }

        if (state === 'ERROR') {
          activeToolSteps.delete(stepIndex);
          const errorObj = isRecord(toolInfo.error) ? toolInfo.error : {};
          const errorMessage =
            typeof errorObj.message === 'string' && errorObj.message.length > 0
              ? errorObj.message
              : typeof toolInfo.output === 'string' && toolInfo.output.length > 0
                ? toolInfo.output
                : 'Tool execution failed';
          const durationMs =
            typeof step.duration_seconds === 'number'
              ? Math.round(step.duration_seconds * 1000)
              : undefined;

          onEvent({
            type: 'tool_result',
            toolUseId,
            tool_use_id: toolUseId,
            content: errorMessage,
            isError: true,
            is_error: true,
            ...(durationMs != null ? { durationMs } : {}),
          });
          return;
        }

        return;
      }

      // User input step or other steps
      return;
    }

    // 3. Final execution result & token usage
    if (eventType === 'result' && isRecord(obj.result)) {
      const res = obj.result;
      const status = typeof res.status === 'string' ? res.status : 'SUCCESS';
      const isError = status === 'ERROR';
      const isCanceled = status === 'CANCELED';
      const durationMs =
        typeof res.duration_seconds === 'number'
          ? Math.round(res.duration_seconds * 1000)
          : null;

      // Close any active tools that didn't receive an explicit terminal step
      for (const stepIndex of activeToolSteps) {
        onEvent({
          type: 'tool_result',
          toolUseId: `agy-step-${stepIndex}`,
          tool_use_id: `agy-step-${stepIndex}`,
          content: isError || isCanceled ? 'Tool interrupted' : '',
          isError: isError || isCanceled,
          is_error: isError || isCanceled,
        });
      }
      activeToolSteps.clear();

      // Fallback: if no text deltas were streamed, emit response from result
      if (!hasEmittedTextDelta && typeof res.response === 'string' && res.response.trim().length > 0) {
        hasEmittedTextDelta = true;
        onEvent({ type: 'text_delta', delta: res.response });
      }

      onEvent({
        type: 'usage',
        usage: res.usage ?? null,
        durationMs,
        stopReason: status,
        isError,
      });

      if (isError) {
        onEvent({
          type: 'error',
          message:
            typeof res.response === 'string' && res.response.trim().length > 0
              ? res.response
              : 'Antigravity execution failed',
          raw: rawLine,
        });
      }
      return;
    }

    // Unrecognized or non-standard structured event
    onEvent({ type: 'raw', line: rawLine });
  }

  function handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (isAntigravityOAuthLine(trimmed)) {
      onEvent({ type: 'oauth_prompt', line: trimmed });
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        handleObject(parsed, trimmed);
        return;
      }
    } catch {
      // Non-JSON line (e.g. system banner, warning)
    }
    onEvent({ type: 'raw', line: trimmed });
  }

  function feed(chunk: unknown) {
    buffer += stringifyContent(chunk);
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      handleLine(line);
    }
  }

  function flush() {
    const rem = buffer.trim();
    buffer = '';
    if (rem) {
      handleLine(rem);
    }
    // Clean up any remaining in-flight tools
    for (const stepIndex of activeToolSteps) {
      onEvent({
        type: 'tool_result',
        toolUseId: `agy-step-${stepIndex}`,
        tool_use_id: `agy-step-${stepIndex}`,
        content: '',
        isError: false,
        is_error: false,
      });
    }
    activeToolSteps.clear();
  }

  return { feed, flush };
}
