// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary } from '@open-design/contracts';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer, CommentSidePanel, commentAuthorAvatarColor } from '../../src/components/FileViewer';
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
beforeEach(() => {
  resetWorkspaceAccountGeneration();
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('.viewer-body, .comment-preview-canvas') ? new DOMRect(100, 100, 800, 600) : original.call(this);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); resetWorkspaceAccountGeneration(); });

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
  const selectedPin = await savedPin();
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(selectedPin).toHaveTextContent(initial);
  expect(selectedPin).toHaveStyle({ background: swatch.bg, color: swatch.fg });
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

function markerCanvasStyle(marker: HTMLElement) {
  const cluster = marker.closest<HTMLElement>('[data-testid="comment-marker-cluster"]');
  return {
    left: `${Number.parseFloat(cluster?.style.left ?? '0') + Number.parseFloat(marker.style.left)}px`,
    top: `${Number.parseFloat(cluster?.style.top ?? '0') + Number.parseFloat(marker.style.top)}px`,
    width: marker.style.width,
    height: marker.style.height,
  };
}

it('reprojects a Viewer left/top position and fractional anchor through current DOM movement and resize', async () => {
  stubAccount(async () => account('other'));
  // This is the public Viewer wire shape persisted by the existing relay, without x/y.
  const viewerPosition = { left: 600, top: 450, width: 300, height: 120,
    viewportWidth: 1200, viewportHeight: 800, anchor: { u: .25, v: .75 } };
  render(tree([{ ...comment, position: viewerPosition as unknown as PreviewComment['position'] }]));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  const target = { filePath: file.name, elementId: comment.elementId, selector: comment.selector,
    label: 'h2', text: '', htmlHint: '', position: { x: 20, y: 40, width: 200, height: 80 } };
  const report = async (position: typeof target.position) => act(async () => {
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
      data: { type: 'od:comment-targets', targets: [{ ...target, position }] } }));
  });
  await report(target.position);
  const marker = await screen.findByTestId('comment-saved-marker-pin');
  // True point = (70, 100), and the 28px avatar extends upward from it.
  expect(markerCanvasStyle(marker)).toMatchObject({ left: '70px', top: '72px', width: '28px', height: '28px' });
  fireEvent.click(marker.querySelector('button')!);
  expect(await screen.findByTestId('comment-popover-detail')).toHaveTextContent(comment.note);
  expect(screen.getByTestId('comment-target-overlay')).toHaveStyle({ left: '20px', top: '40px', width: '200px', height: '80px' });
  // A selected saved comment keeps one avatar rather than adding a draft avatar.
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  await report({ x: 100, y: 80, width: 400, height: 160 });
  expect(markerCanvasStyle(screen.getByTestId('comment-saved-marker-pin'))).toMatchObject({ left: '200px', top: '172px', width: '28px', height: '28px' });
  expect(screen.getByTestId('comment-target-overlay')).toHaveStyle({ left: '100px', top: '80px', width: '400px', height: '160px' });
  expect(screen.queryByTestId('comment-active-pin')).toBeNull();
  expect(viewerPosition).not.toHaveProperty('x');
  expect(viewerPosition).not.toHaveProperty('y');
  expect(viewerPosition.anchor).toEqual({ u: .25, v: .75 });
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

it('uses the server account display seed for its first draft pin, target and cursor', async () => {
  stubAccount(async () => account('self'));
  const collab: CollabContextValue = {
    workspaceContext: { workspaceId: 'ws', workspaceType: 'team', workspaceMemberId: 'self-member', role: 'owner', displayName: 'Self', authorKey: comment.authorKey,
      memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
      seatSummary: buildWorkspaceSeatSummary({seatLimit:3,usedSeats:1}), permissions:buildWorkspacePermissions({role:'owner',lifecycleState:'active'}) },
    workspaceContextLoading:false,enabled:false,member:null,present:[],publishedVersion:null,syncState:null,viewerOnly:false,
    writerAuthority:'allowed',isOwner:true,isEffectiveOwner:true,isSharedNonOwner:false,ownerDisplayName:null,ownerRole:null,downloadPending:false,
    reportChange(){},requestPublish(){},refreshPresence(){},checkStatusNow(){},
  };
  const view = render(<CollabProvider value={{...collab, workspaceContext: {...collab.workspaceContext!, authorKey: undefined}}}>{tree([])}</CollabProvider>);
  view.rerender(<CollabProvider value={collab}>{tree([])}</CollabProvider>);
  fireEvent.click(screen.getByTestId('board-mode-toggle'));
  const frame=screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  fireEvent.load(frame);
  await act(async()=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{type:'od:comment-target',
    filePath:file.name,elementId:'new',selector:'h2',label:'h2',text:'',htmlHint:'',position:{x:20,y:40,width:200,height:80},hoverPoint:{x:50,y:60}}})));
  const swatch=commentAuthorAvatarColor(comment.authorKey!);
  expect(screen.getByTestId('comment-active-pin')).toHaveStyle({background:swatch.bg,color:swatch.fg});
  expect(screen.getByTestId('comment-active-pin')).toHaveTextContent('S');
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
    type: 'od:comment-mode', cursor: expect.stringContaining(encodeURIComponent(`fill="${swatch.bg}"`)),
  }), '*'));
});


it.each([
  ['member', 'Self Member'],
  ['user', 'comment.unknownAuthor'],
] as const)('keeps a %s rail label consistent with its resolved author when the stored name is absent', async (authorKind, expectedName) => {
  stubAccount(async () => account('self'));
  const props = {
    comments: [{ ...comment, authorKind, authorMemberId: 'self-member', authorDisplayName: undefined }],
    selectedIds: new Set<string>(), activeCommentId: null, collapsed: true,
    currentUser: { memberId: 'self-member', displayName: 'Self Member', role: 'owner' as const },
    onCollapsedChange: vi.fn(), onToggleSelect: vi.fn(), onSelectAll: vi.fn(),
    onClearSelection: vi.fn(), onReply: vi.fn(), onSendSelected: vi.fn(), sending: false,
    t: (key: string) => key,
  };
  const view = render(<CommentSidePanel {...props} />);
  const avatar = screen.getByRole('button', { name: `${expectedName}: ${comment.note}` });
  expect(avatar).toHaveTextContent(authorKind === 'member' ? 'S' : '?');
  view.rerender(<CommentSidePanel {...props} collapsed={false} />);
  expect(screen.getByTestId('comment-side-item')).toHaveTextContent(expectedName);
});


it.each(['Enter', ' '])('keeps %s on a comment checkbox from opening the detail', key => {
  stubAccount(async () => account('other'));
  const onReply = vi.fn();
  const onToggleSelect = vi.fn();
  render(<CommentSidePanel comments={[comment]} selectedIds={new Set()} activeCommentId={null}
    collapsed={false} onCollapsedChange={vi.fn()} onToggleSelect={onToggleSelect}
    onSelectAll={vi.fn()} onClearSelection={vi.fn()} onReply={onReply}
    onSendSelected={vi.fn()} sending={false} t={key => key} />);
  const checkbox = screen.getByRole('button', { name: 'chat.comments.select' });
  checkbox.focus();
  // jsdom has no native button keyboard activation. Verify the key remains
  // uncancelled, then dispatch the click that the browser would synthesize.
  expect(fireEvent.keyDown(checkbox, { key })).toBe(true);
  expect(onReply).not.toHaveBeenCalled();
  fireEvent.keyUp(checkbox, { key });
  fireEvent.click(checkbox);
  expect(onToggleSelect).toHaveBeenCalledExactlyOnceWith(comment.id);
  expect(onReply).not.toHaveBeenCalled();
});
