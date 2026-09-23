import { expect, it, vi } from 'vitest';
import { startServer, type StartServerResult } from '../src/server.js';
import * as publications from '../src/collab/public-file-publication-store.js';
import * as outboxes from '../src/collab/share-binding-outbox.js';
import * as startup from '../src/collab/share-binding-startup.js';
import * as binding from '../src/collab/vela-share-binding-prepare.js';
import * as stopping from '../src/collab/vela-public-file-stop.js';

it.each([false, true])('registers the real binding queue once and honors pending stop=%s', async stoppingPending => {
  const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'local.html' };
  const bind = vi.fn(async () => {});
  const prepare = vi.fn(async () => ({ resourceTeamId: 'w', ownerMemberId: 'o', bind }));
  const prepareSpy = vi.spyOn(binding, 'createVelaShareBindingPrepare').mockReturnValue(prepare);
  const stopSpy = vi.spyOn(stopping, 'createVelaPublicFileStop').mockReturnValue(async () => null);
  const createOutbox = outboxes.createShareBindingOutbox;
  let box: outboxes.ShareBindingOutbox | undefined;
  const boxSpy = vi.spyOn(outboxes, 'createShareBindingOutbox').mockImplementation(db => {
    const store = publications.createSqlitePublicFilePublicationStore(db);
    store.set(scope, { slug: 'stable', fileName: scope.filePath, url: 'https://example.test/stable' });
    if (stoppingPending) store.enqueueStop({ ...scope, slug: 'stable' });
    box = createOutbox(db);
    box.enqueue({ ...scope, resourceId: 'r', publicationRevision: store.getRevision(scope)!.token,
      receipt: { filePath: scope.filePath, slug: 'stable', version: 1, versionId: 'v1', publishedAt: 1, entryPath: 'index.html' } });
    return box;
  });
  const createStartup = startup.createShareBindingStartup;
  let run: ReturnType<typeof vi.fn<ReturnType<typeof createStartup>>> | undefined;
  const startSpy = vi.spyOn(startup, 'createShareBindingStartup').mockImplementation((store, options) => {
    expect(options.prepare).toBe(prepare); expect(options.mutations).toEqual({ run: expect.any(Function) });
    run = vi.fn(createStartup(store, options)); return run;
  });
  let started: StartServerResult | undefined;
  try {
    started = await startServer({ port: 0, returnServer: true }) as StartServerResult;
    expect(startSpy).toHaveBeenCalledTimes(1); expect(run).toHaveBeenCalledTimes(1);
    const call = run?.mock.results[0]; if (!call || call.type !== 'return') throw new Error('not started');
    expect(await call.value).toMatchObject({ bound: stoppingPending ? 0 : 1, deferred: stoppingPending ? 1 : 0 });
    expect(bind).toHaveBeenCalledTimes(stoppingPending ? 0 : 1);
    expect(prepare).toHaveBeenCalledTimes(stoppingPending ? 0 : 1);
    expect(box?.list()).toHaveLength(stoppingPending ? 1 : 0);
    expect(prepareSpy).toHaveBeenCalledWith(expect.objectContaining({ dataRoot: expect.any(String), configuredEnv: expect.any(Function) }));
  } finally {
    await started?.shutdown(); if (started) await new Promise<void>(resolve => started!.server.close(() => resolve()));
    prepareSpy.mockRestore(); stopSpy.mockRestore(); boxSpy.mockRestore(); startSpy.mockRestore();
  }
});
