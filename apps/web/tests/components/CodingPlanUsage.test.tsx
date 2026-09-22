// @vitest-environment jsdom
//
// The Coding Plan quota area inside the top-right billing card.
//
// Product ruling for the Go/Plus/Pro/Max quota panel:
//  · no plan (or no tier) → the quota area is ABSENT, not a placeholder line;
//  · eligible → one row per window the SERVER sent, shortest window first;
//  · each row names the window, the USED share, the REMAINING money and when
//    it resets;
//  · a window that has never been used says so neutrally — it must NOT claim
//    the clock starts on first use (backend semantics are changing);
//  · an emptied window gets a warning-coloured bar and 「已用完」 and NOTHING
//    else: the exhausted-state guidance is a separate, undecided surface;
//  · a failed read is one quiet line, never an error.

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodingPlanUsage } from '../../src/components/CodingPlanUsage';
import { I18nProvider } from '../../src/i18n';
import { workspaceContextFixture } from '../helpers/workspace-context';

const context = workspaceContextFixture({
  workspaceId: 'ws',
  workspaceMemberId: 'member',
  workspaceType: 'team',
});

interface WindowInput {
  policyId?: string;
  durationSeconds: number;
  usedCredits?: string;
  limitCredits?: string;
  remainingCredits?: string;
  resetsAt?: string | null;
}

function preflight(options: {
  member?: string;
  eligible?: boolean;
  tier?: 'go' | 'plus' | 'pro' | 'max' | null;
  windows?: WindowInput[];
} = {}) {
  const {
    member = 'member',
    eligible = true,
    tier = 'pro',
    windows = [
      { durationSeconds: 18_000 },
      { durationSeconds: 604_800 },
    ],
  } = options;
  return {
    preflight: {
      schemaVersion: 1,
      workspaceId: 'ws',
      workspaceMemberId: member,
      modelId: null,
      generatedAt: new Date().toISOString(),
      balanceUsd: '0',
      modelCovered: null,
      funding: 'gateway',
      codingPlan: {
        workspaceId: 'ws',
        generatedAt: new Date().toISOString(),
        eligible,
        tier,
        windows: windows.map((entry) => ({
          policyId: entry.policyId ?? String(entry.durationSeconds),
          durationSeconds: entry.durationSeconds,
          usedCredits: entry.usedCredits ?? '250000',
          limitCredits: entry.limitCredits ?? '1000000',
          remainingCredits: entry.remainingCredits ?? '750000',
          resetsAt:
            entry.resetsAt === undefined
              ? new Date(Date.now() + 1000).toISOString()
              : entry.resetsAt,
          windowStart: null,
          resetMode: 'activity_triggered',
        })),
      },
    },
  };
}

function response(
  options?: Parameters<typeof preflight>[0],
  summary?: { creditsPerUsd?: number } | null,
) {
  return new Response(
    JSON.stringify({
      ...preflight(options),
      ...(summary === undefined ? {} : { summary }),
    }),
  );
}

function renderPanel(locale: 'en' | 'zh-CN' = 'en') {
  return render(
    <I18nProvider initial={locale}>
      <CodingPlanUsage context={context} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Coding Plan quota area — when it exists at all', () => {
  it.each([
    { name: 'member without a plan', options: { eligible: false, tier: null } },
    { name: 'plan the backend reports without a tier', options: { eligible: true, tier: null } },
  ])('renders nothing at all for a $name', async ({ options }) => {
    const fetcher = vi.fn(async () => response(options as Parameters<typeof preflight>[0]));
    vi.stubGlobal('fetch', fetcher);

    const { container } = renderPanel();

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
    // The old placeholder sentence is gone: a free workspace sees only the
    // wallet row, with nothing explaining an absence.
    expect(screen.queryByText(/no coding plan/i)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows a skeleton — not an error and not an empty gap — while the read is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    renderPanel();

    expect(screen.getByTestId('coding-plan-usage-skeleton')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Plan usage unavailable')).toBeNull();
  });
});

describe('Coding Plan quota area — one row per server window', () => {
  it.each([
    {
      name: 'three windows',
      windows: [
        { durationSeconds: 2_592_000 },
        { durationSeconds: 18_000 },
        { durationSeconds: 604_800 },
      ],
      order: ['5-hour window', '7-day window', '30-day window'],
    },
    {
      name: 'two windows',
      windows: [{ durationSeconds: 604_800 }, { durationSeconds: 18_000 }],
      order: ['5-hour window', '7-day window'],
    },
    {
      name: 'one window',
      windows: [{ durationSeconds: 18_000 }],
      order: ['5-hour window'],
    },
  ])('draws $name shortest-first, with no sum and no unlimited claim', async ({ windows, order }) => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ windows })));

    renderPanel();

    await screen.findByText(order[0]!);
    const rendered = screen
      .getAllByTestId('coding-plan-window')
      .map((row) => within(row).getByTestId('coding-plan-window-name').textContent);
    expect(rendered).toEqual(order);
    expect(screen.getAllByRole('progressbar')).toHaveLength(order.length);
    expect(screen.queryByText(/unlimited/i)).toBeNull();
  });

  it('reports the used share and the remaining money for each window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            {
              durationSeconds: 18_000,
              usedCredits: '250000',
              limitCredits: '1000000',
              remainingCredits: '750000',
            },
          ],
        }),
      ),
    );

    renderPanel();

    const row = within(await screen.findByTestId('coding-plan-window'));
    expect(row.getByText('25% used')).toBeTruthy();
    expect(row.getByText('$75.00 left')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('25');
  });

  it.each([
    { name: 'over-spent', used: '1200000', limit: '1000000', remaining: '0', percent: '100' },
    { name: 'untouched', used: '0', limit: '1000000', remaining: '1000000', percent: '0' },
  ])('clamps a $name window into 0–100', async ({ used, limit, remaining, percent }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            {
              durationSeconds: 18_000,
              usedCredits: used,
              limitCredits: limit,
              remainingCredits: remaining,
              resetsAt: '2026-09-25T13:30:00.000Z',
            },
          ],
        }),
      ),
    );

    renderPanel();

    await screen.findByTestId('coding-plan-window');
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe(percent);
  });
});

describe('Coding Plan quota area — window states', () => {
  it('says a never-used window has not started, WITHOUT promising a first-use trigger', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            {
              durationSeconds: 18_000,
              usedCredits: '0',
              remainingCredits: '1000000',
              resetsAt: null,
            },
          ],
        }),
      ),
    );

    renderPanel();

    expect(await screen.findByText('Window not started yet')).toBeTruthy();
    expect(screen.queryByText(/first use/i)).toBeNull();
  });

  it('marks an emptied window as used up and adds no upsell of any kind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            {
              durationSeconds: 18_000,
              usedCredits: '1000000',
              limitCredits: '1000000',
              remainingCredits: '0',
              resetsAt: '2026-09-25T13:30:00.000Z',
            },
          ],
        }),
      ),
    );

    const { container } = renderPanel();

    const row = await screen.findByTestId('coding-plan-window');
    expect(within(row).getByText('Used up')).toBeTruthy();
    expect(row.dataset.exhausted).toBe('true');
    // The exhausted-state guidance (card / dialog / CTA) is a separate,
    // undecided surface. Nothing actionable may appear here.
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('counts down to the reset and keeps the machine-readable instant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-22T10:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [{ durationSeconds: 18_000, resetsAt: '2026-09-25T13:30:00.000Z' }],
        }),
      ),
    );

    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const row = within(screen.getByTestId('coding-plan-window'));
    // The local wall-clock half of the line is timezone-dependent and is
    // pinned in coding-plan-usage-model.test.ts; here only the countdown and
    // the machine value have to hold.
    expect(row.getByTestId('coding-plan-window-reset').textContent).toMatch(
      /^Resets in 3d 3h · /,
    );
    expect(row.getByText(/Resets in 3d 3h/).closest('time')?.getAttribute('dateTime')).toBe(
      '2026-09-25T13:30:00.000Z',
    );
  });

  // The final hour is the one the countdown is worth the most in, so the row
  // must not fall back to the bare instant there.
  it('keeps counting down in minutes inside the last hour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-22T10:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [{ durationSeconds: 18_000, resetsAt: '2026-09-22T10:12:00.000Z' }],
        }),
      ),
    );

    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const row = within(screen.getByTestId('coding-plan-window'));
    expect(row.getByTestId('coding-plan-window-reset').textContent).toMatch(
      /^Resets in 12m · /,
    );
  });

  it('refreshes when the quota window resets without a wallet event', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () =>
      response({ windows: [{ durationSeconds: 18_000, usedCredits: '1000000', remainingCredits: '0' }] }),
    );
    vi.stubGlobal('fetch', fetcher);

    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Used up')).toBeTruthy();

    fetcher.mockImplementation(async () =>
      response({ windows: [{ durationSeconds: 18_000, usedCredits: '0', remainingCredits: '1000000' }] }),
    );
    // Nothing may fire BEFORE the reset instant: the second read is the reset,
    // not a poll that happened to land near it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(screen.getByText('0% used')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // The preflight is uncached on the daemon side and costs a dozen DB queries,
  // so an open panel must not hold a heartbeat on it. The only thing worth
  // waking up for is the window reset, which the panel already knows the
  // instant of.
  //
  // The 30-day window is deliberate: its reset is ~2.59e9 ms out, past what a
  // 32-bit `setTimeout` delay can hold. An unclamped wait there does not fire
  // late — it wraps and fires on the next tick, a request per millisecond.
  it('does not poll while the panel sits open — one read at mount, none on a timer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-22T10:00:00.000Z'));
    const fetcher = vi.fn(async () =>
      response({
        windows: [{ durationSeconds: 2_592_000, resetsAt: '2026-10-22T10:00:00.000Z' }],
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Coding Plan quota area — the credits-per-dollar rate', () => {
  it.each([
    { name: 'the rate the server sent', creditsPerUsd: 100_000, amount: '$7.50 left' },
    { name: 'the built-in fallback when the server sent none', creditsPerUsd: undefined, amount: '$75.00 left' },
  ])('prices the remaining pool with $name', async ({ creditsPerUsd, amount }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(
          {
            windows: [
              {
                durationSeconds: 18_000,
                usedCredits: '250000',
                limitCredits: '1000000',
                remainingCredits: '750000',
              },
            ],
          },
          creditsPerUsd === undefined ? {} : { creditsPerUsd },
        ),
      ),
    );

    renderPanel();

    const row = within(await screen.findByTestId('coding-plan-window'));
    expect(row.getByText(amount)).toBeTruthy();
  });
});

describe('Coding Plan quota area — unavailable read', () => {
  it.each([
    { name: 'a 503 from the daemon', make: () => new Response('', { status: 503 }) },
    { name: 'a transport failure', make: () => Promise.reject(new Error('offline')) },
    { name: 'another member’s pool', make: () => response({ member: 'other' }) },
  ])('shows one quiet line for $name', async ({ make }) => {
    vi.stubGlobal('fetch', vi.fn(async () => make()));

    const { container } = renderPanel();

    expect(await screen.findByText('Plan usage unavailable')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    // Quiet: not an alert, and not the exhausted warning styling either.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('[data-exhausted="true"]')).toBeNull();
  });
});
