import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

const dataDir = process.env.OD_DATA_DIR as string;

function authHeaders(email: string): Record<string, string> {
  return { [DEFAULT_TRUSTED_EMAIL_HEADER]: email };
}

function jsonAuthHeaders(email: string): Record<string, string> {
  return {
    ...authHeaders(email),
    'content-type': 'application/json',
  };
}

describe('automation routes auth context', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMultitenant: string | undefined;

  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    process.env.OD_MULTITENANT = '1';
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'automation-proposals'), { recursive: true, force: true });
  });

  it('stores automation proposals under the authenticated user data dir', async () => {
    const createRes = await fetch(`${baseUrl}/api/automation-proposals`, {
      method: 'POST',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        id: 'proposal-alice-only',
        title: 'Alice proposal',
        summary: 'Only Alice should see this proposal.',
        targetKind: 'memory',
        action: 'create',
        patch: {
          format: 'markdown',
          after: '# Alice memory\n\nScoped proposal.',
        },
      }),
    });
    expect(createRes.status).toBe(200);

    const aliceListRes = await fetch(`${baseUrl}/api/automation-proposals?status=all`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceListRes.status).toBe(200);
    const aliceList = (await aliceListRes.json()) as {
      proposals: Array<{ id: string }>;
    };
    expect(aliceList.proposals.map((proposal) => proposal.id)).toContain('proposal-alice-only');

    const bobListRes = await fetch(`${baseUrl}/api/automation-proposals?status=all`, {
      headers: authHeaders('bob@example.com'),
    });
    expect(bobListRes.status).toBe(200);
    const bobList = (await bobListRes.json()) as {
      proposals: Array<{ id: string }>;
    };
    expect(bobList.proposals.map((proposal) => proposal.id)).not.toContain('proposal-alice-only');

    const aliceGetRes = await fetch(`${baseUrl}/api/automation-proposals/proposal-alice-only`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceGetRes.status).toBe(200);

    const bobGetRes = await fetch(`${baseUrl}/api/automation-proposals/proposal-alice-only`, {
      headers: authHeaders('bob@example.com'),
    });
    expect(bobGetRes.status).toBe(404);
  });
});
