import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureService, openPreview, previewUrl, VERSION } from '../preview.ts';
import type { Probe, PreviewRuntime } from '../preview.ts';
import { WorkspaceStore } from '../workspace.ts';
import { pluginRoot } from '../hyperframes.ts';
import { fixture } from './fixtures.ts';

function runtime(store: WorkspaceStore) {
  const occupied = new Map<number, Probe>(); const launches: number[] = [], stops: number[] = [];
  const environment: PreviewRuntime = {
    probe: async port => occupied.get(port) || { kind: 'free' },
    launch: async (port, directory, log, background) => {
      assert.equal(directory, store.directory); assert.equal(log, path.join(directory, 'preview.log')); launches.push(port);
      if (!background) await store.initialize(pluginRoot);
      occupied.set(port, { kind: 'motion', health: { service: 'motion-preview', protocol: 2, version: VERSION, dataDirectory: directory, ffmpeg: true, ready: true, studioUrl: background ? undefined : `http://localhost:${port + 1}/#project/project` } });
      return { pid: 1234, alive: () => true, error: () => '', stop: () => { stops.push(port); } };
    },
    openEditor: async port => {
      await store.initialize(pluginRoot);
      const entry = occupied.get(port); assert.equal(entry?.kind, 'motion');
      entry.health!.studioUrl = `http://localhost:${port + 1}/#project/project`;
    },
    wait: () => new Promise(resolve => setTimeout(resolve, 2)), attempts: 2,
  };
  return { environment, occupied, launches, stops };
}
test('startup verifies the native Studio service and reuses the same workspace', () => fixture(async store => {
  const mock = runtime(store);
  const first = await openPreview(store, mock.environment);
  assert.equal(first.ready, true); assert.equal(first.reused, false); assert.equal(first.browserOpened, false); assert.ok(first.studioUrl);
  assert.equal((await store.get()).project!.format, 'hyperframes');
  const before = await store.get();
  const second = await openPreview(new WorkspaceStore(store.directory), mock.environment);
  assert.equal(second.previewUrl, first.previewUrl); assert.equal(second.reused, true);
  assert.equal(mock.launches.length, 1); assert.equal(mock.stops.length, 0);
  assert.equal((await store.get()).revision, before.revision); assert.equal(await previewUrl(store), first.previewUrl);
}, false));
test('background startup preserves an empty revision; opening the editor upgrades the same process', () => fixture(async store => {
  const mock = runtime(store), before = await store.get();
  const service = await ensureService(store, mock.environment);
  assert.equal(service.studioUrl, undefined);
  assert.deepEqual(await store.get(), before);
  const editor = await openPreview(store, mock.environment);
  assert.equal(editor.previewUrl, service.previewUrl); assert.ok(editor.studioUrl);
  assert.equal(editor.reused, true); assert.equal(mock.launches.length, 1);
  assert.ok((await store.get()).project);
}, false));
test('unrelated services and mismatched versions or data directories are left intact', () => fixture(async store => {
  const mock = runtime(store), port = Number(process.env.PORT || 4173);
  mock.occupied.set(port, { kind: 'busy' });
  mock.occupied.set(port + 1, { kind: 'motion', health: { service: 'motion-preview', protocol: 2, version: '0.3.1', dataDirectory: store.directory, ffmpeg: true, ready: true } });
  mock.occupied.set(port + 2, { kind: 'motion', health: { service: 'motion-preview', protocol: 2, version: VERSION, dataDirectory: '/other', ffmpeg: true, ready: true } });
  const result = await openPreview(store, mock.environment);
  assert.equal(result.previewUrl, `http://localhost:${port + 3}`); assert.deepEqual(mock.stops, []);
}));
test('concurrent preview requests create one process and preserve existing source', () => fixture(async store => {
  const current = await store.get(); await store.writeFiles(current.revision, [{ path: 'notes.md', content: 'preserve me' }]);
  const before = await store.get(), mock = runtime(store);
  const results = await Promise.all([openPreview(store, mock.environment), openPreview(new WorkspaceStore(store.directory), mock.environment)]);
  assert.equal(results.filter(r => r.reused).length, 1); assert.equal(mock.launches.length, 1);
  assert.equal((await store.get()).revision, before.revision);
}));
test('failed startup stops only the process it launched and releases the startup lock', () => fixture(async store => {
  const mock = runtime(store);
  mock.environment.launch = async port => ({ alive: () => false, error: () => 'listen EPERM', stop: () => { mock.stops.push(port); } });
  await assert.rejects(openPreview(store, mock.environment), /listen EPERM/); assert.equal(mock.stops.length, 1);
  await assert.rejects(readFile(path.join(store.directory, 'preview.json')), /ENOENT/);
  assert.equal((await store.get()).project, null);
  await openPreview(store, runtime(store).environment);
}, false));
test('stale registration and a child that never becomes ready cannot claim success', () => fixture(async store => {
  const port = Number(process.env.PORT || 4173), mock = runtime(store);
  await writeFile(path.join(store.directory, 'preview.json'), JSON.stringify({ port })); mock.occupied.set(port, { kind: 'busy' });
  assert.equal((await openPreview(store, mock.environment)).previewUrl, `http://localhost:${port + 1}`);
  const failed = runtime(store);
  failed.environment.launch = async p => ({ alive: () => true, error: () => '', stop: () => { failed.stops.push(p); } });
  await assert.rejects(openPreview(store, failed.environment), /启动超时/); assert.equal(failed.stops.length, 1);
}));
