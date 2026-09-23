// The pure reading of a Coding Plan preflight: which window the panel draws,
// and the whole-percent share it draws for it.
//
// Kept apart from the component spec so the product rule — 「只有 7 天窗口」 —
// can be pinned against raw server payloads without rendering anything.

import { describe, expect, it } from 'vitest';

import {
  CODING_PLAN_WEEK_SECONDS,
  codingPlanQuotaView,
} from '../../src/components/coding-plan-usage-model';

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

describe('which window the panel draws', () => {
  it('draws the 7-day window whatever order the server sent, ignoring the others', () => {
    const view = codingPlanQuotaView([
      window({ policyId: 'five-hour', durationSeconds: 18_000 }),
      window({ policyId: 'week', durationSeconds: CODING_PLAN_WEEK_SECONDS }),
      window({ policyId: 'month', durationSeconds: 2_592_000 }),
    ]);

    expect(view?.policyId).toBe('week');
    expect(view?.durationSeconds).toBe(604_800);
  });

  // The product surface names a 7-day allowance, so a payload without one has
  // no 7-day row to draw. The LONGEST window is the closest honest stand-in.
  it('falls back to the longest window when the server sent no 7-day one', () => {
    const view = codingPlanQuotaView([
      window({ policyId: 'five-hour', durationSeconds: 18_000 }),
      window({ policyId: 'month', durationSeconds: 2_592_000 }),
    ]);

    expect(view?.policyId).toBe('month');
  });

  it('has nothing to draw when the server sent no windows', () => {
    expect(codingPlanQuotaView([])).toBeNull();
  });
});

describe('the share it draws', () => {
  it('reports the USED share as a whole percent', () => {
    const view = codingPlanQuotaView([
      window({ durationSeconds: CODING_PLAN_WEEK_SECONDS, usedCredits: '25000', limitCredits: '100000' }),
    ]);

    expect(view?.usedPercent).toBe(25);
  });

  it.each([
    { name: 'rounds a fraction up at the half', used: '35500', limit: '100000', percent: 36 },
    { name: 'rounds a fraction down below the half', used: '35400', limit: '100000', percent: 35 },
    // A spent pool reads 100%, never 104% — and never a red state: the panel
    // has no exhausted styling by product ruling.
    { name: 'clamps an over-spent pool at 100', used: '1040000', limit: '1000000', percent: 100 },
    { name: 'clamps an untouched pool at 0', used: '0', limit: '1000000', percent: 0 },
  ])('$name', ({ used, limit, percent }) => {
    const view = codingPlanQuotaView([
      window({ durationSeconds: CODING_PLAN_WEEK_SECONDS, usedCredits: used, limitCredits: limit }),
    ]);

    expect(view?.usedPercent).toBe(percent);
  });

  it('carries credit counts past Number.MAX_SAFE_INTEGER without losing the share', () => {
    const view = codingPlanQuotaView([
      window({
        durationSeconds: CODING_PLAN_WEEK_SECONDS,
        usedCredits: '9007199254740993000',
        limitCredits: '18014398509481986000',
      }),
    ]);

    expect(view?.usedPercent).toBe(50);
  });

  it.each([
    { name: 'a limit of zero', used: '0', limit: '0' },
    { name: 'a count the server did not write as a decimal', used: '1e6', limit: '100000' },
  ])('has nothing to draw for $name', ({ used, limit }) => {
    expect(
      codingPlanQuotaView([
        window({ durationSeconds: CODING_PLAN_WEEK_SECONDS, usedCredits: used, limitCredits: limit }),
      ]),
    ).toBeNull();
  });
});
