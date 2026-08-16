import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { teamResourceWorkspaceRoot } from '../../src/collab/team-resource-materialization.js';
import {
  closeDatabase,
  deleteWorkspaceResource,
  ensureWorkspaceProject,
  ensureWorkspaceResource,
  insertProject,
  openDatabase,
  updateWorkspaceResource,
} from '../../src/db.js';
import {
  pinRunDesignSystemScope,
  resolvePinnedRunDesignSystemScope,
} from '../../src/design-systems/run-scope.js';
import { workspaceTeamDesignSystemBindingResourceId } from '../../src/design-systems/workspace-team-binding.js';
import { pinRunWorkspaceScopeForProject } from '../../src/runtimes/project-amr-trace-env.js';

const workspaceId = 'workspace-a';
const memberId = 'member-a';
const projectId = 'project-a';
const designSystemId = 'user:same-id';

let root: string | null = null;

afterEach(() => {
  closeDatabase();
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

function setup() {
  root = mkdtempSync(path.join(os.tmpdir(), 'od-ds-run-scope-'));
  const db = openDatabase(root, { dataDir: path.join(root, 'data') });
  const now = Date.now();
  insertProject(db, { id: projectId, name: projectId, createdAt: now, updatedAt: now });
  ensureWorkspaceProject(db, {
    projectId,
    workspaceId,
    visibility: 'team',
    resourceState: 'active',
    createdByWorkspaceMemberId: memberId,
    updatedByWorkspaceMemberId: memberId,
  });
  const workspaceScope = pinRunWorkspaceScopeForProject(db, projectId);
  expect(workspaceScope).toMatchObject({ workspaceId, workspaceMemberId: memberId });
  return {
    db,
    workspaceScope: workspaceScope!,
    userRoot: path.join(root, 'design-systems'),
  };
}

describe('pinned design-system run scope', () => {
  it('does not fall through from a hard-deleted Team binding to a same-id Personal binding', () => {
    const { db, workspaceScope, userRoot } = setup();
    const teamBindingId = workspaceTeamDesignSystemBindingResourceId(workspaceId, designSystemId);
    ensureWorkspaceResource(db, 'design_system', workspaceId, designSystemId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    ensureWorkspaceResource(db, 'design_system', workspaceId, teamBindingId, {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    const scope = pinRunDesignSystemScope({
      db,
      projectId,
      designSystemId,
      workspaceScope,
    });
    expect(scope).toMatchObject({
      kind: 'workspace-resource',
      bindingResourceId: teamBindingId,
      visibility: 'team',
    });

    deleteWorkspaceResource(db, 'design_system', workspaceId, teamBindingId);

    expect(resolvePinnedRunDesignSystemScope({
      db,
      scope,
      designSystemId,
      userRoot,
    })).toMatchObject({ ok: false, code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE' });
  });

  it('keeps a Personal-started run on Personal when a same-id Team binding appears later', () => {
    const { db, workspaceScope, userRoot } = setup();
    ensureWorkspaceResource(db, 'design_system', workspaceId, designSystemId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    const scope = pinRunDesignSystemScope({
      db,
      projectId,
      designSystemId,
      workspaceScope,
    });
    expect(scope).toMatchObject({
      kind: 'workspace-resource',
      bindingResourceId: designSystemId,
      visibility: 'personal',
    });

    ensureWorkspaceResource(
      db,
      'design_system',
      workspaceId,
      workspaceTeamDesignSystemBindingResourceId(workspaceId, designSystemId),
      {
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: memberId,
      },
    );

    expect(resolvePinnedRunDesignSystemScope({
      db,
      scope,
      designSystemId,
      userRoot,
    })).toMatchObject({ ok: true, root: userRoot, visibility: 'personal' });
  });

  it('fails closed when the exact captured binding changes after the run starts', () => {
    const { db, workspaceScope, userRoot } = setup();
    ensureWorkspaceResource(db, 'design_system', workspaceId, designSystemId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
      version: 3,
      updatedAt: 100,
    });
    const scope = pinRunDesignSystemScope({
      db,
      projectId,
      designSystemId,
      workspaceScope,
    });

    updateWorkspaceResource(db, 'design_system', workspaceId, designSystemId, {
      visibility: 'team',
      version: 4,
      updatedAt: 200,
    });

    expect(resolvePinnedRunDesignSystemScope({
      db,
      scope,
      designSystemId,
      userRoot,
    })).toMatchObject({ ok: false, code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE' });
  });

  it('resolves a captured Team binding only from the Team materialization root', () => {
    const { db, workspaceScope, userRoot } = setup();
    const teamBindingId = workspaceTeamDesignSystemBindingResourceId(workspaceId, designSystemId);
    ensureWorkspaceResource(db, 'design_system', workspaceId, teamBindingId, {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    const scope = pinRunDesignSystemScope({
      db,
      projectId,
      designSystemId,
      workspaceScope,
    });

    expect(resolvePinnedRunDesignSystemScope({
      db,
      scope,
      designSystemId,
      userRoot,
    })).toMatchObject({
      ok: true,
      root: teamResourceWorkspaceRoot(userRoot, workspaceId),
      visibility: 'team',
    });
  });
});
