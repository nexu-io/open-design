// Route-level guard for `skillId` on POST and PATCH /api/projects.
//
// Two regressions live here:
//
// 1. POST used to persist skillId as-is without checking against any
//    skill source-of-truth. A typo from the web UI / CLI / MCP
//    create_project tool returned 200, stored the bad id on the row,
//    and then silently fell through `findSkillById(...)` at
//    run-startup time — leaving the project with no pinned skill and
//    no error to the caller (#2404).
// 2. PATCH /api/projects/:id forwarded `patch` straight into
//    `updateProject(db, id, patch)` without any skillId check, so a
//    caller could create a project cleanly and then re-open the same
//    silent-drop path by patching `skillId: missing-skill` (#2404
//    reviewer follow-up).
//
// The fix shares one helper across POST and PATCH and validates
// against `listAllSkillLikeEntries()` — the same source-of-truth the
// daemon uses at run-startup to resolve `project.skillId` — so the
// guard accepts every id the runtime would, including bundled
// `design-templates/*` ids and user-imported skill ids. Narrower
// validation (e.g. `listSkills(SKILLS_DIR)`) would falsely reject
// legitimate template targets.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('skillId validation on POST/PATCH /api/projects (#2404)', () => {
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

  async function patchProject(id: string, body: Record<string, unknown>) {
    return fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('POST rejects an unknown skillId with SKILL_NOT_FOUND so callers fail fast at create time', async () => {
    const id = uniqueId('project-bad-skill');
    const resp = await createProject({ id, name: 'Bad skill', skillId: 'missing-skill' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('SKILL_NOT_FOUND');
    expect(body.error?.message).toMatch(/skill not found/i);
  });

  it('POST rejects non-string skillId values', async () => {
    const id = uniqueId('project-bad-skill-type');
    const resp = await createProject({ id, name: 'Bad skill type', skillId: 42 });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/skillId/i);
  });

  it('POST accepts a bundled design-template id (#2404 reviewer follow-up — the guard must not be narrower than the runtime resolver)', async () => {
    // `dashboard` lives under `design-templates/`, not `skills/`. The
    // runtime resolves `project.skillId` through
    // `listAllSkillLikeEntries()`, which spans both directories plus
    // user-imported roots; the route guard must agree. Before this
    // follow-up the guard called `listSkills(SKILLS_DIR)` and
    // rejected this id as `SKILL_NOT_FOUND` even though the rest of
    // the daemon would happily resolve it.
    const id = uniqueId('project-template-skill');
    const resp = await createProject({ id, name: 'Template skill', skillId: 'dashboard' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });

  it('POST accepts null skillId — keeps the existing "no skill pinned" semantics', async () => {
    const id = uniqueId('project-null-skill');
    const resp = await createProject({ id, name: 'Null skill', skillId: null });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });

  it('POST accepts an omitted skillId — keeps the existing "no skill pinned" semantics', async () => {
    const id = uniqueId('project-no-skill');
    const resp = await createProject({ id, name: 'No skill' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });

  it('POST accepts an empty-string skillId — treated the same as null/omitted', async () => {
    const id = uniqueId('project-empty-skill');
    const resp = await createProject({ id, name: 'Empty skill', skillId: '' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
  });

  it('PATCH rejects an unknown skillId with SKILL_NOT_FOUND — closes the bypass that lets callers create then patch in a bad id', async () => {
    // Create cleanly, then try to patch in a bad skillId. Without
    // the shared guard the patch would 200 and persist the typo,
    // re-opening the silent-drop path the POST fix closes.
    const id = uniqueId('project-patch-bad-skill');
    const create = await createProject({ id, name: 'Patch bad skill' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { skillId: 'missing-skill' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('SKILL_NOT_FOUND');
    expect(body.error?.message).toMatch(/skill not found/i);
  });

  it('PATCH rejects non-string skillId values', async () => {
    const id = uniqueId('project-patch-bad-skill-type');
    const create = await createProject({ id, name: 'Patch bad skill type' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { skillId: 42 });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/skillId/i);
  });

  it('PATCH accepts a bundled design-template id, mirroring POST', async () => {
    const id = uniqueId('project-patch-template-skill');
    const create = await createProject({ id, name: 'Patch template skill' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { skillId: 'dashboard' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project?: { skillId?: string } };
    expect(body.project?.skillId).toBe('dashboard');
  });

  it('PATCH accepts null skillId — caller can clear the pinned skill', async () => {
    const id = uniqueId('project-patch-null-skill');
    const create = await createProject({ id, name: 'Patch null skill', skillId: 'dashboard' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { skillId: null });
    expect(resp.status).toBe(200);
  });

  it('PATCH leaves skillId untouched when the patch body omits the field — only validated when explicitly included', async () => {
    // Regression guard: the helper must be invoked only when
    // `Object.prototype.hasOwnProperty.call(patch, 'skillId')` so
    // unrelated metadata patches (e.g. customInstructions edits)
    // never trip the validator.
    const id = uniqueId('project-patch-no-skill-field');
    const create = await createProject({ id, name: 'Patch other field' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { customInstructions: 'something' });
    expect(resp.status).toBe(200);
  });
});
