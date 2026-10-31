import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSharedDisplayRefresh } from '../../src/collab/shared-display-refresh';

describe('shared display refresh lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits five seconds after a deferred read completes and retains a late runtime completion nudge', async () => {
    const refreshes = createSharedDisplayRefresh(5_000);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const read = vi.fn().mockImplementationOnce(() => pending).mockResolvedValue(undefined);
    const release = refreshes.retain('workspace/member/revision', read);
    refreshes.invalidate('workspace/member/revision', 'quota:1');
    await vi.advanceTimersByTimeAsync(1_000);
    refreshes.invalidate('workspace/member/revision', 'wallet:2');
    await vi.advanceTimersByTimeAsync(9_000);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    // An upstream catch-up completing just after the trailing read still gets
    // a final read, without bypassing the request-frequency bound.
    refreshes.invalidate('workspace/member/revision', 'revision:runtime:3');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels orphan trailing work and retains the same-identity cooldown across remount', async () => {
    const refreshes = createSharedDisplayRefresh(5_000);
    const read = vi.fn().mockResolvedValue(undefined);
    const release = refreshes.retain('a/member/revision-1', read);
    refreshes.invalidate('a/member/revision-1', 'wallet:1');
    await vi.advanceTimersByTimeAsync(1_000);
    refreshes.invalidate('a/member/revision-1', 'wallet:2');
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(1);
    const remount = refreshes.retain('a/member/revision-1', read);
    refreshes.invalidate('a/member/revision-1', 'wallet:3');
    await vi.advanceTimersByTimeAsync(2_999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    remount();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates identity changes and discards retired-scope events and reset timers', async () => {
    const refreshes = createSharedDisplayRefresh(5_000);
    const oldRead = vi.fn().mockResolvedValue(undefined);
    const newRead = vi.fn().mockResolvedValue(undefined);
    const releaseOld = refreshes.retain('a/member/epoch-1', oldRead);
    refreshes.invalidate('a/member/epoch-1', 'wallet:1');
    await vi.advanceTimersByTimeAsync(0);
    refreshes.invalidate('a/member/epoch-1', 'wallet:2');
    releaseOld();
    refreshes.retain('a/member/epoch-2', newRead);
    refreshes.invalidate('a/member/epoch-2', 'wallet:3');
    refreshes.invalidate('a/member/epoch-1', 'wallet:late');
    await vi.advanceTimersByTimeAsync(0);
    expect(oldRead).toHaveBeenCalledTimes(1);
    expect(newRead).toHaveBeenCalledTimes(1);
    refreshes.invalidate('a/member/epoch-2', 'wallet:4');
    refreshes.reset();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(oldRead).toHaveBeenCalledTimes(1);
    expect(newRead).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
