// Route-level guard for POST /api/projects' `skillId`.
//
// Before this commit, the create route persisted skillId as-is without
// checking that it referenced a real skill in SKILLS_DIR. A typo on
// the web UI / CLI / MCP create_project tool would return 200, store
// the bad id on the project row, and then silently fall through
// `findSkillById(...)` at run-startup time — leaving the project with
// no pinned skill and no error to the caller (issue #2404 review on
// PR #2404).
//
// The fix mirrors how designSystemId is already validated: unknown
// ids reject with `SKILL_NOT_FOUND` (400). null/undefined/'' keep the
// "no skill pinned" semantics.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('POST /api/projects skillId validation (#2404)', () => {
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

  it('rejects an unknown skillId with SKILL_NOT_FOUND so callers fail fast at create time', async () => {
    const id = uniqueId('project-bad-skill');
    const resp = await createProject({ id, name: 'Bad skill', skillId: 'missing-skill' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('SKILL_NOT_FOUND');
    expect(body.error?.message).toMatch(/skill not found/i);
  });

  it('rejects non-string skillId values', async () => {
    const id = uniqueId('project-bad-skill-type');
    const resp = await createProject({ id, name: 'Bad skill type', skillId: 42 });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/skillId/i);
  });

  it('accepts null skillId — keeps the existing "no skill pinned" semantics', async () => {
    const id = uniqueId('project-null-skill');
    const resp = await createProject({ id, name: 'Null skill', skillId: null });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });

  it('accepts an omitted skillId — keeps the existing "no skill pinned" semantics', async () => {
    const id = uniqueId('project-no-skill');
    const resp = await createProject({ id, name: 'No skill' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });

  it('accepts an empty-string skillId — treated the same as null/omitted', async () => {
    const id = uniqueId('project-empty-skill');
    const resp = await createProject({ id, name: 'Empty skill', skillId: '' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });
});
