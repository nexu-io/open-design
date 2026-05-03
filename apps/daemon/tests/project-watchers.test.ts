// @ts-nocheck
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  _activeWatcherCount,
  _resetForTests,
  subscribe,
} from '../src/project-watchers.js';

function fakeFactory() {
  return (dir, _opts) => ({
    dir,
    watcher: { close: async () => { factoryCloses++; } },
    ready: Promise.resolve(),
    subscribers: new Set(),
    closing: null,
  });
}

let factoryCloses = 0;

afterEach(async () => {
  await _resetForTests();
  factoryCloses = 0;
});

async function makeProjectsRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'od-watchers-'));
  const projectId = 'proj-' + Math.random().toString(36).slice(2, 10);
  await mkdir(path.join(root, projectId), { recursive: true });
  return { root, projectId };
}

function waitFor(predicate, { timeout = 2000, interval = 25 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      try {
        if (predicate()) return resolve(undefined);
      } catch (err) {
        return reject(err);
      }
      if (Date.now() - started > timeout) return reject(new Error('waitFor timeout'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

describe('project-watchers (refcounting)', () => {
  it('lazy-creates a watcher on first subscribe and closes on last unsubscribe', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const factory = fakeFactory();

    expect(_activeWatcherCount()).toBe(0);

    const sub1 = subscribe(root, projectId, () => {}, { _watcherFactory: factory });
    expect(_activeWatcherCount()).toBe(1);

    const sub2 = subscribe(root, projectId, () => {}, { _watcherFactory: factory });
    expect(_activeWatcherCount()).toBe(1); // still one

    await sub1.unsubscribe();
    expect(_activeWatcherCount()).toBe(1); // not yet — second sub still alive
    expect(factoryCloses).toBe(0);

    await sub2.unsubscribe();
    expect(_activeWatcherCount()).toBe(0);
    expect(factoryCloses).toBe(1);
  });

  it('separate projects get separate watchers', async () => {
    const { root, projectId: a } = await makeProjectsRoot();
    const { projectId: b } = await makeProjectsRoot();
    await mkdir(path.join(root, b), { recursive: true });
    const factory = fakeFactory();

    const sub1 = subscribe(root, a, () => {}, { _watcherFactory: factory });
    const sub2 = subscribe(root, b, () => {}, { _watcherFactory: factory });
    expect(_activeWatcherCount()).toBe(2);

    await sub1.unsubscribe();
    await sub2.unsubscribe();
    expect(_activeWatcherCount()).toBe(0);
    expect(factoryCloses).toBe(2);
  });

  it('idempotent unsubscribe', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const { unsubscribe } = subscribe(root, projectId, () => {}, { _watcherFactory: fakeFactory() });
    await unsubscribe();
    await unsubscribe();
    expect(_activeWatcherCount()).toBe(0);
    expect(factoryCloses).toBe(1);
  });

  it('rejects an invalid project id', () => {
    expect(() =>
      subscribe('/tmp', '../escape', () => {}, { _watcherFactory: fakeFactory() }),
    ).toThrow(/invalid project id/);
  });
});

describe('project-watchers (real chokidar)', () => {
  it('emits file-changed events on add / change / unlink', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events = [];
    const sub = subscribe(root, projectId, (e) => events.push(e));
    await sub.ready;

    try {
      const filePath = path.join(root, projectId, 'hello.txt');
      await writeFile(filePath, 'first');
      await waitFor(() => events.some((e) => e.kind === 'add' && e.path === 'hello.txt'));

      await writeFile(filePath, 'second');
      await waitFor(() => events.some((e) => e.kind === 'change' && e.path === 'hello.txt'));

      await rm(filePath);
      await waitFor(() => events.some((e) => e.kind === 'unlink' && e.path === 'hello.txt'));

      expect(events.every((e) => e.type === 'file-changed')).toBe(true);
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, 8_000);

  it('ignores files inside .od/ and node_modules/', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events = [];
    const sub = subscribe(root, projectId, (e) => events.push(e));
    await sub.ready;

    try {
      await mkdir(path.join(root, projectId, '.od'), { recursive: true });
      await writeFile(path.join(root, projectId, '.od', 'state.json'), '{}');
      await mkdir(path.join(root, projectId, 'node_modules'), { recursive: true });
      await writeFile(path.join(root, projectId, 'node_modules', 'x.js'), '');

      await writeFile(path.join(root, projectId, 'real.txt'), 'real');
      await waitFor(() => events.some((e) => e.path === 'real.txt'));

      const ignored = events.filter(
        (e) => e.path.startsWith('.od/') || e.path.startsWith('node_modules/'),
      );
      expect(ignored).toEqual([]);
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, 8_000);
});
