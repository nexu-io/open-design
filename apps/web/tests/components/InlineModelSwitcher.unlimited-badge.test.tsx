// @vitest-environment jsdom
//
// The 「无限使用」 badge in the model chip + compact model list.
//
// The badge used to be hard-wired to the DeepSeek V4 campaign, so it marked
// exactly two models for everyone and nothing at all once the campaign window
// closes. The Vela wallet snapshot is now the source of truth for which models
// are included in Coding Plan, so the badge must follow that response instead
// of a duplicated per-tier table in Open Design.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  WorkspaceBillingResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(async () => ({ ok: false, models: [] })),
}));

const providerState = vi.hoisted(() => ({
  codingPlanModels: null as string[] | null,
}));

vi.mock('../../src/providers/daemon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/daemon')>();
  const status = {
    loggedIn: true,
    loginInFlight: false,
    profile: 'prod',
    user: { id: 'u1', plan: 'go' },
    configPath: '/tmp/vela.json',
  };
  return {
    ...actual,
    fetchVelaLoginStatus: vi.fn(async () => status),
    fetchAmrWalletSnapshot: vi.fn(async () => ({
      status: 'available',
      profile: 'prod',
      user: { id: 'u1', plan: 'go' },
      balanceUsd: '0',
      codingPlanModels: providerState.codingPlanModels,
      updatedAt: null,
      fetchedAt: '2026-08-23T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    })),
  };
});

const workspaceState: {
  context: WorkspaceCollabContext | null;
  billing: WorkspaceBillingResponse | null;
  loading: boolean;
} = { context: null, billing: null, loading: false };

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/collab/useWorkspaceContext')
  >();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: workspaceState.context,
      loading: workspaceState.loading,
      failure: null,
    }),
    useWorkspaceBillingResponse: () => workspaceState.billing,
  };
});

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

/** The popular-model catalog the Pricing page tiers are written against. */
const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: true, default: true },
    { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', enabled: true },
    { id: 'glm-5.2', label: 'glm-5.2', enabled: true },
    { id: 'kimi-k2.7-code', label: 'kimi-k2.7-code', enabled: true },
    { id: 'mimo-v2.5-pro', label: 'mimo-v2.5-pro', enabled: true },
    { id: 'minimax-m2.7', label: 'minimax-m2.7', enabled: true },
    { id: 'kimi-k2.6', label: 'kimi-k2.6', enabled: true },
    { id: 'glm-5.1', label: 'glm-5.1', enabled: true },
    { id: 'new-coding-plan-model', label: 'new-coding-plan-model', enabled: true },
  ],
};

function setPlan(tier: string | null): void {
  providerState.codingPlanModels = tier === 'go'
    ? ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2']
    : tier === 'plus'
      ? ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2', 'kimi-k2.7-code']
      : tier === 'pro'
        ? [
            'deepseek-v4-flash',
            'deepseek-v4-pro',
            'glm-5.2',
            'kimi-k2.7-code',
            'mimo-v2.5-pro',
          ]
        : tier === 'max'
          ? (amrAgent.models ?? [])
              .filter((model) => model.id !== 'new-coding-plan-model')
              .map((model) => model.id)
          : [];
  workspaceState.context = {
    workspaceId: 'ws-1',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: tier ? 'active' : 'free',
    planId: tier,
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
  } as unknown as WorkspaceCollabContext;
  workspaceState.billing = {
    summary: {
      workspaceId: null,
      membershipTier: tier ?? '',
      totalAvailableCredits: 0,
      subscriptionCredits: 0,
      rechargeCredits: 0,
      balanceUsd: '0',
      subscriptionStatus: tier ? 'active' : '',
      availableActions: [],
    },
  } as unknown as WorkspaceBillingResponse;
}

function switcher(config: Partial<AppConfig> = {}) {
  return (
    <I18nProvider initial="zh-CN">
      <InlineModelSwitcher
        config={{ ...baseConfig, ...config }}
        agents={[amrAgent]}
        providerModelsCache={{}}
        compact
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </I18nProvider>
  );
}

function renderSwitcher(config: Partial<AppConfig> = {}) {
  return render(switcher(config));
}

/** Pins the clock outside the DeepSeek campaign window so the badge under test
 *  can only come from the subscription itself. */
function mockNow(at: string): void {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(at));
}

const AFTER_CAMPAIGN = '2026-09-01T12:00:00+08:00';
const DURING_CAMPAIGN = '2026-08-20T12:00:00+08:00';

async function badgedModelIds(): Promise<string[]> {
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return badgedModelIdsInOpenPopover();
}

function badgedModelIdsInOpenPopover(): string[] {
  const popover = screen.getByTestId('inline-model-switcher-popover');
  return within(popover)
    .getAllByRole('radio')
    .filter((row) =>
      row.querySelector('[data-testid^="inline-model-switcher-unlimited-badge-"]'),
    )
    .map((row) =>
      row
        .getAttribute('data-testid')
        ?.replace('inline-model-switcher-compact-model-', '') ?? '',
    );
}

beforeEach(() => {
  setPlan(null);
});

afterEach(() => {
  cleanup();
  workspaceState.context = null;
  workspaceState.billing = null;
  workspaceState.loading = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('unlimited badge follows the subscription tier', () => {
  it('badges a newly configured model from the Vela wallet snapshot', async () => {
    setPlan('go');
    providerState.codingPlanModels = ['new-coding-plan-model'];
    renderSwitcher({
      agentModels: { amr: { model: 'new-coding-plan-model' } },
    });

    expect(await badgedModelIds()).toContain('new-coding-plan-model');
  });

  it('badges the five models Pro includes, and none of the metered ones', async () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('pro');
    renderSwitcher();
    expect((await badgedModelIds()).sort()).toEqual(
      [
        'deepseek-v4-flash',
        'deepseek-v4-pro',
        'glm-5.2',
        'kimi-k2.7-code',
        'mimo-v2.5-pro',
      ].sort(),
    );
  });

  it('badges the three models Go includes', async () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('go');
    renderSwitcher();
    expect((await badgedModelIds()).sort()).toEqual(
      ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2'].sort(),
    );
  });

  it('badges every popular model on Max', async () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('max');
    renderSwitcher();
    expect(await badgedModelIds()).toHaveLength(8);
  });

  it.each(['team_plus', 'team_pro', 'team_max_yearly'])(
    'badges nothing on the team plan %s',
    async (tier) => {
      // Team workspaces spend their own balance and never get an in-plan
      // zero-charge call (vela constrains the `coding_plan` billing mode to
      // personal tiers), which is also why #7187's balance preflight refuses
      // to stand down for them. A badge here would promise what the preflight
      // then blocks.
      mockNow(AFTER_CAMPAIGN);
      setPlan('plus');
      const view = renderSwitcher();
      expect(await badgedModelIds()).toContain('deepseek-v4-flash');
      workspaceState.context = {
        ...workspaceState.context,
        workspaceType: 'team',
        planId: tier,
      } as WorkspaceCollabContext;
      view.rerender(switcher());
      expect(
        screen.queryByTestId('inline-model-switcher-chip-unlimited-badge'),
      ).toBeNull();
      expect(badgedModelIdsInOpenPopover()).toEqual([]);
    },
  );

  it('hides Personal plan badges while the next workspace context is loading', async () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('plus');
    const view = renderSwitcher();
    expect(await badgedModelIds()).toContain('deepseek-v4-flash');

    workspaceState.loading = true;
    view.rerender(switcher());

    expect(
      screen.queryByTestId('inline-model-switcher-chip-unlimited-badge'),
    ).toBeNull();
    expect(badgedModelIdsInOpenPopover()).toEqual([]);
  });

  it('badges nothing for a free plan once the campaign window has closed', async () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan(null);
    renderSwitcher();
    expect(await badgedModelIds()).toEqual([]);
  });

  it('keeps the campaign badge for a free plan while the window is open', async () => {
    mockNow(DURING_CAMPAIGN);
    setPlan(null);
    renderSwitcher();
    expect((await badgedModelIds()).sort()).toEqual(
      ['deepseek-v4-flash', 'deepseek-v4-pro'].sort(),
    );
  });

  it('marks the selected model on the chip itself', async () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('plus');
    renderSwitcher({ agentModels: { amr: { model: 'kimi-k2.7-code' } } });
    await badgedModelIds();
    expect(
      screen.getByTestId('inline-model-switcher-chip-unlimited-badge').textContent,
    ).toContain('无限使用');
  });

  it('leaves the chip unbadged on a model the plan meters', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('plus');
    renderSwitcher({ agentModels: { amr: { model: 'minimax-m2.7' } } });
    expect(screen.queryByTestId('inline-model-switcher-chip-unlimited-badge')).toBeNull();
  });

  it('claims nothing in BYOK mode, where the user pays their own provider', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('max');
    renderSwitcher({ mode: 'api', agentModels: { amr: { model: 'glm-5.2' } } });
    expect(screen.queryByTestId('inline-model-switcher-chip-unlimited-badge')).toBeNull();
  });
});
