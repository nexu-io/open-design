import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  _registerMcpResourceHandlers,
  createMcpDaemonTarget,
  OPEN_DESIGN_BRIEF_APP_RESOURCE,
} from '../src/mcp.js';
import { _resetMcpWorkspaceContextCacheForTests } from '../src/mcp-workspace-context.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  _resetMcpWorkspaceContextCacheForTests();
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('MCP resource templates', () => {
  it('supports the full resource surface advertised during initialization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/api/workspace/directory')) {
          return new Response(
            JSON.stringify({ items: [], activeWorkspaceId: null }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/skills')) {
          return new Response(JSON.stringify({ skills: [] }), { status: 200 });
        }
        if (url.endsWith('/api/design-systems')) {
          return new Response(JSON.stringify({ designSystems: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const server = new Server(
      { name: 'open-design-test', version: '0.0.0' },
      { capabilities: { resources: {} } },
    );
    _registerMcpResourceHandlers(
      server,
      createMcpDaemonTarget({ daemonUrl: 'http://127.0.0.1:19001' }),
      (handler) => async (...args) => await handler(...args),
    );

    const client = new Client({
      name: 'open-design-test-client',
      version: '0.0.0',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      expect(client.getServerCapabilities()?.resources).toEqual({});

      const listed = await client.listResources();
      expect(listed.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ uri: OPEN_DESIGN_BRIEF_APP_RESOURCE }),
          expect.objectContaining({ uri: 'od://focus/active' }),
        ]),
      );

      const brief = await client.readResource({
        uri: OPEN_DESIGN_BRIEF_APP_RESOURCE,
      });
      expect(brief.contents[0]).toEqual(
        expect.objectContaining({
          uri: OPEN_DESIGN_BRIEF_APP_RESOURCE,
          mimeType: 'text/html;profile=mcp-app',
        }),
      );

      await expect(client.listResourceTemplates()).resolves.toEqual({
        resourceTemplates: [],
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
