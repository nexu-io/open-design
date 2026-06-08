import http from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };
type JsonObject = Record<string, any>;

let server: http.Server | undefined;
let baseUrl = '';
let priorMultitenant: string | undefined;
let pluginRoot = '';

beforeEach(async () => {
  priorMultitenant = process.env.OD_MULTITENANT;
  process.env.OD_MULTITENANT = '1';
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-static-resource-auth-'));
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
  await rm(pluginRoot, { recursive: true, force: true });
  pluginRoot = '';
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

async function readSse(resp: Response): Promise<string> {
  if (!resp.body) throw new Error('install stream missing body');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw;
}

describe('static resource route auth context', () => {
  it('scopes imported skills and project skill validation to the authenticated owner', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const skillId = `Tenant Skill ${stamp}`;

    const imported = await jsonFetch(`${baseUrl}/api/skills/import`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({
        name: skillId,
        description: 'Tenant scoped skill.',
        body: '# Tenant Skill\n\nUse this skill for tenant scoped tests.',
      }),
    });
    expect(imported.status).toBe(201);
    expect(imported.body.skill.id).toBe(skillId);

    const aliceList = await jsonFetch(`${baseUrl}/api/skills`, {
      headers: userHeaders('alice@example.com'),
    });
    expect(aliceList.status).toBe(200);
    expect(aliceList.body.skills.map((skill: JsonObject) => skill.id)).toContain(skillId);

    const bobList = await jsonFetch(`${baseUrl}/api/skills`, {
      headers: userHeaders('bob@example.com'),
    });
    expect(bobList.status).toBe(200);
    expect(bobList.body.skills.map((skill: JsonObject) => skill.id)).not.toContain(skillId);

    const bobDetail = await jsonFetch(`${baseUrl}/api/skills/${encodeURIComponent(skillId)}`, {
      headers: userHeaders('bob@example.com'),
    });
    expect(bobDetail.status).toBe(404);

    const aliceProject = await jsonFetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({
        id: `alice-skill-project-${stamp}`,
        name: 'Alice skill project',
        skillId,
        designSystemId: null,
      }),
    });
    expect(aliceProject.status).toBe(200);
    expect(aliceProject.body.project.skillId).toBe(skillId);

    const alicePatchTarget = await jsonFetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({
        id: `alice-skill-patch-target-${stamp}`,
        name: 'Alice skill patch target',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(alicePatchTarget.status).toBe(200);

    const alicePatch = await jsonFetch(
      `${baseUrl}/api/projects/${encodeURIComponent(alicePatchTarget.body.project.id)}`,
      {
        method: 'PATCH',
        headers: userHeaders('alice@example.com'),
        body: JSON.stringify({ skillId }),
      },
    );
    expect(alicePatch.status).toBe(200);
    expect(alicePatch.body.project.skillId).toBe(skillId);

    const bobProject = await jsonFetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: userHeaders('bob@example.com'),
      body: JSON.stringify({
        id: `bob-skill-project-${stamp}`,
        name: 'Bob skill project',
        skillId,
        designSystemId: null,
      }),
    });
    expect(bobProject.status).toBe(400);
    expect(bobProject.body).toMatchObject({
      error: { code: 'SKILL_NOT_FOUND' },
    });

    const pluginId = `tenant-skill-plugin-${stamp}`;
    const pluginDir = path.join(pluginRoot, pluginId);
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, 'open-design.json'),
      JSON.stringify({
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: pluginId,
        title: 'Tenant Skill Plugin',
        version: '1.0.0',
        description: 'References a tenant-scoped skill.',
        license: 'MIT',
        od: {
          kind: 'skill',
          taskKind: 'new-generation',
          useCase: { query: 'Use the tenant skill.' },
          context: { skills: [{ ref: skillId }] },
          capabilities: ['prompt:inject'],
        },
      }),
      'utf8',
    );
    await writeFile(
      path.join(pluginDir, 'SKILL.md'),
      `---\nname: ${pluginId}\ndescription: tenant skill plugin\n---\n# Tenant skill plugin\n`,
      'utf8',
    );
    const installPlugin = await fetch(`${baseUrl}/api/plugins/install`, {
      method: 'POST',
      headers: { ...userHeaders('alice@example.com'), accept: 'text/event-stream' },
      body: JSON.stringify({ source: pluginDir }),
    });
    expect(installPlugin.status).toBe(200);
    expect(await readSse(installPlugin)).toContain('event: success');

    const aliceApply = await jsonFetch(`${baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/apply`, {
      method: 'POST',
      headers: userHeaders('alice@example.com'),
      body: JSON.stringify({ inputs: {} }),
    });
    expect(aliceApply.status).toBe(200);
    expect(aliceApply.body.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'skill', id: skillId }),
      ]),
    );

    const bobApply = await jsonFetch(`${baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/apply`, {
      method: 'POST',
      headers: userHeaders('bob@example.com'),
      body: JSON.stringify({ inputs: {} }),
    });
    expect(bobApply.status).toBe(200);
    expect((bobApply.body.contextItems as JsonObject[]).map((item) => item.id)).not.toContain(skillId);
  });
});
