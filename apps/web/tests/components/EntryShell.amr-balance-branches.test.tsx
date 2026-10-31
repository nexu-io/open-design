// @vitest-environment jsdom
// RUN-004 / frozen product r271: Home funding rejection preserves its draft.
// Free/non-Max Owners may upgrade; Max has no purchase shortcut; other roles
// contact the Owner. The corresponding Project path has separate coverage.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShellWithGateHost } from '../helpers/entry-shell-gate-host';
import {
  resetTeamProjectsCache,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { I18nProvider } from '../../src/i18n';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import type { AgentInfo, AppConfig } from '../../src/types';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>();
  return { ...actual, checkAmrBalanceGate: vi.fn() };
});

const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
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

/**
 * 一个工作区身份。**`planId` 一律留空** —— 那是生产形状:走到客户端的 collab
 * context 是用 vela 的目录行拼出来的,而 `workspaceContextFromDirectoryItem`
 * 把 `planId` 写死成 `null`(目录行根本不带套餐字段)。所以首页的档次只能从账单
 * 投影里来,这份夹具照着这个事实建,免得测试从一个生产上不存在的字段里读出 Max。
 */
function workspace(
  role: 'owner' | 'admin' | 'member',
  workspaceType: 'personal' | 'team',
): WorkspaceCollabContext {
  const lifecycleState = 'active' as const;
  return {
    workspaceId: workspaceType === 'team' ? 'ws-team-t58' : 'ws-personal-t58',
    workspaceType,
    memberCount: workspaceType === 'personal' ? 2 : undefined,
    workspaceMemberId: `wm-${role}-t58`,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
  };
}

/** 账号级账单摘要 —— 个人工作区的档次就从这里读。 */
function accountBilling(membershipTier: string) {
  return {
    summary: {
      workspaceId: null,
      membershipTier,
      totalAvailableCredits: 0,
      subscriptionCredits: 0,
      rechargeCredits: 0,
      balanceUsd: '0.0000',
      subscriptionStatus: 'active',
      availableActions: [],
    },
    workspaceBalance: null,
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

/** 钱包空了 —— 这四格说的都是这一刻。 */
const emptyWallet = {
  kind: 'hard' as const,
  reason: 'insufficient' as const,
  snapshot: {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0',
    updatedAt: null,
    fetchedAt: new Date(0).toISOString(),
    stale: false,
    source: 'vela_api',
  } as AmrWalletSnapshot,
};

let billingRead = false;

function stubFetch(
  context: WorkspaceCollabContext,
  billing: ReturnType<typeof accountBilling>,
  fundingCheck: 'available' | 'insufficient' = 'insufficient',
) {
  billingRead = false;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/workspace/directory')) {
      const directory = workspaceDirectoryFixture([context]);
      if (context.memberCount !== undefined) directory.items[0]!.memberCount = context.memberCount;
      return jsonResponse(directory);
    }
    if (url.endsWith('/api/workspace/context')) {
      return jsonResponse({ context });
    }
    // gen53: current Home funding is confirmed before project handoff. The
    // display/role fixture remains independent; no empty response authorizes it.
    if (url.includes('/billing/preflight?')) {
      const query = new URL(url, 'http://localhost').searchParams;
      expect(query.get('workspaceId')).toBe(context.workspaceId);
      expect(query.get('modelId')).toBe('glm-5');
      return jsonResponse({ preflight: {
        schemaVersion: 1, workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId, modelId: 'glm-5',
        generatedAt: new Date().toISOString(), balanceUsd: '0', fundingCheck,
        funding: fundingCheck === 'available' ? 'coding_plan' : 'gateway',
        modelCovered: fundingCheck === 'available',
        codingPlan: { workspaceId: context.workspaceId, generatedAt: new Date().toISOString(),
          eligible: fundingCheck === 'available', tier: null, windows: [] },
      } });
    }
    if (url.includes('/api/workspace/billing?')) {
      billingRead = true;
      return jsonResponse(billing);
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
}

function renderHome(onCreateProject: () => Promise<boolean>) {
  return render(
    <I18nProvider initial="en">
      <EntryShellWithGateHost
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
 * 发一条 —— 但**等到账单读数真的落地为止**。
 *
 * 首页的档次只能从账单投影里读(见 `workspace()` 的注释)。账单还没回来就点发送,
 * 分支会按「读不出档次 → 非 Max」走,于是 Max 那一格拿到的是套餐页链接 —— 一个
 * 纯粹的时序假红。这里先证明那次读数发生过、并让它引起的 setState 落完一帧。
 *
 * 和 `ProjectView.amr-balance-branches.test.tsx` 的 `clickSendWhenReady` 同一条
 * 纪律:先证明这一按会被按对的输入受理,再断言它的后果。
 */
async function submitHome(prompt: string) {
  await screen.findByTestId('home-hero-input');
  await waitFor(() => expect(billingRead).toBe(true));
  // Lexical 的 onChange 监听要一帧才挂上;账单的 setState 也要一帧才进渲染。
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  setHomeHeroPrompt(prompt);
  fireEvent.click(await screen.findByTestId('home-hero-submit'));
}

describe('T58 · 首页余额耗尽的身份 × 订阅四格', () => {
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    mockedCheckAmrBalanceGate.mockResolvedValue(emptyWallet);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it('RUN-004 Max Owner keeps the funding dialog without purchase shortcuts', async () => {
    stubFetch(workspace('owner', 'personal'), accountBilling('max'));
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    // 首页没有卡兜底,所以「出弹窗」这半边本身就是产品要求。
    await screen.findByTestId('amr-balance-dialog');
    // 有账单权限的人不该拿到「去找所有者」那张。
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();
    // 拦住了:项目不建。
    expect(onCreateProject).not.toHaveBeenCalled();

    expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
  });

  // 反向对照。这一格**没有变**:同一张弹窗,但主按钮仍然落在套餐页。
  // 少了它,把 intent 改成无条件 `auto_recharge` 也会让上面那条绿。
  it.each(['free', 'go', 'plus', 'pro'])('RUN-004 %s Owner retains the plan upgrade entrance', async (tier) => {
    stubFetch(workspace('owner', 'personal'), accountBilling(tier));
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await screen.findByTestId('amr-balance-dialog');
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();
    expect(onCreateProject).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0]?.[0]);
    expect(url).toContain('billing=plan');
    expect(url).not.toContain('billing=auto-recharge');
  });

  // 反向对照。没有账单权限的成员两格照旧走「找所有者充值」,**不外跳** ——
  // 把转化弹窗放给所有身份也会让上面两条绿。admin 单列是因为它最容易被误当
  // 成「管理员=能付钱」:契约里 `canManageBilling` 只给 owner。
  it.each([
    ['团队 admin · Max', 'admin' as const, 'team_max'],
    ['团队 member · Max', 'member' as const, 'team_max'],
    ['团队 admin · 非 Max', 'admin' as const, 'team_pro'],
    ['团队 member · 非 Max', 'member' as const, 'team_pro'],
  ])('%s:拿到「找所有者充值」那张,不外跳', async (_name, role, tier) => {
    stubFetch(workspace(role, 'team'), accountBilling(tier));
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await screen.findByTestId('amr-balance-owner-dialog');
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it.each(['admin', 'member'] as const)('个人空间受邀 %s:余额不足显示 F10 而非 Owner 转化弹窗', async (role) => {
    stubFetch(workspace(role, 'personal'), accountBilling('go'));
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await screen.findByTestId('amr-balance-owner-dialog');
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  // ⚠️ 没有这一组,把整段余额闸门从首页删掉、或把弹窗改成无条件渲染,
  // 上面四条里的「出弹窗」那半边照样能绿。
  it('反向对照 · 判定放行时一张弹窗都不许出,而且照常跑起来', async () => {
    stubFetch(workspace('owner', 'personal'), accountBilling('max'), 'available');
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();
  });
});
