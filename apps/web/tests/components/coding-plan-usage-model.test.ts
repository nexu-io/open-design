// The pure reading of a Coding Plan preflight: which windows the panel draws,
// in which order, the REMAINING whole-percent share each one draws, and the
// period each one is named by.
//
// Kept apart from the component spec so the product rule — 「后端 preflight
// windows[] 逐条渲染，按 durationSeconds 升序」 — can be pinned against raw
// server payloads without rendering anything.

import { describe, expect, it } from 'vitest';

import { codingPlanQuotaView } from '../../src/components/coding-plan-usage-model';

function window(overrides: Partial<Parameters<typeof codingPlanQuotaView>[0][number]> = {}) {
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

describe('which windows the panel draws', () => {
  // The design ships a Go panel with TWO blocks (5 小时 over 7 天) and a
  // Plus/Pro/Max panel with one. Neither is hard-coded: the backend's window
  // list is the whole truth, and the client renders it entry by entry.
  it('draws every window the server sent, shortest first', () => {
    const views = codingPlanQuotaView([
      window({ policyId: 'month', durationSeconds: 2_592_000 }),
      window({ policyId: 'week', durationSeconds: 604_800 }),
      window({ policyId: 'five-hour', durationSeconds: 18_000 }),
    ]);

    expect(views.map((view) => view.policyId)).toEqual(['five-hour', 'week', 'month']);
    expect(views.map((view) => view.durationSeconds)).toEqual([18_000, 604_800, 2_592_000]);
  });

  it('draws the Go pair as two blocks, the 7-day-only plan as one', () => {
    const go = codingPlanQuotaView([
      window({ durationSeconds: 604_800 }),
      window({ durationSeconds: 18_000 }),
    ]);
    const plus = codingPlanQuotaView([window({ durationSeconds: 604_800 })]);

    expect(go).toHaveLength(2);
    expect(plus).toHaveLength(1);
  });

  it('has nothing to draw when the server sent no windows', () => {
    expect(codingPlanQuotaView([])).toEqual([]);
  });
});

describe('the period each block is named by', () => {
  it.each([
    { name: 'a whole-hour window under a day', seconds: 18_000, key: 'hours', count: 5 },
    { name: 'a one-hour window', seconds: 3_600, key: 'hours', count: 1 },
    { name: 'a whole-day window', seconds: 604_800, key: 'days', count: 7 },
    { name: 'a one-day window', seconds: 86_400, key: 'days', count: 1 },
    { name: 'a 30-day window', seconds: 2_592_000, key: 'days', count: 30 },
  ])('names $name', ({ seconds, key, count }) => {
    const [view] = codingPlanQuotaView([window({ durationSeconds: seconds })]);

    expect(view?.periodLabel).toEqual({
      key: key === 'hours' ? 'billing.codingPlanPeriodHours' : 'billing.codingPlanPeriodDays',
      count,
    });
  });

  // A duration the design's two units cannot name exactly (90 minutes, 36
  // hours). Drawing 「1.5 天」 would invent a unit the design has no copy for,
  // so the block keeps its name and drops the period suffix — the bar and the
  // share still read.
  it.each([
    { name: 'a window that is not a whole hour', seconds: 5_400 },
    { name: 'a multi-day window that is not a whole number of days', seconds: 129_600 },
    { name: 'a zero-length window', seconds: 0 },
  ])('draws no period for $name', ({ seconds }) => {
    const [view] = codingPlanQuotaView([window({ durationSeconds: seconds })]);

    expect(view?.periodLabel).toBeNull();
  });
});

describe('the share each block draws', () => {
  // The v2 spec inverts the number: the row reads 「剩余 N%」 and the bar fills
  // to the REMAINING share, not the spent one.
  it('reports the REMAINING share as a whole percent', () => {
    const [view] = codingPlanQuotaView([
      window({ usedCredits: '25000', limitCredits: '100000' }),
    ]);

    expect(view?.remainingPercent).toBe(75);
  });

  it.each([
    { name: 'rounds a fraction at the half', used: '35500', limit: '100000', remaining: 64 },
    { name: 'rounds a fraction below the half', used: '35400', limit: '100000', remaining: 65 },
    // A spent pool reads 0% left, never a negative — and never a red state: the
    // panel has no exhausted styling by product ruling.
    { name: 'clamps an over-spent pool at 0', used: '1040000', limit: '1000000', remaining: 0 },
    { name: 'clamps an untouched pool at 100', used: '0', limit: '1000000', remaining: 100 },
  ])('$name', ({ used, limit, remaining }) => {
    const [view] = codingPlanQuotaView([
      window({ usedCredits: used, limitCredits: limit }),
    ]);

    expect(view?.remainingPercent).toBe(remaining);
  });

  it('carries credit counts past Number.MAX_SAFE_INTEGER without losing the share', () => {
    const [view] = codingPlanQuotaView([
      window({
        usedCredits: '9007199254740993000',
        limitCredits: '18014398509481986000',
      }),
    ]);

    expect(view?.remainingPercent).toBe(50);
  });

  // An unreadable window is an ABSENCE of that block, not of the whole panel:
  // a readable 5-hour pool still draws beside a broken 7-day one.
  it.each([
    { name: 'a limit of zero', used: '0', limit: '0' },
    { name: 'a count the server did not write as a decimal', used: '1e6', limit: '100000' },
  ])('drops a block whose numbers are not a readable share — $name', ({ used, limit }) => {
    const views = codingPlanQuotaView([
      window({ policyId: 'broken', durationSeconds: 18_000, usedCredits: used, limitCredits: limit }),
      window({ policyId: 'week', durationSeconds: 604_800 }),
    ]);

    expect(views.map((view) => view.policyId)).toEqual(['week']);
  });
});
