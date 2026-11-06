/**
 * Critique Theater structured logger test (Phase 12).
 *
 * Captures `process.stdout.write` while `logCritique` fires, parses the
 * resulting JSON lines, and asserts the documented event shape. Locks
 * the contract so an ingest pipeline (Loki / Datadog / Cloudwatch) that
 * keys on `namespace=critique` and `event=...` does not silently break
 * after a future refactor.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { logCritique } from '../../src/logging/critique.js';

let captured: string[] = [];
let originalWrite: typeof process.stdout.write;

beforeEach(() => {
  captured = [];
  originalWrite = process.stdout.write.bind(process.stdout);
  // Reassign rather than `vi.spyOn` because Node's overloaded
  // `process.stdout.write` signature (string | Uint8Array, optional
  // encoding, optional callback) does not narrow under
  // MockInstance<unknown>. The override below captures the string
  // form the logger uses and forwards bytes to the original sink
  // for everything else so unrelated test output is not swallowed.
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
    if (typeof chunk === 'string') {
      captured.push(chunk);
      return true;
    }
    return (originalWrite as (chunk: unknown, ...rest: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

function parseLines(): Array<Record<string, unknown>> {
  return captured
    .join('')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('logCritique structured events (Phase 12)', () => {
  it('emits run_started with adapter / skill / protocolVersion', () => {
    logCritique({
      event: 'run_started',
      runId: 'r-1',
      adapter: 'mock',
      skill: 'unit-test',
      protocolVersion: 1,
    });
    const lines = parseLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'run_started',
      runId: 'r-1',
      adapter: 'mock',
      skill: 'unit-test',
      protocolVersion: 1,
      namespace: 'critique',
    });
    expect(typeof lines[0]!.timestamp).toBe('string');
  });

  it('emits round_closed with composite / mustFix / decision', () => {
    logCritique({
      event: 'round_closed',
      runId: 'r-1',
      round: 1,
      composite: 8.6,
      mustFix: 0,
      decision: 'ship',
    });
    expect(parseLines()[0]).toMatchObject({
      event: 'round_closed',
      round: 1,
      composite: 8.6,
      mustFix: 0,
      decision: 'ship',
      namespace: 'critique',
    });
  });

  it('emits run_shipped / degraded / parser_recover / run_failed', () => {
    logCritique({
      event: 'run_shipped', runId: 'r-1', round: 1, composite: 8.6, status: 'shipped',
    });
    logCritique({
      event: 'degraded', runId: 'r-2', reason: 'malformed_block', adapter: 'mock',
    });
    logCritique({
      event: 'parser_recover', runId: 'r-3', kind: 'composite_mismatch', position: 12,
    });
    logCritique({
      event: 'run_failed', runId: 'r-4', cause: 'cli_exit_nonzero',
    });
    const lines = parseLines();
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.event)).toEqual([
      'run_shipped', 'degraded', 'parser_recover', 'run_failed',
    ]);
    for (const line of lines) {
      expect(line.namespace).toBe('critique');
      expect(typeof line.timestamp).toBe('string');
    }
  });

  it('writes exactly one newline-terminated line per call', () => {
    logCritique({ event: 'run_started', runId: 'r-1', adapter: 'm', skill: 's', protocolVersion: 1 });
    logCritique({ event: 'run_started', runId: 'r-2', adapter: 'm', skill: 's', protocolVersion: 1 });
    const joined = captured.join('');
    const lines = joined.split('\n');
    // joined ends with '\n' so split produces a trailing empty string.
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
  });
});
