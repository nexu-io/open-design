/**
 * Reducer p99 regression gate (Phase 13.1). The plan asks for a CI
 * step that fails when p99 of a full happy-fixture replay exceeds the
 * documented `2ms` budget over 10k iterations. We express it as a
 * vitest case so it lives in the same suite as the unit tests and
 * inherits the existing `pnpm --filter @open-design/web test`
 * pipeline; no separate runner.
 *
 * What this measures:
 *
 *   The unit of work timed per sample is ONE full happy-fixture
 *   replay (27 reducer dispatches: 1 run_started + 5 panelists x 4
 *   lifecycle events each + 1 round_end + 1 ship). We time the batch,
 *   not each dispatch, because a single reducer call lands around
 *   2µs, which is below the deterministic resolution of
 *   `performance.now()` in node + jsdom. Batching 27 dispatches
 *   pulls the sample into the deterministically-measurable range
 *   (~10-50µs) without losing the property we care about: a
 *   regression in any one reducer branch shows up immediately as
 *   batch-time growth.
 *
 *   The gate trips at `p99 < 2x the 2ms documented budget` (4ms).
 *   The 2x slack is for CI runners that share cores with neighbours
 *   and for the harness's wall-clock timer (`performance.now`)
 *   counting GC pauses against us. Real regressions look like 20ms
 *   or 200ms p99, not 4.001ms.
 *
 * Baseline (sample local run, 2026-05-11, Node 24, Win11):
 *
 *   p50 = 0.011ms · p90 = 0.013ms · p99 = 0.018ms · max = 0.244ms
 *
 *   The gate's 4ms ceiling is ~222x current p99. Plenty of headroom
 *   for real regressions to land without flapping CI on jitter.
 *   `pnpm vitest run tests/components/Theater/state/reducer-bench.test.ts`
 *   prints the full distribution on every run so a reviewer can see
 *   how close the actual reading is to the ceiling (lefarcen Q3 on
 *   PR #1318: "what does Gate 1 print when it trips?").
 *
 * Maintenance: when the reducer grows new branches that materially
 * change cost (e.g. a histogram per dispatch), capture a fresh
 * baseline by running the suite locally and update the baseline
 * line above. Keep the ceiling at `BUDGET * 2` unless the actual
 * p99 climbs above ~0.5ms (then re-evaluate whether the regression
 * is real before relaxing the gate).
 */

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';

import {
  initialState,
  reduce,
  type CritiqueAction,
} from '../../../../src/components/Theater/state/reducer';
import type { PanelistRole } from '@open-design/contracts/critique';

const ROLES: PanelistRole[] = ['designer', 'critic', 'brand', 'a11y', 'copy'];

/** Canonical happy fixture, hand-rolled as actions so the bench does not
 *  pay for transcript parsing every iteration. Mirrors the parser output
 *  for a 1-round shipped run with 5 panelists, 2 dims each, 1 must-fix. */
const HAPPY_FIXTURE: CritiqueAction[] = [
  {
    type: 'run_started',
    runId: 'r',
    protocolVersion: 1,
    cast: [...ROLES],
    maxRounds: 3,
    threshold: 8,
    scale: 10,
  },
  ...ROLES.flatMap((role): CritiqueAction[] => [
    { type: 'panelist_open', runId: 'r', round: 1, role },
    {
      type: 'panelist_dim', runId: 'r', round: 1, role,
      dimName: 'hierarchy', dimScore: 8, dimNote: 'clear',
    },
    {
      type: 'panelist_dim', runId: 'r', round: 1, role,
      dimName: 'contrast', dimScore: 8.4, dimNote: 'ok',
    },
    {
      type: 'panelist_must_fix', runId: 'r', round: 1, role,
      text: 'minor copy tweak',
    },
    { type: 'panelist_close', runId: 'r', round: 1, role, score: 8.2 },
  ]),
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
const BUDGET_MS = 2;
const CEILING_MS = BUDGET_MS * 2;

interface Distribution {
  p50: number;
  p90: number;
  p99: number;
  max: number;
  samples: number;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx]!;
}

function summarise(samples: number[]): Distribution {
  const sorted = samples.slice().sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1]!,
    samples: sorted.length,
  };
}

function fmt(d: Distribution): string {
  return `p50=${d.p50.toFixed(3)}ms p90=${d.p90.toFixed(3)}ms `
    + `p99=${d.p99.toFixed(3)}ms max=${d.max.toFixed(3)}ms `
    + `(samples=${d.samples}, ceiling=${CEILING_MS}ms)`;
}

describe('reducer p99 regression gate (Phase 13.1)', () => {
  it(`p99 of a full happy-fixture replay stays under ${CEILING_MS}ms over ${ITERATIONS} iterations`, () => {
    const samples: number[] = new Array(ITERATIONS);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const t0 = performance.now();
      let state = initialState;
      for (const action of HAPPY_FIXTURE) {
        state = reduce(state, action);
      }
      const t1 = performance.now();
      samples[i] = t1 - t0;
    }
    const dist = summarise(samples);
    // Failure message carries the full distribution so a triage
    // reader can tell a real 20ms regression from a 4.001ms CI
    // hiccup without re-running locally (lefarcen Q3 on PR #1318).
    expect(
      dist.p99,
      `reducer p99 regression: ${fmt(dist)}`,
    ).toBeLessThan(CEILING_MS);
  });
});
