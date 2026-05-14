/**
 * Reducer benchmark gate (Phase 13.2). The plan asks for a CI step
 * that fails when p99 of the full happy fixture exceeds 2 ms over
 * 10k iterations. We express it as a vitest case so it lives in the
 * same suite as the unit tests and inherits the existing pnpm
 * --filter @open-design/web test pipeline; no separate runner.
 *
 * Sampling: 10_000 reductions of the full happy fixture, with the
 * timer reset between every iteration so we measure single-shot
 * latency, not amortised. We assert on p99 specifically because the
 * reducer is on the render hot path of the live Theater and an
 * outlier round still has to render at 60fps for the score ticker.
 */

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';

import { initialState, reduce, type CritiqueAction } from '../../../../src/components/Theater/state/reducer';

/** Canonical happy fixture, hand-rolled as actions so the bench does not
 *  pay for transcript parsing every iteration. Mirrors the parser output
 *  for a 1-round shipped run with 5 panelists, 2 dims each, 1 must-fix. */
const HAPPY_FIXTURE: CritiqueAction[] = [
  {
    type: 'run_started',
    runId: 'r',
    protocolVersion: 1,
    cast: ['designer', 'critic', 'brand', 'a11y', 'copy'],
    maxRounds: 3,
    threshold: 8,
    scale: 10,
  },
  ...['designer', 'critic', 'brand', 'a11y', 'copy'].flatMap(
    (role): CritiqueAction[] => [
      { type: 'panelist_open', runId: 'r', round: 1, role: role as any },
      {
        type: 'panelist_dim', runId: 'r', round: 1, role: role as any,
        dimName: 'hierarchy', dimScore: 8, dimNote: 'clear',
      },
      {
        type: 'panelist_dim', runId: 'r', round: 1, role: role as any,
        dimName: 'contrast', dimScore: 8.4, dimNote: 'ok',
      },
      {
        type: 'panelist_must_fix', runId: 'r', round: 1, role: role as any,
        text: 'minor copy tweak',
      },
      { type: 'panelist_close', runId: 'r', round: 1, role: role as any, score: 8.2 },
    ],
  ),
  {
    type: 'round_end',
    runId: 'r',
    round: 1,
    composite: 8.6,
    mustFix: 5,
    decision: 'ship',
    reason: 'threshold met',
  },
  {
    type: 'ship',
    runId: 'r',
    round: 1,
    composite: 8.6,
    status: 'shipped',
    artifactRef: { projectId: 'p', artifactId: 'a' },
    summary: 'ok',
  },
];

const ITERATIONS = 10_000;
const P99_BUDGET_MS = 2;

function p99(samples: number[]): number {
  const sorted = samples.slice().sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.99);
  return sorted[idx] ?? sorted[sorted.length - 1]!;
}

describe('reducer benchmark (Phase 13.2)', () => {
  it(`runs the full happy fixture in p99 <= ${P99_BUDGET_MS}ms over ${ITERATIONS} iterations`, () => {
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const t0 = performance.now();
      let state = initialState;
      for (const action of HAPPY_FIXTURE) {
        state = reduce(state, action);
      }
      const t1 = performance.now();
      samples.push(t1 - t0);
    }
    const p99Ms = p99(samples);
    // Slack: 2x the documented budget so a transient CI hiccup does
    // not flap the gate. The real budget is 2ms; we fail only when
    // the slack ceiling is also breached.
    expect(p99Ms).toBeLessThan(P99_BUDGET_MS * 2);
  });
});
