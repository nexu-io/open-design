/**
 * Ratchet decision matrix (Phase 16). Drives `evaluateRollout` through
 * every cell of the promote / hold / demote table the spec describes.
 * The function is pure, so every case here is a direct (inputs ->
 * outputs) assertion with no I/O.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluateRollout,
  type ConformanceDay,
  type RatchetDecision,
} from '../src/critique/ratchet.js';

const FROZEN_NOW = () => new Date('2026-05-13T00:00:00Z');

function isoDay(offsetDays: number): string {
  const d = new Date(FROZEN_NOW().getTime() - offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function passingRow(date: string, adapter = 'mock'): ConformanceDay {
  return { date, adapter, shippedRate: 0.95, cleanParseRate: 0.98, totalRuns: 100 };
}

function failingRow(date: string, adapter = 'mock'): ConformanceDay {
  return { date, adapter, shippedRate: 0.30, cleanParseRate: 0.40, totalRuns: 100 };
}

describe('evaluateRollout (Phase 16)', () => {
  it('promotes M0 -> M1 when every day in the window passes both thresholds', () => {
    const history = Array.from({ length: 14 }, (_, i) => passingRow(isoDay(i)));
    const decision = evaluateRollout({ current: 'M0', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('promote');
    if (decision.kind === 'promote') {
      expect(decision.from).toBe('M0');
      expect(decision.to).toBe('M1');
      expect(decision.evidenceDays).toBe(14);
    }
  });

  it('promotes M2 -> M3 when every day passes', () => {
    const history = Array.from({ length: 14 }, (_, i) => passingRow(isoDay(i)));
    const decision = evaluateRollout({ current: 'M2', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('promote');
    if (decision.kind === 'promote') expect(decision.to).toBe('M3');
  });

  it('holds at M3 when already at the ceiling (cannot promote further)', () => {
    const history = Array.from({ length: 14 }, (_, i) => passingRow(isoDay(i)));
    const decision = evaluateRollout({ current: 'M3', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') {
      expect(decision.current).toBe('M3');
      expect(decision.reason).toContain('already at M3');
      expect(decision.passingDays).toBe(14);
    }
  });

  it('holds when one day in the window is a near-miss (89% shipped)', () => {
    const history: ConformanceDay[] = [];
    for (let i = 0; i < 14; i++) history.push(passingRow(isoDay(i)));
    // Overwrite day 5 with a near-miss row.
    history[5] = { date: isoDay(5), adapter: 'mock', shippedRate: 0.89, cleanParseRate: 0.98, totalRuns: 100 };
    const decision = evaluateRollout({ current: 'M1', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') {
      expect(decision.passingDays).toBe(13);
      expect(decision.observedDays).toBe(14);
      expect(decision.reason).toContain('near-miss');
    }
  });

  it('holds with "insufficient data" when only some window days have rows', () => {
    const history = Array.from({ length: 7 }, (_, i) => passingRow(isoDay(i)));
    const decision = evaluateRollout({ current: 'M1', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') {
      expect(decision.observedDays).toBe(7);
      expect(decision.passingDays).toBe(7);
      expect(decision.reason).toContain('insufficient data');
    }
  });

  it('demotes M2 -> M1 when any day breaches the demote floor (shipped < 0.45)', () => {
    const history = Array.from({ length: 14 }, (_, i) => passingRow(isoDay(i)));
    history[3] = failingRow(isoDay(3));
    const decision = evaluateRollout({ current: 'M2', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('demote');
    if (decision.kind === 'demote') {
      expect(decision.from).toBe('M2');
      expect(decision.to).toBe('M1');
      expect(decision.reason).toContain('fell below 45%');
    }
  });

  it('cannot demote past M0; holds with a "would-demote" reason instead', () => {
    const history: ConformanceDay[] = [];
    for (let i = 0; i < 14; i++) history.push(passingRow(isoDay(i)));
    history[3] = failingRow(isoDay(3));
    const decision = evaluateRollout({ current: 'M0', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') {
      expect(decision.current).toBe('M0');
      expect(decision.reason).toContain('already at M0');
    }
  });

  it('aggregates across adapters per day as a weighted mean', () => {
    // Two adapters, both observed for all 14 days. Adapter A passes
    // at 0.95 shipped, adapter B passes at 0.92 shipped, both with
    // equal weight (totalRuns = 100). Fleet shipped = 0.935, still
    // above 0.90, so the day passes.
    const history: ConformanceDay[] = [];
    for (let i = 0; i < 14; i++) {
      const date = isoDay(i);
      history.push({ date, adapter: 'A', shippedRate: 0.95, cleanParseRate: 0.98, totalRuns: 100 });
      history.push({ date, adapter: 'B', shippedRate: 0.92, cleanParseRate: 0.97, totalRuns: 100 });
    }
    const decision = evaluateRollout({ current: 'M1', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('promote');
  });

  it('does not double-count rows outside the window', () => {
    // Days 0..13 inside, day 14 outside. Day 14 has a failing row that
    // would otherwise trip the demote, but the evaluator should ignore
    // it because it falls outside the rolling 14-day window.
    const history: ConformanceDay[] = Array.from({ length: 14 }, (_, i) => passingRow(isoDay(i)));
    history.push(failingRow(isoDay(14)));
    const decision = evaluateRollout({ current: 'M1', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('promote');
  });

  it('clean-parse-rate gate fails the day even when shipped clears', () => {
    const history: ConformanceDay[] = [];
    for (let i = 0; i < 14; i++) {
      history.push({ date: isoDay(i), adapter: 'mock', shippedRate: 0.95, cleanParseRate: 0.88, totalRuns: 100 });
    }
    const decision = evaluateRollout({ current: 'M1', history, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') {
      expect(decision.passingDays).toBe(0);
      expect(decision.reason).toContain('near-miss');
    }
  });

  it('refuses to promote on a zero-windowDays request even with no history (Codex + lefarcen P1)', () => {
    // 0 >= 0 would trivially pass the promote gate at zero observed
    // days without the entry-validation guard; assert that we hold
    // with an explicit reason instead.
    const decision = evaluateRollout({ current: 'M1', history: [], windowDays: 0, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') {
      expect(decision.reason).toContain('invalid windowDays');
      expect(decision.passingDays).toBe(0);
      expect(decision.observedDays).toBe(0);
    }
  });

  it('refuses to evaluate on a negative windowDays', () => {
    const decision = evaluateRollout({ current: 'M1', history: [], windowDays: -7, now: FROZEN_NOW });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') expect(decision.reason).toContain('invalid windowDays');
  });

  it('refuses to evaluate on an out-of-range shippedThreshold', () => {
    const decision = evaluateRollout({
      current: 'M1',
      history: [],
      shippedThreshold: 1.5,
      now: FROZEN_NOW,
    });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') expect(decision.reason).toContain('invalid shippedThreshold');
  });

  it('refuses to evaluate on a negative cleanParseThreshold', () => {
    const decision = evaluateRollout({
      current: 'M1',
      history: [],
      cleanParseThreshold: -0.1,
      now: FROZEN_NOW,
    });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') expect(decision.reason).toContain('invalid cleanParseThreshold');
  });

  it('refuses NaN on every numeric input (PerishCode follow-up on PR #1499)', () => {
    // Number.isFinite() rejects NaN, so the guard already handles
    // these. Pin the behavior explicitly so a future refactor of the
    // guard (`>= 0 && <= 1`, a typed parser, a clamp helper) cannot
    // accidentally let NaN through and surface a zero-evidence
    // promote signal.
    const windowNaN = evaluateRollout({
      current: 'M1',
      history: [],
      windowDays: Number.NaN,
      now: FROZEN_NOW,
    });
    expect(windowNaN.kind).toBe('hold');
    if (windowNaN.kind === 'hold') expect(windowNaN.reason).toContain('invalid windowDays');

    const shippedNaN = evaluateRollout({
      current: 'M1',
      history: [],
      shippedThreshold: Number.NaN,
      now: FROZEN_NOW,
    });
    expect(shippedNaN.kind).toBe('hold');
    if (shippedNaN.kind === 'hold') expect(shippedNaN.reason).toContain('invalid shippedThreshold');

    const cleanNaN = evaluateRollout({
      current: 'M1',
      history: [],
      cleanParseThreshold: Number.NaN,
      now: FROZEN_NOW,
    });
    expect(cleanNaN.kind).toBe('hold');
    if (cleanNaN.kind === 'hold') expect(cleanNaN.reason).toContain('invalid cleanParseThreshold');
  });
});

// Type assertion: every RatchetDecision should be one of three kinds.
// This is a compile-time guard, not a runtime test; if the discriminated
// union grows a new kind, this will fail to compile until updated.
const _decisionExhaustiveCheck = (d: RatchetDecision): string => {
  switch (d.kind) {
    case 'hold':
    case 'promote':
    case 'demote':
      return d.kind;
  }
};
void _decisionExhaustiveCheck;
