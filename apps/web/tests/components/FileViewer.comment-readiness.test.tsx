// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not persist lost anchors before this preview reports its targets (OPEND-3516)', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const onLostAnchors = vi.fn();
  const collab: CollabContextValue = {
    workspaceContext: null, workspaceContextLoading: false, enabled: true,
    member: null, present: [], publishedVersion: 1, syncState: 'synced', viewerOnly: false,
    writerAuthority: 'allowed', isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false,
    ownerDisplayName: null, ownerRole: null, downloadPending: false,
    reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {}, onLostAnchors,
  };
  const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100,
    mtime: 1, kind: 'html', mime: 'text/html' };
  const comment: PreviewComment = {
    id: 'synthetic-comment', projectId: 'p', conversationId: 'c', filePath: 'index.html',
    elementId: 'hero', selector: '[data-od-id="hero"]', label: 'Hero', text: 'Hero',
    htmlHint: '<h2 data-od-id="hero">Hero</h2>', position: { x: 30, y: 400, width: 100, height: 40 },
    note: 'Synthetic review', status: 'open', createdAt: 1, updatedAt: 1,
  };
  const tree = (html: string) => <CollabProvider value={collab}>
    <FileViewer projectId="p" projectKind="prototype" file={file} liveHtml={html} previewComments={[comment]} />
  </CollabProvider>;
  const view = render(tree('<html><body><h2 data-od-id="hero">Hero</h2></body></html>'));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(onLostAnchors).not.toHaveBeenCalled();
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => { window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    data: { type: 'od:comment-targets', targets: [{ ...comment, position: { x: 20, y: 60, width: 100, height: 40 } }] },
  })); });
  expect(onLostAnchors).not.toHaveBeenCalled();
  view.rerender(tree('<html><body><h2 data-od-id="hero">Updated Hero</h2></body></html>'));
  expect(onLostAnchors).not.toHaveBeenCalled();
  // A ready, actually empty target report is different from not having a report yet.
  await act(async () => { window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow, data: { type: 'od:comment-targets', targets: [] },
  })); });
  expect(onLostAnchors).toHaveBeenCalledOnce();
});
