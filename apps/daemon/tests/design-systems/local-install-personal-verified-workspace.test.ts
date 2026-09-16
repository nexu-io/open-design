// Regression (PR #7693 review): the legacy unattributed personal design-system
// allowance must key on the workspace type the membership directory
// ESTABLISHED, never on the caller's `x-od-workspace-type` claim.
//
// In the packaged runtime (`OD_WORKSPACE_CONTEXT_SOURCE=vela`) the verifier
// identifies a member by Workspace/member id and returns the directory item's
// own type; it does not reject a mismatched type header. Lazy orphan adoption
// writes memberless `workspace_projects` rows into whatever workspace a request
// names — Team workspaces included — and the startup backfill turns them into
// unattributed `visibility: 'personal'` bindings. Keyed on the raw claim, the
// allowance would let a Team member send `x-od-workspace-type: personal` and
// read, select, edit, publish, and delete every such legacy system inside
// their Team workspace. The daemon's claim-tier workspace-type memo is no
// witness either: a project route learns it from the same raw header.
//
// These specs drive the real daemon against a stub membership directory that
// holds one Team and one Personal membership, each workspace carrying a legacy
// unattributed personal design system. The Team workspace's system must stay
// refused at every gate for a member claiming `personal` — catalog, detail,
// mutation, project creation, PATCH selection — even after that member has
// taught the claim tier that the workspace is personal. The Personal
// workspace is the positive control: the same gates grant, proving the
// verified path is what grants, not a blanket refusal.

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ensureWorkspaceProject,
  getProject,
  getWorkspaceResourceByResourceId,
  insertProject,
} from '../../src/db.js';
import { backfillDesignSystemWorkspaceResources } from '../../src/design-systems/index.js';
import { startServer } from '../../src/server.js';

const TEAM_WORKSPACE = `team-ws-${randomUUID()}`;
const TEAM_MEMBER = `team-member-${randomUUID()}`;
const PERSONAL_WORKSPACE = `personal-ws-${randomUUID()}`;
const PERSONAL_MEMBER = `personal-member-${randomUUID()}`;

const TEAM_DIR_ID = `legacy-in-team-${randomUUID()}`;
const TEAM_DESIGN_SYSTEM_ID = `user:${TEAM_DIR_ID}`;
const TEAM_EDITING_PROJECT_ID = `ds-editing-team-${randomUUID()}`;
const PERSONAL_DIR_ID = `legacy-in-personal-${randomUUID()}`;
const PERSONAL_DESIGN_SYSTEM_ID = `user:${PERSONAL_DIR_ID}`;
const PERSONAL_EDITING_PROJECT_ID = `ds-editing-personal-${randomUUID()}`;

let daemon: { url: string; server: http.Server; shutdown?: () => Promise<void> | void };
let authority: http.Server;
let scratch: string;
let directoryReads = 0;
const createdProjectIds: string[] = [];

function scopeHeaders(
  workspaceId: string,
  workspaceMemberId: string,
  workspaceType: 'personal' | 'team',
): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-member-id': workspaceMemberId,
    'x-od-workspace-type': workspaceType,
  };
}

/** A Team member of the Team workspace claiming it is personal. */
const teamMemberClaimingPersonal = () => scopeHeaders(TEAM_WORKSPACE, TEAM_MEMBER, 'personal');
/** The same member with an honest claim. */
const teamMemberHonest = () => scopeHeaders(TEAM_WORKSPACE, TEAM_MEMBER, 'team');
/** The Personal workspace's only member, asserting what the directory confirms. */
const personalMember = () => scopeHeaders(PERSONAL_WORKSPACE, PERSONAL_MEMBER, 'personal');

function openSqlite(): Database.Database {
  return new Database(resolve(process.env.OD_DATA_DIR!, 'app.sqlite'));
}

function designSystemUrl(id: string): string {
  return `${daemon.url}/api/design-systems/${encodeURIComponent(id)}`;
}

async function listCatalogIds(headers: Record<string, string>): Promise<string[]> {
  const response = await fetch(`${daemon.url}/api/design-systems`, { headers });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { designSystems: Array<{ id: string }> };
  return body.designSystems.map((system) => system.id);
}

async function createProject(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ id: string; response: Response }> {
  const id = `proj-verified-ws-${randomUUID()}`;
  createdProjectIds.push(id);
  const response = await fetch(`${daemon.url}/api/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, name: 'Verified workspace spec project', skipDiscoveryBrief: true, ...body }),
  });
  return { id, response };
}

async function startAuthority(): Promise<string> {
  authority = http.createServer((req, res) => {
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      directoryReads += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        items: [
          {
            workspaceId: TEAM_WORKSPACE,
            workspaceName: 'Verified team',
            workspaceType: 'team',
            workspaceMemberId: TEAM_MEMBER,
            role: 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
          {
            workspaceId: PERSONAL_WORKSPACE,
            workspaceName: 'Verified personal',
            workspaceType: 'personal',
            workspaceMemberId: PERSONAL_MEMBER,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((done) => authority.listen(0, '127.0.0.1', done));
  const address = authority.address();
  if (!address || typeof address === 'string') throw new Error('authority did not bind');
  return `http://127.0.0.1:${address.port}`;
}

async function writeVelaStub(root: string): Promise<string> {
  const script = join(root, 'vela-stub.mjs');
  await fsp.writeFile(script, "process.stdout.write(JSON.stringify([]) + '\\n');\n", 'utf8');
  const bin = join(root, 'vela');
  await fsp.writeFile(
    bin,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
    'utf8',
  );
  await fsp.chmod(bin, 0o755);
  return bin;
}

/** The exact on-disk + DB state of a legacy install, per workspace. */
async function seedLegacyDesignSystem(
  sqlite: Database.Database,
  input: { dirId: string; editingProjectId: string; workspaceId: string; title: string },
): Promise<void> {
  const dataDir = process.env.OD_DATA_DIR!;
  const designSystemDir = resolve(dataDir, 'design-systems', input.dirId);
  await fsp.mkdir(designSystemDir, { recursive: true });
  await fsp.writeFile(
    resolve(designSystemDir, 'DESIGN.md'),
    `# ${input.title}\n\nA legacy local design system.\n`,
    'utf8',
  );
  await fsp.writeFile(
    resolve(designSystemDir, 'metadata.json'),
    `${JSON.stringify({ title: input.title, status: 'published', projectId: input.editingProjectId }, null, 2)}\n`,
    'utf8',
  );
  const editingProjectDir = resolve(dataDir, 'projects', input.editingProjectId);
  await fsp.mkdir(editingProjectDir, { recursive: true });
  await fsp.copyFile(resolve(designSystemDir, 'DESIGN.md'), resolve(editingProjectDir, 'DESIGN.md'));
  insertProject(sqlite as never, {
    id: input.editingProjectId,
    name: input.title,
    createdAt: 1,
    updatedAt: 1,
  });
  // Legacy orphan adoption shape: bound to the workspace the request named,
  // with NO creator member (`ensureWorkspaceProjection` writes exactly this,
  // for Team workspaces too).
  ensureWorkspaceProject(sqlite as never, {
    workspaceId: input.workspaceId,
    projectId: input.editingProjectId,
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: null,
  });
}

beforeAll(async () => {
  if (!process.env.OD_DATA_DIR) {
    throw new Error('OD_DATA_DIR is required for the verified-workspace design-system spec');
  }
  scratch = await fsp.mkdtemp(join(tmpdir(), 'od-ds-verified-workspace-'));
  const authorityUrl = await startAuthority();
  vi.stubEnv('OD_WORKSPACE_CONTEXT_SOURCE', 'vela');
  vi.stubEnv('VELA_API_URL', authorityUrl);
  vi.stubEnv('VELA_CONTROL_KEY', 'verified-workspace-control-key');
  vi.stubEnv('VELA_BIN', await writeVelaStub(scratch));
  vi.stubEnv('AMR_HOME', join(scratch, 'empty-amr-home'));
  vi.stubEnv('OD_COLLAB_TRANSPORT', 'off');
  vi.stubEnv('OD_RESOURCE_TRANSPORT', 'off');
  vi.stubEnv('OD_TEAM_PROJECTS_TRANSPORT', 'off');

  daemon = (await startServer({ port: 0, returnServer: true })) as typeof daemon;

  const sqlite = openSqlite();
  try {
    await seedLegacyDesignSystem(sqlite, {
      dirId: TEAM_DIR_ID,
      editingProjectId: TEAM_EDITING_PROJECT_ID,
      workspaceId: TEAM_WORKSPACE,
      title: 'Legacy system adopted into a Team workspace',
    });
    await seedLegacyDesignSystem(sqlite, {
      dirId: PERSONAL_DIR_ID,
      editingProjectId: PERSONAL_EDITING_PROJECT_ID,
      workspaceId: PERSONAL_WORKSPACE,
      title: 'Legacy system adopted into a Personal workspace',
    });
    await backfillDesignSystemWorkspaceResources(
      sqlite as never,
      resolve(process.env.OD_DATA_DIR, 'design-systems'),
    );
    for (const [id, workspaceId] of [
      [TEAM_DESIGN_SYSTEM_ID, TEAM_WORKSPACE],
      [PERSONAL_DESIGN_SYSTEM_ID, PERSONAL_WORKSPACE],
    ] as const) {
      expect(getWorkspaceResourceByResourceId(sqlite as never, 'design_system', id)).toMatchObject({
        workspaceId,
        visibility: 'personal',
        createdByWorkspaceMemberId: null,
      });
    }
  } finally {
    sqlite.close();
  }
}, 60_000);

afterAll(async () => {
  for (const id of [...createdProjectIds, TEAM_EDITING_PROJECT_ID, PERSONAL_EDITING_PROJECT_ID]) {
    await fetch(`${daemon.url}/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: teamMemberHonest(),
    }).catch(() => {});
    await fetch(`${daemon.url}/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: personalMember(),
    }).catch(() => {});
  }
  for (const dirId of [TEAM_DIR_ID, PERSONAL_DIR_ID]) {
    await fsp.rm(resolve(process.env.OD_DATA_DIR!, 'design-systems', dirId), { recursive: true, force: true })
      .catch(() => {});
  }
  await Promise.resolve(daemon?.shutdown?.());
  daemon?.server.closeAllConnections?.();
  if (daemon?.server.listening) {
    await new Promise<void>((done) => daemon.server.close(() => done()));
  }
  authority?.closeAllConnections?.();
  if (authority?.listening) {
    await new Promise<void>((done) => authority.close(() => done()));
  }
  await fsp.rm(scratch, { recursive: true, force: true }).catch(() => {});
  vi.unstubAllEnvs();
}, 60_000);

describe('legacy personal design-system allowance keys on the directory-verified workspace type', () => {
  it('hides the Team workspace system from a member claiming personal, even after the claim tier learned it', async () => {
    // Teach the daemon's claim-tier memo that the Team workspace is personal
    // — a project route learns `x-od-workspace-type` from the raw header —
    // then read the catalog under the same claim. Only the directory's word
    // may grant, and the directory says Team.
    const poison = await createProject(teamMemberClaimingPersonal(), {});
    expect(poison.response.status, await poison.response.clone().text()).toBe(200);

    expect(await listCatalogIds(teamMemberClaimingPersonal())).not.toContain(TEAM_DESIGN_SYSTEM_ID);
    expect(await listCatalogIds(teamMemberHonest())).not.toContain(TEAM_DESIGN_SYSTEM_ID);
    expect(directoryReads).toBeGreaterThan(0);
  });

  it('refuses the detail read and every navigation read for the claimed-personal Team scope', async () => {
    const detail = await fetch(designSystemUrl(TEAM_DESIGN_SYSTEM_ID), {
      headers: teamMemberClaimingPersonal(),
    });
    expect(detail.status).toBe(403);

    const query = `workspaceId=${TEAM_WORKSPACE}&workspaceMemberId=${TEAM_MEMBER}&workspaceType=personal`;
    const preview = await fetch(`${designSystemUrl(TEAM_DESIGN_SYSTEM_ID)}/preview?${query}`);
    expect(preview.status).toBe(403);
  });

  it('refuses every mutation for the claimed-personal Team scope', async () => {
    const renamed = await fetch(designSystemUrl(TEAM_DESIGN_SYSTEM_ID), {
      method: 'PATCH',
      headers: teamMemberClaimingPersonal(),
      body: JSON.stringify({ title: 'Must not rename' }),
    });
    expect(renamed.status).toBe(403);

    const opened = await fetch(`${designSystemUrl(TEAM_DESIGN_SYSTEM_ID)}/workspace`, {
      method: 'POST',
      headers: teamMemberClaimingPersonal(),
    });
    expect(opened.status).toBe(403);

    const deleted = await fetch(designSystemUrl(TEAM_DESIGN_SYSTEM_ID), {
      method: 'DELETE',
      headers: teamMemberClaimingPersonal(),
    });
    expect(deleted.status).toBe(403);

    const sqlite = openSqlite();
    try {
      expect(getWorkspaceResourceByResourceId(sqlite as never, 'design_system', TEAM_DESIGN_SYSTEM_ID))
        .toMatchObject({ workspaceId: TEAM_WORKSPACE, resourceState: 'active' });
    } finally {
      sqlite.close();
    }
  });

  it('refuses project creation whose selection partition claims the Team workspace is personal', async () => {
    const created = await createProject(teamMemberClaimingPersonal(), {
      designSystemId: TEAM_DESIGN_SYSTEM_ID,
      designSystemCatalogScope: {
        workspaceId: TEAM_WORKSPACE,
        workspaceMemberId: TEAM_MEMBER,
        workspaceType: 'personal',
      },
    });

    expect(created.response.status).toBe(400);
    expect(await created.response.text()).toContain('DESIGN_SYSTEM_NOT_FOUND');
  });

  it('refuses a PATCH selection on a Team-workspace project whose request claims personal', async () => {
    const created = await createProject(teamMemberHonest(), {});
    expect(created.response.status, await created.response.clone().text()).toBe(200);

    const selected = await fetch(`${daemon.url}/api/projects/${encodeURIComponent(created.id)}`, {
      method: 'PATCH',
      headers: teamMemberClaimingPersonal(),
      body: JSON.stringify({ designSystemId: TEAM_DESIGN_SYSTEM_ID }),
    });

    expect(selected.status, await selected.clone().text()).toBe(400);
    expect(await selected.text()).toContain('DESIGN_SYSTEM_NOT_FOUND');
  });

  it('grants the Personal workspace system to its verified member at every gate (positive control)', async () => {
    expect(await listCatalogIds(personalMember())).toContain(PERSONAL_DESIGN_SYSTEM_ID);

    const detail = await fetch(designSystemUrl(PERSONAL_DESIGN_SYSTEM_ID), { headers: personalMember() });
    expect(detail.status, await detail.clone().text()).toBe(200);
    expect(((await detail.json()) as { canMutate?: boolean }).canMutate).toBe(true);

    const renamed = await fetch(designSystemUrl(PERSONAL_DESIGN_SYSTEM_ID), {
      method: 'PATCH',
      headers: personalMember(),
      body: JSON.stringify({ title: 'Renamed under a verified personal workspace' }),
    });
    expect(renamed.status, await renamed.clone().text()).toBe(200);

    const created = await createProject(personalMember(), {
      designSystemId: PERSONAL_DESIGN_SYSTEM_ID,
      designSystemCatalogScope: {
        workspaceId: PERSONAL_WORKSPACE,
        workspaceMemberId: PERSONAL_MEMBER,
        workspaceType: 'personal',
      },
    });
    expect(created.response.status, await created.response.clone().text()).toBe(200);

    // The persisted partition carries the type the directory CONFIRMED —
    // what run-time prompt loading reads back as its witness.
    const sqlite = openSqlite();
    try {
      const project = getProject(sqlite as never, created.id) as {
        metadata?: { localCatalogScopes?: { designSystem?: { workspaceType?: string } } };
      } | undefined;
      expect(project?.metadata?.localCatalogScopes?.designSystem?.workspaceType).toBe('personal');
    } finally {
      sqlite.close();
    }
  });

  it('does not persist a selection partition type the directory contradicts', async () => {
    // The Personal member selects an ATTRIBUTED-free system of their own but
    // the composer draft (mis)labels the partition as team: validation still
    // needs a verified personal workspace, so the legacy system is refused —
    // and nothing is persisted that a later run could mistake for a witness.
    const created = await createProject(personalMember(), {
      designSystemId: PERSONAL_DESIGN_SYSTEM_ID,
      designSystemCatalogScope: {
        workspaceId: PERSONAL_WORKSPACE,
        workspaceMemberId: PERSONAL_MEMBER,
        workspaceType: 'team',
      },
    });

    expect(created.response.status).toBe(400);
    expect(await created.response.text()).toContain('DESIGN_SYSTEM_NOT_FOUND');
  });
});
