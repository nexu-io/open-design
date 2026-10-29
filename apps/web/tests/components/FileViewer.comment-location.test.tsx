// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';


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
    if (this.matches('.viewer-body, .comment-preview-canvas')) return new DOMRect(100, 100, 800, 600);
    return original.call(this);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const collab: CollabContextValue = {
  workspaceContext: null, workspaceContextLoading: false, enabled: true,
  member: null, present: [], publishedVersion: 2, syncState: 'synced', viewerOnly: false,
  writerAuthority: 'allowed', isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false,
  ownerDisplayName: null, ownerRole: null, downloadPending: false,
  reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {},
};
const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100,
  mtime: 1, kind: 'html', mime: 'text/html' };
const comment: PreviewComment = {
  id: 'old-h2-comment', projectId: 'p', conversationId: 'c', filePath: 'index.html',
  elementId: 'old-cloud-id', selector: 'body > main > section > h2', label: 'h2', text: 'Location target',
  htmlHint: '<h2>', position: { x: 0, y: 0, width: 752, height: 38 },
  anchorState: 'lost', anchoredVersion: 1, note: 'Synthetic old review', status: 'open', createdAt: 1, updatedAt: 1,
};
const html = '<html><body><main><section><h2>Location target</h2></section></main></body></html>';
const tree = (content = html) => <CollabProvider value={collab}>
  <FileViewer projectId="p" projectKind="prototype" file={file} liveHtml={content} previewComments={[comment]} />
</CollabProvider>;

it('rechecks an old lost comment in the DOM, ignores stale location replies and uses the scrolled H2 box', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const view = render(tree());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const dispatch = async (data: object) => { await act(async () => {
    const currentFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (frame.clientHeight > 0) Object.defineProperty(currentFrame, 'clientHeight', { configurable: true, value: frame.clientHeight });
    if (currentFrame.contentWindow !== frame.contentWindow) vi.spyOn(currentFrame.contentWindow!, 'postMessage').mockImplementation((...args) => post(...args));
    window.dispatchEvent(new MessageEvent('message', { source: currentFrame.contentWindow, data }));
  }); };
  await dispatch({ type: 'od:comment-targets', targets: [{ ...comment,
    elementId: comment.elementId, selector: '[data-od-id="root"]', position: { x: 20, y: 1100, width: 200, height: 40 } }] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  await dispatch({ type: 'od:comment-targets', targets: [] });
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toMatchObject({ type: 'od:comment-active-target', locate: true,
    elementId: comment.elementId, selector: comment.selector, requestId: expect.any(String) });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.getByTestId('comment-saved-marker-' + comment.elementId)).toHaveAttribute('data-anchor-state', 'lost');
  await dispatch({ type: 'od:comment-active-target-update', ...comment, elementId: 'current-h2',
    position: { x: 20, y: 80, width: 200, height: 40 }, requestId: request.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-' + comment.elementId))).toMatchObject({ left: '20px', top: '52px' });
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-' + comment.elementId))).toMatchObject({
    left: '20px', top: '52px', width: '28px', height: '28px',
  });
  // Scrolling away does not change the selected comment id. Clicking its row
  // again must query/scroll again rather than clearing the marker indefinitely.
  const locateCount = post.mock.calls.filter(call => call[0]?.locate).length;
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(post.mock.calls.filter(call => call[0]?.locate)).toHaveLength(locateCount + 1);
  const repeated = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(repeated.requestId).not.toBe(request.requestId);
  await dispatch({ type: 'od:comment-active-target-update', ...comment, elementId: 'current-h2',
    position: { x: 20, y: 80, width: 200, height: 40 }, requestId: repeated.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-' + comment.elementId))).toMatchObject({ top: '52px' });
  view.rerender(tree(html.replace('Location target', 'Updated location target')));
  await dispatch({ type: 'od:comment-active-target-update', ...comment,
    position: { x: 0, y: 0, width: 752, height: 38 }, requestId: request.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ type: 'od:comment-targets', targets: [] });
  const latest = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(latest.requestId).not.toBe(request.requestId);
  await dispatch({ ...comment, type: 'od:comment-active-target-update', selector: '[data-od-id="root"]',
    position: { x: 0, y: 0, width: 752, height: 38 }, requestId: latest.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ type: 'od:comment-location-missing', requestId: latest.requestId });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
});

it('does not scroll again after a srcDoc location acknowledgement when the owner scrolls away', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  render(tree());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 600 });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const dispatch = async (data: object) => { await act(async () => {
    const currentFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (frame.clientHeight > 0) Object.defineProperty(currentFrame, 'clientHeight', { configurable: true, value: frame.clientHeight });
    if (currentFrame.contentWindow !== frame.contentWindow) vi.spyOn(currentFrame.contentWindow!, 'postMessage').mockImplementation((...args) => post(...args));
    window.dispatchEvent(new MessageEvent('message', { source: currentFrame.contentWindow, data }));
  }); };
  const target = { ...comment, elementId: 'current-h2', position: { x: 20, y: 1100, width: 200, height: 40 } };
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  await dispatch({ type: 'od:comment-targets', targets: [] });
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId,
    position: { x: 20, y: 80, width: 200, height: 40 } });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-' + comment.elementId))).toMatchObject({ top: '52px' });

  // The request-id reply already confirms that the bridge scrolled. A later
  // untagged position update is tracking the owner's scroll, not another locate.
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(screen.queryByTestId('comment-saved-marker-' + comment.elementId)).toBeNull();
  expect(post.mock.calls.filter(call => call[0]?.type === 'od:preview-scroll-by')).toHaveLength(0);
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const repeated = post.mock.calls.map(call => call[0]).filter(data => data?.locate).at(-1);
  expect(repeated.requestId).not.toBe(request.requestId);
});

it('scrolls a URL preview through its existing bridge and accepts only the current DOM target', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  render(tree());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 600 });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const dispatch = async (data: object) => { await act(async () => {
    const currentFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (frame.clientHeight > 0) Object.defineProperty(currentFrame, 'clientHeight', { configurable: true, value: frame.clientHeight });
    if (currentFrame.contentWindow !== frame.contentWindow) vi.spyOn(currentFrame.contentWindow!, 'postMessage').mockImplementation((...args) => post(...args));
    window.dispatchEvent(new MessageEvent('message', { source: currentFrame.contentWindow, data }));
  }); };
  const target = { ...comment, elementId: 'current-h2', position: { x: 20, y: 1100, width: 200, height: 40 } };
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post).toHaveBeenCalledWith({ type: 'od:preview-scroll-by', left: 0, top: 820 }, '*');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { x: 20, y: 80, width: 200, height: 40 } });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-' + comment.elementId))).toMatchObject({ left: '20px', top: '52px' });
});

it.each([true, false])('OPEND-3869 keeps located and saved pins together through identity change (tagged=%s)', async tagged => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  render(tree()); fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const dispatch = async (data: object) => { await act(async () => {
    const currentFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (frame.clientHeight > 0) Object.defineProperty(currentFrame, 'clientHeight', { configurable: true, value: frame.clientHeight });
    if (currentFrame.contentWindow !== frame.contentWindow) vi.spyOn(currentFrame.contentWindow!, 'postMessage').mockImplementation((...args) => post(...args));
    window.dispatchEvent(new MessageEvent('message', {source:currentFrame.contentWindow,data}));
  }); };
  await dispatch({type:'od:comment-targets',targets:[{...comment,domSelector:comment.selector}]});
  fireEvent.click(screen.getByTestId('comment-side-item'));
  await dispatch({ type: 'od:comment-targets', targets: [] });
  const request = post.mock.calls.map(([value])=>value).filter(value=>value?.locate).at(-1);
  const located = {...comment,elementId:'new-id',selector:'[data-od-id="new-id"]',domSelector:comment.selector,position:{x:320,y:400,width:200,height:40}};
  await dispatch({...located,type:'od:comment-active-target-update',...(tagged ? {requestId:request.requestId} : {})});
  const same = () => {
    expect(screen.queryByTestId('comment-active-pin')).toBeNull();
    expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-'+comment.elementId))).toMatchObject({left:'320px',top:'372px',width:'28px',height:'28px'});
  };
  same();
  await dispatch({type:'od:comment-targets',targets:[{...located,selector:'[data-od-id="new-id"]',domSelector:comment.selector}]});
  same();
});


it('opens a legacy lost marker as a saved detail without inventing a target or posting a write', async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  render(tree());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow, data: { type: 'od:comment-targets', targets: [] },
  })));
  const marker = await screen.findByTestId('comment-saved-marker-' + comment.elementId);
  expect(marker).toHaveAttribute('data-anchor-state', 'lost');
  fireEvent.click(within(marker).getByRole('button'));
  // Entering comment mode may replace the preview document; only its fresh
  // authoritative report can establish that the legacy anchor is still lost.
  const commentFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => window.dispatchEvent(new MessageEvent('message', {
    source: commentFrame.contentWindow, data: { type: 'od:comment-targets', targets: [] },
  })));
  expect(await screen.findByTestId('comment-popover-detail')).toHaveTextContent(comment.note);
  expect(within(screen.getByTestId('comment-popover')).getByText('Unable to locate this element. The page may have changed.')).toHaveAttribute('role', 'status');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId('comment-target-overlay')).toBeNull();
  expect(screen.queryByTestId('comment-popover-input')).toBeNull();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method?.toUpperCase() === 'POST')).toHaveLength(0);
});
