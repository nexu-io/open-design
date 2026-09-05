/**
 * Frozen Open Design consumer for Vela's private
 * `sessionUpdate: tool_execution_lifecycle`, `vela.tool_execution_lifecycle`
 * version 1 contract.
 * Rebuilds every persisted/telemetry field from fixed allowlists; arbitrary
 * adapter metadata is never copied into a diagnostic.
 */
import { constants as osConstants } from 'node:os';
import type { JsonObject } from './types.js';
import { acpTelemetryToolCallId } from './updates.js';

const MAX_EVENTS = 64;
const MAX_ERROR_CHAIN = 4;
const MAX_TOOL_DEDUPE_ENTRIES = 256;
const MAX_LIFECYCLE_INTEGER = Number.MAX_SAFE_INTEGER;

const PHASES = new Set([
  'spawn_requested', 'spawn', 'spawn_error', 'exit', 'close',
  'stdout_close', 'stderr_close', 'kill_requested', 'kill_sent', 'kill_failed',
  'release_started', 'release_finished', 'deadline', 'abort_observed',
  'kill_settled', 'output_consumer_finished', 'output_sink_close_requested',
  'output_sink_settled', 'executor_settled',
]);
const OUTCOMES = new Set(['success', 'failure', 'interrupted']);
const TRIGGERS = new Set(['exit', 'abort', 'deadline']);
const STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed']);
const EXECUTION_TERMINALS = new Set(['running', 'returned', 'failed', 'interrupted']);
const TERMINAL_SOURCES = new Set(['tool_result', 'tool_error', 'processor_cleanup']);
const TARGETS = new Set(['group', 'process']);
const MECHANISMS = new Set(['taskkill', 'process_group', 'process_signal']);
const SIGNALS = new Set([
  'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
  'SIGBUS', 'SIGFPE', 'SIGKILL', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2',
  'SIGPIPE', 'SIGALRM', 'SIGTERM', 'SIGCHLD', 'SIGCONT', 'SIGSTOP',
  'SIGTSTP', 'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGXCPU', 'SIGXFSZ',
  'SIGVTALRM', 'SIGPROF', 'SIGWINCH', 'SIGIO', 'SIGSYS', 'SIGBREAK',
  'SIGINFO', 'SIGLOST', 'SIGPOLL', 'SIGPWR', 'SIGSTKFLT',
]);
const ERROR_TYPES = new Set([
  'Error', 'TypeError', 'RangeError', 'AbortError', 'SystemError',
  'PlatformError', 'BadArgument', 'SqlError', 'SqliteError', 'SQLiteError',
  'UnknownError', 'ConstraintError', 'ConnectionError', 'ToolFailure',
  'ToolInvalidArgumentsError',
]);
const ERROR_CODES = new Set([
  ...Object.keys(osConstants.errno),
  'ABORT_ERR',
  'ERR_STREAM_PREMATURE_CLOSE',
  ...[
    'ERROR', 'INTERNAL', 'PERM', 'ABORT', 'BUSY', 'LOCKED', 'NOMEM',
    'READONLY', 'INTERRUPT', 'IOERR', 'CORRUPT', 'NOTFOUND', 'FULL',
    'CANTOPEN', 'PROTOCOL', 'EMPTY', 'SCHEMA', 'TOOBIG', 'CONSTRAINT',
    'MISMATCH', 'MISUSE', 'NOLFS', 'AUTH', 'FORMAT', 'RANGE', 'NOTADB',
    'NOTICE', 'WARNING', 'BUSY_RECOVERY', 'BUSY_SNAPSHOT', 'BUSY_TIMEOUT',
    'LOCKED_SHAREDCACHE', 'LOCKED_VTAB', 'CONSTRAINT_CHECK',
    'CONSTRAINT_FOREIGNKEY', 'CONSTRAINT_NOTNULL', 'CONSTRAINT_PRIMARYKEY',
    'CONSTRAINT_TRIGGER', 'CONSTRAINT_UNIQUE', 'CONSTRAINT_ROWID',
    'CONSTRAINT_DATATYPE', 'IOERR_READ', 'IOERR_SHORT_READ', 'IOERR_WRITE',
    'IOERR_FSYNC', 'IOERR_LOCK', 'IOERR_NOMEM',
  ].map((code) => `SQLITE_${code}`),
]);

type RecordValue = Record<string, unknown>;

export interface ToolExecutionLifecycleDiagnostic {
  type: 'diagnostic';
  name: 'tool_execution_lifecycle';
  source: 'amr-opencode';
  schema: 'vela.tool_execution_lifecycle';
  version: 1;
  toolCallIdHash: string;
  status?: string;
  phase?: string;
  executionVersion?: 1;
  elapsedMs?: number;
  requestedTimeoutMs?: number | null;
  effectiveTimeoutMs?: number;
  forceKillAfterMs?: number;
  trigger?: string;
  terminal?: string;
  droppedEvents?: number;
  events?: RecordValue[];
  toolTerminal?: RecordValue;
}

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function enumValue(value: unknown, allowed: Set<string>): string | undefined {
  return typeof value === 'string' && allowed.has(value) ? value : undefined;
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function nullableInteger(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null) return null;
  return integer(value, min, max);
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function errorChain(value: unknown): RecordValue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const errors: RecordValue[] = [];
  for (const raw of value.slice(0, MAX_ERROR_CHAIN)) {
    const item = record(raw);
    if (!item) continue;
    const type = enumValue(item.type, ERROR_TYPES);
    if (!type) continue;
    const code = enumValue(item.code, ERROR_CODES);
    const errno = integer(item.errno, -2_147_483_648, 2_147_483_647);
    errors.push({
      type,
      ...(code ? { code } : {}),
      ...(errno !== undefined ? { errno } : {}),
    });
  }
  return errors.length > 0 ? errors : undefined;
}

function lifecycleEvent(value: unknown): RecordValue | null {
  const item = record(value);
  if (!item) return null;
  const phase = enumValue(item.phase, PHASES);
  if (!phase) return null;
  const atMs = integer(item.at_ms, 0, MAX_LIFECYCLE_INTEGER);
  const elapsedMs = integer(item.elapsed_ms, 0, MAX_LIFECYCLE_INTEGER);
  const outcome = enumValue(item.outcome, OUTCOMES);
  const pid = integer(item.pid, 1, 2_147_483_647);
  const code = nullableInteger(item.code, -2_147_483_648, 2_147_483_647);
  const signal = item.signal === null ? null : enumValue(item.signal, SIGNALS);
  const target = enumValue(item.target, TARGETS);
  const mechanism = enumValue(item.mechanism, MECHANISMS);
  const stdoutClosed = boolean(item.stdout_closed);
  const stderrClosed = boolean(item.stderr_closed);
  const errors = errorChain(item.error);
  return {
    phase,
    ...(atMs !== undefined ? { atMs } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(outcome ? { outcome } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(signal !== undefined ? { signal } : {}),
    ...(target ? { target } : {}),
    ...(mechanism ? { mechanism } : {}),
    ...(stdoutClosed !== undefined ? { stdoutClosed } : {}),
    ...(stderrClosed !== undefined ? { stderrClosed } : {}),
    ...(errors ? { error: errors } : {}),
  };
}

function terminalProvenance(value: unknown): RecordValue | undefined {
  const item = record(value);
  if (!item) return undefined;
  const source = enumValue(item.source, TERMINAL_SOURCES);
  const confirmed = boolean(item.confirmed);
  if (!source || confirmed === undefined) return undefined;
  const atMs = integer(item.at_ms, 0, MAX_LIFECYCLE_INTEGER);
  const errors = errorChain(item.error);
  return {
    source,
    confirmed,
    ...(atMs !== undefined ? { atMs } : {}),
    ...(errors ? { error: errors } : {}),
  };
}

export function sanitizeToolExecutionLifecycleUpdate(
  update: JsonObject,
): ToolExecutionLifecycleDiagnostic | null {
  if (
    update.sessionUpdate !== 'tool_execution_lifecycle' ||
    update.schema !== 'vela.tool_execution_lifecycle' ||
    update.version !== 1
  ) {
    return null;
  }
  const rawToolCallId = typeof update.toolCallId === 'string' ? update.toolCallId.trim() : '';
  if (!rawToolCallId || Buffer.byteLength(rawToolCallId, 'utf8') > 512) return null;
  const rawExecution = record(update.execution);
  const execution = rawExecution?.version === 1 ? rawExecution : null;
  const toolTerminal = terminalProvenance(update.toolTerminal);
  const status = enumValue(update.status, STATUSES);
  const phase = enumValue(update.phase, PHASES);
  const requestedTimeoutMs = nullableInteger(execution?.requested_timeout_ms, 0, MAX_LIFECYCLE_INTEGER);
  const effectiveTimeoutMs = integer(execution?.effective_timeout_ms, 0, MAX_LIFECYCLE_INTEGER);
  const forceKillAfterMs = integer(execution?.force_kill_after_ms, 0, MAX_LIFECYCLE_INTEGER);
  const trigger = enumValue(execution?.trigger, TRIGGERS);
  const terminal = enumValue(execution?.terminal, EXECUTION_TERMINALS);
  const droppedEvents = integer(execution?.dropped_events, 0, MAX_LIFECYCLE_INTEGER);
  const events = Array.isArray(execution?.events)
    ? execution.events.slice(-MAX_EVENTS).map(lifecycleEvent).filter((event): event is RecordValue => event !== null)
    : [];
  if (
    !status && !phase && requestedTimeoutMs === undefined && effectiveTimeoutMs === undefined &&
    forceKillAfterMs === undefined && !trigger && !terminal &&
    droppedEvents === undefined && events.length === 0 && !toolTerminal
  ) {
    return null;
  }
  return {
    type: 'diagnostic',
    name: 'tool_execution_lifecycle',
    source: 'amr-opencode',
    schema: 'vela.tool_execution_lifecycle',
    version: 1,
    toolCallIdHash: acpTelemetryToolCallId(rawToolCallId),
    ...(status ? { status } : {}),
    ...(phase ? { phase } : {}),
    ...(execution ? { executionVersion: 1 as const } : {}),
    ...(requestedTimeoutMs !== undefined ? { requestedTimeoutMs } : {}),
    ...(effectiveTimeoutMs !== undefined ? { effectiveTimeoutMs } : {}),
    ...(forceKillAfterMs !== undefined ? { forceKillAfterMs } : {}),
    ...(trigger ? { trigger } : {}),
    ...(terminal ? { terminal } : {}),
    ...(droppedEvents !== undefined ? { droppedEvents } : {}),
    ...(events.length > 0 ? { events } : {}),
    ...(toolTerminal ? { toolTerminal } : {}),
  };
}

export function createToolExecutionLifecycleDeduper(): {
  accept(diagnostic: ToolExecutionLifecycleDiagnostic): boolean;
} {
  const fingerprints = new Map<string, string>();
  return {
    accept(diagnostic) {
      const key = diagnostic.toolCallIdHash;
      const fingerprint = JSON.stringify(diagnostic);
      if (fingerprints.get(key) === fingerprint) return false;
      fingerprints.delete(key);
      fingerprints.set(key, fingerprint);
      if (fingerprints.size > MAX_TOOL_DEDUPE_ENTRIES) {
        const oldest = fingerprints.keys().next().value;
        if (typeof oldest === 'string') fingerprints.delete(oldest);
      }
      return true;
    },
  };
}

function projectedLifecycleEvent(value: unknown): RecordValue | null {
  const item = record(value);
  if (!item) return null;
  const phase = enumValue(item.phase, PHASES);
  if (!phase) return null;
  const atMs = integer(item.atMs, 0, MAX_LIFECYCLE_INTEGER);
  const elapsedMs = integer(item.elapsedMs, 0, MAX_LIFECYCLE_INTEGER);
  const outcome = enumValue(item.outcome, OUTCOMES);
  const pid = integer(item.pid, 1, 2_147_483_647);
  const code = nullableInteger(item.code, -2_147_483_648, 2_147_483_647);
  const signal = item.signal === null ? null : enumValue(item.signal, SIGNALS);
  const target = enumValue(item.target, TARGETS);
  const mechanism = enumValue(item.mechanism, MECHANISMS);
  const stdoutClosed = boolean(item.stdoutClosed);
  const stderrClosed = boolean(item.stderrClosed);
  const errors = errorChain(item.error);
  return {
    phase,
    ...(atMs !== undefined ? { at_ms: atMs } : {}),
    ...(elapsedMs !== undefined ? { elapsed_ms: elapsedMs } : {}),
    ...(outcome ? { outcome } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(signal !== undefined ? { signal } : {}),
    ...(target ? { target } : {}),
    ...(mechanism ? { mechanism } : {}),
    ...(stdoutClosed !== undefined ? { stdout_closed: stdoutClosed } : {}),
    ...(stderrClosed !== undefined ? { stderr_closed: stderrClosed } : {}),
    ...(errors ? { error: errors } : {}),
  };
}

/** Re-validates persisted diagnostics before they leave the daemon for Langfuse. */
export function projectToolExecutionLifecycleDiagnostic(value: unknown): RecordValue | null {
  const diagnostic = record(value);
  if (
    diagnostic?.type !== 'diagnostic' ||
    diagnostic.name !== 'tool_execution_lifecycle' ||
    diagnostic.source !== 'amr-opencode' ||
    diagnostic.schema !== 'vela.tool_execution_lifecycle' ||
    diagnostic.version !== 1 ||
    typeof diagnostic.toolCallIdHash !== 'string' ||
    !/^acp_[a-f0-9]{24}$/.test(diagnostic.toolCallIdHash)
  ) {
    return null;
  }
  const elapsedMs = integer(diagnostic.elapsedMs, 0, MAX_LIFECYCLE_INTEGER);
  const status = enumValue(diagnostic.status, STATUSES);
  const phase = enumValue(diagnostic.phase, PHASES);
  const executionVersion = diagnostic.executionVersion === 1 ? 1 : undefined;
  const requestedTimeoutMs = nullableInteger(diagnostic.requestedTimeoutMs, 0, MAX_LIFECYCLE_INTEGER);
  const effectiveTimeoutMs = integer(diagnostic.effectiveTimeoutMs, 0, MAX_LIFECYCLE_INTEGER);
  const forceKillAfterMs = integer(diagnostic.forceKillAfterMs, 0, MAX_LIFECYCLE_INTEGER);
  const trigger = enumValue(diagnostic.trigger, TRIGGERS);
  const terminal = enumValue(diagnostic.terminal, EXECUTION_TERMINALS);
  const droppedEvents = integer(diagnostic.droppedEvents, 0, MAX_LIFECYCLE_INTEGER);
  const events = Array.isArray(diagnostic.events)
    ? diagnostic.events.slice(-MAX_EVENTS).map(projectedLifecycleEvent).filter((event): event is RecordValue => event !== null)
    : [];
  const rawToolTerminal = record(diagnostic.toolTerminal);
  const terminalSource = enumValue(rawToolTerminal?.source, TERMINAL_SOURCES);
  const terminalConfirmed = boolean(rawToolTerminal?.confirmed);
  const terminalAtMs = integer(rawToolTerminal?.atMs, 0, MAX_LIFECYCLE_INTEGER);
  const terminalErrors = errorChain(rawToolTerminal?.error);
  const toolTerminal = terminalSource !== undefined && terminalConfirmed !== undefined
    ? {
        source: terminalSource,
        confirmed: terminalConfirmed,
        ...(terminalAtMs !== undefined ? { at_ms: terminalAtMs } : {}),
        ...(terminalErrors ? { error: terminalErrors } : {}),
      }
    : undefined;
  return {
    name: 'tool_execution_lifecycle',
    source: 'amr-opencode',
    ...(elapsedMs !== undefined ? { elapsed_ms: elapsedMs } : {}),
    schema: 'vela.tool_execution_lifecycle',
    version: 1,
    tool_call_id_hash: diagnostic.toolCallIdHash,
    ...(status ? { status } : {}),
    ...(phase ? { phase } : {}),
    ...(executionVersion ? { execution_version: executionVersion } : {}),
    ...(requestedTimeoutMs !== undefined ? { requested_timeout_ms: requestedTimeoutMs } : {}),
    ...(effectiveTimeoutMs !== undefined ? { effective_timeout_ms: effectiveTimeoutMs } : {}),
    ...(forceKillAfterMs !== undefined ? { force_kill_after_ms: forceKillAfterMs } : {}),
    ...(trigger ? { trigger } : {}),
    ...(terminal ? { terminal } : {}),
    ...(droppedEvents !== undefined ? { dropped_events: droppedEvents } : {}),
    ...(events.length > 0 ? { events } : {}),
    ...(toolTerminal ? { tool_terminal: toolTerminal } : {}),
  };
}
