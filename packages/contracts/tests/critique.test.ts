import { describe, expect, it } from 'vitest';
import {
  panelEventToSse,
  CRITIQUE_SSE_EVENT_NAMES,
  isPanelEvent,
  type PanelEvent,
} from '../src/critique';

describe('CritiqueSseEvent', () => {
  it('panelEventToSse maps PanelEvent.type "run_started" to event "critique.run_started"', () => {
    const e: PanelEvent = {
      type: 'run_started', runId: 'r1', protocolVersion: 1,
      cast: ['designer','critic','brand','a11y','copy'],
      maxRounds: 3, threshold: 8, scale: 10,
    };
    const sse = panelEventToSse(e);
    expect(sse.event).toBe('critique.run_started');
    expect(sse.data).toMatchObject({
      runId: 'r1', protocolVersion: 1, maxRounds: 3, threshold: 8, scale: 10,
    });
    // No 'type' field on the SSE payload.
    expect((sse.data as Record<string, unknown>).type).toBeUndefined();
  });

  it('panelEventToSse round-trips every PanelEvent type', () => {
    const samples: PanelEvent[] = [
      { type: 'run_started', runId: 'r', protocolVersion: 1, cast: ['critic'], maxRounds: 3, threshold: 8, scale: 10 },
      { type: 'panelist_open', runId: 'r', round: 1, role: 'designer' },
      { type: 'panelist_dim', runId: 'r', round: 1, role: 'critic', dimName: 'contrast', dimScore: 4, dimNote: '' },
      { type: 'panelist_must_fix', runId: 'r', round: 1, role: 'a11y', text: '' },
      { type: 'panelist_close', runId: 'r', round: 1, role: 'critic', score: 6 },
      { type: 'round_end', runId: 'r', round: 1, composite: 6, mustFix: 7, decision: 'continue', reason: '' },
      { type: 'ship', runId: 'r', round: 3, composite: 8.6, status: 'shipped', artifactRef: { projectId: 'p', artifactId: 'a' }, summary: '' },
      { type: 'degraded', runId: 'r', reason: 'malformed_block', adapter: 'pi-rpc' },
      { type: 'interrupted', runId: 'r', bestRound: 2, composite: 7.86 },
      { type: 'failed', runId: 'r', cause: 'cli_exit_nonzero' },
      { type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: 0 },
    ];
    for (const e of samples) {
      const sse = panelEventToSse(e);
      expect(sse.event).toBe(`critique.${e.type}`);
    }
  });

  it('CRITIQUE_SSE_EVENT_NAMES contains all 11 critique.* names', () => {
    expect(CRITIQUE_SSE_EVENT_NAMES).toContain('critique.run_started');
    expect(CRITIQUE_SSE_EVENT_NAMES).toContain('critique.parser_warning');
    expect(CRITIQUE_SSE_EVENT_NAMES.length).toBe(11);
    // Each name has the 'critique.' prefix.
    for (const name of CRITIQUE_SSE_EVENT_NAMES) {
      expect(name.startsWith('critique.')).toBe(true);
    }
  });
});

describe('isPanelEvent (strict guard, Siri-Ray round-3 P1 on PR #1314)', () => {
  // The contract guard is the single source of truth for runtime PanelEvent
  // validation on the web wire-side. Both `sseToPanelEvent` and the replay
  // hook's transcript parser go through it, so it has to enforce both the
  // header (type known + non-empty runId) AND the per-variant shape AND the
  // closed-enum membership for fields that the web layer uses as keys into
  // i18n / badge tables.

  const SHIP_OK: PanelEvent = {
    type: 'ship', runId: 'r', round: 3, composite: 8.6, status: 'shipped',
    artifactRef: { projectId: 'p', artifactId: 'a' }, summary: '',
  };

  it('accepts a well-formed PanelEvent of every variant', () => {
    const samples: PanelEvent[] = [
      { type: 'run_started', runId: 'r', protocolVersion: 1, cast: ['critic'], maxRounds: 3, threshold: 8, scale: 10 },
      { type: 'panelist_open', runId: 'r', round: 1, role: 'designer' },
      { type: 'panelist_dim', runId: 'r', round: 1, role: 'critic', dimName: 'c', dimScore: 4, dimNote: '' },
      { type: 'panelist_must_fix', runId: 'r', round: 1, role: 'a11y', text: '' },
      { type: 'panelist_close', runId: 'r', round: 1, role: 'critic', score: 6 },
      { type: 'round_end', runId: 'r', round: 1, composite: 6, mustFix: 7, decision: 'continue', reason: '' },
      SHIP_OK,
      { type: 'degraded', runId: 'r', reason: 'malformed_block', adapter: 'pi-rpc' },
      { type: 'interrupted', runId: 'r', bestRound: 2, composite: 7.86 },
      { type: 'failed', runId: 'r', cause: 'cli_exit_nonzero' },
      { type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: 0 },
    ];
    for (const e of samples) {
      expect(isPanelEvent(e)).toBe(true);
    }
  });

  it('rejects a non-object or primitive value', () => {
    expect(isPanelEvent(null)).toBe(false);
    expect(isPanelEvent(undefined)).toBe(false);
    expect(isPanelEvent('ship')).toBe(false);
    expect(isPanelEvent(42)).toBe(false);
  });

  it('rejects an unknown event type', () => {
    expect(isPanelEvent({ type: 'something_invalid', runId: 'r' })).toBe(false);
  });

  it('rejects an empty or non-string runId', () => {
    expect(isPanelEvent({ ...SHIP_OK, runId: '' })).toBe(false);
    expect(isPanelEvent({ ...SHIP_OK, runId: 42 })).toBe(false);
  });

  it('rejects a ship event with an unknown status enum value', () => {
    expect(isPanelEvent({ ...SHIP_OK, status: 'oops' })).toBe(false);
  });

  it('rejects a ship event with a non-finite composite', () => {
    expect(isPanelEvent({ ...SHIP_OK, composite: Number.NaN })).toBe(false);
    expect(isPanelEvent({ ...SHIP_OK, composite: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects a panelist_open event with an unknown role', () => {
    expect(isPanelEvent({ type: 'panelist_open', runId: 'r', round: 1, role: 'overlord' })).toBe(false);
  });

  it('rejects a degraded event with an unknown reason', () => {
    expect(isPanelEvent({ type: 'degraded', runId: 'r', reason: 'weird', adapter: 'pi-rpc' })).toBe(false);
  });

  it('rejects a failed event with an unknown cause', () => {
    expect(isPanelEvent({ type: 'failed', runId: 'r', cause: 'who_knows' })).toBe(false);
  });

  it('rejects a parser_warning event with an unknown kind', () => {
    expect(isPanelEvent({ type: 'parser_warning', runId: 'r', kind: 'mystery', position: 0 })).toBe(false);
  });

  it('rejects a run_started whose cast carries an unknown role', () => {
    expect(isPanelEvent({
      type: 'run_started', runId: 'r', protocolVersion: 1,
      cast: ['critic', 'overlord'], maxRounds: 3, threshold: 8, scale: 10,
    })).toBe(false);
  });

  it('rejects a round_end with an unknown decision', () => {
    expect(isPanelEvent({
      type: 'round_end', runId: 'r', round: 1, composite: 6,
      mustFix: 0, decision: 'maybe', reason: '',
    })).toBe(false);
  });

  it('rejects a ship event missing a variant-specific field', () => {
    expect(isPanelEvent({ type: 'ship', runId: 'r' })).toBe(false);
    expect(isPanelEvent({ ...SHIP_OK, summary: undefined })).toBe(false);
    expect(isPanelEvent({ ...SHIP_OK, artifactRef: null })).toBe(false);
  });
});

describe('isPanelEvent (numeric domain enforcement, lefarcen P2 on PR #1314 round 4)', () => {
  // The earlier strict guard only enforced `Number.isFinite` on numeric
  // fields. That let `scale: 0` (which ScoreTicker divides by, producing
  // Infinity in inline CSS), negative thresholds, fractional rounds,
  // and negative `mustFix` slip through to the reducer. This block pins
  // the actual numeric domains the contract intends: positive integers
  // where appropriate, non-negative where the field has a "no data yet"
  // sentinel of 0, and threshold <= scale within `run_started`.

  const RUN_STARTED_OK = {
    type: 'run_started' as const,
    runId: 'r',
    protocolVersion: 1,
    cast: ['critic'] as const,
    maxRounds: 3,
    threshold: 8,
    scale: 10,
  };

  const SHIP_OK = {
    type: 'ship' as const,
    runId: 'r',
    round: 3,
    composite: 8.6,
    status: 'shipped' as const,
    artifactRef: { projectId: 'p', artifactId: 'a' },
    summary: '',
  };

  // -- run_started numeric domains --
  it('rejects run_started with scale: 0 (would cause division by zero downstream)', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, scale: 0 })).toBe(false);
  });
  it('rejects run_started with negative scale', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, scale: -10 })).toBe(false);
  });
  it('rejects run_started with fractional scale', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, scale: 10.5 })).toBe(false);
  });
  it('rejects run_started with maxRounds: 0', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, maxRounds: 0 })).toBe(false);
  });
  it('rejects run_started with fractional maxRounds', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, maxRounds: 1.5 })).toBe(false);
  });
  it('rejects run_started with protocolVersion: 0', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, protocolVersion: 0 })).toBe(false);
  });
  it('rejects run_started with fractional protocolVersion', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, protocolVersion: 1.5 })).toBe(false);
  });
  it('rejects run_started with negative threshold', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, threshold: -1 })).toBe(false);
  });
  it('rejects run_started with threshold > scale', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, threshold: 11, scale: 10 })).toBe(false);
  });
  it('accepts run_started with threshold == scale (boundary)', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, threshold: 10, scale: 10 })).toBe(true);
  });
  it('accepts run_started with fractional threshold within [0, scale]', () => {
    expect(isPanelEvent({ ...RUN_STARTED_OK, threshold: 8.5, scale: 10 })).toBe(true);
  });

  // -- panelist_* round/score domains --
  it('rejects panelist_open with round: 0 (rounds are 1-indexed)', () => {
    expect(isPanelEvent({ type: 'panelist_open', runId: 'r', round: 0, role: 'critic' })).toBe(false);
  });
  it('rejects panelist_open with fractional round', () => {
    expect(isPanelEvent({ type: 'panelist_open', runId: 'r', round: 1.5, role: 'critic' })).toBe(false);
  });
  it('rejects panelist_dim with negative dimScore', () => {
    expect(isPanelEvent({
      type: 'panelist_dim', runId: 'r', round: 1, role: 'critic',
      dimName: 'c', dimScore: -1, dimNote: '',
    })).toBe(false);
  });
  it('rejects panelist_close with negative score', () => {
    expect(isPanelEvent({
      type: 'panelist_close', runId: 'r', round: 1, role: 'critic', score: -1,
    })).toBe(false);
  });

  // -- round_end --
  it('rejects round_end with negative mustFix', () => {
    expect(isPanelEvent({
      type: 'round_end', runId: 'r', round: 1, composite: 6,
      mustFix: -1, decision: 'continue', reason: '',
    })).toBe(false);
  });
  it('rejects round_end with fractional mustFix', () => {
    expect(isPanelEvent({
      type: 'round_end', runId: 'r', round: 1, composite: 6,
      mustFix: 1.5, decision: 'continue', reason: '',
    })).toBe(false);
  });
  it('rejects round_end with negative composite', () => {
    expect(isPanelEvent({
      type: 'round_end', runId: 'r', round: 1, composite: -1,
      mustFix: 0, decision: 'continue', reason: '',
    })).toBe(false);
  });

  // -- ship --
  it('rejects ship with negative composite', () => {
    expect(isPanelEvent({ ...SHIP_OK, composite: -1 })).toBe(false);
  });
  it('rejects ship with round: 0', () => {
    expect(isPanelEvent({ ...SHIP_OK, round: 0 })).toBe(false);
  });

  // -- interrupted (bestRound: 0 is a valid sentinel for "no round completed") --
  it('accepts interrupted with bestRound: 0 (no round completed before interrupt)', () => {
    expect(isPanelEvent({
      type: 'interrupted', runId: 'r', bestRound: 0, composite: 0,
    })).toBe(true);
  });
  it('rejects interrupted with negative bestRound', () => {
    expect(isPanelEvent({
      type: 'interrupted', runId: 'r', bestRound: -1, composite: 0,
    })).toBe(false);
  });
  it('rejects interrupted with fractional bestRound', () => {
    expect(isPanelEvent({
      type: 'interrupted', runId: 'r', bestRound: 1.5, composite: 7,
    })).toBe(false);
  });
  it('rejects interrupted with negative composite', () => {
    expect(isPanelEvent({
      type: 'interrupted', runId: 'r', bestRound: 1, composite: -1,
    })).toBe(false);
  });

  // -- parser_warning position --
  it('rejects parser_warning with negative position', () => {
    expect(isPanelEvent({
      type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: -1,
    })).toBe(false);
  });
  it('rejects parser_warning with fractional position', () => {
    expect(isPanelEvent({
      type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: 1.5,
    })).toBe(false);
  });
  it('accepts parser_warning with position: 0 (start of stream)', () => {
    expect(isPanelEvent({
      type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: 0,
    })).toBe(true);
  });
});
