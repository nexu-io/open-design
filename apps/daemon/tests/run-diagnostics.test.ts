import { describe, expect, it } from 'vitest';

import {
  collectStderrTailSummary,
  summarizeRunDiagnosticsForAnalytics,
} from '../src/run-diagnostics.js';

describe('run diagnostics', () => {
  it('summarizes stderr into redacted bounded tails for Langfuse', () => {
    const events = Array.from({ length: 25 }, (_, i) => ({
      event: 'stderr',
      data: {
        chunk: `line ${i + 1} OPENAI_API_KEY=sk-${'a'.repeat(48)}\n`,
      },
    }));

    const summary = collectStderrTailSummary(events);

    expect(summary).toBeTruthy();
    expect(summary?.lineCount).toBe(25);
    expect(summary?.truncated).toBe(true);
    expect(summary?.tail).toContain('line 6');
    expect(summary?.tail).toContain('[REDACTED:sk_key]');
    expect(summary?.tail).not.toContain('sk-');
  });

  it('returns only low-cardinality stderr fields for PostHog analytics', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stderr', data: { chunk: 'warning 1\nwarning 2\n' } },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toEqual({
      diagnostic_source: 'stderr',
      stderr_present: true,
      stderr_line_count_bucket: '1_5',
    });
  });

  it('counts stderr lines from the merged stream, not per-chunk', () => {
    // The merged stream is exactly 5 non-empty lines ('1_5' bucket), but the
    // final line is split across two chunks. Summing per-chunk counts would
    // double-count the split line as 6 lines and drift into the '6_20' bucket.
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stderr', data: { chunk: 'line1\nline2\nline3\nline4\nli' } },
        { event: 'stderr', data: { chunk: 'ne5' } },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toEqual({
      diagnostic_source: 'stderr',
      stderr_present: true,
      stderr_line_count_bucket: '1_5',
    });
  });

  it('prefers structured error events over stderr as diagnostic source', () => {
    const result = summarizeRunDiagnosticsForAnalytics({
      events: [
        { event: 'stderr', data: { chunk: 'raw provider warning\n' } },
        { event: 'error', data: { message: 'typed failure' } },
      ],
      exitCode: 1,
      signal: null,
    });

    expect(result).toEqual({
      diagnostic_source: 'error_event',
      stderr_present: true,
      stderr_line_count_bucket: '1_5',
    });
  });
});
