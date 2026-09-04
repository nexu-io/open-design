// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceState = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
}));

vi.mock('../../src/collab/useTeamMembers', () => ({
  useTeamMembers: () => ({ resolve: () => null }),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  notifyTeamProjectsChanged: vi.fn(),
  useWorkspaceBilling: () => null,
  useWorkspaceContext: () => ({ context: workspaceState.context }),
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFiles: vi.fn(async () => []),
  fetchProjectFileText: vi.fn(async () => null),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';

function teamContext(availableSeats: number): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-owner',
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
      canShareProjects: true,
      canManageSharedResources: true,
    },
    teamId: 'team-1',
    workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-team',
  } as unknown as WorkspaceCollabContext;
}

function renderTeamProjects() {
  return render(
    <RecentProjectsStrip
      projects={[]}
      heading="All projects"
      onOpen={() => {}}
      space="team"
    />,
  );
}

afterEach(() => {
  cleanup();
  workspaceState.context = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RecentProjectsStrip invite target (recvqgbyLNk4eE)', () => {
  it('routes a full team directly to Vela seat expansion', () => {
    workspaceState.context = teamContext(0);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderTeamProjects();

    fireEvent.click(screen.getByRole('button', { name: /Invite teammates|邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0]!;
    expect(String(url)).toContain('/console/dashboard');
    expect(String(url)).toContain('workspaceId=ws-team');
    expect(String(url)).toContain('invite=auto');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the local invite dialog for a team with available seats', () => {
    workspaceState.context = teamContext(3);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderTeamProjects();

    fireEvent.click(screen.getByRole('button', { name: /Invite teammates|邀请同事/ }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('lets the invite API resolve the directory-derived zero/zero seat sentinel', async () => {
    const context = teamContext(3);
    workspaceState.context = {
      ...context,
      seatSummary: { seatLimit: 0, usedSeats: 0, availableSeats: 0, isSeatFull: true },
    } as WorkspaceCollabContext;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const fetchSpy = vi.fn(async () => (
      new Response(JSON.stringify({ results: [{ ok: true }] }), { status: 200 })
    ));
    vi.stubGlobal('fetch', fetchSpy);
    renderTeamProjects();

    fireEvent.click(screen.getByRole('button', { name: /Invite teammates|邀请同事/ }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getAllByRole('textbox')[0]!, {
      target: { value: 'teammate@example.com' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Confirm and invite|确认并邀请/i }),
    );

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const calls = fetchSpy.mock.calls as unknown[][];
    expect(String(calls[0]?.[0])).toContain('/api/workspace/invite');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('hides the invite entry when neither local capacity nor a safe Vela URL exists', () => {
    workspaceState.context = {
      ...teamContext(0),
      workspaceSettingsUrl: null,
    } as unknown as WorkspaceCollabContext;
    renderTeamProjects();

    expect(
      screen.queryByRole('button', { name: /Invite teammates|邀请同事/ }),
    ).toBeNull();
  });

  it('routes a full Team owner with billing capability through Vela', () => {
    const context = teamContext(0);
    workspaceState.context = {
      ...context,
      permissions: { ...context.permissions, canInviteMembers: false },
    } as WorkspaceCollabContext;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderTeamProjects();

    fireEvent.click(screen.getByRole('button', { name: /Invite teammates|邀请同事/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0]![0])).toContain('invite=auto');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not expose billing recovery to a Team admin without direct invite capability', () => {
    const context = teamContext(3);
    workspaceState.context = {
      ...context,
      role: 'admin',
      permissions: {
        ...context.permissions,
        canInviteMembers: false,
        canManageBilling: false,
      },
    } as WorkspaceCollabContext;
    renderTeamProjects();

    expect(
      screen.queryByRole('button', { name: /Invite teammates|邀请同事/ }),
    ).toBeNull();
  });

  it('does not expose seat expansion to a full Team admin', () => {
    const context = teamContext(0);
    workspaceState.context = {
      ...context,
      role: 'admin',
      permissions: { ...context.permissions, canManageBilling: false },
    } as WorkspaceCollabContext;
    renderTeamProjects();

    expect(
      screen.queryByRole('button', { name: /Invite teammates|邀请同事/ }),
    ).toBeNull();
  });

  it('does not expose the invite entry to a Team member', () => {
    const context = teamContext(3);
    workspaceState.context = {
      ...context,
      role: 'member',
      permissions: {
        ...context.permissions,
        canInviteMembers: true,
        canManageBilling: true,
      },
    } as WorkspaceCollabContext;
    renderTeamProjects();

    expect(
      screen.queryByRole('button', { name: /Invite teammates|邀请同事/ }),
    ).toBeNull();
  });
});
