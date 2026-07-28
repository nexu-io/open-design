import { redactSecrets } from './redact.js';

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

export interface RunDiagnosticsAnalytics {
  diagnostic_source: RunDiagnosticSource;
  stderr_present: boolean;
  stderr_line_count_bucket: StderrLineCountBucket;
}

<<<<<<< HEAD
export interface StderrTailSummary {
=======
export interface RunToolProgress {
  toolCallSeen: boolean;
  toolResultSent: boolean;
  hasOutstandingTool: boolean;
}

export interface StreamTailSummary {
>>>>>>> upstream/main
  tail: string;
  lineCount: number;
  truncated: boolean;
}

const STDERR_TAIL_MAX_LINES = 20;
const STDERR_TAIL_MAX_BYTES = 4 * 1024;

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
    const data = event.data && typeof event.data === 'object'
      ? event.data as Record<string, unknown>
      : {};
    if (data.type === 'tool_use') {
      toolCallSeen = true;
      if (typeof data.id === 'string') outstandingToolUseIds.add(data.id);
      else idlessToolUses += 1;
    }
    if (data.type === 'tool_result') {
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

export function collectStderrTailSummary(
  events: RunEventForDiagnostics[] = [],
): StderrTailSummary | undefined {
  let stderr = '';
  for (const event of events) {
    if (event.event !== 'stderr') continue;
    const chunk = readStderrChunk(event.data);
    if (chunk) stderr += chunk;
  }
  const lineCount = countLines(stderr);
  if (lineCount <= 0) return undefined;

  const lines = stderr.trimEnd().split(/\r?\n/);
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

export function summarizeRunDiagnosticsForAnalytics(args: {
  events?: RunEventForDiagnostics[];
  exitCode?: number | null;
  signal?: string | null;
}): RunDiagnosticsAnalytics {
  const events = args.events ?? [];
  const toolProgress = summarizeRunToolProgress(events);
  let stderr = '';
<<<<<<< HEAD
  for (const event of events) {
    if (event.event !== 'stderr') continue;
    const chunk = readStderrChunk(event.data);
    if (chunk) stderr += chunk;
=======
  let stdout = '';
  let userVisibleOutputSeen = false;
  let approvalRequested = false;
  let artifactWriteSeen = args.artifactWriteSeen === true;
  let liveArtifactSeen = args.liveArtifactSeen === true;
  let recordedCloseReason: RunCloseReason | null = null;
  let resumeAutoReseeded = false;
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
>>>>>>> upstream/main
  }
  const stderrLineCount = countLines(stderr);
  const hasErrorEvent = events.some((event) => event.event === 'error');
  const stderrPresent = stderrLineCount > 0;

  let diagnosticSource: RunDiagnosticSource = 'unknown';
  if (hasErrorEvent) diagnosticSource = 'error_event';
  else if (stderrPresent) diagnosticSource = 'stderr';
  else if (args.signal) diagnosticSource = 'signal';
  else if (typeof args.exitCode === 'number') diagnosticSource = 'exit_code';

  return {
    diagnostic_source: diagnosticSource,
    stderr_present: stderrPresent,
    stderr_line_count_bucket: stderrLineCountBucket(stderrLineCount),
<<<<<<< HEAD
=======
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
>>>>>>> upstream/main
  };
}
