import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type SharedResource,
  getSharedByHub,
  getSharedByLocal,
  listSharedForTeam,
  migrateResourceSharing,
  upsertShared,
} from '../src/resource-sharing/store.js';

function owner(overrides: Partial<SharedResource> = {}): SharedResource {
  return {
    kind: 'design_system',
    localId: 'demo-ds',
    hubResourceId: 'res_1',
    hubTeamId: 'team_1',
    role: 'owner',
    lastSyncedVersion: 1,
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('resource-sharing store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrateResourceSharing(db);
  });

  it('upserts and reads a mapping by local id and by hub id', () => {
    upsertShared(db, owner());
    expect(getSharedByLocal(db, 'team_1', 'design_system', 'demo-ds')?.hubResourceId).toBe(
      'res_1',
    );
    expect(getSharedByHub(db, 'team_1', 'res_1')?.role).toBe('owner');
    expect(getSharedByLocal(db, 'team_1', 'design_system', 'missing')).toBeNull();
  });

  it('is idempotent on the same (hub_team_id, kind, local_id) — updates in place', () => {
    upsertShared(db, owner({ lastSyncedVersion: 1 }));
    upsertShared(db, owner({ lastSyncedVersion: 3 }));
    expect(
      getSharedByLocal(db, 'team_1', 'design_system', 'demo-ds')?.lastSyncedVersion,
    ).toBe(3);
    expect(listSharedForTeam(db, 'team_1')).toHaveLength(1);
  });

  it('keeps same local ids isolated across teams', () => {
    upsertShared(db, owner({ hubTeamId: 'team_1', hubResourceId: 'res_1' }));
    upsertShared(db, owner({ hubTeamId: 'team_2', hubResourceId: 'res_2' }));

    expect(getSharedByLocal(db, 'team_1', 'design_system', 'demo-ds')?.hubResourceId).toBe(
      'res_1',
    );
    expect(getSharedByLocal(db, 'team_2', 'design_system', 'demo-ds')?.hubResourceId).toBe(
      'res_2',
    );
  });

  it('migrates the pre-team-scoped primary key before upserting', () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE shared_resources (
        kind TEXT NOT NULL,
        local_id TEXT NOT NULL,
        hub_resource_id TEXT NOT NULL,
        hub_team_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner','consumer')),
        last_synced_version INTEGER,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, local_id)
      );
      INSERT INTO shared_resources
        (kind, local_id, hub_resource_id, hub_team_id, role, last_synced_version, updated_at)
      VALUES
        ('design_system', 'demo-ds', 'res_1', 'team_1', 'owner', 1, '2026-07-07T00:00:00.000Z');
    `);

    migrateResourceSharing(db);
    upsertShared(db, owner({ hubTeamId: 'team_2', hubResourceId: 'res_2' }));

    expect(getSharedByLocal(db, 'team_1', 'design_system', 'demo-ds')?.hubResourceId).toBe(
      'res_1',
    );
    expect(getSharedByLocal(db, 'team_2', 'design_system', 'demo-ds')?.hubResourceId).toBe(
      'res_2',
    );
  });

  it('lists mappings scoped to a team', () => {
    upsertShared(db, owner());
    upsertShared(db, owner({ localId: 'other', hubResourceId: 'res_2' }));
    upsertShared(db, owner({ localId: 'x', hubResourceId: 'res_3', hubTeamId: 'team_2' }));
    expect(listSharedForTeam(db, 'team_1')).toHaveLength(2);
    expect(listSharedForTeam(db, 'team_2')).toHaveLength(1);
  });

  it('enforces one local mapping per hub resource (unique index)', () => {
    upsertShared(db, owner());
    // A different local_id mapping the SAME hub resource violates the guard the
    // orchestrator relies on (it must not create a shadow row).
    expect(() =>
      upsertShared(db, owner({ localId: 'res_1', role: 'consumer' })),
    ).toThrow(/UNIQUE/i);
  });
});
