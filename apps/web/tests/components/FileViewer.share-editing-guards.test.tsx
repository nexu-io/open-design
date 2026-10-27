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
  return { ...original, BoardComposerPopover: (props: { draft: string; onDraft: (value: string) => void; onSaveComment: () => void; onSendBatch: () => void;
    onAddDraft: () => void; onAttachImages: (files: File[]) => void; onRemoveImage: (index: number) => void }) => <div>
    <button data-testid="probe-queue" onClick={props.onAddDraft}>Queue</button>
    <button data-testid="probe-attach" onClick={() => props.onAttachImages([new File(['image'], 'new.png', { type: 'image/png' })])}>Attach</button>
    <button data-testid="probe-remove-image" onClick={() => props.onRemoveImage(0)}>Remove image</button>
    <input data-testid="probe-draft" value={props.draft} onChange={event => props.onDraft(event.target.value)} />
    <button data-testid="probe-send" onClick={props.onSendBatch}>Send</button>
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
function setup(options: { history?: PreviewComment[]; currentPrepared?: boolean; activePublication?: boolean; stoppedPublication?: boolean; srcdoc?: boolean } = {}) {
  const projectId = currentProjectId = `barrier-project-${++projectSequence}`;
  let editedSource: string | null = null;
  let publicationCurrent = false;
  let mtime = 1;
  let filesRefreshKey = 0;
  const currentSource = () => editedSource ?? (options.currentPrepared ? prepared : original);
  let delayedPlan = false;
  let releasePlan!: () => void;
  const plan = new Promise<void>(resolve => { releasePlan = resolve; });
  const writes = vi.fn();
  const saveComment = vi.fn();
  const sendComments = vi.fn().mockResolvedValue({ status: 'rejected', commentIds: [] });
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
  const tree = () => <CollabProvider value={collab}><FileViewer projectId={projectId} projectKind="prototype" isDeck={options.srcdoc} liveHtml={options.srcdoc ? currentSource() : undefined} filesRefreshKey={filesRefreshKey} file={{ name: 'index.html', path: 'index.html', type: 'file', kind: 'html', mime: 'text/html', size: 100, mtime }} previewComments={options.history?.map(comment => ({ ...comment, projectId }))} onSendBoardCommentAttachments={sendComments} onSavePreviewComment={saveComment} /></CollabProvider>;
  const view = render(tree());
  const saveB = () => { editedSource = prepared.replace('Target', 'Edited B'); mtime++; view.rerender(tree()); };
  return { writes, saveComment, sendComments, fetcher, saveB, refreshFiles: () => { filesRefreshKey++; saveB(); }, delayPlan: () => { delayedPlan = true; }, releasePlan };
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
it.each(['comment-draft', 'manual-edit'] as const)('delayed first publication ignores comment drafts but refuses manual editing (%s)', async change => {
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
  expect(writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(change === 'comment-draft' ? 1 : 0);
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
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(state !== 'manual-edit' ? 1 : 0);
  if (state === 'comment-draft') expect(screen.getByTestId('probe-draft')).toHaveValue('Already unsettled before Update');
  if (state === 'manual-edit') expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
});
it.each(['initially-lost', 'saved', 'typed', 'cleared', 'whitespace-edit', 'fresh-image', 'removed-image', 'queued'] as const)(
  'Update is independent of comment composer state (%s)', async state => {
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
  if (!['typed', 'cleared', 'fresh-image', 'queued'].includes(state)) expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const update = await screen.findByRole('button', { name: /update link/i });
  await waitFor(() => expect(update).toBeEnabled());
  await act(async () => fireEvent.click(update));
  const settled = true;
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(settled ? 1 : 0);
  expect(screen.queryByTestId('comment-identity-preparation')).toBeNull();
  expect(screen.queryByTestId('comment-identity-revalidate')).toBeNull();
  if (['typed', 'cleared', 'fresh-image', 'queued'].includes(state)) expect(screen.getByTestId('probe-draft')).toBeInTheDocument();
  else expect(screen.queryByTestId('probe-draft')).toBeNull();
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('anchor lost');
  if (!['typed', 'cleared', 'fresh-image', 'queued'].includes(state)) expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(route.writes.mock.calls.some(call => String(call[0]).endsWith('/comment-identities/prepare'))).toBe(false);
});

it('updates a published file after a settled file-watch change while the comment panel stays open', async () => {
  const route = setup({ activePublication: true, currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await act(async () => route.refreshFiles());
  await waitFor(() => expect(route.fetcher.mock.calls.some(([input]) => String(input).includes('/raw/index.html'))).toBe(true));
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const update = await screen.findByRole('button', { name: /update link/i });
  await waitFor(() => expect(update).toBeEnabled());
  await act(async () => fireEvent.click(update));
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(1);
});

it('refreshes the preview with an unsaved comment and allows Update without submitting the draft', async () => {
  const route = setup({ activePublication: true, currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = await selectLegacy();
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'Keep my draft' } });
  const before = frame.src;
  await act(async () => route.refreshFiles());
  await waitFor(() => expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).src).not.toBe(before));
  await waitFor(() => expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).src).toContain('fr=1'));
  expect(screen.getByTestId('probe-draft')).toHaveValue('Keep my draft');
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const update = await screen.findByRole('button', { name: /update link/i });
  await act(async () => fireEvent.click(update));
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(1);
  expect(route.saveComment).not.toHaveBeenCalled();
});

it.each(['present', 'missing'] as const)('validates the current selector at save, retaining the draft when %s', async state => {
  const route = setup({ activePublication: true, currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = await selectLegacy();
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'Keep my draft' } });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((data: unknown) => {
    const request = data as { validateForSave?: boolean; requestId?: string };
    if (!request.validateForSave) return;
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: state === 'missing'
      ? { type: 'od:comment-location-missing', documentVersion: `url:${frame.src}`, requestId: request.requestId }
      : { ...target, requestedSelector: target.selector, elementId: 'replacement', text: 'Changed text', type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } })));
  });
  await act(async () => fireEvent.click(screen.getByTestId('probe-save')));
  if (state === 'present') {
    expect(route.saveComment).toHaveBeenCalledWith(expect.objectContaining({ elementId: 'replacement', text: 'Changed text', selector: target.selector }), 'Keep my draft', false, [], undefined);
  } else {
    expect(route.saveComment).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-draft')).toHaveValue('Keep my draft');
    expect(await screen.findByText(/comment target no longer exists/i)).toBeInTheDocument();
    await selectLegacy({ elementId: 'another', selector: '[data-od-id="another"]' });
    expect(screen.getByTestId('probe-draft')).toHaveValue('Keep my draft');
  }
  post.mockRestore();
});

it('refreshes srcdoc while the comment panel is open and retains typed feedback', async () => {
  const route = setup({ currentPrepared: true, srcdoc: true });
  const frame = await screen.findByTestId('artifact-preview-frame') as HTMLIFrameElement;
  expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await selectLegacy();
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'Draft during source refresh' } });
  await act(async () => route.refreshFiles());
  await waitFor(() => expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toContain('Edited B'));
  expect(screen.getByTestId('probe-draft')).toHaveValue('Draft during source refresh');
});

it('allows Update while a comment save is waiting for the frame', async () => {
  const route = setup({ activePublication: true, currentPrepared: true });
  await acknowledge(); fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = await selectLegacy();
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'Keep my draft' } });
  let requestId = '';
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((data: unknown) => {
    const request = data as { validateForSave?: boolean; requestId?: string };
    if (request.validateForSave) requestId = request.requestId!;
  });
  fireEvent.click(screen.getByTestId('probe-save'));
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const update = await screen.findByRole('button', { name: /update link/i });
  await act(async () => fireEvent.click(update));
  expect(route.writes.mock.calls.filter(call => String(call[0]).endsWith('/publish-public'))).toHaveLength(1);
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { type: 'od:comment-location-missing', documentVersion: `url:${frame.src}`, requestId } })));
  expect(route.saveComment).not.toHaveBeenCalled();
});

it('retains the comment draft across an active URL-frame reload with unchanged content', async () => {
  setup({ activePublication: true, currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = await selectLegacy();
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'Draft survives reload' } });
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { type: 'od:pod-stroke', points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] } })));
  fireEvent.load(frame);
  await acknowledge();
  expect(screen.getByTestId('probe-draft')).toHaveValue('Draft survives reload');
});

it.each(['present', 'missing'] as const)('validates the live target before sending a draft to chat (%s)', async state => {
  const route = setup({ currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = await selectLegacy();
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'Keep draft' } });
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((data: unknown) => {
    const request = data as { validateForSave?: boolean; requestId: string };
    if (!request.validateForSave) return;
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
      data: state === 'missing' ? { type: 'od:comment-location-missing', documentVersion: `url:${frame.src}`, requestId: request.requestId }
        : { ...target, text: 'Current replacement', style: { color: 'blue' }, slideIndex: 3,
          requestedSelector: target.selector, type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } })));
  });
  await act(async () => fireEvent.click(screen.getByTestId('probe-send')));
  if (state === 'missing') {
    expect(route.sendComments).not.toHaveBeenCalled();
    expect(await screen.findByText(/comment target no longer exists/i)).toBeInTheDocument();
  } else {
    expect(route.sendComments).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(route.sendComments.mock.calls[0])).toContain('Current replacement');
    expect(JSON.stringify(route.sendComments.mock.calls[0])).toContain('blue');
  }
  expect(screen.getByTestId('probe-draft')).toHaveValue('Keep draft');
});

it.each(['save', 'send'] as const)('keeps file-level comment %s independent of DOM validation', async action => {
  const route = setup({ currentPrepared: true });
  await acknowledge();
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = await selectLegacy({ elementId: 'file-comment-existing', selector: 'html' });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  fireEvent.change(screen.getByTestId('probe-draft'), { target: { value: 'File feedback' } });
  await act(async () => fireEvent.click(screen.getByTestId(action === 'save' ? 'probe-save' : 'probe-send')));
  expect(action === 'save' ? route.saveComment : route.sendComments).toHaveBeenCalledTimes(1);
  expect(post.mock.calls.some(([message]) => message?.validateForSave)).toBe(false);
});
