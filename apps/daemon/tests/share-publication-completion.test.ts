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
    const record = createPublicFilePublicationRecorder(db, store);
    const complete = createSharePublicationCompletion(db, record, outbox, true);
    for (const status of ['published', 'binding_pending'] as const) {
      const result: SharePublishResult = status === 'published' ? { status, receipt: badReceipt }
        : { status, receipt: badReceipt, binding: { retrying: false } };
      expect(() => complete({ scope, publication, mapping, resourceId: 'r', result })).toThrow();
      expect(store.getRevision(scope)).toEqual(previous); expect(outbox.list()).toEqual([]);
    }
  } finally { db.close(); }
});

it.each(['published', 'pending', 'no-worker', 'binding-write-fails', 'publication-write-fails', 'mismatch'] as const)('atomically completes local publication state: %s', mode => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const publications = createSqlitePublicFilePublicationStore(db);
    publications.set(scope, { ...publication, slug: 'previous' });
    const previous = publications.getRevision(scope);
    const outbox = createShareBindingOutbox(db);
    db.exec(`CREATE TABLE test_comment_intents (token TEXT);
      CREATE TRIGGER reject_comment BEFORE INSERT ON test_comment_intents
      BEGIN SELECT RAISE(ABORT, 'comments unavailable'); END`);
    if (mode === 'binding-write-fails') db.exec("CREATE TRIGGER fail_binding BEFORE INSERT ON share_binding_outbox BEGIN SELECT RAISE(ABORT, 'private storage diagnostic'); END");
    if (mode === 'publication-write-fails') db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE ON public_file_publications BEGIN SELECT RAISE(ABORT, 'private storage diagnostic'); END");
    const record = createPublicFilePublicationRecorder(db, publications);
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
      expect(publications.listFacts(scope)).toEqual([{ scope, publicationRevision: revision, publicFilePath: 'index.html', reopened: false, receipt: { resourceId: 'r', versionId: receipt.versionId } }]);
      expect(db.prepare('SELECT * FROM test_comment_intents').all()).toEqual([]);
      if (mode === 'published') expect(outbox.list()).toEqual([]);
      else expect(outbox.list()).toEqual([{ ...scope, resourceId: 'r', receipt, publicationRevision: revision.token, id: expect.any(Number), failureCount: 1 }].map(({ filePath: _filePath, ...task }) => task));
    }
    expect(db.inTransaction).toBe(false);
  } finally { db.close(); }
});


it('propagates a published-result local persistence failure while rolling back its witness', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    store.set(scope, { ...publication, slug: 'previous' });
    const previous = store.getRevision(scope);
    db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE ON public_file_publications BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END");
    const complete = createSharePublicationCompletion(db, createPublicFilePublicationRecorder(db, store), createShareBindingOutbox(db));
    expect(() => complete({ scope, resourceId: 'r', publication, mapping, result: { status: 'published', receipt } })).toThrow('storage unavailable');
    expect(store.getRevision(scope)).toEqual(previous);
    expect(store.listFacts(scope)).toEqual([]);
  } finally { db.close(); }
});
