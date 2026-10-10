// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileViewer, commentAuthorAvatarColor } from '../../src/components/FileViewer';
import { AMR_LOGIN_STATUS_EVENT } from '../../src/components/amrLoginPolling';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import type { PreviewComment, ProjectFile } from '../../src/types';

const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
const comment: PreviewComment = {
  id: 'public', projectId: 'p', conversationId: 'c', filePath: file.name,
  elementId: 'pin', selector: 'h2', label: 'h2', text: '', htmlHint: '',
  position: { x: 0, y: 0, width: 1, height: 1 }, note: 'Public feedback',
  status: 'open', createdAt: 200, updatedAt: 200, authorKind: 'user',
  authorAppUserId: 'self', authorDisplayName: 'Same Name', authorKey: 'same-color',
};
const tree = (comments: PreviewComment[]) => <FileViewer projectId="p" projectKind="prototype"
  file={file} liveHtml="<html><body><h2>Fixture</h2></body></html>" previewComments={comments} />;
const account = (id: string) => Response.json({ loggedIn: true, user: { id } });
function stubAccount(read: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/integrations/vela/status')) return read();
    if (String(input).endsWith('/comments/read')) return Response.json({ projectId: 'p', lastReadAt: 100 });
    return Response.json({});
  }));
}
beforeEach(() => resetWorkspaceAccountGeneration());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

it.each([
  ['👩🏽‍💻 Engineer', '👩🏽‍💻'], ['👍🏽 Visitor', '👍🏽'], ['🇨🇳 Visitor', '🇨🇳'],
  ['e\u0301mile', 'E\u0301'], ['alice', 'A'], ['琼 Visitor', '琼'], ['', '?'], ['  ', '?'],
])('3647: renders one complete avatar grapheme for %s without changing identity or color', async (name, initial) => {
  stubAccount(async () => account('other'));
  render(tree([{ ...comment, authorDisplayName: name }]));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const row = await screen.findByTestId('comment-side-item');
  expect(row.querySelector('.comment-side-avatar')).toHaveTextContent(initial);
  expect(row.querySelector('.comment-side-avatar')).toHaveStyle({ background: commentAuthorAvatarColor('same-color').bg });
  if (name.trim()) expect(row).toHaveTextContent(name);
});

it('3650: keeps self public feedback visible but excludes it from external unread', async () => {
  stubAccount(async () => account('self'));
  render(tree([comment]));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByTestId('comment-unread-dot')).toBeNull();
  expect(screen.getByTestId('comment-panel-toggle')).toHaveAttribute('aria-label', 'Comments (1)');
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(await screen.findByTestId('comment-side-item')).toHaveTextContent(comment.note);
});

it('3650: another author stays unread alongside a visible self comment', async () => {
  stubAccount(async () => account('self'));
  render(tree([comment, { ...comment, id: 'other', elementId: 'other', authorAppUserId: 'other' }]));
  expect(await screen.findByTestId('comment-unread-dot')).toBeVisible();
  expect(screen.getByTestId('comment-panel-toggle')).toHaveAttribute('aria-label', 'Comments (2)');
});

it.each(['other', '', undefined])('3650: same name/color and unknown author id (%s) do not establish self identity', async id => {
  stubAccount(async () => account('self'));
  render(tree([{ ...comment, authorAppUserId: id }]));
  expect(await screen.findByTestId('comment-unread-dot')).toBeVisible();
});

it.each(['', '   '])('3650: empty current identity (%s) never excludes unattributed feedback', async id => {
  stubAccount(async () => account(id));
  render(tree([{ ...comment, authorAppUserId: id }]));
  expect(await screen.findByTestId('comment-unread-dot')).toBeVisible();
});

it('3650: account boundary invalidates self identity and a late old response cannot hide feedback', async () => {
  let resolveOld!: (response: Response) => void;
  let read = async () => account('self');
  stubAccount(() => read());
  render(tree([comment]));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByTestId('comment-unread-dot')).toBeNull();
  read = () => new Promise(resolve => { resolveOld = resolve; });
  act(() => window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)));
  expect(await screen.findByTestId('comment-unread-dot')).toBeVisible();
  read = async () => account('next-account');
  act(() => {
    advanceWorkspaceAccountGeneration('next-account');
    window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
  });
  await act(async () => resolveOld(account('self')));
  await waitFor(() => expect(screen.getByTestId('comment-unread-dot')).toBeVisible());
});
