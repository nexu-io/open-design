import { AsyncLocalStorage } from 'node:async_hooks';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import {
  SERVER_NAME,
  SERVER_VERSION,
  MCP_INSTRUCTIONS,
  registerMcpHandlers,
} from './mcp.js';

const authContext = new AsyncLocalStorage<Record<string, string>>();

let transport: StreamableHTTPServerTransport | null = null;
let server: Server | null = null;
let initPromise: Promise<StreamableHTTPServerTransport> | null = null;

function getPerRequestAuthHeaders(): Record<string, string> {
  const store = authContext.getStore();
  return store ?? {};
}

async function ensureServer(daemonUrl: string): Promise<StreamableHTTPServerTransport> {
  if (transport && server) return transport;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const s = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        capabilities: { tools: {}, resources: {} },
        instructions: MCP_INSTRUCTIONS,
      },
    );

    registerMcpHandlers(s, daemonUrl, getPerRequestAuthHeaders);

    const t = new StreamableHTTPServerTransport();
    await s.connect(t as any);
    transport = t;
    server = s;
    return t;
  })();

  return initPromise;
}

/**
 * Creates a request handler for the streamable HTTP MCP endpoint.
 *
 * Accepts a reactive ref `{ current: string }` so the daemon URL is
 * resolved on every request — the listener may not have bound yet at
 * handler-creation time (e.g. port 0 or saved-config port).
 */
export function createMcpHttpHandler(daemonUrlRef: { current: string }) {
  return async (req: Request, res: Response) => {
    try {
      const t = await ensureServer(daemonUrlRef.current);
      const authStore: Record<string, string> = {};
      const authHeader = req.headers.authorization;
      if (authHeader) {
        authStore.Authorization = authHeader;
      } else {
        // createAuthMiddleware accepts x-api-key as an alternative to
        // Authorization; propagate it as a Bearer token so downstream
        // daemon fetches inside registerMcpHandlers stay authenticated.
        const xKey = req.headers['x-api-key'];
        if (typeof xKey === 'string' && xKey.trim()) {
          authStore.Authorization = `Bearer ${xKey.trim()}`;
        }
      }
      await authContext.run(authStore, () => t.handleRequest(req as any, res as any, req.body));
    } catch (err) {
      console.error('[od] mcp-http: error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'INTERNAL_ERROR', reason: 'MCP handler failed' });
      }
    }
  };
}
