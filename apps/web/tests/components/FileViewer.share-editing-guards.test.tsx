// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { FileViewer } from '../../src/components/FileViewer';
import { invalidateHtmlSourceSnapshotProject } from '../../src/components/html-source-snapshot-cache';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import type { PreviewComment } from '../../src/types';
vi.mock('../../src/components/BoardComposerPopover', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/components/BoardComposerPopover')>();
  return { ...original, BoardComposerPopover: (props: { draft: string; onDraft: (value: string) => void; onSaveComment: () => void;
    onAddDraft: () => void; onAttachImages: (files: File[]) => void; onRemoveImage: (index: number) => void }) => <div>
    <button data-testid="probe-queue" onClick={props.onAddDraft}>Queue</button>
    <button data-testid="probe-attach" onClick={() => props.onAttachImages([new File(['image'], 'new.png', { type: 'image/png' })])}>Attach</button>
    <button data-testid="probe-remove-image" onClick={() => props.onRemoveImage(0)}>Remove image</button>
    <input data-testid="probe-draft" value={props.draft} onChange={event => props.onDraft(event.target.value)} />
    <button data-testid="probe-save" onClick={props.onSaveComment}>Save</button>
  </div> };
});
const uuid = '12345678-1234-4234-8234-123456789abc';
const original = '<html><body><h2 data-od-id="tool">Target</h2></body></html>';
const prepared = original.replace('<h2 ', `<h2 data-od-comment-id="${uuid}" `);
const context: WorkspaceCollabContext = { workspaceId: 'ws', workspaceType: 'team', workspaceMemberId: 'owner', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }), permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
const collab: CollabContextValue = { workspaceContext: context, workspaceContextLoading: false, enabled: false, member: null, present: [], publishedVersion: null, syncState: null, viewerOnly: false, writerAuthority: 'allowed', isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false, ownerDisplayName: null, ownerRole: null, downloadPending: false, reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {} };
const target = { elementId: 'tool', selector: '[data-od-id="tool"]', label: 'h2', text: 'Target', htmlHint: '<h2>', position: { x: 20, y: 30, width: 100, height: 40 } };
let projectSequence = 0;
let currentProjectId = '';
function setup(options: { history?: PreviewComment[]; currentPrepared?: boolean; activePublication?: boolean; stoppedPublication?: boolean } = {}) {
  const projectId = currentProjectId = `barrier-project-${++projectSequence}`;
  let editedSource: string | null = null;
  let publicationCurrent = false;
  let mtime = 1;
  const currentSource = () => editedSource ?? (options.currentPrepared ? prepared : original);
  let delayedPlan = false;
  let releasePlan!: () => void;
  const plan = new Promise<void>(resolve => { releasePlan = resolve; });
  const writes = vi.fn();
  const saveComment = vi.fn();
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url, 'http://localhost').pathname;
    if (path.endsWith('/share-plan')) { if (delayedPlan) await plan; return Response.json({ blockers: [], exceedsSizeLimit: false }); }
    if (init?.method === 'POST') writes(path);
    if (path.endsWith('/raw/index.html') || path.endsWith('/files/index.html')) return new Response(currentSource());
    if (path.endsWith('/share-state')) return Response.json({ hasEverShared: Boolean(options.activePublication), bindingExists: Boolean(options.activePublication), publications: [] });
    if (path.endsWith('/publish-public')) {
      if (init?.method === 'POST') {
        publicationCurrent = true;
        return Response.json({ status: 'published', url: 'https://example.invalid/stable', receipt: { filePath: 'index.html', slug: 'stable', publishedAt: 2, version: options.stoppedPublication ? 1 : 2, versionId: options.stoppedPublication ? 'cloud-v1' : 'cloud-v2' } });
      }
      return Response.json(options.activePublication ? { status: options.stoppedPublication && !publicationCurrent ? 'stopped' : 'active', freshness: publicationCurrent ? 'current' : 'outdated', publication: { url: 'https://example.invalid/stable', slug: 'stable', fileName: 'index.html' } } : { status: 'none', freshness: 'unknown' });
    }
    if (path.endsWith('/integrations/vela/status')) return Response.json({ loggedIn: true, user: { id: 'owner' } });
    return Response.json({});
  });
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('crypto', webcrypto);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const tree = () => <CollabProvider value={collab}><FileViewer projectId={projectId} projectKind="prototype" file={{ name: 'index.html', path: 'index.html', type: 'file', kind: 'html', mime: 'text/html', size: 100, mtime }} previewComments={options.history?.map(comment => ({ ...comment, projectId }))} onSavePreviewComment={saveComment} /></CollabProvider>;
  const view = render(tree());
  const saveB = () => { editedSource = prepared.replace('Target', 'Edited B'); mtime++; view.rerender(tree()); };
  return { writes, saveComment, fetcher, saveB, delayPlan: () => { delayedPlan = true; }, releasePlan };
}
async function acknowledge() {
  const frame = await screen.findByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
      data: { type: 'od:url-selection-bridge-ready', href: frame.src } }));
  });
  return frame;
}
async function selectLegacy(override: Partial<typeof target> = {}) {
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 800 });
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 1000 });
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type: 'od:comment-target', ...target, ...override } })));
  return frame;
}
afterEach(() => { cleanup(); invalidateHtmlSourceSnapshotProject(currentProjectId); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(['comment-draft', 'manual-edit'] as const)('R2 delayed first-publication plan must refuse live %s after successful receipt/witness', async change => {
  const { writes, delayPlan, releasePlan } = setup({ currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  delayPlan();
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const generate = await screen.findByRole('menuitem', { name: 'Generate and copy link' });
  await waitFor(() => expect(generate).toBeEnabled()); fireEvent.click(generate);
  if (change === 'comment-draft') {
    await selectLegacy();
    fireEvent.change(await screen.findByTestId('probe-draft'), { target: { value: 'New unsaved comment' } });
  } else {
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true'));
  }
  await act(async () => releasePlan());
  expect(writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(0);
  if (change === 'comment-draft') expect(screen.getByTestId('probe-draft')).toHaveValue('New unsaved comment');
});
it.each(['pending', 'comment-draft', 'manual-edit', 'ready'] as const)('static Update from current %s requires settled edits but not a comment preview witness', async state => {
  const route = setup({ activePublication: true, currentPrepared: true });
  await waitFor(() => expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).src).toContain('index.html'));
  if (state !== 'pending') {
    await acknowledge();
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  }
  if (state === 'comment-draft') {
    await selectLegacy();
    fireEvent.change(await screen.findByTestId('probe-draft'), { target: { value: 'Already unsettled before Update' } });
  }
  if (state === 'manual-edit') {
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true'));
  }
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const update = await screen.findByRole('button', { name: /update link/i });
  await waitFor(() => expect(update).toBeEnabled());
  await act(async () => fireEvent.click(update));
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(state === 'ready' || state === 'pending' ? 1 : 0);
  if (state === 'comment-draft') expect(screen.getByTestId('probe-draft')).toHaveValue('Already unsettled before Update');
  if (state === 'manual-edit') expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
});
it.each(['initially-lost', 'saved', 'typed', 'cleared', 'whitespace-edit', 'fresh-image', 'removed-image', 'queued'] as const)(
  'strict-lost saved row: normal Update distinguishes %s work from persisted prefill', async state => {
  const lost: PreviewComment = { ...target, id: 'lost', projectId: 'p', conversationId: 'c', filePath: 'index.html',
    elementId: `cmt:${uuid}`, selector: `[data-od-comment-id="${uuid}"]`, note: 'Saved feedback', status: 'open', createdAt: 1, updatedAt: 1 };
  const route = setup({ activePublication: true, history: [lost] });
  const frame = await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const dispatch = async (data: object) => { await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }))); };
  const liveTarget = { ...target, elementId: lost.elementId, selector: lost.selector };
  if (state !== 'initially-lost') await dispatch({ type: 'od:comment-targets', targets: [liveTarget] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  if (state !== 'initially-lost') {
    await dispatch({ ...liveTarget, type: 'od:comment-active-target-update' });
    expect(screen.getByTestId('comment-active-pin')).toBeInTheDocument();
  }
  if (state === 'typed' || state === 'cleared' || state === 'whitespace-edit') {
    fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: state === 'typed' ? 'Actual unsaved edit' : state === 'cleared' ? '' : `${lost.note} ` } });
  }
  if (state === 'fresh-image' || state === 'removed-image') {
    fireEvent.click(screen.getByTestId('probe-attach'));
    if (state === 'removed-image') fireEvent.click(screen.getByTestId('probe-remove-image'));
  }
  if (state === 'queued') fireEvent.click(screen.getByTestId('probe-queue'));
  await dispatch({ type: 'od:comment-targets', targets: [] });
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('anchor lost');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const update = await screen.findByRole('button', { name: /update link/i });
  await waitFor(() => expect(update).toBeEnabled());
  await act(async () => fireEvent.click(update));
  const settled = state === 'initially-lost' || state === 'saved' || state === 'removed-image';
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(settled ? 1 : 0);
  expect(screen.queryByTestId('comment-identity-preparation')).toBeNull();
  expect(screen.queryByTestId('comment-identity-revalidate')).toBeNull();
  expect(screen.queryByTestId('probe-draft')).toBeNull(); // No visible composer after strict loss.
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('anchor lost');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(route.writes.mock.calls.some(call => String(call[0]).endsWith('/comment-identities/prepare'))).toBe(false);
});
