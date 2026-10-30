// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, PreviewCommentTarget, ProjectFile } from '../../src/types';

// Save-time DOM validation is exercised separately through actual MessageEvents.
vi.mock('../../src/comments/validate-save-target', () => ({
  validateCommentSaveTarget: async (_frame: unknown, target: unknown) => target,
}));

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

it('keeps a failed draft, then saves at its click point, exits picking and reopens read-only', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const file: ProjectFile = { name: 'mainline.html', path: 'mainline.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
  const save = vi.fn().mockResolvedValueOnce(null);
  let persisted: PreviewComment[] = [];
  function Fixture() {
    const [comments, setComments] = useState<PreviewComment[]>(persisted);
    return <FileViewer projectId="p" projectKind="prototype" file={file}
      liveHtml="<html><body><h2 data-od-id='title'>Hello</h2></body></html>"
      previewComments={comments} onSavePreviewComment={async (target: PreviewCommentTarget, note: string) => {
        if (save.mock.calls.length === 0) { await save(target, note); return null; }
        save(target, note);
        const comment: PreviewComment = { ...target, id: 'saved', projectId: 'p', conversationId: 'c', note, status: 'open', createdAt: 1, updatedAt: 1 };
        persisted = [comment]; setComments(persisted); return comment;
      }} />;
  }
  const view = render(<Fixture />);
  fireEvent.click(screen.getByTestId('board-mode-toggle'));
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const target = { filePath: file.name, elementId: 'title', selector: '[data-od-id="title"]', label: 'Title', text: 'Hello', htmlHint: '<h2>',
    position: { x: 20.5, y: 40.25, width: 200, height: 80 }, hoverPoint: { x: 70.75, y: 60.75 } };
  const dispatch = async (data: object) => act(async () => { window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data })); });
  await dispatch({ ...target, type: 'od:comment-target' });
  fireEvent.change(screen.getByTestId('comment-popover-input'), { target: { value: 'Please improve this' } });
  fireEvent.click(screen.getByTestId('comment-popover-save'));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('comment-popover-input')).toHaveValue('Please improve this');
  await waitFor(() => expect(screen.getByTestId('comment-popover-save')).toBeEnabled());
  fireEvent.click(screen.getByTestId('comment-popover-save'));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]?.[0].position.anchor).toEqual({ u: 0.25125, v: 0.25625 });
  await waitFor(() => expect(screen.queryByTestId('comment-popover-input')).toBeNull());
  expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('comment-panel-toggle')).toHaveAttribute('aria-pressed', 'true');
  const viewingFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const viewingPost = vi.spyOn(viewingFrame.contentWindow!, 'postMessage');
  fireEvent.load(viewingFrame);
  await waitFor(() => expect(viewingPost).toHaveBeenCalledWith(expect.objectContaining({ type: 'od:comment-mode', enabled: false, observe: true }), '*')); 
  await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: viewingFrame.contentWindow, data: { type: 'od:comment-targets', targets: [target] } })); });
  const marker = screen.getByTestId('comment-saved-marker-title');
  expect(markerCanvasStyle(marker)).toMatchObject({ left: '70.75px', top: '32.75px', width: '28px', height: '28px' });
  expect(marker).toHaveStyle({ left: '0px', top: '0px' });
  view.unmount();
  render(<Fixture />);
  fireEvent.click(screen.getByTestId('board-mode-toggle'));
  const refreshedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const movedTarget = { ...target, position: { x: 100.5, y: 80.25, width: 400, height: 160 } };
  await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: refreshedFrame.contentWindow, data: { type: 'od:comment-targets', targets: [movedTarget] } })); });
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-title'))).toMatchObject({ left: '201px', top: '93.25px', width: '28px', height: '28px' });
  fireEvent.click(screen.getByTestId('comment-side-item'));
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent('Please improve this');
  expect(screen.queryByTestId('comment-popover-input')).toBeNull();
  expect(screen.queryByTestId('comment-popover-save')).toBeNull();
});
