// @vitest-environment jsdom
//
// Red-spec coverage for the UI half of recvqzjnshIlOe: when the daemon
// refuses "move to team space" with TEAM_PROJECT_OWNER_CONFLICT (the hub
// already registers this project under another member's ownership), the
// card menu must say so — the conflict is permanent until the registered
// owner unshares, so the generic "Try again." hint is a lie.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';
import type { WorkspaceProjectSummary } from '@open-design/contracts';

const movedTeamProject: WorkspaceProjectSummary = {
  id: 'project-1',
  name: 'Draft',
  workspaceId: 'ws-1',
  visibility: 'team',
  resourceState: 'active',
  createdByWorkspaceMemberId: 'wm-1',
  updatedByWorkspaceMemberId: 'wm-1',
  resourceHubResourceId: 'resource-project-1',
  currentUserAccess: {
    canOpen: true,
    canRename: true,
    canDelete: true,
    canDuplicate: true,
    canMoveToTeam: false,
    canMoveToPersonal: true,
    canExport: true,
    canSendTo: true,
    canRestoreVersion: true,
  },
  createdAt: 1,
  updatedAt: 2,
  project: {
    id: 'project-1',
    name: 'Draft',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
  },
};

const moveWorkspaceProject = vi.fn(async (_input: { projectId: string; visibility: string }) => movedTeamProject);

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  moveWorkspaceProject: (...args: unknown[]) =>
    moveWorkspaceProject(args[0] as { projectId: string; visibility: string }),
}));

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async () => null),
  fetchProjectFiles: vi.fn(async () => []),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

afterEach(() => {
  cleanup();
  moveWorkspaceProject.mockReset();
  vi.restoreAllMocks();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Draft',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...overrides,
  };
}

async function attemptMoveToTeam(props: Partial<React.ComponentProps<typeof RecentProjectsStrip>> = {}) {
  render(
    <RecentProjectsStrip
      projects={[project({ id: 'project-1', name: 'Draft' })]}
      onOpen={() => {}}
      collaborationEnabled
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Move to team space/i }));
  fireEvent.click(screen.getByText('Confirm move'));
  return waitFor(() => {
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    return alert;
  });
}

describe('move-to-team owner conflict message (recvqzjnshIlOe)', () => {
  it('hands the exact successful move response to the optimistic owner layer', async () => {
    const onProjectShared = vi.fn();
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Draft' })]}
        onOpen={() => {}}
        collaborationEnabled
        onProjectShared={onProjectShared}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to team space/i }));
    fireEvent.click(screen.getByText('Confirm move'));

    await waitFor(() => {
      expect(onProjectShared).toHaveBeenCalledWith(movedTeamProject);
    });
  });

  it('renders the permanent owner-conflict message, not the retry hint', async () => {
    moveWorkspaceProject.mockRejectedValueOnce(
      Object.assign(new Error('… 403: {"error":"team_project_owner_conflict"}'), {
        code: 'TEAM_PROJECT_OWNER_CONFLICT',
      }),
    );

    const alert = await attemptMoveToTeam();
    expect(alert.textContent).toBe(
      'Could not move to team space: another member already shares this project with the team.',
    );
  });

  it('keeps the retry hint for code-less transient failures', async () => {
    moveWorkspaceProject.mockRejectedValueOnce(new Error('network wobble'));
    const onProjectShared = vi.fn();
    const onProjectShareFailed = vi.fn();

    const alert = await attemptMoveToTeam({ onProjectShared, onProjectShareFailed });
    expect(alert.textContent).toBe('Could not move to team space. Try again.');
    expect(onProjectShared).not.toHaveBeenCalled();
    expect(onProjectShareFailed).toHaveBeenCalledWith('project-1');
  });
});
