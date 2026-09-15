import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { localMcpToolDefinitions } from '../src/mcp.js';
import { isSafeProjectName } from '../src/projects.js';
import { startServer } from '../src/server.js';

// Red specs for #7042 — create_project persisted traversal-like display
// names ('..', 'a/../../b') into the registry/UI.
describe('project name validation (#7042)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('rejects traversal-like names on project create', async () => {
    const cases = ['..', 'a/../../b', '.', 'slash\\name'];
    for (const name of cases) {
      const id = 'v-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      const resp = await fetch(baseUrl + '/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      expect(resp.status, 'name=' + name).toBe(400);
    }
  });

  it('accepts a normal name', async () => {
    const id = 'v-ok-' + Date.now();
    const resp = await fetch(baseUrl + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'My Project' }),
    });
    expect(resp.status).toBe(200);
  });

  it('rejects unsafe names on rename', async () => {
    const id = 'v-rename-' + Date.now();
    const create = await fetch(baseUrl + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'Rename Me' }),
    });
    expect(create.status).toBe(200);
    const resp = await fetch(baseUrl + '/api/projects/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '../escaped' }),
    });
    expect(resp.status).toBe(400);
  });

  it('isSafeProjectName unit contract', () => {
    expect(isSafeProjectName('My Project')).toBe(true);
    expect(isSafeProjectName('..')).toBe(false);
    expect(isSafeProjectName('.')).toBe(false);
    expect(isSafeProjectName('a/../../b')).toBe(false);
    expect(isSafeProjectName('back\\slash')).toBe(false);
    expect(isSafeProjectName('nul\u0000')).toBe(false);
  });

  it('MCP create_project schema rejects unsafe names', () => {
    const def = localMcpToolDefinitions().find((tool) => tool.name === 'create_project');
    const pattern = (def?.inputSchema?.properties?.name as { pattern?: string } | undefined)?.pattern;
    expect(typeof pattern).toBe('string');
    const re = new RegExp(pattern as string);
    expect(re.test('My Project')).toBe(true);
    expect(re.test('a/../../b')).toBe(false);
    expect(re.test('back\\slash')).toBe(false);
    expect(re.test('nul\u0000')).toBe(false);
    // '..' is excluded by the schema's not clause, not the pattern
    const notEnum = (def?.inputSchema?.properties?.name as { not?: { enum?: string[] } } | undefined)?.not?.enum ?? [];
    expect(notEnum).toContain('..');
  });
});
