// @vitest-environment jsdom
//
// The Coding Plan quota block inside the top-right billing card, rebuilt 1:1
// against the design (PR #8364, `docs/ui-previews/plan-panels/`).
//
// What the design defines, and therefore all this block may draw:
//  · ONE row — 「7天额度免费用」 on the left, 「已用 N% ›」 as an entry on the
//    right — and a 5px progress track under it. Nothing else: no title, no
//    window name, no remaining dollars, no reset time, no explainer;
//  · a skeleton while the read is in flight;
//  · a spent pool is just 100% — no red, no 「已用完」. The exhausted state
//    stays with the existing in-conversation card;
//  · everything else (no plan, an old CLI with no preflight, a TEAM
//    workspace) draws NOTHING — the card falls back to its wallet row alone.

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodingPlanUsage } from '../../src/components/CodingPlanUsage';
import { I18nProvider } from '../../src/i18n';
import { workspaceContextFixture } from '../helpers/workspace-context';

const USAGE_URL = 'https://console.example.com/dashboard?workspaceId=ws';

/** A PERSONAL workspace: the only kind that draws a quota block at all. */
function personal(overrides: Partial<WorkspaceCollabContext> = {}) {
  return workspaceContextFixture({
    workspaceId: 'ws',
    workspaceMemberId: 'member',
    workspaceType: 'personal',
    planId: 'plus',
    ...overrides,
  });
}

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
  omit?: boolean;
} = {}) {
  const {
    member = 'member',
    eligible = true,
    tier = 'pro',
    windows = [{ durationSeconds: 18_000 }, { durationSeconds: 604_800 }],
    omit = false,
  } = options;
  if (omit) {
    // An older vela CLI answers billing without a preflight at all.
    return {};
  }
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

function response(options?: Parameters<typeof preflight>[0]) {
  return new Response(JSON.stringify(preflight(options)));
}

function renderPanel(
  overrides: {
    locale?: 'en' | 'zh-CN';
    context?: WorkspaceCollabContext;
    usageUrl?: string | null;
    onUsageClick?: () => void;
  } = {},
) {
  const {
    locale = 'zh-CN',
    context = personal(),
    usageUrl = USAGE_URL,
    onUsageClick,
  } = overrides;
  return render(
    <I18nProvider initial={locale}>
      <CodingPlanUsage context={context} usageUrl={usageUrl} onUsageClick={onUsageClick} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Coding Plan quota block — the one row the design defines', () => {
  it('draws the 7-day allowance, its used share and its track — and nothing else', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response()));

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('7天额度免费用')).toBeTruthy();
    expect(within(block).getByText('已用 25%')).toBeTruthy();
    expect(within(block).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');

    // The improvised surface this replaces is gone, every line of it.
    expect(screen.queryByText('Coding Plan')).toBeNull();
    expect(screen.queryByText(/窗口/)).toBeNull();
    expect(screen.queryByText(/剩余/)).toBeNull();
    expect(screen.queryByText(/重置/)).toBeNull();
    expect(screen.queryByText(/钱包/)).toBeNull();
  });

  it('rounds the share to a whole percent and fills the track to match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            { durationSeconds: 604_800, usedCredits: '355000', limitCredits: '1000000' },
          ],
        }),
      ),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('已用 36%')).toBeTruthy();
    expect(
      (within(block).getByTestId('coding-plan-quota-fill') as HTMLElement).style.width,
    ).toBe('36%');
  });

  // Product ruling: the panel has no exhausted state. A spent pool is a full
  // bar at 100% — the same ink, no warning colour, no 「已用完」.
  it('shows a spent pool as a plain, full 100% — no warning state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            {
              durationSeconds: 604_800,
              usedCredits: '1000000',
              limitCredits: '1000000',
              remainingCredits: '0',
            },
          ],
        }),
      ),
    );

    const { container } = renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('已用 100%')).toBeTruthy();
    expect(
      (within(block).getByTestId('coding-plan-quota-fill') as HTMLElement).style.width,
    ).toBe('100%');
    expect(screen.queryByText('已用完')).toBeNull();
    expect(container.querySelector('[data-exhausted="true"]')).toBeNull();
  });

  // 产品口径: 只有 7 天窗口. The daemon still ships 5-hour / 30-day rows.
  it('draws only the 7-day window when the server sent several', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            { durationSeconds: 18_000, usedCredits: '900000', limitCredits: '1000000' },
            { durationSeconds: 604_800, usedCredits: '100000', limitCredits: '1000000' },
            { durationSeconds: 2_592_000, usedCredits: '500000', limitCredits: '1000000' },
          ],
        }),
      ),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getAllByRole('progressbar')).toHaveLength(1);
    expect(within(block).getByText('已用 10%')).toBeTruthy();
  });

  it('falls back to the longest window when the server sent no 7-day one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            { durationSeconds: 18_000, usedCredits: '900000', limitCredits: '1000000' },
            { durationSeconds: 2_592_000, usedCredits: '500000', limitCredits: '1000000' },
          ],
        }),
      ),
    );

    renderPanel();

    expect(within(await screen.findByTestId('coding-plan-quota')).getByText('已用 50%')).toBeTruthy();
  });

  it('names the allowance in English too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response()));

    renderPanel({ locale: 'en' });

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('7-day allowance')).toBeTruthy();
    expect(within(block).getByText('25% used')).toBeTruthy();
  });
});

describe('Coding Plan quota block — the used-share entry', () => {
  it('links the share out to the billing console', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response()));

    renderPanel();

    const entry = await screen.findByTestId('coding-plan-quota-entry');
    expect(entry.getAttribute('href')).toBe(USAGE_URL);
    expect(entry.getAttribute('target')).toBe('_blank');
    expect(entry.getAttribute('rel')).toContain('noopener');
  });

  it('tells the card the entry was taken, so it can close and record it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response()));
    const onUsageClick = vi.fn();

    renderPanel({ onUsageClick });

    (await screen.findByTestId('coding-plan-quota-entry')).click();
    expect(onUsageClick).toHaveBeenCalledTimes(1);
  });

  // No destination is not a dead link: the share still reads, it just stops
  // being an entry.
  it('keeps the share as plain text when the card has no console URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response()));

    renderPanel({ usageUrl: null });

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('已用 25%')).toBeTruthy();
    expect(screen.queryByTestId('coding-plan-quota-entry')).toBeNull();
  });
});

describe('Coding Plan quota block — when it draws nothing at all', () => {
  // The user ruling this block exists under: 团队版的面板跟以前保持一致.
  it.each([
    { name: 'a team-typed workspace', context: () => personal({ workspaceType: 'team' }) },
    { name: 'a team plan id', context: () => personal({ planId: 'team_pro' }) },
  ])('draws nothing — and reads no preflight — for $name', async ({ context }) => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal('fetch', fetcher);

    const { container } = renderPanel({ context: context() });

    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(screen.queryByTestId('coding-plan-quota')).toBeNull();
    // Not even the skeleton: the answer is known before any read.
    expect(screen.queryByTestId('coding-plan-quota-skeleton')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'a member with no plan', options: { eligible: false, tier: null } },
    { name: 'a plan the backend reports without a tier', options: { eligible: true, tier: null } },
    { name: 'a plan whose windows are all empty', options: { windows: [] } },
  ])('draws nothing for $name', async ({ options }) => {
    const fetcher = vi.fn(async () => response(options as Parameters<typeof preflight>[0]));
    vi.stubGlobal('fetch', fetcher);

    const { container } = renderPanel();

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  // The old 「套餐用量暂不可用」 line is gone: a quota the client could not
  // read is an absence, not a sentence the user has to read past.
  it.each([
    { name: 'an old CLI that answers billing without a preflight', make: () => response({ omit: true }) },
    { name: 'a 503 from the daemon', make: () => new Response('', { status: 503 }) },
    { name: 'a transport failure', make: () => Promise.reject(new Error('offline')) },
    { name: 'another member’s pool', make: () => response({ member: 'other' }) },
  ])('draws nothing for $name', async ({ make }) => {
    vi.stubGlobal('fetch', vi.fn(async () => make()));

    const { container } = renderPanel();

    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(screen.queryByText(/暂不可用/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Coding Plan quota block — loading', () => {
  it('holds the design skeleton — two bones and a track — while the read is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    renderPanel();

    const skeleton = screen.getByTestId('coding-plan-quota-skeleton');
    // Same slot as the loaded block, so the card does not resize under the
    // pointer when the reading lands.
    expect(skeleton.dataset.codingPlanQuota).toBe('');
    expect(skeleton.querySelectorAll('[data-testid="coding-plan-quota-bone"]')).toHaveLength(3);
    expect(screen.queryByRole('progressbar')).toBeNull();
    // Nothing to click while it is unknown.
    expect(screen.queryByTestId('coding-plan-quota-entry')).toBeNull();
  });
});

describe('Coding Plan quota block — reading the quota', () => {
  it('refreshes when the quota window resets, without polling while it sits open', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () =>
      response({
        windows: [
          {
            durationSeconds: 604_800,
            usedCredits: '1000000',
            limitCredits: '1000000',
            remainingCredits: '0',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('已用 100%')).toBeTruthy();

    fetcher.mockImplementation(async () =>
      response({
        windows: [
          {
            durationSeconds: 604_800,
            usedCredits: '0',
            limitCredits: '1000000',
            remainingCredits: '1000000',
          },
        ],
      }),
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

    expect(screen.getByText('已用 0%')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // The preflight is uncached on the daemon and costs a dozen DB queries, so
  // an open panel must not hold a heartbeat on it.
  it('does not poll while the panel sits open — one read at mount, none on a timer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-22T10:00:00.000Z'));
    const fetcher = vi.fn(async () =>
      response({
        windows: [{ durationSeconds: 604_800, resetsAt: '2026-10-22T10:00:00.000Z' }],
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
