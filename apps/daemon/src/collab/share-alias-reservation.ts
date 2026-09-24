import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';

export interface ShareAliasReservation { slug: string; sourceKey: string }

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
  const select = db.prepare(`SELECT slug, source_key AS sourceKey FROM share_alias_reservations
    WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ?`);
  const insert = db.prepare(`INSERT INTO share_alias_reservations
    (resource_team_id, owner_member_id, project_id, file_path, slug, source_key) VALUES(?,?,?,?,?,?)`);
  const reserve = db.transaction((scope: PublicFilePublicationScope): ShareAliasReservation => {
    const identity = [scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath];
    if (identity.some(value => typeof value !== 'string' || !value.trim())) throw new Error('SHARE_ALIAS_IDENTITY_REQUIRED');
    const existing = select.get(...identity) as ShareAliasReservation | undefined;
    if (existing) return { slug: existing.slug, sourceKey: existing.sourceKey };
    const slug = generateId();
    const sourceKey = generateId();
    if (![slug, sourceKey].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value))) {
      throw new Error('SHARE_ALIAS_ID_UNAVAILABLE');
    }
    insert.run(...identity, slug, sourceKey);
    return { slug, sourceKey };
  });
  // Acquire the write reservation before reading so independent connections
  // cannot both observe absence and return different aliases for one file.
  return { reserve: (scope: PublicFilePublicationScope) => reserve.immediate(scope) };
}
