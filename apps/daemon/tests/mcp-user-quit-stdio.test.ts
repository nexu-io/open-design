import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<unknown, (request?: unknown) => Promise<unknown>>(),
  transport: null as null | { onclose?: () => void },
}));
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    setRequestHandler(schema: unknown, handler: (request?: unknown) => Promise<unknown>) { state.handlers.set(schema, handler); }
    getClientVersion() { return undefined; }
    async connect(transport: { onclose?: () => void }) { state.transport = transport; }
  },
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    onclose?: () => void;
    async close() { this.onclose?.(); }
  },
}));
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: {}, ListResourcesRequestSchema: {}, ListToolsRequestSchema: {}, ReadResourceRequestSchema: {},
}));

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runMcpStdio } from '../src/mcp.js';
import { McpUserQuitError } from '../src/mcp-user-quit.js';

describe('MCP stdio after explicit quit', () => {
  it('keeps tool discovery and actionable calls available without an initial daemon URL', async () => {
    const stdinEndListeners = process.stdin.listeners('end');
    const stdinCloseListeners = process.stdin.listeners('close');
    const running = runMcpStdio({ resolveDaemonUrl: async () => { throw new McpUserQuitError(); } });
    try {
      await vi.waitFor(() => expect(state.transport?.onclose).toBeTypeOf('function'));
      const tools = await state.handlers.get(ListToolsRequestSchema)!() as { tools: unknown[] };
      expect(tools.tools.length).toBeGreaterThan(0);
      const result = await state.handlers.get(CallToolRequestSchema)!({ params: { name: 'get_project', arguments: {} } }) as { isError: boolean; content: { text: string }[] };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/manually/i);
    } finally {
      state.transport?.onclose?.();
      await running;
      for (const listener of process.stdin.listeners('end')) if (!stdinEndListeners.includes(listener)) process.stdin.off('end', listener as (...args: unknown[]) => void);
      for (const listener of process.stdin.listeners('close')) if (!stdinCloseListeners.includes(listener)) process.stdin.off('close', listener as (...args: unknown[]) => void);
    }
  });
});
