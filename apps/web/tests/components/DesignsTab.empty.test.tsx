// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeAll(() => {
    if (window.localStorage) return;
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a premium empty state when projects list is completely empty', () => {
    const onNewProject = vi.fn();
    render(
      <DesignsTab
        projects={[]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onNewProject={onNewProject}
      />,
    );

    // Verify Title (from 'designs.emptyNoProjects' translation: 'No projects yet.')
    expect(screen.getByText('No projects yet.')).toBeTruthy();


    // Verify CTA Button is present
    const ctaButton = screen.getByRole('button', { name: 'New project' });
    expect(ctaButton).toBeTruthy();

    // Verify clicking the CTA Button invokes the onNewProject callback
    fireEvent.click(ctaButton);
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it('does not render CTA button when onNewProject is not provided', () => {
    render(
      <DesignsTab
        projects={[]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    // Verify Title is present
    expect(screen.getByText('No projects yet.')).toBeTruthy();

    // Verify CTA Button is NOT present
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });

  it('renders No projects match your search when projects exist but query filters them out', () => {
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
        onRename={vi.fn()}
      />,
    );

    // Filter projects using query search so filtered count is 0, but projects.length is 1
    const searchInput = screen.getByPlaceholderText('Search…');
    fireEvent.change(searchInput, { target: { value: 'Non-existent project query' } });

    // Verify 'No projects match your search.' is present
    expect(screen.getByText('No projects match your search.')).toBeTruthy();
    expect(screen.queryByText('No projects yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });
});
