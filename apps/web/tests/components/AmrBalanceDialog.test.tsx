// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions } from '@open-design/contracts';
import {
  AmrBalanceDialog,
  WALLET_WATCH_INTERVAL_MS,
  WALLET_WATCH_TIMEOUT_MS,
} from '../../src/components/AmrBalanceDialog';
import { HomeAmrBalanceGateDialogs } from '../../src/components/HomeAmrBalanceGateDialogs';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from '../helpers/workspace-context';

function directoryResponse(
  workspaceId: string,
  workspaceMemberId: string,
  workspaceType: 'personal' | 'team',
): Response {
  return new Response(JSON.stringify(workspaceDirectoryFixture([
    workspaceContextFixture({
      workspaceId,
      workspaceMemberId,
      workspaceType,
    }),
  ])), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  // The context hook caches at module scope; clear it so cases don't leak.
  resetWorkspaceContextCache();
});

describe('AmrBalanceDialog', () => {
  it('shows four F07 benefits including free invitations and shared allowance', () => {
    render(<AmrBalanceDialog
      reason="insufficient"
      balanceUsd="0.00"
      profile="local"
      entrySource="home_balance_gate_upgrade"
      workspaceContext={workspaceContextFixture({
        workspaceId: 'f07-free-space', workspaceMemberId: 'f07-owner',
        workspaceType: 'team', role: 'owner', planId: null,
      })}
      metricsConsent={false}
      installationId={null}
      onClose={vi.fn()}
      onResolved={vi.fn()}
    />);
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'No complex setup, choose from leading SOTA models',
      'Invite members for free and share allowance',
      'Create multimodal images and text in one place',
      'Publish in one click and share your work with a link',
    ]);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Invite members for free and share allowance');
  });

  // RUN-004 / frozen product r271 and client QA r2282: the funding
  // rejection dialog offers neither auto-recharge nor a nonexistent higher
  // tier to Max Owners. The separate chat card/settings entry is unchanged.
  it.each(['personal', 'team'] as const)('Max %s Owner has no purchase shortcut in the funding dialog', (workspaceType) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onClose = vi.fn();
    const onResolved = vi.fn();
    render(<AmrBalanceDialog
      reason="insufficient" balanceUsd="0" profile="local"
      entrySource="chat_balance_gate_upgrade" upgradeIntent="auto_recharge"
      workspaceContext={workspaceContextFixture({
        workspaceId: 'max-space', workspaceMemberId: 'max-owner',
        workspaceType, role: 'owner', planId: 'team_max',
        permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
      })}
      metricsConsent={false} installationId={null}
      onClose={onClose} onResolved={onResolved}
    />);
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
    expect(screen.queryByRole('button', { name: /upgrade|recharge/i })).toBeNull();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('preserves the existing sign-in invitation benefits', () => {
    render(<AmrBalanceDialog reason="signed_out" balanceUsd={null} profile="test"
      entrySource="home_balance_gate_upgrade" metricsConsent={false} installationId={null}
      workspaceContext={null} onClose={vi.fn()} onResolved={vi.fn()} />);
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'No API keys — top models included', 'Invite members for free and share allowance',
      'Official service you can rely on',
      'Always improving: one-click publishing, multimodal generation, teams, and more',
    ]);
    expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
  });

  it('dismisses from the corner close button', () => {
    const onClose = vi.fn();

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={onClose}
        onResolved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lands the upgrade CTA on the console plan surface when a team has never subscribed', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(directoryResponse('ws-1', 'wm-1', 'team'));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({
          context: {
            workspaceId: 'ws-1',
            workspaceType: 'team',
            workspaceMemberId: 'wm-1',
            planId: null,
            billingState: 'free',
            permissions: { canManageBilling: true },
            workspaceSettingsUrl: 'https://open-design.ai/console/settings?workspaceId=ws-1',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (url.includes('/api/workspace/billing')) {
        return Promise.resolve(new Response(JSON.stringify({
          summary: { workspaceId: 'ws-1', membershipTier: '' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );

    await waitFor(() => {
      fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
      expect(open).toHaveBeenCalled();
      const target = new URL(String(open.mock.calls.at(-1)?.[0]));
      expect(`${target.origin}${target.pathname}`).toBe(
        'https://open-design.ai/cloud/dashboard',
      );
      expect(target.searchParams.get('billing')).toBe('plan');
    });
  });

  it('lands the upgrade CTA on the console plan surface when a team already has an active plan', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(directoryResponse('ws-1', 'wm-1', 'team'));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({
          context: {
            workspaceId: 'ws-1',
            workspaceType: 'team',
            workspaceMemberId: 'wm-1',
            planId: 'team_pro',
            billingState: 'active',
            permissions: { canManageBilling: true },
            workspaceSettingsUrl: 'https://open-design.ai/console/settings?workspaceId=ws-1',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (url.includes('/api/workspace/billing')) {
        return Promise.resolve(new Response(JSON.stringify({
          summary: { workspaceId: 'ws-1', membershipTier: 'team_pro' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );

    await waitFor(() => {
      fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
      expect(open).toHaveBeenCalled();
      const target = new URL(String(open.mock.calls.at(-1)?.[0]));
      expect(`${target.origin}${target.pathname}`).toBe(
        'https://open-design.ai/cloud/dashboard',
      );
      expect(target.searchParams.get('billing')).toBe('plan');
    });
  });

  it('lands the upgrade CTA on the console plan surface for a personal workspace', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(directoryResponse('ws-p', 'wm-p', 'personal'));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({
          context: {
            workspaceId: 'ws-p',
            workspaceType: 'personal',
            workspaceMemberId: 'wm-p',
            planId: null,
            billingState: 'free',
            permissions: { canManageBilling: true },
            workspaceSettingsUrl: 'https://open-design.ai/console/settings?workspaceId=ws-p',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (url.includes('/api/workspace/billing')) {
        return Promise.resolve(new Response(JSON.stringify({
          summary: { workspaceId: 'ws-p', membershipTier: '' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="feature-test"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );

    await waitFor(() => {
      fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
      expect(open).toHaveBeenCalled();
      const target = new URL(String(open.mock.calls.at(-1)?.[0]));
      expect(`${target.origin}${target.pathname}`).toBe(
        'https://open-design.ai/cloud/dashboard',
      );
      expect(target.searchParams.get('billing')).toBe('plan');
    });
  });

  // 红测 · 真机复现(本地 runtime,产品线上账号,余额 $0):发送被拦 → 这张弹窗
  // 弹出 → **底部只剩一颗「暂不需要」**。`actions` 行 `children.length === 1`,
  // `[data-testid=amr-balance-dialog-plans]` 根本不存在。
  //
  // 链路:个人工作区在 `resolveAmrBalanceAudience` 里按 owner 处理(`workspaceType
  // !== 'team'` → 'owner',因为个人工作区没有第二个人可以找),于是
  // `amrBalanceBlockedDialog` 给出 'upgrade',**这张**弹窗被渲染出来;但它的主按钮
  // 取自 `workspaceUpgradeUrl`,而那一支只认 `canManageBilling`,对同一个上下文
  // 返回 `null` —— 两处对同一个人给出相反的答案,用户就掉进 §6.Y 那条死胡同。
  //
  // 所以这条用例问的是弹窗的存在性契约:**这张弹窗被渲染出来的时候,它必须有一条
  // 前进的路**;没有路的那一档应该压根走不到这里(走 `AmrOwnerTopUpDialog`)。
  it('keeps a usable primary CTA for a personal workspace with no billing permission', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(directoryResponse('ws-p', 'wm-p', 'personal'));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({
          context: {
            workspaceId: 'ws-p',
            workspaceType: 'personal',
            workspaceMemberId: 'wm-p',
            role: 'member',
            planId: null,
            billingState: 'active',
            // 真机上 daemon 就是这么回的:个人工作区,却没有账单权限。
            permissions: { canManageBilling: false },
            workspaceSettingsUrl: 'https://open-design.ai/console/settings?workspaceId=ws-p',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (url.includes('/api/workspace/billing')) {
        return Promise.resolve(new Response(JSON.stringify({
          summary: { workspaceId: 'ws-p', membershipTier: '' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));

    expect(open).toHaveBeenCalled();
    const target = new URL(String(open.mock.calls.at(-1)?.[0]));
    expect(`${target.origin}${target.pathname}`).toBe(
      'https://open-design.ai/cloud/dashboard',
    );
    expect(target.searchParams.get('billing')).toBe('plan');
  });

  // ⚠️ 反向对照,必须一直绿:团队里没有账单权限的成员**仍然不外跳**。B 的账单
  // 接口自己会拒,放开只会给他一颗点了会被拒的死按钮;他那一档的出口是
  // `AmrOwnerTopUpDialog`(「找所有者充值」)。
  it.each(['admin', 'member'] as const)(
    'hides the upgrade CTA for a team %s without billing permission',
    async (role) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(directoryResponse('ws-1', 'wm-1', 'team'));
        }
        if (url.includes('/api/workspace/context')) {
          return Promise.resolve(new Response(JSON.stringify({
            context: {
              workspaceId: 'ws-1',
              workspaceType: 'team',
              workspaceMemberId: 'wm-1',
              role,
              planId: 'team_pro',
              billingState: 'active',
              permissions: { canManageBilling: false },
              workspaceSettingsUrl: 'https://open-design.ai/console/settings?workspaceId=ws-1',
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } }));
        }
        if (url.includes('/api/workspace/billing')) {
          return Promise.resolve(new Response(JSON.stringify({
            summary: { workspaceId: 'ws-1', membershipTier: 'team_pro' },
          }), { status: 200, headers: { 'content-type': 'application/json' } }));
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      });

      render(
        <AmrBalanceDialog
          reason="insufficient"
          balanceUsd="0.00"
          profile="prod"
          entrySource="chat_balance_gate_upgrade"
          metricsConsent={false}
          installationId={null}
          onClose={vi.fn()}
          onResolved={vi.fn()}
        />,
      );

      // The first context read starts in loading state. Do not flash a
      // clickable personal fallback before the owner-only permission arrives.
      expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
      await waitFor(() => {
        expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
      });
    },
  );

  it('falls back to the profile console plan surface when no workspace context is known', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));

    const target = new URL(String(open.mock.calls.at(-1)?.[0]));
    expect(`${target.origin}${target.pathname}`).toBe(
      'https://open-design.ai/cloud/dashboard',
    );
    expect(target.searchParams.get('billing')).toBe('plan');
  });


  it.each([
    {profile:'local',origin:'http://127.0.0.1:49195'},
    {profile:'prod',origin:'https://open-design.ai'},
    {profile:null,origin:null},
  ])('Home uses authenticated runtime $profile rather than a default wallet profile', async ({profile,origin}) => {
    const open=vi.spyOn(window,'open').mockImplementation(()=>null);
    const context=workspaceContextFixture({workspaceId:'home-runtime-origin',workspaceMemberId:'home-runtime-owner',workspaceType:'team',role:'owner'});
    context.permissions.canManageBilling=true;
    context.permissions.canManageAutoRecharge=true;
    vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
      const url=String(input);
      if(url.includes('/api/workspace/directory'))return new Response(JSON.stringify(workspaceDirectoryFixture([context])));
      if(url.includes('/api/workspace/context'))return new Response(JSON.stringify({context}));
      return new Response(JSON.stringify({summary:null}));
    });
    render(<HomeAmrBalanceGateDialogs
      block={{reason:'insufficient',dialog:'upgrade',upgradeIntent:'pricing',
        snapshot:{status:'available',profile:'default',user:null,balanceUsd:'0',updatedAt:null,
          fetchedAt:new Date().toISOString(),stale:false,source:'daemon_cache'},resolve:vi.fn()}}
      runtimeProfile={profile} consoleOrigin="http://127.0.0.1:49195"
      metricsConsent={false} installationId={null}/>);
    await screen.findByTestId('amr-balance-dialog');
    if(profile===null){
      await waitFor(()=>expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull());
      expect(open).not.toHaveBeenCalled();
    }else{
      fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
      const target=new URL(String(open.mock.calls[0]![0]));
      expect(target.origin).toBe(origin);
      expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
      expect(target.searchParams.get('billing')).toBe('plan');
    }
  });

  it('Home actual wallet watch dismisses the block on exact funding recovery instead of authorizing an automatic submit', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const resolve = vi.fn();
    const context = workspaceContextFixture({ workspaceId: 'ws-home', workspaceMemberId: 'wm-home', workspaceType: 'team', role: 'owner' });
    context.permissions.canManageBilling = true;
    let actualWorkspace = 'unrelated-workspace';
    const recoveryReads: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('includePreflight=1') && url.includes('modelId=model')) {
        recoveryReads.push(url);
        const observedAt = new Date().toISOString();
        return new Response(JSON.stringify({
          workspaceBalance: { billingScopeVersion: 2, workspaceId: actualWorkspace, workspaceMemberId: 'wm-home', balanceUsd: '10', updatedAt: observedAt },
          workspaceRuntime: { workspaceId: actualWorkspace, workspaceMemberId: 'wm-home', status: 'fresh', observedAt, hardExpiresAt: new Date(Date.now() + 60_000).toISOString() },
          authoritativeWorkspaceRead: { workspaceId: actualWorkspace, workspaceMemberId: 'wm-home', observedAt },
        }));
      }
      if (url.includes('/api/workspace/directory')) return new Response(JSON.stringify(workspaceDirectoryFixture([context])));
      if (url.includes('/api/workspace/context')) return new Response(JSON.stringify({ context }));
      if (url.includes('/api/workspace/billing')) return new Response(JSON.stringify({ summary: { workspaceId: 'ws-home', membershipTier: 'go' } }));
      return new Response('{}');
    });
    await act(async () => {
      render(<HomeAmrBalanceGateDialogs
        block={{ reason: 'insufficient', dialog: 'upgrade', upgradeIntent: 'pricing',
          modelId: 'model', fundingScope: { workspaceType: 'team', workspaceId: 'ws-home', workspaceMemberId: 'wm-home' },
          snapshot: { status: 'available', profile: 'prod', user: null, balanceUsd: '0', updatedAt: null, fetchedAt: new Date().toISOString(), stale: false, source: 'vela_api' }, resolve }}
        metricsConsent={false} installationId={null}
      />);
    });
    fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
    expect(screen.getByTestId('amr-balance-dialog-watching')).toHaveTextContent('send again manually');
    expect(screen.getByTestId('amr-balance-dialog-watching')).not.toHaveTextContent('continue automatically');
    await act(async () => { await vi.advanceTimersByTimeAsync(WALLET_WATCH_INTERVAL_MS); });
    expect(resolve).not.toHaveBeenCalled();
    actualWorkspace = 'ws-home';
    await act(async () => { await vi.advanceTimersByTimeAsync(WALLET_WATCH_INTERVAL_MS); });
    expect(resolve).toHaveBeenCalledExactlyOnceWith('dismiss');
    expect(recoveryReads).toHaveLength(2);
    expect(recoveryReads.every((url) => url.includes('workspaceId=ws-home') && url.includes('modelId=model'))).toBe(true);
  });

  it('keeps one recovery preflight in flight and stops watching after ten minutes', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const onResolved = vi.fn();
    const workspaceContext = workspaceContextFixture({
      workspaceId: 'ws-1',
      workspaceMemberId: 'wm-1',
      workspaceType: 'team',
      role: 'owner',
      permissions: {
        canManageMembers: true,
        canManageBilling: true,
        canInviteMembers: true,
        canManageAutoRecharge: true,
        canShareProjects: true,
        canWriteSyncedFiles: true,
        canViewWorkspaceSettings: true,
        canManageSharedResources: true,
      },
    });
    const preflightUrls: string[] = [];
    let resolveHungPreflight!: (response: Response) => void;
    const hungPreflight = new Promise<Response>((resolve) => {
      resolveHungPreflight = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('includePreflight=1') && url.includes('modelId=model')) {
        preflightUrls.push(url);
        return hungPreflight;
      }
      if (url.includes('/api/workspace/billing')) {
        return Promise.resolve(new Response(JSON.stringify({
          summary: { workspaceId: 'ws-1', membershipTier: '' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(directoryResponse('ws-1', 'wm-1', 'team'));
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({ context: workspaceContext }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <AmrBalanceDialog
        reason="insufficient"
        modelId="model"
        fundingScope={{
          workspaceType: 'team',
          workspaceId: 'ws-1',
          workspaceMemberId: 'wm-1',
        }}
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        workspaceContext={workspaceContext}
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
    );

    fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
    expect(screen.getByTestId('amr-balance-dialog-watching')).toHaveTextContent("We'll continue automatically once your allowance updates.");
    expect(screen.getByTestId('amr-balance-dialog-watching')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALLET_WATCH_INTERVAL_MS);
    });
    expect(preflightUrls).toHaveLength(1);
    expect(preflightUrls[0]).toContain('includePreflight=1');
    expect(preflightUrls[0]).toContain('modelId=model');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALLET_WATCH_INTERVAL_MS * 3);
    });
    expect(preflightUrls).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WALLET_WATCH_TIMEOUT_MS - WALLET_WATCH_INTERVAL_MS * 4,
      );
    });
    expect(preflightUrls).toHaveLength(1);
    expect(screen.queryByTestId('amr-balance-dialog-watching')).toBeNull();

    await act(async () => {
      resolveHungPreflight(new Response('{}', { status: 503 }));
      await hungPreflight;
    });
    expect(onResolved).not.toHaveBeenCalled();
  });
});
