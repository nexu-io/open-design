import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project skillId validation', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function uniqueId(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
  }

  async function createProject(body: Record<string, unknown>) {
    return fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  describe('POST /api/projects', () => {
    it('rejects unknown skillId with 400 SKILL_NOT_FOUND', async () => {
      const id = uniqueId('p');
      const resp = await createProject({
        id,
        name: 'Skill id check',
        skillId: 'definitely-not-a-real-skill',
      });
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error: { code: string } };
      expect(body.error.code).toBe('SKILL_NOT_FOUND');
      // Project must not have been persisted.
      const getResp = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
      expect(getResp.status).toBe(404);
    });
  });
});
