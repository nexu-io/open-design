import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { createInMemoryPublicFilePublicationStore, createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
const key = { resourceTeamId: 'team', ownerMemberId: 'owner', projectId: 'project', filePath: 'index.html', slug: 'stable' };
const publication = { slug: key.slug, url: 'https://example.test/stable', fileName: key.filePath };
it.each(['memory', 'sqlite'])('captures failed publication revision without retargeting an old task: %s', (backend) => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = backend === 'memory' ? createInMemoryPublicFilePublicationStore() : createSqlitePublicFilePublicationStore(db);
    store.set(key, publication);
    const original = store.getRevision(key)!;
    store.enqueueStop(key);
    expect(store.listStops()[0]).toMatchObject({ publicationRevision: original.token });
    store.set(key, publication);
    store.enqueueStop(key);
    expect(store.listStops()[0]).toMatchObject({ publicationRevision: original.token, failureCount: 1 });
    expect(store.getRevision(key)?.token).not.toBe(original.token);
    if (backend === 'sqlite') {
      expect(createSqlitePublicFilePublicationStore(db).listRetryableStops()[0]).toMatchObject({ publicationRevision: original.token });
    }
  } finally { db.close(); }
});
it.each(['memory', 'sqlite'])('accepts a witnessed new stop intent but never resets the same exhausted intent: %s', (backend) => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = backend === 'memory' ? createInMemoryPublicFilePublicationStore() : createSqlitePublicFilePublicationStore(db);
    store.set(key, publication); const old = store.getRevision(key)!;
    store.enqueueStop(key); for (let i = 0; i < 4; i++) store.recordStopFailure(key);
    store.set(key, publication); const current = store.getRevision(key)!;
    store.enqueueStop(key, current);
    expect(store.listRetryableStops()).toEqual([{ ...key, publicationRevision: current.token, failureCount: 1 }]);
    for (let i = 0; i < 4; i++) store.recordStopFailure(key);
    store.enqueueStop(key, current);
    store.enqueueStop(key, old);
    store.enqueueStop(key, { ...current, slug: 'different' });
    expect(store.listStops()).toEqual([{ ...key, publicationRevision: current.token, failureCount: 5 }]);
    expect(store.listRetryableStops()).toEqual([]);
    if (backend === 'sqlite') expect(createSqlitePublicFilePublicationStore(db).listStops()).toEqual(store.listStops());
  } finally { db.close(); }
});

it('migrates legacy tasks without inventing ownership of a current generation', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE public_file_stop_queue (resource_team_id TEXT, owner_member_id TEXT, project_id TEXT, file_path TEXT, slug TEXT, failure_count INTEGER, PRIMARY KEY(resource_team_id,owner_member_id,project_id,file_path,slug)); INSERT INTO public_file_stop_queue VALUES ('team','owner','project','index.html','stable',2);`);
    migratePublicFilePublications(db); migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    store.set(key, publication);
    expect(store.listStops()).toEqual([{ ...key, failureCount: 2 }]);
    const columns = db.prepare('PRAGMA table_info(public_file_stop_queue)').all();
    expect(columns).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'publication_revision' })]));
  } finally { db.close(); }
});
it.each(['memory', 'sqlite'])('does not borrow revision from a different slug: %s', (backend) => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = backend === 'memory' ? createInMemoryPublicFilePublicationStore() : createSqlitePublicFilePublicationStore(db);
    store.set(key, { ...publication, slug: 'replacement' });
    store.enqueueStop(key);
    expect(store.listStops()).toEqual([{ ...key, failureCount: 1 }]);
  } finally { db.close(); }
});
