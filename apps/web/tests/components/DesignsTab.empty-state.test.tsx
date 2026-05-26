// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignsTab } from '../../src/components/DesignsTab';

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []),
  liveArtifactPreviewUrl: (projectId: string, artifactId: string) =>
    `/api/projects/${projectId}/live-artifacts/${artifactId}/preview`,
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

describe('DesignsTab empty state', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows a New project action when there are no projects (#2978)', () => {
    const onNewProject = vi.fn();
    render(
      <DesignsTab
        projects={[]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onNewProject={onNewProject}
      />,
    );

    expect(screen.getByTestId('designs-empty-no-projects')).toBeTruthy();
    expect(screen.getByText(/Create your first project/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it('keeps the search empty state text-only', () => {
    render(
      <DesignsTab
        projects={[
          {
            id: 'project-1',
            name: 'Landing refresh',
            skillId: null,
            designSystemId: null,
            createdAt: 1,
            updatedAt: 2,
            status: { value: 'not_started' },
          },
        ]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search…'), {
      target: { value: 'does-not-match' },
    });

    expect(screen.queryByTestId('designs-empty-no-projects')).toBeNull();
    expect(screen.getByText('No projects match your search.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });
});
