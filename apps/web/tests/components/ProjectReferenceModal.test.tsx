// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  ProjectReferenceModal,
  type ProjectReferenceSelection,
} from '../../src/components/ProjectReferenceModal';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';
import { getProjectDetail, listProjects } from '../../src/state/projects';

vi.mock('../../src/state/projects', () => ({
  getProjectDetail: vi.fn(),
  listProjects: vi.fn(),
}));

const project: Project = {
  id: 'project-ref',
  name: 'Reference Project',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
};

const importedProject: Project = {
  ...project,
  id: 'imported-project',
  name: 'Imported Project',
  metadata: { kind: 'prototype', baseDir: '/Users/me/imported' },
};

type ProjectSelectHandler = (items: ProjectReferenceSelection[]) => void;

function renderModal(options: {
  onSelect?: ProjectSelectHandler;
  projects?: Project[];
  listError?: Error;
  workspaceContext?: WorkspaceCollabContext | null;
} = {}) {
  const onSelect = options.onSelect ?? vi.fn<ProjectSelectHandler>();
  if (options.listError) {
    vi.mocked(listProjects).mockRejectedValue(options.listError);
  } else {
    vi.mocked(listProjects).mockResolvedValue(options.projects ?? [project]);
  }
  render(
    <I18nProvider initial={'en' as Locale}>
      <ProjectReferenceModal
        workspaceContext={options.workspaceContext}
        onClose={vi.fn()}
        onSelect={onSelect}
      />
    </I18nProvider>,
  );
  return { onSelect };
}

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-ref',
    workspaceType: 'team',
    workspaceMemberId: 'member-ref',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: 'team-ref',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
  };
}

async function confirmSelection(projectName = 'Reference Project') {
  await screen.findByText(projectName);
  fireEvent.click(screen.getByRole('button', { name: 'Reference project' }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProjectReferenceModal', () => {
  it('loads projects with a required error surface', async () => {
    renderModal();

    await screen.findByText('Reference Project');

    expect(listProjects).toHaveBeenCalledWith({ throwOnError: true });
  });

  it('shows a load error instead of an empty state when project loading fails', async () => {
    renderModal({ listError: new Error('daemon unavailable') });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load projects');
    expect(screen.queryByText('No other projects yet')).toBeNull();
  });

  it('does not select a project when detail loading fails', async () => {
    const { onSelect } = renderModal();
    vi.mocked(getProjectDetail).mockResolvedValue(null);

    await confirmSelection();

    await screen.findByRole('alert');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not synthesize a project id as a filesystem path', async () => {
    const { onSelect } = renderModal();
    vi.mocked(getProjectDetail).mockResolvedValue({ project, resolvedDir: '' });

    await confirmSelection();

    await screen.findByRole('alert');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects a project only when the daemon returns a resolved directory', async () => {
    const { onSelect } = renderModal();
    vi.mocked(getProjectDetail).mockResolvedValue({
      project,
      resolvedDir: '/tmp/open-design/project-ref',
    });

    await confirmSelection();

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([
        { project, resolvedDir: '/tmp/open-design/project-ref' },
      ]);
    });
  });

  it('reads a bound reference project with its matching caller identity', async () => {
    const boundProject: Project = {
      ...project,
      workspaceId: 'workspace-ref',
    };
    const context = teamContext();
    renderModal({ projects: [boundProject], workspaceContext: context });
    vi.mocked(getProjectDetail).mockResolvedValue({
      project: boundProject,
      resolvedDir: '/tmp/open-design/project-ref',
    });

    await confirmSelection();

    await waitFor(() => {
      expect(getProjectDetail).toHaveBeenCalledWith(
        'project-ref',
        { ensureDir: true },
        context,
      );
    });
  });

  it('falls back to imported project metadata when older daemons omit resolvedDir', async () => {
    const { onSelect } = renderModal({ projects: [importedProject] });
    vi.mocked(getProjectDetail).mockResolvedValue({
      project: importedProject,
      resolvedDir: null,
    });

    await confirmSelection('Imported Project');

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([
        { project: importedProject, resolvedDir: '/Users/me/imported' },
      ]);
    });
  });

  it('selects multiple referenced projects in one confirmation', async () => {
    const secondProject: Project = {
      ...project,
      id: 'second-project',
      name: 'Second Project',
    };
    const { onSelect } = renderModal({ projects: [project, secondProject] });
    vi.mocked(getProjectDetail).mockImplementation(async (id: string) => {
      if (id === project.id) {
        return { project, resolvedDir: '/tmp/open-design/project-ref' };
      }
      if (id === secondProject.id) {
        return { project: secondProject, resolvedDir: '/tmp/open-design/second-project' };
      }
      return null;
    });

    await screen.findByText('Reference Project');
    fireEvent.click(screen.getByText('Second Project'));
    fireEvent.click(screen.getByRole('button', { name: 'Reference project' }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([
        { project, resolvedDir: '/tmp/open-design/project-ref' },
        { project: secondProject, resolvedDir: '/tmp/open-design/second-project' },
      ]);
    });
  });
});
