import { describe, expect, it, vi } from 'vitest';

// Regression test: createMcpHttpHandler must propagate x-api-key as
// Authorization: Bearer so downstream daemon fetches stay authenticated
// when the outer /mcp request came in via x-api-key instead of the
// standard Authorization header.

// The mock transport captures the authContext store by calling the
// getPerRequestAuthHeaders function that registerMcpHandlers received.
// handleRequest runs inside authContext.run(authStore, ...), so the
// captured function observes the per-request store, not the empty default.

let capturedAuthHeaders: (() => Record<string, string>) | null = null;
let storeSnapshot: Record<string, string> | null = null;

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class MockServer {
    async connect() {}
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockTransport {
    async handleRequest() {
      if (capturedAuthHeaders) {
        storeSnapshot = capturedAuthHeaders();
      }
    }
  },
}));

vi.mock('../src/mcp.js', () => ({
  SERVER_NAME: 'test-server',
  SERVER_VERSION: '0.0.0',
  MCP_INSTRUCTIONS: '',
  registerMcpHandlers: vi.fn((_s: any, _url: string, getAuthHeaders: () => Record<string, string>) => {
    capturedAuthHeaders = getAuthHeaders;
  }),
}));

import { createMcpHttpHandler } from '../src/mcp-http.js';

function mockReq(overrides: { authorization?: string; xApiKey?: string } = {}) {
  const headers: Record<string, string> = {};
  if (overrides.authorization) headers.authorization = overrides.authorization;
  if (overrides.xApiKey) headers['x-api-key'] = overrides.xApiKey;
  return { headers, body: {} } as any;
}

function mockRes() {
  const res: any = { statusCode: 200, headersSent: false };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

describe('createMcpHttpHandler: auth header propagation', () => {
  it('propagates Authorization header as-is to per-request auth store', async () => {
    storeSnapshot = null;
    const handler = createMcpHttpHandler({ current: 'http://127.0.0.1:9999' });
    await handler(mockReq({ authorization: 'Bearer secret-key' }), mockRes());
    expect(storeSnapshot).toEqual({ Authorization: 'Bearer secret-key' });
  });

  it('normalizes x-api-key into Authorization Bearer', async () => {
    storeSnapshot = null;
    const handler = createMcpHttpHandler({ current: 'http://127.0.0.1:9999' });
    await handler(mockReq({ xApiKey: 'my-api-key' }), mockRes());
    expect(storeSnapshot).toEqual({ Authorization: 'Bearer my-api-key' });
  });

  it('prefers Authorization over x-api-key when both are present', async () => {
    storeSnapshot = null;
    const handler = createMcpHttpHandler({ current: 'http://127.0.0.1:9999' });
    await handler(mockReq({ authorization: 'Bearer primary', xApiKey: 'secondary' }), mockRes());
    expect(storeSnapshot).toEqual({ Authorization: 'Bearer primary' });
  });

  it('produces empty store when no auth headers are present', async () => {
    storeSnapshot = null;
    const handler = createMcpHttpHandler({ current: 'http://127.0.0.1:9999' });
    await handler(mockReq(), mockRes());
    expect(storeSnapshot).toEqual({});
  });
});
