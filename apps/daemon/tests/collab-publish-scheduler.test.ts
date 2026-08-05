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
