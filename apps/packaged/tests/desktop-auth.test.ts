/**
 * Covers the desktop-auth handshake retry used when the packaged host
 * registers its secret with the daemon (OPEND-5170). A busy, freshly
 * restarted daemon can miss one short handshake; the folder picker must not
 * fail on that alone.
 */
import { describe, expect, it, vi } from 'vitest';

import { registerDesktopAuthWithRetry } from '../src/desktop-auth.js';
import type { PackagedDesktopLogger } from '../src/logging.js';

function stubLogger(): PackagedDesktopLogger {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

const noSleep = async () => {};

describe('registerDesktopAuthWithRetry (OPEND-5170)', () => {
  it('succeeds on the first attempt without sleeping or logging', async () => {
    const attempt = vi.fn(async () => true);
    const sleep = vi.fn(noSleep);
    const logger = stubLogger();

    await expect(registerDesktopAuthWithRetry({ attempt, logger, sleep })).resolves.toBe(true);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries once after a short delay when the first attempt throws and succeeds', async () => {
    const attempt = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce(true);
    const sleep = vi.fn(noSleep);
    const logger = stubLogger();

    await expect(registerDesktopAuthWithRetry({ attempt, logger, sleep, retryDelayMs: 250 })).resolves.toBe(true);

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries when the daemon answers but does not accept the secret', async () => {
    const attempt = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(registerDesktopAuthWithRetry({ attempt, sleep: noSleep })).resolves.toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('gives up after two attempts, logs the final reason without the secret, and returns false', async () => {
    const attempt = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('first timeout'))
      .mockRejectedValueOnce(new Error('second timeout'));
    const sleep = vi.fn(noSleep);
    const logger = stubLogger();

    await expect(registerDesktopAuthWithRetry({ attempt, logger, sleep })).resolves.toBe(false);

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message, meta] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain('desktop auth handshake');
    expect(meta).toEqual({ attempts: 2, reason: 'second timeout' });
    expect(JSON.stringify(meta)).not.toMatch(/secret/i);
  });

  it('reports "not accepted" as the reason when the daemon never accepts', async () => {
    const attempt = vi.fn(async () => false);
    const logger = stubLogger();

    await expect(registerDesktopAuthWithRetry({ attempt, logger, sleep: noSleep })).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { attempts: 2, reason: 'not accepted' });
  });

  it('works without a logger', async () => {
    const attempt = vi.fn(async () => false);
    await expect(registerDesktopAuthWithRetry({ attempt, logger: null, sleep: noSleep })).resolves.toBe(false);
  });
  it('makes a single attempt without sleeping when attempts is 1 (startup handshake)', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('timed out');
    });
    const sleep = vi.fn(noSleep);
    const logger = stubLogger();

    await expect(registerDesktopAuthWithRetry({ attempt, attempts: 1, logger, sleep })).resolves.toBe(false);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('desktop auth handshake with the daemon failed', {
      attempts: 1,
      reason: 'timed out',
    });
  });
});
