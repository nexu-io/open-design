import { afterEach, describe, expect, it, vi } from 'vitest';

import { _resetWebBaseUrlCache, handleMcpToolCall } from '../src/mcp.js';

const originalFetch = globalThis.fetch;

function firstJson<T>(result: { content: Array<{ text: string }> }): T {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return JSON.parse(item.text) as T;
}

describe('public MCP get_project', () => {
  afterEach(() => {
    _resetWebBaseUrlCache();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('surfaces the daemon-resolved project directory', async () => {
    const base = 'http://127.0.0.1:19001';
    const projectId = '11111111-1111-1111-1111-111111111111';
    const resolvedDir = '/tmp/open-design/projects/demo';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/mcp/install-info')) {
        return new Response(JSON.stringify({ webBaseUrl: null }), { status: 200 });
      }
      expect(url).toBe(`${base}/api/projects/${projectId}`);
      return new Response(
        JSON.stringify({
          project: {
            id: projectId,
            name: 'Demo',
            metadata: { entryFile: 'index.html', kind: 'prototype' },
          },
          resolvedDir,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'get_project', {
      project: projectId,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstJson(result)).toMatchObject({
      id: projectId,
      name: 'Demo',
      entryFile: 'index.html',
      kind: 'prototype',
      resolvedDir,
    });
  });
});
