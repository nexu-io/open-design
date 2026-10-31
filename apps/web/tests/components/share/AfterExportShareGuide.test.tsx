// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { AfterExportShareGuide } from '../../../src/components/share/AfterExportShareGuide';

import { useAfterExportShareGuide } from '../../../src/components/share/useAfterExportShareGuide';

const labels = {
  title: 'Share the link, invite feedback',
  description: 'Share the link to collect comments directly.',
  openShare: 'Try sharing',
  neverShow: 'Never show again',
  close: 'Close new feature guide',
  saveFailed: 'Could not save preference',
};
function callbacks() { return { onOpenShare: vi.fn(), onDismiss: vi.fn(), onNeverShow: vi.fn(() => true) }; }
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('after export share guide', () => {
  it('renders the Owner-P1 card: title, description, close, and the two footer actions', () => {
    // "交互状态 - Owner - 分享评论1.0.html", `phase-owner-intro` scope: a
    // dark comment-bubble hero with a standalone close (✕) button, then
    // title/description body, then the actions pair (dismiss + try-share).
    // Supersedes the earlier Board8 source this suite previously restored
    // from, which had no close control — this design review's PNG capture
    // and markup both show one.
    const events = callbacks();
    render(<AfterExportShareGuide labels={labels} {...events} />);
    const guide = screen.getByRole('status', { name: labels.title });
    expect(guide.getAttribute('data-design-status')).toBeNull();
    expect(screen.getByText(labels.description)).not.toBeNull();
    expect(screen.getByRole('button', { name: labels.close })).not.toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
  it('closing via the ✕ dismisses this occurrence without persisting the preference', () => {
    const events = callbacks();
    render(<AfterExportShareGuide labels={labels} {...events} />);
    fireEvent.click(screen.getByRole('button', { name: labels.close }));
    expect(events.onDismiss).toHaveBeenCalledTimes(1);
    expect(events.onNeverShow).not.toHaveBeenCalled();
    expect(events.onOpenShare).not.toHaveBeenCalled();
  });
  it('Escape dismisses this occurrence without persisting suppression', () => {
    const events = callbacks();
    render(<AfterExportShareGuide labels={labels} {...events} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(events.onDismiss).toHaveBeenCalledTimes(1);
    expect(events.onNeverShow).not.toHaveBeenCalled();
  });
  it('opens share without invoking permanent suppression', () => {
    const events = callbacks();
    render(<AfterExportShareGuide labels={labels} {...events} />);
    fireEvent.click(screen.getByRole('button', { name: labels.openShare }));
    expect(events.onOpenShare).toHaveBeenCalledTimes(1);
    expect(events.onDismiss).toHaveBeenCalledTimes(1);
    expect(events.onNeverShow).not.toHaveBeenCalled();
  });
  it('never-show persists the preference, then dismisses this occurrence', () => {
    const events = callbacks();
    render(<AfterExportShareGuide labels={labels} {...events} />);
    fireEvent.click(screen.getByRole('button', { name: labels.neverShow }));
    expect(events.onNeverShow).toHaveBeenCalledTimes(1);
    expect(events.onDismiss).toHaveBeenCalledTimes(1);
  });
  it('reports persistence failure instead of falsely promising permanent suppression', () => {
    const events = callbacks();
    events.onNeverShow.mockReturnValue(false);
    render(<AfterExportShareGuide labels={labels} {...events} />);
    fireEvent.click(screen.getByRole('button', { name: labels.neverShow }));
    expect(screen.getByRole('alert').textContent).toBe(labels.saveFailed);
    expect(events.onDismiss).not.toHaveBeenCalled();
  });
  it('expires exactly at ten seconds even when callbacks rerender', () => {
    const events = callbacks();
    const view = render(<AfterExportShareGuide labels={labels} {...events} />);
    act(() => vi.advanceTimersByTime(9_000));
    view.rerender(<AfterExportShareGuide labels={labels} {...events} onDismiss={() => events.onDismiss()} />);
    act(() => vi.advanceTimersByTime(999));
    expect(events.onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(events.onDismiss).toHaveBeenCalledTimes(1);
  });
  it('pauses until both hover and descendant focus have left', () => {
    const events = callbacks();
    render(<AfterExportShareGuide labels={labels} {...events} />);
    const region = screen.getByRole('status', { name: labels.title });
    const button = screen.getByRole('button', { name: labels.openShare });
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.mouseEnter(region);
    fireEvent.focus(button);
    fireEvent.mouseLeave(region);
    act(() => vi.advanceTimersByTime(20_000));
    expect(events.onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(button, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(6_999));
    expect(events.onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(events.onDismiss).toHaveBeenCalledTimes(1);
  });
  it('cleans up its timer when the host changes scope and unmounts it', () => {
    const events = callbacks();
    const view = render(<AfterExportShareGuide labels={labels} {...events} />);
    view.unmount();
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(events.onDismiss).not.toHaveBeenCalled();
  });
});


describe('guide observation is independent of business actions', () => {
  const modes = ['absent', 'no-op', 'recording', 'throwing', 'pending'] as const;
  type Event = 'view' | 'try_share' | 'close' | 'never_show_again';
  function observer(mode: typeof modes[number], order: string[]) {
    if (mode === 'absent') return undefined;
    return vi.fn((event: Event) => {
      if (mode !== 'no-op') order.push(event);
      if (mode === 'throwing') throw new Error('measurement failed');
      if (mode === 'pending') return new Promise<void>(() => {});
    });
  }
  const actions = [
    { name: 'close', label: labels.close, event: 'close', business: ['dismiss'], saved: true },
    { name: 'try share', label: labels.openShare, event: 'try_share', business: ['dismiss', 'open'], saved: true },
    { name: 'never show success', label: labels.neverShow, event: 'never_show_again', business: ['save', 'dismiss'], saved: true },
    { name: 'never show failure', label: labels.neverShow, event: 'never_show_again', business: ['save'], saved: false },
  ] as const;
  describe.each(modes)('%s observer', mode => {
    it.each(actions)('preserves $name callback order and error UI', action => {
      const order: string[] = [];
      const onObserve = observer(mode, order);
      const onDismiss = vi.fn(() => { order.push('dismiss'); });
      const onOpenShare = vi.fn(() => { order.push('open'); });
      const onNeverShow = vi.fn(() => { order.push('save'); return action.saved; });
      render(<AfterExportShareGuide labels={labels} onObserve={onObserve} onDismiss={onDismiss} onOpenShare={onOpenShare} onNeverShow={onNeverShow} />);
      fireEvent.click(screen.getByRole('button', { name: action.label }));
      const measured = mode !== 'absent' && mode !== 'no-op';
      expect(order).toEqual([...(measured ? ['view', action.event] : []), ...action.business]);
      if (onObserve) expect(onObserve.mock.calls.map(([event]) => event)).toEqual(['view', action.event]);
      expect(onDismiss).toHaveBeenCalledTimes(action.business.some(callback => callback === 'dismiss') ? 1 : 0);
      expect(onOpenShare).toHaveBeenCalledTimes(action.name === 'try share' ? 1 : 0);
      expect(onNeverShow).toHaveBeenCalledTimes(action.label === labels.neverShow ? 1 : 0);
      if (!action.saved) expect(screen.getByRole('alert').textContent).toBe(labels.saveFailed);
      else expect(screen.queryByRole('alert')).toBeNull();
    });
    it('keeps the ten-second deadline across observer identity changes without a close event', () => {
      const order: string[] = [];
      const first = observer(mode, order);
      const second = observer(mode, order);
      const events = callbacks();
      const view = render(<AfterExportShareGuide labels={labels} {...events} onObserve={first} />);
      act(() => vi.advanceTimersByTime(9_000));
      view.rerender(<AfterExportShareGuide labels={labels} {...events} onObserve={second} />);
      act(() => vi.advanceTimersByTime(999));
      expect(events.onDismiss).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(events.onDismiss).toHaveBeenCalledTimes(1);
      if (first) expect(first).toHaveBeenCalledExactlyOnceWith('view');
      if (second) expect(second).not.toHaveBeenCalled();
    });
    it('keeps hover and descendant focus pauses across observer identity changes', () => {
      const order: string[] = [];
      const first = observer(mode, order);
      const second = observer(mode, order);
      const events = callbacks();
      const view = render(<AfterExportShareGuide labels={labels} {...events} onObserve={first} />);
      const region = screen.getByRole('status', { name: labels.title });
      const button = screen.getByRole('button', { name: labels.openShare });
      act(() => vi.advanceTimersByTime(3_000));
      fireEvent.mouseEnter(region);
      fireEvent.focus(button);
      view.rerender(<AfterExportShareGuide labels={labels} {...events} onObserve={second} />);
      fireEvent.mouseLeave(region);
      act(() => vi.advanceTimersByTime(20_000));
      expect(events.onDismiss).not.toHaveBeenCalled();
      fireEvent.blur(button, { relatedTarget: screen.getByRole('button', { name: labels.close }) });
      act(() => vi.advanceTimersByTime(20_000));
      expect(events.onDismiss).not.toHaveBeenCalled();
      fireEvent.blur(button, { relatedTarget: document.body });
      act(() => vi.advanceTimersByTime(6_999));
      expect(events.onDismiss).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(events.onDismiss).toHaveBeenCalledTimes(1);
      if (first) expect(first).toHaveBeenCalledExactlyOnceWith('view');
      if (second) expect(second).not.toHaveBeenCalled();
    });
  });
  it('exposes once per keyed instance despite StrictMode replay and rerender, using the current click observer', () => {
    const events = callbacks();
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<StrictMode><AfterExportShareGuide key="one" labels={labels} {...events} onObserve={first} /></StrictMode>);
    expect(first).toHaveBeenCalledExactlyOnceWith('view');
    view.rerender(<StrictMode><AfterExportShareGuide key="one" labels={labels} {...events} onObserve={second} /></StrictMode>);
    expect(second).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: labels.close }));
    expect(second).toHaveBeenCalledExactlyOnceWith('close');
    view.rerender(<StrictMode><AfterExportShareGuide key="two" labels={labels} {...events} onObserve={second} /></StrictMode>);
    expect(second.mock.calls).toEqual([['close'], ['view']]);
  });
});


describe('export completion controller', () => {
  beforeEach(() => window.localStorage.clear());
  const eligible = { scopeKey: 'account/project/file', appUserId: 'account', hasEverShared: false, enabled: true };
  it('opens once per successful attempt; close permits the next attempt', () => {
    const { result } = renderHook(() => useAfterExportShareGuide(eligible));
    const complete = result.current.beginExport();
    act(() => complete('success'));
    expect(result.current.noticeId).toBe(1);
    act(() => result.current.dismiss());
    act(() => complete('success'));
    expect(result.current.noticeId).toBeNull();
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBe(2);
  });
  it.each(['cancelled', 'failed'] as const)('does not open after %s', outcome => {
    const { result } = renderHook(() => useAfterExportShareGuide(eligible));
    act(() => result.current.beginExport()(outcome));
    expect(result.current.noticeId).toBeNull();
  });
  it('keeps permanent suppression across remount and isolates another identity', () => {
    const first = renderHook(() => useAfterExportShareGuide(eligible));
    act(() => first.result.current.beginExport()('success'));
    act(() => { expect(first.result.current.neverShow()).toBe(true); });
    first.unmount();
    const second = renderHook(() => useAfterExportShareGuide(eligible));
    act(() => second.result.current.beginExport()('success'));
    expect(second.result.current.noticeId).toBeNull();
    const other = renderHook(() => useAfterExportShareGuide({ ...eligible, appUserId: 'other-account' }));
    act(() => other.result.current.beginExport()('success'));
    expect(other.result.current.noticeId).not.toBeNull();
  });
  it('rejects retained suppression callbacks after an account switch, including A→B→A', () => {
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: eligible });
    act(() => result.current.beginExport()('success'));
    const staleNeverShow = result.current.neverShow;
    rerender({ ...eligible, appUserId: 'other-account' });
    act(() => { expect(staleNeverShow()).toBe(false); });
    expect(window.localStorage.length).toBe(0);
    rerender(eligible);
    act(() => { expect(staleNeverShow()).toBe(false); });
    expect(window.localStorage.length).toBe(0);
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).not.toBeNull();
  });
  it.each(['scope', 'disabled', 'loading-identity'] as const)('rejects a retained suppression callback after %s', transition => {
    const initial = { ...eligible, appUserId: 'account' as string | null };
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    const staleNeverShow = result.current.neverShow;
    rerender({ ...initial,
      scopeKey: transition === 'scope' ? 'other-project/file' : initial.scopeKey,
      enabled: transition !== 'disabled',
      appUserId: transition === 'loading-identity' ? null : initial.appUserId,
    });
    expect(staleNeverShow()).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });
  it('keeps suppression through project changes and logout/relogin without affecting another user', () => {
    const initial = { ...eligible, appUserId: 'account' as string | null };
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    act(() => { expect(result.current.neverShow()).toBe(true); });
    rerender({ ...initial, scopeKey: 'another-project/file' });
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBeNull();
    rerender({ ...initial, appUserId: null });
    act(() => { expect(result.current.neverShow()).toBe(false); });
    rerender({ ...initial, appUserId: 'other-account' });
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).not.toBeNull();
    rerender(initial);
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBeNull();
    expect(window.localStorage.length).toBe(1);
  });
  it('allows the current suppression callback after StrictMode effect replay', () => {
    const { result } = renderHook(() => useAfterExportShareGuide(eligible), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    act(() => { expect(result.current.neverShow()).toBe(true); });
    expect(window.localStorage.getItem('od:after-export-share-guide:v1:account')).toBe('1');
  });
  it('rejects retained suppression callbacks after unmount', () => {
    const { result, unmount } = renderHook(() => useAfterExportShareGuide(eligible));
    const neverShow = result.current.neverShow;
    unmount();
    expect(neverShow()).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });
  it('fences A→B→A completion even when the final string identity is equal', () => {
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: eligible });
    const old = result.current.beginExport();
    rerender({ ...eligible, scopeKey: 'other-file' });
    rerender(eligible);
    act(() => old('success'));
    expect(result.current.noticeId).toBeNull();
  });
  it('waits only for an in-flight history read after a saved export, once per attempt', () => {
    const initial = { ...eligible, hasEverShared: null as boolean | null, historyLoading: true };
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    const complete = result.current.beginExport();
    act(() => { complete('success'); complete('success'); });
    expect(result.current.noticeId).toBeNull();
    rerender({ ...initial, hasEverShared: false, historyLoading: false });
    expect(result.current.noticeId).toBe(1);
    act(() => result.current.dismiss());
    act(() => complete('success'));
    expect(result.current.noticeId).toBeNull();
  });
  it('offers once when an in-flight read fails after saving, without replaying on recovery', () => {
    const initial = { ...eligible, hasEverShared: null as boolean | null, historyLoading: true, historyError: false };
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    const complete = result.current.beginExport();
    act(() => complete('success'));
    expect(result.current.noticeId).toBeNull();
    rerender({ ...initial, historyLoading: false, historyError: true });
    expect(result.current.noticeId).toBe(1);
    act(() => result.current.dismiss());
    rerender({ ...initial, hasEverShared: false, historyLoading: false });
    act(() => complete('success'));
    expect(result.current.noticeId).toBeNull();
  });
  it.each(['eligible', 'opt-out', 'unknown-preference', 'missing-account', 'disabled', 'shared', 'cancelled', 'failed'] as const)(
    'failed history read preserves %s eligibility', mode => {
      if (mode === 'opt-out') window.localStorage.setItem('od:after-export-share-guide:v1:account', '1');
      if (mode === 'unknown-preference') window.localStorage.setItem('od:after-export-share-guide:v1:account', 'invalid');
      const { result } = renderHook(() => useAfterExportShareGuide({
        ...eligible, hasEverShared: mode === 'shared' ? true : null, historyError: true,
        appUserId: mode === 'missing-account' ? null : eligible.appUserId, enabled: mode !== 'disabled',
      }));
      act(() => result.current.beginExport()(mode === 'cancelled' || mode === 'failed' ? mode : 'success'));
      expect(result.current.noticeId).toBe(mode === 'eligible' ? 1 : null);
      if (mode === 'opt-out') expect(window.localStorage.getItem('od:after-export-share-guide:v1:account')).toBe('1');
    },
  );
  it.each(['scope', 'account', 'disabled', 'dismissed', 'opt-out', 'unmount'] as const)(
    'failed pending history read does not revive completion after %s', mode => {
      const initial = { ...eligible, appUserId: eligible.appUserId as string | null, hasEverShared: null as boolean | null, historyLoading: true, historyError: false };
      const { result, rerender, unmount } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
      const complete = result.current.beginExport();
      act(() => complete('success'));
      if (mode === 'dismissed') act(() => result.current.dismiss());
      if (mode === 'opt-out') act(() => { expect(result.current.neverShow()).toBe(true); });
      if (mode === 'scope') rerender({ ...initial, scopeKey: 'other-file' });
      if (mode === 'account') rerender({ ...initial, appUserId: 'other-account' });
      if (mode === 'disabled') rerender({ ...initial, enabled: false });
      if (mode === 'unmount') unmount();
      else rerender({ ...initial, historyLoading: false, historyError: true });
      act(() => complete('success'));
      expect(result.current.noticeId).toBeNull();
    },
  );
  it.each(['scope', 'account', 'unmount'] as const)('rejects a saved-export callback retained across %s even on history error', mode => {
    const initial = { ...eligible, hasEverShared: null, historyError: true };
    const { result, rerender, unmount } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    const complete = result.current.beginExport();
    if (mode === 'unmount') unmount();
    else {
      rerender({ ...initial, scopeKey: mode === 'scope' ? 'other-file' : initial.scopeKey, appUserId: mode === 'account' ? 'other-account' : initial.appUserId });
      rerender(initial);
    }
    act(() => complete('success'));
    expect(result.current.noticeId).toBeNull();
  });
  it.each(['unknown-read', 'shared', 'old-scope', 'opt-out', 'dismissed'] as const)('discards pending completion after %s', reason => {
    const initial = { ...eligible, hasEverShared: null as boolean | null, historyLoading: true };
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    act(() => result.current.beginExport()('success'));
    if (reason === 'unknown-read') rerender({ ...initial, historyLoading: false });
    if (reason === 'shared') rerender({ ...initial, hasEverShared: true, historyLoading: false });
    if (reason === 'old-scope') rerender({ ...initial, scopeKey: 'other-file' });
    if (reason === 'opt-out') act(() => { expect(result.current.neverShow()).toBe(true); });
    if (reason === 'dismissed') act(() => result.current.dismiss());
    rerender({ ...initial, hasEverShared: false, historyLoading: false });
    expect(result.current.noticeId).toBeNull();
  });
  it.each(['cancelled', 'failed'] as const)('does not retain %s while history loads', outcome => {
    const initial = { ...eligible, hasEverShared: null as boolean | null, historyLoading: true };
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: initial });
    act(() => result.current.beginExport()(outcome));
    rerender({ ...initial, hasEverShared: false, historyLoading: false });
    expect(result.current.noticeId).toBeNull();
  });
  it('rejects unknown history and existing stopped bindings', () => {
    const { result, rerender } = renderHook((hasEverShared: boolean | null) => useAfterExportShareGuide({ ...eligible, hasEverShared }), { initialProps: null as boolean | null });
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBeNull();
    rerender(true);
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBeNull();
  });
});


describe('account preference scope', () => {
  beforeEach(() => window.localStorage.clear());
  it.each([null, '', '   '])('does not offer or persist with missing appUserId %s', appUserId => {
    const { result } = renderHook(() => useAfterExportShareGuide({ scopeKey: 'workspace-member-is-not-an-account', appUserId, hasEverShared: false, enabled: true }));
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBeNull();
    act(() => { expect(result.current.neverShow()).toBe(false); });
    expect(window.localStorage.length).toBe(0);
  });
  it('retains the same account opt-out across workspace/member/project changes', () => {
    const input = { scopeKey: 'workspace-a/member-a/project-a/file-a', appUserId: 'app-user-1', hasEverShared: false, enabled: true };
    const { result, rerender } = renderHook(value => useAfterExportShareGuide(value), { initialProps: input });
    act(() => { expect(result.current.neverShow()).toBe(true); });
    rerender({ ...input, scopeKey: 'workspace-b/member-b/project-b/file-b' });
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).toBeNull();
    rerender({ ...input, appUserId: 'app-user-2' });
    act(() => result.current.beginExport()('success'));
    expect(result.current.noticeId).not.toBeNull();
  });
});
