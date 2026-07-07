import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

// Consumer-layer mapping between a LOCAL resource and its counterpart in the
// resource hub. This is consumer state, not part of the neutral E core: the
// daemon owns it, registered in db.ts's migrate() like the other domain
// migrations.

export type ShareRole = 'owner' | 'consumer';

export interface SharedResource {
  kind: string;
  localId: string;
  hubResourceId: string;
  hubTeamId: string;
  role: ShareRole;
  lastSyncedVersion: number | null;
  updatedAt: string;
}

interface SharedResourceRow {
  kind: string;
  local_id: string;
  hub_resource_id: string;
  hub_team_id: string;
  role: ShareRole;
  last_synced_version: number | null;
  updated_at: string;
}

interface TableInfoRow {
  name: string;
  pk: number;
}

export function migrateResourceSharing(db: SqliteDb): void {
  createSharedResourcesTable(db);
  migrateSharedResourcesPrimaryKey(db);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS shared_resources_hub_idx
      ON shared_resources (hub_team_id, hub_resource_id);
  `);
}

function createSharedResourcesTable(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_resources (
      kind TEXT NOT NULL,
      local_id TEXT NOT NULL,
      hub_resource_id TEXT NOT NULL,
      hub_team_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','consumer')),
      last_synced_version INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (hub_team_id, kind, local_id)
    );
  `);
}

function migrateSharedResourcesPrimaryKey(db: SqliteDb): void {
  const primaryKey = (
    db.prepare('PRAGMA table_info(shared_resources)').all() as TableInfoRow[]
  )
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  if (primaryKey.join('\0') === ['hub_team_id', 'kind', 'local_id'].join('\0')) {
    return;
  }

  db.transaction(() => {
    db.exec(`
      DROP INDEX IF EXISTS shared_resources_hub_idx;
      DROP TABLE IF EXISTS shared_resources_migration_old;
      ALTER TABLE shared_resources RENAME TO shared_resources_migration_old;
    `);
    createSharedResourcesTable(db);
    db.exec(`
      INSERT INTO shared_resources
        (kind, local_id, hub_resource_id, hub_team_id, role, last_synced_version, updated_at)
      SELECT kind, local_id, hub_resource_id, hub_team_id, role, last_synced_version, updated_at
      FROM shared_resources_migration_old;
      DROP TABLE shared_resources_migration_old;
    `);
  })();
}

function toShared(row: SharedResourceRow): SharedResource {
  return {
    kind: row.kind,
    localId: row.local_id,
    hubResourceId: row.hub_resource_id,
    hubTeamId: row.hub_team_id,
    role: row.role,
    lastSyncedVersion: row.last_synced_version,
    updatedAt: row.updated_at,
  };
}

export function getSharedByLocal(
  db: SqliteDb,
  hubTeamId: string,
  kind: string,
  localId: string,
): SharedResource | null {
  const row = db
    .prepare(
      'SELECT * FROM shared_resources WHERE hub_team_id = ? AND kind = ? AND local_id = ?',
    )
    .get(hubTeamId, kind, localId) as SharedResourceRow | undefined;
  return row ? toShared(row) : null;
}

export function getSharedByHub(
  db: SqliteDb,
  hubTeamId: string,
  hubResourceId: string,
): SharedResource | null {
  const row = db
    .prepare(
      'SELECT * FROM shared_resources WHERE hub_team_id = ? AND hub_resource_id = ?',
    )
    .get(hubTeamId, hubResourceId) as SharedResourceRow | undefined;
  return row ? toShared(row) : null;
}

export function listSharedForTeam(
  db: SqliteDb,
  hubTeamId: string,
): SharedResource[] {
  const rows = db
    .prepare('SELECT * FROM shared_resources WHERE hub_team_id = ?')
    .all(hubTeamId) as SharedResourceRow[];
  return rows.map(toShared);
}

export function upsertShared(db: SqliteDb, entry: SharedResource): void {
  db.prepare(
    `INSERT INTO shared_resources
       (kind, local_id, hub_resource_id, hub_team_id, role, last_synced_version, updated_at)
     VALUES (@kind, @localId, @hubResourceId, @hubTeamId, @role, @lastSyncedVersion, @updatedAt)
     ON CONFLICT (hub_team_id, kind, local_id) DO UPDATE SET
       hub_resource_id = excluded.hub_resource_id,
       role = excluded.role,
       last_synced_version = excluded.last_synced_version,
       updated_at = excluded.updated_at`,
  ).run(entry);
}
