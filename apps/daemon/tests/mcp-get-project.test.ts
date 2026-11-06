import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';
import { _resetMcpWorkspaceContextCacheForTests } from '../src/mcp-workspace-context.js';

const originalFetch = globalThis.fetch;

// Non-vela directory: the bridge falls back to headerless behavior, which is
// what this suite exercised before #6569.
function emptyDirectory(): Response {
  return new Response(JSON.stringify({ items: [], activeWorkspaceId: null }), { status: 200 });
}

function firstJson<T>(result: { content: Array<{ text: string }> }): T {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return JSON.parse(item.text) as T;
}

describe('public MCP get_project', () => {
  afterEach(() => {
    _resetMcpWorkspaceContextCacheForTests();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('surfaces the daemon-resolved project directory', async () => {
    const base = 'http://127.0.0.1:19001';
    const projectId = '11111111-1111-1111-1111-111111111111';
    const resolvedDir = '/tmp/open-design/projects/demo';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/workspace/directory')) return emptyDirectory();
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(firstJson(result)).toMatchObject({
      id: projectId,
      name: 'Demo',
      entryFile: 'index.html',
      kind: 'prototype',
      resolvedDir,
    });
  });
});
