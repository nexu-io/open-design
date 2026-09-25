// @vitest-environment jsdom
// Owner S5/S6: mount the real Share entry and exercise the daemon GET/POST wire.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { FileViewer } from '../../src/components/FileViewer';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';

const publication = { url: 'https://example.invalid/artifact/proj/stable', slug: 'stable', fileName: 'index.html' };
const context: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'team', teamId: 'ws', workspaceMemberId: 'owner',
  role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
  planId: null, providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const collab: CollabContextValue = {
  workspaceContext: context, workspaceContextLoading: false, enabled: false, member: null,
  present: [], publishedVersion: null, syncState: null, viewerOnly: false, writerAuthority: 'allowed',
  isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false, ownerDisplayName: null,
  ownerRole: null, downloadPending: false, reportChange: () => {}, requestPublish: () => {},
  refreshPresence: () => {}, checkStatusNow: () => {},
};
const props: ComponentProps<typeof FileViewer> = {
  projectKind: 'prototype', projectId: 'proj', file: {
    name: 'index.html', path: 'index.html', type: 'file', size: 123, mtime: 1,
    kind: 'html', mime: 'text/html', artifactManifest: {
      version: 1, kind: 'html', title: 'Page', entry: 'index.html', renderer: 'html', exports: ['html'],
    },
  }, liveHtml: '<html><body>first version</body></html>',
};
let copy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

function publishedRoute(options: { freshness?: 'outdated' | 'current' | 'unknown'; failures?: number; failureStage?: 'push' | 'snapshot' | 'manual'; historyStatus?: 'active' | 'stopped'; fileStatus?: 'active' | 'stopped'; amrAuthenticated?: boolean; noPublication?: boolean } = {}) {
  let freshness = options.freshness ?? 'outdated';
  let fileStatus = options.fileStatus ?? 'active';
  let failures = options.failures ?? 0;
  let readFails = false;
  let deferReads = false;
  let resolveDeferredRead: ((response: Response) => void) | null = null;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/integrations/vela/status')) return new Response(JSON.stringify({ loggedIn: Boolean(options.amrAuthenticated), loginInFlight: false, profile: 'prod', user: options.amrAuthenticated ? { id: 'owner' } : null, configPath: '/x' }), { status: 200 });
    if (url.includes('/share-state')) return new Response(JSON.stringify({ projectId: 'proj', hasEverShared: !options.noPublication, bindingExists: !options.noPublication, publications: options.noPublication ? [] : [{ sourceFilePath: 'index.html', slug: 'stable', status: options.historyStatus ?? 'active' }] }), { status: 200 });
    if (url.includes('publish-public')) {
      if (init?.method === 'POST') {
        if (failures-- > 0) return new Response(JSON.stringify(options.failureStage === 'manual'
          ? { error: { code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED', message: 'Publication metadata could not be saved', data: { projectId: 'proj', ...publication } } }
          : { error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE', failure: { stage: options.failureStage ?? 'push', reason: 'network' } }), { status: 502 });
        freshness = 'current';
        return new Response(JSON.stringify(publication), { status: 200 });
      }
      if (readFails) return new Response(JSON.stringify({ error: 'SHARE_STATE_UNAVAILABLE' }), { status: 503 });
      if (options.noPublication) return new Response(JSON.stringify({ publication: null, status: 'none', freshness: 'unknown' }), { status: 200 });
      if (deferReads) return await new Promise<Response>(resolve => { resolveDeferredRead = resolve; });
      return new Response(JSON.stringify({ publication, status: fileStatus, freshness }), { status: 200 });
    }
    if (url.includes('/social-share')) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    setReadFails: (next: boolean) => { readFails = next; },
    setFreshness: (next: typeof freshness) => { freshness = next; },
    setFileStatus: (next: typeof fileStatus) => { fileStatus = next; },
    setReadDeferred: (next: boolean) => { deferReads = next; },
    resolveDeferredRead: () => resolveDeferredRead?.(new Response(JSON.stringify({ publication, status: 'active', freshness }), { status: 200 })),
  };
}
function posts(fetch: ReturnType<typeof vi.fn>) {
  return fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && init?.method === 'POST');
}
async function openShare() {
  const view = render(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  await screen.findByText(publication.url);
  return view;
}

it('S0 login success returns to the first-share panel without automatically generating a link', async () => {
  const route = publishedRoute({ noPublication: true, amrAuthenticated: true });
  const view = render(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  expect(screen.getByText('A share link needs a signed-in workspace. Sign in to OpenDesign Cloud, or use a deploy option to share this file.')).toBeVisible();
  await act(async () => fireEvent.click(screen.getByTestId('share-cloud-signin')));
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(screen.getByRole('menuitem', { name: /generate and copy link/i })).toBeEnabled());
  expect(posts(route.fetch)).toHaveLength(0);
});

it('S13 witnesses only an authenticated active share GET and revokes a stopped result', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const onObservedPublicShareLink = vi.fn();
  const view = render(<CollabProvider value={collab}>
    <FileViewer {...props} onObservedPublicShareLink={onObservedPublicShareLink} />
  </CollabProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  await waitFor(() => expect(onObservedPublicShareLink).toHaveBeenCalledWith({
    status: 'active', projectId: 'proj', filePath: 'index.html', slug: 'stable',
    url: publication.url, workspaceId: 'ws', workspaceMemberId: 'owner',
    authorizationScopeKey: expect.stringMatching(/^workspace:/), freshness: 'outdated',
  }));
  const activeCalls = onObservedPublicShareLink.mock.calls.length;
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}>
    <FileViewer {...props} onObservedPublicShareLink={onObservedPublicShareLink} />
  </CollabProvider>);
  expect(onObservedPublicShareLink.mock.calls.length).toBe(activeCalls);
  route.setFileStatus('stopped');
  view.rerender(<CollabProvider value={collab}>
    <FileViewer {...props} onObservedPublicShareLink={onObservedPublicShareLink} />
  </CollabProvider>);
  await waitFor(() => expect(onObservedPublicShareLink).toHaveBeenLastCalledWith(null));
  expect(posts(route.fetch)).toHaveLength(0);
});

it('S13 explicit login-to-update waits for a fresh same-member active/outdated GET and publishes once', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const onObservedPublicShareLink = vi.fn();
  const first = render(<CollabProvider value={collab}>
    <FileViewer {...props} onObservedPublicShareLink={onObservedPublicShareLink} />
  </CollabProvider>);
  await waitFor(() => expect(onObservedPublicShareLink).toHaveBeenCalledWith(expect.objectContaining({
    status: 'active', slug: publication.slug, freshness: 'outdated',
  })));
  const link = onObservedPublicShareLink.mock.calls.find(([share]) => share?.status === 'active')?.[0];
  expect(link).toBeTruthy();
  expect(posts(route.fetch)).toHaveLength(0); // Passive login alone never updates.
  first.unmount();
  route.setReadDeferred(true);
  const readsBefore = route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && init?.method !== 'POST').length;
  const onLoginUpdateRequestHandled = vi.fn();
  render(<CollabProvider value={collab}><FileViewer {...props}
    loginUpdateRequest={{ nonce: 1, accountId: 'owner', expiresAt: Date.now() + 60_000, link }}
    onLoginUpdateRequestHandled={onLoginUpdateRequestHandled}
  /></CollabProvider>);
  await waitFor(() => expect(route.fetch.mock.calls.filter(([url, init]) =>
    String(url).includes('publish-public') && init?.method !== 'POST').length).toBeGreaterThan(readsBefore));
  expect(posts(route.fetch)).toHaveLength(0);
  expect(onLoginUpdateRequestHandled).not.toHaveBeenCalled();
  route.setReadDeferred(false);
  await act(async () => { route.resolveDeferredRead(); });
  await waitFor(() => expect(posts(route.fetch)).toHaveLength(1));
  expect(onLoginUpdateRequestHandled).toHaveBeenCalledExactlyOnceWith(1);
  expect(copy).not.toHaveBeenCalled();
});

it.each([
  ['stopped', 'stopped', 'outdated'],
  ['already current', 'active', 'current'],
] as const)('S13 post-login %s GET consumes intent without publishing', async (_label, nextStatus, nextFreshness) => {
  const route = publishedRoute({ amrAuthenticated: true });
  const witness = vi.fn();
  const first = render(<CollabProvider value={collab}>
    <FileViewer {...props} onObservedPublicShareLink={witness} />
  </CollabProvider>);
  await waitFor(() => expect(witness).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' })));
  const link = witness.mock.calls.find(([share]) => share?.status === 'active')?.[0];
  first.unmount();
  route.setFileStatus(nextStatus);
  route.setFreshness(nextFreshness);
  const onLoginUpdateRequestHandled = vi.fn();
  render(<CollabProvider value={collab}><FileViewer {...props}
    loginUpdateRequest={{ nonce: 9, accountId: 'owner', expiresAt: Date.now() + 60_000, link }}
    onLoginUpdateRequestHandled={onLoginUpdateRequestHandled}
  /></CollabProvider>);
  await waitFor(() => expect(onLoginUpdateRequestHandled).toHaveBeenCalledExactlyOnceWith(9));
  expect(posts(route.fetch)).toHaveLength(0);
});

it('S13 post-login different workspace member cannot consume a prior scope into an update', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const witness = vi.fn();
  const first = render(<CollabProvider value={collab}><FileViewer {...props} onObservedPublicShareLink={witness} /></CollabProvider>);
  await waitFor(() => expect(witness).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' })));
  const link = witness.mock.calls.find(([share]) => share?.status === 'active')?.[0];
  first.unmount();
  const onLoginUpdateRequestHandled = vi.fn();
  render(<CollabProvider value={{ ...collab, workspaceContext: { ...context, workspaceMemberId: 'other' } }}>
    <FileViewer {...props} loginUpdateRequest={{ nonce: 10, accountId: 'owner', expiresAt: Date.now() + 60_000, link }}
      onLoginUpdateRequestHandled={onLoginUpdateRequestHandled} />
  </CollabProvider>);
  await waitFor(() => expect(onLoginUpdateRequestHandled).toHaveBeenCalledExactlyOnceWith(10));
  expect(posts(route.fetch)).toHaveLength(0);
});

it('S13 preserves the known active URL for copy after sign-out without sending a publish or stop mutation', async () => {
  const route = publishedRoute();
  const view = await openShare();
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  expect(screen.getByText(publication.url)).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /copy share link/i })));
  expect(copy).toHaveBeenCalledWith(publication.url);
  expect(posts(route.fetch)).toHaveLength(0);
  expect(route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && init?.method === 'DELETE')).toHaveLength(0);
});

it('S13 explicit login-after-update intent resumes the same outdated public file once authority returns, never on passive login', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const view = await openShare();
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  expect(screen.getByText(publication.url)).toBeVisible();
  expect(posts(route.fetch)).toHaveLength(0);
  await act(async () => fireEvent.click(screen.getByTestId('share-cloud-signin')));
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(posts(route.fetch)).toHaveLength(1));
  expect(copy).not.toHaveBeenCalled();
});

it('S13 does not update until a fresh authenticated share-state read confirms the same outdated alias', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const view = await openShare();
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  await act(async () => fireEvent.click(screen.getByTestId('share-cloud-signin')));
  route.setReadDeferred(true);
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThan(1));
  expect(posts(route.fetch)).toHaveLength(0);
  await act(async () => route.resolveDeferredRead());
  await waitFor(() => expect(posts(route.fetch)).toHaveLength(1));
});

it('S13 drops an explicit update intent on account switch and never publishes under the new member', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const view = await openShare();
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  await act(async () => fireEvent.click(screen.getByTestId('share-cloud-signin')));
  const nextContext = { ...context, workspaceId: 'ws-other', teamId: 'ws-other', workspaceMemberId: 'member-other' };
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: nextContext }}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThan(1));
  expect(posts(route.fetch)).toHaveLength(0);
});

it('S13 discards the deferred update when the authenticated read says the link was stopped', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const view = await openShare();
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  await act(async () => fireEvent.click(screen.getByTestId('share-cloud-signin')));
  route.setFileStatus('stopped');
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThan(1));
  expect(posts(route.fetch)).toHaveLength(0);
});

it('S13 discards the deferred update if authenticated share-state is already current', async () => {
  const route = publishedRoute({ amrAuthenticated: true });
  const view = await openShare();
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: null }}><FileViewer {...props} /></CollabProvider>);
  await act(async () => fireEvent.click(screen.getByTestId('share-cloud-signin')));
  route.setFreshness('current');
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThan(1));
  expect(posts(route.fetch)).toHaveLength(0);
});

it('account switch never exposes or copies the previous account link while fresh status is pending', async () => {
  const route = publishedRoute();
  const view = await openShare();
  expect(screen.getByText(publication.url)).toBeTruthy();

  route.setReadDeferred(true);
  const nextContext = { ...context, workspaceId: 'ws-other', teamId: 'ws-other', workspaceMemberId: 'member-other' };
  view.rerender(<CollabProvider value={{ ...collab, workspaceContext: nextContext }}><FileViewer {...props} /></CollabProvider>);
  await waitFor(() => expect(route.fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThan(1));

  expect(screen.queryByText(publication.url)).toBeNull();
  expect(screen.queryByRole('button', { name: /copy share link/i })).toBeNull();
  expect(copy).not.toHaveBeenCalled();
  route.resolveDeferredRead();
});

it('S5 keeps the old link copyable and updating never happens as a side effect of copy', async () => {
  const { fetch } = publishedRoute();
  await openShare();
  expect(screen.getByText(/new changes|updated content/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: /update link/i })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy share link/i })); });
  expect(copy).toHaveBeenCalledWith(publication.url);
  expect(posts(fetch)).toHaveLength(0);
});

it('S6-OK updates the stable alias, shows global transient success, and never automatically copies', async () => {
  const { fetch } = publishedRoute();
  await openShare();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /update link/i })); });
  await waitFor(() => expect(posts(fetch)).toHaveLength(1));
  expect(screen.getByText(publication.url)).toBeTruthy();
  expect((await screen.findByText('Link updated')).closest('[role="status"]')).toBeTruthy();
  expect(copy).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('button', { name: /update link/i })).toBeNull());
  await waitFor(() => expect(fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThanOrEqual(3));
});

it('S6-ERR preserves old link after failed update, never retries automatically, then explicit toast retry succeeds', async () => {
  const { fetch } = publishedRoute({ failures: 1 });
  await openShare();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /update link/i })); });
  await waitFor(() => expect(posts(fetch)).toHaveLength(1));
  expect(screen.getByText(publication.url)).toBeTruthy();
  expect(screen.getByRole('button', { name: /copy share link/i })).toBeEnabled();
  expect((await screen.findByText(/Update failed/i)).closest('[role="alert"]')).toBeTruthy();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(posts(fetch)).toHaveLength(1);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^retry$/i })); });
  await waitFor(() => expect(posts(fetch)).toHaveLength(2));
  expect(screen.getByText(publication.url)).toBeTruthy();
  expect(copy).not.toHaveBeenCalled();
});

it.each(['snapshot', 'manual'] as const)('S6-ERR %s remote outcome is uncertain; never claim old bytes or offer blind retry', async (failureStage) => {
  const { fetch } = publishedRoute({ failures: 1, failureStage });
  await openShare();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /update link/i })); });
  await waitFor(() => expect(posts(fetch)).toHaveLength(1));
  expect(screen.getByText(publication.url)).toBeTruthy();
  expect((await screen.findByText(/Update outcome unknown/i)).closest('[role="alert"]')).toBeTruthy();
  expect(screen.queryByText(/previous version is still available/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /^retry$/i })).toBeNull();
  expect(copy).not.toHaveBeenCalled();
});

it('S5 responds to filesRefreshKey with unchanged mtime while the panel stays open', async () => {
  const { fetch, setFreshness } = publishedRoute({ freshness: 'current' });
  const view = await openShare();
  expect(screen.queryByRole('button', { name: /update link/i })).toBeNull();
  setFreshness('outdated');
  const before = fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length;
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} filesRefreshKey={7} /></CollabProvider>);
  await waitFor(() => expect(fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThan(before));
  await waitFor(() => expect(screen.getByRole('button', { name: /update link/i })).toBeEnabled());
  expect(posts(fetch)).toHaveLength(0);
});

it('S5 trusts one coherent per-file status/freshness result over a stale project history', async () => {
  const { fetch } = publishedRoute({ historyStatus: 'stopped', fileStatus: 'active' });
  await openShare();
  await waitFor(() => expect(screen.getByRole('button', { name: /update link/i })).toBeEnabled());
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /update link/i })));
  expect(posts(fetch)).toHaveLength(1);
});

it('S5 never exposes Update or a stopped link when per-file GET says stopped even if history says active', async () => {
  const { fetch } = publishedRoute({ historyStatus: 'active', fileStatus: 'stopped' });
  render(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  await screen.findByRole('switch', { name: /link access/i });
  expect(screen.queryByText(publication.url)).toBeNull();
  expect(screen.queryByRole('button', { name: /update link/i })).toBeNull();
  expect(posts(fetch)).toHaveLength(0);
});

it('a failed fingerprint read on content change retains the previously known URL but withdraws outdated certainty', async () => {
  const { fetch, setReadFails } = publishedRoute();
  const view = await openShare();
  expect(screen.getByRole('button', { name: /update link/i })).toBeEnabled();
  setReadFails(true);
  view.rerender(<CollabProvider value={collab}><FileViewer {...props} file={{ ...props.file, mtime: 2 }} /></CollabProvider>);
  await waitFor(() => expect(fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && !init?.method).length).toBeGreaterThanOrEqual(3));
  await waitFor(() => expect(screen.queryByRole('button', { name: /update link/i })).toBeNull());
  expect(screen.getByText(publication.url)).toBeTruthy();
  expect(screen.getByRole('button', { name: /copy share link/i })).toBeEnabled();
  expect(posts(fetch)).toHaveLength(0);
});

it('unknown freshness keeps the existing copyable link but does not falsely label it outdated', async () => {
  const { fetch } = publishedRoute({ freshness: 'unknown' });
  await openShare();
  expect(screen.getByRole('button', { name: /copy share link/i })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /update link/i })).toBeNull();
  expect(posts(fetch)).toHaveLength(0);
});
