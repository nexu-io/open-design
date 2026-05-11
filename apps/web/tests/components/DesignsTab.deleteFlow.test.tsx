// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveArtifactSummary, Project } from '@open-design/contracts';

import { DesignsTab } from '../../src/components/DesignsTab';
import { deleteLiveArtifact, fetchLiveArtifacts } from '../../src/providers/registry';

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(),
}));

const sampleProject: Project = {
  id: 'project-1',
  name: 'Marketing site',
  skillId: null,
  designSystemId: null,
  createdAt: Date.now() - 1000,
  updatedAt: Date.now(),
};

const sampleArtifact: LiveArtifactSummary = {
  schemaVersion: 1,
  id: 'artifact-1',
  projectId: 'project-1',
  title: 'Hero section',
  slug: 'hero-section',
  status: 'active',
  pinned: false,
  preview: { type: 'html', entry: 'index.html' },
  refreshStatus: 'idle',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  hasDocument: true,
};

describe('DesignsTab delete flow', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(fetchLiveArtifacts).mockReset();
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([]);
    vi.mocked(deleteLiveArtifact).mockReset();
    // DesignsTab persists its grid/kanban toggle to localStorage, so a
    // test that flips it leaks the toggle into the next test's mount.
    // Reset to default between tests.
    try {
      window.localStorage.clear();
    } catch {
      // ignore in environments without localStorage
    }
  });

  it('opens the in-app confirm dialog when the project delete button is clicked', async () => {
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([]);
    const onDelete = vi.fn();

    render(
      <DesignsTab
        projects={[sampleProject]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await screen.findByText('Marketing site');

    // The grid view's delete button. It used to call native confirm()
    // directly; now it should surface the React confirm dialog.
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete project Marketing site' }),
    );

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Delete "Marketing site"?')).toBeTruthy();
    // onDelete should NOT be called yet — only after the user confirms
    // in the React dialog.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onDelete with the project id only when the dialog is confirmed', async () => {
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([]);
    const onDelete = vi.fn();

    render(
      <DesignsTab
        projects={[sampleProject]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await screen.findByText('Marketing site');
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete project Marketing site' }),
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('project-1'));
    // Dialog should close after the action commits.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('does not call onDelete when the dialog is cancelled', async () => {
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([]);
    const onDelete = vi.fn();

    render(
      <DesignsTab
        projects={[sampleProject]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await screen.findByText('Marketing site');
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete project Marketing site' }),
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();
  });

  // Kanban view exposes its own delete affordance on each card. Same
  // pendingDelete state ultimately drives the dialog, but the wiring is
  // separate from grid view, so a kanban-side regression wouldn't be
  // caught by the grid coverage alone.
  it('routes kanban view project delete through the React dialog', async () => {
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([]);
    const onDelete = vi.fn();

    render(
      <DesignsTab
        projects={[sampleProject]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await screen.findByText('Marketing site');
    fireEvent.click(screen.getByTestId('designs-view-kanban'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete project Marketing site' }),
    );

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('project-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  // Live-artifact delete is the third call site the PR replaced. Unlike
  // project delete it goes through `deleteLiveArtifact` rather than the
  // parent `onDelete` prop, so we assert that the provider was invoked
  // with the right (projectId, artifactId) tuple only after confirm.
  it('routes live-artifact delete through the React dialog and calls deleteLiveArtifact only on confirm', async () => {
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([sampleArtifact]);
    vi.mocked(deleteLiveArtifact).mockResolvedValue(true);
    const onDelete = vi.fn();

    render(
      <DesignsTab
        projects={[sampleProject]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={onDelete}
      />,
    );

    // Wait for the live-artifact card to surface — DesignsTab fetches
    // artifacts in an effect after mount, so the delete affordance is
    // not present synchronously.
    const artifactDeleteButton = await screen.findByRole('button', {
      name: 'Delete Hero section',
    });

    fireEvent.click(artifactDeleteButton);

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(deleteLiveArtifact).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() =>
      expect(deleteLiveArtifact).toHaveBeenCalledWith('project-1', 'artifact-1'),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('does not call deleteLiveArtifact when the live-artifact dialog is cancelled', async () => {
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([sampleArtifact]);
    vi.mocked(deleteLiveArtifact).mockResolvedValue(true);

    render(
      <DesignsTab
        projects={[sampleProject]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const artifactDeleteButton = await screen.findByRole('button', {
      name: 'Delete Hero section',
    });
    fireEvent.click(artifactDeleteButton);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteLiveArtifact).not.toHaveBeenCalled();
  });
});
