// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, type WorkspaceCollabContext } from '@open-design/contracts';
import { I18nProvider } from '../../src/i18n';
import { HomeInviteSurface, HomeInviteTrigger, WORKSPACE_INVITES_SENT } from '../../src/components/HomeInviteSurface';

const login = vi.hoisted(() => ({ begin: vi.fn(), success: undefined as (() => void) | undefined }));
vi.mock('../../src/components/use-cloud-sign-in', () => ({ useCloudSignIn: ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  login.success = onLoginSuccess; return { state: 'idle', status: null, begin: login.begin, cancel: vi.fn() };
} }));
vi.mock('../../src/components/InviteDialog', () => ({ InviteDialog: () => <div role="dialog" aria-label="邀请成员" /> }));
afterEach(() => { cleanup(); window.localStorage.clear(); login.begin.mockClear(); vi.useRealTimers(); });
const context = {
  workspaceId: 'one', workspaceMemberId: 'member-one', workspaceType: 'team', role: 'member',
  lifecycleState: 'active', memberStatus: 'active',
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
} as WorkspaceCollabContext;
function view(accountId = 'account-one', workspace = context) {
  return <I18nProvider initial="zh-CN"><HomeInviteTrigger context={workspace} /><HomeInviteSurface accountId={accountId} context={workspace} active /></I18nProvider>;
}
describe('home invitation entry', () => {
  it('keeps dismissal across workspace switches and remounts, separately per account', () => {
    const result = render(view());
    fireEvent.click(screen.getByRole('button', { name: '关闭邀请横条' }));
    expect(screen.queryByRole('region')).toBeNull();
    result.rerender(view('account-one', { ...context, workspaceId: 'two', workspaceMemberId: 'member-two' }));
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('button', { name: '邀请' })).toBeTruthy();
    result.unmount();
    const next = render(view());
    expect(screen.queryByRole('region')).toBeNull();
    next.rerender(view('account-two'));
    expect(screen.getByRole('region')).toBeTruthy();
  });
  it('ignores stale workspace success, and hides the banner after actual matching success', () => {
    vi.useFakeTimers();
    render(view());
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 2, workspaceId: 'other', workspaceMemberId: 'other' } })));
    expect(screen.getByRole('region')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 2, workspaceId: 'one', workspaceMemberId: 'member-one' } })));
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('已向 2 位同事发送邀请');
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('gives each independent same-size successful batch a fresh four seconds', () => {
    vi.useFakeTimers();
    render(view());
    const success = () => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 1, totalCount: 1, workspaceId: 'one', workspaceMemberId: 'member-one' } }));
    act(success);
    act(() => vi.advanceTimersByTime(3999));
    act(success);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('已向 1 位同事发送邀请');
    act(() => vi.advanceTimersByTime(3998));
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('keeps partial success inline while retaining confirmed banner dismissal', () => {
    render(view());
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 1, totalCount: 1, partial: true, workspaceId: 'one', workspaceMemberId: 'member-one' } })));
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 1, totalCount: 2, workspaceId: 'one', workspaceMemberId: 'member-one' } })));
    expect(screen.getByRole('status').textContent).toBe('已向 2 位同事发送邀请');
  });
  it('reports the cumulative confirmed successes after retrying failed rows', () => {
    render(view());
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 1, totalCount: 1, workspaceId: 'one', workspaceMemberId: 'member-one' } })));
    expect(screen.getByRole('status').textContent).toBe('已向 1 位同事发送邀请');
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 1, totalCount: 2, workspaceId: 'one', workspaceMemberId: 'member-one' } })));
    expect(screen.getByRole('status').textContent).toBe('已向 2 位同事发送邀请');
  });
  it('allows dismissing the successful invitation toast without restoring the banner', () => {
    render(view());
    act(() => window.dispatchEvent(new CustomEvent(WORKSPACE_INVITES_SENT, { detail: { count: 1, workspaceId: 'one', workspaceMemberId: 'member-one' } })));
    const toast = screen.getByRole('status');
    expect(toast.classList.contains('tone-success')).toBe(true);
    expect(toast.classList.contains('placement-top')).toBe(true);
    fireEvent.click(toast.querySelector('button')!);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('offers both signed-out invite entries through authentication and waits for current workspace identity', () => {
    const local = (signedOut: boolean, ready: boolean) => <I18nProvider initial="zh-CN"><HomeInviteTrigger context={signedOut ? null : context} signedOut={signedOut} /><HomeInviteSurface accountId={signedOut ? null : 'account-one'} context={signedOut ? null : context} active signedOut={signedOut} identityReady={ready} /></I18nProvider>;
    const result = render(local(true, false));
    expect(screen.getByRole('region', { name: '邀请' })).toBeTruthy();
    const entries = screen.getAllByRole('button', { name: '邀请' });
    expect(entries).toHaveLength(2);
    fireEvent.click(entries[0]!); fireEvent.click(entries[1]!);
    expect(login.begin).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => login.success?.());
    result.rerender(local(false, false));
    expect(screen.queryByRole('dialog')).toBeNull();
    result.rerender(local(false, true));
    expect(screen.getByRole('dialog', { name: '邀请成员' })).toBeTruthy();
  });
  it('does not show an invitation surface while signed out or revoked', () => {
    const result = render(<I18nProvider initial="zh-CN"><HomeInviteSurface accountId={null} context={null} active /></I18nProvider>);
    expect(screen.queryByRole('region')).toBeNull();
    result.rerender(view('account-one', { ...context, memberStatus: 'removed' }));
    expect(screen.queryByRole('button', { name: '邀请' })).toBeNull();
  });
  it('hands signed-out entries to the welcome screen and consumes their returned invitation only after identity resolves', () => {
    const requestSignIn = vi.fn();
    const consumed = vi.fn();
    const local = (signedOut: boolean, ready: boolean, pending = false) => <I18nProvider initial="zh-CN"><HomeInviteTrigger context={signedOut ? null : context} signedOut={signedOut} /><HomeInviteSurface accountId={signedOut ? null : 'account-one'} context={signedOut ? null : context} active signedOut={signedOut} identityReady={ready} onSignInRequested={requestSignIn} openAfterSignIn={pending} onSignInInviteConsumed={consumed} /></I18nProvider>;
    const result = render(local(true, false));
    const entries = screen.getAllByRole('button', { name: '邀请' });
    fireEvent.click(entries[0]!);
    fireEvent.click(entries[1]!);
    expect(requestSignIn).toHaveBeenCalledTimes(2);
    expect(login.begin).not.toHaveBeenCalled();
    result.rerender(local(false, false, true));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(consumed).not.toHaveBeenCalled();
    result.rerender(local(false, true, true));
    expect(screen.getByRole('dialog', { name: '邀请成员' })).toBeTruthy();
    expect(consumed).toHaveBeenCalledTimes(1);
    result.rerender(local(false, true, false));
    expect(consumed).toHaveBeenCalledTimes(1);
  });
});
