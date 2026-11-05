// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';

const context: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
let workspaceContext: WorkspaceCollabContext | null = context;
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useWorkspaceContext: () => ({ context: workspaceContext, loading: false }),
}));
vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async () => null), fetchProjectFiles: vi.fn(async () => []),
  projectFileUrl: (id: string, path: string) => `/api/projects/${id}/files/${path}`,
}));
const project = (id: string, name: string): Project => ({
  id, name, skillId: null, designSystemId: null, createdAt: 1, updatedAt: 2,
  status: { value: 'not_started' },
});
const remove = vi.fn(async (_id: string) => true);
const request = vi.fn<typeof fetch>();
beforeEach(() => {
  workspaceContext = context;
  remove.mockClear(); request.mockReset(); vi.stubGlobal('fetch', request);
  request.mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith('/share-state')) {
      const id = path.split('/')[3];
      return Response.json({ projectId: id, hasEverShared: true, bindingExists: true, publications: id === 'project-1'
        ? [{ sourceFilePath: 'index.html', slug: 'first', status: 'active' }, { sourceFilePath: 'old.html', slug: 'old', status: 'stopped' }]
        : [{ sourceFilePath: 'other.html', slug: 'second', status: 'active' }] });
    }
    return new Response('', { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('Drafts batch delete warns for two active links across selected projects and cancel never deletes', async () => {
  const { container } = render(<RecentProjectsStrip
    heading="Drafts" space="drafts" projects={[project('project-1', 'Landing refresh'), project('project-2', 'Brand system')]}
    limit={2} onOpen={vi.fn()} onDelete={remove} canManageProjectCollection collaborationEnabled
  />);
  fireEvent.click(screen.getByRole('button', { name: 'Multi-select' }));
  fireEvent.click(container.querySelector('.recent-projects__select-check[aria-label="Landing refresh"]')!);
  fireEvent.click(container.querySelector('.recent-projects__select-check[aria-label="Brand system"]')!);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = screen.getByRole('alertdialog');
  expect(await screen.findByText('This project has 2 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(remove).not.toHaveBeenCalled();
});

it('Drafts batch never deletes when workspace context is missing and no share count is known', () => {
  workspaceContext = null;
  const { container } = render(<RecentProjectsStrip
    heading="Drafts" space="drafts" projects={[project('project-1', 'Landing refresh'), project('project-2', 'Brand system')]}
    limit={2} onOpen={vi.fn()} onDelete={remove} canManageProjectCollection collaborationEnabled
  />);
  fireEvent.click(screen.getByRole('button', { name: 'Multi-select' }));
  fireEvent.click(container.querySelector('.recent-projects__select-check[aria-label="Landing refresh"]')!);
  fireEvent.click(container.querySelector('.recent-projects__select-check[aria-label="Brand system"]')!);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByRole('button', { name: 'Delete selected' })).toBeDisabled();
  expect(within(dialog).getByRole('alert')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected' }));
  expect(remove).not.toHaveBeenCalled();
  expect(request.mock.calls.filter(([url]) => String(url).endsWith('/share-state'))).toHaveLength(0);
});
it('Drafts single-card delete keeps an exact refusal visible and retryable', async () => {
  remove.mockRejectedValueOnce(new Error('Delete permission denied')).mockResolvedValueOnce(true);
  render(<RecentProjectsStrip heading="Drafts" space="drafts" projects={[project('project-1', 'Landing refresh')]}
    limit={1} onOpen={vi.fn()} onDelete={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  const dialog = screen.getByRole('alertdialog');
  expect(await screen.findByText('This project has 1 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  fireEvent.click(screen.getByTestId('project-delete-confirm-accept'));
  await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Delete permission denied'));
  expect(dialog.isConnected).toBe(true);
  fireEvent.click(screen.getByTestId('project-delete-confirm-accept'));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
});
