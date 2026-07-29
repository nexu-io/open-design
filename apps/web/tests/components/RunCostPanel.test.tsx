// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunCostReport, RunCostResponse } from '@open-design/contracts';

import { RunCostPanel } from '../../src/components/RunCostPanel';
import { en } from '../../src/i18n/locales/en';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * A report whose rendered rows sum to a total of exactly 1.0, so every share
 * reads as a round percentage and no two rows collide on the same formatted
 * string. `cachedRead` is deliberately 0: the panel does not render it as a
 * row, and a non-zero value would make the fixture imply otherwise.
 */
function report(overrides: Partial<RunCostReport> = {}): RunCostReport {
  return {
    steps: [
      { index: 0, contextTokens: 12_000, cacheWriteTokens: 4_000, inputTokens: 900, outputTokens: 300, gapMs: null, incremental: true },
      { index: 1, contextTokens: 34_000, cacheWriteTokens: 0, inputTokens: 500, outputTokens: 200, gapMs: 1_200, incremental: false },
    ],
    terms: {
      preambleTokens: 20_000,
      transcriptTokens: 10_000,
      cacheWriteTokens: 4_000,
      uncachedInputTokens: 1_400,
      outputTokens: 500,
    },
    usd: {
      preamble: 0.5,
      transcript: 0.25,
      cachedRead: 0,
      cacheWrite: 0.15,
      uncachedInput: 0.04,
      output: 0.06,
      total: 1.0,
    },
    cacheHealth: { incrementalSteps: 1, comparableSteps: 1, rewrittenTokens: 0 },
    anomalies: [],
    output: {
      // Shares and byte sizes are kept distinct from every other section's
      // figures so a `getByText` assertion cannot match the wrong row.
      byTool: [
        { tool: 'Write', bytes: 2_097_152, share: 0.62 },
        { tool: 'Edit', bytes: 2_048, share: 0.21 },
        { tool: 'Bash', bytes: 512, share: 0.115 },
        { tool: 'Grep', bytes: 256, share: 0.033 },
        { tool: 'Glob', bytes: 128, share: 0.022 },
      ],
      proseBytes: 1_024,
      thinkingBytes: 64,
      totalBytes: 2_100_000,
    },
    intake: {
      byTool: [],
      items: [
        { tool: 'Read', label: 'src/alpha.ts', bytes: 100, stepIndex: 0, dragBytes: 40_960 },
        { tool: 'Read', label: 'src/beta.ts', bytes: 100, stepIndex: 1, dragBytes: 30_720 },
        { tool: 'Bash', label: 'pnpm guard', bytes: 100, stepIndex: 2, dragBytes: 20_480 },
        { tool: 'Read', label: 'src/delta.ts', bytes: 100, stepIndex: 3, dragBytes: 10_240 },
        { tool: 'Read', label: 'src/epsilon.ts', bytes: 100, stepIndex: 4, dragBytes: 5_120 },
      ],
      totalBytes: 500,
      totalDragBytes: 107_520,
      duplicateCalls: 0,
      duplicateBytes: 0,
    },
    rates: { inputPerMTok: 3.0, cachedReadPerMTok: 0.3, cacheWritePerMTok: 3.75, outputPerMTok: 15.0 },
    ...overrides,
  };
}

function stubFetch(body: RunCostResponse) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RunCostPanel', () => {
  it('shows the reading-the-log status while the request is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<RunCostPanel runId="run-1" />);
    expect(screen.getByText(en['runCost.loading'])).toBeTruthy();
  });

  it('reads the cost of the run it was given, url-encoding the id', async () => {
    // A run id reaches the panel as an opaque string; a raw `/` in it would
    // otherwise re-point the request at a different endpoint path.
    const fetchMock = stubFetch({ runId: 'run 1/2', report: report() });
    render(<RunCostPanel runId="run 1/2" />);
    await screen.findByText(en['runCost.total']);
    expect(fetchMock).toHaveBeenCalledWith('/api/runs/run%201%2F2/cost');
  });

  it('renders every cost term with its dollar figure and share of the total', async () => {
    stubFetch({ runId: 'run-1', report: report() });
    render(<RunCostPanel runId="run-1" />);

    await screen.findByText(en['runCost.total']);
    // Tuple-typed so destructuring stays definite under noUncheckedIndexedAccess.
    const expected: Array<[label: string, usd: string, share: string]> = [
      [en['runCost.preamble'], '$0.5000', '50.0%'],
      [en['runCost.transcript'], '$0.2500', '25.0%'],
      [en['runCost.cacheWrite'], '$0.1500', '15.0%'],
      [en['runCost.uncachedInput'], '$0.0400', '4.0%'],
      [en['runCost.output'], '$0.0600', '6.0%'],
    ];
    for (const [label, value, share] of expected) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(value)).toBeTruthy();
      expect(screen.getByText(share)).toBeTruthy();
    }
    expect(screen.getByText('$1.0000')).toBeTruthy();
  });

  it('carries the caveat that sub-agents cannot reduce the preamble term', async () => {
    // The panel exists to falsify the "split it across sub-agents" instinct, so
    // the hint is load-bearing product copy, not decoration.
    stubFetch({ runId: 'run-1', report: report() });
    render(<RunCostPanel runId="run-1" />);
    expect(await screen.findByText(en['runCost.preambleHint'])).toBeTruthy();
  });

  it('labels the figures as estimates and reports call count and peak context', async () => {
    stubFetch({ runId: 'run-1', report: report() });
    const { container } = render(<RunCostPanel runId="run-1" />);

    await screen.findByText(en['runCost.total']);
    const text = container.textContent ?? '';
    expect(text).toContain(en['runCost.estimateNote']);
    expect(text).toContain('2 model calls');
    // Peak, not last: step 1 is the largest context of the run.
    expect(text).toContain('context peaked at 34,000 tokens');
  });

  it('dashes out the shares when the run cost nothing, instead of dividing by zero', async () => {
    stubFetch({
      runId: 'run-1',
      report: report({
        usd: { preamble: 0, transcript: 0, cachedRead: 0, cacheWrite: 0, uncachedInput: 0, output: 0, total: 0 },
      }),
    });
    render(<RunCostPanel runId="run-1" />);

    await screen.findByText(en['runCost.total']);
    expect(screen.getAllByText('—')).toHaveLength(5);
    expect(screen.queryByText('NaN%')).toBeNull();
  });

  it('summarises cache health when there are steps to compare', async () => {
    stubFetch({
      runId: 'run-1',
      report: report({ cacheHealth: { incrementalSteps: 3, comparableSteps: 4, rewrittenTokens: 12_000 } }),
    });
    render(<RunCostPanel runId="run-1" />);
    expect(
      await screen.findByText('3/4 steps incremental, 12,000 tokens rewritten'),
    ).toBeTruthy();
  });

  it('says the cache is unjudgeable — not that nothing was written — when a write has no successor', async () => {
    // The contradiction this guards: a run that wrote a cache but made one
    // call has zero comparable steps. Reporting "no cache writes" there would
    // deny the non-zero Cache write row rendered directly above it.
    stubFetch({
      runId: 'run-1',
      report: report({
        terms: { preambleTokens: 20_000, transcriptTokens: 0, cacheWriteTokens: 4_000, uncachedInputTokens: 0, outputTokens: 500 },
        cacheHealth: { incrementalSteps: 0, comparableSteps: 0, rewrittenTokens: 0 },
      }),
    });
    render(<RunCostPanel runId="run-1" />);

    expect(await screen.findByText(en['runCost.cacheHealthNotComparable'])).toBeTruthy();
    expect(screen.queryByText(en['runCost.noCacheWrites'])).toBeNull();
  });

  it('reports no cache writes only when the adapter genuinely wrote none', async () => {
    stubFetch({
      runId: 'run-1',
      report: report({
        terms: { preambleTokens: 20_000, transcriptTokens: 0, cacheWriteTokens: 0, uncachedInputTokens: 0, outputTokens: 500 },
        cacheHealth: { incrementalSteps: 0, comparableSteps: 0, rewrittenTokens: 0 },
      }),
    });
    render(<RunCostPanel runId="run-1" />);

    expect(await screen.findByText(en['runCost.noCacheWrites'])).toBeTruthy();
    expect(screen.queryByText(en['runCost.cacheHealthNotComparable'])).toBeNull();
  });

  it('lists anomalies with their kind and originating step', async () => {
    stubFetch({
      runId: 'run-1',
      report: report({
        anomalies: [
          { kind: 'cache-invalidation', stepIndex: 3, tokens: 8_000, detail: 'prefix shrank by 8k' },
        ],
      }),
    });
    render(<RunCostPanel runId="run-1" />);

    await screen.findByText(en['runCost.total']);
    const text = document.body.textContent ?? '';
    expect(text).toContain('[cache-invalidation]');
    expect(text).toContain('step 3');
    expect(text).toContain('prefix shrank by 8k');
  });

  it('caps the output and intake breakdowns at four entries each', async () => {
    stubFetch({ runId: 'run-1', report: report() });
    render(<RunCostPanel runId="run-1" />);

    await screen.findByText(en['runCost.total']);
    expect(screen.getByText('Grep')).toBeTruthy();
    expect(screen.queryByText('Glob')).toBeNull();
    expect(screen.getByText('src/delta.ts')).toBeTruthy();
    expect(screen.queryByText('src/epsilon.ts')).toBeNull();
  });

  it('scales byte figures across B, KB and MB', async () => {
    stubFetch({ runId: 'run-1', report: report() });
    render(<RunCostPanel runId="run-1" />);

    await screen.findByText(en['runCost.total']);
    expect(screen.getByText('2.00 MB')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('512 B')).toBeTruthy();
    // Prose is rendered as its own row alongside the per-tool ones.
    expect(screen.getByText(en['runCost.prose'])).toBeTruthy();
  });

  it('explains itself when the run has a log but no usage frames', async () => {
    // A 200 carrying `report: null` is the documented shape for a run that
    // predates event-log persistence or whose stream never reported usage —
    // it is a reported outcome, not a request failure.
    stubFetch({ runId: 'run-1', report: null, unavailableReason: 'no-usage-frames' });
    render(<RunCostPanel runId="run-1" />);
    expect(await screen.findByText(en['runCost.unavailable'])).toBeTruthy();
  });

  it('falls back to the unavailable copy when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    render(<RunCostPanel runId="run-1" />);
    expect(await screen.findByText(en['runCost.unavailable'])).toBeTruthy();
  });

  it('refetches when the panel is pointed at a different run', async () => {
    const fetchMock = stubFetch({ runId: 'run-1', report: report() });
    const { rerender } = render(<RunCostPanel runId="run-1" />);
    await screen.findByText(en['runCost.total']);

    rerender(<RunCostPanel runId="run-2" />);
    await screen.findByText(en['runCost.total']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/runs/run-2/cost');
  });
});
