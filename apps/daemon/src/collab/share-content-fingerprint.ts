import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ShareContentFreshness } from '@open-design/contracts';
import type { PublicFilePublicationScope, PublicFilePublicationRevision, PublicFilePublicationStore } from './public-file-publication-store.js';

type PayloadFile = { file: string; data: string | Uint8Array };
const PREFIX = 'share-payload-v1:';

/** Hash exactly the complete staged payload, not source mtimes or alias identity.
 * Sorting removes traversal-order differences; length framing includes names and bytes.
 */
export function fingerprintSharePayload(files: readonly PayloadFile[] | null): string | null {
  if (!files?.length) return null;
  const names = new Set<string>();
  const hash = createHash('sha256').update(PREFIX);
  for (const item of [...files].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0)) {
    if (!item.file || item.file.startsWith('/') || item.file.includes('\\')
      || item.file.split('/').some(part => !part || part === '.' || part === '..') || names.has(item.file)
      || !(typeof item.data === 'string' || item.data instanceof Uint8Array)) return null;
    names.add(item.file);
    const bytes = Buffer.from(item.data);
    hash.update(JSON.stringify([item.file, bytes.byteLength])).update('\0').update(bytes);
  }
  return PREFIX + hash.digest('hex');
}

/** Internal evidence only. Call remember AFTER confirmed publication using the
 * exact plan staged for that operation. No raw payload or credentials are stored.
 */
export interface ShareContentFingerprints {
  remember(scope: PublicFilePublicationScope, expected: PublicFilePublicationRevision, files: readonly PayloadFile[]): boolean;
  compare(scope: PublicFilePublicationScope, files: readonly PayloadFile[] | null): ShareContentFreshness;
}
export function createShareContentFingerprints(db: Database.Database, publications: Pick<PublicFilePublicationStore, 'getRevision'>): ShareContentFingerprints {
  db.exec(`CREATE TABLE IF NOT EXISTS share_content_fingerprints (
    resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL, project_id TEXT NOT NULL, file_path TEXT NOT NULL,
    slug TEXT NOT NULL, revision TEXT NOT NULL, fingerprint TEXT NOT NULL,
    PRIMARY KEY(resource_team_id,owner_member_id,project_id,file_path)
  )`);
  const values = (scope: PublicFilePublicationScope) => [scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath];
  const get = db.prepare(`SELECT slug, revision, fingerprint FROM share_content_fingerprints
    WHERE resource_team_id=? AND owner_member_id=? AND project_id=? AND file_path=?`);
  const put = db.prepare(`INSERT INTO share_content_fingerprints VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(resource_team_id,owner_member_id,project_id,file_path) DO UPDATE SET
    slug=excluded.slug,revision=excluded.revision,fingerprint=excluded.fingerprint`);
  return {
    remember: db.transaction((scope: PublicFilePublicationScope, expected: PublicFilePublicationRevision, files: readonly PayloadFile[]): boolean => {
      const fingerprint = fingerprintSharePayload(files);
      const witness = publications.getRevision(scope);
      if (!fingerprint || !expected.token.trim() || witness?.slug !== expected.slug || witness.token !== expected.token) return false;
      const old = get.get(...values(scope)) as { revision: string; fingerprint: string } | undefined;
      // An operation's acknowledged bytes cannot be relabelled after the fact.
      if (old?.revision === expected.token && old.fingerprint !== fingerprint) return false;
      put.run(...values(scope), expected.slug, expected.token, fingerprint);
      return true;
    }),
    compare(scope: PublicFilePublicationScope, files: readonly PayloadFile[] | null): ShareContentFreshness {
      try {
        const fingerprint = fingerprintSharePayload(files);
        const witness = publications.getRevision(scope);
        const stored = get.get(...values(scope)) as { slug: string; revision: string; fingerprint: string } | undefined;
        if (!fingerprint || !witness?.token || !stored || stored.slug !== witness.slug || stored.revision !== witness.token
          || !/^share-payload-v1:[a-f0-9]{64}$/.test(stored.fingerprint)) return 'unknown';
        return fingerprint === stored.fingerprint ? 'current' : 'outdated';
      } catch {
        // Unavailable comparison is not proof of change or proof of absence.
        return 'unknown';
      }
    },
  };
}
