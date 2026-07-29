import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUN_COST_RATES,
  analyzeRunCost,
  type RunCostRates,
} from '../src/api/run-cost.js';

/**
 * Builds one `events.jsonl` line as the daemon writes it. The analyzer must
 * narrow this shape defensively — the file is append-only JSONL written across
 * daemon versions, so a caller can hand it anything.
 */
function usageEvent(
  usage: {
    cached_read_tokens?: number;
    cached_write_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  },
  timestamp = 0,
) {
  return { event: 'agent', data: { type: 'usage', usage }, timestamp };
}

function toolUse(id: string, name: string, input: unknown, timestamp = 0) {
  return { event: 'agent', data: { type: 'tool_use', id, name, input }, timestamp };
}

function toolResult(toolUseId: string, content: string, timestamp = 0) {
  return { event: 'agent', data: { type: 'tool_result', toolUseId, content }, timestamp };
}

function textDelta(delta: string, timestamp = 0) {
  return { event: 'agent', data: { type: 'text_delta', delta }, timestamp };
}

describe('analyzeRunCost — step curve', () => {
  it('reads the context curve off cached_read_tokens, one entry per usage frame', () => {
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0, cached_write_tokens: 100, output_tokens: 10 }, 1000),
      usageEvent({ cached_read_tokens: 100, cached_write_tokens: 50, output_tokens: 20 }, 3000),
      usageEvent({ cached_read_tokens: 150, cached_write_tokens: 25, output_tokens: 30 }, 6000),
    ]);

    expect(report.steps).toHaveLength(3);
    expect(report.steps.map((s) => s.contextTokens)).toEqual([0, 100, 150]);
    expect(report.steps.map((s) => s.cacheWriteTokens)).toEqual([100, 50, 25]);
    // Gap is null on the first step (nothing to measure against) and the
    // wall-clock delta thereafter — a gap over the cache TTL explains a rewrite.
    expect(report.steps.map((s) => s.gapMs)).toEqual([null, 2000, 3000]);
  });

  it('returns an empty report rather than throwing when there are no usage frames', () => {
    const report = analyzeRunCost([textDelta('hello')]);
    expect(report.steps).toEqual([]);
    expect(report.terms.outputTokens).toBe(0);
    expect(report.usd.total).toBe(0);
  });

  it('ignores malformed lines instead of poisoning the report', () => {
    const report = analyzeRunCost([
      null,
      'not an object',
      { event: 'agent' },
      { event: 'agent', data: { type: 'usage' } },
      usageEvent({ cached_read_tokens: 10, output_tokens: 5 }),
    ]);
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]?.contextTokens).toBe(10);
  });
});

describe('analyzeRunCost — term decomposition', () => {
  it('splits re-read context into the preamble floor and the transcript above it', () => {
    // Preamble is the floor of the curve: the smallest non-zero context any
    // step had to re-read. Three steps at 1000/1200/1500 means 1000 was paid
    // three times over as preamble, and only 700 is genuine accumulation.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 1000 }),
      usageEvent({ cached_read_tokens: 1200 }),
      usageEvent({ cached_read_tokens: 1500 }),
    ]);

    expect(report.terms.preambleTokens).toBe(3000);
    expect(report.terms.transcriptTokens).toBe(700);
  });

  it('excludes zero-context steps from the preamble floor', () => {
    // The first usage frame of a run reports cached_read 0 (nothing cached
    // yet). Treating that as the floor would zero out the preamble term and
    // misattribute the whole curve to transcript accumulation.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0 }),
      usageEvent({ cached_read_tokens: 500 }),
      usageEvent({ cached_read_tokens: 800 }),
    ]);

    expect(report.terms.preambleTokens).toBe(1000);
    expect(report.terms.transcriptTokens).toBe(300);
  });

  it('prices each term with the supplied rate card', () => {
    const rates: RunCostRates = {
      inputPerMTok: 3,
      cachedReadPerMTok: 0.3,
      cacheWritePerMTok: 3.75,
      outputPerMTok: 15,
    };
    const report = analyzeRunCost(
      [usageEvent({ cached_read_tokens: 1_000_000, cached_write_tokens: 1_000_000, input_tokens: 1_000_000, output_tokens: 1_000_000 })],
      { rates },
    );

    expect(report.usd.cachedRead).toBeCloseTo(0.3, 6);
    expect(report.usd.cacheWrite).toBeCloseTo(3.75, 6);
    expect(report.usd.uncachedInput).toBeCloseTo(3, 6);
    expect(report.usd.output).toBeCloseTo(15, 6);
    expect(report.usd.total).toBeCloseTo(22.05, 6);
  });

  it('defaults to the validated rate card when none is supplied', () => {
    const report = analyzeRunCost([usageEvent({ output_tokens: 1_000_000 })]);
    expect(report.usd.output).toBeCloseTo(DEFAULT_RUN_COST_RATES.outputPerMTok, 6);
  });
});

describe('analyzeRunCost — cache health', () => {
  it('marks a step incremental when its write equals the next step context delta', () => {
    // Optimal caching: what step i writes is exactly what step i+1 reads extra.
    // Written once at the write rate, then read at the cached rate forever.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0, cached_write_tokens: 1000 }),
      usageEvent({ cached_read_tokens: 1000, cached_write_tokens: 500 }),
      usageEvent({ cached_read_tokens: 1500, cached_write_tokens: 200 }),
    ]);

    expect(report.cacheHealth.incrementalSteps).toBe(2);
    expect(report.cacheHealth.rewrittenTokens).toBe(0);
    expect(report.anomalies).toEqual([]);
  });

  it('reports zero comparable steps for a single call that still wrote a cache', () => {
    // A write is only judgeable against the NEXT call's context growth, so a
    // one-call run has nothing to compare — even though it wrote 22k tokens.
    // `comparableSteps === 0` therefore does NOT imply "this adapter reported
    // no cache writes"; a surface that renders that message here contradicts
    // the cache-write term it just displayed. Caught on a live single-call run.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0, cached_write_tokens: 22_037, output_tokens: 529 }),
    ]);

    expect(report.cacheHealth.comparableSteps).toBe(0);
    expect(report.terms.cacheWriteTokens).toBe(22_037);
  });

  it('reports zero comparable steps AND zero write tokens when the adapter reports no writes', () => {
    // The other cause of `comparableSteps === 0`, kept distinct from the case
    // above so a surface can tell the two apart.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0, output_tokens: 10 }),
      usageEvent({ cached_read_tokens: 500, output_tokens: 10 }),
    ]);

    expect(report.cacheHealth.comparableSteps).toBe(0);
    expect(report.terms.cacheWriteTokens).toBe(0);
  });

  it('flags a rewrite when a step writes materially more than the next delta', () => {
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0, cached_write_tokens: 1000 }),
      usageEvent({ cached_read_tokens: 1000, cached_write_tokens: 5000 }),
      usageEvent({ cached_read_tokens: 1500, cached_write_tokens: 0 }),
    ]);

    expect(report.cacheHealth.rewrittenTokens).toBe(4500);
    expect(report.anomalies.some((a) => a.kind === 'cache-rewrite')).toBe(true);
  });

  it('calls a context drop an invalidation when the total context held steady', () => {
    // Context read collapses 8000 -> 2000 but the step writes 6500, so
    // read+write still totals ~8500: the content never left, only its cached
    // portion did. That is invalidation, NOT the model compacting its history.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 8000, cached_write_tokens: 500 }),
      usageEvent({ cached_read_tokens: 2000, cached_write_tokens: 6500 }),
      usageEvent({ cached_read_tokens: 8500, cached_write_tokens: 0 }),
    ]);

    const drop = report.anomalies.find((a) => a.kind === 'cache-invalidation');
    expect(drop).toBeDefined();
    expect(drop?.stepIndex).toBe(1);
    expect(report.anomalies.some((a) => a.kind === 'compaction')).toBe(false);
  });

  it('does not read a run-terminal zero-context frame as a compaction', () => {
    // Runs close with a summary `usage` frame that reports no cached read at
    // all. Treating that fall to zero as the history being summarised invents
    // an anomaly at the end of every healthy run.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 5000, cached_write_tokens: 100 }),
      usageEvent({ cached_read_tokens: 6000, cached_write_tokens: 100 }),
      usageEvent({ cached_read_tokens: 0, cached_write_tokens: 0, output_tokens: 0 }),
    ]);

    expect(report.anomalies).toEqual([]);
  });

  it('calls a context drop a compaction when the total context shrank with it', () => {
    // Context collapses and nothing is written back: the history itself got
    // summarised away. Cheap, and not a defect — must not be reported as one.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 8000, cached_write_tokens: 100 }),
      usageEvent({ cached_read_tokens: 2000, cached_write_tokens: 100 }),
      usageEvent({ cached_read_tokens: 2100, cached_write_tokens: 0 }),
    ]);

    expect(report.anomalies.some((a) => a.kind === 'compaction')).toBe(true);
    expect(report.anomalies.some((a) => a.kind === 'cache-invalidation')).toBe(false);
  });
});

describe('analyzeRunCost — output composition', () => {
  it('separates the deliverable from prose and thinking', () => {
    const report = analyzeRunCost([
      toolUse('t1', 'write', { filePath: '/p/index.html', content: 'x'.repeat(4000) }),
      toolUse('t2', 'bash', { command: 'ls -la' }),
      textDelta('Here you go.'),
      usageEvent({ output_tokens: 1200 }),
    ]);

    const write = report.output.byTool.find((t) => t.tool === 'write');
    expect(write).toBeDefined();
    expect(write!.bytes).toBeGreaterThan(4000);
    // Prose is tiny next to the artifact; the ratio is the point of the report.
    expect(report.output.proseBytes).toBe(Buffer.byteLength('Here you go.', 'utf8'));
    expect(report.output.thinkingBytes).toBe(0);
    expect(write!.share).toBeGreaterThan(0.9);
  });
});

describe('analyzeRunCost — intake drag', () => {
  it('weights each tool_result by how many later steps re-read it', () => {
    // Same payload size, different arrival step. The one that lands early is
    // dragged through every later step and costs multiples of the late one.
    const report = analyzeRunCost([
      toolUse('early', 'read', { filePath: '/a.json' }),
      toolResult('early', 'y'.repeat(1000)),
      usageEvent({ cached_read_tokens: 100 }),
      usageEvent({ cached_read_tokens: 200 }),
      usageEvent({ cached_read_tokens: 300 }),
      toolUse('late', 'read', { filePath: '/b.json' }),
      toolResult('late', 'z'.repeat(1000)),
      usageEvent({ cached_read_tokens: 400 }),
    ]);

    const early = report.intake.items.find((i) => i.label.includes('/a.json'));
    const late = report.intake.items.find((i) => i.label.includes('/b.json'));
    expect(early!.bytes).toBe(late!.bytes);
    expect(early!.dragBytes).toBeGreaterThan(late!.dragBytes);
  });

  it('counts a repeated call as duplicate only when the whole input matches', () => {
    // Paginated reads of one file are NOT redundant: same path, different
    // offset/limit. Deduping on path alone reports a false positive.
    const report = analyzeRunCost([
      toolUse('p1', 'read', { filePath: '/big.json', limit: 200 }),
      toolResult('p1', 'a'.repeat(500)),
      toolUse('p2', 'read', { filePath: '/big.json', limit: 300, offset: 200 }),
      toolResult('p2', 'b'.repeat(500)),
      toolUse('p3', 'read', { filePath: '/big.json', limit: 200 }),
      toolResult('p3', 'a'.repeat(500)),
      usageEvent({ cached_read_tokens: 100 }),
    ]);

    expect(report.intake.duplicateCalls).toBe(1);
    expect(report.intake.duplicateBytes).toBe(500);
  });

  it('groups intake totals by tool', () => {
    const report = analyzeRunCost([
      toolUse('a', 'read', { filePath: '/a' }),
      toolResult('a', 'x'.repeat(300)),
      toolUse('b', 'bash', { command: 'ls' }),
      toolResult('b', 'y'.repeat(700)),
      usageEvent({ cached_read_tokens: 10 }),
    ]);

    const byTool = Object.fromEntries(report.intake.byTool.map((t) => [t.tool, t.bytes]));
    expect(byTool.read).toBe(300);
    expect(byTool.bash).toBe(700);
  });
});
