// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { useRegistrationInvite, registrationInviteCompletionKey } from '../../src/components/useRegistrationInvite';
import type { VelaLoginStatus } from '../../src/providers/daemon';
import { workspaceContextFixture } from '../helpers/workspace-context';
const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('../../src/providers/daemon', () => ({ fetchVelaLoginStatus: mocks.status }));
vi.mock('../../src/components/LanguageMenu', () => ({ LanguageMenu: () => null }));
const status = { loggedIn: true, sessionState: 'authenticated', credentialRevision: 'credential-a', profile: 'selected', user: { id: 'new-account', email: 'new@example.com' }, configPath: '/test', registrationInvite: { accountId: 'new-account', deviceAuthorizationId: 'cuid-registration-1' } } as VelaLoginStatus;
const baseContext = workspaceContextFixture({ workspaceId: 'new-workspace', workspaceMemberId: 'new-member', role: 'owner' });
const context = { ...baseContext, permissions: { ...baseContext.permissions, canInviteMembers: true } };
function Host({ current = status, ready = true, unavailable = false, retry = vi.fn(), exit = vi.fn() }: { current?: VelaLoginStatus; ready?: boolean; unavailable?: boolean; retry?: () => void; exit?: (count: number, workspace: typeof context) => void }) {
  const view = useRegistrationInvite({ status: current, accountId: current.user?.id ?? null, configuredProfile: current.profile, context, identityReady: ready, identityUnavailable: unavailable, onRetryIdentity: retry, allowHost: true, onExit: exit });
  return view ?? <div>Normal home</div>;
}
function mount(props: Parameters<typeof Host>[0] = {}) { return render(<I18nProvider initial="zh-CN"><Host {...props} /></I18nProvider>); }
const title = '免费邀请同事，一起做设计';
beforeEach(() => { window.localStorage.clear(); mocks.status.mockResolvedValue(status); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ context }), { status: 200 }))); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });
describe('strict registration invitation host', () => {
  it.each(['absent', 'wrong-account', 'expired', 'no-revision'])('never displays an invitation from %s status', async mode => {
    const current = { ...status, ...(mode === 'absent' ? { registrationInvite: undefined } : mode === 'wrong-account' ? { registrationInvite: { ...status.registrationInvite!, accountId: 'other' } } : mode === 'expired' ? { sessionState: 'reauth_required' as const } : { credentialRevision: undefined }) };
    mount({ current }); expect(screen.getByText('Normal home')).toBeTruthy(); expect(mocks.status).not.toHaveBeenCalled();
  });
  it('waits for workspace identity and a fresh same-credential status before replacing home', async () => {
    const result = mount({ ready: false }); expect(screen.queryByText('Normal home')).toBeNull(); expect(screen.queryByText(title)).toBeNull(); expect(mocks.status).not.toHaveBeenCalled();
    result.rerender(<I18nProvider initial="zh-CN"><Host ready /></I18nProvider>);
    expect(screen.queryByText('Normal home')).toBeNull(); await screen.findByText(title);
    expect(mocks.status).toHaveBeenCalledWith({ refresh: true });
  });
  it('offers an identity retry on an explicit context failure before showing the verified invitation', async () => {
    const retry = vi.fn(); const result = mount({ ready: false, unavailable: true, retry });
    expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.queryByText(title)).toBeNull();
    expect(mocks.status).not.toHaveBeenCalled(); expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' })); expect(retry).toHaveBeenCalledTimes(1);
    result.rerender(<I18nProvider initial="zh-CN"><Host ready={false} unavailable={false} retry={retry} /></I18nProvider>);
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByText(title)).toBeNull(); expect(mocks.status).not.toHaveBeenCalled();
    result.rerender(<I18nProvider initial="zh-CN"><Host ready unavailable={false} retry={retry} /></I18nProvider>);
    await screen.findByText(title); expect(mocks.status).toHaveBeenCalledWith({ refresh: true });
    expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
  });
  it('ignores a late old-account verification after an account switch', async () => {
    let resolve!: (value: VelaLoginStatus) => void; mocks.status.mockReturnValue(new Promise(r => { resolve = r; }));
    const result = mount();
    result.rerender(<I18nProvider initial="zh-CN"><Host current={{ ...status, user: { id: 'existing', email: 'old@example.com' }, registrationInvite: undefined }} /></I18nProvider>);
    await act(async () => { resolve(status); }); expect(screen.queryByText(title)).toBeNull(); expect(screen.getByText('Normal home')).toBeTruthy();
  });
  it('skips once, persists completion across reload, and preserves the homepage banner', async () => {
    const exit = vi.fn(); const result = mount({ exit }); await screen.findByText(title);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '暂时跳过' })); });
    expect(exit).toHaveBeenCalledWith(0, context, 'skipped'); expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBe('1');
    expect(localStorage.getItem('od.invitation-banner.dismissed:new-account')).toBeNull();
    result.unmount(); mount(); expect(screen.getByText('Normal home')).toBeTruthy(); expect(screen.queryByText(title)).toBeNull();
  });
  it('does not acknowledge completion when the finishing credential expired', async () => {
    mocks.status.mockResolvedValueOnce(status).mockResolvedValueOnce({ ...status, sessionState: 'reauth_required' });
    const exit = vi.fn(); mount({ exit }); await screen.findByText(title);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '暂时跳过' })); });
    expect(exit).not.toHaveBeenCalled(); expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
  });
  it('retries a failed fresh read without manufacturing registration eligibility', async () => {
    mocks.status.mockResolvedValueOnce(null).mockResolvedValueOnce(status); mount();
    await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: '重试' })); await screen.findByText(title);
  });
  it('does not borrow another account’s retained workspace after fresh account verification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ context: { ...context, workspaceMemberId: 'old-account-member' } }), { status: 200 })));
    mount(); await screen.findByRole('alert'); expect(screen.queryByText(title)).toBeNull();
    expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
  });
  it('keeps completion unacknowledged after storage failure and retries the same verified claim', async () => {
    const exit = vi.fn(); mount({ exit }); await screen.findByText(title);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('storage unavailable'); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '暂时跳过' })); });
    await screen.findByRole('alert'); expect(exit).not.toHaveBeenCalled(); expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })); });
    expect(exit).toHaveBeenCalledWith(0, context, 'skipped'); expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBe('1');
  });
  it('continues an unfinished receipt after reload', async () => {
    const first = mount(); await screen.findByText(title); first.unmount(); mount(); await screen.findByText(title);
    expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
  });
  it('discards a finishing status response after a same-page account switch', async () => {
    let resolve!: (value: VelaLoginStatus) => void;
    mocks.status.mockResolvedValueOnce(status).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const exit = vi.fn(); const result = mount({ exit }); await screen.findByText(title);
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' }));
    result.rerender(<I18nProvider initial="zh-CN"><Host current={{ ...status, user: { id: 'existing', email: 'old@example.com' }, registrationInvite: undefined }} exit={exit} /></I18nProvider>);
    await act(async () => { resolve(status); }); expect(exit).not.toHaveBeenCalled();
    expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull(); expect(localStorage.getItem('od.invitation-banner.dismissed:existing')).toBeNull();
  });
  it('does not acknowledge or navigate from a finishing response after the host unmounts', async () => {
    let resolve!: (value: VelaLoginStatus) => void;
    mocks.status.mockResolvedValueOnce(status).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const exit = vi.fn(); const result = mount({ exit }); await screen.findByText(title);
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' })); result.unmount();
    await act(async () => { resolve(status); }); expect(exit).not.toHaveBeenCalled();
    expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull();
  });
  it('discards a pending invite result after a same-page account switch', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input) === '/api/workspace/context' ? Promise.resolve(new Response(JSON.stringify({ context }), { status: 200 })) : new Promise<Response>(r => { resolve = r; })));
    const exit = vi.fn(); const result = mount({ exit }); await screen.findByText(title);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'colleague@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送邀请' }));
    result.rerender(<I18nProvider initial="zh-CN"><Host current={{ ...status, user: { id: 'existing', email: 'old@example.com' }, registrationInvite: undefined }} exit={exit} /></I18nProvider>);
    await act(async () => { resolve(new Response(JSON.stringify({ results: [{ email: 'colleague@example.com', ok: true }] }), { status: 200 })); });
    expect(exit).not.toHaveBeenCalled(); expect(localStorage.getItem(registrationInviteCompletionKey(status)!)).toBeNull(); expect(localStorage.getItem('od.invitation-banner.dismissed:existing')).toBeNull();
  });
  it('allows manual entry before the countdown and hides the account banner', async () => {
    const exit = vi.fn(); mount({ exit }); await screen.findByText(title);
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [{ email: 'colleague@example.com', ok: true }] }), { status: 200 })));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'colleague@example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送邀请' })); });
    expect(exit).not.toHaveBeenCalled(); await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(exit).not.toHaveBeenCalled(); await act(async () => { fireEvent.click(screen.getByRole('button', { name: '进入工作台' })); await vi.advanceTimersByTimeAsync(180); });
    expect(exit).toHaveBeenCalledWith(1, context, 'sent'); expect(localStorage.getItem('od.invitation-banner.dismissed:new-account')).toBe('1');
  });
  it('counts down from three and automatically enters once after confirmed delivery', async () => {
    const exit = vi.fn(); mount({ exit }); await screen.findByText(title);
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [{ email: 'colleague@example.com', ok: true }] }), { status: 200 })));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'colleague@example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送邀请' })); });
    expect(screen.getByRole('heading', { name: '邀请已发送' })).toBeTruthy();
    expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '3s 后自动进入')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '2s 后自动进入')).toBeTruthy(); expect(exit).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent === '1s 后自动进入')).toBeTruthy(); expect(exit).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(exit).toHaveBeenCalledExactlyOnceWith(1, context, 'sent');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(exit).toHaveBeenCalledTimes(1);
  });

});
