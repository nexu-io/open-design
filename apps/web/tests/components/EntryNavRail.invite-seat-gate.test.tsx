// @vitest-environment jsdom
//
// Seats no longer route a member action through a purchase flow.
// Explicit permission denial and inactive identities still fail closed.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

// A personal ("Free") workspace: one seat, already occupied by its owner — the
// default shape both the dev context stub and B's real billing use for a
// never-upgraded account (see apps/daemon/src/collab/workspace-context.ts).
function freeContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-personal',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'free',
    planId: null,
    seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
    permissions: {
      canInviteMembers: true,
      canManageBilling: true,
      canViewWorkspaceSettings: true,
    },
    workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-personal',
  } as unknown as WorkspaceCollabContext;
}

function teamContext(availableSeats: number): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 5 - availableSeats,
      availableSeats,
      isSeatFull: availableSeats <= 0,
    },
    permissions: {
      canInviteMembers: true,
      canManageBilling: true,
      canViewWorkspaceSettings: true,
    },
    workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-team',
  } as unknown as WorkspaceCollabContext;
}

function renderRail(context: WorkspaceCollabContext) {
  return render(
    <I18nProvider initial="zh-CN">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={context}
        billing={null}
      />
    </I18nProvider>,
  );
}

/** Scope to the open switcher menu (mirrors EntryNavRail.workspace-directory.test.tsx). */
function menu() {
  const el = document.querySelector('.entry-nav-rail__team-menu');
  if (!el) throw new Error('switcher menu is not open');
  return within(el as HTMLElement);
}

beforeEach(() => {
  resetWorkspaceDirectoryCache();
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
  ) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
});

describe('seat-free member invitation from the workspace switcher', () => {
  it.each(['owner', 'admin', 'member'] as const)('opens local invitation for an authorized %s even on a free full workspace', (role) => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail({ ...freeContext(), role } as WorkspaceCollabContext);
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/添加席位|升级为团队版/)).toBeNull();
  });

  it.each(['owner', 'admin', 'member'] as const)('keeps explicit invite denial authoritative for %s', (role) => {
    const context = teamContext(0);
    renderRail({ ...context, role, permissions: { ...context.permissions, canInviteMembers: false } } as WorkspaceCollabContext);
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });

  it('lets the API handle invitations with exhausted or unknown legacy seat data', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail(teamContext(0));
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getAllByRole('textbox')[0]!, { target: { value: 'teammate@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /发送邀请|确认并邀请/ }));
    await vi.waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([url, init]) => (
      String(url) === '/api/workspace/invite' && (init as RequestInit | undefined)?.method === 'POST'
    ))).toBe(true));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it.each(['removed', 'read_only'] as const)('hides invitation for a %s authority state', (state) => {
    const context = teamContext(3);
    renderRail({ ...context, ...(state === 'removed' ? {memberStatus: 'removed'} : {lifecycleState: 'read_only'}) } as unknown as WorkspaceCollabContext);
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });
});
