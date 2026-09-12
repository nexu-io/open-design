// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrBalanceDialog } from '../../src/components/AmrBalanceDialog';
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
  vi.restoreAllMocks();
  // The context hook caches at module scope; clear it so cases don't leak.
  resetWorkspaceContextCache();
});

describe('AmrBalanceDialog', () => {
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
        'https://open-design.ai/amr/dashboard',
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
        'https://open-design.ai/amr/dashboard',
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
        'https://open-design.ai/amr/dashboard',
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
      'https://open-design.ai/amr/dashboard',
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
      'https://open-design.ai/amr/dashboard',
    );
    expect(target.searchParams.get('billing')).toBe('plan');
  });
});
