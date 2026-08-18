import { describe, expect, it, vi } from 'vitest';

import { createMcpDaemonTarget } from '../src/mcp.js';

function unreachable(url: string) {
  return {
    content: [{ type: 'text' as const, text: `cannot reach the OpenDesign daemon at ${url}.` }],
    isError: true,
  };
}

describe('MCP daemon target recovery', () => {
  it('refreshes the discovered daemon URL before a tool call', async () => {
    const resolveDaemonUrl = vi.fn(async () => 'http://127.0.0.1:62002');
    const call = vi.fn(async (url: string) => ({
      content: [{ type: 'text' as const, text: url }],
    }));
    const target = createMcpDaemonTarget({
      daemonUrl: 'http://127.0.0.1:62001',
      resolveDaemonUrl,
    });

    await target.call('get_project', {}, call);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('http://127.0.0.1:62002');
    expect(target.currentUrl()).toBe('http://127.0.0.1:62002');
  });

  it('rediscovers and retries one safe read when the daemon changes between discovery and fetch', async () => {
    const resolveDaemonUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('http://127.0.0.1:62001')
      .mockResolvedValueOnce('http://127.0.0.1:62002');
    const call = vi
      .fn<(url: string) => Promise<ReturnType<typeof unreachable>>>()
      .mockResolvedValueOnce(unreachable('http://127.0.0.1:62001'))
      .mockResolvedValueOnce({
        content: [{ type: 'text' as const, text: '{"id":"project-1"}' }],
        isError: false,
      });
    const target = createMcpDaemonTarget({
      daemonUrl: 'http://127.0.0.1:62000',
      resolveDaemonUrl,
    });

    const result = await target.call('get_project', { project: 'project-1' }, call);

    expect(result.isError).not.toBe(true);
    expect(call.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:62001',
      'http://127.0.0.1:62002',
    ]);
  });

  it('refreshes after an ambiguous write failure without replaying the write', async () => {
    const resolveDaemonUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('http://127.0.0.1:62001')
      .mockResolvedValueOnce('http://127.0.0.1:62002');
    const call = vi.fn(async (url: string) => unreachable(url));
    const target = createMcpDaemonTarget({
      daemonUrl: 'http://127.0.0.1:62000',
      resolveDaemonUrl,
    });

    const result = await target.call(
      'create_project',
      { name: 'must-not-be-replayed' },
      call,
    );

    expect(result.isError).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    expect(target.currentUrl()).toBe('http://127.0.0.1:62002');
  });
});
