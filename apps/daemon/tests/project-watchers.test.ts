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

const FAST_WATCH_OPTIONS = { awaitWriteFinish: false };

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
    const sub = subscribe(root, projectId, (e) => events.push(e), FAST_WATCH_OPTIONS);
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

  it('still emits events when the watch root is itself nested under .od/ (production layout)', async () => {
    // Reproduces the layout the daemon actually uses:
    //   <RUNTIME_DATA_DIR>/.od/projects/<id>/...
    // The ignore predicate must not match the watch root's ancestor directories,
    // only segments inside the watched tree.
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'od-data-'));
    const projectsRoot = path.join(dataRoot, '.od', 'projects');
    const projectId = 'proj-' + Math.random().toString(36).slice(2, 10);
    await mkdir(path.join(projectsRoot, projectId, 'prototype'), { recursive: true });

    const events = [];
    const sub = subscribe(projectsRoot, projectId, (e) => events.push(e), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      const filePath = path.join(projectsRoot, projectId, 'prototype', 'App.jsx');
      await writeFile(filePath, 'export default () => null;');
      await waitFor(
        () => events.some((e) => e.kind === 'add' && e.path === 'prototype/App.jsx'),
        { timeout: 4000 },
      );
    } finally {
      await sub.unsubscribe();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, 8_000);

  it('ignores files inside .od/ and node_modules/', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events = [];
    const sub = subscribe(root, projectId, (e) => events.push(e), FAST_WATCH_OPTIONS);
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

  it('ignores files inside Python venv and cache dirs', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events = [];
    const sub = subscribe(root, projectId, (e) => events.push(e), FAST_WATCH_OPTIONS);
    await sub.ready;

    const ignoredDirs = ['.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', '.tox', '.ruff_cache'];
    try {
      for (const dir of ignoredDirs) {
        await mkdir(path.join(root, projectId, dir), { recursive: true });
        await writeFile(path.join(root, projectId, dir, 'file.py'), '');
      }

      await writeFile(path.join(root, projectId, 'real.txt'), 'real');
      await waitFor(() => events.some((e) => e.path === 'real.txt'));

      const ignored = events.filter((e) =>
        ignoredDirs.some((dir) => e.path.startsWith(`${dir}/`)),
      );
      expect(ignored).toEqual([]);
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, 8_000);

  it('attaches an error listener and survives an emitted error event', async () => {
    // Regression for codex P1: chokidar's FSWatcher is an EventEmitter.
    // Without an 'error' listener, transient FS faults (ENOSPC, EPERM,
    // EMFILE on saturated inotify watches) would surface as unhandled
    // exceptions and could crash the daemon — taking down all routes.
    const { _internalWatcherForTests } = await import('../src/project-watchers.js');
    const { root, projectId } = await makeProjectsRoot();
    const events = [];
    const sub = subscribe(root, projectId, (e) => events.push(e), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      const watcher = _internalWatcherForTests(root, projectId);
      expect(watcher).toBeDefined();
      // The listener must be registered — listenerCount > 0 proves it.
      expect(watcher.listenerCount('error')).toBeGreaterThan(0);

      // Behavioural: emitting an error must not throw or crash the process,
      // and subsequent file events must still arrive on the same watcher.
      expect(() => watcher.emit('error', new Error('synthetic ENOSPC'))).not.toThrow();
      const filePath = path.join(root, projectId, 'after-error.txt');
      await writeFile(filePath, 'still alive');
      await waitFor(() => events.some((e) => e.path === 'after-error.txt'));
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, 8_000);
});

describe('project-watchers (chokidar options)', () => {
  it('does not follow symlinks out of the watch root (production factory)', async () => {
    // Real chokidar test: create a symlink inside the project pointing to a
    // sibling directory outside the project. Writing to the external sibling
    // must NOT produce an event scoped to the symlink path, because
    // followSymlinks is false.
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'od-symlink-'));
    const { symlink } = await import('node:fs/promises');
    const projectId = 'proj-' + Math.random().toString(36).slice(2, 10);
    const projectRoot = path.join(dataRoot, projectId);
    await mkdir(projectRoot, { recursive: true });
    const externalDir = path.join(dataRoot, 'external');
    await mkdir(externalDir, { recursive: true });
    try {
      await symlink(externalDir, path.join(projectRoot, 'linked'), 'dir');
    } catch (err) {
      // Some filesystems disallow symlinks. Skip without failing the suite.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err.code === 'EPERM' || err.code === 'ENOTSUP')
      ) {
        await rm(dataRoot, { recursive: true, force: true });
        return;
      }
      throw err;
    }

    const events = [];
    const sub = subscribe(dataRoot, projectId, (e) => events.push(e), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      // Write to a file via the external path. With followSymlinks: false,
      // chokidar isn't traversing the symlink, so no event with a "linked/"
      // prefix should arrive.
      await writeFile(path.join(externalDir, 'leaked.txt'), 'leak');
      // Settle: write a real in-project file to give chokidar something to do.
      await writeFile(path.join(projectRoot, 'real.txt'), 'real');
      await waitFor(() => events.some((e) => e.path === 'real.txt'));

      const linkedEvents = events.filter((e) => e.path.startsWith('linked/'));
      expect(linkedEvents).toEqual([]);
    } finally {
      await sub.unsubscribe();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, 8_000);
});
