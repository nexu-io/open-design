// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

const personal: CollabContextValue = {
  workspaceContext: null, workspaceContextLoading: false, enabled: false,
  member: null, present: [], publishedVersion: null, syncState: 'synced', viewerOnly: false,
  writerAuthority: 'allowed', isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false,
  ownerDisplayName: null, ownerRole: null, downloadPending: false,
  reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {},
};
const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100,
  mtime: 1, kind: 'html', mime: 'text/html' };
const uuid = '8b9f8213-bad2-45cd-adf3-81fd2770cf35';
const comment: PreviewComment = {
  id: 'personal-comment', projectId: 'p', conversationId: 'c', filePath: file.name,
  elementId: `cmt:${uuid}`, selector: `[data-od-comment-id="${uuid}"]`, label: 'p', text: 'Target',
  htmlHint: '<p>Target</p>', position: { x: 0, y: 0, width: 193, height: 29 },
  note: 'Personal feedback', status: 'open', createdAt: 1, updatedAt: 1,
};
const html = `<html><body><p data-od-comment-id="${uuid}">Target</p></body></html>`;
const tree = (currentFile = file, content = html, comments = [comment], enabled = false) => <CollabProvider value={enabled ? { ...personal, enabled: true, publishedVersion: 2 } : personal}>
  <FileViewer projectId="p" projectKind="prototype" file={currentFile} liveHtml={content} previewComments={comments} />
</CollabProvider>;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
async function setup(transport: 'url' | 'srcdoc' = 'url', enabled = false, comments = [comment]) {
  if (transport === 'srcdoc') window.history.replaceState(null, '', '/?forceInline=1');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const view = render(tree(file, html, comments, enabled));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 600 });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const dispatch = async (data: object, source: MessageEventSource | null = frame.contentWindow) => {
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { source, data })); });
  };
  // Model bridge readiness only from the currently committed URL document.
  expect(frame).toHaveAttribute('data-od-render-mode', transport === 'url' ? 'url-load' : 'srcdoc');
  if (transport === 'url') await dispatch({ type: 'od:url-selection-bridge-ready', href: frame.src });
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(screen.getByTestId('artifact-preview-frame')).toBe(frame);
  const target = { ...comment, position: { x: 57, y: 1801, width: 193, height: 29 } };
  return { view, frame, post, dispatch, target };
}
it('Personal: explicitly locates a cmt row and scrolls an untagged URL reply only for the current target', async () => {
  const { post, dispatch, target } = await setup();
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toMatchObject({ type: 'od:comment-active-target', locate: true,
    elementId: comment.elementId, selector: comment.selector, requestId: expect.any(String) });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ ...target, selector: 'p', type: 'od:comment-active-target-update' });
  await dispatch({ ...target, elementId: 'cmt:11111111-1111-4111-8111-111111111111', type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post).toHaveBeenCalledWith({ type: 'od:preview-scroll-by', left: 0, top: 1515.5 }, '*');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { ...target.position, y: 80 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ left: '57px', top: '80px' });
  expect(screen.getByTestId('comment-popover-input')).toHaveValue(comment.note);
  const count = post.mock.calls.filter(call => call[0]?.locate).length;
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(count + 1);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  const latest = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  await dispatch({ type: 'od:comment-location-missing', requestId: latest.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
});
it.each(['missing', 'duplicate', 'wrong-selector'] as const)('Personal: %s cmt identity never uses saved position or text as a highlight', async kind => {
  const { post, dispatch, target } = await setup();
  const targets = kind === 'missing' ? [{ ...target, elementId: 'legacy', selector: 'p' }]
    : kind === 'duplicate' ? [target, target] : [{ ...target, selector: 'p' }];
  await dispatch({ type: 'od:comment-targets', targets });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('anchor lost');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId(`comment-saved-marker-${comment.elementId}`)).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId(`comment-saved-marker-${comment.elementId}`)).toBeNull();
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
});
it('Personal: srcDoc acknowledgement is request-scoped and cannot reveal after a file boundary', async () => {
  const { view, post, dispatch, target } = await setup('srcdoc');
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId,
    position: { ...target.position, y: 80 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '80px' });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  view.rerender(tree({ ...file, name: 'other.html', path: 'other.html' }, html.replace('Target', 'Other')));
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
});
it('Personal: waits for the active frame target report and marker selection also requests live location', async () => {
  const { post, dispatch, target } = await setup();
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(0);
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  await dispatch({ type: 'od:comment-location-missing', requestId: 'unwitnessed' });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  const foreignFrame = document.createElement('iframe');
  document.body.appendChild(foreignFrame);
  try {
    await dispatch({ type: 'od:comment-targets', targets: [target] }, foreignFrame.contentWindow);
    await dispatch({ ...target, type: 'od:comment-active-target-update' }, foreignFrame.contentWindow);
    expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(0);
    expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  } finally { foreignFrame.remove(); }
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId,
    position: { ...target.position, y: 80 } });
  fireEvent.click(screen.getByTestId(`comment-saved-marker-${comment.elementId}`));
  expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(2);
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
});
it('Personal: preserves legacy row selection without adding a live-locate request', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const legacy = { ...comment, elementId: 'legacy', selector: 'p' };
  render(tree(file, html, [legacy]));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(0);
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '0px' });
});
it.each([false, true])('URL locate (collab=%s): consumes an initially visible reply, not later owner scrolling', async enabled => {
  const { post, dispatch, target } = await setup('url', enabled);
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { ...target.position, y: 80 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '80px' });
  // A later tracking box follows the owner's scroll, not another locate intent.
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '1801px' });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const repeated = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(repeated.requestId).not.toBe(request.requestId);
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(1);
  expect(post).toHaveBeenCalledWith({ type: 'od:preview-scroll-by', left: 0, top: 1515.5 }, '*');
});
it.each([false, true])('URL locate (collab=%s): invalid/stale/unmeasurable replies do not consume initial locate', async enabled => {
  const { frame, post, dispatch, target } = await setup('url', enabled);
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { ...target.position, width: 0 } });
  await dispatch({ ...target, type: 'od:comment-active-target-update', elementId: 'wrong-target' });
  await dispatch({ ...target, type: 'od:comment-active-target-update', selector: 'p' });
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: 'stale-request' });
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 0 });
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { ...target.position, y: 80 } });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 600 });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post).toHaveBeenCalledWith({ type: 'od:preview-scroll-by', left: 0, top: 1515.5 }, '*');
});
it('Personal: an unresolved request cannot reveal through a later valid report; a fresh selection can locate', async () => {
  const { post, dispatch, target } = await setup();
  await dispatch({ type: 'od:comment-targets', targets: [] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const unresolved = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(unresolved).toBeDefined();
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('anchor lost');
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: unresolved.requestId });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const current = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(current.requestId).not.toBe(unresolved.requestId);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: unresolved.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: current.requestId,
    position: { ...target.position, y: 80 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '80px' });
});
it('Personal: changing a pending selection prevents old tagged or untagged replies from revealing it', async () => {
  const nextComment = { ...comment, id: 'next-comment', elementId: 'cmt:11111111-1111-4111-8111-111111111111',
    selector: '[data-od-comment-id="11111111-1111-4111-8111-111111111111"]', note: 'Next feedback' };
  const { post, dispatch, target } = await setup('url', false, [comment, nextComment]);
  const nextTarget = { ...nextComment, position: { ...target.position, x: 100, y: 120 } };
  await dispatch({ type: 'od:comment-targets', targets: [target, nextTarget] });
  const [firstRow, nextRow] = screen.getAllByTestId('comment-side-item');
  if (!firstRow || !nextRow) throw new Error('Expected both saved comment rows');
  fireEvent.click(firstRow);
  const old = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  fireEvent.click(nextRow);
  const current = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(current.requestId).not.toBe(old.requestId);
  expect(current.elementId).toBe(nextComment.elementId);
  await dispatch({ type: 'od:comment-location-missing', requestId: old.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: old.requestId });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  await dispatch({ ...nextTarget, type: 'od:comment-active-target-update' });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ left: '100px', top: '120px' });
  expect(screen.getByTestId('comment-popover-input')).toHaveValue(nextComment.note);
});
it('Personal: paired missing feedback rejects foreign/future replies, clears on repeat selection and restoration', async () => {
  const { post, dispatch, target } = await setup('srcdoc');
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  const row = screen.getByTestId('comment-side-item');
  fireEvent.click(row);
  const first = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  const foreignFrame = document.createElement('iframe');
  document.body.appendChild(foreignFrame);
  try {
    await dispatch({ type: 'od:comment-location-missing', requestId: first.requestId }, foreignFrame.contentWindow);
    await dispatch({ type: 'od:comment-location-missing', requestId: 'comment-location-999' });
    expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  } finally { foreignFrame.remove(); }
  await dispatch({ type: 'od:comment-location-missing', requestId: first.requestId });
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('anchor lost');
  fireEvent.click(row);
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  const second = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  await dispatch({ type: 'od:comment-location-missing', requestId: first.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  await dispatch({ type: 'od:comment-location-missing', requestId: second.requestId });
  expect(screen.getByTestId('comment-location-unavailable')).toBeInTheDocument();
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  // A newer authoritative index supersedes the old missing acknowledgement.
  await dispatch({ type: 'od:comment-location-missing', requestId: second.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  fireEvent.click(row);
  const restored = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: restored.requestId,
    position: { ...target.position, y: 80 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '80px' });
  await dispatch({ type: 'od:comment-location-missing', requestId: restored.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
it('Personal: file/project changes clear loss and reject the old request while the current document is pending', async () => {
  const { view, post, dispatch } = await setup();
  await dispatch({ type: 'od:comment-targets', targets: [] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const old = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(screen.getByTestId('comment-location-unavailable')).toBeInTheDocument();
  view.rerender(tree({ ...file, name: 'other.html', path: 'other.html' }, html.replace('Target', 'Other')));
  await dispatch({ type: 'od:comment-location-missing', requestId: old.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  view.rerender(tree());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  view.rerender(<CollabProvider value={personal}>
    <FileViewer projectId="other-project" projectKind="prototype" file={file} liveHtml={html} previewComments={[comment]} />
  </CollabProvider>);
  await dispatch({ type: 'od:comment-location-missing', requestId: old.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
it('Personal: a replaced preview frame cannot carry loss into the newly loaded source', async () => {
  const { view, frame, post, dispatch } = await setup('srcdoc');
  await dispatch({ type: 'od:comment-targets', targets: [] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const old = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(screen.getByTestId('comment-location-unavailable')).toBeInTheDocument();
  const oldWindow = frame.contentWindow;
  view.unmount();
  const current = await setup('srcdoc');
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  // Neither the previous document's index nor its request owns the new selection.
  await current.dispatch({ type: 'od:comment-targets', targets: [] }, oldWindow);
  await current.dispatch({ type: 'od:comment-location-missing', requestId: old.requestId }, oldWindow);
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
