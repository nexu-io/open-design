// The pure reading of a Coding Plan preflight: window order, used percentage,
// remaining money, and the reset countdown.
//
// These live apart from the component spec because the reset line is the one
// piece that depends on the VIEWER's clock and timezone. Pinning both here
// (fixed `resetsAt`, fixed `timeZone`) keeps the assertion meaningful on any
// machine; the component spec then only has to prove it renders what this
// returns.

import { describe, expect, it } from 'vitest';

import {
  CODING_PLAN_CREDITS_PER_USD,
  codingPlanCreditsToUsd,
  codingPlanResetCountdown,
  codingPlanWindowDuration,
  codingPlanWindowViews,
  formatCodingPlanResetAt,
} from '../../src/components/coding-plan-usage-model';

function window(overrides: Partial<Parameters<typeof codingPlanWindowViews>[0][number]> = {}) {
  return {
    policyId: 'p',
    durationSeconds: 18_000,
    resetMode: 'activity_triggered' as const,
    usedCredits: '25000',
    limitCredits: '100000',
    remainingCredits: '75000',
    windowStart: null,
    resetsAt: null,
    ...overrides,
  };
}

describe('coding plan window durations', () => {
  it.each([
    { seconds: 18_000, unit: 'hour', count: 5 },
    { seconds: 604_800, unit: 'day', count: 7 },
    { seconds: 2_592_000, unit: 'day', count: 30 },
    // Anything else still has to name itself rather than print raw seconds.
    { seconds: 3_600, unit: 'hour', count: 1 },
    { seconds: 43_200, unit: 'hour', count: 12 },
    { seconds: 172_800, unit: 'day', count: 2 },
  ])('names a $seconds-second window as $count $unit', ({ seconds, unit, count }) => {
    expect(codingPlanWindowDuration(seconds)).toEqual({ unit, count });
  });
});

describe('coding plan window views', () => {
  it('orders the server windows shortest-first without dropping or merging any', () => {
    const views = codingPlanWindowViews([
      window({ policyId: 'month', durationSeconds: 2_592_000 }),
      window({ policyId: 'five-hour', durationSeconds: 18_000 }),
      window({ policyId: 'week', durationSeconds: 604_800 }),
    ]);

    expect(views.map((view) => view.policyId)).toEqual(['five-hour', 'week', 'month']);
  });

  it('reports the USED share, not the remaining one', () => {
    const [view] = codingPlanWindowViews([
      window({ usedCredits: '25000', limitCredits: '100000', remainingCredits: '75000' }),
    ]);

    expect(view!.usedPercent).toBe(25);
  });

  it.each([
    { name: 'over-spent pool', used: '120000', limit: '100000', remaining: '0', percent: 100 },
    { name: 'untouched pool', used: '0', limit: '100000', remaining: '100000', percent: 0 },
  ])('clamps the $name into 0–100', ({ used, limit, remaining, percent }) => {
    const [view] = codingPlanWindowViews([
      window({ usedCredits: used, limitCredits: limit, remainingCredits: remaining }),
    ]);

    expect(view!.usedPercent).toBe(percent);
  });

  it('carries credit counts past Number.MAX_SAFE_INTEGER without losing the share', () => {
    const [view] = codingPlanWindowViews([
      window({
        usedCredits: '4611686018427387904',
        limitCredits: '9223372036854775808',
        remainingCredits: '4611686018427387904',
      }),
    ]);

    expect(view!.usedPercent).toBe(50);
  });

  it('renders the REMAINING pool as money', () => {
    const [view] = codingPlanWindowViews([window({ remainingCredits: '75000' })]);

    expect(view!.remainingUsd).toBe(`$${(75_000 / CODING_PLAN_CREDITS_PER_USD).toFixed(2)}`);
  });

  // The exchange rate is the backend's, not ours. A window priced from a
  // hard-coded copy goes wrong silently the day Vela changes it, so the rate
  // the summary shipped has to reach the money on the row.
  it('prices the remaining pool with the rate the server sent', () => {
    const [view] = codingPlanWindowViews([window({ remainingCredits: '750000' })], 100_000);

    expect(view!.remainingUsd).toBe('$7.50');
  });

  it('falls back to the built-in rate when the server sent none', () => {
    const [view] = codingPlanWindowViews([window({ remainingCredits: '750000' })]);

    expect(view!.remainingUsd).toBe('$75.00');
  });

  it('flags an emptied window as exhausted', () => {
    const [view] = codingPlanWindowViews([
      window({ usedCredits: '100000', limitCredits: '100000', remainingCredits: '0' }),
    ]);

    expect(view!.exhausted).toBe(true);
    expect(view!.notStarted).toBe(false);
  });

  it('flags an untouched, un-anchored window as not started', () => {
    const [view] = codingPlanWindowViews([
      window({ usedCredits: '0', remainingCredits: '100000', resetsAt: null }),
    ]);

    expect(view!.notStarted).toBe(true);
    expect(view!.exhausted).toBe(false);
  });

  it('does not call an anchored window not-started just because nothing was spent', () => {
    const [view] = codingPlanWindowViews([
      window({ usedCredits: '0', resetsAt: '2026-09-23T00:00:00.000Z' }),
    ]);

    expect(view!.notStarted).toBe(false);
  });
});

describe('credits → USD', () => {
  it('returns null for a value the server did not write as a decimal count', () => {
    expect(codingPlanCreditsToUsd('')).toBeNull();
    expect(codingPlanCreditsToUsd('lots')).toBeNull();
  });

  it('divides by the rate the server sent', () => {
    expect(codingPlanCreditsToUsd('750000', 100_000)).toBe(7.5);
  });

  it.each([
    { name: 'absent', rate: undefined },
    { name: 'null', rate: null },
    { name: 'zero', rate: 0 },
    { name: 'negative', rate: -10_000 },
    { name: 'not a number', rate: Number.NaN },
    // Below 1 credit per dollar is not a rate, and it is the dangerous shape:
    // the division runs in BigInt, so a rate that rounds to zero throws.
    { name: 'under one credit per dollar', rate: 0.4 },
    { name: 'a half credit per dollar', rate: 0.5 },
  ])('falls back to the built-in rate when the server rate is $name', ({ rate }) => {
    expect(codingPlanCreditsToUsd('750000', rate)).toBe(750_000 / CODING_PLAN_CREDITS_PER_USD);
  });
});

describe('reset countdown', () => {
  const now = Date.parse('2026-09-22T10:00:00.000Z');

  it('splits a multi-day wait into days and hours', () => {
    expect(codingPlanResetCountdown('2026-09-25T13:30:00.000Z', now)).toEqual({
      days: 3,
      hours: 3,
    });
  });

  it('drops the day part when less than a day is left', () => {
    expect(codingPlanResetCountdown('2026-09-22T17:45:00.000Z', now)).toEqual({
      days: 0,
      hours: 7,
    });
  });

  it('has nothing to count down under an hour or in the past', () => {
    expect(codingPlanResetCountdown('2026-09-22T10:30:00.000Z', now)).toBeNull();
    expect(codingPlanResetCountdown('2026-09-22T09:00:00.000Z', now)).toBeNull();
  });
});

describe('reset instant', () => {
  // `resetsAt` is UTC; the user reads their own wall clock. Both the locale and
  // the zone are pinned so this says something on any machine.
  it('renders the UTC instant in the viewer timezone', () => {
    expect(
      formatCodingPlanResetAt('2026-09-25T13:30:00.000Z', 'en', 'Asia/Shanghai'),
    ).toContain('9:30');
    expect(
      formatCodingPlanResetAt('2026-09-25T13:30:00.000Z', 'en', 'UTC'),
    ).toContain('1:30');
  });
});
