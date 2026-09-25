// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function openShare(workspaceContext: WorkspaceCollabContext | null = context, streaming = false) {
  function Host() {
    const defaults = useProjectCollabContext();
    return <CollabProvider value={{ ...defaults, workspaceContext, projectResourceAuthority: workspaceContext ? 'workspace' : 'local' }}>
      <FileViewer projectId="project" projectKind="prototype" file={file} liveHtml="<html><body>Preview</body></html>" streaming={streaming} />
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
  expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();
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

const publicUrl = 'https://viewer.example.test/cloud/artifact/project/stable';
const currentPublication = { url: publicUrl, slug: 'stable', fileName: 'page.html' };
function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function publicationRequests(method: 'POST' | 'DELETE') {
  return fetchMock.mock.calls.filter(([url, options]) => String(url).includes('publish-public') && options?.method === method);
}

it.each([false, true])('S9: the access switch stops one active link even while streaming=%s, preserves it until DELETE commits, and renders disabled state', async streaming => {
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'active' }];
  const pending = deferredResponse();
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.endsWith('/share-state')) return Response.json({ projectId: 'project', bindingExists: true, hasEverShared: true, publications });
    if (url.includes('publish-public')) {
      if (options?.method === 'DELETE') return pending.promise;
      return Response.json({ publication: currentPublication });
    }
    return Response.json({ deployments: [] });
  });
  await openShare(context, streaming);
  const toggle = await screen.findByRole('switch', { name: /link access/i });
  await screen.findByText(publicUrl);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(toggle).toBeEnabled();
  // The design has one stop control, not a duplicate action beside Copy link.
  expect(screen.queryByRole('button', { name: /stop sharing/i })).toBeNull();
  fireEvent.click(toggle);
  await waitFor(() => expect(publicationRequests('DELETE')).toHaveLength(1));
  expect(JSON.parse(String(publicationRequests('DELETE')[0]?.[1]?.body))).toEqual({ slug: 'stable' });
  expect(toggle).toBeDisabled();
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText(publicUrl)).toBeTruthy();
  fireEvent.click(toggle);
  expect(publicationRequests('DELETE')).toHaveLength(1);
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'stopped' }];
  await act(async () => pending.resolve(Response.json({ ok: true, slug: 'stable', fileName: 'page.html' })));
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  expect(screen.queryByText(publicUrl)).toBeNull();
  expect(screen.queryByRole('button', { name: /copy share link/i })).toBeNull();
  expect(await screen.findByText(personalCopy)).toBeTruthy();
  expect(publicationRequests('DELETE')).toHaveLength(1);
});

it('S9-R: a stopped-link switch requests resume-only, locks while pending, then restores the original link', async () => {
  const pending = deferredResponse();
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.endsWith('/share-state')) return Response.json({ projectId: 'project', bindingExists: true, hasEverShared: true, publications });
    if (url.includes('publish-public')) {
      if (options?.method === 'POST') return pending.promise;
      return Response.json({ publication: null });
    }
    return Response.json({ deployments: [] });
  });
  await openShare();
  await screen.findByText(personalCopy);
  const toggle = await screen.findByRole('switch', { name: /link access/i });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(toggle);
  await waitFor(() => expect(publicationRequests('POST')).toHaveLength(1));
  expect(JSON.parse(String(publicationRequests('POST')[0]?.[1]?.body))).toEqual({ mode: 'resume' });
  expect(toggle).toBeDisabled();
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('menuitem', { name: '正在开启…' })).toBeDisabled();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(publicationRequests('POST')).toHaveLength(1);
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'active' }];
  await act(async () => pending.resolve(Response.json({ url: publicUrl, slug: 'stable', fileName: 'page.html' })));
  expect(await screen.findByText(publicUrl)).toBeVisible();
  expect(toggle).toHaveAttribute('aria-checked', 'true');
});

it('S9-R clears a last-known URL after authoritative remote stop and offers resume-only instead of Stop', async () => {
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'active' }];
  let remoteStopped = false;
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.endsWith('/share-state')) return Response.json({ projectId: 'project', bindingExists: true, hasEverShared: true, publications });
    if (url.includes('publish-public')) {
      if (options?.method === 'POST') return Response.json({ url: publicUrl, slug: 'stable', fileName: 'page.html' });
      return Response.json({ publication: remoteStopped ? null : currentPublication, status: remoteStopped ? 'stopped' : 'active' });
    }
    return Response.json({ deployments: [] });
  });
  await openShare();
  const toggle = await screen.findByRole('switch', { name: /link access/i });
  await screen.findByText(publicUrl);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  remoteStopped = true;
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'stopped' }];
  fireEvent.click(await screen.findByRole('button', { name: /^Share$/ }));
  await screen.findByText(personalCopy);
  const reopenedToggle = await screen.findByRole('switch', { name: /link access/i });
  await waitFor(() => expect(reopenedToggle).toHaveAttribute('aria-checked', 'false'));
  expect(screen.queryByText(publicUrl)).toBeNull();
  fireEvent.click(reopenedToggle);
  await waitFor(() => expect(publicationRequests('POST')).toHaveLength(1));
  expect(JSON.parse(String(publicationRequests('POST')[0]?.[1]?.body))).toEqual({ mode: 'resume' });
  expect(publicationRequests('DELETE')).toHaveLength(0);
});

it('S10: rejected stop restores the checked switch, keeps the old link, and allows deliberate retry only', async () => {
  publications = [{ sourceFilePath: 'page.html', slug: 'stable', status: 'active' }];
  const pending = deferredResponse();
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.endsWith('/share-state')) return Response.json({ projectId: 'project', bindingExists: true, hasEverShared: true, publications });
    if (url.includes('publish-public')) {
      if (options?.method === 'DELETE') return pending.promise;
      return Response.json({ publication: currentPublication });
    }
    return Response.json({ deployments: [] });
  });
  await openShare();
  const toggle = await screen.findByRole('switch', { name: /link access/i });
  await screen.findByText(publicUrl);
  fireEvent.click(toggle);
  expect(toggle).toBeDisabled();
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  await act(async () => pending.resolve(Response.json({ error: { message: 'no access' } }, { status: 503 })));
  expect(await screen.findByText(/could not turn off the link/i)).toBeTruthy();
  expect(toggle).toBeEnabled();
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText(publicUrl)).toBeTruthy();
  expect(publicationRequests('DELETE')).toHaveLength(1);
  fireEvent.click(toggle);
  await waitFor(() => expect(publicationRequests('DELETE')).toHaveLength(2));
});

it('S10: rejected open restores the unchecked switch and offers a manual retry without auto-republishing', async () => {
  const pending = deferredResponse();
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.endsWith('/share-state')) return Response.json({ projectId: 'project', bindingExists: true, hasEverShared: true, publications });
    if (url.includes('publish-public')) {
      if (options?.method === 'POST') return pending.promise;
      return Response.json({ publication: null });
    }
    return Response.json({ deployments: [] });
  });
  await openShare();
  const toggle = await screen.findByRole('switch', { name: /link access/i });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(toggle);
  await waitFor(() => expect(publicationRequests('POST')).toHaveLength(1));
  expect(toggle).toBeDisabled();
  await act(async () => pending.resolve(Response.json({ error: 'temporarily_unavailable' }, { status: 503 })));
  expect(await screen.findByText(/could not create the share link/i)).toBeTruthy();
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(toggle).toBeEnabled();
  expect(publicationRequests('POST')).toHaveLength(1);
  fireEvent.click(toggle);
  await waitFor(() => expect(publicationRequests('POST')).toHaveLength(2));
});
