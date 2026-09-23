// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { FileViewer } from '../../../src/components/FileViewer';
import { CollabProvider, useProjectCollabContext } from '../../../src/collab/collab-context';
import type { ProjectFile } from '../../../src/types';
const fetchMock = vi.fn<typeof fetch>();
const context: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const file: ProjectFile = { name: 'page.html', path: 'page.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html',
  artifactManifest: { version: 1, kind: 'html', title: 'Page', entry: 'page.html', renderer: 'html', exports: ['html'] } };
const personalCopy = 'The link is disabled. Comment sync to the shared page is paused.';
const teamCopy = 'The link is disabled.';
let publications: { sourceFilePath: string; slug: string; status: 'stopped' | 'active' }[];
beforeEach(() => {
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'stopped' }];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async input => {
    if (String(input).endsWith('/share-state')) return Response.json({ projectId: 'project', bindingExists: publications.length > 0, hasEverShared: publications.length > 0, publications });
    return Response.json({ deployments: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function openShare(workspaceContext: WorkspaceCollabContext | null = context) {
  function Host() {
    const defaults = useProjectCollabContext();
    return <CollabProvider value={{ ...defaults, workspaceContext, projectResourceAuthority: workspaceContext ? 'workspace' : 'local' }}>
      <FileViewer projectId="project" projectKind="prototype" file={file} liveHtml="<html><body>Preview</body></html>" />
    </CollabProvider>;
  }
  render(<Host />);
  fireEvent.click(await screen.findByRole('button', { name: /^Share$/ }));
}
it('personal stopped history renders both clauses in the real host without any mutation', async () => {
  await openShare();
  expect(await screen.findByText(personalCopy)).toBeVisible();
  expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/share-state', expect.objectContaining({ headers: expect.objectContaining({ 'x-od-workspace-id': 'ws' }) }));
  expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('publish-public') && options?.method === 'POST')).toBe(false);
});
it('team stopped history omits the personal comment-sync claim', async () => {
  await openShare({ ...context, workspaceType: 'team', teamId: 'team' });
  expect(await screen.findByText(teamCopy)).toBeVisible();
  expect(screen.queryByText(personalCopy)).toBeNull();
});
it.each(['never-shared', 'other-file', 'active'] as const)('%s does not imply current file stopped from an empty local URL', async scenario => {
  publications = scenario === 'never-shared' ? [] : [{ sourceFilePath: scenario === 'other-file' ? 'other.html' : 'page.html', slug: 'stable', status: scenario === 'active' ? 'active' : 'stopped' }];
  await openShare();
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(personalCopy)).toBeNull();
  expect(screen.queryByText(teamCopy)).toBeNull();
});
it('missing workspace identity never invents the personal consequence', async () => {
  await openShare(null);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(personalCopy)).toBeNull();
  expect(screen.queryByText(teamCopy)).toBeNull();
});
it('an unavailable history read remains unknown', async () => {
  fetchMock.mockImplementation(async input => String(input).endsWith('/share-state')
    ? new Response('', { status: 503 }) : Response.json({ deployments: [] }));
  await openShare();
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(personalCopy)).toBeNull();
  expect(screen.queryByText(teamCopy)).toBeNull();
});
it('authoritative recovery clears a stopped notice on focus without polling or republishing', async () => {
  await openShare();
  await screen.findByText(personalCopy);
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'active' }];
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(screen.queryByText(personalCopy)).toBeNull();
  expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('publish-public') && options?.method === 'POST')).toBe(false);
});
