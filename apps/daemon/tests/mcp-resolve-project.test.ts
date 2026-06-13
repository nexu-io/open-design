import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveProjectId, withActiveEcho } from '../src/mcp.js';

// Two projects whose names share the substring 'app' for ambiguity testing.
const PROJECTS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'My App' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Store App' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'recaptr' },
];

describe('resolveProjectId', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const app = express();
        app.get('/api/projects', (_req, res) => res.json({ projects: PROJECTS }));
        const tmp = http.createServer();
        tmp.listen(0, '127.0.0.1', () => {
          const { port } = tmp.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${port}`;
          tmp.close(() => {
            server = app.listen(port, '127.0.0.1', () => resolve());
          });
        });
      }),
  );

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('UUID input returns source: uuid without fetching the project list', async () => {
    const r = await resolveProjectId(baseUrl, '11111111-1111-1111-1111-111111111111');
    expect(r.source).toBe('uuid');
    expect(r.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('exact name match returns source: exact', async () => {
    const r = await resolveProjectId(baseUrl, 'My App');
    expect(r.source).toBe('exact');
    expect(r.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(r.name).toBe('My App');
  });

  it('slug match (my-app) returns source: slug', async () => {
    const r = await resolveProjectId(baseUrl, 'my-app');
    expect(r.source).toBe('slug');
    expect(r.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('single substring match returns source: substring', async () => {
    const r = await resolveProjectId(baseUrl, 'recapt');
    expect(r.source).toBe('substring');
    expect(r.id).toBe('33333333-3333-3333-3333-333333333333');
    expect(r.name).toBe('recaptr');
  });

  it('multiple substring matches throw an ambiguity error', async () => {
    // 'My App' and 'Store App' both contain 'app'
    await expect(resolveProjectId(baseUrl, 'app')).rejects.toThrow(/multiple projects match/);
  });
});

describe('withActiveEcho resolvedProject stamping', () => {
  it('uuid source: resolvedProject is not added', () => {
    const result = withActiveEcho({ x: 1 }, null, { id: 'abc', name: 'Test', source: 'uuid' });
    expect(result).not.toHaveProperty('resolvedProject');
  });

  it('exact source: resolvedProject is not added', () => {
    const result = withActiveEcho({ x: 1 }, null, { id: 'abc', name: 'Test', source: 'exact' });
    expect(result).not.toHaveProperty('resolvedProject');
  });

  it('slug source: resolvedProject is added with id and name', () => {
    const result = withActiveEcho({ x: 1 }, null, { id: 'abc', name: 'Test', source: 'slug' });
    expect(result.resolvedProject).toEqual({ id: 'abc', name: 'Test' });
  });

  it('substring source: resolvedProject is added with id and name', () => {
    const result = withActiveEcho({ x: 1 }, null, { id: 'abc', name: 'Test', source: 'substring' });
    expect(result.resolvedProject).toEqual({ id: 'abc', name: 'Test' });
  });
});
