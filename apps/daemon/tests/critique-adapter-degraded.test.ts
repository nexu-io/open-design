/**
 * Coverage for the degraded-adapter registry (Phase 10, Task 10.2).
 *
 * The registry is the routing gate: once an adapter is marked degraded
 * the orchestrator and the Settings UI both consult `isDegraded` before
 * dispatching a critique to it, so the TTL contract has to be airtight.
 * Tests drive a deterministic clock via the test-only seam so the 24h
 * boundary is reproducible.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ADAPTER_DEGRADED_DEFAULT_TTL_MS,
  __resetDegradedRegistryForTests,
  __setDegradedClockForTests,
  clearDegraded,
  getDegradedEntry,
  isDegraded,
  listDegraded,
  markDegraded,
} from '../src/critique/adapter-degraded.js';

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  __setDegradedClockForTests({ now: () => now });
});
afterEach(() => {
  __setDegradedClockForTests(null);
  __resetDegradedRegistryForTests();
});

describe('adapter-degraded registry (Phase 10)', () => {
  it('marks an adapter degraded with the default 24h TTL and reads it back', () => {
    const entry = markDegraded('pi-rpc', 'malformed_block');
    expect(entry.reason).toBe('malformed_block');
    expect(entry.markedAtMs).toBe(now);
    expect(entry.expiresAtMs).toBe(now + ADAPTER_DEGRADED_DEFAULT_TTL_MS);
    expect(isDegraded('pi-rpc')).toBe(true);
    expect(getDegradedEntry('pi-rpc')?.source).toBe('conformance');
  });

  it('accepts an explicit shorter TTL', () => {
    markDegraded('codex', 'oversize_block', 60_000, 'orchestrator');
    expect(isDegraded('codex')).toBe(true);
    now += 59_999;
    expect(isDegraded('codex')).toBe(true);
    now += 2;
    expect(isDegraded('codex')).toBe(false);
  });

  it('auto-evicts the entry on read once the TTL elapses', () => {
    markDegraded('claude-code', 'adapter_unsupported', 10_000);
    expect(isDegraded('claude-code')).toBe(true);
    now += 11_000;
    expect(getDegradedEntry('claude-code')).toBeNull();
    // Calling listDegraded now should not surface the evicted entry either.
    expect(listDegraded()).toEqual([]);
  });

  it('a second mark overrides an existing one (worst-recent wins)', () => {
    markDegraded('cursor-agent', 'malformed_block', 60_000);
    now += 1000;
    const renewed = markDegraded('cursor-agent', 'oversize_block', 60_000);
    expect(renewed.reason).toBe('oversize_block');
    expect(renewed.markedAtMs).toBe(now);
  });

  it('clearDegraded removes the mark and returns true when one existed', () => {
    markDegraded('gemini-cli', 'protocol_version_mismatch');
    expect(clearDegraded('gemini-cli')).toBe(true);
    expect(isDegraded('gemini-cli')).toBe(false);
    // Calling clear again on an already-clear adapter returns false.
    expect(clearDegraded('gemini-cli')).toBe(false);
  });

  it('listDegraded surfaces only currently-degraded adapters in insertion order', () => {
    markDegraded('a', 'malformed_block', 60_000);
    markDegraded('b', 'oversize_block', 60_000);
    markDegraded('c', 'missing_artifact', 30_000);
    now += 31_000; // expires `c`
    const live = listDegraded().map((e) => e.adapterId);
    expect(live).toEqual(['a', 'b']);
  });

  it('rejects empty adapter ids and non-positive TTLs', () => {
    expect(() => markDegraded('', 'malformed_block')).toThrow();
    expect(() => markDegraded('codex', 'malformed_block', 0)).toThrow();
    expect(() => markDegraded('codex', 'malformed_block', -1)).toThrow();
    expect(() => markDegraded('codex', 'malformed_block', Number.NaN)).toThrow();
  });
});
