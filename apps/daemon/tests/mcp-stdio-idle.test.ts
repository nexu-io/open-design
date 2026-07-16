import { afterEach, describe, expect, it, vi } from 'vitest';
import { _createMcpIdleExitController } from '../src/mcp.js';

describe('MCP stdio idle exit controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits after the idle window elapses', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    _createMcpIdleExitController({ idleMs: 1_000, onIdle });

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resets the idle window when activity arrives', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const idleExit = _createMcpIdleExitController({ idleMs: 1_000, onIdle });

    vi.advanceTimersByTime(750);
    idleExit.noteActivity();

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not exit while a request is in flight', async () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const idleExit = _createMcpIdleExitController({ idleMs: 1_000, onIdle });
    let resolveRequest!: () => void;

    const request = idleExit.trackRequest(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onIdle).not.toHaveBeenCalled();

    resolveRequest();
    await request;

    await vi.advanceTimersByTimeAsync(999);
    expect(onIdle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending exit when disposed', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const idleExit = _createMcpIdleExitController({ idleMs: 1_000, onIdle });

    idleExit.dispose();
    vi.advanceTimersByTime(1_000);

    expect(onIdle).not.toHaveBeenCalled();
  });
});
