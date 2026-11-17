import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, ensureWorkspaceProject, getProject, getWorkspaceProjectByProjectId, insertProject, openDatabase, updateProject } from '../../src/db.js';
import { createLocalPublicShareOwnership } from '../../src/collab/local-public-share-ownership.js';
import { createSqlitePublicFilePublicationStore } from '../../src/collab/public-file-publication-store.js';

function personalOwner(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'personal', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    ...overrides,
  };
}

describe('legacy local public-share ownership', () => {
  let root: string;
  let db: ReturnType<typeof openDatabase>;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'od-legacy-share-owner-'));
    db = openDatabase(root, { dataDir: root });
    insertProject(db, { id: 'p', name: 'Historical project', metadata: { custom: 'keep' }, createdAt: 100, updatedAt: 200 });
  });
  afterEach(async () => {
    closeDatabase();
    await rm(root, { recursive: true, force: true });
  });
  function bind(patch: Record<string, unknown> = {}) {
    return ensureWorkspaceProject(db, {
      projectId: 'p', workspaceId: 'personal', visibility: 'personal', resourceState: 'active',
      createdByWorkspaceMemberId: null, updatedByWorkspaceMemberId: null,
      syncState: 'local_only', createdAt: 100, updatedAt: 200, ...patch,
    });
  }

  it.each([false, true])('adopts a verified Personal owner once, preserving project data and surviving restart; pre-bound=%s', preBound => {
    if (preBound) bind();
    const project = getProject(db, 'p');
    const ownership = createLocalPublicShareOwnership(db);
    expect(ownership.resolveLocalPublicShareOwner('p', 'personal')).toBeNull();
    // A read never creates or fills a binding.
    expect(getWorkspaceProjectByProjectId(db, 'p')?.createdByWorkspaceMemberId ?? null).toBeNull();
    expect(ownership.adoptLegacyPublicShareProject('p', personalOwner())).toBe('owner');
    const adopted = getWorkspaceProjectByProjectId(db, 'p');
    expect(adopted).toMatchObject({
      workspaceId: 'personal', visibility: 'personal', resourceState: 'active',
      createdByWorkspaceMemberId: 'owner', updatedByWorkspaceMemberId: 'owner',
      syncState: 'local_only', createdAt: 100, updatedAt: 200, version: 1,
    });
    expect(getProject(db, 'p')).toEqual(project);
    closeDatabase();
    db = openDatabase(root, { dataDir: root });
    const restarted = createLocalPublicShareOwnership(db);
    expect(restarted.resolveLocalPublicShareOwner('p', 'personal')).toBe('owner');
    // Once attributed, neither repeated adoption nor another account may rewrite it.
    expect(restarted.adoptLegacyPublicShareProject('p', personalOwner())).toBeNull();
    expect(restarted.adoptLegacyPublicShareProject('p', personalOwner({ workspaceMemberId: 'other' }))).toBeNull();
    expect(restarted.resolveLocalPublicShareOwner('p', 'elsewhere')).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(adopted);
    expect(getProject(db, 'p')).toEqual(project);
  });

  it.each([
    { role: 'member' }, { role: 'admin' }, { workspaceType: 'team' },
    { workspaceId: 'another-workspace' }, { memberStatus: 'removed' },
    { lifecycleState: 'locked' }, { lifecycleState: 'deleted' },
    { workspaceMemberId: '' }, { workspaceId: '' },
  ] satisfies Partial<WorkspaceCollabContext>[])('does not adopt using an unauthorized context: %j', patch => {
    const before = bind();
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', personalOwner(patch))).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(before);
  });

  it('does not adopt when sharing permission is denied', () => {
    const before = bind();
    const context = personalOwner();
    context.permissions.canShareProjects = false;
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', context)).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(before);
  });

  it('preserves an existing public link and its revision when adopting the historical row', () => {
    bind();
    const publications = createSqlitePublicFilePublicationStore(db);
    const scope = { projectId: 'p', filePath: 'index.html', resourceTeamId: 'personal', ownerMemberId: 'owner' };
    publications.set(scope, { slug: 'existing-link', fileName: 'index.html', url: 'https://viewer.example.test/original-link' });
    const revision = publications.getRevision(scope);
    const publication = publications.get(scope);
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', personalOwner())).toBe('owner');
    expect(publications.getRevision(scope)).toEqual(revision);
    expect(publications.get(scope)).toEqual(publication);
  });

  it.each([
    { visibility: 'team' }, { resourceState: 'frozen' }, { resourceState: 'deleted' },
    { workspaceId: 'another-workspace' }, { createdByWorkspaceMemberId: 'other' },
    { resourceHubResourceId: 'remote-root' }, { cloudTombstonedAt: 123 },
    { syncState: 'synced' }, { syncState: 'pending' },
  ])('preserves existing identity and cloud state: %j', patch => {
    const before = bind(patch);
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', personalOwner())).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(before);
  });

  it('does not claim a transferred project whose creator was lost', () => {
    bind();
    db.prepare('UPDATE workspace_projects SET transferred_from_workspace_member_id = ? WHERE project_id = ?').run('removed-member', 'p');
    const before = getWorkspaceProjectByProjectId(db, 'p');
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', personalOwner())).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(before);
  });

  it.each([{ sharedProjectPlaceholderAt: 123 }, { teamMirrorRevokedAt: 123 }])('refuses cloud content provenance even with no binding: %j', metadata => {
    updateProject(db, 'p', { metadata });
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', personalOwner())).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toBeUndefined();
  });

  it('refuses a materialized Team mirror even if an older client removed its binding', () => {
    db.prepare(`INSERT INTO team_project_materializations
      (workspace_id, resource_team_id, viewer_member_id, owner_member_id, project_id, resource_id,
       ref, version, version_id, manifest_digest, lifecycle_state, authorized_at, expires_at, updated_at)
      VALUES ('team', 'team', 'reader', 'author', 'p', 'root', 'published', 1, 'v1', 'digest', 'active', 'now', 'later', 1)`).run();
    expect(createLocalPublicShareOwnership(db).adoptLegacyPublicShareProject('p', personalOwner())).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toBeUndefined();
  });

  it('refuses a receiving or revoked local project and a nonexistent project', () => {
    const before = bind();
    const ownership = createLocalPublicShareOwnership(db, () => true);
    expect(ownership.adoptLegacyPublicShareProject('p', personalOwner())).toBeNull();
    expect(ownership.adoptLegacyPublicShareProject('missing', personalOwner())).toBeNull();
    expect(getWorkspaceProjectByProjectId(db, 'p')).toEqual(before);
  });
});
