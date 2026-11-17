import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { commentFileSourceKey } from './comment-file-facts.js';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';

export interface ShareAliasReservation { slug: string; sourceKey: string }
interface CloudFileAlias { sourceFilePath: string; sourceFileId?: string; slug: string }

export class ShareAliasIdentityMismatchError extends Error {
  constructor() { super('SHARE_ALIAS_IDENTITY_MISMATCH'); }
}

/** Reserve before remote publication. Failed uploads and lost responses must
 * reuse the same alias and idempotency identity after restart. This is not a
 * publication record: reservation alone never means the content is public.
 * Legacy snapshot identifiers must not be reinterpreted as stable aliases.
 */
export function createShareAliasReservations(db: Database.Database, generateId: () => string = randomUUID) {
  db.exec(`CREATE TABLE IF NOT EXISTS share_alias_reservations (
    resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL,
    project_id TEXT NOT NULL, file_path TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE, source_key TEXT NOT NULL UNIQUE,
    PRIMARY KEY(resource_team_id, owner_member_id, project_id, file_path)
  )`);
  const columns = db.prepare('PRAGMA table_info(share_alias_reservations)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'source_file_id')) {
    db.transaction(() => db.exec(`
      ALTER TABLE share_alias_reservations RENAME TO share_alias_reservations_path;
      CREATE TABLE share_alias_reservations (
        resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL,
        project_id TEXT NOT NULL, file_path TEXT NOT NULL, source_file_id TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE, source_key TEXT NOT NULL UNIQUE,
        PRIMARY KEY(resource_team_id, owner_member_id, project_id, file_path, source_file_id)
      );
      INSERT INTO share_alias_reservations SELECT resource_team_id, owner_member_id, project_id,
        file_path, '', slug, source_key FROM share_alias_reservations_path;
      DROP TABLE share_alias_reservations_path;
    `))();
  }
  const select = db.prepare(`SELECT slug, source_key AS sourceKey FROM share_alias_reservations
    WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ? AND source_file_id = ?`);
  const insert = db.prepare(`INSERT INTO share_alias_reservations
    (resource_team_id, owner_member_id, project_id, file_path, source_file_id, slug, source_key) VALUES(?,?,?,?,?,?,?)`);
  function key(scope: PublicFilePublicationScope): [string, string, string, string, string] {
    const identity = [scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath];
    if (identity.some(value => typeof value !== 'string' || !value.trim())) throw new Error('SHARE_ALIAS_IDENTITY_REQUIRED');
    if (!scope.sourceFileId) throw new Error('COMMENT_FILE_SOURCE_REQUIRED');
    return [scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath, scope.sourceFileId];
  }
  const reserve = db.transaction((scope: PublicFilePublicationScope): ShareAliasReservation => {
    const [team, owner, project, filePath, sourceFileId] = key(scope);
    const identity = [team, owner, project, filePath];
    const existing = select.get(...identity, sourceFileId) as ShareAliasReservation | undefined;
    if (existing) return { slug: existing.slug, sourceKey: existing.sourceKey };
    const slug = generateId();
    const sourceKey = commentFileSourceKey(scope.projectId, sourceFileId);
    if (![slug].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value))) {
      throw new Error('SHARE_ALIAS_ID_UNAVAILABLE');
    }
    insert.run(...identity, sourceFileId, slug, sourceKey);
    return { slug, sourceKey };
  });
  /** Caller must validate owner-scoped cloud history and conflicting local
   * publication/binding witnesses before restoring this exact active lifetime. */
  const restore = db.transaction((scope: PublicFilePublicationScope, cloud: CloudFileAlias): ShareAliasReservation => {
    const identity = key(scope);
    if (cloud.sourceFileId !== scope.sourceFileId || cloud.sourceFilePath !== scope.filePath
      || !/^[A-Za-z0-9_-]{16,128}$/.test(cloud.slug)) throw new ShareAliasIdentityMismatchError();
    const sourceKey = commentFileSourceKey(scope.projectId, identity[4]);
    const existing = select.get(...identity) as ShareAliasReservation | undefined;
    if (existing && existing.sourceKey !== sourceKey) throw new ShareAliasIdentityMismatchError();
    const occupied = db.prepare('SELECT 1 FROM share_alias_reservations WHERE slug = ?').get(cloud.slug);
    if (occupied && (!existing || existing.slug !== cloud.slug)) throw new ShareAliasIdentityMismatchError();
    if (existing?.slug === cloud.slug) return { slug: cloud.slug, sourceKey };
    if (existing) {
      db.prepare(`UPDATE share_alias_reservations SET slug = ? WHERE resource_team_id = ?
        AND owner_member_id = ? AND project_id = ? AND file_path = ? AND source_file_id = ?`)
        .run(cloud.slug, ...identity);
    } else insert.run(...identity, cloud.slug, sourceKey);
    return { slug: cloud.slug, sourceKey };
  });
  // Acquire the write reservation before reading so independent connections
  // cannot both observe absence and return different aliases for one file.
  return {
    get: (scope: PublicFilePublicationScope): ShareAliasReservation | null =>
      select.get(...key(scope)) as ShareAliasReservation | undefined ?? null,
    reserve: (scope: PublicFilePublicationScope) => reserve.immediate(scope),
    restore: (scope: PublicFilePublicationScope, cloud: CloudFileAlias) => restore.immediate(scope, cloud),
  };
}
