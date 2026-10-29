/** Private Write diagnostics. No argument text, path, raw ID, or error prose is retained. */
import type { JsonObject } from './types.js';
import { acpTelemetryToolCallId } from './updates.js';

const PHASES = new Set([
  'input_started',
  'input_progress',
  'input_ended',
  'arguments_ready',
  'validation_failed',
  'execution_started',
  'permission_requested',
  'file_write_started',
  'file_write_finished',
  'postprocess_started',
  'execution_returned',
  'execution_failed',
  'result_observed',
  'stream_failed',
  'stream_finished',
  'interrupted',
]);
const ERRORS = new Set(['schema_invalid', 'json_invalid', 'tool_error', 'stream_error', 'aborted']);
const TERMINALS = new Set([
  'execution_returned',
  'execution_failed',
  'validation_failed',
  'result_observed',
]);
const EXECUTION = new Set([
  'execution_started',
  'permission_requested',
  'file_write_started',
  'file_write_finished',
  'postprocess_started',
  ...TERMINALS,
]);
const COUNTERS = ['inputBytes', 'deltaCount', 'firstDeltaAtMs', 'lastDeltaAtMs'] as const;
const FLAGS = ['inputEnded', 'hasContent', 'hasFilePath'] as const;

type Diagnostic = {
  type: 'diagnostic';
  name: 'write_progress';
  source: 'amr-opencode';
  version: 1;
  toolCallIdHash: string;
  messageIdHash: string;
  phase: string;
  atMs: number;
  errorKind?: string;
} & Partial<Record<(typeof COUNTERS)[number], number>> &
  Partial<Record<(typeof FLAGS)[number], boolean>>;

export function sanitizeWriteProgress(update: JsonObject): Diagnostic | null {
  if (update.version !== 1 || typeof update.phase !== 'string' || !PHASES.has(update.phase))
    return null;
  for (const key of ['callID', 'messageID'] as const) {
    if (
      typeof update[key] !== 'string' ||
      !update[key] ||
      Buffer.byteLength(update[key], 'utf8') > 256
    )
      return null;
  }
  if (typeof update.atMs !== 'number' || !Number.isSafeInteger(update.atMs) || update.atMs <= 0)
    return null;
  const diagnostic: Diagnostic = {
    type: 'diagnostic',
    name: 'write_progress',
    source: 'amr-opencode',
    version: 1,
    toolCallIdHash: acpTelemetryToolCallId(update.callID as string),
    messageIdHash: acpTelemetryToolCallId(update.messageID as string),
    phase: update.phase,
    atMs: update.atMs,
  };
  for (const key of COUNTERS) {
    const value = update[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
    diagnostic[key] = value;
  }
  for (const key of FLAGS) {
    if (update[key] === undefined) continue;
    if (typeof update[key] !== 'boolean') return null;
    diagnostic[key] = update[key];
  }
  if (update.errorKind !== undefined) {
    if (typeof update.errorKind !== 'string' || !ERRORS.has(update.errorKind)) return null;
    diagnostic.errorKind = update.errorKind;
  }
  return diagnostic;
}

export function createWriteProgressObserver(
  emit: (payload: unknown, hostSynthesized: boolean) => void,
) {
  type State = {
    latest: Diagnostic;
    receivedAtMs: number;
    executionPhase?: string;
    settled: boolean;
    resultObserved: boolean;
    phases: Set<string>;
    progressEvents: number;
    lastProgressAtMs: number;
    warned: boolean;
  };
  // Per prompt limits, including completed calls: bounded memory and log volume.
  const calls = new Map<string, State>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const send = (payload: unknown, hostSynthesized = false) => {
    try {
      emit(payload, hostSynthesized);
    } catch {
      /* Diagnostics cannot fail the prompt. */
    }
  };
  const snapshot = (state: State, reason: 'no_progress' | 'session_closed') => {
    send(
      {
        ...state.latest,
        name: 'write_progress_snapshot',
        reason,
        receivedAtMs: state.receivedAtMs,
        silentForMs: Math.max(0, Date.now() - state.receivedAtMs),
        ...(state.executionPhase ? { executionPhase: state.executionPhase } : {}),
        // A stream ending or a host timeout is not a confirmed tool result.
        executionSettled: state.settled,
        resultObserved: state.resultObserved,
      },
      true,
    );
  };
  return {
    observe(update: JsonObject) {
      if (closed) return;
      const fact = sanitizeWriteProgress(update);
      if (!fact) return;
      const key = `${fact.messageIdHash}:${fact.toolCallIdHash}`;
      let state = calls.get(key);
      if (!state) {
        if (calls.size >= 64) return;
        state = {
          latest: fact,
          receivedAtMs: Date.now(),
          settled: false,
          resultObserved: false,
          phases: new Set(),
          progressEvents: 0,
          lastProgressAtMs: -Infinity,
          warned: false,
        };
        calls.set(key, state);
      }
      const now = Date.now();
      if (fact.phase === 'input_progress') {
        if (state.progressEvents >= 120 || now - state.lastProgressAtMs < 5000) return;
        state.progressEvents++;
        state.lastProgressAtMs = now;
      } else if (state.phases.has(fact.phase)) return;
      state.phases.add(fact.phase);
      state.latest = { ...state.latest, ...fact };
      state.receivedAtMs = now;
      state.warned = false;
      if (EXECUTION.has(fact.phase)) state.executionPhase = fact.phase;
      if (TERMINALS.has(fact.phase)) state.settled = true;
      if (fact.phase === 'result_observed') state.resultObserved = true;
      send({ ...fact, receivedAtMs: now });
      timer ??= setInterval(() => {
        for (const item of calls.values()) {
          if (!item.resultObserved && !item.warned && Date.now() - item.receivedAtMs >= 60_000) {
            item.warned = true;
            snapshot(item, 'no_progress');
          }
        }
      }, 30_000);
      timer.unref();
    },
    close() {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      for (const state of calls.values())
        if (!state.resultObserved) snapshot(state, 'session_closed');
      calls.clear();
    },
  };
}

/** Revalidate persisted fields at the outbound trace boundary as well. */
export function projectWriteProgressDiagnostic(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as JsonObject;
  if (
    data.type !== 'diagnostic' ||
    data.source !== 'amr-opencode' ||
    (data.name !== 'write_progress' && data.name !== 'write_progress_snapshot')
  )
    return null;
  for (const key of ['toolCallIdHash', 'messageIdHash'] as const) {
    if (typeof data[key] !== 'string' || !/^acp_[a-f0-9]{24}$/.test(data[key])) return null;
  }
  const fact = sanitizeWriteProgress({ ...data, callID: 'redacted', messageID: 'redacted' });
  if (!fact) return null;
  const output: Record<string, unknown> = {
    ...fact,
    name: data.name,
    toolCallIdHash: data.toolCallIdHash,
    messageIdHash: data.messageIdHash,
  };
  for (const key of ['receivedAtMs', 'silentForMs'] as const) {
    if (typeof data[key] === 'number' && Number.isSafeInteger(data[key]) && data[key] >= 0)
      output[key] = data[key];
  }
  if (data.name === 'write_progress_snapshot') {
    if (data.reason === 'no_progress' || data.reason === 'session_closed')
      output.reason = data.reason;
    if (typeof data.executionPhase === 'string' && EXECUTION.has(data.executionPhase))
      output.executionPhase = data.executionPhase;
    if (typeof data.executionSettled === 'boolean') output.executionSettled = data.executionSettled;
    if (typeof data.resultObserved === 'boolean') output.resultObserved = data.resultObserved;
  }
  return output;
}
