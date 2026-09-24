import { expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
import { createProjectPublicFileStop } from '../src/collab/project-public-file-stop.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createInMemoryPublicFilePublicationStore, createPublicFileStopStartup, createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
it.each([false, true])('preserves original revision across SQLite close/reopen and handles replacement=%s', async (replace) => {
  const dir = mkdtempSync(join(tmpdir(), 'od-stop-revision-'));
  const file = join(dir, 'store.sqlite');
  let db = new Database(file);
  try {
    migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
    let store = createSqlitePublicFilePublicationStore(db);
    store.set(key, publication);
    const original = store.getRevision(key)!;
    store.enqueueStop(key);
    db.prepare(`INSERT INTO comment_relay_outbox(workspace_id,workspace_member_id,team_id,relay_scope,project_id,file_path,comment_id,payload_json,next_attempt_at,created_at,updated_at)
      VALUES ('team','owner','team','personal','project','index.html','old','{}',1,1,1)`).run();
    db.close();
    db = new Database(file);
    store = createSqlitePublicFilePublicationStore(db);
    expect(store.listStops()[0]?.publicationRevision).toBe(original.token);
    if (replace) store.set(key, publication);
    const stop = vi.fn(async () => {});
    const result = await createPublicFileStopStartup(store, async () => ({ ...key, stop }))();
    expect(stop).toHaveBeenCalledTimes(replace ? 0 : 1);
    expect(result.deferred).toBe(replace ? 1 : 0);
    expect(result.stopped).toBe(replace ? 0 : 1);
    db.close();
    db = new Database(file);
    store = createSqlitePublicFilePublicationStore(db);
    expect(store.listStops()).toHaveLength(replace ? 1 : 0);
    expect(store.get(key)).toEqual(replace ? publication : null);
    expect(db.prepare('SELECT comment_id FROM comment_relay_outbox').all()).toEqual(replace ? [{ comment_id: 'old' }] : []);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

it('recovers a new failed deletion intent after an exhausted same-slug task across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-stop-new-intent-'));
  const file = join(dir, 'store.sqlite');
  let db = new Database(file);
  try {
    migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
    let store = createSqlitePublicFilePublicationStore(db);
    store.set(key, publication); store.enqueueStop(key);
    for (let i = 0; i < 4; i++) store.recordStopFailure(key);
    const oldRevision = store.getRevision(key)!;
    const foreign = { ...key, ownerMemberId: 'another-owner' };
    store.set(foreign, publication);
    store.set(key, publication);
    const current = store.getRevision(key)!;
    expect(current.token).not.toBe(oldRevision.token);
    const offlineStop = vi.fn(async () => { throw new Error('offline'); });
    await expect(createProjectPublicFileStop(store, async () => ({ ...key, stop: offlineStop }))(key)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
    expect(offlineStop).toHaveBeenCalledTimes(1);
    db.close(); db = new Database(file);
    store = createSqlitePublicFilePublicationStore(db);
    expect(store.get(key)).toEqual(publication);
    expect(store.listRetryableStops()).toEqual([{ ...key, publicationRevision: current.token, failureCount: 1 }]);
    const stop = vi.fn(async () => {});
    const prepare = vi.fn(async (task) => { expect(task).toEqual(key); return { ...key, stop }; });
    expect(await createPublicFileStopStartup(store, prepare, createPublicFileMutations())()).toEqual({ stopped: 1, failed: 0, deferred: 0, persistenceFailures: 0 });
    expect(stop).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
    db.close(); db = new Database(file);
    store = createSqlitePublicFilePublicationStore(db);
    expect(store.listStops()).toEqual([]); expect(store.get(key)).toBeNull();
    expect(store.get(foreign)).toEqual(publication);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

it('holds the shared project lock through stop and persistence before another publish', async () => {
  const store = createInMemoryPublicFilePublicationStore(); store.set(key, publication); store.enqueueStop(key);
  const mutations = createPublicFileMutations();
  let entered!: () => void; const entry = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  const run = createPublicFileStopStartup(store, async () => ({ ...key, stop: async () => { entered(); await barrier; } }), mutations);
  const retry = run(); await entry;
  let published = false;
  const publish = mutations.run(key.projectId, async () => { published = true; store.set(key, publication); });
  try { await Promise.resolve(); await Promise.resolve(); expect(published).toBe(false); }
  finally { release(); await retry; await publish; }
  expect((await retry).stopped).toBe(1);
  expect(store.listStops()).toEqual([]); expect(store.get(key)).toEqual(publication);
});

const key = { resourceTeamId: 'team', ownerMemberId: 'owner', projectId: 'project', filePath: 'index.html', slug: 'stable' };
const publication = { slug: key.slug, url: 'https://example.test/stable', fileName: key.filePath };
it('does not stop a new publication for a legacy task without a generation', async () => {
  const store = createInMemoryPublicFilePublicationStore(); store.enqueueStop(key); store.set(key, publication);
  const stop = vi.fn(async () => {});
  expect((await createPublicFileStopStartup(store, async () => ({ ...key, stop }))()).deferred).toBe(1);
  expect(stop).not.toHaveBeenCalled(); expect(store.listStops()).toHaveLength(1);
});
it('rechecks generation after awaiting identity preparation', async () => {
  const store = createInMemoryPublicFilePublicationStore(); store.set(key, publication); store.enqueueStop(key);
  const stop = vi.fn(async () => {});
  const result = await createPublicFileStopStartup(store, async () => {
    store.set(key, publication); return { ...key, stop };
  })();
  expect(result.deferred).toBe(1); expect(stop).not.toHaveBeenCalled(); expect(store.listStops()).toHaveLength(1);
});
it.each([false, true])('a late response cannot clear or increment a replacement queue task: failed=%s', async (failed) => {
  const store = createInMemoryPublicFilePublicationStore(); store.set(key, publication); store.enqueueStop(key);
  const result = await createPublicFileStopStartup(store, async () => ({ ...key, stop: async () => {
    store.set(key, publication); store.completeStop(key); store.enqueueStop(key);
    if (failed) throw new Error('old network error');
  } }))();
  expect(result.deferred).toBe(1);
  expect(store.get(key)).toEqual(publication);
  expect(store.listStops()).toEqual([{ ...key, publicationRevision: store.getRevision(key)!.token, failureCount: 1 }]);
});
it('successful matching retry clears its publication witness and task', async () => {
  const store = createInMemoryPublicFilePublicationStore(); store.set(key, publication); store.enqueueStop(key);
  const result = await createPublicFileStopStartup(store, async () => ({ ...key, stop: async () => {} }))();
  expect(result.stopped).toBe(1); expect(store.get(key)).toBeNull(); expect(store.listStops()).toEqual([]);
});
