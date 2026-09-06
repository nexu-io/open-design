// @vitest-environment jsdom
//
// 红测 · 首页在**软那一档**($0 < 余额 < $2)什么都不显示,并且**直接放行**。
//
// 这个文件原本测的是 OPEND-2600 的首页那一半:低余额提醒走居中弹窗
// `AmrLowBalanceDialog`,各档位都要出、且不许多打一次套餐读数。
//
// 产品 2026-09-06 把那张弹窗整个撤了 —— 原话「软提醒弹窗就是产品告诉我不要
// 这个的,只用弹那个插画的就行」;首页那一档的替代物也一并拍了 —— 原话
// 「什么都不显示,有余额就允许运行」(规格 T53)。
//
// 所以这一档的**覆盖没有丢,只是判据翻了个面**:从「必须出提醒」变成
// 「一个提醒都不许出,而且这次发送必须照常建项目跑起来」。
//
// ⚠️ 命门在「放行」这半边。只断言「没有弹窗」的话,把整段余额闸门删掉、
// 或者留一个不显示却仍然挡住发送的空壳,两种都会假绿 —— 前者由下面
// 「反向对照 · 闸门本身还活着」那一组挡住(硬拦档照旧弹带插画的那张),
// 后者由每一条 soft 用例里的 `onCreateProject` 断言挡住。

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

describe('T53 · 首页软余额档静默放行', () => {
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
    '%s 档拿到告警判定时,首页什么都不显示,并且照常把这次发送跑起来',
    async (plan) => {
      mockedResolveAmrPlan.mockResolvedValue(plan);
      mockedCheckAmrBalanceGate.mockResolvedValue({
        kind: 'soft',
        snapshot: lowBalanceSnapshot(),
      });
      const onCreateProject = vi.fn(async () => true);
      renderHome(onCreateProject);

      await submitHome('Make me a poster.');

      // 放行:没有任何东西挡在中间,项目直接建出来。这半边是命门 ——
      // 一个「不显示但仍然挡住」的空壳会在这里变红。
      await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
      // 静默:那张撤掉的弹窗不许以任何形式回来。
      expect(screen.queryByTestId('amr-low-balance-dialog')).toBeNull();
      // 硬拦那张也不许被拿来顶替 —— 软档不是拦截档。
      expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
      // 屏幕上一个对话框都没有:这一档是「什么都不显示」,不是「换一张显示」。
      expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length)
        .toBe(0);
    },
  );

  it('套餐读不出来(null 档)同样静默放行 —— 这一档不能掉进缝里', async () => {
    mockedResolveAmrPlan.mockResolvedValue(null);
    mockedCheckAmrBalanceGate.mockResolvedValue({
      kind: 'soft',
      snapshot: lowBalanceSnapshot(),
    });
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-low-balance-dialog')).toBeNull();
  });

  it('红线:软档一次套餐读数都不发(T40),而且不因为它多等一步', async () => {
    // 一个永远不 resolve 的套餐读数 = 一次挂住的网络往返。软档要是还读它,
    // 这次发送就永远建不出项目,下面的 waitFor 会超时变红。
    mockedResolveAmrPlan.mockReturnValue(new Promise<string | null>(() => {}));
    mockedCheckAmrBalanceGate.mockResolvedValue({
      kind: 'soft',
      snapshot: lowBalanceSnapshot(),
    });
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });

  it('反向对照:判定放行时行为一致 —— 同样不出弹窗、同样跑起来', async () => {
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);
    renderHome(onCreateProject);

    await submitHome('Make me a poster.');

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-low-balance-dialog')).toBeNull();
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });

  // ⚠️ 没有这一组,把整段余额闸门从首页删掉也会让上面全绿 ——
  // 那样 soft 一样「什么都不显示、照常跑」,可硬拦档也跟着没了。
  // 嵌在同一个 describe 里是为了继承上面那套 fetch / workspace 夹具。
  describe('反向对照 · 闸门本身还活着', () => {
    it('硬拦档(余额耗尽)照旧弹带插画的那张,并且**不**建项目', async () => {
      mockedCheckAmrBalanceGate.mockResolvedValue({
        kind: 'hard',
        reason: 'insufficient',
        snapshot: { ...lowBalanceSnapshot(), balanceUsd: '0' },
      });
      const onCreateProject = vi.fn(async () => true);
      renderHome(onCreateProject);

      await submitHome('Make me a poster.');

      await screen.findByTestId('amr-balance-dialog');
      expect(onCreateProject).not.toHaveBeenCalled();
    });

    it('首页确实问过闸门 —— 软档的静默不是因为根本没查', async () => {
      mockedCheckAmrBalanceGate.mockResolvedValue({
        kind: 'soft',
        snapshot: lowBalanceSnapshot(),
      });
      renderHome(vi.fn(async () => true));

      await submitHome('Make me a poster.');

      await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalled());
    });
  });
});
