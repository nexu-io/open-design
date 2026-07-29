import { describe, expect, it, vi } from 'vitest';

import { _createMcpBaseUrlResolver } from '../src/mcp.js';

describe('MCP daemon base URL resolver', () => {
  it('re-resolves dynamic daemon URLs on every request', async () => {
    const resolveDaemonUrl = vi
      .fn<() => string>()
      .mockReturnValueOnce('http://127.0.0.1:7456/')
      .mockReturnValueOnce('http://127.0.0.1:57844/');
    const resolveBaseUrl = _createMcpBaseUrlResolver({ resolveDaemonUrl });

    const first = await resolveBaseUrl();
    const second = await resolveBaseUrl();

    expect(first).toBe('http://127.0.0.1:7456');
    expect(second).toBe('http://127.0.0.1:57844');
    expect(resolveDaemonUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps explicit daemon URLs fixed for the MCP process lifetime', async () => {
    const resolveBaseUrl = _createMcpBaseUrlResolver({ daemonUrl: 'http://127.0.0.1:7456/' });

    await expect(resolveBaseUrl()).resolves.toBe('http://127.0.0.1:7456');
    await expect(resolveBaseUrl()).resolves.toBe('http://127.0.0.1:7456');
  });
});
