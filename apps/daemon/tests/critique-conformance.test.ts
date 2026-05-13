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
    // The shipped outcome must surface the artifact bytes the parser
    // handed back via onArtifact, so a nightly cycle can pin MIME /
    // byte-length / hash without re-parsing the transcript (lefarcen
    // P2 on PR #1317).
    expect(outcome.artifact).not.toBeNull();
    expect(outcome.artifact?.mime).toMatch(/^text\/(html|markdown)/);
    expect(outcome.artifact?.body.length).toBeGreaterThan(0);
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

  it('classifies an oversize block as degraded oversize_block (lefarcen P2)', async () => {
    // The synthetic-good transcript is fine under the default 256 KB
    // block budget. Replay it through the harness with a tiny budget so
    // the parser throws OversizeBlockError on the first ARTIFACT body
    // and the harness has to surface `degraded: oversize_block`.
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-oversize',
      runId: 'run-oversize',
      source: syntheticGoodStream(),
      parserMaxBlockBytes: 256,
    });
    expect(outcome.kind).toBe('degraded');
    if (outcome.kind !== 'degraded') return;
    expect(outcome.reason).toBe('oversize_block');
    expect(isDegraded('synthetic-oversize')).toBe(true);
  });

  it('classifies an adapter that throws mid-stream as failed unexpected_error (lefarcen P2)', async () => {
    class AdapterBoom extends Error {
      constructor() {
        super('adapter blew up');
        this.name = 'AdapterBoom';
      }
    }
    async function* throwing(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" runId="run-boom" projectId="p" artifactId="a">\n';
      yield '<ROUND n="1">\n';
      throw new AdapterBoom();
    }
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-throwing',
      runId: 'run-boom',
      source: throwing(),
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.cause).toBe('unexpected_error');
    expect(outcome.error).toContain('adapter blew up');
    // The adapter is NOT marked degraded here: an unexpected throw is a
    // failure to evaluate, not evidence of a malformed stream. A real
    // policy could choose to mark it after N consecutive throws; the
    // harness leaves that decision to the caller.
    expect(isDegraded('synthetic-throwing')).toBe(false);
  });

  it('classifies a clean SHIP that arrived alongside parser warnings as degraded parser_warning (lefarcen P2)', async () => {
    // A panelist score outside [0, scale] makes the parser yield a
    // `parser_warning` with kind=`score_clamped` BEFORE the panelist
    // closes. The harness must promote the run to degraded even though
    // a syntactically valid SHIP arrives later.
    async function* withClampedScore(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="1" threshold="0.1" scale="10">\n';
      yield '  <ROUND n="1">\n';
      // designer must include an ARTIFACT in round 1 (parser invariant).
      yield '    <PANELIST role="designer">\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<p>x</p>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      // Out-of-range score on `critic` triggers score_clamped warning.
      yield '    <PANELIST role="critic" score="99"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="brand" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="a11y" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="copy" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <ROUND_END n="1" composite="6.0" must_fix="0" decision="ship">\n';
      yield '      <REASON>ok</REASON>\n';
      yield '    </ROUND_END>\n';
      yield '  </ROUND>\n';
      yield '  <SHIP round="1" composite="6.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>\n';
      yield '    <SUMMARY>ok</SUMMARY>\n';
      yield '  </SHIP>\n';
      yield '</CRITIQUE_RUN>\n';
    }
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-warned',
      runId: 'run-warned',
      source: withClampedScore(),
    });
    expect(outcome.kind).toBe('degraded');
    if (outcome.kind !== 'degraded') return;
    expect(outcome.reason).toBe('parser_warning');
    expect(outcome.events.some((e) => e.type === 'parser_warning')).toBe(true);
    expect(isDegraded('synthetic-warned')).toBe(true);
  });

  it('classifies a SHIP that arrived before every panelist closed as degraded incomplete_panel (codex P2)', async () => {
    // run_started declares the full 5-role cast, but only `designer`
    // and `critic` ever emit panelist_close. The parser does not reject
    // this on its own; the harness is the gate that catches it.
    async function* incomplete(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="1" threshold="0.1" scale="10">\n';
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<p>x</p>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      yield '    <PANELIST role="critic" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <ROUND_END n="1" composite="6.0" must_fix="0" decision="ship">\n';
      yield '      <REASON>ok</REASON>\n';
      yield '    </ROUND_END>\n';
      yield '  </ROUND>\n';
      yield '  <SHIP round="1" composite="6.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>\n';
      yield '    <SUMMARY>ok</SUMMARY>\n';
      yield '  </SHIP>\n';
      yield '</CRITIQUE_RUN>\n';
    }
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-incomplete',
      runId: 'run-incomplete',
      source: incomplete(),
    });
    expect(outcome.kind).toBe('degraded');
    if (outcome.kind !== 'degraded') return;
    expect(outcome.reason).toBe('incomplete_panel');
    expect(isDegraded('synthetic-incomplete')).toBe(true);
  });

  it('classifies a duplicate-SHIP stream as degraded parser_warning even though ship arrives first (lefarcen P2 follow-up)', async () => {
    // Two `<SHIP>` blocks in the same transcript. The parser emits a
    // SHIP event for the first and a `parser_warning` of kind
    // `duplicate_ship` for the second; the warning arrives AFTER the
    // ship. The harness must drain the rest of the stream and
    // classify as degraded rather than returning on the first ship.
    async function* duplicateShip(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="1" threshold="0.1" scale="10">\n';
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<p>x</p>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      yield '    <PANELIST role="critic" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="brand" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="a11y" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="copy" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <ROUND_END n="1" composite="6.0" must_fix="0" decision="ship">\n';
      yield '      <REASON>ok</REASON>\n';
      yield '    </ROUND_END>\n';
      yield '  </ROUND>\n';
      yield '  <SHIP round="1" composite="6.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<p>first</p>]]></ARTIFACT>\n';
      yield '    <SUMMARY>first</SUMMARY>\n';
      yield '  </SHIP>\n';
      // Second SHIP block triggers the parser_warning (duplicate_ship).
      yield '  <SHIP round="1" composite="6.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<p>second</p>]]></ARTIFACT>\n';
      yield '    <SUMMARY>second</SUMMARY>\n';
      yield '  </SHIP>\n';
      yield '</CRITIQUE_RUN>\n';
    }
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-duplicate-ship',
      runId: 'run-dup',
      source: duplicateShip(),
    });
    expect(outcome.kind).toBe('degraded');
    if (outcome.kind !== 'degraded') return;
    expect(outcome.reason).toBe('parser_warning');
    // The events array must hold both the first ship AND the
    // duplicate_ship warning so a debugger can see what happened.
    expect(outcome.events.filter((e) => e.type === 'ship')).toHaveLength(1);
    expect(
      outcome.events.some(
        (e) => e.type === 'parser_warning' && e.kind === 'duplicate_ship',
      ),
    ).toBe(true);
    expect(isDegraded('synthetic-duplicate-ship')).toBe(true);
  });

  it('classifies a SHIP whose round did not close every cast role as incomplete_panel even if earlier rounds closed everyone (lefarcen P2 follow-up)', async () => {
    // Round 1 closes all five cast roles cleanly. Round 2 closes only
    // designer + critic before <SHIP round="2"> arrives. A cumulative
    // (non-per-round) tracker would happily say "all five closed
    // somewhere, ship is fine"; the corrected per-round tracker
    // looks only at the shipping round's panelist_close set and
    // flags incomplete_panel because brand / a11y / copy never
    // closed in round 2.
    async function* incompleteShippingRound(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="2" threshold="0.1" scale="10">\n';
      // Round 1 — all five close.
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      yield '    <PANELIST role="critic" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="brand" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="a11y" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <PANELIST role="copy" score="6"><DIM name="x" score="6">n</DIM></PANELIST>\n';
      yield '    <ROUND_END n="1" composite="6.0" must_fix="3" decision="continue">\n';
      yield '      <REASON>more work</REASON>\n';
      yield '    </ROUND_END>\n';
      yield '  </ROUND>\n';
      // Round 2 — only designer + critic close (the cumulative bug
      // would let this slide; the fix catches it).
      yield '  <ROUND n="2">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <NOTES>iterating</NOTES>\n';
      yield '    </PANELIST>\n';
      yield '    <PANELIST role="critic" score="7"><DIM name="x" score="7">n</DIM></PANELIST>\n';
      yield '    <ROUND_END n="2" composite="7.0" must_fix="0" decision="ship">\n';
      yield '      <REASON>ok</REASON>\n';
      yield '    </ROUND_END>\n';
      yield '  </ROUND>\n';
      yield '  <SHIP round="2" composite="7.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>\n';
      yield '    <SUMMARY>ok</SUMMARY>\n';
      yield '  </SHIP>\n';
      yield '</CRITIQUE_RUN>\n';
    }
    const outcome = await runAdapterConformance({
      adapterId: 'synthetic-incomplete-round-2',
      runId: 'run-r2',
      source: incompleteShippingRound(),
    });
    expect(outcome.kind).toBe('degraded');
    if (outcome.kind !== 'degraded') return;
    expect(outcome.reason).toBe('incomplete_panel');
    expect(isDegraded('synthetic-incomplete-round-2')).toBe(true);
  });
});
