// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(events.onDismiss).not.toHaveBeenCalled();
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
  it('fences A→B→A completion even when the final string identity is equal', () => {
    const { result, rerender } = renderHook(input => useAfterExportShareGuide(input), { initialProps: eligible });
    const old = result.current.beginExport();
    rerender({ ...eligible, scopeKey: 'other-file' });
    rerender(eligible);
    act(() => old('success'));
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
