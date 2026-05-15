/**
 * Critique Theater Prometheus registry shape test (Phase 12).
 *
 * Asserts every series the dashboard depends on is registered in the
 * default registry and renders through `getCritiqueMetrics()` with the
 * documented metric type. A rename or accidental drop would otherwise
 * surface as an empty Grafana panel only at scrape time; this test
 * catches it inside the daemon vitest lane.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetCritiqueMetricsForTests,
  critiqueCompositeScore,
  critiqueDegradedTotal,
  critiqueInterruptedTotal,
  critiqueMustFixTotal,
  critiqueParserErrorsTotal,
  critiqueProtocolVersion,
  critiqueRoundDurationMs,
  critiqueRoundsTotal,
  critiqueRunsTotal,
  getCritiqueMetrics,
  register,
} from '../../src/metrics/index.js';

afterEach(() => __resetCritiqueMetricsForTests());

const EXPECTED_SERIES = [
  { name: 'open_design_critique_runs_total', type: 'counter' as const },
  { name: 'open_design_critique_rounds_total', type: 'counter' as const },
  { name: 'open_design_critique_round_duration_ms', type: 'histogram' as const },
  { name: 'open_design_critique_composite_score', type: 'histogram' as const },
  { name: 'open_design_critique_must_fix_total', type: 'counter' as const },
  { name: 'open_design_critique_degraded_total', type: 'counter' as const },
  { name: 'open_design_critique_interrupted_total', type: 'counter' as const },
  { name: 'open_design_critique_parser_errors_total', type: 'counter' as const },
  { name: 'open_design_critique_protocol_version', type: 'gauge' as const },
];

describe('critique metrics registry (Phase 12)', () => {
  it('registers every expected series in the default registry', () => {
    const registered = register
      .getMetricsAsArray()
      .map((m) => ({ name: m.name, type: m.type }));
    for (const want of EXPECTED_SERIES) {
      const match = registered.find((r) => r.name === want.name);
      expect(match, `expected ${want.name} to be registered`).toBeDefined();
      expect(match!.type).toBe(want.type);
    }
  });

  it('renders a happy-path bump into the exposition text', async () => {
    critiqueRunsTotal.inc({ status: 'shipped', adapter: 'mock', skill: 'unit-test' });
    critiqueRoundsTotal.inc({ adapter: 'mock', skill: 'unit-test' });
    critiqueRoundDurationMs.observe({ adapter: 'mock', skill: 'unit-test', round: '1' }, 1234);
    critiqueCompositeScore.observe({ adapter: 'mock', skill: 'unit-test' }, 8.6);
    critiqueMustFixTotal.inc({
      panelist: 'critic',
      dim: 'hierarchy',
      adapter: 'mock',
      skill: 'unit-test',
    });
    critiqueDegradedTotal.inc({ reason: 'malformed_block', adapter: 'mock' });
    critiqueInterruptedTotal.inc({ adapter: 'mock' });
    critiqueParserErrorsTotal.inc({ kind: 'composite_mismatch', adapter: 'mock' });
    critiqueProtocolVersion.set({ version: '1' }, 1);

    const text = await getCritiqueMetrics();
    expect(text).toContain('open_design_critique_runs_total{status="shipped",adapter="mock",skill="unit-test"} 1');
    expect(text).toContain('open_design_critique_rounds_total{adapter="mock",skill="unit-test"} 1');
    expect(text).toContain('open_design_critique_must_fix_total{panelist="critic",dim="hierarchy",adapter="mock",skill="unit-test"} 1');
    expect(text).toContain('open_design_critique_degraded_total{reason="malformed_block",adapter="mock"} 1');
    expect(text).toContain('open_design_critique_interrupted_total{adapter="mock"} 1');
    expect(text).toContain('open_design_critique_parser_errors_total{kind="composite_mismatch",adapter="mock"} 1');
    expect(text).toContain('open_design_critique_protocol_version{version="1"} 1');
    // Histogram exposes _bucket / _sum / _count lines instead of a flat value.
    expect(text).toContain('open_design_critique_round_duration_ms_bucket{');
    expect(text).toContain('open_design_critique_composite_score_bucket{');
  });

  it('resets the registry between tests so cases stay isolated', async () => {
    critiqueRunsTotal.inc({ status: 'shipped', adapter: 'a', skill: 's' }, 5);
    __resetCritiqueMetricsForTests();
    const text = await getCritiqueMetrics();
    expect(text).not.toContain('open_design_critique_runs_total{status="shipped",adapter="a",skill="s"} 5');
  });
});
