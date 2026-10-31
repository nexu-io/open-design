// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InviteDialog } from '../../src/components/InviteDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';
const owner = workspaceContextFixture({ workspaceId: 'team-a', workspaceMemberId: 'owner-a', role: 'owner', workspaceName: 'Design team' });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const sendButton = () => screen.getByRole('button', { name: /发送邀请|send invitations|确认并邀请|confirm and invite/i });
function email(value: string, index = 0) { fireEvent.change(screen.getAllByRole('textbox')[index]!, { target: { value } }); }
function response(results: unknown[]) { return new Response(JSON.stringify({ results }), { status: 200 }); }

describe('member-line invitation states', () => {
  it('initially focuses the ordinary dialog title without marking the email input focused', () => {
    render(<InviteDialog open workspaceContext={owner} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('heading'));
    expect(screen.getByRole('heading').getAttribute('tabindex')).toBe('-1');
  });

  it('wraps Shift+Tab from the initial title focus to the last enabled dialog control', () => {
    render(<InviteDialog open workspaceContext={owner} onClose={() => {}} />);
    const title = screen.getByRole('heading');
    expect(document.activeElement).toBe(title);
    fireEvent.keyDown(title, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(sendButton());
  });
  it('does not gate free or full workspaces on purchased seats and closes immediately after actual success', async () => {
    const close = vi.fn(); const event = vi.fn(); window.addEventListener('od:workspace-invites-sent', event);
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'new@example.com', ok: true }])));
    try {
      render(<InviteDialog open workspaceContext={owner} availableSeats={0} freePlan onClose={close} />);
      email('new@example.com'); fireEvent.click(sendButton());
      await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
      expect(event).toHaveBeenCalledTimes(1);
      expect((event.mock.calls[0]![0] as CustomEvent).detail).toEqual({ count: 1, totalCount: 1, workspaceId: 'team-a', workspaceMemberId: 'owner-a' });
    } finally { window.removeEventListener('od:workspace-invites-sent', event); }
  });
  it('does not present purchased seat usage as an authoritative member count', () => {
    const { container } = render(<InviteDialog open workspaceContext={{ ...owner, seatSummary: { ...owner.seatSummary, usedSeats: 77 } }} onClose={() => {}} />);
    expect(container.querySelector('p')?.textContent).toBe('Design team');
  });
  it('shows the explicit authoritative member count rather than seat usage', () => {
    render(<InviteDialog open workspaceContext={{ ...owner, memberCount: 5, seatSummary: { ...owner.seatSummary, usedSeats: 77 } }} onClose={() => {}} />);
    expect(screen.getByText(/5 (members|位成员|名成员|个成员)/i)).toBeTruthy();
    expect(screen.queryByText(/77/)).toBeNull();
  });
  it.each(['admin', 'member'] as const)('does not allow %s to assign administrators even if the host requests a role menu', (role) => {
    render(<InviteDialog open workspaceContext={{ ...owner, role }} canAssignRoles onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /分配角色|assign role|^角色$|^role$/i })).toBeNull();
  });
  it('marks invalid and subsequent duplicate emails inline without sending or clearing input', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<InviteDialog open workspaceContext={owner} onClose={() => {}} />);
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendButton());
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    email('invalid'); fireEvent.click(sendButton()); expect(screen.getByRole('alert')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('invalid');
    email('same@example.com'); fireEvent.click(screen.getByRole('button', { name: /添加成员|add member/i })); email('SAME@example.com', 1);
    fireEvent.click(sendButton());
    expect(screen.getAllByRole('textbox')[0]!.getAttribute('aria-invalid')).toBe('false');
    expect(screen.getAllByRole('textbox')[1]!.getAttribute('aria-invalid')).toBe('true');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['dialog', 'onboarding'] as const)('OPEND-4343 %s validates recipients only on submit and leaves added rows untouched', variant => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<InviteDialog variant={variant} open workspaceContext={owner} onClose={() => {}} />);
    email('first@example.com');
    fireEvent.blur(screen.getAllByRole('textbox')[0]!);
    fireEvent.click(screen.getByRole('button', { name: /添加成员|add member/i }));
    expect(screen.queryByRole('alert')).toBeNull();
    email('invalid', 1);
    fireEvent.blur(screen.getAllByRole('textbox')[1]!);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(sendButton());
    expect(screen.getAllByRole('textbox')[1]!.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /添加成员|add member/i }));
    expect(screen.getAllByRole('textbox')[2]!.getAttribute('aria-invalid')).toBe('false');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    email('second@example.com', 1);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(sendButton());
    expect(screen.getAllByRole('textbox')[2]!.getAttribute('aria-invalid')).toBe('true');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('removes only sent rows, retains failed roles and retries them once', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([{ email: 'sent@example.com', ok: true }, { email: 'retry@example.com', ok: false, error: 'active_pending_invite' }]))
      .mockResolvedValueOnce(response([{ email: 'corrected@example.com', ok: true }]));
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    vi.stubGlobal('fetch', fetcher); const close = vi.fn(); const submit = vi.fn();
    render(<InviteDialog open workspaceContext={owner} onClose={close} onSubmit={submit} />);
    email('sent@example.com'); fireEvent.click(screen.getByRole('button', { name: /添加成员|add member/i })); email('retry@example.com', 1); fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(1));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('retry@example.com'); expect(close).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    email('corrected@example.com'); fireEvent.click(sendButton()); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(dispatch.mock.calls.map(([event]) => event).filter(event => event.type === 'od:workspace-invites-sent').map(event => (event as CustomEvent).detail.totalCount)).toEqual([1, 2]);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).invites[0].idempotencyKey).not.toBe(JSON.parse(fetcher.mock.calls[0]![1].body).invites[1].idempotencyKey);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ invites: [{ email: 'corrected@example.com', role: 'member', idempotencyKey: expect.any(String) }] });
  });
  it('retries only unsent rows unchanged after a partial no-session result', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([
      { email: 'sent@example.com', ok: true },
      { email: 'unsent@example.com', ok: false, error: 'no_session' },
    ])).mockResolvedValueOnce(response([{ email: 'unsent@example.com', ok: true }]));
    vi.stubGlobal('fetch', fetcher);
    const close = vi.fn();
    render(<InviteDialog open workspaceContext={owner} onClose={close} />);
    email('sent@example.com');
    fireEvent.click(screen.getByRole('button', { name: /添加成员|add member/i }));
    email('unsent@example.com', 1); fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(1));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('unsent@example.com');
    fireEvent.click(sendButton());
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).invites[0].idempotencyKey).toBe(JSON.parse(fetcher.mock.calls[0]![1].body).invites[1].idempotencyKey);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ invites: [{ email: 'unsent@example.com', role: 'member', idempotencyKey: expect.any(String) }] });
  });
  it.each(['transport', 'server', 'upstream', 'delivery'] as const)('shows ordinary %s failures inline in the form without a global toast and preserves rows for retry', async (kind) => {
    const fetcher = vi.fn().mockImplementationOnce(() => kind === 'transport' ? Promise.reject(new TypeError('offline')) : Promise.resolve(kind === 'server' ? new Response('{}', { status: 503 }) : response([{ email: 'one@example.com', ok: false, error: kind === 'delivery' ? 'delivery_failed' : 'create_unreachable' }, { email: 'two@example.com', ok: false, error: kind === 'delivery' ? 'delivery_failed' : 'create_unreachable' }]))).mockResolvedValueOnce(response([{ email: 'one@example.com', ok: true }, { email: 'two@example.com', ok: true }]));
    vi.stubGlobal('fetch', vi.fn((url, init) => String(url) === '/api/workspace/invite' ? fetcher(url, init) : Promise.resolve(new Response('{}', { status: 200 })))); const close = vi.fn();
    render(<InviteDialog open workspaceContext={owner} onClose={close} />);
    email('one@example.com'); fireEvent.click(screen.getByRole('button', { name: /添加成员|add member/i })); email('two@example.com', 1); fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByRole('dialog').querySelector('form > p[role="alert"]')).toHaveTextContent('Failed to send invitations'));
    const toast = screen.getByRole('dialog').querySelector('form > p[role="alert"]')!;
    expect(toast.classList.contains('od-toast')).toBe(false);
    expect(document.querySelector('.od-toast')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(kind === 'delivery' ? 3 : 1);
    expect(screen.getAllByRole('textbox').map(node => (node as HTMLInputElement).value)).toEqual(['one@example.com', 'two@example.com']);
    fireEvent.click(sendButton()); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it('keeps domain failures inline instead of treating every HTTP rejection as a network outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    render(<InviteDialog open workspaceContext={owner} onClose={() => {}} />);
    email('one@example.com'); fireEvent.click(sendButton());
    const error = await screen.findByRole('alert'); expect(error.classList.contains('od-toast')).toBe(false);
  });
  it('closes a pending request and ignores its late success response', async () => {
    let resolve!: (value: Response) => void;
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(done => { resolve = done; });
    }));
    const close = vi.fn(); const sent = vi.fn();
    window.addEventListener('od:workspace-invites-sent', sent);
    try {
      render(<InviteDialog open workspaceContext={owner} onClose={close} />);
      email('member@example.com'); fireEvent.click(sendButton());
      fireEvent.click(screen.getAllByRole('button', { name: /取消|cancel/i })[0]!);
      expect(close).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
      await act(async () => { resolve(response([{ email: 'member@example.com', ok: true }])); });
      expect(sent).not.toHaveBeenCalled();
    } finally { window.removeEventListener('od:workspace-invites-sent', sent); }
  });
  it('disables every editable control while sending and retains all inputs on transport failure', async () => {
    let reject!: (reason: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_resolve, fail) => { reject = fail; })));
    render(<InviteDialog open workspaceContext={owner} onClose={() => {}} />);
    email('member@example.com'); fireEvent.click(sendButton());
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /添加成员|add member/i }) as HTMLButtonElement).disabled).toBe(true);
    reject(new TypeError('offline')); await screen.findByRole('alert');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('member@example.com');
  });
});


describe('same-frame invitation submissions', () => {
  it.each(['dialog', 'onboarding'] as const)('%s submits once and permits retry after a failed request', async variant => {
    let reject!: (reason: unknown) => void;
    const requests = vi.fn(() => new Promise<Response>((_resolve, fail) => { reject = fail; }));
    vi.stubGlobal('fetch', vi.fn((url, init) => String(url) === '/api/workspace/invite' ? requests() : Promise.resolve(new Response('{}'))));
    render(<InviteDialog variant={variant} open workspaceContext={owner} onClose={() => {}} />);
    email('one@example.com');
    const button = sendButton();
    act(() => { for (let i = 0; i < 5; i++) button.click(); });
    expect(requests).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new TypeError('offline')); });
    await screen.findByRole('alert');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('one@example.com');
    fireEvent.click(sendButton());
    expect(requests).toHaveBeenCalledTimes(2);
  });
});

it('keeps the same operation when only normalized email casing changes after delivery failure', async () => {
 const fetcher=vi.fn().mockResolvedValueOnce(response([{email:'retry@example.com',ok:false,error:'delivery_failed'}])).mockResolvedValueOnce(response([{email:'RETRY@example.com',ok:true}]));
 vi.stubGlobal('fetch',fetcher);const close=vi.fn();render(<InviteDialog open workspaceContext={owner} onClose={close}/>);
 email('retry@example.com');fireEvent.click(sendButton());await waitFor(()=>expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
 email('RETRY@example.com');fireEvent.click(sendButton());await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 const first=JSON.parse(fetcher.mock.calls[0]![1].body).invites[0],second=JSON.parse(fetcher.mock.calls[1]![1].body).invites[0];
 expect(first.idempotencyKey).toBeTruthy();expect(second.idempotencyKey).toBe(first.idempotencyKey);
});
