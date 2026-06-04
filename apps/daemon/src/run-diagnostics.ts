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

export interface StderrTailSummary {
  tail: string;
  lineCount: number;
  truncated: boolean;
}

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
  let stderr = '';
  for (const event of events) {
    if (event.event !== 'stderr') continue;
    const chunk = readStderrChunk(event.data);
    if (chunk) stderr += chunk;
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
  };
}
