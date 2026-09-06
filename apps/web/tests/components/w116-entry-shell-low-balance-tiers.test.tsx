// @vitest-environment jsdom
//
// 红测 · OPEND-2600 在**首页**那一半。
//
// 首页没有流水可以挂卡,低余额提醒走的是 `AmrLowBalanceDialog`。它和项目页那张
// 卡共用同一道被删掉的过滤:`isPaidAmrPlan(await resolveAmrPlan(...))`。
//
// 产品裁决(2026-09-03):提醒对**所有档位**可见,呈现层不再读套餐。
// 同一条红线也在这里量:出这张提醒**不许多打一次网络往返**。

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import {
  resetTeamProjectsCache,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { I18nProvider } from '../../src/i18n';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import { resolveAmrPlan } from '../../src/runtime/amr-low-balance-plan';
import type { AgentInfo, AppConfig } from '../../src/types';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>();
  return { ...actual, checkAmrBalanceGate: vi.fn() };
});

// 套餐读数在这一层是**可观测的**:这次要证明首页也不再依赖它。
vi.mock('../../src/runtime/amr-low-balance-plan', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/runtime/amr-low-balance-plan')
  >();
  return { ...actual, resolveAmrPlan: vi.fn().mockResolvedValue('pro') };
});

vi.mock('../../src/components/AmrLowBalanceDialog', () => ({
  AmrLowBalanceDialog: ({
    balanceUsd,
    onDecision,
  }: {
    balanceUsd: string | null;
    onDecision: (decision: 'proceed' | 'recharge' | 'dismiss') => void;
  }) => (
    <div data-testid="amr-low-balance-dialog" data-balance={balanceUsd ?? ''}>
      <button
        type="button"
        data-testid="low-balance-proceed"
        onClick={() => onDecision('proceed')}
      >
        proceed
      </button>
    </div>
  ),
}));

const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedResolveAmrPlan = vi.mocked(resolveAmrPlan);
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** QA 报的是**个人**工作区。 */
function personalContext(): WorkspaceCollabContext {
  const role = 'owner' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: 'ws-personal-2600',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-personal-2600',
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: 'personal_pro',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
  };
}

function amrAgent(): AgentInfo {
  return {
    id: 'amr',
    name: 'OpenDesign AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'glm-5', label: 'GLM 5' }],
  };
}

function amrConfig(): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'amr',
    agentModels: { amr: { model: 'glm-5' } },
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    skillId: null,
    designSystemId: null,
    theme: 'system',
  };
}

/** QA 报的余额。 */
const REPORTED_BALANCE = '1.79';

function lowBalanceSnapshot(): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: REPORTED_BALANCE,
    updatedAt: null,
    fetchedAt: new Date(0).toISOString(),
    stale: false,
    source: 'vela_api',
  };
}

function renderHome(onCreateProject: () => Promise<boolean>) {
  return render(
    <I18nProvider initial="en">
      <EntryShell
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        projects={[]}
        templates={[]}
        promptTemplates={[]}
        defaultDesignSystemId={null}
        connectors={[]}
        connectorsLoading={false}
        config={amrConfig()}
        agents={[amrAgent()]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onConfigPersist={vi.fn()}
        onRefreshAgents={vi.fn(() => [amrAgent()])}
        onCreateProject={onCreateProject}
        onCreatePluginShareProject={vi.fn()}
        onImportClaudeDesign={vi.fn()}
        onOpenProject={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDeleteProject={vi.fn()}
        onRenameProject={vi.fn()}
        onChangeDefaultDesignSystem={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onOpenSettings={vi.fn()}
        onCompleteOnboarding={vi.fn()}
      />
    </I18nProvider>,
  );
}

/**
 * 首页那颗发送按钮背后是 Lexical。刚 render 完的那一帧它的 onChange 监听还没挂上,
 * 直接写 prompt 会让 `canSubmit` 停在 false —— 按钮看着是亮的(轮播文案让它亮),
 * 点下去却走的是另一条路,发送根本不会发生。先让它稳一帧再写。
 */
async function submitHome(prompt: string) {
  await screen.findByTestId('home-hero-input');
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  setHomeHeroPrompt(prompt);
  fireEvent.click(await screen.findByTestId('home-hero-submit'));
}

describe('OPEND-2600 · 首页低余额提醒对所有档位可见', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    const workspace = personalContext();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspace]));
      }
      if (url.endsWith('/api/workspace/context')) {
        return jsonResponse({ context: workspace });
      }
      if (url.includes('/api/workspace/billing?')) {
        return jsonResponse({ summary: null, workspaceBalance: null });
      }
      if (url.endsWith('/api/workspace/projects/team')) {
        return jsonResponse({ projects: [] });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    mockedResolveAmrPlan.mockReset();
    mockedResolveAmrPlan.mockResolvedValue('pro');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it.each(['free', 'pro', 'go', 'max'])(
    '%s 档拿到告警判定时,首页都要出提醒',
    async (plan) => {
      mockedResolveAmrPlan.mockResolvedValue(plan);
      mockedCheckAmrBalanceGate.mockResolvedValue({
        kind: 'soft',
        snapshot: lowBalanceSnapshot(),
      });
      const onCreateProject = vi.fn(async () => true);
      renderHome(onCreateProject);

      await submitHome('Make me a poster.');

      const dialog = await screen.findByTestId('amr-low-balance-dialog');
      expect(dialog.getAttribute('data-balance')).toBe(REPORTED_BALANCE);
      // 提醒 ≠ 拦截:选「照样开始」这一次就正常建项目跑起来。
      fireEvent.click(screen.getByTestId('low-balance-proceed'));
      await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    },
  );

  it('套餐读不出来(null 档)也要出提醒 —— 这一档不能掉进缝里', async () => {
    mockedResolveAmrPlan.mockResolvedValue(null);
    mockedCheckAmrBalanceGate.mockResolvedValue({
      kind: 'soft',
      snapshot: lowBalanceSnapshot(),
    });
    renderHome(vi.fn(async () => true));

    await submitHome('Make me a poster.');

    const dialog = await screen.findByTestId('amr-low-balance-dialog');
    expect(dialog.getAttribute('data-balance')).toBe(REPORTED_BALANCE);
  });

  it('红线:套餐读数吊死也照样出提醒(软提醒不许拖慢发送)', async () => {
    // 一个永远不 resolve 的套餐读数 = 一次挂住的网络往返。
    mockedResolveAmrPlan.mockReturnValue(new Promise<string | null>(() => {}));
    mockedCheckAmrBalanceGate.mockResolvedValue({
      kind: 'soft',
      snapshot: lowBalanceSnapshot(),
    });
    renderHome(vi.fn(async () => true));

    await submitHome('Make me a poster.');

    await screen.findByTestId('amr-low-balance-dialog');
  });

  it('红线:告警这一路一次套餐读数都不发', async () => {
    mockedCheckAmrBalanceGate.mockResolvedValue({
      kind: 'soft',
      snapshot: lowBalanceSnapshot(),
    });
    renderHome(vi.fn(async () => true));

    await submitHome('Make me a poster.');

    await screen.findByTestId('amr-low-balance-dialog');
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });

  it('反向对照:判定放行时首页不出提醒,也不发套餐读数', async () => {
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-low-balance-dialog')).toBeNull();
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });
});
