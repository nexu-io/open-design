import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createShareFileMapping } from '../src/collab/share-file-mapping.js';
const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'pages/local.html', sourceFileId: 'source-1' };
const publication = { slug: 'stable', url: 'https://example.test/stable', fileName: scope.filePath };
const mapping = createShareFileMapping([{ sourcePath: scope.filePath, file: 'index.html' }]);
it('records first and updated publication facts without comment tables or a comment dependency', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const record = createPublicFilePublicationRecorder(db, store);
    const first = record(scope, publication, mapping);
    expect(store.listFacts(scope)).toEqual([{ scope, publicationRevision: first, publicFilePath: 'index.html', reopened: false }]);
    const updated = record(scope, publication, mapping, true);
    expect(updated.token).not.toBe(first.token);
    expect(store.listFacts(scope)).toEqual([{ scope, publicationRevision: updated, publicFilePath: 'index.html', reopened: true }]);
    expect(db.inTransaction).toBe(false);
  } finally { db.close(); }
});
it('rolls back publication facts if its own witness cannot be confirmed', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    store.set(scope, { ...publication, slug: 'previous' }, { publicFilePath: 'before.html', reopened: false });
    const previous = store.listFacts(scope);
    const record = createPublicFilePublicationRecorder(db, { ...store, getRevision: () => null });
    expect(() => record(scope, publication, mapping)).toThrow('PUBLICATION_WITNESS_UNAVAILABLE');
    expect(store.listFacts(scope)).toEqual(previous);
  } finally { db.close(); }
});
it('refuses unknown file mapping before creating publication', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const record = createPublicFilePublicationRecorder(db, store);
    expect(() => record(scope, publication, [])).toThrow('SHARE_ENTRY_MAPPING_UNAVAILABLE');
    expect(store.get(scope)).toBeNull();
    expect(store.listFacts(scope)).toEqual([]);
  } finally { db.close(); }
});
