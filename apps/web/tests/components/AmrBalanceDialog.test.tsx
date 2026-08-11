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

  // Acceptance #73: 「升级套餐」 used to open the console and leave the user to
  // find the plan picker. B auto-opens a subscription dialog when the URL
  // carries `billing=checkout` OR `billing=plan`, and the destination is the
  // team DASHBOARD, not settings — but WHICH param depends on whether the
  // team has ever completed a first checkout (see `teamConsoleUrl`'s
  // docblock in EntryNavRail.tsx).
  it('lands the upgrade CTA on the first-checkout dialog when the team has never subscribed', async () => {
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
      expect(target.pathname).toBe('/console/dashboard');
      expect(target.searchParams.get('billing')).toBe('checkout');
      // The deep link keeps the workspace this client is pinned to.
      expect(target.searchParams.get('workspaceId')).toBe('ws-1');
    });
  });

  // recvpYEiH019cD / recvpSQKna0LwR: `billing=checkout` only auto-opens B's
  // dialog for a team that has never subscribed — for a team with an ALREADY
  // active plan, that gate is false and B silently opens nothing (confirmed
  // live: an already-subscribed "Team Pro" workspace landed on the bare
  // Overview page). `planId: 'team_pro'` here is exactly that already-paying
  // state, so the CTA must switch to `billing=plan`, B's change-plan dialog.
  it('lands the upgrade CTA on the change-plan dialog when the team already has an active plan', async () => {
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
      expect(target.pathname).toBe('/console/dashboard');
      expect(target.searchParams.get('billing')).toBe('plan');
      expect(target.searchParams.get('workspaceId')).toBe('ws-1');
    });
  });

  // recvpYEiH019cD (failed acceptance round, third account, $0 personal
  // workspace): B returns a `workspaceSettingsUrl` for a PERSONAL workspace
  // too, so "console URL present" stopped implying "team" — the CTA routed a
  // personal account onto the team dashboard's `billing=checkout` deep link,
  // which opens the Upgrade-Personal-workspace-to-Team dialog in an error
  // state ("Team plan unavailable" / 3-seat minimum). The axis is the
  // workspace TYPE: personal lands on B's personal plan modal — the same
  // dialog the console's own 「升级订阅」 hero button opens, which its dashboard
  // resolves from `billing=plan` against the workspace's real state.
  it('lands the upgrade CTA on the personal plan modal for a personal workspace', async () => {
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
      expect(target.pathname).toBe('/console/dashboard');
      // B resolves this one intent per workspace state, so a personal owner can
      // no longer be handed the Upgrade-to-Team dialog's error state.
      expect(target.searchParams.get('billing')).toBe('plan');
      // The deep link keeps the workspace this client is pinned to.
      expect(target.searchParams.get('workspaceId')).toBe('ws-p');
    });
  });

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

  // No workspace console URL (context read has not landed / signed out): the
  // CTA must still go somewhere, not become a dead end — and it must land on
  // the plan modal (`billing=plan`), not the bare console dashboard, otherwise
  // the user has to hunt for the upgrade dialog themselves (dogfood acceptance
  // regression: recvpYEiH019cD).
  it('falls back to the profile plans deep link when no console URL is known', async () => {
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
    expect(target.pathname).toBe('/amr/dashboard');
    expect(target.searchParams.get('billing')).toBe('plan');
  });
});
