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

  async function getProjectSkillId(id: string): Promise<unknown> {
    const resp = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project?: { skillId?: unknown } };
    return body.project?.skillId;
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

  it('POST stores `null` when skillId is explicitly null', async () => {
    const id = uniqueId('project-null-skill');
    const resp = await createProject({ id, name: 'Null skill', skillId: null });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
    expect(await getProjectSkillId(id)).toBeNull();
  });

  it('POST stores `null` when skillId is omitted', async () => {
    const id = uniqueId('project-no-skill');
    const resp = await createProject({ id, name: 'No skill' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
    expect(await getProjectSkillId(id)).toBeNull();
  });

  it('POST normalizes an empty-string skillId to `null` so the project row never carries an empty-string sentinel (#2404 round-4 review)', async () => {
    // The route used to write `skillId: skillId ?? null`, so a request
    // with `skillId: ''` returned 200 and silently persisted the
    // empty string. The shared validator now collapses '' to null
    // and the route persists that canonical value instead.
    const id = uniqueId('project-empty-skill');
    const resp = await createProject({ id, name: 'Empty skill', skillId: '' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
    expect(await getProjectSkillId(id)).toBeNull();
  });

  it('POST stores a valid skill id verbatim', async () => {
    // Sanity: normalization only kicks in for the empty-string sentinel;
    // a real skill id reaches the row unchanged.
    const id = uniqueId('project-template-skill-stored');
    const resp = await createProject({ id, name: 'Template skill stored', skillId: 'dashboard' });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
    expect(await getProjectSkillId(id)).toBe('dashboard');
  });

  it('POST canonicalizes a deprecated skill alias before persistence (#2404 round-5 review)', async () => {
    // `SKILL_ID_ALIASES` in apps/daemon/src/skills.ts forwards
    // `editorial-collage-deck → open-design-landing-deck` (and
    // `editorial-collage → open-design-landing`) for runtime
    // composition, but the web does direct `project.skillId === s.id`
    // comparisons in ProjectView.tsx for the skill chip + deck-mode
    // detection. Persisting the raw alias used to leave the UI
    // showing "no skill pinned" / no deck mode even though runtime
    // composition still resolved the alias. The validator now
    // returns the canonical id and the route persists that, so
    // on-disk state matches what the runtime composes against.
    const id = uniqueId('project-aliased-skill');
    const resp = await createProject({
      id,
      name: 'Aliased skill',
      skillId: 'editorial-collage-deck',
    });
    expect(resp.status).toBe(200);
    projectsToClean.push(id);
    expect(await getProjectSkillId(id)).toBe('open-design-landing-deck');
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
    expect(await getProjectSkillId(id)).toBeNull();
  });

  it('PATCH canonicalizes a deprecated skill alias before persistence (#2404 round-5 review)', async () => {
    const id = uniqueId('project-patch-aliased-skill');
    const create = await createProject({ id, name: 'Patch aliased skill' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { skillId: 'editorial-collage' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project?: { skillId?: string } };
    expect(body.project?.skillId).toBe('open-design-landing');
    expect(await getProjectSkillId(id)).toBe('open-design-landing');
  });

  it('PATCH normalizes an empty-string skillId to `null` (#2404 round-4 review)', async () => {
    // PATCH previously forwarded patch.skillId straight into
    // updateProject() with no normalization, so a `skillId: ''`
    // patch returned 200 and stored '' over a real skill id —
    // re-opening the inconsistent-row case from the POST side.
    // The validator's canonical value now flows back into patch.skillId
    // before persistence.
    const id = uniqueId('project-patch-empty-skill');
    const create = await createProject({ id, name: 'Patch empty skill', skillId: 'dashboard' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);
    expect(await getProjectSkillId(id)).toBe('dashboard');

    const resp = await patchProject(id, { skillId: '' });
    expect(resp.status).toBe(200);
    expect(await getProjectSkillId(id)).toBeNull();
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

  // ---- pendingPrompt type guards (#2404 round-6 review) ------------------

  it('POST rejects a non-string non-null pendingPrompt so contract types stay honored', async () => {
    // pendingPrompt is contract-typed `string | null` and the web
    // calls `project?.pendingPrompt?.trim()`. Wrong-type values must
    // fail at the route boundary, not at next render.
    const id = uniqueId('project-bad-pending-prompt');
    const resp = await createProject({ id, name: 'Bad pending prompt', pendingPrompt: 42 });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/pendingPrompt/);
  });

  it('PATCH rejects a non-string non-null pendingPrompt', async () => {
    const id = uniqueId('project-patch-bad-pending-prompt');
    const create = await createProject({ id, name: 'Patch bad pending prompt' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { pendingPrompt: { not: 'a string' } });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/pendingPrompt/);
  });

  it('PATCH accepts a null pendingPrompt — caller can clear the pending prompt', async () => {
    const id = uniqueId('project-patch-null-pending-prompt');
    const create = await createProject({ id, name: 'Patch null pp', pendingPrompt: 'something' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { pendingPrompt: null });
    expect(resp.status).toBe(200);
  });

  // ---- name guard on PATCH (#2404 round-6 review) ------------------------

  it('PATCH rejects a non-string name so `project.name.trim()` consumers never see a number/object', async () => {
    const id = uniqueId('project-patch-bad-name-type');
    const create = await createProject({ id, name: 'Original' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { name: 42 });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/name/);
  });

  it('PATCH rejects a whitespace-only name to keep the POST invariant', async () => {
    const id = uniqueId('project-patch-blank-name');
    const create = await createProject({ id, name: 'Original' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { name: '   ' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/name/);
  });

  it('PATCH accepts and trims a valid name so the stored value matches the POST shape', async () => {
    const id = uniqueId('project-patch-good-name');
    const create = await createProject({ id, name: 'Old name' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { name: '  Renamed  ' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project?: { name?: string } };
    expect(body.project?.name).toBe('Renamed');
  });

  it('PATCH leaves the project name untouched when the body omits the field — only validated when explicitly included', async () => {
    const id = uniqueId('project-patch-no-name-field');
    const create = await createProject({ id, name: 'Untouched' });
    expect(create.status).toBe(200);
    projectsToClean.push(id);

    const resp = await patchProject(id, { customInstructions: 'edit' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project?: { name?: string } };
    expect(body.project?.name).toBe('Untouched');
  });
});
