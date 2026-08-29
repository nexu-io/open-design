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

  it('lands the upgrade CTA on Pricing when a team has never subscribed', async () => {
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
      expect(`${target.origin}${target.pathname}`).toBe('https://open-design.ai/pricing/');
      expect(target.searchParams.get('billing')).toBeNull();
    });
  });

  it('lands the upgrade CTA on Pricing when a team already has an active plan', async () => {
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
      expect(`${target.origin}${target.pathname}`).toBe('https://open-design.ai/pricing/');
      expect(target.searchParams.get('billing')).toBeNull();
    });
  });

  it('lands the upgrade CTA on Pricing for a personal workspace', async () => {
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
      expect(`${target.origin}${target.pathname}`).toBe('https://open-design.ai/pricing/');
      expect(target.searchParams.get('billing')).toBeNull();
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

  it('falls back to public Pricing when no workspace context is known', async () => {
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
    expect(`${target.origin}${target.pathname}`).toBe('https://open-design.ai/pricing/');
    expect(target.searchParams.get('billing')).toBeNull();
  });
});
