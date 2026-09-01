import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _createMcpIdleExitController,
  _resolveMcpStdioIdleExitMs,
} from '../src/mcp.js';

describe('MCP stdio idle exit timeout', () => {
  it('defaults to 30 minutes', () => {
    expect(_resolveMcpStdioIdleExitMs({})).toBe(30 * 60 * 1_000);
  });

  it('normalizes an environment override', () => {
    expect(
      _resolveMcpStdioIdleExitMs({ OD_MCP_STDIO_IDLE_EXIT_MS: '1234.9' }),
    ).toBe(1_234);
    expect(
      _resolveMcpStdioIdleExitMs({
        OD_MCP_STDIO_IDLE_EXIT_MS: String(48 * 60 * 60 * 1_000),
      }),
    ).toBe(24 * 60 * 60 * 1_000);
  });

  it('uses zero to disable idle exit', () => {
    expect(
      _resolveMcpStdioIdleExitMs({ OD_MCP_STDIO_IDLE_EXIT_MS: '0' }),
    ).toBe(0);
  });

  it('falls back to the default for invalid values', () => {
    for (const value of ['', '   ', '-1', 'not-a-number']) {
      expect(
        _resolveMcpStdioIdleExitMs({ OD_MCP_STDIO_IDLE_EXIT_MS: value }),
      ).toBe(30 * 60 * 1_000);
    }
  });
});

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

  it('does not schedule an exit when disabled', async () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const idleExit = _createMcpIdleExitController({ idleMs: 0, onIdle });

    expect(vi.getTimerCount()).toBe(0);

    idleExit.noteActivity();
    await idleExit.trackRequest(async () => undefined);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
