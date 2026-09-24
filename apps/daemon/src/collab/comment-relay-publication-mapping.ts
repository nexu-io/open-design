import type Database from 'better-sqlite3';
import type { CommentRelayPublicationWitness } from './comment-relay-outbox.js';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';

/** Persist only the publisher's chosen pair; no renaming rules live here. */
export function migrateCommentRelayPublicationMappings(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS comment_relay_publication_mappings (
    resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL,
    project_id TEXT NOT NULL, file_path TEXT NOT NULL,
    slug TEXT NOT NULL, revision TEXT NOT NULL, public_file_path TEXT NOT NULL,
    PRIMARY KEY(resource_team_id, owner_member_id, project_id, file_path)
  )`);
}

export function recordCommentRelayPublicationMapping(
  db: Database.Database, scope: PublicFilePublicationScope, witness: CommentRelayPublicationWitness,
): void {
  if (!db.inTransaction) throw new Error('Publication mapping requires the publication transaction');
  db.prepare(`INSERT INTO comment_relay_publication_mappings
    (resource_team_id, owner_member_id, project_id, file_path, slug, revision, public_file_path)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(resource_team_id,owner_member_id,project_id,file_path)
    DO UPDATE SET slug=excluded.slug,revision=excluded.revision,public_file_path=excluded.public_file_path`)
    .run(scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath,
      witness.slug, witness.token, witness.publicFilePath);
}

export function currentCommentRelayPublicationMapping(
  db: Database.Database, scope: PublicFilePublicationScope,
): CommentRelayPublicationWitness | undefined {
  // Most projects have never been publicly published. Do not require the
  // publication store to exist for their legacy Team outbox to keep working.
  const mapping = db.prepare(`SELECT slug, revision AS token, public_file_path AS publicFilePath
    FROM comment_relay_publication_mappings WHERE resource_team_id=? AND owner_member_id=?
      AND project_id=? AND file_path=?`).get(scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath) as CommentRelayPublicationWitness | undefined;
  if (!mapping) return undefined;
  const active = db.prepare(`SELECT 1 FROM public_file_publications WHERE resource_team_id=?
    AND owner_member_id=? AND project_id=? AND file_path=? AND slug=? AND revision=?`)
    .get(scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath, mapping.slug, mapping.token);
  return active ? mapping : undefined;
}

/** Resolve a trusted alias-scoped cloud path, never a project-wide path guess.
 * Callers must obtain slug from the authenticated transport, not infer it from
 * the sole current publication. Two aliases can both package index.html, and
 * a stopped alias must never borrow another alias's surviving mapping.
 * This is location resolution, NOT authorization: normal relay checks still apply.
 */
export function sourcePathForCurrentPublication(
  db: Database.Database,
  input: { resourceTeamId: string; ownerMemberId: string; projectId: string; slug: string; publishedPath: string },
): string | null {
  const rows = db.prepare(`SELECT m.file_path AS filePath
    FROM comment_relay_publication_mappings m
    JOIN public_file_publications p ON p.resource_team_id=m.resource_team_id
      AND p.owner_member_id=m.owner_member_id AND p.project_id=m.project_id
      AND p.file_path=m.file_path AND p.slug=m.slug AND p.revision=m.revision
    WHERE m.resource_team_id=? AND m.owner_member_id=? AND m.project_id=?
      AND m.slug=? AND m.public_file_path=? LIMIT 2`)
    .all(input.resourceTeamId, input.ownerMemberId, input.projectId, input.slug, input.publishedPath) as Array<{ filePath: string }>;
  if (rows.length > 1) throw new Error('SHARE_COMMENT_MAPPING_AMBIGUOUS');
  return rows[0]?.filePath ?? null;
}
