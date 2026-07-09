import type http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  propagateWorkspaceProjectRename,
  workspaceRenameDesignSystemId,
} from '../../src/design-systems/index.js';

// Renaming a design-system workspace project used to revert silently:
// ensureUserDesignSystemWorkspaceProject re-stamps the project name from
// the registry title on every workspace open, so a rename applied only to
// the project row was overwritten by the stale title. The fix writes the
// rename through to the design-system title; these tests pin that
// write-through and the predicate that gates it.

const DIR_ID = 'trip-journal-design-system';
const DS_ID = `user:${DIR_ID}`;

describe('workspaceRenameDesignSystemId', () => {
  const workspaceProject = {
    designSystemId: DS_ID,
    metadata: { importedFrom: 'design-system' },
  };

  it('returns the design-system id for a workspace project', () => {
    expect(workspaceRenameDesignSystemId(workspaceProject)).toBe(DS_ID);
  });

  it('ignores projects bound to non-user design systems', () => {
    expect(
      workspaceRenameDesignSystemId({ ...workspaceProject, designSystemId: 'agentic' }),
    ).toBeNull();
  });

  it('ignores projects that are not design-system workspaces', () => {
    expect(
      workspaceRenameDesignSystemId({ ...workspaceProject, metadata: { importedFrom: 'folder' } }),
    ).toBeNull();
    expect(
      workspaceRenameDesignSystemId({ ...workspaceProject, metadata: undefined }),
    ).toBeNull();
  });

  it('ignores projects without a design-system binding', () => {
    expect(
      workspaceRenameDesignSystemId({ designSystemId: null, metadata: { importedFrom: 'design-system' } }),
    ).toBeNull();
  });
});

describe('propagateWorkspaceProjectRename', () => {
  let root = '';
  const project = {
    designSystemId: DS_ID,
    metadata: { importedFrom: 'design-system' },
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-ds-rename-'));
    const dir = path.join(root, DIR_ID);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'DESIGN.md'),
      '# Trip Journal\n\n> Category: Project Design System\n> Surface: web\n\nBody text.\n',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'metadata.json'),
      JSON.stringify(
        {
          title: 'Trip Journal',
          category: 'Project Design System',
          surface: 'web',
          status: 'draft',
          artifactMode: 'agent-managed',
          projectId: 'proj-1',
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('writes the new name through to the design-system title and heading', async () => {
    const propagated = await propagateWorkspaceProjectRename(root, project, 'Earth Postcard');
    expect(propagated).toBe('propagated');

    const metadata = JSON.parse(
      await readFile(path.join(root, DIR_ID, 'metadata.json'), 'utf8'),
    ) as { title?: string };
    expect(metadata.title).toBe('Earth Postcard');

    const designMd = await readFile(path.join(root, DIR_ID, 'DESIGN.md'), 'utf8');
    expect(designMd.startsWith('# Earth Postcard')).toBe(true);
    // The body must survive a rename — only the header changes.
    expect(designMd).toContain('Body text.');
  });

  it('trims the propagated name', async () => {
    expect(await propagateWorkspaceProjectRename(root, project, '  Earth Postcard  ')).toBe(
      'propagated',
    );
    const metadata = JSON.parse(
      await readFile(path.join(root, DIR_ID, 'metadata.json'), 'utf8'),
    ) as { title?: string };
    expect(metadata.title).toBe('Earth Postcard');
  });

  it('is not applicable for blank names or non-workspace projects', async () => {
    expect(await propagateWorkspaceProjectRename(root, project, '   ')).toBe('not-applicable');
    expect(await propagateWorkspaceProjectRename(root, project, undefined)).toBe('not-applicable');
    expect(
      await propagateWorkspaceProjectRename(
        root,
        { designSystemId: DS_ID, metadata: { importedFrom: 'folder' } },
        'Earth Postcard',
      ),
    ).toBe('not-applicable');

    const metadata = JSON.parse(
      await readFile(path.join(root, DIR_ID, 'metadata.json'), 'utf8'),
    ) as { title?: string };
    expect(metadata.title).toBe('Trip Journal');
  });

  it("fails (not 'not-applicable') when the bound design-system entry does not exist", async () => {
    expect(
      await propagateWorkspaceProjectRename(
        root,
        { designSystemId: 'user:missing-entry', metadata: { importedFrom: 'design-system' } },
        'Earth Postcard',
      ),
    ).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/:id — the route that consumes the write-through.
// Review follow-up on the original fix (PR #5134) found two holes:
//   1. The propagation decision used the PRE-patch project row, so a PATCH
//      that renames and rebinds/detaches in one request renamed the design
//      system the project was leaving.
//   2. A failed write-through was swallowed: the route still renamed the
//      project row and returned 200, recreating the silent revert as a
//      partial update. It must abort with an API error instead.
// ---------------------------------------------------------------------------
describe('PATCH /api/projects/:id design-system rename write-through', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { startServer } = await import('../../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createWorkspaceProject(title: string): Promise<{
    designSystemId: string;
    projectId: string;
  }> {
    const createResp = await fetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    expect(createResp.status).toBe(201);
    const created = (await createResp.json()) as { designSystem: { id: string } };
    const designSystemId = created.designSystem.id;

    const workspaceResp = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}/workspace`,
      { method: 'POST' },
    );
    expect(workspaceResp.status).toBe(201);
    const workspace = (await workspaceResp.json()) as { project: { id: string } };
    return { designSystemId, projectId: workspace.project.id };
  }

  async function designSystemTitle(designSystemId: string): Promise<string | undefined> {
    const resp = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}`,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { designSystem: { title?: string } };
    return body.designSystem.title;
  }

  it('a rename survives the next workspace ensure (the original bug)', async () => {
    const { designSystemId, projectId } = await createWorkspaceProject('Rename Survives');

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Workspace' }),
    });
    expect(patchResp.status).toBe(200);
    expect(await designSystemTitle(designSystemId)).toBe('Renamed Workspace');

    // Re-open the workspace: the ensure-sync must reinforce the rename,
    // not re-stamp the stale title over it.
    const ensureResp = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemId)}/workspace`,
      { method: 'POST' },
    );
    expect(ensureResp.status).toBe(201);
    const ensured = (await ensureResp.json()) as { project: { name: string } };
    expect(ensured.project.name).toBe('Renamed Workspace');
  });

  it('does not rename a design system the same PATCH detaches from', async () => {
    const { designSystemId, projectId } = await createWorkspaceProject('Detach Keeps Title');

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Detached Name', designSystemId: null }),
    });
    expect(patchResp.status).toBe(200);
    const patched = (await patchResp.json()) as {
      project: { name: string; designSystemId?: string | null };
    };
    expect(patched.project.name).toBe('Detached Name');
    expect(patched.project.designSystemId ?? null).toBeNull();

    // The design system the project just left keeps its own title.
    expect(await designSystemTitle(designSystemId)).toBe('Detach Keeps Title');
  });

  it('does not rename the design system a PATCH is switching away from', async () => {
    const { designSystemId: oldId, projectId } = await createWorkspaceProject('Old Binding');
    const { designSystemId: newId } = await createWorkspaceProject('New Binding');

    // Draft design systems cannot be bound to projects; publish the target
    // so the rebind passes validateProjectDesignSystemId.
    const publishResp = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(newId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      },
    );
    expect(publishResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Switched Name', designSystemId: newId }),
    });
    expect(patchResp.status).toBe(200);

    // Only the post-patch binding may receive the rename.
    expect(await designSystemTitle(oldId)).toBe('Old Binding');
    expect(await designSystemTitle(newId)).toBe('Switched Name');
  });

  it('aborts the PATCH when the write-through fails, leaving the project row unchanged', async () => {
    const { projectId } = await createWorkspaceProject('Broken Binding');

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    // ds-<dirId> project ids mirror user:<dirId> design-system ids.
    const dirId = projectId.replace(/^ds-/, '');
    await rm(path.join(dataDir, 'design-systems', dirId), { recursive: true, force: true });

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Should Not Stick' }),
    });
    expect(patchResp.status).toBe(409);
    const body = (await patchResp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('CONFLICT');

    // No partial update: the project row must keep its old name.
    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as { project: { name: string } };
    expect(detail.project.name).toBe('Broken Binding');
  });
});
