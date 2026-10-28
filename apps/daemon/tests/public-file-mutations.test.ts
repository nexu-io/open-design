import { expect, it } from 'vitest';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
it('serializes publish, stop and deletion until each operation actually settles', async () => {
  const mutations = createPublicFileMutations(); const gate = deferred(); const entered = deferred(); const calls: string[] = [];
  const publish = mutations.run('p', async () => { calls.push('publish'); entered.release(); await gate.promise; calls.push('published'); });
  await entered.promise;
  const stop = mutations.run('p', async () => { calls.push('stop'); });
  const deletion = mutations.run('p', async () => { calls.push('delete'); });
  await Promise.resolve(); expect(calls).toEqual(['publish']);
  gate.release(); await Promise.all([publish, stop, deletion]);
  expect(calls).toEqual(['publish', 'published', 'stop', 'delete']);
});
it('does not block another project and recovers after a rejected operation', async () => {
  const mutations = createPublicFileMutations(); const gate = deferred(); const entered = deferred();
  const failed = mutations.run('p', async () => { entered.release(); await gate.promise; throw new Error('network'); });
  const rejection = expect(failed).rejects.toThrow('network'); await entered.promise;
  expect(await mutations.run('other', async () => 42)).toBe(42);
  let ran = false; const next = mutations.run('p', async () => { ran = true; return 7; });
  await Promise.resolve(); expect(ran).toBe(false);
  gate.release(); await rejection; expect(await next).toBe(7);
  expect(await mutations.run('p', async () => 8)).toBe(8);
});
it('shares the publication lane with queued moves, but only moves fence catalog reads', async () => {
  const mutations = createPublicFileMutations();
  const release = deferred(); const entered = deferred();
  const publication = mutations.run('p', async () => { entered.release(); await release.promise; });
  await entered.promise;
  const before = mutations.captureReconciliation();
  expect(before('p')).toBe(true);
  let moved = false;
  const move = mutations.withMoves(['p'], async () => { moved = true; });
  const during = mutations.captureReconciliation();
  expect(before('p')).toBe(false);
  expect(during('p')).toBe(false);
  expect(during('other')).toBe(true);
  expect(moved).toBe(false);
  release.release();
  await Promise.all([publication, move]);
  expect(moved).toBe(true);
  expect(before('p')).toBe(false);
  expect(during('p')).toBe(false);
  expect(mutations.captureReconciliation()('p')).toBe(true);
});
