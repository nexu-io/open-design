// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@open-design/contracts';

import { DesignsTab } from '../../src/components/DesignsTab';
import { fetchLiveArtifacts } from '../../src/providers/registry';

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

describe('DesignsTab delete flow', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(fetchLiveArtifacts).mockReset();
    vi.mocked(fetchLiveArtifacts).mockResolvedValue([]);
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
});
