import { expect, it, vi } from 'vitest';
import { createInMemoryPublicFilePublicationStore, type PreparePublicFileStop } from '../src/collab/public-file-publication-store.js';
import { createProjectPublicFileStop, ProjectPublicFileStopPendingError } from '../src/collab/project-public-file-stop.js';
const scope = { resourceTeamId: 'workspace', ownerMemberId: 'member', projectId: 'project' };
const publication = (slug: string) => ({ slug, url: `https://example.test/${slug}`, fileName: 'index.html' });
function setup() {
  const store = createInMemoryPublicFilePublicationStore();
  const stop = vi.fn(async () => {});
  const prepare = vi.fn<PreparePublicFileStop>(async () => ({ ...scope, stop }));
  return { store, stop, prepare, run: createProjectPublicFileStop(store, prepare) };
}
it('stops every file before allowing deletion and does not touch another owner', async () => {
  const f = setup();
  f.store.set({ ...scope, filePath: 'a.html' }, publication('a'));
  f.store.set({ ...scope, filePath: 'b.html' }, publication('b'));
  f.store.set({ ...scope, ownerMemberId: 'other', filePath: 'a.html' }, publication('other'));
  await f.run(scope);
  expect(f.stop).toHaveBeenCalledTimes(2); expect(f.store.listByProject(scope)).toEqual([]);
  expect(f.store.get({ ...scope, ownerMemberId: 'other', filePath: 'a.html' })?.slug).toBe('other');
});
it('persists each failed stop independently and rejects the deletion continuation', async () => {
  const f = setup(); f.stop.mockRejectedValue(new Error('network'));
  for (const filePath of ['a.html', 'b.html']) f.store.set({ ...scope, filePath }, publication(filePath));
  await expect(f.run(scope)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.store.listByProject(scope)).toHaveLength(2); expect(f.store.listStops()).toHaveLength(2);
  expect(f.store.listStops().every((task) => task.failureCount === 1)).toBe(true);
});
it('defers on missing identity without sending a stop', async () => {
  const f = setup(); f.prepare.mockResolvedValue(null);
  f.store.set({ ...scope, filePath: 'index.html' }, publication('a'));
  await expect(f.run(scope)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.stop).not.toHaveBeenCalled(); expect(f.store.listStops()).toHaveLength(1);
});
it('rejects preparation under a different member', async () => {
  const f = setup(); f.prepare.mockResolvedValue({ ...scope, ownerMemberId: 'other', stop: f.stop });
  f.store.set({ ...scope, filePath: 'index.html' }, publication('a'));
  await expect(f.run(scope)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.stop).not.toHaveBeenCalled();
});
it('does not clear a replacement publication or queue a stale retry after an in-flight failure', async () => {
  const f = setup(); const target = { ...scope, filePath: 'index.html' };
  f.store.set(target, publication('a'));
  f.stop.mockImplementation(async () => { f.store.set(target, publication('a')); throw new Error('old stop failed'); });
  await expect(f.run(scope)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.store.get(target)?.slug).toBe('a'); expect(f.store.listStops()).toEqual([]);
});
it('rejects deletion if a new file appears while stopping', async () => {
  const f = setup(); f.store.set({ ...scope, filePath: 'index.html' }, publication('a'));
  f.stop.mockImplementation(async () => { f.store.set({ ...scope, filePath: 'new.html' }, publication('new')); });
  await expect(f.run(scope)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.store.listByProject(scope).map((row) => row.slug)).toEqual(['new']);
});
it('queues the current failed deletion intent after the same slug was republished', async () => {
  const f = setup(); const target = { ...scope, filePath: 'index.html', slug: 'a' };
  f.store.set(target, publication('a')); f.store.enqueueStop(target);
  for (let i = 0; i < 4; i++) f.store.recordStopFailure(target);
  f.store.set(target, publication('a')); const current = f.store.getRevision(target)!;
  f.stop.mockRejectedValue(new Error('offline'));
  await expect(f.run(scope)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.store.listRetryableStops()).toEqual([{ ...target, publicationRevision: current.token, failureCount: 1 }]);
});

it('reports each remaining file with its own retry fate, excluding successful stops and other owners', async () => {
  const f = setup();
  for (const filePath of ['success.html', 'retry.html', 'terminal.html']) f.store.set({ ...scope, filePath }, publication(filePath));
  const terminal = { ...scope, filePath: 'terminal.html', slug: 'terminal.html' };
  f.store.enqueueStop(terminal);
  for (let i = 0; i < 4; i++) f.store.recordStopFailure(terminal);
  f.store.set({ ...scope, ownerMemberId: 'other', filePath: 'other.html' }, publication('other'));
  f.prepare.mockImplementation(async key => ({ ...scope, stop: async () => { if (key.filePath !== 'success.html') throw new Error('offline'); } }));
  const pending = f.run(scope);
  await expect(pending).rejects.toBeInstanceOf(ProjectPublicFileStopPendingError);
  await expect(pending).rejects.toMatchObject({ message: 'PUBLIC_FILE_STOP_PENDING', canContinueLocalDelete: true, shareResiduals: [
    { filePath: 'retry.html', slug: 'retry.html', retrying: true },
    { filePath: 'terminal.html', slug: 'terminal.html', retrying: false },
  ] });
  expect(f.store.get({ ...scope, filePath: 'success.html' })).toBeNull();
  expect(f.store.listRetryableStops()).toHaveLength(1);
});
it('does not report an old generation queue as retrying for its replacement', async () => {
  const f = setup(); const target = { ...scope, filePath: 'index.html', slug: 'a' };
  f.store.set(target, publication('a')); f.store.enqueueStop(target);
  f.stop.mockImplementation(async () => { f.store.set(target, publication('a')); throw new Error('old attempt'); });
  await expect(f.run(scope)).rejects.toMatchObject({ canContinueLocalDelete: false, shareResiduals: [{ filePath: 'index.html', slug: 'a', retrying: false }] });
});

it('does nothing for a project without publications', async () => {
  const f = setup(); await f.run(scope); expect(f.prepare).not.toHaveBeenCalled();
});
