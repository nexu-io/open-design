// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { FileViewer } from '../../src/components/FileViewer';
import { invalidateHtmlSourceSnapshotProject } from '../../src/components/html-source-snapshot-cache';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
const source = '<html><body><h2>Authored target</h2></body></html>';
const context: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'team', workspaceMemberId: 'owner', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const collab: CollabContextValue = {
  workspaceContext: context, workspaceContextLoading: false, enabled: false, member: null,
  present: [], publishedVersion: null, syncState: null, viewerOnly: false, writerAuthority: 'allowed',
  isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false, ownerDisplayName: null,
  ownerRole: null, downloadPending: false, reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {},
};
function setup(options: { readonly?: boolean; streaming?: boolean; fail?: boolean; success?: boolean; bom?: boolean; proofUnavailable?: boolean } = {}) {
  const writes = vi.fn();
  let serverSource = (options.bom ? '\uFEFF' : '') + source;
  const preparedSource = serverSource.replace('<h2>', '<h2 data-od-comment-id="12345678-1234-4234-8234-123456789abc">');
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST' && !url.endsWith('/share-plan')) writes(url, init);
    if (url.includes('comment-identities/prepare')) {
      if (!options.success) return Response.json({ error: { code: 'COMMENT_VERSION_UNCONFIRMED' } }, { status: 500 });
      serverSource = preparedSource;
      return Response.json({ source: preparedSource, changed: true, preparedTargets: 1, version: { id: 'source-version-2', version: 2 } });
    }
    const pathname = new URL(url, 'http://localhost').pathname;
    if (pathname.endsWith('/versions')) return options.proofUnavailable
      ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ versions: [] });
    if (pathname.endsWith('/raw/index.html') || pathname.endsWith('/files/index.html')) return new Response(serverSource);
    if (url.includes('/integrations/vela/status')) return Response.json({ loggedIn: true, user: { id: 'owner' } });
    return Response.json({});
  });
  vi.stubGlobal('fetch', fetcher);
  const tree = (streaming = Boolean(options.streaming)) => <CollabProvider value={{ ...collab, viewerOnly: Boolean(options.readonly) }}>
    <FileViewer projectId="prep-project" projectKind="prototype" file={{ name: 'index.html', path: 'index.html', type: 'file', kind: 'html', mime: 'text/html', size: 100, mtime: 1 }} streaming={streaming} viewerOnly={Boolean(options.readonly)} />
  </CollabProvider>;
  const view = render(tree());
  return { writes, fetcher, setStreaming: (value: boolean) => view.rerender(tree(value)) };
}

afterEach(() => { cleanup(); invalidateHtmlSourceSnapshotProject('prep-project'); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([false, true])('viewing and enabling comments has no preparation dialog, status, retry or version reads (readonly=%s)', async readonly => {
  const { writes, fetcher } = setup({ readonly, proofUnavailable: true });
  await waitFor(() => expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).src).toContain('index.html'));
  expect(screen.queryByTestId('comment-identity-preparation')).toBeNull();
  expect(screen.queryByTestId('comment-identity-revalidate')).toBeNull();
  expect(screen.queryByRole('button', { name: /Prepare static comments/ })).toBeNull();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(screen.getByTestId('comment-panel-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(writes).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/versions'))).toBe(false);
});

it('one share click publishes without preparation even when the obsolete preparation/version endpoints would fail', async () => {
  const { writes } = setup({ proofUnavailable: true });
  await waitFor(() => expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).src).toContain('index.html'));
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const generate = await screen.findByRole('menuitem', { name: 'Generate and copy link' });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);
  await waitFor(() => expect(writes.mock.calls.some(([url]) => String(url).endsWith('/publish-public'))).toBe(true));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.queryByTestId('comment-identity-preparation')).toBeNull();
  expect(screen.queryByTestId('comment-identity-revalidate')).toBeNull();
  expect(writes.mock.calls.some(([url]) => String(url).endsWith('/comment-identities/prepare'))).toBe(false);
});
