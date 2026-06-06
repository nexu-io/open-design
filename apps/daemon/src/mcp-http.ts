// Streamable HTTP MCP transport mounted on the daemon's Express app.
// Complements the existing stdio transport (`od mcp`) by accepting
// MCP JSON-RPC requests over HTTP at POST /mcp (and optionally
// GET /mcp for SSE streaming). Lets remote devices (other laptops,
// mobile apps) use Open Design's MCP tools over the network.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import {
  SERVER_NAME,
  SERVER_VERSION,
  MCP_INSTRUCTIONS,
  registerMcpHandlers,
} from './mcp.js';

let transport: StreamableHTTPServerTransport | null = null;
let server: Server | null = null;

async function ensureServer(daemonUrl: string): Promise<StreamableHTTPServerTransport> {
  if (transport && server) return transport;

  server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: MCP_INSTRUCTIONS,
    },
  );

  registerMcpHandlers(server, daemonUrl, () => {
    // The auth middleware already validated the request before it
    // reaches this handler, so no additional auth headers needed
    // for internal fetch() calls — the daemon routes don't require
    // auth from loopback.
    return {};
  });

  transport = new StreamableHTTPServerTransport();

  await server.connect(transport as any);
  return transport;
}

/**
 * Express handler for MCP Streamable HTTP requests.
 * Mount at both POST /mcp and GET /mcp.
 *
 * @param daemonUrl - The daemon's own base URL (http://127.0.0.1:<port>)
 */
export function createMcpHttpHandler(daemonUrl: string) {
  return async (req: Request, res: Response) => {
    try {
      const t = await ensureServer(daemonUrl);
      await t.handleRequest(req as any, res as any, req.body);
    } catch (err) {
      console.error('[od] mcp-http: error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'INTERNAL_ERROR', reason: 'MCP handler failed' });
      }
    }
  };
}
