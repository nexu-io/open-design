import type { SidecarConnection } from '@open-design/sidecar';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerDesktopAuthWithDaemon } from '../../src/main/register-desktop-auth.js';
import { mintHomeWorkingDirToken } from '../../src/main/runtime.js';

const SECRET = Buffer.from('test-desktop-auth-secret');

function delayedDaemon(responseAfterMs: number): Pick<SidecarConnection, 'invoke'> {
  return {
    invoke: <TResult>(_app: string, _action: string, _input: unknown, options?: { timeoutMs?: number }) =>
      new Promise<TResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearTimeout(response);
          reject(new Error('IPC request timed out'));
        }, options?.timeoutMs);
        const response = setTimeout(() => {
          clearTimeout(timeout);
          resolve({ accepted: true } as TResult);
        }, responseAfterMs);
      }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('desktop-auth registration deadline', () => {
  it('allows a folder selection when the daemon acknowledges after the old 800 ms deadline', async () => {
    vi.useFakeTimers();
    const mintToken = vi.fn(() => 'import-token');
    const result = mintHomeWorkingDirToken({
      baseDir: 'C:\\work\\design',
      desktopAuthSecret: SECRET,
      registerDesktopAuth: () => registerDesktopAuthWithDaemon(delayedDaemon(1_000), SECRET),
      mintToken,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(mintToken).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: true, baseDir: 'C:\\work\\design', token: 'import-token' });
    expect(mintToken).toHaveBeenCalledOnce();
  });

  it('fails closed within five seconds when the daemon does not acknowledge', async () => {
    vi.useFakeTimers();
    const mintToken = vi.fn(() => 'must-not-be-minted');
    let settled = false;
    const result = mintHomeWorkingDirToken({
      baseDir: 'C:\\work\\design',
      desktopAuthSecret: SECRET,
      registerDesktopAuth: () => registerDesktopAuthWithDaemon(delayedDaemon(6_000), SECRET),
      mintToken,
    }).then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    expect(mintToken).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: false, reason: 'desktop auth handshake with the daemon failed; please retry' });
    expect(mintToken).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not accept a negative acknowledgement', async () => {
    const client = { invoke: vi.fn().mockResolvedValue({ accepted: false }) };
    expect(await registerDesktopAuthWithDaemon(client, SECRET)).toBe(false);
  });

  it('fails closed on a transport error', async () => {
    const client = { invoke: vi.fn().mockRejectedValue(new Error('pipe disconnected')) };
    expect(await registerDesktopAuthWithDaemon(client, SECRET)).toBe(false);
  });
});
