import Database from 'better-sqlite3';
import { createInMemoryPublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createShareBindingOutbox, type ShareBindingIntent } from '../src/collab/share-binding-outbox.js';
import { createShareBindingStartup, type PrepareShareBinding } from '../src/collab/share-binding-startup.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const db = new Database(':memory:'); databases.push(db);
  const store = createShareBindingOutbox(db);
  const publications = createInMemoryPublicFilePublicationStore();
  const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'index.html' };
  const publication = { slug: 'stable', fileName: 'index.html', url: 'https://example.test/stable' };
  publications.set(scope, publication);
  const input: ShareBindingIntent = { resourceTeamId: 'w', ownerMemberId: 'o', resourceId: 'r', projectId: 'p', publicationRevision: publications.getRevision(scope)!.token,
    receipt: { filePath: 'index.html', slug: 'stable', publishedAt: 1, version: 1, versionId: 'immutable1', entryPath: 'index.html' } };
  store.enqueue(input);
  const bind = vi.fn(async () => {});
  const prepare = vi.fn<PrepareShareBinding>(async () => ({ resourceTeamId: 'w', ownerMemberId: 'o', bind }));
  const isCurrent = vi.fn((_task: import('../src/collab/share-binding-outbox.js').ShareBindingTask) => true);
  const start = () => createShareBindingStartup(store, { publications, prepare, isCurrent, mutations: createPublicFileMutations() });
  return { store, publications, scope, publication, input, bind, prepare, isCurrent, start };
}
it('runs one binding-only pass and passes frozen original receipt/identity', async () => {
  const f = fixture(); const run = f.start();
  const a = run(); const b = run(); expect(a).toBe(b);
  expect(await a).toEqual({ bound: 1, failed: 0, deferred: 0, persistenceFailures: 0 });
  await run(); expect(f.bind).toHaveBeenCalledTimes(1); expect(f.store.list()).toEqual([]);
  const sent = f.prepare.mock.calls[0]![0];
  expect(sent).toMatchObject(f.input); expect(Object.isFrozen(sent)).toBe(true); expect(Object.isFrozen(sent.receipt)).toBe(true);
});
it.each(['missing', 'wrong-owner', 'wrong-workspace'] as const)('defers %s without burning budget', async kind => {
  const f = fixture(); f.prepare.mockResolvedValue(kind === 'missing' ? null : { resourceTeamId: kind === 'wrong-workspace' ? 'other' : 'w', ownerMemberId: kind === 'wrong-owner' ? 'other' : 'o', bind: f.bind });
  expect(await f.start()()).toMatchObject({ deferred: 1, failed: 0 });
  expect(f.bind).not.toHaveBeenCalled(); expect(f.store.list()[0]?.failureCount).toBe(1);
});
it.each(['before', 'prepare', 'response'] as const)('guards generation changes at %s', async when => {
  const f = fixture();
  if (when === 'before') f.isCurrent.mockReturnValue(false);
  if (when === 'prepare') f.prepare.mockImplementation(async () => { f.isCurrent.mockReturnValue(false); return { resourceTeamId: 'w', ownerMemberId: 'o', bind: f.bind }; });
  if (when === 'response') f.bind.mockImplementation(async () => { f.isCurrent.mockReturnValue(false); throw new Error('old failure'); });
  expect(await f.start()()).toMatchObject({ deferred: 1, failed: 0, bound: 0 });
  expect(f.bind).toHaveBeenCalledTimes(when === 'response' ? 1 : 0);
  expect(f.store.list()[0]?.failureCount).toBe(1);
});
it('rechecks queued attempt ownership after async preparation', async () => {
  const f = fixture();
  f.prepare.mockImplementation(async task => {
    f.store.fail(task);
    return { resourceTeamId: 'w', ownerMemberId: 'o', bind: f.bind };
  });
  expect(await f.start()()).toMatchObject({ deferred: 1, failed: 0 });
  expect(f.bind).not.toHaveBeenCalled(); expect(f.store.list()[0]?.failureCount).toBe(2);
});

it('caps total failures at five across startup cycles and never automatically retries terminal tasks', async () => {
  const f = fixture(); f.bind.mockRejectedValue(new Error('network'));
  for (let i = 0; i < 7; i++) await f.start()();
  expect(f.bind).toHaveBeenCalledTimes(4); expect(f.store.list()[0]?.failureCount).toBe(5);
});
it('does not let one local guard failure prevent another project binding', async () => {
  const f = fixture(); const scope = { ...f.scope, projectId: 'other-project' };
  f.publications.set(scope, f.publication);
  f.store.enqueue({ ...f.input, projectId: scope.projectId, publicationRevision: f.publications.getRevision(scope)!.token });
  f.isCurrent.mockImplementation(task => { if (task.projectId === 'p') throw new Error('local storage'); return true; });
  expect(await f.start()()).toMatchObject({ bound: 1, persistenceFailures: 1 });
  expect(f.store.list()).toEqual([expect.objectContaining({ projectId: 'p', failureCount: 1 })]);
});
