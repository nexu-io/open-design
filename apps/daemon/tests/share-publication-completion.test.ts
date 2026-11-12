import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import type { SharePublishResult } from '@open-design/contracts';
import { createSharePublicationCompletion } from '../src/collab/share-publication-completion.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createShareFileMapping } from '../src/collab/share-file-mapping.js';
const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'pages/local.html' };
const publication = { slug: 'stable', url: 'https://example.test/artifact/p/stable', fileName: scope.filePath };
const receipt = { filePath: scope.filePath, slug: 'stable', version: 2, versionId: 'immutable', publishedAt: 1234, entryPath: 'index.html' };
const mapping = createShareFileMapping([{ sourcePath: scope.filePath, file: 'index.html' }]);
it.each([
  { ...receipt, version: 0 }, { ...receipt, version: 1.5 },
  { ...receipt, publishedAt: -1 }, { ...receipt, versionId: '' },
  { ...receipt, entryPath: 'wrong.html' },
])('rejects invalid confirmed publication before any local write: %j', badReceipt => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    store.set(scope, { ...publication, slug: 'previous' });
    const previous = store.getRevision(scope);
    const outbox = createShareBindingOutbox(db);
    let enqueues = 0;
    const record = createPublicFilePublicationRecorder(db, store, () => { enqueues++; return { enqueued: 0, skippedInbound: 0 }; });
    const complete = createSharePublicationCompletion(db, record, outbox, true);
    for (const status of ['published', 'binding_pending'] as const) {
      const result: SharePublishResult = status === 'published' ? { status, receipt: badReceipt }
        : { status, receipt: badReceipt, binding: { retrying: false } };
      expect(() => complete({ scope, publication, mapping, resourceId: 'r', result })).toThrow();
      expect(store.getRevision(scope)).toEqual(previous); expect(outbox.list()).toEqual([]); expect(enqueues).toBe(0);
    }
  } finally { db.close(); }
});

it.each(['published', 'pending', 'no-worker', 'binding-write-fails', 'comment-write-fails', 'mismatch'] as const)('atomically completes local publication state: %s', mode => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const publications = createSqlitePublicFilePublicationStore(db);
    publications.set(scope, { ...publication, slug: 'previous' });
    const previous = publications.getRevision(scope);
    const outbox = createShareBindingOutbox(db);
    db.exec('CREATE TABLE test_comment_intents (token TEXT)');
    if (mode === 'binding-write-fails') db.exec("CREATE TRIGGER fail_binding BEFORE INSERT ON share_binding_outbox BEGIN SELECT RAISE(ABORT, 'private storage diagnostic'); END");
    const record = createPublicFilePublicationRecorder(db, publications, (connection, input) => {
      expect(connection.inTransaction).toBe(true); expect(input.publicFilePath).toBe('index.html');
      db.prepare('INSERT INTO test_comment_intents VALUES (?)').run(input.publicationRevision.token);
      if (mode === 'comment-write-fails') throw new Error('private diagnostic');
      return { enqueued: 1, skippedInbound: 0 };
    });
    const complete = createSharePublicationCompletion(db, record, outbox, mode !== 'no-worker');
    const result: SharePublishResult = mode === 'published' ? { status: 'published', receipt }
      : { status: 'binding_pending', receipt, binding: { retrying: false, code: 'FORBIDDEN' } };
    const input = { scope: mode === 'mismatch' ? { ...scope, filePath: 'other.html' } : scope,
      resourceId: 'r', publication, mapping, result };
    if (mode === 'mismatch') expect(() => complete(input)).toThrow('SHARE_PUBLICATION_RECEIPT_MISMATCH');
    else {
      const response = complete(input);
      expect(response.receipt).toEqual(receipt);
      if (mode === 'published') expect(response).toEqual(result);
      else expect(response).toEqual({ status: 'binding_pending', receipt, binding: {
        retrying: mode === 'pending', code: mode.endsWith('fails') ? 'SHARE_BINDING_RETRY_UNAVAILABLE' : 'FORBIDDEN',
      } });
    }
    const rolledBack = mode.endsWith('fails') || mode === 'mismatch';
    if (rolledBack) {
      expect(publications.getRevision(scope)).toEqual(previous);
      expect(db.prepare('SELECT * FROM test_comment_intents').all()).toEqual([]);
      expect(outbox.list()).toEqual([]);
    } else {
      const revision = publications.getRevision(scope)!;
      expect(revision.slug).toBe('stable'); expect(revision.token).not.toBe(previous?.token);
      expect(db.prepare('SELECT * FROM test_comment_intents').all()).toEqual([{ token: revision.token }]);
      if (mode === 'published') expect(outbox.list()).toEqual([]);
      else expect(outbox.list()).toEqual([{ ...scope, resourceId: 'r', receipt, publicationRevision: revision.token, id: expect.any(Number), failureCount: 1 }].map(({ filePath: _filePath, ...task }) => task));
    }
    expect(db.inTransaction).toBe(false);
  } finally { db.close(); }
});
