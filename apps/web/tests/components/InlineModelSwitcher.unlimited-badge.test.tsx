// @vitest-environment jsdom
//
// The 「无限使用」 badge in the model chip + compact model list.
//
// The badge used to be hard-wired to the DeepSeek V4 campaign, so it marked
// exactly two models for everyone and nothing at all once the campaign window
// closes. What the product actually sells is an unlimited SET PER TIER (3
// models on Go, 4 on Plus, 5 on Pro, all 8 on Max), so a Pro subscriber looking
// at Kimi K2.7 Code — unlimited on their plan — saw no badge, while the metered
// MiniMax M2.7 sat right next to it looking identical.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

const workspaceState: {
  context: WorkspaceCollabContext | null;
  billing: WorkspaceBillingResponse | null;
} = { context: null, billing: null };

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/collab/useWorkspaceContext')
  >();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: workspaceState.context,
      loading: false,
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
  ],
};

function setPlan(tier: string | null): void {
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

function renderSwitcher(config: Partial<AppConfig> = {}) {
  return render(
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
    </I18nProvider>,
  );
}

/** Pins the clock outside the DeepSeek campaign window so the badge under test
 *  can only come from the subscription itself. */
function mockNow(at: string): void {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(at));
}

const AFTER_CAMPAIGN = '2026-09-01T12:00:00+08:00';
const DURING_CAMPAIGN = '2026-08-20T12:00:00+08:00';

function badgedModelIds(): string[] {
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('unlimited badge follows the subscription tier', () => {
  it('badges the five models Pro includes, and none of the metered ones', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('pro');
    renderSwitcher();
    expect(badgedModelIds().sort()).toEqual(
      [
        'deepseek-v4-flash',
        'deepseek-v4-pro',
        'glm-5.2',
        'kimi-k2.7-code',
        'mimo-v2.5-pro',
      ].sort(),
    );
  });

  it('badges the three models Go includes', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('go');
    renderSwitcher();
    expect(badgedModelIds().sort()).toEqual(
      ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2'].sort(),
    );
  });

  it('badges every popular model on Max', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('max');
    renderSwitcher();
    expect(badgedModelIds()).toHaveLength(8);
  });

  it.each(['team_plus', 'team_pro', 'team_max_yearly'])(
    'badges nothing on the team plan %s',
    (tier) => {
      // Team workspaces spend their own balance and never get an in-plan
      // zero-charge call (vela constrains the `coding_plan` billing mode to
      // personal tiers), which is also why #7187's balance preflight refuses
      // to stand down for them. A badge here would promise what the preflight
      // then blocks.
      mockNow(AFTER_CAMPAIGN);
      setPlan(tier);
      renderSwitcher();
      expect(badgedModelIds()).toEqual([]);
    },
  );

  it('badges nothing for a free plan once the campaign window has closed', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan(null);
    renderSwitcher();
    expect(badgedModelIds()).toEqual([]);
  });

  it('keeps the campaign badge for a free plan while the window is open', () => {
    mockNow(DURING_CAMPAIGN);
    setPlan(null);
    renderSwitcher();
    expect(badgedModelIds().sort()).toEqual(
      ['deepseek-v4-flash', 'deepseek-v4-pro'].sort(),
    );
  });

  it('marks the selected model on the chip itself', () => {
    mockNow(AFTER_CAMPAIGN);
    setPlan('plus');
    renderSwitcher({ agentModels: { amr: { model: 'kimi-k2.7-code' } } });
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
