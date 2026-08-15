import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollabPublishScheduler } from '../src/collab/publish-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('CollabPublishScheduler', () => {
  it('coalesces rapid changes into a single publish', async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockResolvedValue({ version: 1 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100 });

    scheduler.notifyChanged('p1');
    scheduler.notifyChanged('p1');
    scheduler.notifyChanged('p1');
    expect(publish).not.toHaveBeenCalled(); // still inside the coalesce window

    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({ projectId: 'p1', reason: 'change' });
  });

  it('flushes immediately at a run boundary instead of waiting out the debounce', async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockResolvedValue({ version: 2 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 10_000 });

    scheduler.notifyChanged('p1', 'run');
    expect(publish).not.toHaveBeenCalled();

    scheduler.runBoundary('p1');
    // flush() calls the adapter synchronously up to its first await.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({ projectId: 'p1', reason: 'run' });
  });

  it('re-publishes when a change arrives while a publish is in flight (no lost change)', async () => {
    vi.useFakeTimers();
    let settleFirst: (value: { version: number }) => void = () => {};
    const publish = vi
      .fn()
      .mockImplementationOnce(() => new Promise<{ version: number }>((resolve) => {
        settleFirst = resolve;
      }))
      .mockResolvedValue({ version: 2 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100 });

    scheduler.notifyChanged('p1', 'first');
    await vi.advanceTimersByTimeAsync(100); // fires publish #1, which stays pending
    expect(publish).toHaveBeenCalledTimes(1);

    scheduler.notifyChanged('p1', 'later'); // lands mid-publish → marked dirty
    expect(publish).toHaveBeenCalledTimes(1);

    settleFirst({ version: 1 }); // publish #1 settles → dirty re-schedules
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith({ projectId: 'p1', reason: 'later' });
  });

  it('reports the published version so the orchestrator can notify members', async () => {
    vi.useFakeTimers();
    const onPublished = vi.fn();
    const scheduler = new CollabPublishScheduler({
      adapter: { publish: vi.fn().mockResolvedValue({ version: 7 }) },
      debounceMs: 50,
      onPublished,
    });

    scheduler.notifyChanged('p1', 'save');
    await vi.advanceTimersByTimeAsync(50);
    expect(onPublished).toHaveBeenCalledWith({ projectId: 'p1', version: 7, reason: 'save' });
  });

  it('routes a publish failure to onError and stays usable', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const boom = new Error('hub down');
    const publish = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue({ version: 1 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 50, onError });

    scheduler.notifyChanged('p1');
    await vi.advanceTimersByTimeAsync(50);
    expect(onError).toHaveBeenCalledWith({ projectId: 'p1', error: boom });

    // A later change still publishes — a failed publish must not wedge the scheduler.
    scheduler.notifyChanged('p1');
    await vi.advanceTimersByTimeAsync(50);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('keeps per-project publishes independent', async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockResolvedValue({ version: 1 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100 });

    scheduler.notifyChanged('a');
    scheduler.notifyChanged('b');
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.map((call) => call[0].projectId).sort()).toEqual(['a', 'b']);
  });
});

// Red spec for publish-failure recovery. Before it existed, flush()'s catch
// only reported the error: nothing ever re-attempted the publish, so one
// transient hub/network failure left the project stuck in its failed sync
// state until the author happened to edit again.
describe('CollabPublishScheduler publish-failure retry', () => {
  it('retries a failed publish on the backoff schedule and stops once it succeeds', async () => {
    vi.useFakeTimers();
    const onPublished = vi.fn();
    const onError = vi.fn();
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('hub down'))
      .mockResolvedValue({ version: 3 });
    const scheduler = new CollabPublishScheduler({
      adapter: { publish },
      debounceMs: 100,
      onPublished,
      onError,
    });

    scheduler.notifyChanged('p1', 'edit');
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(publish).toHaveBeenCalledTimes(1); // not before the first 5s backoff
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenCalledTimes(2);
    // No author change happened in between → the retry keeps the original reason.
    expect(publish).toHaveBeenLastCalledWith({ projectId: 'p1', reason: 'edit' });
    expect(onPublished).toHaveBeenCalledWith({ projectId: 'p1', version: 3, reason: 'edit' });

    // Success ends the recovery — nothing else fires afterwards.
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('gives up after three consecutive retries until the next author change', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const publish = vi.fn().mockRejectedValue(new Error('hub down'));
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100, onError });

    scheduler.notifyChanged('p1');
    await vi.advanceTimersByTimeAsync(100); // initial attempt fails
    await vi.advanceTimersByTimeAsync(5_000); // retry 1
    await vi.advanceTimersByTimeAsync(15_000); // retry 2
    await vi.advanceTimersByTimeAsync(45_000); // retry 3
    expect(publish).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(4);

    // Budget exhausted → the scheduler goes quiet instead of retrying forever.
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(publish).toHaveBeenCalledTimes(4);

    // A fresh author change restores the full retry budget.
    scheduler.notifyChanged('p1', 'edit-again');
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(5);
    expect(publish).toHaveBeenLastCalledWith({ projectId: 'p1', reason: 'edit-again' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(publish).toHaveBeenCalledTimes(6);
  });

  it('a success resets the consecutive-failure streak', async () => {
    vi.useFakeTimers();
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('hub down'))
      .mockResolvedValueOnce({ version: 1 })
      .mockRejectedValueOnce(new Error('hub down again'))
      .mockResolvedValue({ version: 2 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100 });

    scheduler.notifyChanged('p1');
    await vi.advanceTimersByTimeAsync(100); // fails
    await vi.advanceTimersByTimeAsync(5_000); // retry succeeds
    expect(publish).toHaveBeenCalledTimes(2);

    scheduler.notifyChanged('p1');
    await vi.advanceTimersByTimeAsync(100); // fails again — a NEW streak
    expect(publish).toHaveBeenCalledTimes(3);
    // The retry fires at the first backoff step again, not deeper in the schedule.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(publish).toHaveBeenCalledTimes(4);
  });

  it('a change during a failing publish follows the dirty path without stacking a retry', async () => {
    vi.useFakeTimers();
    let rejectFirst: (error: Error) => void = () => {};
    const publish = vi
      .fn()
      .mockImplementationOnce(() => new Promise<never>((_resolve, reject) => {
        rejectFirst = reject;
      }))
      .mockResolvedValue({ version: 2 });
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100 });

    scheduler.notifyChanged('p1', 'first');
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(1);

    scheduler.notifyChanged('p1', 'later'); // lands mid-publish → marked dirty
    rejectFirst(new Error('hub down'));
    await vi.advanceTimersByTimeAsync(0); // let the rejection settle

    // The dirty re-publish arrives on the debounce window, not the retry backoff…
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith({ projectId: 'p1', reason: 'later' });

    // …and no additional retry was stacked on top of the dirty path.
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('dispose cancels a pending retry', async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockRejectedValue(new Error('hub down'));
    const scheduler = new CollabPublishScheduler({ adapter: { publish }, debounceMs: 100 });

    scheduler.notifyChanged('p1');
    await vi.advanceTimersByTimeAsync(100);
    expect(publish).toHaveBeenCalledTimes(1); // failed → a retry is pending

    scheduler.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
