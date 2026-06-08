import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

type ActiveContextBody =
  | { active: false }
  | {
      active: true;
      projectId: string;
      projectName: string | null;
      fileName: string | null;
      ts: number;
      ageMs?: number;
    };

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

describe('active context auth context', () => {
  let server: http.Server | undefined;
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
    const currentServer = server;
    if (!currentServer) return;
    await new Promise<void>((resolve) => currentServer.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
  });

  async function createProject(email: string, id: string, name: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: jsonAuthHeaders(email),
      body: JSON.stringify({
        id,
        name,
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(res.status).toBe(200);
  }

  async function setActive(
    email: string,
    projectId: string,
    fileName: string | null,
  ): Promise<ActiveContextBody> {
    const res = await fetch(`${baseUrl}/api/active`, {
      method: 'POST',
      headers: jsonAuthHeaders(email),
      body: JSON.stringify({ projectId, fileName }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as ActiveContextBody;
  }

  async function getActive(email: string): Promise<ActiveContextBody> {
    const res = await fetch(`${baseUrl}/api/active`, {
      headers: authHeaders(email),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as ActiveContextBody;
  }

  it('keeps active project context separate per authenticated user', async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/active`);
    expect(unauthenticated.status).toBe(401);

    const aliceProjectId = `active-alice-${randomUUID()}`;
    const bobProjectId = `active-bob-${randomUUID()}`;
    await createProject('alice@example.com', aliceProjectId, 'Alice Active Project');
    await createProject('bob@example.com', bobProjectId, 'Bob Active Project');

    expect(await getActive('alice@example.com')).toEqual({ active: false });
    expect(await getActive('bob@example.com')).toEqual({ active: false });

    await setActive('alice@example.com', aliceProjectId, 'alice.html');
    expect(await getActive('bob@example.com')).toEqual({ active: false });
    expect(await getActive('alice@example.com')).toMatchObject({
      active: true,
      projectId: aliceProjectId,
      projectName: 'Alice Active Project',
      fileName: 'alice.html',
    });

    await setActive('bob@example.com', bobProjectId, 'bob.html');
    expect(await getActive('alice@example.com')).toMatchObject({
      active: true,
      projectId: aliceProjectId,
      projectName: 'Alice Active Project',
      fileName: 'alice.html',
    });
    expect(await getActive('bob@example.com')).toMatchObject({
      active: true,
      projectId: bobProjectId,
      projectName: 'Bob Active Project',
      fileName: 'bob.html',
    });
  });
});
