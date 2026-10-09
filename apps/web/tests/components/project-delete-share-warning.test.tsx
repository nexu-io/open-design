// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { ProjectDeleteConfirmDialog } from '../../src/components/project-actions/ProjectDeleteConfirmDialog';
import { useProjectDeleteFlow } from '../../src/components/project-actions/useProjectDeleteFlow';
import type { Project } from '../../src/types';
const context: WorkspaceCollabContext = { workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }), permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
const project: Project = { id: 'project', name: 'Example', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 };
const request = vi.fn<typeof fetch>();
const remove = vi.fn(async () => true);
function Harness() {
  const flow = useProjectDeleteFlow({ onDelete: remove, analyticsPage: 'home', workspaceContext: context });
  return <><button onClick={() => flow.request(project)}>Request delete</button><button onClick={() => void flow.commit()}>Invoke commit directly</button>{flow.target ? <ProjectDeleteConfirmDialog projectName={flow.target.name} activeShareCount={flow.activeShareCount} shareReadStatus={flow.shareReadStatus} pending={flow.pending} failed={flow.failed} onCancel={flow.cancel} onConfirm={() => void flow.commit()} /> : null}</>;
}
beforeEach(() => { request.mockReset(); remove.mockClear(); vi.stubGlobal('fetch', request); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function history(statuses: ('active' | 'stopped')[]) {
  return Response.json({ projectId: 'project', bindingExists: statuses.length > 0, hasEverShared: statuses.length > 0, publications: statuses.map((status, index) => ({ sourceFilePath: `${index}.html`, slug: `stable-${index}`, status })) });
}
it('counts active shares only and does not delete while reading the confirmation', async () => {
  request.mockImplementation(async () => history(['active', 'stopped', 'active']));
  render(<Harness />);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Request delete'));
  expect(await screen.findByText('This project has 2 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Delete "Example"?' })).toBeVisible();
  expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Delete "Example"?');
  expect(screen.getAllByText('Delete "Example"?')).toHaveLength(1);
  expect(remove).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith('/api/projects/project/share-state', expect.objectContaining({ headers: expect.objectContaining({ 'x-od-workspace-id': 'ws' }) }));
  fireEvent.click(screen.getByTestId('project-delete-confirm-accept'));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('project'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});
it.each<{ statuses: ('active' | 'stopped')[] }>([{ statuses: [] }, { statuses: ['stopped'] }])('keeps the existing dialog for no active shares: $statuses', async ({ statuses }) => {
  request.mockImplementation(async () => history(statuses));
  render(<Harness />);
  fireEvent.click(screen.getByText('Request delete'));
  expect(screen.getByTestId('project-delete-confirm-accept')).toBeDisabled();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Delete "Example"?')).toBeVisible();
  expect(screen.getByTestId('project-delete-confirm-accept')).toBeEnabled();
});
it('does not fabricate a count from an unavailable read', async () => {
  request.mockResolvedValue(new Response('', { status: 503 }));
  render(<Harness />);
  fireEvent.click(screen.getByText('Request delete'));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(/pages being shared/)).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});
it('blocks both the button and direct commit until active links are known', async () => {
  let finish!: (response: Response) => void;
  request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Harness />);
  fireEvent.click(screen.getByText('Request delete'));
  const accept = screen.getByTestId('project-delete-confirm-accept');
  expect(accept).toBeDisabled();
  fireEvent.click(accept);
  fireEvent.click(screen.getByText('Invoke commit directly'));
  expect(remove).not.toHaveBeenCalled();
  await act(async () => finish(history(['active'])));
  expect(await screen.findByText(/1 pages being shared/)).toBeVisible();
  expect(accept).toBeEnabled();
  fireEvent.click(accept);
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('project'));
});
it('blocks deletion and visibly reports failed share-state reads, then allows cancel/retry', async () => {
  request.mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(history(['active']));
  render(<Harness />);
  fireEvent.click(screen.getByText('Request delete'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
  const accept = screen.getByTestId('project-delete-confirm-accept');
  expect(accept).toBeDisabled();
  fireEvent.click(accept);
  fireEvent.click(screen.getByText('Invoke commit directly'));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('project-delete-confirm-cancel'));
  fireEvent.click(screen.getByText('Request delete'));
  expect(await screen.findByText(/1 pages being shared/)).toBeVisible();
  expect(screen.getByTestId('project-delete-confirm-accept')).toBeEnabled();
});
it('canceling ignores a late history response and never deletes', async () => {
  let finish!: (response: Response) => void;
  request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Harness />);
  fireEvent.click(screen.getByText('Request delete'));
  fireEvent.click(screen.getByTestId('project-delete-confirm-cancel'));
  await act(async () => finish(history(['active'])));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});
