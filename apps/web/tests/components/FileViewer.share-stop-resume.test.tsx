// @vitest-environment jsdom
// Owner S4: stop and reopen a share inside one still-open Share panel, over the daemon DELETE/POST/GET wire.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { FileViewer } from '../../src/components/FileViewer';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';

const publication = { url: 'https://example.invalid/artifact/proj/stable', slug: 'stable', fileName: 'index.html' };
const receipt = { filePath: 'index.html', slug: publication.slug, publishedAt: 1, version: 1, versionId: 'v1' };
const unavailableLink = { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' };
const stoppedNotice = /The link is disabled/;
const unavailableText = 'Published, but the share link is temporarily unavailable.';
const reopeningText = 'Reopening…';
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
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** A daemon whose share follows its mutations: DELETE stops it, POST reopens
 * it. Like the real resume, a POST never carries the link; only a read does,
 * and `readLink` says whether this daemon has a Viewer address to give. */
function shareRoute(options: { status: 'active' | 'stopped'; readLink?: 'available' | 'unavailable' }) {
  let status = options.status;
  let readFailsAfterMutation = false;
  let mutated = false;
  let heldRead: { requested: boolean; release: () => void; released: Promise<void> } | null = null;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/integrations/vela/status')) return new Response(JSON.stringify({ loggedIn: true, loginInFlight: false, profile: 'prod', user: { id: 'owner' }, configPath: '/x' }), { status: 200 });
    if (url.includes('/share-state')) return new Response(JSON.stringify({ projectId: 'proj', hasEverShared: true, bindingExists: true, publications: [{ sourceFilePath: 'index.html', slug: publication.slug, status }] }), { status: 200 });
    if (url.includes('publish-public')) {
      if (init?.method === 'DELETE') {
        status = 'stopped'; mutated = true;
        return new Response(JSON.stringify({ ok: true, slug: publication.slug, fileName: 'index.html' }), { status: 200 });
      }
      if (init?.method === 'POST') {
        // A stopped share can only be resumed; a plain publish is rejected.
        if (status === 'stopped' && init.body !== JSON.stringify({ mode: 'resume' })) {
          return new Response(JSON.stringify({ error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE', failure: { stage: 'snapshot', reason: 'unknown' } }), { status: 502 });
        }
        status = 'active'; mutated = true;
        return new Response(JSON.stringify({ status: 'published', receipt, link: unavailableLink }), { status: 200 });
      }
      if (mutated && heldRead) {
        heldRead.requested = true;
        await heldRead.released;
      }
      if (mutated && readFailsAfterMutation) return new Response(JSON.stringify({ error: 'SHARE_STATE_UNAVAILABLE' }), { status: 503 });
      if (status === 'active' && options.readLink === 'unavailable') {
        return new Response(JSON.stringify({ publication: null, link: unavailableLink, slug: publication.slug, status, freshness: 'unknown' }), { status: 200 });
      }
      return new Response(JSON.stringify({ publication, status, freshness: 'current' }), { status: 200 });
    }
    if (url.includes('/social-share')) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    failReadsAfterMutation: () => { readFailsAfterMutation = true; },
    /** Keeps the read that follows a mutation unanswered until `release()`. */
    holdReadsAfterMutation: () => {
      let release = () => {};
      const released = new Promise<void>((resolve) => { release = resolve; });
      const held = { requested: false, release, released };
      heldRead = held;
      return held;
    },
  };
}
function writes(fetch: ReturnType<typeof vi.fn>, method: 'POST' | 'DELETE') {
  return fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && init?.method === method);
}
async function openSharePanel() {
  render(<CollabProvider value={collab}><FileViewer {...props} /></CollabProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  return screen.findByRole('switch', { name: /link access/i });
}
async function openStoppedSharePanel() {
  const linkAccess = await openSharePanel();
  await screen.findByText(stoppedNotice);
  await waitFor(() => expect(linkAccess).toBeEnabled());
  return linkAccess;
}

it('a share stopped inside the panel shows as stopped and reopens from the same panel', async () => {
  const { fetch } = shareRoute({ status: 'active' });
  const linkAccess = await openSharePanel();
  await screen.findByText(publication.url);
  await act(async () => fireEvent.click(linkAccess));
  await waitFor(() => expect(writes(fetch, 'DELETE')).toHaveLength(1));

  expect(await screen.findByText(stoppedNotice)).toBeVisible();
  expect(linkAccess).toHaveAttribute('aria-checked', 'false');
  expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();

  await waitFor(() => expect(linkAccess).toBeEnabled());
  await act(async () => fireEvent.click(linkAccess));
  await waitFor(() => expect(writes(fetch, 'POST')).toHaveLength(1));
  expect(writes(fetch, 'POST')[0]?.[1]?.body).toBe(JSON.stringify({ mode: 'resume' }));
  expect(await screen.findByText(publication.url)).toBeVisible();
});

it('a resumed share shows its link at once although the resume response carries none', async () => {
  const { fetch } = shareRoute({ status: 'stopped' });
  const linkAccess = await openStoppedSharePanel();
  await act(async () => fireEvent.click(linkAccess));
  await waitFor(() => expect(writes(fetch, 'POST')).toHaveLength(1));

  expect(await screen.findByText(publication.url)).toBeVisible();
  expect(linkAccess).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByText(stoppedNotice)).toBeNull();
  expect(screen.queryByText(unavailableText)).toBeNull();
});

it.each([
  ['the re-read has no link either', 'unavailable', false],
  ['the re-read fails', 'available', true],
] as const)('a resumed share whose link is unavailable says so without an error when %s', async (_label, readLink, readFails) => {
  const route = shareRoute({ status: 'stopped', readLink });
  if (readFails) route.failReadsAfterMutation();
  const linkAccess = await openStoppedSharePanel();
  await act(async () => fireEvent.click(linkAccess));
  await waitFor(() => expect(writes(route.fetch, 'POST')).toHaveLength(1));

  expect(await screen.findByText(unavailableText)).toBeVisible();
  await waitFor(() => expect(screen.queryByText(stoppedNotice)).toBeNull());
  expect(linkAccess).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/Could not create the share link/i)).toBeNull();
  expect(screen.queryByText(publication.url)).toBeNull();
});

it.each([
  ['a link', 'available', false, publication.url],
  ['no link', 'unavailable', false, unavailableText],
  ['a failure', 'available', true, unavailableText],
] as const)('a resumed share stays busy, not "link unavailable", until its re-read settles with %s', async (_label, readLink, readFails, settledText) => {
  const route = shareRoute({ status: 'stopped', readLink });
  if (readFails) route.failReadsAfterMutation();
  const reRead = route.holdReadsAfterMutation();
  const linkAccess = await openStoppedSharePanel();
  await act(async () => fireEvent.click(linkAccess));
  await waitFor(() => expect(writes(route.fetch, 'POST')).toHaveLength(1));
  await waitFor(() => expect(reRead.requested).toBe(true));
  await act(async () => { await Promise.resolve(); });

  expect(screen.queryByText(unavailableText)).toBeNull();
  expect(screen.getByText(reopeningText)).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();

  await act(async () => reRead.release());

  expect(await screen.findByText(settledText)).toBeVisible();
  await waitFor(() => expect(screen.queryByText(reopeningText)).toBeNull());
  expect(linkAccess).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByText(stoppedNotice)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
