// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer, CommentSidePanel } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
const comment: PreviewComment = {
  id: 'saved', projectId: 'p', conversationId: 'c', filePath: file.name,
  elementId: 'pin-saved', selector: 'h2', label: 'h2', text: 'Target', htmlHint: '<h2>Target</h2>',
  position: { x: 20, y: 40, width: 200, height: 80 }, note: 'Saved feedback',
  status: 'open', createdAt: 200, updatedAt: 200, authorKind: 'user', authorDisplayName: 'Author',
};
const collab: CollabContextValue = {
  workspaceContext: null, workspaceContextLoading: false, enabled: true,
  member: null, present: [], publishedVersion: 2, syncState: 'synced', viewerOnly: false,
  writerAuthority: 'allowed', isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false,
  ownerDisplayName: null, ownerRole: null, downloadPending: false,
  reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {},
};
function viewer(comments = [comment], team = false) {
  return <CollabProvider value={{ ...collab, enabled: team }}><FileViewer projectId="p" projectKind="prototype"
    file={file} liveHtml="<html><body><h2>Target</h2></body></html>" previewComments={comments} /></CollabProvider>;
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.viewer-body, .comment-preview-canvas')) return new DOMRect(100, 100, 800, 600);
    if (this.matches('.comment-saved-marker, .comment-active-pin')) {
      return new DOMRect(100 + Number.parseFloat(this.style.left || '20'),
        100 + Number.parseFloat(this.style.top || '12'), 28, 28);
    }
    return original.call(this);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function report(targets: object[]) {
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { type: 'od:comment-targets', targets } })));
}

it.each(['menu', 'menuitem', 'dialog'])('CV04: C inside a %s does not activate comment creation', role => {
  render(<>{viewer()}<div role={role}><button>Existing control</button></div></>);
  const control = screen.getByRole('button', { name: 'Existing control' });
  control.focus();
  fireEvent.keyDown(control, { key: 'c' });
  expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
});
it('CV04: a handled C is preserved, while a plain C still activates comment creation', () => {
  render(<>{viewer()}<button onKeyDown={event => event.preventDefault()}>Handled control</button></>);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Handled control' }), { key: 'c' });
  expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  fireEvent.keyDown(document.body, { key: 'c' });
  expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
});

it('CV26: mixed-direction list names and bodies resolve direction locally', () => {
  const rtl = { ...comment, authorDisplayName: 'ليلى Designer', note: 'يرجى تحديث Target 42' };
  render(<CommentSidePanel comments={[rtl]} selectedIds={new Set()} activeCommentId={null}
    collapsed={false} onCollapsedChange={vi.fn()} onToggleSelect={vi.fn()} onSelectAll={vi.fn()}
    onClearSelection={vi.fn()} onReply={vi.fn()} onSendSelected={vi.fn()} sending={false} t={key => key} />);
  const row = screen.getByTestId('comment-side-item');
  expect(within(row).getByText(rtl.authorDisplayName)).toHaveAttribute('dir', 'auto');
  expect(within(row).getByText(rtl.note)).toHaveAttribute('dir', 'auto');
});

it.each(['list', 'pin', 'create'] as const)('CV27: closing a comment returns focus to its actual %s entry', async entry => {
  render(viewer());
  const createEntry = screen.getByTestId('board-mode-toggle');
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await report([comment]);
  let opener: HTMLElement;
  if (entry === 'create') {
    opener = createEntry;
    opener.focus();
    fireEvent.click(opener);
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
      data: { ...comment, type: 'od:comment-target', elementId: 'new-target', hoverPoint: { x: 50, y: 60 } } })));
  } else {
    opener = entry === 'list' ? screen.getByTestId('comment-side-item')
      : (await screen.findByTestId(`comment-saved-marker-${comment.elementId}`)).querySelector('button')!;
    opener.focus();
    fireEvent.click(opener);
  }
  const popover = await screen.findByTestId('comment-popover');
  (popover.querySelector('button, textarea') as HTMLElement).focus();
  fireEvent.keyDown(popover, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByTestId('comment-popover')).toBeNull());
  await waitFor(() => expect(opener).toHaveFocus());
});

it.each([
  ['reanchored', { ...comment, anchoredVersion: 1 }, { ...comment }, 'based on an older version'],
  ['stale', { ...comment, elementId: 'old-target' }, { ...comment, elementId: 'moved-target' }, 'anchor may have moved'],
] as const)('CV19: %s comments explain uncertainty in the list and detail', async (_state, saved, target, notice) => {
  render(viewer([saved], true));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await report([target]);
  const row = screen.getByTestId('comment-side-item');
  expect(within(row).getByText(notice)).toBeVisible();
  fireEvent.click(row);
  // Entering board mode refreshes observation; the current frame reports again.
  await report([target]);
  // The stale legacy anchor also exercises the existing locate transport.
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, type: 'od:comment-active-target-update' } })));
  const popover = await screen.findByTestId('comment-popover');
  expect(within(popover).getByText(notice)).toBeVisible();
});


it.each([
  ['pod', { ...comment, elementId: 'pod-saved', selectionKind: 'pod' as const }],
  ['file comment', { ...comment, elementId: 'file-comment-saved', selector: '' }],
] as const)('does not mark a valid %s as lost when the document has no DOM targets', async (_kind, saved) => {
  render(viewer([saved], true));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await report([]);
  const row = screen.getByTestId('comment-side-item');
  expect(row).toHaveTextContent(saved.note);
  expect(within(row).queryByText('Unable to locate this element. The page may have changed.')).toBeNull();
  expect(within(row).queryByTestId('comment-location-notice')).toBeNull();
  expect(within(row).queryByTestId('comment-location-unavailable')).toBeNull();
});

it('keeps a currently observed offscreen comment distinct from a lost anchor', async () => {
  const saved = { ...comment, elementId: 'offscreen-target', selector: '[data-od-id="offscreen-target"]', anchoredVersion: 2 };
  render(viewer([saved], true));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await report([{ ...saved, position: { x: 20, y: 1200, width: 200, height: 80 } }]);
  const row = screen.getByTestId('comment-side-item');
  expect(row).toHaveTextContent(saved.note);
  expect(within(row).queryByText('Unable to locate this element. The page may have changed.')).toBeNull();
  expect(within(row).queryByTestId('comment-location-notice')).toBeNull();
  expect(screen.queryByTestId('comment-saved-marker-' + saved.elementId)).toBeNull();
  expect(document.querySelector('.comment-lost-pin')).toBeNull();
});
