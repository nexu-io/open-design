// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignsTab } from '../../src/components/DesignsTab';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []),
  liveArtifactPreviewUrl: (projectId: string, artifactId: string) =>
    `/api/projects/${projectId}/live-artifacts/${artifactId}/preview`,
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

const project: Project = {
  id: 'project-1',
  name: 'Landing refresh',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
  status: { value: 'not_started' },
};

describe('DesignsTab select mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('only exposes select mode in grid view', () => {
    render(
      <DesignsTab
        projects={[project]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('designs-view-kanban'));

    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });

  it('exits select mode when switching to kanban view', () => {
    render(
      <DesignsTab
        projects={[project]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByText('0 selected')).toBeTruthy();

    fireEvent.click(screen.getByTestId('designs-view-kanban'));
    fireEvent.click(screen.getByTestId('designs-view-grid'));

    expect(screen.queryByText('0 selected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
  });
});
