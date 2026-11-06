import { expect, test, vi } from 'vitest';
import {
  createWriteProgressObserver,
  sanitizeWriteProgress,
  projectWriteProgressDiagnostic,
} from '../src/agent-protocol/acp/write-progress.js';
const fact = {
  version: 1,
  phase: 'input_started',
  atMs: 100,
  callID: 'write',
  messageID: 'assistant',
};

test('Write metadata is rebuilt from bounded typed fields', () => {
  const result = sanitizeWriteProgress({
    ...fact,
    inputBytes: 0,
    inputEnded: false,
    hasContent: false,
    content: 'SECRET',
    filePath: '/private/path',
    errorKind: 'schema_invalid',
    error: 'private error',
  });
  expect(result).toMatchObject({
    inputBytes: 0,
    inputEnded: false,
    hasContent: false,
    errorKind: 'schema_invalid',
  });
  expect(JSON.stringify(result)).not.toMatch(/SECRET|private|"callID"|"messageID"/);
  for (const invalid of [
    { version: 2 },
    { atMs: NaN },
    { inputBytes: -1 },
    { deltaCount: Infinity },
    { hasContent: 'yes' },
    { phase: 'SECRET' },
    { callID: 'x'.repeat(257) },
    { errorKind: 'SECRET' },
  ]) {
    expect(sanitizeWriteProgress({ ...fact, ...invalid })).toBeNull();
  }
});

test('Write silence snapshots distinguish stream completion from execution and stop after close', async () => {
  vi.useFakeTimers();
  try {
    const events: any[] = [];
    const observer = createWriteProgressObserver((e) => events.push(e));
    observer.observe({ ...fact, inputBytes: 44, inputEnded: false });
    observer.observe({ ...fact, phase: 'stream_finished', inputBytes: 44, inputEnded: false });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(events.filter((e) => e.reason === 'no_progress')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      inputBytes: 44,
      inputEnded: false,
      executionSettled: false,
    });
    observer.observe({ ...fact, phase: 'execution_returned' });
    observer.observe({ ...fact, phase: 'result_observed' });
    observer.observe({ ...fact, phase: 'stream_failed', errorKind: 'stream_error' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(events.filter((e) => e.reason === 'no_progress')).toHaveLength(1);
    observer.close();
    expect(events.filter((e) => e.reason === 'session_closed')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test('Write diagnostics cap calls, deduplicate phases, and rate limit progress', () => {
  vi.useFakeTimers();
  try {
    const events: unknown[] = [];
    const observer = createWriteProgressObserver((e) => events.push(e));
    for (let i = 0; i < 100; i++) observer.observe({ ...fact, callID: String(i) });
    expect(events).toHaveLength(64);
    for (let i = 0; i < 100; i++) observer.observe({ ...fact, callID: '0' });
    expect(events).toHaveLength(64);
    for (let i = 0; i < 200; i++) {
      observer.observe({ ...fact, callID: '0', phase: 'input_progress', inputBytes: i });
      vi.advanceTimersByTime(5000);
    }
    expect(
      events.filter((e: any) => e.phase === 'input_progress' && e.name === 'write_progress'),
    ).toHaveLength(120);
    observer.close();
    const count = events.length;
    observer.observe(fact);
    vi.advanceTimersByTime(120_000);
    expect(events).toHaveLength(count);
    expect(() => {
      const broken = createWriteProgressObserver(() => {
        throw new Error('sink unavailable');
      });
      broken.observe(fact);
      broken.close();
    }).not.toThrow();
  } finally {
    vi.useRealTimers();
  }
});

test('Write trace projection revalidates persisted metadata and never trusts raw IDs', () => {
  const diagnostic = sanitizeWriteProgress({
    ...fact,
    inputBytes: 44,
    errorKind: 'schema_invalid',
  });
  const result = projectWriteProgressDiagnostic({
    ...diagnostic,
    content: 'SECRET',
    stack: '/private/path',
    callID: 'private-id',
    phase: 'validation_failed',
    messageID: 'private-message',
  });
  expect(result).toMatchObject({
    inputBytes: 44,
    errorKind: 'schema_invalid',
    phase: 'validation_failed',
  });
  expect(JSON.stringify(result)).not.toMatch(/SECRET|private/);
  expect(
    projectWriteProgressDiagnostic({ ...diagnostic, toolCallIdHash: '/private/path' }),
  ).toBeNull();
  expect(projectWriteProgressDiagnostic({ ...diagnostic, version: 2 })).toBeNull();
});
