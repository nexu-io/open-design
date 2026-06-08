import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { composioConnectorProvider } from '../src/connectors/composio.js';
import { writeComposioConfig } from '../src/connectors/composio-config.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

type JsonObject = Record<string, any>;
type FetchInput = Parameters<typeof fetch>[0];
type FetchReturn = Awaited<ReturnType<typeof fetch>>;

const dataDir = process.env.OD_DATA_DIR as string;
const originalFetch = globalThis.fetch;

let server: http.Server;
let baseUrl: string;
let originalMultitenant: string | undefined;
let lastComposioLinkRequest: JsonObject | undefined;

function authHeaders(email: string): Record<string, string> {
  return { [DEFAULT_TRUSTED_EMAIL_HEADER]: email };
}

async function jsonFetch<TBody = JsonObject>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: TBody }> {
  const response = await fetch(url, init);
  return { status: response.status, body: (await response.json()) as TBody };
}

function composioJson(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockComposioFetch(): void {
  vi.stubGlobal('fetch', async (input: FetchInput, init?: RequestInit): Promise<FetchReturn> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return originalFetch(input, init);
    }
    const parsed = new URL(url);
    if (parsed.pathname === '/api/v3/auth_configs') {
      return composioJson({
        items: [{ id: 'ac_github', status: 'ENABLED', toolkit: { slug: 'github' } }],
      });
    }
    if (parsed.pathname === '/api/v3.1/connected_accounts/link') {
      lastComposioLinkRequest = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      return composioJson({
        connected_account_id: 'ca_github',
        status: 'INITIATED',
        redirect_url: 'https://example.com/oauth/github',
      });
    }
    if (parsed.pathname === '/api/v3/connected_accounts/ca_github') {
      return composioJson({
        connected_account_id: 'ca_github',
        status: 'ACTIVE',
        account_label: 'octocat@example.com',
        toolkit: { slug: 'github' },
        auth_config: { id: 'ac_github' },
      });
    }
    return composioJson({ message: `Unhandled Composio mock: ${url}` }, 404);
  });
}

describe('connector routes auth context', () => {
  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    process.env.OD_MULTITENANT = '1';
    mockComposioFetch();
    const started = (await startServer({
      port: 0,
      returnServer: true,
    })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    composioConnectorProvider.clearDiscoveryCache();
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    lastComposioLinkRequest = undefined;
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'connectors'), { recursive: true, force: true });
    writeComposioConfig({ apiKey: 'cmp_test' });
    composioConnectorProvider.clearDiscoveryCache();
  });

  it('stores OAuth callback credentials under the initiating authenticated user', async () => {
    const connect = await jsonFetch(`${baseUrl}/api/connectors/github/connect`, {
      method: 'POST',
      headers: authHeaders('alice@example.com'),
    });
    expect(connect.status).toBe(200);
    expect(connect.body.auth).toMatchObject({ kind: 'redirect_required' });

    const callbackUrl = new URL(String(lastComposioLinkRequest?.callback_url));
    const state = callbackUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await fetch(
      `${baseUrl}/api/connectors/oauth/callback/github?state=${encodeURIComponent(state!)}&status=success&connected_account_id=ca_github`,
      { headers: authHeaders('bob@example.com') },
    );
    expect(callback.status).toBe(200);

    const aliceStatus = await jsonFetch(`${baseUrl}/api/connectors/status`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceStatus.body.statuses.github).toMatchObject({
      status: 'connected',
      accountLabel: 'octocat@example.com',
    });

    const bobStatus = await jsonFetch(`${baseUrl}/api/connectors/status`, {
      headers: authHeaders('bob@example.com'),
    });
    expect(bobStatus.body.statuses.github).toMatchObject({
      status: 'available',
    });
  });
});
