import type { PersistedAgentEvent } from '@open-design/contracts';
import { normalizePersistedToolInput } from './persisted-tool-input.js';

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload {
  return value && typeof value === 'object' ? value as Payload : {};
}

export function runSseEventToPersistedAgentEvent(
  event: unknown,
  data: unknown,
): PersistedAgentEvent | null {
  const payload = asPayload(data);
  if (event === 'start') {
    return {
      kind: 'status',
      label: 'starting',
      ...(typeof payload.bin === 'string' ? { detail: payload.bin } : {}),
    };
  }
  if (event === 'stdout') {
    const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
    return chunk ? { kind: 'text', text: chunk } : null;
  }
  if (event === 'error') {
    const error = asPayload(payload.error);
    const message = typeof error.message === 'string'
      ? error.message
      : typeof payload.message === 'string'
        ? payload.message
        : '';
    return {
      kind: 'status',
      label: 'error',
      ...(message ? { detail: message } : {}),
    };
  }
  if (event !== 'agent') return null;
  return daemonAgentPayloadToPersistedAgentEvent(payload);
}

export function daemonAgentPayloadToPersistedAgentEvent(
  data: unknown,
): PersistedAgentEvent | null {
  const payload = asPayload(data);
  const type = payload.type;
  if (type === 'status' && typeof payload.label === 'string') {
    const detail =
      typeof payload.detail === 'string'
        ? payload.detail
        : typeof payload.model === 'string'
          ? payload.model
          : typeof payload.ttftMs === 'number'
            ? `first token in ${Math.round(payload.ttftMs / 100) / 10}s`
            : undefined;
    return { kind: 'status', label: payload.label, ...(detail ? { detail } : {}) };
  }
  if (type === 'text_delta' && typeof payload.delta === 'string') {
    return { kind: 'text', text: payload.delta };
  }
  if (type === 'conversation_title' && typeof payload.title === 'string') {
    return { kind: 'conversation_title', title: payload.title };
  }
  if (type === 'thinking_delta' && typeof payload.delta === 'string') {
    return { kind: 'thinking', text: payload.delta };
  }
  if (type === 'thinking_start') return { kind: 'status', label: 'thinking' };
  if (type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: payload.action as 'created' | 'updated' | 'deleted',
      projectId: payload.projectId as string,
      artifactId: payload.artifactId as string,
      title: payload.title as string,
      ...(payload.refreshStatus ? { refreshStatus: payload.refreshStatus as string } : {}),
    };
  }
  if (type === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: payload.phase as 'started' | 'succeeded' | 'failed',
      projectId: payload.projectId as string,
      artifactId: payload.artifactId as string,
      ...(payload.refreshId ? { refreshId: payload.refreshId as string } : {}),
      ...(payload.title ? { title: payload.title as string } : {}),
      ...(typeof payload.refreshedSourceCount === 'number'
        ? { refreshedSourceCount: payload.refreshedSourceCount }
        : {}),
      ...(payload.error ? { error: payload.error as string } : {}),
    };
  }
  if (type === 'tool_use' && typeof payload.id === 'string' && typeof payload.name === 'string') {
    return {
      kind: 'tool_use',
      id: payload.id,
      name: payload.name,
      input: normalizePersistedToolInput(payload.input),
    };
  }
  if (type === 'tool_input_delta') return null;
  if (type === 'tool_result' && typeof payload.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: payload.toolUseId,
      content: String(payload.content ?? ''),
      isError: Boolean(payload.isError),
    };
  }
  if (type === 'usage') {
    const usage = asPayload(payload.usage);
    return {
      kind: 'usage',
      ...(typeof usage.input_tokens === 'number' ? { inputTokens: usage.input_tokens } : {}),
      ...(typeof usage.output_tokens === 'number' ? { outputTokens: usage.output_tokens } : {}),
      ...(typeof payload.costUsd === 'number' ? { costUsd: payload.costUsd } : {}),
      ...(typeof payload.durationMs === 'number' ? { durationMs: payload.durationMs } : {}),
    };
  }
  if (type === 'fabricated_role_marker' && typeof payload.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${payload.marker}"). Response was truncated at this point to prevent unauthorized instruction injection. See issue #3247.`,
    };
  }
  if (type === 'tool_loop' && typeof payload.toolName === 'string') {
    const count = typeof payload.count === 'number' ? payload.count : 0;
    const detail = payload.action === 'halt'
      ? `Run stopped: the agent repeated a failing ${payload.toolName} call ${count}× without progress. Re-check the actual target before retrying.`
      : `Heads up — the agent has repeated a failing ${payload.toolName} call ${count}× and may be stuck.`;
    return { kind: 'status', label: 'warning', detail };
  }
  if (type === 'raw' && typeof payload.line === 'string') return { kind: 'raw', line: payload.line };
  return null;
}
