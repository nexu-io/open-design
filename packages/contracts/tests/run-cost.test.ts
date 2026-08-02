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
  it('reads the context curve as uncached input plus cache read, one entry per usage frame', () => {
    // The cache read alone is NOT the context: it is only the part of it that
    // was served from cache. A call carrying 900 uncached input against a cold
    // cache still put 900 tokens in front of the model. Frame 2 reports a read
    // (100) above its input (20), which proves the provider additive, so every
    // frame's `input_tokens` is the uncached remainder and the context is the
    // sum. See `detectUsageAccountingConvention`.
    const report = analyzeRunCost([
      usageEvent({ cached_read_tokens: 0, cached_write_tokens: 100, output_tokens: 10, input_tokens: 900 }, 1000),
      usageEvent({ cached_read_tokens: 100, cached_write_tokens: 50, output_tokens: 20, input_tokens: 20 }, 3000),
      usageEvent({ cached_read_tokens: 150, cached_write_tokens: 25, output_tokens: 30, input_tokens: 30 }, 6000),
    ]);

    expect(report.steps).toHaveLength(3);
    expect(report.steps.map((s) => s.contextTokens)).toEqual([900, 120, 180]);
    // The cache-read figure stays available under its own name, because cache
    // health and the invalidation/compaction split reason about the cached
    // prefix specifically, not about the context as a whole.
    expect(report.steps.map((s) => s.cachedReadTokens)).toEqual([0, 100, 150]);
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
    expect(report.steps[0]?.cachedReadTokens).toBe(10);
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

  it('excludes frames with no context at all from the preamble floor', () => {
    // A frame reporting neither uncached input nor a cache read did not make a
    // comparable model call — runs close with exactly such a summary frame.
    //
    // This exclusion used to be load-bearing for a different reason: it hid the
    // first call of every run, whose cache read is near zero, because letting it
    // set the floor collapsed the preamble term. That was a symptom of reading
    // the cache read as the context. A first call now carries its uncached input
    // and sets an honest floor, so this guard is back to covering only the
    // genuinely empty frame.
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

describe('analyzeRunCost — preamble floor over effective context', () => {
  /**
   * Frames of the real six-call run `3d081d9b`, which reported a 3% preamble
   * while re-reading an established ~123k context on all six calls. Frames 1..5
   * report a read above their input, proving the provider additive.
   */
  const sixCallRun = [
    rawUsageEvent({ input_tokens: 120_443, cached_read_tokens: 3_072, output_tokens: 90 }),
    rawUsageEvent({ input_tokens: 351, cached_read_tokens: 123_456, output_tokens: 90 }),
    rawUsageEvent({ input_tokens: 1_904, cached_read_tokens: 123_776, output_tokens: 92 }),
    rawUsageEvent({ input_tokens: 1_685, cached_read_tokens: 125_632, output_tokens: 91 }),
    rawUsageEvent({ input_tokens: 1_749, cached_read_tokens: 127_296, output_tokens: 220 }),
    rawUsageEvent({ input_tokens: 795, cached_read_tokens: 129_024, output_tokens: 75 }),
  ];

  it('reports the preamble as dominant on a run whose context is re-read six times', () => {
    // Effective contexts: 123515, 123807, 125680, 127317, 129045, 129819.
    // The floor of THAT curve is 123,515, re-read by all six calls, so the
    // preamble is 741,090 of the 759,183 total and only 18,093 is accumulation.
    // Read off the cache curve instead, the floor is the first call's barely-warm
    // 3,072 and the run reports a 3% preamble against a 97% transcript.
    const report = analyzeRunCost(sixCallRun);

    expect(report.usageConvention).toBe('additive');
    expect(report.terms.preambleTokens).toBe(741_090);
    expect(report.terms.transcriptTokens).toBe(18_093);
    expect(report.terms.preambleTokens).toBeGreaterThan(report.terms.transcriptTokens);
  });

  it('shows the effective-context identity on a run that holds still', () => {
    // What step i put in front of the model is what step i+1 finds in cache.
    // This is the evidence that the cache read is a SUBSET of the context rather
    // than the context itself.
    //
    // Scoped to THIS run on purpose. The identity is corroboration, not a law:
    // block-quantized reads, content cached between calls, and invalidation all
    // break it on other persisted runs, and asserting it globally would be
    // asserting something false. The arithmetic does not rest on it — a context
    // is its cached plus its uncached part by construction. See the module
    // docblock.
    const report = analyzeRunCost(sixCallRun);

    for (let i = 0; i < report.steps.length - 1; i += 1) {
      const drift = Math.abs(report.steps[i]!.contextTokens - report.steps[i + 1]!.cachedReadTokens);
      expect(drift).toBeLessThan(100);
    }
  });

  it('moves a warm-floor run only marginally, without flipping its verdict', () => {
    // The bounding case, and the reason the negative case cannot be "nothing
    // moves": the floor shifts whenever ANY step carries uncached input, which
    // is always. Here it goes 50,000 -> 50,100, a 0.2% shift, and the preamble
    // dominated before and still dominates after.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 50_000 }),
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 50_500 }),
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 51_000 }),
    ]);

    expect(report.terms.preambleTokens).toBe(150_300);
    expect(report.terms.transcriptTokens).toBe(1_500);
    expect(report.terms.preambleTokens).toBeGreaterThan(report.terms.transcriptTokens);
  });

  it('still decomposes a run from a provider that caches nothing', () => {
    // No cache fields at all, which is what several runtimes report. The run
    // still has a context curve and still re-reads a floor on every call — it
    // just pays for all of it at the uncached rate. Selecting the steps by their
    // cache read instead of their context would find NONE of them here and
    // report a run with zero preamble and zero transcript.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 1_000, output_tokens: 10 }),
      rawUsageEvent({ input_tokens: 1_200, output_tokens: 10 }),
      rawUsageEvent({ input_tokens: 1_500, output_tokens: 10 }),
    ]);

    expect(report.steps.map((s) => s.contextTokens)).toEqual([1_000, 1_200, 1_500]);
    expect(report.terms.preambleTokens).toBe(3_000);
    expect(report.terms.transcriptTokens).toBe(700);
    // Nothing was cached, so the whole floor was bought at the input rate.
    expect(report.terms.preambleUncachedTokens).toBe(3_000);
    expect(report.usd.preamble).toBeCloseTo(
      (3_000 * report.rates.inputPerMTok) / 1_000_000,
      9,
    );
  });

  it('leaves a transcript-dominated run transcript-dominated', () => {
    // The other negative case: a cheap first call and genuine accumulation. The
    // correction moves the floor 1,000 -> 1,100 and the verdict does not budge.
    // Without this the change could be a blanket rewrite that reports every run
    // as preamble-dominated and nobody would notice.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 1_000 }),
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 40_000 }),
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 80_000 }),
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 120_000 }),
    ]);

    expect(report.terms.preambleTokens).toBe(4_400);
    expect(report.terms.transcriptTokens).toBe(237_000);
    expect(report.terms.transcriptTokens).toBeGreaterThan(report.terms.preambleTokens);
  });

  it('values the floor prefix-first, so the dollar rows still reconcile', () => {
    // A cache serves the PREFIX of the context, and the floor IS that prefix, so
    // a step's floor is cached exactly as far as its cache read reaches:
    // `min(floor, cacheRead)`, with the shortfall paid at the uncached rate.
    //
    // On this run that shortfall is almost entirely the first call, which
    // established the 123,515-token floor with nothing cached: 120,502 of the
    // 741,090 preamble tokens were bought at the input rate, not the cached one.
    // That is why `usd.preamble` cannot be `preambleTokens x cachedReadPerMTok`
    // any more — doing so under-reports this run's preamble by 3.7x.
    const report = analyzeRunCost(sixCallRun);
    const { usd, terms, rates } = report;

    expect(terms.preambleUncachedTokens).toBe(120_502);
    expect(usd.preamble).toBeCloseTo(
      (620_588 * rates.cachedReadPerMTok + 120_502 * rates.inputPerMTok) / 1_000_000,
      9,
    );
    expect(usd.preamble).not.toBeCloseTo(
      (terms.preambleTokens * rates.cachedReadPerMTok) / 1_000_000,
      6,
    );

    // The two rows remain an exact subdivision — of the read AND input terms
    // together now, where they used to subdivide the read term alone.
    expect(usd.preamble + usd.transcript).toBeCloseTo(usd.cachedRead + usd.uncachedInput, 9);
    // And the headline total is untouched: this defect was always an attribution
    // error between rows, never a mispriced run.
    expect(usd.total).toBeCloseTo(
      usd.cachedRead + usd.cacheWrite + usd.uncachedInput + usd.output,
      9,
    );
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

  it('judges a write against the next CACHE read, not against context growth', () => {
    // Discriminating fixture: the two readings disagree. Step 0 writes 1,000 and
    // step 1 finds exactly 1,000 more in cache — a textbook incremental write.
    // But step 1 also carries 500 of fresh uncached input, so the CONTEXT only
    // grew by 500, and judging the write against that would report this healthy
    // write as a 500-token rewrite.
    //
    // A write's job is to put content where the next call can read it cheaply,
    // so the cache read is the only honest measure of whether it did that.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 1_000, cached_read_tokens: 0, cached_write_tokens: 1_000 }),
      rawUsageEvent({ input_tokens: 500, cached_read_tokens: 1_000, cached_write_tokens: 0 }),
    ]);

    expect(report.steps.map((s) => s.contextTokens)).toEqual([1_000, 1_500]);
    expect(report.cacheHealth.incrementalSteps).toBe(1);
    expect(report.cacheHealth.rewrittenTokens).toBe(0);
    expect(report.anomalies).toEqual([]);
  });

  it('sees a cache invalidation even while the conversation kept growing', () => {
    // The sharpest case for the same boundary. The cached prefix collapses
    // 8,000 -> 2,000 and is written back, which is an invalidation — but the
    // context RISES 8,100 -> 9,000 across the same pair, because the call that
    // observed the collapse also carried 7,000 of fresh input. Classifying off
    // the context would see no drop at all and report nothing.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 8_000 }),
      rawUsageEvent({ input_tokens: 7_000, cached_read_tokens: 2_000, cached_write_tokens: 6_500 }),
    ]);

    expect(report.steps.map((s) => s.contextTokens)).toEqual([8_100, 9_000]);
    const drop = report.anomalies.find((a) => a.kind === 'cache-invalidation');
    expect(drop).toBeDefined();
    expect(drop?.stepIndex).toBe(1);
    expect(drop?.tokens).toBe(6_000);
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
    expect(step.cachedReadTokens).toBe(8000);
    expect(step.cacheWriteTokens).toBe(200);
    expect(step.inputTokens).toBe(100);
    expect(step.outputTokens).toBe(50);
    // Both parts under the alias matrix, so the context is their sum.
    expect(step.contextTokens).toBe(8100);
  });

  it('subtracts the cached subset from an OpenAI-style inclusive input', () => {
    // INCLUSIVE: the 120 cached tokens are already inside the 400, so pricing
    // all 400 as uncached bills them twice — once at input rate, once as a
    // cache read.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 400, cached_read_tokens: 120 }),
    ]);

    const step = report.steps[0]!;
    expect(step.cachedReadTokens).toBe(120);
    expect(step.inputTokens).toBe(280);
    // 400 total, of which 120 came from cache: the context is the 400 the
    // provider already reported, not 520. Under INCLUSIVE accounting the sum
    // must not double-count the cached subset, and this is the case that proves
    // `contextTokens` respects the convention rather than blindly adding.
    expect(step.contextTokens).toBe(400);
  });

  it('treats an OpenAI-style payload as additive when the cached read exceeds input', () => {
    // A subset cannot exceed the total it is a subset of, so this payload is
    // provably additive regardless of which alias family it used.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 100, cached_read_tokens: 9000 }),
    ]);

    const step = report.steps[0]!;
    expect(step.cachedReadTokens).toBe(9000);
    expect(step.inputTokens).toBe(100);
    expect(step.contextTokens).toBe(9100);
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
    expect(step.cachedReadTokens).toBe(200);
    expect(step.inputTokens).toBe(300);
    expect(step.outputTokens).toBe(30);
    // `prompt_tokens` is inclusive, so the context is the 500 reported.
    expect(step.contextTokens).toBe(500);
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
    expect(step.cachedReadTokens).toBe(4000);
    expect(step.cacheWriteTokens).toBe(90);
    expect(step.inputTokens).toBe(60);
    expect(step.contextTokens).toBe(4060);
  });

  it('settles the convention across the run, not per frame', () => {
    // REGRESSION, from a live OpenCode run (2b339c63). Deciding per frame gave
    // this ONE run two answers: call 1 pairs a large fresh prompt (84,212)
    // against a barely-warm cache (3,072), which reads as inclusive, so 3,072
    // genuinely-paid tokens were subtracted from it — while calls 2 and 3 were
    // correctly read as additive.
    //
    // Calls 2 and 3 prove the provider is additive (a cache-read subset cannot
    // exceed the input it is a subset of), so call 1 must inherit that.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 84_212, output_tokens: 70, cached_read_tokens: 3_072 }),
      rawUsageEvent({ input_tokens: 17_265, output_tokens: 199, cached_read_tokens: 87_232 }),
      rawUsageEvent({ input_tokens: 564, output_tokens: 68, cached_read_tokens: 104_448 }),
    ]);

    expect(report.usageConvention).toBe('additive');
    // Not one token subtracted from any of the three.
    expect(report.steps.map((s) => s.inputTokens)).toEqual([84_212, 17_265, 564]);
    expect(report.terms.uncachedInputTokens).toBe(102_041);
  });

  it('cross-checks the additive reading against the run own context curve', () => {
    // Independent confirmation that additive is the right reading here: under it,
    // call 1's effective context is 84,212 + 3,072 = 87,284, and call 2 re-reads
    // 87,232 from cache. Those agree within 52 tokens. Under the inclusive
    // reading call 1 holds only 84,212 and 3,020 tokens appear from nowhere.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 84_212, cached_read_tokens: 3_072 }),
      rawUsageEvent({ input_tokens: 17_265, cached_read_tokens: 87_232 }),
    ]);

    const first = report.steps[0]!;
    expect(first.contextTokens).toBe(87_284);
    expect(Math.abs(first.contextTokens - report.steps[1]!.cachedReadTokens)).toBeLessThan(100);
  });

  it('keeps a single inclusive frame inclusive when nothing disproves it', () => {
    // No frame violates `read <= input`, so the inclusive reading stands and the
    // cached subset is still removed. This is the case the run-level rule must
    // NOT break.
    const report = analyzeRunCost([
      rawUsageEvent({ input_tokens: 400, cached_read_tokens: 120 }),
      rawUsageEvent({ input_tokens: 900, cached_read_tokens: 300 }),
    ]);

    expect(report.usageConvention).toBe('inclusive');
    expect(report.steps.map((s) => s.inputTokens)).toEqual([280, 600]);
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
    expect(step.cachedReadTokens).toBe(1000);
    expect(step.cacheWriteTokens).toBe(50);
    expect(step.inputTokens).toBe(20);
    expect(step.contextTokens).toBe(1020);
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
    // OpenCode run carrying a real 28,930 -> 38,202 context curve. Both of its
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
    expect(report.steps.map((s) => s.cachedReadTokens)).toEqual([1_792, 28_864]);
    expect(report.steps.map((s) => s.contextTokens)).toEqual([28_930, 38_202]);
    // The identity again, on a second real run: call 1 held 28,930 and call 2
    // found 28,864 of it in cache, 66 apart. Read off the cache figure alone,
    // this run's floor would be call 1's cold 1,792 rather than its true 28,930.
    expect(
      Math.abs(report.steps[0]!.contextTokens - report.steps[1]!.cachedReadTokens),
    ).toBeLessThan(100);
    // Call 2 (9,338 input against 28,864 cached) proves the provider additive,
    // so call 1 keeps all 27,138 of its input rather than losing 1,792 to an
    // inclusive reading it never earned.
    expect(report.usageConvention).toBe('additive');
    expect(report.terms.uncachedInputTokens).toBe(36_476);
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
    // A one-point curve has nowhere to put anything but the floor, whatever the
    // floor is measured over: 40,100 of effective context, 0 of accumulation.
    expect(report.terms.preambleTokens).toBe(40_100);
    expect(report.terms.transcriptTokens).toBe(0);
    expect(report.cacheHealth.comparableSteps).toBe(0);
  });
});
