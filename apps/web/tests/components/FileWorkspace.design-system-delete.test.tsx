// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { DesignSystemProjectPanel } from '../../src/components/FileWorkspace';
import type { CollabContextValue } from '../../src/collab/collab-context';
import type { DesignSystemSummary } from '../../src/types';

const context: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
// The panel reads the PROJECT's collab context, not the shell identity read:
// its share-free discriminator is the project's own workspace scope having
// settled as `unbound`, so the mock controls those two fields directly.
let workspaceContext: WorkspaceCollabContext | null = null;
let workspaceScopeSettledUnbound = false;
vi.mock('../../src/collab/collab-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/collab-context')>();
  return {
    ...actual,
    useProjectCollabContext: (): CollabContextValue => ({
      ...actual.useProjectCollabContext(),
      workspaceContext,
      workspaceContextLoading: false,
      workspaceScopeSettledUnbound,
    }),
  };
});

const system: DesignSystemSummary = { id: 'ds-1', title: 'Example System', category: 'brand', summary: 'A system' };
const remove = vi.fn(async (_id: string) => true);
const request = vi.fn<typeof fetch>();

function renderPanel() {
  render(
    <DesignSystemProjectPanel
      projectId="project"
      system={system}
      editable
      files={[]}
      streaming={false}
      activityEvents={[]}
      onOpenFile={vi.fn()}
      onUploadAssets={vi.fn()}
      onRefreshFiles={vi.fn()}
      onDeleteDesignSystemProject={remove}
    />,
  );
}
async function requestDelete() {
  // The kit view (and its "..." menu) mounts only after the brand.json /
  // DESIGN.md reads settle; wait for it before opening the menu.
  await screen.findByTestId('design-system-project-kit');
  fireEvent.click(screen.getByTestId('design-kit-more-actions'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Example System' }));
  return screen.getByRole('alertdialog');
}
function shareStateCalls() {
  return request.mock.calls.filter(([url]) => String(url).endsWith('/share-state'));
}

beforeEach(() => {
  workspaceContext = null;
  workspaceScopeSettledUnbound = false;
  remove.mockClear();
  request.mockReset();
  vi.stubGlobal('fetch', request);
  request.mockImplementation(async () => new Response('', { status: 200 }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function history(statuses: ('active' | 'stopped')[]) {
  return Response.json({ projectId: 'project', bindingExists: statuses.length > 0, hasEverShared: statuses.length > 0, publications: statuses.map((status, index) => ({ sourceFilePath: `${index}.html`, slug: `stable-${index}`, status })) });
}

it('deletes a settled workspace-unbound design-system project: no share surface in scope, no share-state read', async () => {
  workspaceContext = null;
  workspaceScopeSettledUnbound = true;
  renderPanel();
  const dialog = await requestDelete();
  // A project whose scope settled `unbound` has no share surface in scope, so
  // the confirmation settles immediately instead of reporting the generic
  // retry error (#8926: local-first design-system deletes never issued).
  expect(within(dialog).queryByRole('alert')).toBeNull();
  expect(within(dialog).getByTestId('project-delete-confirm-accept')).toBeEnabled();
  fireEvent.click(within(dialog).getByTestId('project-delete-confirm-accept'));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('project'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(shareStateCalls()).toHaveLength(0);
});
it('fails closed while the project workspace scope is unresolved: no delete, no share-free shortcut, no read', async () => {
  workspaceContext = null;
  workspaceScopeSettledUnbound = false;
  renderPanel();
  const dialog = await requestDelete();
  // Loading / failed / unavailable scope reads are also a null context; the
  // confirmation must keep waiting (loading copy, no alert) instead of
  // claiming share-free.
  expect(within(dialog).queryByRole('alert')).toBeNull();
  expect(within(dialog).getByTestId('project-delete-confirm-accept')).toBeDisabled();
  fireEvent.click(within(dialog).getByTestId('project-delete-confirm-accept'));
  expect(remove).not.toHaveBeenCalled();
  expect(shareStateCalls()).toHaveLength(0);
});
it('still warns about active links for a workspace-bound project before deleting', async () => {
  workspaceContext = context;
  request.mockImplementation(async (url) => String(url).endsWith('/share-state')
    ? history(['active', 'stopped'])
    : new Response('', { status: 200 }));
  renderPanel();
  const dialog = await requestDelete();
  expect(await within(dialog).findByText('This project has 1 pages being shared. Deleting it will disable their share links, and visitors will no longer be able to open them.')).toBeVisible();
  expect(within(dialog).getByTestId('project-delete-confirm-accept')).toBeEnabled();
  fireEvent.click(within(dialog).getByTestId('project-delete-confirm-accept'));
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('project'));
  expect(request).toHaveBeenCalledWith('/api/projects/project/share-state', expect.objectContaining({ headers: expect.objectContaining({ 'x-od-workspace-id': 'ws' }) }));
});
