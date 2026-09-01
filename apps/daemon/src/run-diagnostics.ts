import type {
  TrackingAmrOpenCodeErrorPhase,
  TrackingAmrOpenCodeLastEventType,
  TrackingAmrOpenCodeLastToolKind,
  TrackingAmrOpenCodeLastToolStatus,
} from '@open-design/contracts/analytics';
import { redactSecrets } from './redact.js';
import { isHostSynthesizedAcpEmission } from './agent-protocol/acp/emission-provenance.js';

export interface RunEventForDiagnostics {
  event: string;
  data: unknown;
}

export type RunDiagnosticSource =
  | 'error_event'
  | 'stderr'
  | 'exit_code'
  | 'signal'
  | 'unknown';

export type StderrLineCountBucket =
  | 'none'
  | '1_5'
  | '6_20'
  | '21_100'
  | 'gt_100';

export type RunCloseReason =
  | 'exit_0'
  | 'exit_nonzero'
  | 'signal'
  | 'cancel_requested'
  | 'stream_error'
  | 'fatal_rpc_error'
  | 'empty_output'
  | 'unknown';

export interface RunDiagnosticsAnalytics {
  diagnostic_source: RunDiagnosticSource;
  stderr_present: boolean;
  stderr_line_count_bucket: StderrLineCountBucket;
  stdout_present: boolean;
  stdout_line_count_bucket: StderrLineCountBucket;
  rpc_close_reason: RunCloseReason;
  first_token_seen: boolean;
  user_visible_output_seen: boolean;
  tool_call_seen: boolean;
  // Legacy name: every tool_use in the terminal attempt has a matching observed
  // tool_result (by id, or count for idless streams). Known host-synthesized
  // results are display cleanup, not agent-confirmed completion. Even a real
  // result only proves observation, not delivery back to the model or run success.
  tool_result_sent: boolean;
  // True when an approval/permission gate fired. Only ACP runtimes surface this
  // (via an `acp_approval_request` diagnostic); stream/CLI runtimes bypass gates.
  approval_requested: boolean;
  artifact_write_seen: boolean;
  live_artifact_seen: boolean;
  amr_opencode_error_phase?: TrackingAmrOpenCodeErrorPhase;
  amr_opencode_last_event_type?: TrackingAmrOpenCodeLastEventType;
  amr_opencode_last_tool_status?: TrackingAmrOpenCodeLastToolStatus;
  amr_opencode_last_tool_kind?: TrackingAmrOpenCodeLastToolKind;
  // True when this run transparently re-seeded after an upstream session resume
  // failed (expired/pruned): the dead handle was cleared and the turn was re-run
  // with a fresh session + full transcript, with no user-facing error. Lets us
  // monitor how often the resume optimization falls back (should be rare).
  resume_auto_reseeded: boolean;
  tool_execution_lifecycle_seen?: boolean;
  tool_execution_lifecycle_count_bucket?: '1' | '2_5' | '6_20' | 'gt_20';
  tool_execution_trigger?: 'exit' | 'abort' | 'deadline' | 'mixed' | 'unknown';
  tool_execution_terminal?: 'running' | 'returned' | 'failed' | 'interrupted' | 'mixed' | 'unknown';
  tool_terminal_source?: 'tool_result' | 'tool_error' | 'processor_cleanup' | 'mixed' | 'unknown';
  tool_kill_outcome?: 'none' | 'requested' | 'sent' | 'failed';
  tool_child_close_seen?: boolean;
  tool_stdout_close_seen?: boolean;
  tool_stderr_close_seen?: boolean;
  tool_execution_evidence_incomplete?: boolean;
}

export interface RunToolProgress {
  toolCallSeen: boolean;
  toolResultSent: boolean;
  hasOutstandingTool: boolean;
}

export interface StreamTailSummary {
  tail: string;
  lineCount: number;
  truncated: boolean;
}

export type StderrTailSummary = StreamTailSummary;
export type StdoutTailSummary = StreamTailSummary;

const STDERR_TAIL_MAX_LINES = 20;
export const STDERR_TAIL_MAX_BYTES = 4 * 1024;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function amrOpenCodeErrorPhase(value: unknown): TrackingAmrOpenCodeErrorPhase | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  switch (value.trim()) {
    case 'timeout':
    case 'event_stream_start':
    case 'event_stream':
    case 'prompt_async':
      return value.trim() as TrackingAmrOpenCodeErrorPhase;
    default:
      return 'other';
  }
}

function amrOpenCodeLastEventType(value: unknown): TrackingAmrOpenCodeLastEventType | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  switch (value.trim()) {
    case 'tool_call':
    case 'tool_call_update':
    case 'agent_message_chunk':
    case 'agent_thought_chunk':
    case 'done':
      return value.trim() as TrackingAmrOpenCodeLastEventType;
    default:
      return 'other';
  }
}

function amrOpenCodeLastToolStatus(value: unknown): TrackingAmrOpenCodeLastToolStatus | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const status = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (status === 'pending') return 'pending';
  if (status === 'running' || status === 'in_progress') return 'in_progress';
  if (status === 'completed' || status === 'complete' || status === 'success' || status === 'succeeded') {
    return 'completed';
  }
  if (
    status === 'failed' ||
    status === 'failure' ||
    status === 'error' ||
    status === 'cancelled' ||
    status === 'canceled'
  ) {
    return 'failed';
  }
  return 'other';
}

function amrOpenCodeLastToolKind(value: unknown): TrackingAmrOpenCodeLastToolKind | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const kind = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (/^(?:read|view|cat)$/.test(kind)) return 'read';
  if (/^(?:write|create|save)$/.test(kind)) return 'write';
  if (/^(?:edit|patch|replace)$/.test(kind)) return 'edit';
  if (/^(?:grep|glob|search|find)$/.test(kind)) return 'search';
  if (/^(?:bash|shell|exec|execute|command)$/.test(kind)) return 'execute';
  if (/^(?:fetch|webfetch|web_fetch|websearch|web_search|browser)$/.test(kind)) return 'fetch';
  return 'other';
}

function amrOpenCodeDiagnosticsFromError(data: unknown): Partial<RunDiagnosticsAnalytics> | null {
  const error = recordValue(recordValue(data)?.error);
  const details = recordValue(error?.details);
  if (
    details?.kind !== 'opencode_prompt_error' ||
    (details.runtime !== undefined && details.runtime !== 'opencode')
  ) {
    return null;
  }
  const errorPhase = amrOpenCodeErrorPhase(details.phase);
  const lastEventType = amrOpenCodeLastEventType(details.lastEventType);
  const lastToolStatus = amrOpenCodeLastToolStatus(details.lastToolStatus);
  const lastToolKind = amrOpenCodeLastToolKind(details.lastToolKind);
  return {
    ...(errorPhase ? { amr_opencode_error_phase: errorPhase } : {}),
    ...(lastEventType ? { amr_opencode_last_event_type: lastEventType } : {}),
    ...(lastToolStatus ? { amr_opencode_last_tool_status: lastToolStatus } : {}),
    ...(lastToolKind ? { amr_opencode_last_tool_kind: lastToolKind } : {}),
  };
}

function lifecycleCountBucket(count: number): NonNullable<RunDiagnosticsAnalytics['tool_execution_lifecycle_count_bucket']> {
  if (count <= 1) return '1';
  if (count <= 5) return '2_5';
  if (count <= 20) return '6_20';
  return 'gt_20';
}

function collapseLifecycleEnum<T extends string>(values: Set<T>): T | 'mixed' | 'unknown' {
  if (values.size === 0) return 'unknown';
  if (values.size > 1) return 'mixed';
  return values.values().next().value ?? 'unknown';
}

function toolExecutionLifecycleAnalytics(
  events: RunEventForDiagnostics[],
): Partial<RunDiagnosticsAnalytics> {
  const toolCallIds = new Set<string>();
  const triggers = new Set<'exit' | 'abort' | 'deadline'>();
  const terminals = new Set<'running' | 'returned' | 'failed' | 'interrupted'>();
  const terminalSources = new Set<'tool_result' | 'tool_error' | 'processor_cleanup'>();
  let lifecycleCount = 0;
  let killRequested = false;
  let killSent = false;
  let killFailed = false;
  let childCloseSeen = false;
  let stdoutCloseSeen = false;
  let stderrCloseSeen = false;
  let evidenceIncomplete = false;

  // Terminal snapshots carry the most complete evidence. Bound work and
  // memory to the latest 64 distinct diagnostics while preserving that tail.
  for (const event of events.slice().reverse()) {
    if (event.event !== 'agent') continue;
    const data = recordValue(event.data);
    if (
      data?.type !== 'diagnostic' ||
      data.name !== 'tool_execution_lifecycle' ||
      data.schema !== 'vela.tool_execution_lifecycle' ||
      data.version !== 1
    ) {
      continue;
    }
    const safeLifecycleEvents = Array.isArray(data.events)
      ? data.events.slice(-64).flatMap((rawLifecycleEvent) => {
          const lifecycleEvent = recordValue(rawLifecycleEvent);
          const phase = lifecycleEvent?.phase;
          if (
            phase !== 'kill_requested' && phase !== 'kill_sent' &&
            phase !== 'kill_failed' && phase !== 'stdout_close' &&
            phase !== 'stderr_close' && phase !== 'close'
          ) {
            return [];
          }
          return [{
            phase,
            ...(typeof lifecycleEvent?.stdoutClosed === 'boolean'
              ? { stdoutClosed: lifecycleEvent.stdoutClosed }
              : {}),
            ...(typeof lifecycleEvent?.stderrClosed === 'boolean'
              ? { stderrClosed: lifecycleEvent.stderrClosed }
              : {}),
          }];
        })
      : [];
    const rawToolTerminal = recordValue(data.toolTerminal);
    const safeToolTerminal =
      rawToolTerminal?.source === 'tool_result' ||
      rawToolTerminal?.source === 'tool_error' ||
      rawToolTerminal?.source === 'processor_cleanup'
        ? {
            source: rawToolTerminal.source,
            ...(typeof rawToolTerminal.confirmed === 'boolean'
              ? { confirmed: rawToolTerminal.confirmed }
              : {}),
          }
        : null;
    const toolCallIdHash = data.toolCallIdHash;
    if (typeof toolCallIdHash !== 'string' || !/^acp_[a-f0-9]{24}$/.test(toolCallIdHash)) {
      continue;
    }
    if (toolCallIds.has(toolCallIdHash)) continue;
    toolCallIds.add(toolCallIdHash);
    lifecycleCount += 1;

    if (data.trigger === 'exit' || data.trigger === 'abort' || data.trigger === 'deadline') {
      triggers.add(data.trigger);
    }
    if (
      data.terminal === 'running' || data.terminal === 'returned' ||
      data.terminal === 'failed' || data.terminal === 'interrupted'
    ) {
      terminals.add(data.terminal);
    }
    if (data.terminal === 'running') evidenceIncomplete = true;
    if (typeof data.droppedEvents === 'number' && data.droppedEvents > 0) {
      evidenceIncomplete = true;
    }

    const toolTerminal = safeToolTerminal;
    if (
      toolTerminal?.source === 'tool_result' ||
      toolTerminal?.source === 'tool_error' ||
      toolTerminal?.source === 'processor_cleanup'
    ) {
      terminalSources.add(toolTerminal.source);
      if (toolTerminal.source === 'processor_cleanup' || toolTerminal.confirmed !== true) {
        evidenceIncomplete = true;
      }
    } else {
      evidenceIncomplete = true;
    }

    if (safeLifecycleEvents.length > 0) {
      for (const lifecycleEvent of safeLifecycleEvents) {
        const phase = lifecycleEvent?.phase;
        if (phase === 'kill_requested') killRequested = true;
        if (phase === 'kill_sent') killSent = true;
        if (phase === 'kill_failed') killFailed = true;
        if (phase === 'stdout_close') stdoutCloseSeen = true;
        if (phase === 'stderr_close') stderrCloseSeen = true;
        if (phase === 'close') {
          childCloseSeen = true;
          if (lifecycleEvent?.stdoutClosed === true) stdoutCloseSeen = true;
          if (lifecycleEvent?.stderrClosed === true) stderrCloseSeen = true;
          if (lifecycleEvent?.stdoutClosed !== true || lifecycleEvent?.stderrClosed !== true) {
            evidenceIncomplete = true;
          }
        }
      }
    }
    if (lifecycleCount >= 64) break;
  }

  if (lifecycleCount === 0) return {};
  if (triggers.size > 0 && !childCloseSeen) evidenceIncomplete = true;
  if (killRequested && !killSent && !killFailed) evidenceIncomplete = true;
  return {
    tool_execution_lifecycle_seen: true,
    tool_execution_lifecycle_count_bucket: lifecycleCountBucket(lifecycleCount),
    tool_execution_trigger: collapseLifecycleEnum(triggers),
    tool_execution_terminal: collapseLifecycleEnum(terminals),
    tool_terminal_source: collapseLifecycleEnum(terminalSources),
    tool_kill_outcome: killFailed
      ? 'failed'
      : killSent
        ? 'sent'
        : killRequested
          ? 'requested'
          : 'none',
    tool_child_close_seen: childCloseSeen,
    tool_stdout_close_seen: stdoutCloseSeen,
    tool_stderr_close_seen: stderrCloseSeen,
    tool_execution_evidence_incomplete: evidenceIncomplete,
  };
}

export function summarizeRunToolProgress(
  events: RunEventForDiagnostics[] = [],
): RunToolProgress {
  // Pair normal events by id. Some degraded provider streams omit ids on both
  // sides, so pair those by count rather than treating every result as global.
  const outstandingToolUseIds = new Set<string>();
  let idlessToolUses = 0;
  let idlessToolResults = 0;
  let toolCallSeen = false;

  for (const event of events) {
    if (event.event === 'start') {
      outstandingToolUseIds.clear();
      idlessToolUses = 0;
      idlessToolResults = 0;
      toolCallSeen = false;
      continue;
    }
    const data = event.data && typeof event.data === 'object'
      ? event.data as Record<string, unknown>
      : {};
    if (data.type === 'tool_use') {
      toolCallSeen = true;
      if (typeof data.id === 'string') outstandingToolUseIds.add(data.id);
      else idlessToolUses += 1;
    }
    // A host-flushed tool_use still witnesses an actual open ACP tool; only
    // its manufactured result must be excluded from completion evidence.
    if (data.type === 'tool_result' && !isHostSynthesizedAcpEmission(data)) {
      if (typeof data.toolUseId === 'string') {
        outstandingToolUseIds.delete(data.toolUseId);
      } else {
        idlessToolResults += 1;
      }
    }
  }

  const hasOutstandingTool =
    outstandingToolUseIds.size > 0 ||
    idlessToolResults < idlessToolUses;
  return {
    toolCallSeen,
    toolResultSent: toolCallSeen && !hasOutstandingTool,
    hasOutstandingTool,
  };
}

function readStderrChunk(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.chunk === 'string') return obj.chunk;
  if (typeof obj.text === 'string') return obj.text;
  return null;
}

function readStdoutChunk(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.chunk === 'string') return obj.chunk;
  if (typeof obj.text === 'string') return obj.text;
  return null;
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).filter((line) => line.length > 0).length;
}

export function stderrLineCountBucket(count: number): StderrLineCountBucket {
  if (count <= 0) return 'none';
  if (count <= 5) return '1_5';
  if (count <= 20) return '6_20';
  if (count <= 100) return '21_100';
  return 'gt_100';
}

function truncateUtf8(value: string, maxBytes: number): {
  value: string;
  truncated: boolean;
} {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes <= maxBytes) return { value, truncated: false };
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), 'utf8') > maxBytes) {
    end -= 1;
  }
  return { value: value.slice(0, end), truncated: true };
}

function collectStreamTailSummary(
  events: RunEventForDiagnostics[] = [],
  eventName: string,
  readChunk: (data: unknown) => string | null,
): StreamTailSummary | undefined {
  let streamText = '';
  for (const event of events) {
    if (event.event !== eventName) continue;
    const chunk = readChunk(event.data);
    if (chunk) streamText += chunk;
  }
  const lineCount = countLines(streamText);
  if (lineCount <= 0) return undefined;

  const lines = streamText.trimEnd().split(/\r?\n/);
  const tailLines = lines.slice(-STDERR_TAIL_MAX_LINES);
  const lineTruncated = lines.length > tailLines.length;
  const redacted = redactSecrets(tailLines.join('\n'));
  const byteCapped = truncateUtf8(redacted, STDERR_TAIL_MAX_BYTES);

  return {
    tail: byteCapped.value,
    lineCount,
    truncated: lineTruncated || byteCapped.truncated,
  };
}

export function collectStderrTailSummary(
  events: RunEventForDiagnostics[] = [],
): StderrTailSummary | undefined {
  return collectStreamTailSummary(events, 'stderr', readStderrChunk);
}

export function collectStdoutTailSummary(
  events: RunEventForDiagnostics[] = [],
): StdoutTailSummary | undefined {
  return collectStreamTailSummary(events, 'stdout', readStdoutChunk);
}

export function summarizeRunDiagnosticsForAnalytics(args: {
  events?: RunEventForDiagnostics[];
  exitCode?: number | null;
  signal?: string | null;
  cancelRequested?: boolean;
  streamErrorSeen?: boolean;
  fatalRpcErrorSeen?: boolean;
  emptyOutputFailure?: boolean;
  firstTokenSeen?: boolean;
  artifactWriteSeen?: boolean;
  liveArtifactSeen?: boolean;
}): RunDiagnosticsAnalytics {
  const events = args.events ?? [];
  const toolProgress = summarizeRunToolProgress(events);
  const toolExecutionLifecycle = toolExecutionLifecycleAnalytics(events);
  let stderr = '';
  let stdout = '';
  let userVisibleOutputSeen = false;
  let approvalRequested = false;
  let artifactWriteSeen = args.artifactWriteSeen === true;
  let liveArtifactSeen = args.liveArtifactSeen === true;
  let recordedCloseReason: RunCloseReason | null = null;
  let resumeAutoReseeded = false;
  let amrOpenCodeDiagnostics: Partial<RunDiagnosticsAnalytics> = {};
  for (const event of events) {
    if (event.event === 'stderr') {
      const chunk = readStderrChunk(event.data);
      if (chunk) stderr += chunk;
    }
    if (event.event === 'stdout') {
      const chunk = readStdoutChunk(event.data);
      if (chunk) {
        stdout += chunk;
        userVisibleOutputSeen = true;
      }
    }
    const data = event.data && typeof event.data === 'object'
      ? event.data as Record<string, unknown>
      : {};
    if (data.type === 'text_delta' || data.type === 'thinking_delta') {
      const delta = typeof data.delta === 'string' ? data.delta : '';
      if (delta.length > 0) userVisibleOutputSeen = true;
    }
    if (data.type === 'diagnostic' && data.name === 'acp_approval_request') {
      approvalRequested = true;
    }
    if (event.event === 'diagnostic' && data.type === 'agent_resume_auto_reseed') {
      resumeAutoReseeded = true;
    }
    if (
      event.event === 'diagnostic' &&
      data.type === 'native_session_recovery' &&
      data.nativeSessionRecovery &&
      typeof data.nativeSessionRecovery === 'object' &&
      !Array.isArray(data.nativeSessionRecovery) &&
      (data.nativeSessionRecovery as Record<string, unknown>).state === 'auto_reseeded'
    ) {
      resumeAutoReseeded = true;
    }
    if (event.event === 'error') {
      const structured = amrOpenCodeDiagnosticsFromError(event.data);
      if (structured) amrOpenCodeDiagnostics = structured;
    }
    if (data.type === 'artifact') artifactWriteSeen = true;
    if (data.type === 'live_artifact' || event.event === 'live_artifact') {
      liveArtifactSeen = true;
    }
    if (
      event.event === 'diagnostic' &&
      data.type === 'runtime_close' &&
      typeof data.rpc_close_reason === 'string'
    ) {
      const reason = data.rpc_close_reason;
      if (
        reason === 'exit_0' ||
        reason === 'exit_nonzero' ||
        reason === 'signal' ||
        reason === 'cancel_requested' ||
        reason === 'stream_error' ||
        reason === 'fatal_rpc_error' ||
        reason === 'empty_output' ||
        reason === 'unknown'
      ) {
        recordedCloseReason = reason;
      }
    }
  }
  const stderrLineCount = countLines(stderr);
  const stdoutLineCount = countLines(stdout);
  const hasErrorEvent = events.some((event) => event.event === 'error');
  const stderrPresent = stderrLineCount > 0;
  const stdoutPresent = stdoutLineCount > 0;

  let diagnosticSource: RunDiagnosticSource = 'unknown';
  if (hasErrorEvent) diagnosticSource = 'error_event';
  else if (stderrPresent) diagnosticSource = 'stderr';
  else if (args.signal) diagnosticSource = 'signal';
  else if (typeof args.exitCode === 'number') diagnosticSource = 'exit_code';

  let rpcCloseReason: RunCloseReason = 'unknown';
  if (recordedCloseReason) rpcCloseReason = recordedCloseReason;
  else if (args.cancelRequested === true) rpcCloseReason = 'cancel_requested';
  else if (args.fatalRpcErrorSeen === true) rpcCloseReason = 'fatal_rpc_error';
  else if (args.streamErrorSeen === true) rpcCloseReason = 'stream_error';
  else if (args.emptyOutputFailure === true) rpcCloseReason = 'empty_output';
  else if (args.signal) rpcCloseReason = 'signal';
  else if (typeof args.exitCode === 'number') {
    rpcCloseReason = args.exitCode === 0 ? 'exit_0' : 'exit_nonzero';
  }

  return {
    diagnostic_source: diagnosticSource,
    stderr_present: stderrPresent,
    stderr_line_count_bucket: stderrLineCountBucket(stderrLineCount),
    stdout_present: stdoutPresent,
    stdout_line_count_bucket: stderrLineCountBucket(stdoutLineCount),
    rpc_close_reason: rpcCloseReason,
    first_token_seen: args.firstTokenSeen === true,
    user_visible_output_seen: userVisibleOutputSeen,
    tool_call_seen: toolProgress.toolCallSeen,
    tool_result_sent: toolProgress.toolResultSent,
    approval_requested: approvalRequested,
    artifact_write_seen: artifactWriteSeen,
    live_artifact_seen: liveArtifactSeen,
    resume_auto_reseeded: resumeAutoReseeded,
    ...amrOpenCodeDiagnostics,
    ...toolExecutionLifecycle,
  };
}
