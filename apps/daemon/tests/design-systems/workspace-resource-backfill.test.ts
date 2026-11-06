// One-time startup backfill (spec 9.2, section 9.2): every user design
// system claimed by a workspace BEFORE the `workspace_resources` envelope
// double-write shipped (its `metadata.json` carries a `workspaceId`, but the
// generic table has no matching row) must get one backfilled — see
// `backfillDesignSystemWorkspaceResources`'s own doc comment in
// design-systems/index.ts, and `server.ts`'s startup call site right after
// `reconcileImpossibleTeamShares`.
//
// Two invariants matter here, independent of `workspace-scope.test.ts`
// (which pins the READ-side filter and must stay untouched by this change):
//   1. correctness — the backfilled row lands with the right workspaceId and
//      the right visibility (personal vs team, from `metadata.teamSynced`).
//   2. idempotency — running the backfill twice (every daemon restart) must
//      not error and must not duplicate or clobber an existing row.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  backfillDesignSystemWorkspaceResources,
  listDesignSystems,
} from '../../src/design-systems/index.js';
import { workspaceTeamDesignSystemBindingResourceId } from '../../src/design-systems/workspace-team-binding.js';
import {
  closeDatabase,
  ensureWorkspaceProject,
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  listWorkspaceResources,
  openDatabase,
} from '../../src/db.js';

const WORKSPACE_A = 'vp44mftzknedrrqgy05oqpv9';
const WORKSPACE_B = 'jg63to8cbic0kzbczbu95a4g';

let root: string;
let dataDir: string;
let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'od-ds-backfill-root-'));
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-ds-backfill-db-'));
  db = openDatabase(dataDir, { dataDir });
});

afterEach(() => {
  closeDatabase();
  rmSync(root, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

/** Write a design system directly on disk with the given metadata, mirroring
 * `workspace-scope.test.ts`'s seeding helper (pre-double-write state). */
function seedSystem(dirId: string, metadata: Record<string, unknown>): void {
  const dir = path.join(root, dirId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'DESIGN.md'), `# ${dirId}\n\nA seeded system.\n`, 'utf8');
  writeFileSync(path.join(dir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

describe('backfillDesignSystemWorkspaceResources', () => {
  it('binds a pre-existing personal-claimed system that has no workspace_resources row yet', async () => {
    seedSystem('legacy-claimed', { title: 'Legacy Claimed', workspaceId: WORKSPACE_A });

    const backfilled = await backfillDesignSystemWorkspaceResources(db, root);

    expect(backfilled).toBe(1);
    const row = getWorkspaceResourceByResourceId(db, 'design_system', 'user:legacy-claimed');
    expect(row?.workspaceId).toBe(WORKSPACE_A);
    expect(row?.visibility).toBe('personal');
  });

  it('backfills a team-synced system as visibility: team', async () => {
    seedSystem('legacy-team', { title: 'Legacy Team', workspaceId: WORKSPACE_B, teamSynced: true });
    ensureWorkspaceResource(db, 'design_system', WORKSPACE_B, 'user:legacy-team', {
      visibility: 'team',
      resourceState: 'active',
    });

    const backfilled = await backfillDesignSystemWorkspaceResources(db, root);

    expect(backfilled).toBe(1);
    const row = getWorkspaceResourceByResourceId(
      db,
      'design_system',
      workspaceTeamDesignSystemBindingResourceId(WORKSPACE_B, 'user:legacy-team'),
    );
    expect(row?.workspaceId).toBe(WORKSPACE_B);
    expect(row?.visibility).toBe('team');
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:legacy-team'))
      .toMatchObject({ workspaceId: WORKSPACE_B, visibility: 'team' });
  });

  it('skips an unclaimed (no workspaceId) system', async () => {
    seedSystem('unclaimed', { title: 'Unclaimed' });

    const backfilled = await backfillDesignSystemWorkspaceResources(db, root);

    expect(backfilled).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:unclaimed')).toBeUndefined();
  });

  it('infers an ownerless system from its uniquely bound project without using ambient workspace state', async () => {
    seedSystem('project-backed', {
      title: 'Project Backed',
      projectId: 'project-a',
      futureMetadata: 'preserved',
    });
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-a', 'Project A', 1, 1);
    ensureWorkspaceProject(db, {
      workspaceId: WORKSPACE_A,
      projectId: 'project-a',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
      updatedByWorkspaceMemberId: 'member-a',
    });

    const backfilled = await backfillDesignSystemWorkspaceResources(db, root);

    expect(backfilled).toBe(1);
    const metadata = JSON.parse(
      readFileSync(path.join(root, 'project-backed', 'metadata.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(metadata.workspaceId).toBe(WORKSPACE_A);
    expect(metadata.futureMetadata).toBe('preserved');
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:project-backed')).toMatchObject({
      workspaceId: WORKSPACE_A,
      visibility: 'personal',
      createdByWorkspaceMemberId: 'member-a',
      updatedByWorkspaceMemberId: 'member-a',
    });
    expect((await listDesignSystems(root, { workspaceId: WORKSPACE_A })).map((item) => item.id))
      .toContain('project-backed');
    expect((await listDesignSystems(root, { workspaceId: WORKSPACE_B })).map((item) => item.id))
      .not.toContain('project-backed');
  });

  it('keeps project inference idempotent after metadata and envelope backfill', async () => {
    seedSystem('project-idempotent', { title: 'Project Idempotent', projectId: 'project-idempotent' });
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-idempotent', 'Project Idempotent', 1, 1);
    ensureWorkspaceProject(db, {
      workspaceId: WORKSPACE_B,
      projectId: 'project-idempotent',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-b',
    });

    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(1);
    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(0);
    expect(listWorkspaceResources(db, 'design_system', WORKSPACE_B)
      .filter((row) => row.resourceId === 'user:project-idempotent')).toHaveLength(1);
  });

  it('backfills the creator from a unique project binding even when metadata already names the Workspace', async () => {
    seedSystem('claimed-with-project', {
      title: 'Claimed With Project',
      workspaceId: WORKSPACE_A,
      projectId: 'project-claimed',
    });
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-claimed', 'Project Claimed', 1, 1);
    ensureWorkspaceProject(db, {
      workspaceId: WORKSPACE_A,
      projectId: 'project-claimed',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    });

    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(1);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:claimed-with-project'))
      .toMatchObject({
        workspaceId: WORKSPACE_A,
        visibility: 'personal',
        createdByWorkspaceMemberId: 'member-a',
      });
  });

  it('repairs a creatorless Personal envelope only from its unique matching project binding', async () => {
    seedSystem('creatorless-envelope', {
      title: 'Creatorless Envelope',
      workspaceId: WORKSPACE_A,
      projectId: 'project-creatorless',
    });
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-creatorless', 'Project Creatorless', 1, 1);
    ensureWorkspaceProject(db, {
      workspaceId: WORKSPACE_A,
      projectId: 'project-creatorless',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    });
    ensureWorkspaceResource(db, 'design_system', WORKSPACE_A, 'user:creatorless-envelope', {
      visibility: 'personal',
      resourceState: 'active',
    });

    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(1);
    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:creatorless-envelope'))
      .toMatchObject({
        workspaceId: WORKSPACE_A,
        createdByWorkspaceMemberId: 'member-a',
      });
  });

  it('preserves but does not bind an ownerless system whose project has no persisted workspace binding', async () => {
    seedSystem('unbound-project', { title: 'Unbound Project', projectId: 'project-unbound' });

    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:unbound-project')).toBeUndefined();
    expect(readFileSync(path.join(root, 'unbound-project', 'DESIGN.md'), 'utf8')).toContain('unbound-project');
    expect(JSON.parse(
      readFileSync(path.join(root, 'unbound-project', 'metadata.json'), 'utf8'),
    )).not.toHaveProperty('workspaceId');
  });

  it('does not guess when a legacy project has more than one persisted workspace binding', async () => {
    seedSystem('ambiguous-project', { title: 'Ambiguous Project', projectId: 'project-ambiguous' });
    db.exec(`
      DROP TABLE workspace_projects;
      CREATE TABLE workspace_projects (
        project_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_by_workspace_member_id TEXT
      );
      INSERT INTO workspace_projects VALUES
        ('project-ambiguous', '${WORKSPACE_A}', 'member-a'),
        ('project-ambiguous', '${WORKSPACE_B}', 'member-b');
    `);

    expect(await backfillDesignSystemWorkspaceResources(db, root)).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:ambiguous-project')).toBeUndefined();
    expect(JSON.parse(
      readFileSync(path.join(root, 'ambiguous-project', 'metadata.json'), 'utf8'),
    )).not.toHaveProperty('workspaceId');
  });

  it('never overwrites a row that already exists', async () => {
    seedSystem('already-bound', { title: 'Already Bound', workspaceId: WORKSPACE_A });
    // A binding already on file (e.g. the live double-write path already ran
    // for it) is authoritative; the backfill must treat it as done rather
    // than re-deriving anything from metadata.json.
    ensureWorkspaceResource(db, 'design_system', WORKSPACE_B, 'user:already-bound', {
      visibility: 'team',
    });

    const backfilled = await backfillDesignSystemWorkspaceResources(db, root);

    expect(backfilled).toBe(0);
    const row = getWorkspaceResourceByResourceId(db, 'design_system', 'user:already-bound');
    expect(row?.workspaceId).toBe(WORKSPACE_B);
    expect(row?.visibility).toBe('team');
  });

  it('is idempotent: running it twice does not duplicate rows or error', async () => {
    seedSystem('idempotent-check', { title: 'Idempotent', workspaceId: WORKSPACE_A });

    const first = await backfillDesignSystemWorkspaceResources(db, root);
    const second = await backfillDesignSystemWorkspaceResources(db, root);

    expect(first).toBe(1);
    expect(second).toBe(0);
    const rows = listWorkspaceResources(db, 'design_system', WORKSPACE_A);
    expect(rows.filter((r) => r.resourceId === 'user:idempotent-check')).toHaveLength(1);
  });

  it('backfills every claimed system in one pass, leaving unclaimed ones alone', async () => {
    seedSystem('from-a', { title: 'From A', workspaceId: WORKSPACE_A });
    seedSystem('from-b', { title: 'From B', workspaceId: WORKSPACE_B, teamSynced: true });
    seedSystem('legacy', { title: 'Legacy' });

    const backfilled = await backfillDesignSystemWorkspaceResources(db, root);

    expect(backfilled).toBe(2);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:from-a')?.visibility).toBe('personal');
    expect(getWorkspaceResourceByResourceId(
      db,
      'design_system',
      workspaceTeamDesignSystemBindingResourceId(WORKSPACE_B, 'user:from-b'),
    )?.visibility).toBe('team');
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:legacy')).toBeUndefined();
  });

  it('returns 0 without throwing when the root directory does not exist yet', async () => {
    const missingRoot = path.join(root, 'does-not-exist');
    await expect(backfillDesignSystemWorkspaceResources(db, missingRoot)).resolves.toBe(0);
  });
});
