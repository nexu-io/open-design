// @vitest-environment jsdom
//
// The Coding Plan quota block inside the top-right billing card, rebuilt 1:1
// against the designer's v2 spec (`design-spec-v2.html`).
//
// What v2 defines, and therefore all this block may draw:
//  · ONE BLOCK PER BACKEND WINDOW, shortest first — 「Design Plan <period>」 on
//    the left, 「剩余 N% ›」 as an entry on the right, over a 5px track whose
//    fill is the REMAINING share. Go draws two (5 小时 + 7 天), Plus/Pro/Max
//    draw one (7 天), Free draws none;
//  · nothing else: no title, no remaining dollars, no reset time, no explainer;
//  · a skeleton while the read is in flight;
//  · a spent pool is just 剩余 0% — no red, no 「已用完」. The exhausted state
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

function preflight(
  options: {
    member?: string;
    eligible?: boolean;
    tier?: 'go' | 'plus' | 'pro' | 'max' | null;
    windows?: WindowInput[];
    omit?: boolean;
  } = {},
) {
  const {
    member = 'member',
    eligible = true,
    tier = 'pro',
    windows = [{ durationSeconds: 604_800 }],
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
    wallet?: { balanceUsd: string; url: string; onClick?: () => void };
  } = {},
) {
  const {
    locale = 'zh-CN',
    context = personal(),
    usageUrl = USAGE_URL,
    onUsageClick,
    wallet,
  } = overrides;
  return render(
    <I18nProvider initial={locale}>
      <CodingPlanUsage
        context={context}
        usageUrl={usageUrl}
        onUsageClick={onUsageClick}
        wallet={wallet}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Coding Plan quota block — the row v2 defines', () => {
  it('draws the allowance, its period, its remaining share and its track — and nothing else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('Design Plan')).toBeTruthy();
    expect(within(block).getByText('7 天')).toBeTruthy();
    expect(within(block).getByText('剩余 75%')).toBeTruthy();
    expect(within(block).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75');

    // The improvised surface this replaces is gone, every line of it.
    expect(screen.queryByText('Coding Plan')).toBeNull();
    expect(screen.queryByText(/窗口/)).toBeNull();
    expect(screen.queryByText(/已用/)).toBeNull();
    expect(screen.queryByText(/重置/)).toBeNull();
    expect(screen.queryByText(/钱包/)).toBeNull();
  });

  it('fills the track to the REMAINING share, not the spent one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [{ durationSeconds: 604_800, usedCredits: '355000', limitCredits: '1000000' }],
        }),
      ),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('剩余 64%')).toBeTruthy();
    expect((within(block).getByTestId('coding-plan-quota-fill') as HTMLElement).style.width).toBe(
      '64%',
    );
  });

  // Product ruling: the panel has no exhausted state. A spent pool is an empty
  // bar at 剩余 0% — the same ink, no warning colour, no 「已用完」.
  it('shows a spent pool as a plain 剩余 0% — no warning state', async () => {
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
    expect(within(block).getByText('剩余 0%')).toBeTruthy();
    expect((within(block).getByTestId('coding-plan-quota-fill') as HTMLElement).style.width).toBe(
      '0%',
    );
    expect(screen.queryByText('已用完')).toBeNull();
    expect(container.querySelector('[data-exhausted="true"]')).toBeNull();
  });
});

describe('Coding Plan quota block — one block per backend window', () => {
  // The design's Go panel: 5 小时 above 7 天. The client does not pick a
  // window any more, it renders the list the preflight returned.
  it('draws the Go pair as two blocks, shortest period first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          tier: 'go',
          windows: [
            { durationSeconds: 604_800, usedCredits: '240000', limitCredits: '1000000' },
            { durationSeconds: 18_000, usedCredits: '180000', limitCredits: '1000000' },
          ],
        }),
      ),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    const blocks = within(block).getAllByTestId('coding-plan-quota-block');
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]!).getByText('5 小时')).toBeTruthy();
    expect(within(blocks[0]!).getByText('剩余 82%')).toBeTruthy();
    expect(within(blocks[1]!).getByText('7 天')).toBeTruthy();
    expect(within(blocks[1]!).getByText('剩余 76%')).toBeTruthy();
    expect(within(block).getAllByRole('progressbar')).toHaveLength(2);
  });

  it('draws a single block for a plan with only a 7-day window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ windows: [{ durationSeconds: 604_800 }] })),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getAllByTestId('coding-plan-quota-block')).toHaveLength(1);
    expect(within(block).getByText('7 天')).toBeTruthy();
  });

  // The regression this replaces: the old model kept only the 7-day pool and
  // threw the rest away, so a 30-day window the backend enforced was invisible.
  it('no longer drops the windows that are not 7 days', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          windows: [
            { durationSeconds: 18_000 },
            { durationSeconds: 604_800 },
            { durationSeconds: 2_592_000 },
          ],
        }),
      ),
    );

    renderPanel();

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getAllByTestId('coding-plan-quota-block')).toHaveLength(3);
    expect(within(block).getByText('30 天')).toBeTruthy();
  });

  it('names the allowance, its periods and its share in English too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          tier: 'go',
          windows: [{ durationSeconds: 18_000 }, { durationSeconds: 604_800 }],
        }),
      ),
    );

    renderPanel({ locale: 'en' });

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getAllByText('Design Plan')).toHaveLength(2);
    expect(within(block).getByText('5 hours')).toBeTruthy();
    expect(within(block).getByText('7 days')).toBeTruthy();
    expect(within(block).getAllByText('75% left')).toHaveLength(2);
  });
});

describe('Coding Plan quota block — the remaining-share entry', () => {
  it('links the share out to the billing console', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    );

    renderPanel();

    const entry = await screen.findByTestId('coding-plan-quota-entry');
    expect(entry.getAttribute('href')).toBe(USAGE_URL);
    expect(entry.getAttribute('target')).toBe('_blank');
    expect(entry.getAttribute('rel')).toContain('noopener');
  });

  it('gives every block its own entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          tier: 'go',
          windows: [{ durationSeconds: 18_000 }, { durationSeconds: 604_800 }],
        }),
      ),
    );

    renderPanel();

    await screen.findByTestId('coding-plan-quota');
    expect(screen.getAllByTestId('coding-plan-quota-entry')).toHaveLength(2);
  });

  it('tells the card the entry was taken, so it can close and record it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    );
    const onUsageClick = vi.fn();

    renderPanel({ onUsageClick });

    (await screen.findByTestId('coding-plan-quota-entry')).click();
    expect(onUsageClick).toHaveBeenCalledTimes(1);
  });

  // No destination is not a dead link: the share still reads, it just stops
  // being an entry.
  it('keeps the share as plain text when the card has no console URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    );

    renderPanel({ usageUrl: null });

    const block = await screen.findByTestId('coding-plan-quota');
    expect(within(block).getByText('剩余 75%')).toBeTruthy();
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
    {
      name: 'a plan whose every window is unreadable',
      options: { windows: [{ durationSeconds: 604_800, usedCredits: '0', limitCredits: '0' }] },
    },
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
    {
      name: 'an old CLI that answers billing without a preflight',
      make: () => response({ omit: true }),
    },
    { name: 'a 503 from the daemon', make: () => new Response('', { status: 503 }) },
    { name: 'a transport failure', make: () => Promise.reject(new Error('offline')) },
    { name: 'another member’s pool', make: () => response({ member: 'other' }) },
  ])('draws nothing for $name', async ({ make }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => make()),
    );

    const { container } = renderPanel();

    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(screen.queryByText(/暂不可用/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Coding Plan quota block — loading', () => {
  it('holds the design skeleton — two bones and a track — while the read is in flight', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

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
    expect(screen.getByText('剩余 0%')).toBeTruthy();

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

    expect(screen.getByText('剩余 100%')).toBeTruthy();
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

describe('personal billing snapshot', () => {
  const wallet = {
    balanceUsd: '99',
    url: 'https://console.example.com/dashboard?billing=recharge',
  };
  it('holds both Go quota blocks and the wallet until the snapshot arrives', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    renderPanel({ context: personal({ planId: 'go' }), wallet });
    expect(screen.queryByText('US$99.00')).toBeNull();
    expect(screen.getAllByTestId('coding-plan-skeleton-block')).toHaveLength(2);
    expect(screen.getByTestId('coding-plan-wallet-skeleton')).toBeTruthy();
    await act(async () =>
      resolve(
        response({
          tier: 'go',
          windows: [{ durationSeconds: 18000 }, { durationSeconds: 604800 }],
        }),
      ),
    );
    expect(screen.getByText('US$0.00')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.queryByTestId('coding-plan-wallet-skeleton')).toBeNull();
  });
  it('keeps Free loading to the wallet alone', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPanel({ context: personal({ planId: 'free' }), wallet });
    expect(screen.queryAllByTestId('coding-plan-skeleton-block')).toHaveLength(0);
    expect(screen.getByTestId('coding-plan-wallet-skeleton')).toBeTruthy();
  });
  it('falls back to the scoped wallet when preflight is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ omit: true })),
    );
    renderPanel({ wallet });
    expect(await screen.findByText('US$99.00')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('billing snapshot isolation', () => {
  it('drops a late response after the member changes', async () => {
    let finishOld!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(async () => response({ member: 'new-member', windows: [{ durationSeconds: 604800, usedCredits: '1000000' }] }));
    vi.stubGlobal('fetch', fetcher);
    const { rerender } = renderPanel();
    rerender(<I18nProvider initial="zh-CN"><CodingPlanUsage context={personal({ workspaceMemberId: 'new-member' })} /></I18nProvider>);
    expect(await screen.findByText('剩余 0%')).toBeTruthy();
    await act(async () => finishOld(response()));
    expect(screen.queryByText('剩余 75%')).toBeNull();
    expect(screen.getByText('剩余 0%')).toBeTruthy();
    expect(fetcher.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
  });
  it.each([-60001, -60000, 60000, 60001])('does not display a snapshot offset by %s milliseconds', async (offset) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
    const body = preflight();
    body.preflight!.generatedAt = new Date(Date.now() + offset).toISOString();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))));
    renderPanel();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
