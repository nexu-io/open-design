import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEventRefreshCoordinator } from '../../src/collab/event-refresh-coordinator.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('event refresh coordinator', () => {
  it('runs the leading refresh immediately and collapses a storm to the latest trailing refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let releaseLeading!: () => void;
    const leadingBlocked = new Promise<void>((resolve) => {
      releaseLeading = resolve;
    });
    const calls: string[] = [];
    const coordinator = createEventRefreshCoordinator({ minIntervalMs: 250 });

    coordinator.request('workspace-a', async () => {
      calls.push('leading');
      await leadingBlocked;
    }, 'revision:1');
    // The first refresh starts in the event handler's turn. Authority
    // invalidation must not trail sibling reconnect/read work by a microtask.
    expect(calls).toEqual(['leading']);

    for (let revision = 2; revision <= 100; revision += 1) {
      coordinator.request('workspace-a', () => {
        calls.push(`revision:${revision}`);
      }, `revision:${revision}`);
    }
    releaseLeading();
    await vi.advanceTimersByTimeAsync(249);
    expect(calls).toEqual(['leading']);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['leading', 'revision:100']);
    coordinator.dispose();
  });

  it('deduplicates repeated revision tokens but keeps independent resources concurrent', async () => {
    const calls: string[] = [];
    const coordinator = createEventRefreshCoordinator({ minIntervalMs: 0 });

    coordinator.request('workspace-a', () => {
      calls.push('a');
    }, 'revision:1');
    coordinator.request('workspace-a', () => {
      calls.push('duplicate');
    }, 'revision:1');
    coordinator.request('workspace-b', () => {
      calls.push('b');
    }, 'revision:1');
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    expect(calls.sort()).toEqual(['a', 'b']);
    coordinator.request('workspace-a', () => {
      calls.push('duplicate-after-settle');
    }, 'revision:1');
    await Promise.resolve();
    expect(calls.sort()).toEqual(['a', 'b']);
    coordinator.dispose();
  });

  it('continues with one trailing refresh after the leading refresh fails', async () => {
    const errors: string[] = [];
    const calls: string[] = [];
    let releaseLeading!: () => void;
    const leadingBlocked = new Promise<void>((resolve) => {
      releaseLeading = resolve;
    });
    const coordinator = createEventRefreshCoordinator({
      minIntervalMs: 0,
      onError: (error) => errors.push(String(error)),
    });

    coordinator.request('workspace-a', async () => {
      calls.push('leading');
      await leadingBlocked;
      throw new Error('offline');
    });
    await vi.waitFor(() => expect(calls).toEqual(['leading']));
    coordinator.request('workspace-a', () => {
      calls.push('trailing');
    });
    releaseLeading();

    await vi.waitFor(() => expect(calls).toEqual(['leading', 'trailing']));
    expect(errors).toEqual(['Error: offline']);
    coordinator.dispose();
  });

  it('does not revive a lane when an active refresh settles after dispose', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const coordinator = createEventRefreshCoordinator({ minIntervalMs: 0 });

    coordinator.request('workspace-a', async () => {
      calls.push('leading');
      await blocked;
    });
    coordinator.request('workspace-a', () => {
      calls.push('trailing');
    });
    coordinator.dispose();
    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(['leading']);
  });
});
