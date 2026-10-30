// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

function markerCanvasStyle(marker: HTMLElement) {
  const cluster = marker.closest<HTMLElement>('[data-testid="comment-marker-cluster"]');
  return {
    left: `${Number.parseFloat(cluster?.style.left ?? '0') + Number.parseFloat(marker.style.left)}px`,
    top: `${Number.parseFloat(cluster?.style.top ?? '0') + Number.parseFloat(marker.style.top)}px`,
    width: marker.style.width,
    height: marker.style.height,
  };
}

beforeEach(() => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('.viewer-body, .comment-preview-canvas') ? new DOMRect(100, 100, 800, 600) : original.call(this);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
async function setup(transport: 'url' | 'srcdoc' = 'url', enabled = false, comments = [comment]) {
  if (transport === 'srcdoc') window.history.replaceState(null, '', '/?forceInline=1');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const view = render(tree(file, html, comments, enabled));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 600 });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  let lastTargets: object | undefined;
  let lastReportFile = frame.title;
  const instrumented = new WeakSet<Window>();
  const dispatch = async (data: object, source?: MessageEventSource | null) => {
    const currentFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (currentFrame.title !== lastReportFile) { lastTargets = undefined; lastReportFile = currentFrame.title; }
    Object.defineProperty(currentFrame, 'clientHeight', { configurable: true, value: frame.clientHeight });
    if (currentFrame.contentWindow !== frame.contentWindow && !instrumented.has(currentFrame.contentWindow!)) {
      instrumented.add(currentFrame.contentWindow!);
      vi.spyOn(currentFrame.contentWindow!, 'postMessage').mockImplementation((...args) => post(...args));
    }
    if (source === undefined && 'type' in data && data.type === 'od:comment-targets') lastTargets = data;
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: source === undefined ? currentFrame.contentWindow : source, data })); });
  };
  const selectRow = async (row: HTMLElement = screen.getByTestId('comment-side-item')) => {
    const before = screen.getByTestId('artifact-preview-frame');
    fireEvent.click(row);
    // Creation/browsing modes may change preview transport. The new document
    // reports its own index before it can own a locate request.
    if (screen.getByTestId('artifact-preview-frame') !== before && lastTargets) await dispatch(lastTargets);
  };
  // Model bridge readiness only from the currently committed URL document.
  expect(frame).toHaveAttribute('data-od-render-mode', transport === 'url' ? 'url-load' : 'srcdoc');
  if (transport === 'url') await dispatch({ type: 'od:url-selection-bridge-ready', href: frame.src });
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(screen.getByTestId('artifact-preview-frame')).toBe(frame);
  const target = { ...comment, position: { x: 57, y: 1801, width: 193, height: 29 } };
  return { view, frame, post, dispatch, target, selectRow };
}
it('Personal: explicitly locates a cmt row and scrolls an untagged URL reply only for the current target', async () => {
  const { post, dispatch, target, selectRow } = await setup();
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  await selectRow();
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
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId(`comment-saved-marker-${comment.elementId}`))).toMatchObject({ left: '57px', top: '52px', width: '28px', height: '28px' });
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent(comment.note);
  const count = post.mock.calls.filter(call => call[0]?.locate).length;
  await selectRow();
  expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(count + 1);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  const latest = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  await dispatch({ type: 'od:comment-location-missing', requestId: latest.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
});
it.each(['missing', 'duplicate', 'wrong-selector'] as const)('Personal: %s cmt identity never uses saved position or text as a highlight', async kind => {
  const { post, dispatch, target, selectRow } = await setup();
  const targets = kind === 'missing' ? [{ ...target, elementId: 'legacy', selector: 'p' }]
    : kind === 'duplicate' ? [target, target] : [{ ...target, selector: 'p' }];
  await dispatch({ type: 'od:comment-targets', targets });
  await selectRow();
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('Unable to locate this element. The page may have changed.');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId(`comment-saved-marker-${comment.elementId}`)).toBeNull();
  expect(screen.queryByTestId('comment-lost-markers')).toBeNull();
  expect(screen.getByTestId('comment-side-item')).toHaveTextContent(comment.note);
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent(comment.note);
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId(`comment-saved-marker-${comment.elementId}`)).toBeNull();
  expect(screen.queryByTestId('comment-lost-markers')).toBeNull();
  expect(screen.getByTestId('comment-side-item')).toHaveTextContent(comment.note);
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent(comment.note);
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
});
it('Personal: srcDoc acknowledgement is request-scoped and cannot reveal after a file boundary', async () => {
  const { view, post, dispatch, target, selectRow } = await setup('srcdoc');
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  await selectRow();
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId,
    position: { ...target.position, y: 80 } });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId(`comment-saved-marker-${comment.elementId}`))).toMatchObject({ top: '52px' });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  view.rerender(tree({ ...file, name: 'other.html', path: 'other.html' }, html.replace('Target', 'Other')));
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
});
it('Personal: waits for the active frame target report and marker selection also requests live location', async () => {
  const { post, dispatch, target, selectRow } = await setup();
  await selectRow();
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
  fireEvent.click(screen.getByTestId(`comment-saved-marker-${comment.elementId}`).querySelector('button')!);
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
  expect(screen.getByTestId('comment-side-item')).toHaveAttribute('aria-current', 'true');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
it.each([false, true])('URL locate (collab=%s): consumes an initially visible reply, not later owner scrolling', async enabled => {
  const { post, dispatch, target, selectRow } = await setup('url', enabled);
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  await selectRow();
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toBeDefined();
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { ...target.position, y: 80 } });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId(`comment-saved-marker-${comment.elementId}`))).toMatchObject({ top: '52px' });
  // A later tracking box follows the owner's scroll, not another locate intent.
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  expect(screen.queryByTestId(`comment-saved-marker-${comment.elementId}`)).toBeNull();
  await selectRow();
  const repeated = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(repeated.requestId).not.toBe(request.requestId);
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(1);
  expect(post).toHaveBeenCalledWith({ type: 'od:preview-scroll-by', left: 0, top: 1515.5 }, '*');
});
it.each([false, true])('URL locate (collab=%s): invalid/stale/unmeasurable replies do not consume initial locate', async enabled => {
  const { frame, post, dispatch, target, selectRow } = await setup('url', enabled);
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  await selectRow();
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
  const { post, dispatch, target, selectRow } = await setup();
  await dispatch({ type: 'od:comment-targets', targets: [] });
  await selectRow();
  const unresolved = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(unresolved).toBeDefined();
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('Unable to locate this element. The page may have changed.');
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: unresolved.requestId });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  await selectRow();
  const current = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(current.requestId).not.toBe(unresolved.requestId);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: unresolved.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: current.requestId,
    position: { ...target.position, y: 80 } });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId(`comment-saved-marker-${comment.elementId}`))).toMatchObject({ top: '52px' });
});
it('Personal: changing a pending selection prevents old tagged or untagged replies from revealing it', async () => {
  const nextComment = { ...comment, id: 'next-comment', elementId: 'cmt:11111111-1111-4111-8111-111111111111',
    selector: '[data-od-comment-id="11111111-1111-4111-8111-111111111111"]', note: 'Next feedback' };
  const { post, dispatch, target, selectRow } = await setup('url', false, [comment, nextComment]);
  const nextTarget = { ...nextComment, position: { ...target.position, x: 100, y: 120 } };
  await dispatch({ type: 'od:comment-targets', targets: [target, nextTarget] });
  const [firstRow, nextRow] = screen.getAllByTestId('comment-side-item');
  if (!firstRow || !nextRow) throw new Error('Expected both saved comment rows');
  await selectRow(firstRow);
  const old = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  await selectRow(nextRow);
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
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId(`comment-saved-marker-${nextComment.elementId}`))).toMatchObject({ left: '100px', top: '92px' });
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent(nextComment.note);
});
it('Personal: paired missing feedback rejects foreign/future replies, clears on repeat selection and restoration', async () => {
  const { post, dispatch, target, selectRow } = await setup('srcdoc');
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  const row = screen.getByTestId('comment-side-item');
  await selectRow(row);
  const first = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  const foreignFrame = document.createElement('iframe');
  document.body.appendChild(foreignFrame);
  try {
    await dispatch({ type: 'od:comment-location-missing', requestId: first.requestId }, foreignFrame.contentWindow);
    await dispatch({ type: 'od:comment-location-missing', requestId: 'comment-location-999' });
    expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  } finally { foreignFrame.remove(); }
  await dispatch({ type: 'od:comment-location-missing', requestId: first.requestId });
  expect(screen.getByTestId('comment-location-unavailable')).toHaveTextContent('Unable to locate this element. The page may have changed.');
  await selectRow(row);
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
  await selectRow(row);
  const restored = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: restored.requestId,
    position: { ...target.position, y: 80 } });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId(`comment-saved-marker-${comment.elementId}`))).toMatchObject({ top: '52px' });
  await dispatch({ type: 'od:comment-location-missing', requestId: restored.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
it('Personal: file/project changes clear loss and reject the old request while the current document is pending', async () => {
  const { view, post, dispatch, selectRow } = await setup();
  await dispatch({ type: 'od:comment-targets', targets: [] });
  await selectRow();
  const old = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(screen.getByTestId('comment-location-unavailable')).toBeInTheDocument();
  view.rerender(tree({ ...file, name: 'other.html', path: 'other.html' }, html.replace('Target', 'Other')));
  await dispatch({ type: 'od:comment-location-missing', requestId: old.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  view.rerender(tree());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await selectRow();
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  view.rerender(<CollabProvider value={personal}>
    <FileViewer projectId="other-project" projectKind="prototype" file={file} liveHtml={html} previewComments={[comment]} />
  </CollabProvider>);
  await dispatch({ type: 'od:comment-location-missing', requestId: old.requestId });
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
it('Personal: a replaced preview frame cannot carry loss into the newly loaded source', async () => {
  const { view, frame, post, dispatch, selectRow } = await setup('srcdoc');
  await dispatch({ type: 'od:comment-targets', targets: [] });
  await selectRow();
  const old = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(screen.getByTestId('comment-location-unavailable')).toBeInTheDocument();
  const oldWindow = frame.contentWindow;
  view.unmount();
  const current = await setup('srcdoc');
  await current.selectRow();
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
  // Neither the previous document's index nor its request owns the new selection.
  await current.dispatch({ type: 'od:comment-targets', targets: [] }, oldWindow);
  await current.dispatch({ type: 'od:comment-location-missing', requestId: old.requestId }, oldWindow);
  expect(screen.queryByTestId('comment-location-unavailable')).toBeNull();
});
