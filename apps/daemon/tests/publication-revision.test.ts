import Database from 'better-sqlite3';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { describe, expect, it } from 'vitest';
import { createInMemoryPublicFilePublicationStore, createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';

const scope = { resourceTeamId: 'team', ownerMemberId: 'owner', projectId: 'project', filePath: 'index.html' };
const publication = { slug: 'same-slug', url: 'https://example.test/same-slug', fileName: 'index.html' };
for (const backend of ['memory', 'sqlite'] as const) {
  describe(`${backend} publication revision`, () => {
    it('keeps a newer same-slug publication even at an identical clock tick', () => {
      const db = new Database(':memory:');
      try {
        migratePublicFilePublications(db);
        migrateCommentRelayOutbox(db);
        const store = backend === 'memory' ? createInMemoryPublicFilePublicationStore() : createSqlitePublicFilePublicationStore(db, () => 1);
        store.set(scope, publication);
        const old = store.getRevision(scope)!;
        store.set(scope, publication);
        expect(store.getRevision(scope)).not.toEqual(old);
        expect(store.deleteIfRevisionMatches(scope, old)).toBe(false);
        expect(store.get(scope)).toEqual(publication);
        const current = store.getRevision(scope)!;
        expect(store.deleteIfRevisionMatches({ ...scope, ownerMemberId: 'other' }, current)).toBe(false);
        expect(store.deleteIfRevisionMatches(scope, current)).toBe(true);
        expect(store.deleteIfRevisionMatches(scope, current)).toBe(false);
        store.set(scope, publication);
        expect(store.deleteIfRevisionMatches(scope, current)).toBe(false);
      } finally { db.close(); }
    });
  });
}
it('migrates legacy rows without losing their identity and shares revisions across store instances', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE public_file_publications (resource_team_id TEXT, owner_member_id TEXT, project_id TEXT, file_path TEXT, url TEXT, slug TEXT, file_name TEXT, created_at INTEGER, updated_at INTEGER, PRIMARY KEY(resource_team_id,owner_member_id,project_id,file_path)); INSERT INTO public_file_publications VALUES ('team','owner','project','index.html','https://example.test/same-slug','same-slug','index.html',1,1);`);
    migratePublicFilePublications(db);
    migratePublicFilePublications(db);
    const first = createSqlitePublicFilePublicationStore(db, () => 1);
    const second = createSqlitePublicFilePublicationStore(db, () => 1);
    const old = first.getRevision(scope)!;
    expect(first.get(scope)).toEqual(publication);
    second.set(scope, publication);
    expect(first.deleteIfRevisionMatches(scope, old)).toBe(false);
    expect(first.getRevision(scope)).toEqual(second.getRevision(scope));
  } finally { db.close(); }
});
