import { afterEach, expect, it, vi } from 'vitest';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

afterEach(() => vi.useRealTimers());

it('finishes a root publication nested inside the visibility move that owns its lane', async () => {
  vi.useFakeTimers();
  const mutations = createPublicFileMutations();
  const publication = mutations.withMoves(['project'], () =>
    mutations.run('project', async () => 'published', { joinCurrent: true }));
  const outcome = Promise.race([
    publication,
    new Promise<string>((resolve) => setTimeout(() => resolve('deadlocked'), 10)),
  ]);
  await vi.advanceTimersByTimeAsync(10);
  expect(await outcome).toBe('published');
  expect(mutations.captureReconciliation()('project')).toBe(true);
});

it('does not let an independent publication join another request\'s held move', async () => {
  const mutations = createPublicFileMutations();
  const entered = deferred();
  const release = deferred();
  const calls: string[] = [];
  const move = mutations.withMoves(['project'], async () => {
    entered.release();
    await release.promise;
    await mutations.run('project', async () => { calls.push('nested'); }, { joinCurrent: true });
    calls.push('moved');
  });
  await entered.promise;
  const independent = mutations.run('project', async () => { calls.push('independent'); }, { joinCurrent: true });
  await Promise.resolve();
  expect(calls).toEqual([]);
  release.release();
  await Promise.all([move, independent]);
  expect(calls).toEqual(['nested', 'moved', 'independent']);
});

it('expires ownership inherited by a detached continuation after its mutation settles', async () => {
  vi.useFakeTimers();
  const mutations = createPublicFileMutations();
  const later = deferred();
  const blocked = deferred();
  const releaseBlocker = deferred();
  let detached!: Promise<void>;
  let entered = false;
  await mutations.run('project', async () => {
    detached = later.promise.then(() => mutations.run('project', async () => {
      entered = true;
    }, { joinCurrent: true }));
  });
  const blocker = mutations.run('project', async () => {
    blocked.release();
    await releaseBlocker.promise;
  });
  await blocked.promise;
  later.release();
  await vi.advanceTimersByTimeAsync(0);
  expect(entered).toBe(false);
  releaseBlocker.release();
  await Promise.all([blocker, detached]);
  expect(entered).toBe(true);
});
