import http from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };
type JsonObject = Record<string, any>;

let server: http.Server | undefined;
let baseUrl = '';
let priorMultitenant: string | undefined;

beforeEach(async () => {
  priorMultitenant = process.env.OD_MULTITENANT;
  process.env.OD_MULTITENANT = '1';
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  if (priorMultitenant === undefined) {
    delete process.env.OD_MULTITENANT;
  } else {
    process.env.OD_MULTITENANT = priorMultitenant;
  }
});

function userHeaders(email: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'cf-access-authenticated-user-email': email,
  };
}

async function jsonFetch(url: string, init?: RequestInit): Promise<{ status: number; body: JsonObject }> {
  const response = await fetch(url, init);
  return { status: response.status, body: (await response.json()) as JsonObject };
}

async function textFetch(url: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  const response = await fetch(url, init);
  return { status: response.status, text: await response.text() };
}

describe('design system route auth context', () => {
  it('scopes editable design systems and project validation to the authenticated owner', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const title = `Tenant System ${stamp}`;
    const createDesignSystem = await jsonFetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({
        title,
        summary: 'Tenant scoped design system.',
        category: 'Custom',
        status: 'published',
        body: `# ${title}\n\n> Category: Custom\n> Surface: web\n\nTenant scoped design system.\n`,
      }),
    });
    expect(createDesignSystem.status).toBe(201);
    const designSystemId = createDesignSystem.body.designSystem.id;

    const aliceList = await jsonFetch(`${baseUrl}/api/design-systems`, {
      headers: userHeaders('alice@example.com'),
    });
    expect(aliceList.status).toBe(200);
    expect(aliceList.body.designSystems.map((system: JsonObject) => system.id)).toContain(designSystemId);

    const bobList = await jsonFetch(`${baseUrl}/api/design-systems`, {
      headers: userHeaders('bob@example.com'),
    });
    expect(bobList.status).toBe(200);
    expect(bobList.body.designSystems.map((system: JsonObject) => system.id)).not.toContain(designSystemId);

    const bobDetail = await jsonFetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}`,
      { headers: userHeaders('bob@example.com') },
    );
    expect(bobDetail.status).toBe(404);

    const alicePreview = await textFetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}/preview`,
      { headers: userHeaders('alice@example.com') },
    );
    expect(alicePreview.status).toBe(200);
    expect(alicePreview.text).toContain(title);

    const bobPreview = await textFetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}/preview`,
      { headers: userHeaders('bob@example.com') },
    );
    expect(bobPreview.status).toBe(404);

    const bobShowcase = await textFetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}/showcase`,
      { headers: userHeaders('bob@example.com') },
    );
    expect(bobShowcase.status).toBe(404);

    const aliceProject = await jsonFetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({
        id: `alice-ds-project-${stamp}`,
        name: 'Alice design-system project',
        skillId: null,
        designSystemId,
      }),
    });
    expect(aliceProject.status).toBe(200);
    expect(aliceProject.body.project.designSystemId).toBe(designSystemId);

    const aliceWorkspace = await jsonFetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}/workspace`,
      {
        method: 'POST',
        headers: userHeaders('alice@example.com'),
      },
    );
    expect(aliceWorkspace.status).toBe(201);
    const aliceWorkspaceProjectId = aliceWorkspace.body.project.id;
    expect(aliceWorkspaceProjectId).toMatch(/^ds-[a-f0-9]{12}-/u);
    expect(aliceWorkspace.body.project.designSystemId).toBe(designSystemId);

    const aliceWorkspaceProject = await jsonFetch(
      `${baseUrl}/api/projects/${encodeURIComponent(aliceWorkspaceProjectId)}`,
      { headers: userHeaders('alice@example.com') },
    );
    expect(aliceWorkspaceProject.status).toBe(200);
    expect(aliceWorkspaceProject.body.project.id).toBe(aliceWorkspaceProjectId);

    const bobWorkspaceProject = await jsonFetch(
      `${baseUrl}/api/projects/${encodeURIComponent(aliceWorkspaceProjectId)}`,
      { headers: userHeaders('bob@example.com') },
    );
    expect(bobWorkspaceProject.status).toBe(404);

    const bobProject = await jsonFetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: userHeaders('bob@example.com'),
      body: JSON.stringify({
        id: `bob-ds-project-${stamp}`,
        name: 'Bob design-system project',
        skillId: null,
        designSystemId,
      }),
    });
    expect(bobProject.status).toBe(400);
    expect(bobProject.body).toMatchObject({
      error: { code: 'DESIGN_SYSTEM_NOT_FOUND' },
    });

    const bobDesignSystem = await jsonFetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: userHeaders('bob@example.com'),
      body: JSON.stringify({
        title,
        summary: 'Bob tenant scoped design system.',
        category: 'Custom',
        status: 'published',
        body: `# ${title}\n\n> Category: Custom\n> Surface: web\n\nBob tenant scoped design system.\n`,
      }),
    });
    expect(bobDesignSystem.status).toBe(201);
    const bobDesignSystemId = bobDesignSystem.body.designSystem.id;
    const bobWorkspace = await jsonFetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(bobDesignSystemId)}/workspace`,
      {
        method: 'POST',
        headers: userHeaders('bob@example.com'),
      },
    );
    expect(bobWorkspace.status).toBe(201);
    expect(bobWorkspace.body.project.id).toMatch(/^ds-[a-f0-9]{12}-/u);
    expect(bobWorkspace.body.project.id).not.toBe(aliceWorkspaceProjectId);
    expect(bobWorkspace.body.project.designSystemId).toBe(bobDesignSystemId);

    const aliceJob = await jsonFetch(`${baseUrl}/api/design-systems/generation-jobs`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({
        title: `Generated Tenant System ${stamp}`,
        summary: 'Generated tenant scoped design system.',
        category: 'Custom',
        status: 'draft',
      }),
    });
    expect(aliceJob.status).toBe(202);
    const jobId = aliceJob.body.job.id;

    const aliceJobStatus = await jsonFetch(
      `${baseUrl}/api/design-systems/generation-jobs/${encodeURIComponent(jobId)}`,
      { headers: userHeaders('alice@example.com') },
    );
    expect(aliceJobStatus.status).toBe(200);
    expect(aliceJobStatus.body.job.id).toBe(jobId);

    const bobJobStatus = await jsonFetch(
      `${baseUrl}/api/design-systems/generation-jobs/${encodeURIComponent(jobId)}`,
      { headers: userHeaders('bob@example.com') },
    );
    expect(bobJobStatus.status).toBe(404);
  });
});
