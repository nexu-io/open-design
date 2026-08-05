// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceSnapshotActivation,
  WORKSPACE_SNAPSHOT_FALLBACK_MS,
} from '../../src/collab/workspace-snapshot-activation';

function Harness({
  enabled = true,
  identity = 'team-a',
  refresh,
  expose,
}: {
  enabled?: boolean;
  identity?: string;
  refresh: () => void;
  expose: (onActive: () => void) => void;
}) {
  expose(useWorkspaceSnapshotActivation({ enabled, identity, refresh }));
  return null;
}

describe('useWorkspaceSnapshotActivation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('lets first onActive own the Team snapshot and cancels the fallback', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let onActive = () => {};
    render(<Harness refresh={refresh} expose={(callback) => { onActive = callback; }} />);

    act(() => onActive());
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_FALLBACK_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('falls back after 250ms, then forces a fresh read when SSE opens later', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let onActive = () => {};
    render(<Harness refresh={refresh} expose={(callback) => { onActive = callback; }} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_FALLBACK_MS - 1);
    });
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    // Never join the fallback: it may have been server-side snapshotted before
    // the stream opened even if its browser Promise is still pending.
    act(() => onActive());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does nothing while disabled', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let onActive = () => {};
    render(<Harness enabled={false} refresh={refresh} expose={(callback) => { onActive = callback; }} />);
    act(() => onActive());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_FALLBACK_MS * 2);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects an old identity callback after the lifecycle moves to B', () => {
    const refresh = vi.fn();
    const callbacks: Array<() => void> = [];
    const view = render(
      <Harness identity="team-a" refresh={refresh} expose={(callback) => callbacks.push(callback)} />,
    );
    const fromA = callbacks.at(-1)!;
    view.rerender(
      <Harness identity="team-b" refresh={refresh} expose={(callback) => callbacks.push(callback)} />,
    );

    act(() => fromA());
    expect(refresh).not.toHaveBeenCalled();
    act(() => callbacks.at(-1)!());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
