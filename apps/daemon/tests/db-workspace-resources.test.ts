import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  deleteWorkspaceResource,
  deleteWorkspaceResourceByResourceId,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  listTeamWorkspaceResourceWorkspaceIds,
  listWorkspaceResources,
  openDatabase,
  updateWorkspaceResource,
} from '../src/db.js';

describe('workspace_resources persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-workspace-resources-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seed() {
    return openDatabase(tempDir, { dataDir: tempDir });
  }

  it('returns undefined for a resource that was never bound', () => {
    const db = seed();
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-a')).toBeUndefined();
    expect(getWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a')).toBeUndefined();
    expect(listWorkspaceResources(db, 'plugin', 'ws-1')).toEqual([]);
  });

  it('binds a resource and round-trips every envelope field', () => {
    const db = seed();
    const now = Date.now();
    const bound = ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
      updatedByWorkspaceMemberId: 'member-a',
      resourceHubResourceId: 'hub-123',
      syncState: 'local_only',
      version: 3,
      createdAt: now,
      updatedAt: now,
    });
    expect(bound).toMatchObject({
      resourceType: 'plugin',
      resourceId: 'plugin-a',
      workspaceId: 'ws-1',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
      updatedByWorkspaceMemberId: 'member-a',
      resourceHubResourceId: 'hub-123',
      syncState: 'local_only',
      version: 3,
    });

    const read = getWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a');
    expect(read).toMatchObject({ resourceId: 'plugin-a', workspaceId: 'ws-1' });

    const readByResourceId = getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-a');
    expect(readByResourceId).toMatchObject({ resourceId: 'plugin-a', workspaceId: 'ws-1' });
  });

  // Mirrors `ensureWorkspaceProject`'s idempotency contract (db.ts doc
  // comment above it): a resource already bound is returned as-is rather
  // than bound a second time — the `(resource_type, resource_id)` primary
  // key physically enforces this, so a naive second INSERT would throw
  // instead of silently duplicating.
  it('is idempotent across repeated ensure calls, even naming a different workspace', () => {
    const db = seed();
    const first = ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', {
      createdByWorkspaceMemberId: 'member-a',
    });
    const second = ensureWorkspaceResource(db, 'plugin', 'ws-2', 'plugin-a', {
      createdByWorkspaceMemberId: 'member-b',
    });
    expect(first?.workspaceId).toBe('ws-1');
    expect(second?.workspaceId).toBe('ws-1');
    expect(listWorkspaceResources(db, 'plugin', 'ws-1')).toHaveLength(1);
    expect(listWorkspaceResources(db, 'plugin', 'ws-2')).toHaveLength(0);
  });

  it('keeps two resource types with the same resource id independent', () => {
    const db = seed();
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'shared-id', { visibility: 'personal' });
    ensureWorkspaceResource(db, 'skill', 'ws-2', 'shared-id', { visibility: 'team' });
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'shared-id')).toMatchObject({ workspaceId: 'ws-1' });
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'shared-id')).toMatchObject({ workspaceId: 'ws-2' });
  });

  it('updates the mutable fields without disturbing the binding key', () => {
    const db = seed();
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', {
      visibility: 'personal',
      createdByWorkspaceMemberId: 'member-a',
    });
    const updated = updateWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', {
      visibility: 'team',
      resourceState: 'frozen',
      updatedByWorkspaceMemberId: 'member-owner',
    });
    expect(updated).toMatchObject({
      visibility: 'team',
      resourceState: 'frozen',
      updatedByWorkspaceMemberId: 'member-owner',
      createdByWorkspaceMemberId: 'member-a',
    });
  });

  it('returns null updating a resource that has no binding row', () => {
    const db = seed();
    expect(updateWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-missing', { visibility: 'team' })).toBeNull();
  });

  it('lists only the resources bound to the requested workspace, most recently updated first', () => {
    const db = seed();
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', { updatedAt: 1_000 });
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-b', { updatedAt: 2_000 });
    ensureWorkspaceResource(db, 'plugin', 'ws-2', 'plugin-c', { updatedAt: 3_000 });
    const rows = listWorkspaceResources(db, 'plugin', 'ws-1');
    expect(rows.map((r) => r.resourceId)).toEqual(['plugin-b', 'plugin-a']);
  });

  it('lists each persisted live Team resource Workspace once for background reconciliation', () => {
    const db = seed();
    ensureWorkspaceResource(db, 'plugin', 'ws-b', 'plugin-a', {
      visibility: 'team',
      resourceState: 'active',
    });
    ensureWorkspaceResource(db, 'skill', 'ws-a', 'skill-a', {
      visibility: 'team',
      resourceState: 'active',
    });
    ensureWorkspaceResource(db, 'design_system', 'ws-a', 'system-a', {
      visibility: 'team',
      resourceState: 'deleted',
    });
    ensureWorkspaceResource(db, 'plugin', 'ws-personal', 'plugin-personal', {
      visibility: 'personal',
      resourceState: 'active',
    });

    expect(listTeamWorkspaceResourceWorkspaceIds(db)).toEqual(['ws-a', 'ws-b']);
  });

  it('deletes a binding scoped to the workspace it names', () => {
    const db = seed();
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', {});
    deleteWorkspaceResource(db, 'plugin', 'ws-other', 'plugin-a');
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-a')).toBeDefined();
    deleteWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a');
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-a')).toBeUndefined();
  });

  // Uninstall must call this regardless of which workspace the binding
  // actually lives in — see installer.ts's uninstallPlugin, which has no
  // caller-supplied workspaceId to scope a two-key delete with.
  it('deletes a binding by resource id alone, regardless of its bound workspace', () => {
    const db = seed();
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-a', {});
    deleteWorkspaceResourceByResourceId(db, 'plugin', 'plugin-a');
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-a')).toBeUndefined();
  });
});
