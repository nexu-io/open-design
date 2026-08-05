// @vitest-environment jsdom
//
// recvqgbyLNk4eE (P0, Feishu dogfood acceptance table): 邀请同事 must route
// personal workspaces and seat-exhausted teams directly to Vela's context-aware
// invite flow. Teams with capacity keep the local invite dialog.

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

function teamContextWithUnknownSeats(): WorkspaceCollabContext {
  const context = teamContext(3);
  return { ...context, seatSummary: undefined } as unknown as WorkspaceCollabContext;
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

describe('EntryNavRail workspace-switcher invite target (recvqgbyLNk4eE)', () => {
  it('routes a personal workspace directly to Vela invite resolution', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail(freeContext());

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0]!;
    expect(String(url)).toContain('/console/dashboard');
    expect(String(url)).toContain('workspaceId=ws-personal');
    expect(String(url)).toContain('invite=auto');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('routes a full team directly to Vela seat expansion', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail(teamContext(0));

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0]!;
    expect(String(url)).toContain('/console/dashboard');
    expect(String(url)).toContain('workspaceId=ws-team');
    expect(String(url)).toContain('invite=auto');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the local invite dialog for a team with available seats', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail(teamContext(3));

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('fails closed while the team seat state is unknown', () => {
    renderRail(teamContextWithUnknownSeats());

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });

  it('hides the invite entry when neither local capacity nor a safe Vela URL exists', () => {
    renderRail({
      ...freeContext(),
      workspaceSettingsUrl: null,
    } as unknown as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });

  it('keeps Personal Free owner actions visible and routes invite through Vela', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const context = freeContext();
    renderRail({
      ...context,
      permissions: { ...context.permissions, canInviteMembers: false },
    } as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().getByTestId('entry-nav-create-team')).toHaveAttribute(
      'href',
      expect.stringContaining('workspace=create'),
    );
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0]![0])).toContain('workspaceId=ws-personal');
    expect(String(openSpy.mock.calls[0]![0])).toContain('invite=auto');
  });

  it('routes a paid Personal workspace with direct invite capability through Vela', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail({
      ...freeContext(),
      billingState: 'active',
      planId: 'pro',
    } as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0]![0])).toContain('invite=auto');
  });

  it('routes a Team owner with billing capability through Vela when direct invite is unavailable', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const context = teamContext(0);
    renderRail({
      ...context,
      permissions: { ...context.permissions, canInviteMembers: false },
    } as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(menu().getByRole('menuitem', { name: /邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0]![0])).toContain('invite=auto');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not expose billing recovery to a Team admin without direct invite capability', () => {
    const context = teamContext(3);
    renderRail({
      ...context,
      role: 'admin',
      permissions: {
        ...context.permissions,
        canInviteMembers: false,
        canManageBilling: false,
      },
    } as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });

  it('does not expose seat expansion to a full Team admin', () => {
    const context = teamContext(0);
    renderRail({
      ...context,
      role: 'admin',
      permissions: { ...context.permissions, canManageBilling: false },
    } as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });

  it('does not expose the invite entry to a Team member', () => {
    const context = teamContext(3);
    renderRail({
      ...context,
      role: 'member',
      permissions: {
        ...context.permissions,
        canInviteMembers: true,
        canManageBilling: true,
      },
    } as WorkspaceCollabContext);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByRole('menuitem', { name: /邀请同事/ })).toBeNull();
  });
});
