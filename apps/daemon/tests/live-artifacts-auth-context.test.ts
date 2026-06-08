import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';
import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, toolTokenRegistry } from '../src/tool-tokens.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

type ProjectBody = {
  project: {
    id: string;
    updatedAt: number;
  };
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

function validCreateInput(title = 'Tenant Live Artifact') {
  return {
    title,
    preview: { type: 'html', entry: 'index.html' },
    document: {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: { title },
    },
  };
}

function mintToolToken(
  projectId: string,
  runId: string,
  overrides: Partial<Parameters<typeof toolTokenRegistry.mint>[0]> = {},
) {
  return toolTokenRegistry.mint({
    projectId,
    runId,
    allowedEndpoints: CHAT_TOOL_ENDPOINTS,
    allowedOperations: CHAT_TOOL_OPERATIONS,
    ...overrides,
  }).token;
}

describe('live artifact routes auth context', () => {
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
    toolTokenRegistry.clear();
    const currentServer = server;
    if (!currentServer) return;
    await new Promise<void>((resolve) => currentServer.close(() => resolve()));
  });

  beforeEach(async () => {
    toolTokenRegistry.clear();
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
  });

  async function createProject(email: string, id: string): Promise<ProjectBody> {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: jsonAuthHeaders(email),
      body: JSON.stringify({
        id,
        name: id,
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as ProjectBody;
  }

  async function getProject(email: string, id: string): Promise<ProjectBody> {
    const res = await fetch(`${baseUrl}/api/projects/${id}`, {
      headers: authHeaders(email),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as ProjectBody;
  }

  it('does not let a UI artifact delete touch another owner project row', async () => {
    const sharedProjectId = `live-artifact-auth-${randomUUID()}`;
    const bobProject = await createProject('bob@example.com', sharedProjectId);
    const token = mintToolToken(sharedProjectId, 'alice-run');

    const createArtifact = await fetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: {
        ...jsonAuthHeaders('alice@example.com'),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        input: validCreateInput('Alice Artifact'),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1>',
      }),
    });
    expect(createArtifact.status).toBe(200);
    const artifactBody = (await createArtifact.json()) as {
      artifact: { id: string };
    };

    await new Promise((resolve) => setTimeout(resolve, 20));

    const deleted = await fetch(
      `${baseUrl}/api/live-artifacts/${artifactBody.artifact.id}?projectId=${encodeURIComponent(sharedProjectId)}`,
      {
        method: 'DELETE',
        headers: authHeaders('alice@example.com'),
      },
    );
    expect(deleted.status).toBe(200);

    const bobAfter = await getProject('bob@example.com', sharedProjectId);
    expect(bobAfter.project.updatedAt).toBe(bobProject.project.updatedAt);
  });

  it('allows owner-stamped tool tokens through multitenant auth without a trusted header', async () => {
    const projectId = `live-artifact-tool-token-${randomUUID()}`;
    await createProject('bob@example.com', projectId);
    const token = mintToolToken(projectId, 'bob-run', { ownerEmail: 'bob@example.com' });

    const createArtifact = await fetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        input: validCreateInput('Bob Token Artifact'),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1>',
      }),
    });

    expect(createArtifact.status).toBe(200);
    const body = (await createArtifact.json()) as { artifact?: { id?: string } };
    expect(body.artifact?.id).toEqual(expect.any(String));
  });

  it('keeps live artifacts scoped after the source project row disappears', async () => {
    const projectId = `live-artifact-deleted-project-${randomUUID()}`;
    await createProject('bob@example.com', projectId);
    const token = mintToolToken(projectId, 'bob-run', { ownerEmail: 'bob@example.com' });

    const createArtifact = await fetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        input: validCreateInput('Bob Deleted Project Artifact'),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1>',
      }),
    });
    expect(createArtifact.status).toBe(200);
    const body = (await createArtifact.json()) as { artifact: { id: string } };
    const artifactId = body.artifact.id;

    const db = openDatabase(process.cwd(), { dataDir });
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);

    const aliceDetail = await fetch(
      `${baseUrl}/api/live-artifacts/${artifactId}?projectId=${encodeURIComponent(projectId)}`,
      { headers: authHeaders('alice@example.com') },
    );
    expect(aliceDetail.status).toBe(404);

    const bobDetail = await fetch(
      `${baseUrl}/api/live-artifacts/${artifactId}?projectId=${encodeURIComponent(projectId)}`,
      { headers: authHeaders('bob@example.com') },
    );
    expect(bobDetail.status).toBe(200);
    const bobBody = (await bobDetail.json()) as { artifact: { id: string; title: string; ownerEmail?: string } };
    expect(bobBody.artifact).toMatchObject({
      id: artifactId,
      title: 'Bob Deleted Project Artifact',
    });
    expect(bobBody.artifact.ownerEmail).toBeUndefined();
  });
});
