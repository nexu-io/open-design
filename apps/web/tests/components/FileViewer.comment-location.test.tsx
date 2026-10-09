// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }));
  }); };
  await dispatch({ type: 'od:comment-targets', targets: [{ ...comment,
    elementId: comment.elementId, selector: '[data-od-id="root"]', position: { x: 20, y: 1100, width: 200, height: 40 } }] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  expect(request).toMatchObject({ type: 'od:comment-active-target', locate: true,
    elementId: comment.elementId, selector: comment.selector, requestId: expect.any(String) });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(screen.queryByTestId('comment-saved-marker-' + comment.elementId)).toBeNull();
  await dispatch({ type: 'od:comment-active-target-update', ...comment, elementId: 'current-h2',
    position: { x: 20, y: 80, width: 200, height: 40 }, requestId: request.requestId });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ left: '20px', top: '80px' });
  expect(screen.getByTestId('comment-saved-marker-' + comment.elementId)).toHaveStyle({
    left: '20px', top: '80px', width: '200px', height: '40px',
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
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '80px' });
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
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }));
  }); };
  const target = { ...comment, elementId: 'current-h2', position: { x: 20, y: 1100, width: 200, height: 40 } };
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  const request = post.mock.calls.map(call => call[0]).find(data => data?.locate);
  await dispatch({ ...target, type: 'od:comment-active-target-update', requestId: request.requestId,
    position: { x: 20, y: 80, width: 200, height: 40 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ top: '80px' });

  // The request-id reply already confirms that the bridge scrolled. A later
  // untagged position update is tracking the owner's scroll, not another locate.
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
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
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }));
  }); };
  const target = { ...comment, elementId: 'current-h2', position: { x: 20, y: 1100, width: 200, height: 40 } };
  await dispatch({ type: 'od:comment-targets', targets: [target] });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  await dispatch({ ...target, type: 'od:comment-active-target-update' });
  expect(post).toHaveBeenCalledWith({ type: 'od:preview-scroll-by', left: 0, top: 820 }, '*');
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await dispatch({ ...target, type: 'od:comment-active-target-update', position: { x: 20, y: 80, width: 200, height: 40 } });
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({ left: '20px', top: '80px' });
});
