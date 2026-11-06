// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceBillingResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodingPlanUsage } from '../../src/components/CodingPlanUsage';
import { I18nProvider } from '../../src/i18n';
import { workspaceContextFixture } from '../helpers/workspace-context';

const USAGE_URL = 'https://console.example.com/dashboard?workspaceId=ws';
function personal(overrides: Partial<WorkspaceCollabContext> = {}) {
  return workspaceContextFixture({ workspaceId: 'ws', workspaceMemberId: 'member',
    workspaceType: 'personal', planId: 'plus', ...overrides });
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


function billing(options: Parameters<typeof preflight>[0] = {}): WorkspaceBillingResponse {
  return { summary: null, workspaceBalance: null, ...preflight(options) } as WorkspaceBillingResponse;
}
function panel(options: {
  response?: WorkspaceBillingResponse | null;
  context?: WorkspaceCollabContext;
  locale?: 'en' | 'zh-CN';
  usageUrl?: string | null;
  onUsageClick?: () => void;
} = {}) {
  return <I18nProvider initial={options.locale ?? 'zh-CN'}>
    <CodingPlanUsage context={options.context ?? personal()}
      billing={options.response === undefined ? billing() : options.response}
      usageUrl={options.usageUrl === undefined ? USAGE_URL : options.usageUrl}
      onUsageClick={options.onUsageClick}
      wallet={{ balanceUsd: '99', url: `${USAGE_URL}&billing=recharge` }} />
  </I18nProvider>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('personal plan presentation from the shared billing snapshot', () => {
  it.each([
    ['go', [18000, 604800], 2],
    ['plus', [18000, 604800, 2592000], 1],
    ['pro', [18000, 604800], 1],
    ['max', [604800], 1],
  ] as const)('follows the design windows for %s', (tier, durations, count) => {
    render(panel({ response: billing({ tier, windows: [...durations].reverse().map(durationSeconds => ({ durationSeconds })) }) }));
    const blocks = screen.getAllByTestId('coding-plan-quota-block');
    expect(blocks).toHaveLength(count);
    expect(screen.queryByText('30 天')).toBeNull();
    if (tier === 'go') expect(within(blocks[0]!).getByText('5 小时')).toBeTruthy();
    else expect(screen.queryByText('5 小时')).toBeNull();
    expect(screen.getByText('7 天')).toBeTruthy();
  });
  it.each([
    ['250000', '75'], ['355000', '64'], ['1000000', '0'], ['1100000', '0'],
  ])('shows remaining quota for %s spent credits', (usedCredits, percent) => {
    render(panel({ response: billing({ windows: [{ durationSeconds: 604800, usedCredits }] }) }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(percent);
    expect(screen.getByTestId('coding-plan-quota-fill').style.width).toBe(`${percent}%`);
    expect(screen.getByText(`剩余 ${percent}%`)).toBeTruthy();
    expect(screen.queryByText('已用完')).toBeNull();
    expect(screen.queryByText(/重置/)).toBeNull();
  });
  it('renders the English allowance and period', () => {
    render(panel({ locale: 'en' }));
    expect(screen.getByText('Design Plan')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('75% left')).toBeTruthy();
    expect(screen.getByText('US$0.00')).toBeTruthy();
  });
  it('links the allowance and wallet to their distinct destinations', () => {
    const click = vi.fn();
    render(panel({ onUsageClick: click }));
    const link = screen.getByTestId('coding-plan-quota-entry');
    expect(link.getAttribute('href')).toBe(USAGE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    fireEvent.click(link);
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByTestId('entry-nav-credits-row').getAttribute('href')).toContain('billing=recharge');
  });
  it('keeps the allowance readable without a destination', () => {
    render(panel({ usageUrl: null }));
    expect(screen.getByText('剩余 75%')).toBeTruthy();
    expect(screen.queryByTestId('coding-plan-quota-entry')).toBeNull();
  });
  it.each([
    { eligible: false, tier: null }, { eligible: true, tier: null }, { windows: [] },
    { windows: [{ durationSeconds: 604800, limitCredits: '0' }] }, { omit: true },
  ])('falls back to the scoped wallet when quota is unavailable: %j', options => {
    render(panel({ response: billing(options) }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByTestId('entry-nav-credits-row')).toBeTruthy();
  });
  it.each([{ workspaceType: 'team' as const }, { planId: 'team_pro' }])('does not render personal quota for %j', overrides => {
    const { container } = render(panel({ context: personal(overrides) }));
    expect(container.firstChild).toBeNull();
  });
  it.each([['free', 0], ['go', 2], ['plus', 1], ['pro', 1], ['max', 1]] as const)('matches the %s cold-loading skeleton', (tier, blocks) => {
    render(<I18nProvider initial="zh-CN"><CodingPlanUsage context={personal({ planId: null })}
      planTier={tier} billing={null} wallet={{ balanceUsd: '99', url: null }} /></I18nProvider>);
    expect(screen.getByTestId('coding-plan-quota-skeleton')).toBeTruthy();
    expect(screen.queryAllByTestId('coding-plan-skeleton-block')).toHaveLength(blocks);
    expect(screen.getByTestId('coding-plan-wallet-skeleton')).toBeTruthy();
    expect(screen.queryByText('US$99.00')).toBeNull();
  });
  it('renders a cached snapshot immediately without requesting on mount or remount', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const first = render(panel());
    expect(screen.getByText('剩余 75%')).toBeTruthy();
    first.unmount();
    render(panel());
    expect(screen.queryByTestId('coding-plan-quota-skeleton')).toBeNull();
    expect(screen.getByText('剩余 75%')).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('replaces quota and wallet together when the shared snapshot changes', () => {
    const { rerender } = render(panel());
    const next = billing({ windows: [{ durationSeconds: 604800, usedCredits: '1000000' }] });
    next.preflight!.balanceUsd = '12';
    rerender(panel({ response: next }));
    expect(screen.getByText('剩余 0%')).toBeTruthy();
    expect(screen.getByText('US$12.00')).toBeTruthy();
    expect(screen.queryByTestId('coding-plan-quota-skeleton')).toBeNull();
  });
  it('never displays another member’s cached snapshot', () => {
    render(panel({ response: billing({ member: 'other' }) }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('US$99.00')).toBeTruthy();
  });
});
