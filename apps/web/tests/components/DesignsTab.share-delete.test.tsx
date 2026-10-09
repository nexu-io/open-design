// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { DesignsTab } from '../../src/components/DesignsTab';
import type { Project } from '../../src/types';

const context: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
let workspaceContext: WorkspaceCollabContext | null = context;
vi.mock('../../src/collab/useWorkspaceContext', () => ({ useWorkspaceContext: () => ({ context: workspaceContext, loading: false }) }));
vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(), fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []), liveArtifactPreviewUrl: () => '/preview',
}));

const project: Project = {
  id: 'project-1', name: 'Landing refresh', skillId: null, designSystemId: null,
  createdAt: 1, updatedAt: 2, status: { value: 'not_started' },
};
const remove = vi.fn(async (_id: string) => true);
const request = vi.fn<typeof fetch>();

beforeEach(() => {
  workspaceContext = context;
  remove.mockClear();
  request.mockReset();
  window.localStorage.clear();
  vi.stubGlobal('fetch', request);
  request.mockImplementation(async (url) => String(url).includes('/share-state')
    ? Response.json({ projectId: project.id, bindingExists: true, hasEverShared: true, publications: [
      { sourceFilePath: 'index.html', slug: 'first', status: 'active' },
      { sourceFilePath: 'other.html', slug: 'second', status: 'active' },
      { sourceFilePath: 'old.html', slug: 'old', status: 'stopped' },
    ] })
    : new Response('', { status: 200 }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('All Projects card warns about every active link, cancellation preserves the project, and confirmation deletes once', async () => {
  render(<DesignsTab projects={[project]} skills={[]} designSystems={[]} onOpen={vi.fn()} onOpenLiveArtifact={vi.fn()} onDelete={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(await screen.findByText('This project has 2 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  expect(request).toHaveBeenCalledWith('/api/projects/project-1/share-state', expect.objectContaining({ headers: expect.objectContaining({ 'x-od-workspace-id': 'ws' }) }));
  fireEvent.click(screen.getByTestId('project-delete-confirm-cancel'));
  expect(remove).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(await screen.findByText('This project has 2 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  fireEvent.click(screen.getByTestId('project-delete-confirm-accept'));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(project.id));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

it('All Projects batch checks both selected projects and warns of the aggregate active-link count before deletion', async () => {
  const other: Project = { ...project, id: 'project-2', name: 'Brand system', createdAt: 3, updatedAt: 4 };
  request.mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith('/share-state')) {
      const id = path.split('/')[3];
      return Response.json({ projectId: id, bindingExists: true, hasEverShared: true, publications: id === project.id
        ? [{ sourceFilePath: 'index.html', slug: 'first', status: 'active' }, { sourceFilePath: 'old.html', slug: 'old', status: 'stopped' }]
        : [{ sourceFilePath: 'other.html', slug: 'second', status: 'active' }, { sourceFilePath: 'third.html', slug: 'third', status: 'active' }] });
    }
    return new Response('', { status: 200 });
  });
  render(<DesignsTab projects={[project, other]} skills={[]} designSystems={[]} onOpen={vi.fn()} onOpenLiveArtifact={vi.fn()} onDelete={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Select' }));
  fireEvent.click(screen.getByText('Landing refresh').closest('.design-card') as HTMLElement);
  fireEvent.click(screen.getByText('Brand system').closest('.design-card') as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = screen.getByRole('alertdialog');
  expect(await screen.findByText('This project has 3 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  expect(await screen.findByText('This project has 3 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete selected' }));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
  expect(remove.mock.calls.map(([id]) => id).sort()).toEqual([project.id, other.id]);
  expect(dialog.isConnected).toBe(false);
});

it('All Projects batch never deletes when workspace context is missing and no share count is known', () => {
  workspaceContext = null;
  const other: Project = { ...project, id: 'project-2', name: 'Brand system' };
  render(<DesignsTab projects={[project, other]} skills={[]} designSystems={[]} onOpen={vi.fn()} onOpenLiveArtifact={vi.fn()} onDelete={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Select' }));
  fireEvent.click(screen.getByText('Landing refresh').closest('.design-card') as HTMLElement);
  fireEvent.click(screen.getByText('Brand system').closest('.design-card') as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByRole('button', { name: 'Delete selected' })).toBeDisabled();
  expect(within(dialog).getByRole('alert')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected' }));
  expect(remove).not.toHaveBeenCalled();
  expect(request.mock.calls.filter(([url]) => String(url).endsWith('/share-state'))).toHaveLength(0);
});
it('never treats one failed project share-state read as zero links or deletes a partial batch', async () => {
  const other: Project = { ...project, id: 'project-2', name: 'Brand system' };
  request.mockImplementation(async (url) => String(url).includes('/project-2/share-state')
    ? new Response('', { status: 503 })
    : String(url).includes('/share-state')
      ? Response.json({ projectId: project.id, bindingExists: true, hasEverShared: true,
        publications: [{ sourceFilePath: 'index.html', slug: 'first', status: 'active' }] })
      : new Response('', { status: 200 }));
  render(<DesignsTab projects={[project, other]} skills={[]} designSystems={[]} onOpen={vi.fn()} onOpenLiveArtifact={vi.fn()} onDelete={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Select' }));
  fireEvent.click(screen.getByText('Landing refresh').closest('.design-card') as HTMLElement);
  fireEvent.click(screen.getByText('Brand system').closest('.design-card') as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = screen.getByRole('alertdialog');
  expect(await within(dialog).findByRole('alert')).toBeVisible();
  const accept = within(dialog).getByRole('button', { name: 'Delete selected' });
  expect(accept).toBeDisabled();
  expect(within(dialog).queryByText(/pages being shared/)).toBeNull();
  fireEvent.click(accept);
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(remove).not.toHaveBeenCalled();
});
