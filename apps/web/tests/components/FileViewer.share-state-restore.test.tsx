// @vitest-environment jsdom
// OPEND-3594: observe the real viewer at the daemon HTTP seam, independently of share-plan preflight.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { FileViewer } from '../../src/components/FileViewer';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';

const publication = { url: 'https://viewer.example.test/artifact/proj/stable', slug: 'stable', fileName: 'index.html' };
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
  }, liveHtml: '<html><body>synthetic share fixture</body></html>',
};
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function tree(next = props, workspace = context) {
  return <CollabProvider value={{ ...collab, workspaceContext: workspace }}><FileViewer {...next} /></CollabProvider>;
}
function route(read: () => Response | Promise<Response>) {
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('localOnly')) return Response.json({ freshness: 'current' });
    if (url.includes('/publish-public')) {
      if (init?.method === 'POST' || init?.method === 'DELETE') throw new Error('Restoring share state must not mutate it');
      return read();
    }
    if (url.includes('/share-plan')) return Response.json({ fileCount: 1, totalBytes: 123, exceedsSizeLimit: false, exclusions: [] });
    if (url.includes('/share-state')) return Response.json({ projectId: 'proj', hasEverShared: true, bindingExists: true,
      publications: [{ sourceFilePath: 'index.html', slug: publication.slug, status: 'active' }] });
    if (url.includes('/social-share')) return new Response('{}', { status: 503 });
    return Response.json({ deployments: [] });
  });
  vi.stubGlobal('fetch', request);
  return request;
}
async function open() {
  const view = render(tree());
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: /^share$/i })));
  return view;
}
function mutations(request: ReturnType<typeof route>) {
  return request.mock.calls.filter(([url, init]) => String(url).includes('/publish-public') && ['POST', 'DELETE'].includes(init?.method ?? 'GET'));
}


function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('opening Share joins the entry binding check instead of superseding a successful restoration with another failed read', async () => {
  const held = deferred<Response>();
  let reads = 0;
  const request = route(async () => ++reads === 1 ? (await held.promise).clone()
    : Response.json({ error: 'SHARE_STATE_UNAVAILABLE' }, { status: 503 }));
  await open();
  try {
    expect(reads).toBe(1);
    expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();
    expect(mutations(request)).toHaveLength(0);
  } finally {
    await act(async () => held.resolve(Response.json({ publication, status: 'active', freshness: 'current' })));
  }
  expect(await screen.findByText(publication.url)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy share link' })).toBeEnabled();
  expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();
  expect(mutations(request)).toHaveLength(0);
});

it('re-entering the same project checks its binding and restores the same original copy target without publication', async () => {
  const request = route(() => Response.json({ publication, status: 'active', freshness: 'current' }));
  const observed = vi.fn();
  const viewer = tree({ ...props, onObservedPublicShareLink: observed });
  const first = render(viewer);
  // Entering checks the binding before the user opens Share; no new UI is mounted.
  await waitFor(() => expect(observed).toHaveBeenCalledWith(expect.objectContaining({ url: publication.url, slug: publication.slug })));
  expect(screen.queryByRole('heading', { name: 'Share' })).toBeNull();
  first.unmount();
  observed.mockClear();
  render(viewer);
  await waitFor(() => expect(observed).toHaveBeenCalledWith(expect.objectContaining({ url: publication.url, slug: publication.slug })));
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
  expect(await screen.findByText(publication.url)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy share link' })).toBeEnabled();
  expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();
  expect(mutations(request)).toHaveLength(0);
});

it.each(['workspace', 'file', 'project'] as const)('the entry binding check cannot restore a late link from another %s', async change => {
  const held = deferred<Response>();
  let changed = false;
  let reads = 0;
  const request = route(async () => {
    ++reads;
    return changed ? Response.json({ publication: null, status: 'none', freshness: 'unknown' })
      : (await held.promise).clone();
  });
  const view = await open();
  changed = true;
  const next = change === 'project' ? { ...props, projectId: 'another-project' }
    : change === 'file' ? { ...props, file: { ...props.file, name: 'another.html', path: 'another.html' } } : props;
  const workspace = change === 'workspace' ? { ...context, workspaceId: 'another', teamId: 'another', workspaceMemberId: 'other-owner' } : context;
  view.rerender(tree(next, workspace));
  await waitFor(() => expect(reads).toBeGreaterThan(1));
  await act(async () => held.resolve(Response.json({ publication, status: 'active', freshness: 'current' })));
  expect(screen.queryByText(publication.url)).toBeNull();
  expect(mutations(request)).toHaveLength(0);
});

it('re-entering a retained file performs a fresh binding check rather than reusing a canceled entry read', async () => {
  const held = deferred<Response>();
  let fresh = false;
  let reads = 0;
  const request = route(async () => {
    ++reads;
    return fresh ? Response.json({ publication: null, status: 'none', freshness: 'unknown' })
      : (await held.promise).clone();
  });
  const view = await open();
  view.rerender(tree({ ...props, workspaceActive: false }));
  fresh = true;
  view.rerender(tree(props));
  await waitFor(() => expect(reads).toBeGreaterThan(1));
  await act(async () => held.resolve(Response.json({ publication, status: 'active', freshness: 'current' })));
  expect(screen.queryByText(publication.url)).toBeNull();
  expect(mutations(request)).toHaveLength(0);
});

// OPEND-3638 / IM-13: observe actual provider URLs, not only cleared labels.
it.each([false, true])('publishes only B after switching from shared A (B rejected: %s)', async rejected => {
  const b = { ...props, file: { ...props.file, name: 'other.html', path: 'other.html',
    artifactManifest: { ...props.file.artifactManifest!, entry: 'other.html' } } };
  const bUrl = 'https://viewer.example.test/artifact/proj/b-only';
  const writes: string[] = [];
  let bPublished = false;
  const bBinding = deferred<Response>();
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const isB = url.includes('/files/other.html/');
    if (url.includes('localOnly')) return Response.json({ freshness: 'current' });
    if (url.includes('/publish-public')) {
      if (init?.method === 'POST') {
        writes.push(url);
        if (rejected) return Response.json({ error: 'FILE_UNAVAILABLE' }, { status: 400 });
        bPublished = true;
        return Response.json({ status: 'published', url: bUrl,
          receipt: { filePath: 'other.html', slug: 'b-only', publishedAt: 1, version: 1, versionId: 'b-v1' } });
      }
      if (isB && !bPublished) return (await bBinding.promise).clone();
      return Response.json(isB
        ? { publication: bPublished ? { url: bUrl, slug: 'b-only', fileName: 'other.html' } : null,
          status: bPublished ? 'active' : 'none', freshness: 'current' }
        : { publication, status: 'active', freshness: 'current' });
    }
    if (url.includes('/share-state')) return Response.json({ projectId: 'proj', hasEverShared: true, bindingExists: true,
      publications: [{ sourceFilePath: 'index.html', slug: publication.slug, status: 'active' }] });
    if (url.includes('/social-share')) return new Response('{}', { status: 503 });
    return Response.json({ deployments: [] });
  }));
  const view = await open();
  expect(await screen.findByText(publication.url)).toBeVisible();
  view.rerender(tree(b));
  expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();
  expect(screen.queryByText(publication.url)).toBeNull();
  // A's link must disappear immediately, while B's unknown state cannot publish.
  await act(async () => bBinding.resolve(Response.json({ publication: null, status: 'none', freshness: 'current' })));
  const generate = await screen.findByRole('menuitem', { name: /generate and copy link/i });
  expect(generate).toBeEnabled();
  await act(async () => fireEvent.click(generate));
  await waitFor(() => expect(writes).toEqual(['/api/projects/proj/files/other.html/publish-public']));
  if (!rejected) await waitFor(() => expect(copy).toHaveBeenCalledWith(bUrl));
  else expect(copy).not.toHaveBeenCalled();
  view.rerender(tree());
  expect(await screen.findByText(publication.url)).toBeVisible();
  expect(writes).toHaveLength(1);
});

it('OPEND-4105 failed state lookup offers a read-only retry and never infers an unpublished file', async () => {
  let failed = true;
  const request = route(() => failed ? Response.json({ error: 'SHARE_STATE_UNAVAILABLE' }, { status: 503 })
    : Response.json({ publication, status: 'active', freshness: 'current' }));
  await open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete the sharing check');
  expect(screen.queryByRole('menuitem', { name: /generate and copy link/i })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(publication.url)).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mutations(request)).toHaveLength(0);
});
