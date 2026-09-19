import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMcpRoutes, type RegisterMcpRoutesDeps } from '../src/mcp-routes.js';
import { sendApiError } from '../src/http/api-errors.js';

// Every JSON error the MCP route module emits must use the typed
// `{ error: { code, message } }` envelope produced by sendApiError —
// the same contract the rest of the daemon API and the web client's
// error parsing already rely on. The OAuth callback endpoints keep
// returning HTML pages (renderOAuthResultPage) and are out of scope
// here by design.

function makeApp(isLocalSameOrigin: () => boolean) {
  const app = express();
  app.use(express.json());
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-routes-envelope-'));
  const ctx = {
    http: {
      isLocalSameOrigin,
      resolvedPortRef: { current: 0 },
      sendApiError,
    },
    paths: {
      OD_BIN: path.join(dataDir, 'od'),
      RUNTIME_DATA_DIR: dataDir,
      PROJECTS_DIR: path.join(dataDir, 'projects'),
    },
    mcp: {
      pendingAuth: new Map(),
      daemonUrlRef: { current: '' },
      inheritedEnvironment: () => ({}),
    },
  } as unknown as RegisterMcpRoutesDeps;
  registerMcpRoutes(app, ctx);
  return app;
}

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        servers.push(srv);
        resolve(`http://127.0.0.1:${addr.port}`);
      }
    });
  });
}

const servers: http.Server[] = [];

afterAll(async () => {
  await Promise.all(servers.map((srv) => new Promise<void>((r) => srv.close(() => r()))));
});

describe('mcp routes error envelope', () => {
  it('rejects cross-origin requests with FORBIDDEN envelope', async () => {
    const url = await listen(makeApp(() => false));
    const res = await fetch(`${url}/api/mcp/servers`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(typeof body.error).toBe('object');
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('cross-origin request rejected');
  });

  it('returns BAD_REQUEST envelope when oauth/start lacks serverId', async () => {
    const url = await listen(makeApp(() => true));
    const res = await fetch(`${url}/api/mcp/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('serverId is required');
  });

  it('returns BAD_REQUEST envelope when oauth/status lacks serverId', async () => {
    const url = await listen(makeApp(() => true));
    const res = await fetch(`${url}/api/mcp/oauth/status`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('returns BAD_REQUEST envelope when oauth/disconnect lacks serverId', async () => {
    const url = await listen(makeApp(() => true));
    const res = await fetch(`${url}/api/mcp/oauth/disconnect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('returns NOT_FOUND envelope for an unknown oauth/start serverId', async () => {
    const url = await listen(makeApp(() => true));
    const res = await fetch(`${url}/api/mcp/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverId: 'no-such-server' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('no-such-server');
  });
});
