// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingInviteView } from '../../src/components/InviteDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';
import { I18nProvider } from '../../src/i18n';
vi.mock('../../src/components/LanguageMenu', () => ({ LanguageMenu: () => null }));
const context = workspaceContextFixture({ workspaceId: 'team-a', workspaceMemberId: 'owner-a', role: 'owner' });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mount(onFinish = vi.fn()) { render(<I18nProvider initial="zh-CN"><OnboardingInviteView workspaceContext={context} onFinish={onFinish} /></I18nProvider>); return onFinish; }
function email(value: string, index = 0) { fireEvent.change(screen.getAllByRole('textbox')[index]!, { target: { value } }); }
const response = (results: unknown[]) => new Response(JSON.stringify({ results }), { status: 200 });
async function send() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送邀请' })); }); }
describe('registration invitation guidance', () => {
  it('uses the original rider art, two-line explanation and skip without cancel or premature success event', () => {
    const finish = mount();
    expect(screen.getByText('免费邀请同事，一起做设计')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/onboarding/registration-invite-art.webp');
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' }));
    expect(finish).toHaveBeenCalledWith(0, 'skipped');
  });
  it('keeps the member role read-only for a non-owner registration', () => {
    render(<I18nProvider initial="zh-CN"><OnboardingInviteView workspaceContext={{ ...context, role: 'member' }} onFinish={vi.fn()} /></I18nProvider>);
    expect(screen.getByText('成员')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '角色' })).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('keeps an existing-member conflict local without a misleading batch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'member@example.com', ok: false, error: 'already_member' }])));
    const finish = mount(); email('member@example.com'); await send();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe('此邮箱已是工作空间成员，无需邀请');
    expect(screen.queryByText('邀请发送失败，请检查网络后重试')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('member@example.com');
    expect(finish).not.toHaveBeenCalled();
  });
  it('automatically enters after three seconds without emitting the ordinary-dialog event', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'a@example.com', ok: true }])));
    const event = vi.fn(); window.addEventListener('od:workspace-invites-sent', event);
    try {
      const finish = mount(); email('a@example.com'); await send();
      expect(screen.getByText(/已向 1 位同事发送邀请，/)).toBeTruthy();
      expect(finish).not.toHaveBeenCalled(); expect(event).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(2999)); expect(finish).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(181)); expect(finish).toHaveBeenCalledWith(1, 'sent');
      fireEvent.click(screen.getByRole('button', { name: '进入工作台' })); expect(finish).toHaveBeenCalledTimes(1); expect(event).not.toHaveBeenCalled();
    } finally { window.removeEventListener('od:workspace-invites-sent', event); }
  });
  it('retains only failed rows, briefly shows batch success and returns the confirmed cumulative count on skip', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => response([
      { email: 'sent@example.com', ok: true }, { email: 'retry@example.com', ok: false, error: 'active_pending_invite' },
    ])));
    const finish = mount(); email('sent@example.com'); fireEvent.click(screen.getByRole('button', { name: '添加成员' })); email('retry@example.com', 1); await send();
    expect((screen.getByRole('button', { name: '已邀请 1 位同事' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('已发送 1 位，1 位未发送。请修改或重试失败项，已发送项不会重复发送。')).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('retry@example.com');
    act(() => vi.advanceTimersByTime(650));
    expect((screen.getByRole('button', { name: '发送邀请' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' })); expect(finish).toHaveBeenCalledWith(1, 'skipped');
  });
  it('counts only confirmed successes across partial batches and a final retry', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response([
      { email: 'sent@example.com', ok: true }, { email: 'retry@example.com', ok: false, error: 'no_session' },
    ])).mockResolvedValueOnce(response([{ email: 'retry@example.com', ok: true }]));
    vi.stubGlobal('fetch', fetcher);
    const finish = mount(); email('sent@example.com'); fireEvent.click(screen.getByRole('button', { name: '添加成员' })); email('retry@example.com', 1); await send();
    act(() => vi.advanceTimersByTime(650)); await send();
    expect(finish).not.toHaveBeenCalled();
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ invites: [{ email: 'retry@example.com', role: 'member', idempotencyKey: expect.any(String) }] });
    act(() => vi.advanceTimersByTime(2999)); expect(finish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
    act(() => vi.advanceTimersByTime(180)); expect(finish).toHaveBeenCalledTimes(1); expect(finish).toHaveBeenCalledWith(2, 'sent');
    act(() => vi.advanceTimersByTime(5000)); expect(finish).toHaveBeenCalledTimes(1);
  });
  it('keeps all input and restores sending after complete failure without counting unsent rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'a@example.com', ok: false, error: 'create_unreachable' }])));
    const finish = mount(); email('a@example.com'); await send();
    expect(screen.getAllByRole('alert').some(node => node.textContent?.startsWith('邀请发送失败，请检查网络后重试'))).toBe(true);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('a@example.com');
    expect((screen.getByRole('button', { name: '发送邀请' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' })); expect(finish).toHaveBeenCalledWith(0, 'skipped');
  });
  it('cancels delayed completion when the workspace identity changes', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'a@example.com', ok: true }])));
    const finish = vi.fn();
    const view = render(<I18nProvider initial="zh-CN"><OnboardingInviteView workspaceContext={context} onFinish={finish} /></I18nProvider>);
    email('a@example.com'); await send();
    view.rerender(<I18nProvider initial="zh-CN"><OnboardingInviteView workspaceContext={{ ...context, workspaceId: 'other' }} onFinish={finish} /></I18nProvider>);
    act(() => vi.advanceTimersByTime(1000)); expect(finish).not.toHaveBeenCalled();
  });
});


describe('B04/B05 reference behavior', () => {
  it('focuses each newly added recipient, including beyond three visible rows', () => {
    mount();
    for (let index = 1; index <= 4; index++) {
      fireEvent.click(screen.getByRole('button', { name: '添加成员' }));
      expect(document.activeElement).toBe(screen.getAllByRole('textbox')[index]);
    }
  });
  it('uses native email validity rather than requiring a dotted domain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'colleague@localhost', ok: true }])));
    mount(); email('colleague@localhost'); await send();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '进入工作台' })).toBeTruthy();
  });
});


describe('B09 completion transition', () => {
  it('cancels the pending fade callback when the invitation view leaves', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'one@example.com', ok: true }])));
    const finish = vi.fn();
    const view = render(<I18nProvider initial="zh-CN"><OnboardingInviteView workspaceContext={context} onFinish={finish} /></I18nProvider>);
    email('one@example.com'); await send();
    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
    act(() => vi.advanceTimersByTime(179)); expect(finish).not.toHaveBeenCalled();
    view.unmount(); act(() => vi.advanceTimersByTime(5000)); expect(finish).not.toHaveBeenCalled();
  });
  it('enters directly when the user prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.stubGlobal('fetch', vi.fn(async () => response([{ email: 'one@example.com', ok: true }])));
    const finish = mount(); email('one@example.com'); await send();
    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
    expect(finish).toHaveBeenCalledExactlyOnceWith(1, 'sent');
  });
});
