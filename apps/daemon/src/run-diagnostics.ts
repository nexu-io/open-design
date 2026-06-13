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
  artifact_write_seen: boolean;
  live_artifact_seen: boolean;
}

export interface StreamTailSummary {
  tail: string;
  lineCount: number;
  truncated: boolean;
}

export type StderrTailSummary = StreamTailSummary;
export type StdoutTailSummary = StreamTailSummary;

const STDERR_TAIL_MAX_LINES = 20;
const STDERR_TAIL_MAX_BYTES = 4 * 1024;

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
  let stderr = '';
  let stdout = '';
  let userVisibleOutputSeen = false;
  let toolCallSeen = false;
  let artifactWriteSeen = args.artifactWriteSeen === true;
  let liveArtifactSeen = args.liveArtifactSeen === true;
  let recordedCloseReason: RunCloseReason | null = null;
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
    if (data.type === 'tool_use') toolCallSeen = true;
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
    tool_call_seen: toolCallSeen,
    artifact_write_seen: artifactWriteSeen,
    live_artifact_seen: liveArtifactSeen,
  };
}
