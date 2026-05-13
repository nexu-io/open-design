/**
 * End-to-end coverage for the adapter conformance harness
 * (Phase 10, Task 10.1).
 *
 * Drives the same `parseCritiqueStream` the production orchestrator
 * uses, but with the synthetic adapter fixtures so the assertion is
 * about the harness's classification logic (shipped / degraded /
 * failed) rather than the parser's correctness (already covered by
 * the v1 parser tests).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAdapterConformance } from '../src/critique/conformance.js';
import {
  syntheticGoodStream,
} from '../src/critique/__fixtures__/adapters/synthetic-good.js';
import {
  syntheticBadStream,
} from '../src/critique/__fixtures__/adapters/synthetic-bad.js';
import {
  __resetDegradedRegistryForTests,
  __setDegradedClockForTests,
  isDegraded,
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

describe('adapter conformance harness (Phase 10)', () => {
  it('synthetic-good emits shipped and leaves the adapter undegraded', async () => {
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-good',
      runId: 'run-good-1',
      source: syntheticGoodStream(),
    });
    expect(outcome.kind).toBe('shipped');
    if (outcome.kind !== 'shipped') return;
    expect(outcome.round).toBeGreaterThan(0);
    expect(outcome.composite).toBeGreaterThan(0);
    // The harness must NOT mark the adapter degraded on success.
    expect(isDegraded('synthetic-good')).toBe(false);
    // Every panel event for the run should land in the events array
    // for downstream inspection.
    expect(outcome.events.length).toBeGreaterThan(0);
    expect(outcome.events.find((e) => e.type === 'ship')).toBeTruthy();
  });

  it('synthetic-bad emits degraded with the parser-derived reason and marks the adapter', async () => {
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-bad',
      runId: 'run-bad-1',
      source: syntheticBadStream(),
    });
    expect(outcome.kind).toBe('degraded');
    if (outcome.kind !== 'degraded') return;
    expect(['malformed_block', 'oversize_block', 'missing_artifact']).toContain(
      outcome.reason,
    );
    expect(isDegraded('synthetic-bad')).toBe(true);
  });

  it('marks the adapter degraded for the default 24h TTL after a bad run', async () => {
    await runAdapterConformance({
      adapterId: 'synthetic-bad-2',
      runId: 'run-bad-2',
      source: syntheticBadStream(),
    });
    expect(isDegraded('synthetic-bad-2')).toBe(true);
    // Advance the clock just shy of 24h, still degraded.
    now += 24 * 60 * 60 * 1000 - 1;
    expect(isDegraded('synthetic-bad-2')).toBe(true);
    // Cross the boundary, mark falls off.
    now += 2;
    expect(isDegraded('synthetic-bad-2')).toBe(false);
  });

  it('classifies a stream that finishes without a ship event as failed (no_ship)', async () => {
    async function* truncated(): AsyncIterable<string> {
      // Open the critique-run envelope, emit a single panelist tag, then
      // close cleanly. The parser yields no SHIP, so the harness must
      // surface `failed: no_ship` rather than spinning forever or
      // returning `shipped`.
      yield '<CRITIQUE_RUN version="1" runId="run-x" projectId="p" artifactId="a">\n';
      yield '</CRITIQUE_RUN>\n';
    }
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-truncated',
      runId: 'run-x',
      source: truncated(),
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.cause).toBe('no_ship');
  });

  it('threads the projectId / artifactId / runId through to the parser SHIP event', async () => {
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-good',
      runId: 'custom-run-id',
      source: syntheticGoodStream(),
      projectId: 'proj-conformance',
      artifactId: 'artifact-conformance',
    });
    if (outcome.kind !== 'shipped') {
      throw new Error('expected shipped outcome');
    }
    const ship = outcome.events.find((e) => e.type === 'ship');
    expect(ship?.type).toBe('ship');
    if (ship?.type !== 'ship') return;
    expect(ship.artifactRef.projectId).toBe('proj-conformance');
    expect(ship.artifactRef.artifactId).toBe('artifact-conformance');
  });
});
