import { expect, it, vi } from 'vitest';
import { startServer, type StartServerResult } from '../src/server.js';
import * as publications from '../src/collab/public-file-publication-store.js';
import * as velaStop from '../src/collab/vela-public-file-stop.js';

it('runs the real shared SQLite queue consumer once after server startup, deferring unavailable stops', async () => {
  const key = { resourceTeamId: 'startup-team', ownerMemberId: 'startup-owner', projectId: 'already-deleted', filePath: 'index.html', slug: 'still-public' };
  const prepare = vi.fn(async () => null);
  const adapterSpy = vi.spyOn(velaStop, 'createVelaPublicFileStop').mockReturnValue(prepare);
  const createStore = publications.createSqlitePublicFilePublicationStore;
  const createStartup = publications.createPublicFileStopStartup;
  const stores: publications.StopQueuePublicFilePublicationStore[] = [];
  const runs: ReturnType<typeof vi.fn<ReturnType<typeof createStartup>>>[] = [];
  const storeSpy = vi.spyOn(publications, 'createSqlitePublicFilePublicationStore').mockImplementation((...args) => {
    const store = createStore(...args);
    store.enqueueStop(key);
    stores.push(store);
    return store;
  });
  const startupSpy = vi.spyOn(publications, 'createPublicFileStopStartup').mockImplementation((store, prepareStop, mutations) => {
    expect(prepareStop).toBe(prepare);
    expect(mutations).toEqual({ run: expect.any(Function) });
    const run = vi.fn(createStartup(store, prepareStop, mutations));
    runs.push(run);
    return run;
  });
  let started: StartServerResult | undefined;
  try {
    started = await startServer({ port: 0, returnServer: true }) as StartServerResult;
    expect(stores).toHaveLength(1);
    expect(startupSpy).toHaveBeenCalledWith(stores[0], prepare, expect.objectContaining({ run: expect.any(Function) }));
    expect(adapterSpy).toHaveBeenCalledWith(expect.objectContaining({ dataRoot: expect.any(String), configuredEnv: expect.any(Function) }));
    expect(runs).toHaveLength(1);
    const run = runs[0];
    const store = stores[0];
    if (!run || !store) throw new Error("startup consumer was not registered");
    expect(run).toHaveBeenCalledTimes(1);
    const invocation = run.mock.results[0];
    if (!invocation || invocation.type !== "return") throw new Error("startup consumer did not return");
    expect(await invocation.value).toMatchObject({ deferred: 1, failed: 0, stopped: 0 });
    expect(store.listStops()).toContainEqual({ ...key, failureCount: 1 });
  } finally {
    await started?.shutdown();
    if (started) await new Promise<void>((resolve) => started!.server.close(() => resolve()));
    adapterSpy.mockRestore();
    startupSpy.mockRestore();
    storeSpy.mockRestore();
  }
});
