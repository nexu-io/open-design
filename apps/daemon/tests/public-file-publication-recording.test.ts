import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createShareFileMapping } from '../src/collab/share-file-mapping.js';
const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'pages/local.html' };
const publication = { slug: 'stable', url: 'https://example.test/stable', fileName: scope.filePath };
const mapping = createShareFileMapping([{ sourcePath: scope.filePath, file: 'index.html' }]);
it.each([false, true])('commits or rolls back publication and intent together: queue failure=%s', fail => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db); db.exec('CREATE TABLE test_intents (revision TEXT NOT NULL)');
    const store = createSqlitePublicFilePublicationStore(db); store.set(scope, { ...publication, slug: 'previous' });
    const previous = store.getRevision(scope);
    const record = createPublicFilePublicationRecorder(db, store, (connection, input) => {
      expect(connection).toBe(db); expect(db.inTransaction).toBe(true);
      expect(input.scope).toEqual(scope); expect(input.publicFilePath).toBe('index.html');
      expect(store.getRevision(scope)).toEqual(input.publicationRevision);
      db.prepare('INSERT INTO test_intents VALUES (?)').run(input.publicationRevision.token);
      if (fail) throw new Error('queue unavailable');
      return { enqueued: 1, skippedInbound: 0 };
    });
    if (fail) {
      expect(() => record(scope, publication, mapping)).toThrow('queue unavailable');
      expect(store.getRevision(scope)).toEqual(previous);
      expect(db.prepare('SELECT * FROM test_intents').all()).toEqual([]);
    } else {
      const current = record(scope, publication, mapping);
      expect(current.slug).toBe('stable'); expect(current.token).not.toBe(previous?.token);
      expect(db.prepare('SELECT * FROM test_intents').all()).toEqual([{ revision: current.token }]);
    }
    expect(db.inTransaction).toBe(false);
  } finally { db.close(); }
});
it('refuses unknown file mapping before creating publication or calling enqueue', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db); const store = createSqlitePublicFilePublicationStore(db);
    let calls = 0;
    const record = createPublicFilePublicationRecorder(db, store, () => { calls++; return { enqueued: 0, skippedInbound: 0 }; });
    expect(() => record(scope, publication, [])).toThrow('SHARE_ENTRY_MAPPING_UNAVAILABLE');
    expect(store.get(scope)).toBeNull(); expect(calls).toBe(0);
  } finally { db.close(); }
});
