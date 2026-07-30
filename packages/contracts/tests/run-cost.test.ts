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

/**
 * A usage line carrying whatever field names a provider actually ships, for the
 * accounting matrix below. `usageEvent` above is deliberately typed to the
 * already-normalized OpenCode shape; this one exists to prove the analyzer does
 * NOT depend on that shape.
 */
function rawUsageEvent(usage: Record<string, unknown>, timestamp = 0) {
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
    // `cached_read_tokens` is an OpenAI-family alias, so `input_tokens` is
    // INCLUSIVE of it: 2M input containing 1M cache reads leaves 1M uncached.
    // The earlier 1M/1M fixture was internally inconsistent — it declared an
    // input that was entirely cached and then expected a full 1M to be billed
    // at the uncached rate, which is the double-charge this release fixes.
    const report = analyzeRunCost(
      [usageEvent({ cached_read_tokens: 1_000_000, cached_write_tokens: 1_000_000, input_tokens: 2_000_000, output_tokens: 1_000_000 })],
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
  it('weights each tool_result by how many later calls re-read it, excluding its producer', () => {
    // Same payload size, different arrival step. Asserted as EXACT counts, not
    // just early > late: an off-by-one satisfies the inequality while still
    // reordering the "heaviest drag" ranking this feature exists to produce.
    //
    // In the persisted order a result precedes its producing call's usage frame,
    // so `/a.json` is produced by call 0 and `/b.json` by call 3 of 4.
    //   - `/a.json`: re-read by calls 1, 2, 3 → 3 calls, NOT 4. The call that
    //     produced it cannot have re-read it.
    //   - `/b.json`: no call follows it → 0. It is dragged nowhere, so it must
    //     not be charged one unit.
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
    expect(early!.bytes).toBe(1000);
    expect(late!.bytes).toBe(1000);
    expect(early!.stepIndex).toBe(0);
    expect(late!.stepIndex).toBe(3);
    expect(early!.dragBytes).toBe(3000);
    expect(late!.dragBytes).toBe(0);
    expect(report.intake.totalDragBytes).toBe(3000);
  });

  it('charges a mid-run result only the calls that follow it', () => {
    // Produced by call 1 of 4 → re-read by calls 2 and 3.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 100 }),
      toolUse('mid', 'read', { filePath: '/m.json' }),
      toolResult('mid', 'x'.repeat(500)),
      usageEvent({ cached_read_tokens: 200 }),
      usageEvent({ cached_read_tokens: 300 }),
      usageEvent({ cached_read_tokens: 400 }),
    ]);

    const mid = report.intake.items.find((i) => i.label.includes('/m.json'));
    expect(mid!.stepIndex).toBe(1);
    expect(mid!.dragBytes).toBe(500 * 2);
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

/**
 * The accounting matrix. Every supported runtime ships its own field names AND
 * its own convention for what `input_tokens` means, and the analyzer must not
 * depend on the already-normalized OpenCode shape. Reading `cached_read_tokens`
 * literally reported ZERO context for every Anthropic-shaped payload — the
 * central output of this feature, silently wrong on the most common runtime.
 */
describe('analyzeRunCost — provider accounting', () => {
  it('reads Anthropic additive aliases as context and keeps input uncached', () => {
    // ADDITIVE: `input_tokens` is already the uncached remainder, and the cache
    // figures sit on top under `cache_read_input_tokens` /
    // `cache_creation_input_tokens`.
    const report = analyzeRunCost([
      rawUsageEvent({
        input_tokens: 100,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 200,
        output_tokens: 50,
      }),
    ]);

    const step = report.steps[0]!;
    expect(step.contextTokens).toBe(8000);
    expect(step.cacheWriteTokens).toBe(200);
    expect(step.inputTokens).toBe(100);
    expect(step.outputTokens).toBe(50);
  });

  it('subtracts the cached subset from an OpenAI-style inclusive input', () => {
    // INCLUSIVE: the 120 cached tokens are already inside the 400, so pricing
    // all 400 as uncached bills them twice — once at input rate, once as a
    // cache read.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 400, cached_read_tokens: 120 }),
    ]);

    const step = report.steps[0]!;
    expect(step.contextTokens).toBe(120);
    expect(step.inputTokens).toBe(280);
  });

  it('treats an OpenAI-style payload as additive when the cached read exceeds input', () => {
    // A subset cannot exceed the total it is a subset of, so this payload is
    // provably additive regardless of which alias family it used.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 9000 }),
    ]);

    const step = report.steps[0]!;
    expect(step.contextTokens).toBe(9000);
    expect(step.inputTokens).toBe(100);
  });

  it('reads the OpenAI nested cached_tokens detail', () => {
    const report = analyzeRunCost([
      rawUsageEvent({
        prompt_tokens: 500,
        prompt_tokens_details: { cached_tokens: 200 },
        completion_tokens: 30,
      }),
    ]);

    const step = report.steps[0]!;
    expect(step.contextTokens).toBe(200);
    expect(step.inputTokens).toBe(300);
    expect(step.outputTokens).toBe(30);
  });

  it('reads camelCase and cache_creation nested aliases', () => {
    const report = analyzeRunCost([
      rawUsageEvent({
        inputTokens: 60,
        cacheReadInputTokens: 4000,
        cache_creation: { input_tokens: 90 },
        outputTokens: 12,
      }),
    ]);

    const step = report.steps[0]!;
    expect(step.contextTokens).toBe(4000);
    expect(step.cacheWriteTokens).toBe(90);
    expect(step.inputTokens).toBe(60);
  });

  it('keeps the already-normalized OpenCode shape working unchanged', () => {
    const report = analyzeRunCost([
      rawUsageEvent({
        cached_read_tokens: 1000,
        cached_write_tokens: 50,
        input_tokens: 20,
        output_tokens: 10,
      }),
    ]);

    const step = report.steps[0]!;
    expect(step.contextTokens).toBe(1000);
    expect(step.cacheWriteTokens).toBe(50);
    expect(step.inputTokens).toBe(20);
  });

  it('prices an Anthropic run without double-charging the cached context', () => {
    // End-to-end money check on the additive shape: 8000 cache reads at
    // $0.30/1M + 100 uncached at $3.00/1M + 200 writes at $3.75/1M + 50 output
    // at $15.00/1M.
    const report = analyzeRunCost([
      rawUsageEvent({
        input_tokens: 100,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 200,
        output_tokens: 50,
      }),
    ]);

    expect(report.usd.cachedRead).toBeCloseTo((8000 / 1_000_000) * 0.3, 10);
    expect(report.usd.uncachedInput).toBeCloseTo((100 / 1_000_000) * 3.0, 10);
    expect(report.usd.cacheWrite).toBeCloseTo((200 / 1_000_000) * 3.75, 10);
    expect(report.usd.output).toBeCloseTo((50 / 1_000_000) * 15.0, 10);
  });
});

/**
 * The scope gate. A per-call log INTERLEAVES usage with work; a terminal-frame
 * runtime writes one aggregate at close, and running the per-call arithmetic
 * over it yields a one-point curve that pins the entire read cost on the
 * preamble term. The report must say which kind of log it read.
 */
describe('analyzeRunCost — usage scope', () => {
  it('flags a whole-run aggregate: every tool call precedes the only usage frame', () => {
    // The claude-stream / copilot-stream / ACP / pi shape: work first, one
    // usage frame from the terminal `result`.
    const report = analyzeRunCost([
      toolUse('t1', 'read', { filePath: '/a' }),
      toolResult('t1', 'x'.repeat(200)),
      toolUse('t2', 'write', { filePath: '/b' }),
      toolResult('t2', 'y'.repeat(200)),
      rawUsageEvent({
        input_tokens: 100,
        cache_read_input_tokens: 40_000,
        output_tokens: 900,
      }),
    ]);

    expect(report.usageScope).toBe('aggregate');
  });

  it('keeps a real two-call run whose first call emitted all its tools', () => {
    // REGRESSION, from a persisted run (0bb4f727). An earlier positional
    // discriminator asked whether any tool_use appeared AFTER the first usage
    // frame, and gated this shape away — but it is a legitimate two-call
    // OpenCode run carrying a real 1,792 -> 28,864 context curve. Both of its
    // tools simply came out of call 0, which says nothing about scope.
    const report = analyzeRunCost([
      toolUse('t1', 'engram_mem_context', {}),
      toolResult('t1', 'x'.repeat(10_939)),
      toolUse('t2', 'read', { filePath: '/cv.md' }),
      toolResult('t2', 'y'.repeat(14_966)),
      usageEvent({ input_tokens: 27_138, output_tokens: 93, cached_read_tokens: 1_792 }),
      textDelta('Se creó el archivo.'),
      usageEvent({ input_tokens: 9_338, output_tokens: 298, cached_read_tokens: 28_864 }),
    ]);

    expect(report.usageScope).toBe('per-call');
    expect(report.steps.map((s) => s.contextTokens)).toEqual([1_792, 28_864]);
  });

  it('reads interleaved frames as per-call', () => {
    // The OpenCode shape: the call that consumes a result emits its own frame.
    const report = analyzeRunCost([
      toolUse('t1', 'read', { filePath: '/a' }),
      toolResult('t1', 'x'.repeat(200)),
      usageEvent({ cached_read_tokens: 1000 }),
      toolUse('t2', 'read', { filePath: '/b' }),
      toolResult('t2', 'y'.repeat(200)),
      usageEvent({ cached_read_tokens: 2000 }),
      usageEvent({ cached_read_tokens: 3000 }),
    ]);

    expect(report.usageScope).toBe('per-call');
  });

  it('treats a run with no tool calls as per-call', () => {
    // One frame IS one call here, so the decomposition is trivially right and
    // must not be gated away.
    const report = analyzeRunCost([
      textDelta('Here you go.'),
      rawUsageEvent({ input_tokens: 50, cache_read_input_tokens: 2000, output_tokens: 20 }),
    ]);

    expect(report.usageScope).toBe('per-call');
    expect(report.steps).toHaveLength(1);
  });

  it('shows why the gate exists: an aggregate collapses the whole curve into preamble', () => {
    // This is the wrong answer the gate prevents from reaching a user. It is
    // asserted so a future change to the term arithmetic cannot quietly make
    // the aggregate path look plausible and tempt someone to ungate it.
    const report = analyzeRunCost([
      toolUse('t1', 'read', { filePath: '/a' }),
      toolResult('t1', 'x'.repeat(200)),
      rawUsageEvent({ input_tokens: 100, cache_read_input_tokens: 40_000 }),
    ]);

    expect(report.usageScope).toBe('aggregate');
    expect(report.terms.preambleTokens).toBe(40_000);
    expect(report.terms.transcriptTokens).toBe(0);
    expect(report.cacheHealth.comparableSteps).toBe(0);
  });
});
