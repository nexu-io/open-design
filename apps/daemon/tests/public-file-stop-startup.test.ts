import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PublicFileStopTaskKey } from '../src/collab/public-file-publication-store.js';
import { createInMemoryPublicFilePublicationStore, createPublicFileStopStartup, createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';

const key = { resourceTeamId: 'team-a', ownerMemberId: 'owner-a', projectId: 'deleted-project', filePath: 'index.html', slug: 'old-slug' };

describe('public share stop startup pass', () => {
  it.each(['memory', 'sqlite'])('isolates per-task read failures and retries next startup: %s', async (backend) => {
    for (const read of ['queue', 'revision']) {
      const db = new Database(':memory:');
      try {
        migratePublicFilePublications(db);
        const store = backend === 'sqlite' ? createSqlitePublicFilePublicationStore(db) : createInMemoryPublicFilePublicationStore();
        store.enqueueStop(key); store.enqueueStop({ ...key, slug: 'second' });
        if (read === 'queue') vi.spyOn(store, 'listStops').mockImplementationOnce(() => { throw new Error('queue read failed'); });
        else vi.spyOn(store, 'getRevision').mockImplementationOnce(() => { throw new Error('revision read failed'); });
        const stopped: string[] = [];
        const prepare = async (task: Readonly<PublicFileStopTaskKey>) => ({ ...task, stop: async () => { stopped.push(task.slug); } });
        expect(await createPublicFileStopStartup(store, prepare)()).toEqual({ stopped: 1, failed: 0, deferred: 0, persistenceFailures: 1 });
        expect(stopped).toEqual(['second']);
        expect(store.listStops()).toEqual([{ ...key, failureCount: 1 }]);
        expect(await createPublicFileStopStartup(store, prepare)()).toEqual({ stopped: 1, failed: 0, deferred: 0, persistenceFailures: 0 });
        expect(stopped).toEqual(['second', key.slug]);
        expect(store.listStops()).toEqual([]);
      } finally { db.close(); }
    }
  });

  it('persists retry outcomes across SQLite reopen and clears only the successful exact key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-stop-startup-'));
    const file = join(dir, 'queue.sqlite');
    let db = new Database(file);
    try {
      migratePublicFilePublications(db);
      const initial = createSqlitePublicFilePublicationStore(db);
      initial.enqueueStop(key);
      initial.enqueueStop({ ...key, slug: 'success' });
      const calls: PublicFileStopTaskKey[] = [];
      for (let i = 0; i < 6; i++) {
        db.close();
        db = new Database(file);
        await createPublicFileStopStartup(createSqlitePublicFilePublicationStore(db), async (task) => ({ ...key, stop: async () => {
          calls.push({ ...task });
          if (task.slug === key.slug) throw new Error('network');
        } }))();
      }
      expect(calls.filter(task => task.slug === key.slug)).toHaveLength(4);
      expect(calls.filter(task => task.slug === 'success')).toHaveLength(1);
      expect(createSqlitePublicFilePublicationStore(db).listStops()).toEqual([{ ...key, failureCount: 5 }]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('coalesces concurrent and later calls, stops exact old scope and keeps new tasks for next startup', async () => {
    const store = createInMemoryPublicFilePublicationStore();
    store.enqueueStop(key);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => { entered = resolve; });
    const stop = vi.fn(async () => { entered(); await gate; });
    const prepare = vi.fn(async (task: Readonly<PublicFileStopTaskKey>) => { expect(task).toEqual(key); return { ...key, stop }; });
    const run = createPublicFileStopStartup(store, prepare);
    const first = run();
    const second = run();
    await entry;
    expect(stop).toHaveBeenCalledTimes(1);
    store.enqueueStop({ ...key, slug: 'new-slug' });
    release();
    expect(await first).toEqual({ stopped: 1, failed: 0, deferred: 0, persistenceFailures: 0 });
    await second;
    await run();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(store.listStops()).toEqual([{ ...key, slug: 'new-slug', failureCount: 1 }]);
  });

  it('retains unavailable and wrong-account tasks without consuming attempts', async () => {
    const store = createInMemoryPublicFilePublicationStore();
    store.enqueueStop(key);
    expect((await createPublicFileStopStartup(store, null)()).deferred).toBe(1);
    const stop = vi.fn(async () => {});
    const currentMember: string = 'owner-b';
    await createPublicFileStopStartup(store, async () => ({ ...key, ownerMemberId: currentMember, stop }))();
    const currentTeam: string = 'team-b';
    await createPublicFileStopStartup(store, async () => ({ ...key, resourceTeamId: currentTeam, stop }))();
    await createPublicFileStopStartup(store, async () => { throw new Error('identity unavailable'); })();
    expect(stop).not.toHaveBeenCalled();
    expect(store.listStops()).toEqual([{ ...key, failureCount: 1 }]);
  });

  it('counts actual failures once per startup, caps at five and retains exhausted rows', async () => {
    const store = createInMemoryPublicFilePublicationStore();
    store.enqueueStop(key);
    const stop = vi.fn(async () => { throw new Error('network failed'); });
    for (let i = 0; i < 6; i++) await createPublicFileStopStartup(store, async () => ({ ...key, stop }))();
    expect(stop).toHaveBeenCalledTimes(4);
    expect(store.listStops()).toEqual([{ ...key, failureCount: 5 }]);
  });

  it('continues other tasks after stop or persistence failure without deleting diagnostics', async () => {
    const store = createInMemoryPublicFilePublicationStore();
    store.enqueueStop(key);
    store.enqueueStop({ ...key, slug: 'second' });
    const run = createPublicFileStopStartup({ ...store, completeStop: () => { throw new Error('disk'); } }, async () => ({ ...key, stop: async () => {} }));
    expect(await run()).toEqual({ stopped: 0, failed: 0, deferred: 0, persistenceFailures: 2 });
    expect(store.listStops().map(t => t.failureCount)).toEqual([1, 1]);
    const broken = createPublicFileStopStartup({ ...store, recordStopFailure: () => { throw new Error('disk'); } }, async () => ({ ...key, stop: async () => { throw new Error('network'); } }));
    expect((await broken()).persistenceFailures).toBe(2);
    expect(store.listStops()).toHaveLength(2);
  });
});
