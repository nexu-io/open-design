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
async function savedPin() {
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: {
      type: 'od:comment-targets', targets: [{
        elementId: comment.elementId, selector: comment.selector, label: 'h2', text: '', htmlHint: '',
        position: { x: 20, y: 40, width: 200, height: 40 },
      }],
    } }));
  });
  return (await screen.findByTestId('comment-saved-marker-pin')).querySelector('.comment-saved-pin');
}
beforeEach(() => resetWorkspaceAccountGeneration());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

it.each([
  ['👩🏽‍💻 Engineer', '👩🏽‍💻'], ['👍🏽 Visitor', '👍🏽'], ['🇨🇳 Visitor', '🇨🇳'],
  ['e\u0301mile', 'E\u0301'], ['alice', 'A'], ['琼 Visitor', '琼'], ['', '?'], ['  ', '?'],
].flatMap(([name, initial]) => (['user', 'member'] as const).map(authorKind => ({ name: name!, initial: initial!, authorKind }))))(
  'matches saved and active pins to the sidebar avatar grapheme for $authorKind $name', async ({ name, initial, authorKind }) => {
  stubAccount(async () => account('other'));
  render(tree([{ ...comment, authorKind, authorMemberId: 'member-author', authorDisplayName: name }]));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const row = await screen.findByTestId('comment-side-item');
  expect(row.querySelector('.comment-side-avatar')).toHaveTextContent(initial);
  const swatch = commentAuthorAvatarColor(comment.authorKey!);
  const pin = await savedPin();
  expect(row.querySelector('.comment-side-avatar')).toHaveStyle({ background: swatch.bg, color: swatch.fg });
  expect(pin).toHaveStyle({ background: swatch.bg, color: swatch.fg });
  expect(pin).toHaveTextContent(initial);
  fireEvent.click(pin!);
  const activePin = await screen.findByTestId('comment-active-pin');
  expect(activePin).toHaveTextContent(initial);
  expect(activePin).toHaveStyle({ background: swatch.bg, color: swatch.fg });
  if (name.trim()) expect(row).toHaveTextContent(name);
});

for (const authorKind of ['user', 'member'] as const) {
  it(`keeps ${authorKind} pins and avatars on the shared fallback when authorKey is missing`, async () => {
    stubAccount(async () => account('other'));
    render(tree([{ ...comment, authorKind, authorKey: undefined, authorMemberId: 'not-a-color-key' }]));
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
    const row = await screen.findByTestId('comment-side-item');
    const swatch = commentAuthorAvatarColor('');
    expect(row.querySelector('.comment-side-avatar')).toHaveStyle({ background: swatch.bg, color: swatch.fg });
    expect(await savedPin()).toHaveStyle({ background: swatch.bg, color: swatch.fg });
    expect(row).toHaveTextContent(comment.note);
  });
}

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
