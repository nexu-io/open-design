import { describe, expect, it, vi } from 'vitest';
import {
  requestDaemonDbStatus,
  requestDaemonDbVacuum,
  requestDaemonDbVerify,
  requestDaemonShutdown,
  requestDaemonStatus,
} from '../../src/runtimes/daemon-control.js';

function response(): { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> } {
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
}

describe('daemon control transport', () => {
  it('requests the daemon status endpoint with a normalized base URL', async () => {
    const fetchImpl = vi.fn(async () => response());

    await requestDaemonStatus('http://127.0.0.1:7456/', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:7456/api/daemon/status');
  });

  it('requests graceful shutdown with POST', async () => {
    const fetchImpl = vi.fn(async () => response());

    await requestDaemonShutdown('http://127.0.0.1:7456/', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/daemon/shutdown',
      { method: 'POST' },
    );
  });

  it('requests database status, quick verification, and vacuum through the daemon API', async () => {
    const fetchImpl = vi.fn(async () => response());

    await requestDaemonDbStatus('http://127.0.0.1:7456/', fetchImpl);
    await requestDaemonDbVerify('http://127.0.0.1:7456/', true, fetchImpl);
    await requestDaemonDbVacuum('http://127.0.0.1:7456/', fetchImpl);

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:7456/api/daemon/db');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7456/api/daemon/db/verify?quick=1',
      { method: 'POST' },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:7456/api/daemon/db/vacuum',
      { method: 'POST' },
    );
  });
});
