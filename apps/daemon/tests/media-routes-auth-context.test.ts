import type http from 'node:http';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { insertMediaTask } from '../src/media-tasks.js';
import { mediaConfigDirForDataDir } from '../src/media-config.js';
import { openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';
import { setXAIToken } from '../src/xai-tokens.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

interface MediaConfigBody {
  providers: Record<string, {
    configured: boolean;
    source: string;
    apiKeyTail: string;
    baseUrl: string;
  }>;
}

interface XaiStatusBody {
  connected: boolean;
  scope?: string | null;
  savedAt?: number;
  listening?: boolean;
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

function userDataDir(email: string): string {
  const dirHash = createHash('sha1')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 12);
  return path.join(dataDir, 'users', dirHash);
}

describe('media routes auth context', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMultitenant: string | undefined;
  let originalMidjourneyKey: string | undefined;

  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    originalMidjourneyKey = process.env.OD_MIDJOURNEY_API_KEY;
    process.env.OD_MULTITENANT = '1';
    delete process.env.OD_MIDJOURNEY_API_KEY;
    const started = (await startServer({
      port: 0,
      returnServer: true,
    })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalMidjourneyKey === undefined) delete process.env.OD_MIDJOURNEY_API_KEY;
    else process.env.OD_MIDJOURNEY_API_KEY = originalMidjourneyKey;
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'media-config.json'), { force: true });
    await fsp.rm(path.join(dataDir, 'xai-tokens.json'), { force: true });
  });

  async function readMediaConfig(email: string): Promise<MediaConfigBody> {
    const res = await fetch(`${baseUrl}/api/media/config`, {
      headers: authHeaders(email),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as MediaConfigBody;
  }

  it('requires a tenant identity in multitenant mode', async () => {
    const res = await fetch(`${baseUrl}/api/media/config`);
    expect(res.status).toBe(401);
  });

  it('stores media provider config separately for each authenticated user', async () => {
    const writeAlice = await fetch(`${baseUrl}/api/media/config`, {
      method: 'PUT',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        providers: {
          midjourney: {
            apiKey: 'alice-midjourney-key',
            baseUrl: 'https://alice.example.test/mj',
          },
        },
      }),
    });
    expect(writeAlice.status).toBe(200);

    const alice = await readMediaConfig('alice@example.com');
    expect(alice.providers.midjourney).toMatchObject({
      configured: true,
      source: 'stored',
      apiKeyTail: '-key',
      baseUrl: 'https://alice.example.test/mj',
    });

    const bob = await readMediaConfig('bob@example.com');
    expect(bob.providers.midjourney).toMatchObject({
      configured: false,
      source: 'unset',
      apiKeyTail: '',
      baseUrl: '',
    });
  });

  it('scopes xAI token status to the authenticated user media config dir', async () => {
    await setXAIToken(
      mediaConfigDirForDataDir(userDataDir('alice@example.com')),
      {
        accessToken: 'alice-xai-token',
        tokenType: 'Bearer',
        scope: 'api:access',
        savedAt: Date.now(),
      },
    );

    const aliceRes = await fetch(`${baseUrl}/api/xai/auth/status`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceRes.status).toBe(200);
    const alice = (await aliceRes.json()) as XaiStatusBody;
    expect(alice).toMatchObject({
      connected: true,
      scope: 'api:access',
    });

    const bobRes = await fetch(`${baseUrl}/api/xai/auth/status`, {
      headers: authHeaders('bob@example.com'),
    });
    expect(bobRes.status).toBe(200);
    const bob = (await bobRes.json()) as XaiStatusBody;
    expect(bob).toMatchObject({
      connected: false,
      listening: false,
    });
  });

  it('scopes project media generation and task listing to the authenticated owner', async () => {
    const projectId = `media-owner-bob-${Date.now()}`;
    const bobCreate = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({
        id: projectId,
        name: 'Bob media fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(bobCreate.status).toBe(200);

    const aliceGenerate = await fetch(`${baseUrl}/api/projects/${projectId}/media/generate`, {
      method: 'POST',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        surface: 'image',
        model: 'dall-e-3',
        prompt: 'should not run',
      }),
    });
    expect(aliceGenerate.status).toBe(404);

    const aliceTasks = await fetch(`${baseUrl}/api/projects/${projectId}/media/tasks`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceTasks.status).toBe(404);

    const db = openDatabase(process.cwd(), { dataDir });
    const taskId = `media-task-owner-bob-${Date.now()}`;
    insertMediaTask(db, {
      id: taskId,
      projectId,
      ownerEmail: 'bob@example.com',
      status: 'running',
      surface: 'image',
      model: 'dall-e-3',
      progress: ['provider task accepted'],
    });

    const initialBobWait = await fetch(`${baseUrl}/api/media/tasks/${taskId}/wait`, {
      method: 'POST',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({ since: 0, timeoutMs: 0 }),
    });
    expect(initialBobWait.status).toBe(200);

    const bobDelete = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: authHeaders('bob@example.com'),
    });
    expect(bobDelete.status).toBe(200);

    const aliceWaitAfterDelete = await fetch(`${baseUrl}/api/media/tasks/${taskId}/wait`, {
      method: 'POST',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({ since: 0, timeoutMs: 0 }),
    });
    expect(aliceWaitAfterDelete.status).toBe(404);

    const bobWait = await fetch(`${baseUrl}/api/media/tasks/${taskId}/wait`, {
      method: 'POST',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({ since: 0, timeoutMs: 0 }),
    });
    expect(bobWait.status).toBe(200);
    const bobWaitBody = await bobWait.json() as {
      taskId: string;
      status: string;
      progress: string[];
    };
    expect(bobWaitBody).toMatchObject({
      taskId,
      status: 'running',
      progress: ['provider task accepted'],
    });
  });
});
