import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { FSWatcher } from 'chokidar';
import { afterEach, describe, expect, it } from 'vitest';

import {
  _activeWatcherCount,
  _resetForTests,
  makeIgnored,
  subscribe,
  type ProjectWatchEvent,
  type ProjectWatcherOptions,
} from '../src/project-watchers.js';

type WatcherFactoryOptions = Required<Pick<ProjectWatcherOptions, 'ignored' | 'awaitWriteFinish'>>;

function createMockWatcher(): FSWatcher {
  const watcher = new EventEmitter() as EventEmitter & { close: () => Promise<void> };
  watcher.close = async () => { factoryCloses++; };
  return watcher as unknown as FSWatcher;
}

function fakeFactory() {
  return (dir: string, _opts: WatcherFactoryOptions) => ({
    dir,
    watcher: createMockWatcher(),
    ready: Promise.resolve(),
    subscribers: new Set<(evt: ProjectWatchEvent) => void>(),
    closing: null,
  });
}

let factoryCloses = 0;

const FAST_WATCH_OPTIONS: ProjectWatcherOptions = { awaitWriteFinish: false };
const REAL_WATCHER_TEST_TIMEOUT_MS = 20_000;
const REAL_WATCHER_WAIT_TIMEOUT_MS = 8_000;

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

function waitFor(
  predicate: () => boolean,
  {
    timeout = 2000,
    interval = 25,
    debug,
  }: { timeout?: number; interval?: number; debug?: () => string } = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      try {
        if (predicate()) return resolve(undefined);
      } catch (err) {
        return reject(err);
      }
      if (Date.now() - started > timeout) {
        return reject(new Error(debug ? `waitFor timeout: ${debug()}` : 'waitFor timeout'));
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}

function debugEvents(events: ProjectWatchEvent[]): string {
  return JSON.stringify({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING,
      CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL,
      OD_WATCHER_USE_POLLING: process.env.OD_WATCHER_USE_POLLING,
    },
    events,
  });
}

function recordEvent(events: ProjectWatchEvent[]) {
  return (event: ProjectWatchEvent) => {
    events.push(event);
    if (process.env.OD_WATCHER_TEST_DEBUG === '1') {
      console.info(`[watcher-test:event] ${JSON.stringify(event)}`);
    }
  };
}

function assertWatcher(watcher: FSWatcher | undefined): asserts watcher is FSWatcher {
  expect(watcher).toBeDefined();
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
  it('ignores generated build trees case-insensitively before chokidar descends', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const projectRoot = path.join(root, projectId);
    const ignored = makeIgnored(projectRoot);

    expect(ignored(path.join(projectRoot, 'Build', 'DerivedData-KeeTests', 'index-store'))).toBe(true);
    expect(ignored(path.join(projectRoot, 'Rust', 'KeePassCore', 'target', 'release', 'lib.a'))).toBe(true);
    expect(ignored(path.join(projectRoot, 'vendor', 'package', 'generated.js'))).toBe(true);
    expect(ignored(path.join(projectRoot, '.build', 'debug', 'Module.o'))).toBe(true);
    expect(ignored(path.join(projectRoot, 'src', 'App.swift'))).toBe(false);

    await rm(root, { recursive: true, force: true });
  });

  it('emits file-changed events on add / change / unlink', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events: ProjectWatchEvent[] = [];
    const sub = subscribe(root, projectId, recordEvent(events), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      const filePath = path.join(root, projectId, 'hello.txt');
      await writeFile(filePath, 'first');
      await waitFor(() => events.some((e) => e.kind === 'add' && e.path === 'hello.txt'), {
        debug: () => debugEvents(events),
      });

      await writeFile(filePath, 'second');
      await waitFor(() => events.some((e) => e.kind === 'change' && e.path === 'hello.txt'), {
        debug: () => debugEvents(events),
      });

      await rm(filePath);
      await waitFor(() => events.some((e) => e.kind === 'unlink' && e.path === 'hello.txt'), {
        debug: () => debugEvents(events),
      });

      expect(events.every((e) => e.type === 'file-changed')).toBe(true);
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, REAL_WATCHER_TEST_TIMEOUT_MS);

  it('still emits events when the watch root is itself nested under .od/ (production layout)', async () => {
    // Reproduces the layout the daemon actually uses:
    //   <RUNTIME_DATA_DIR>/.od/projects/<id>/...
    // The ignore predicate must not match the watch root's ancestor directories,
    // only segments inside the watched tree.
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'od-data-'));
    const projectsRoot = path.join(dataRoot, '.od', 'projects');
    const projectId = 'proj-' + Math.random().toString(36).slice(2, 10);
    await mkdir(path.join(projectsRoot, projectId, 'prototype'), { recursive: true });

    const events: ProjectWatchEvent[] = [];
    const sub = subscribe(projectsRoot, projectId, recordEvent(events), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      const filePath = path.join(projectsRoot, projectId, 'prototype', 'App.jsx');
      await writeFile(filePath, 'export default () => null;');
      await waitFor(
        () => events.some((e) => e.kind === 'add' && e.path === 'prototype/App.jsx'),
        { timeout: REAL_WATCHER_WAIT_TIMEOUT_MS, debug: () => debugEvents(events) },
      );
    } finally {
      await sub.unsubscribe();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, REAL_WATCHER_TEST_TIMEOUT_MS);

  it('ignores files inside .od/ and node_modules/', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events: ProjectWatchEvent[] = [];
    const sub = subscribe(root, projectId, recordEvent(events), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      await mkdir(path.join(root, projectId, '.od'), { recursive: true });
      await writeFile(path.join(root, projectId, '.od', 'state.json'), '{}');
      await mkdir(path.join(root, projectId, 'node_modules'), { recursive: true });
      await writeFile(path.join(root, projectId, 'node_modules', 'x.js'), '');

      await writeFile(path.join(root, projectId, 'real.txt'), 'real');
      await waitFor(() => events.some((e) => e.path === 'real.txt'), {
        timeout: REAL_WATCHER_WAIT_TIMEOUT_MS,
        debug: () => debugEvents(events),
      });

      const ignored = events.filter(
        (e) => e.path.startsWith('.od/') || e.path.startsWith('node_modules/'),
      );
      expect(ignored).toEqual([]);
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, REAL_WATCHER_TEST_TIMEOUT_MS);

  it('ignores files inside Python venv and cache dirs', async () => {
    const { root, projectId } = await makeProjectsRoot();
    const events: ProjectWatchEvent[] = [];
    const sub = subscribe(root, projectId, recordEvent(events), FAST_WATCH_OPTIONS);
    await sub.ready;

    const ignoredDirs = ['.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', '.tox', '.ruff_cache'];
    try {
      for (const dir of ignoredDirs) {
        await mkdir(path.join(root, projectId, dir), { recursive: true });
        await writeFile(path.join(root, projectId, dir, 'file.py'), '');
      }

      await writeFile(path.join(root, projectId, 'real.txt'), 'real');
      await waitFor(() => events.some((e) => e.path === 'real.txt'), {
        timeout: REAL_WATCHER_WAIT_TIMEOUT_MS,
        debug: () => debugEvents(events),
      });

      const ignored = events.filter((e) =>
        ignoredDirs.some((dir) => e.path.startsWith(`${dir}/`)),
      );
      expect(ignored).toEqual([]);
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, REAL_WATCHER_TEST_TIMEOUT_MS);

  it('attaches an error listener and survives an emitted error event', async () => {
    // Regression for codex P1: chokidar's FSWatcher is an EventEmitter.
    // Without an 'error' listener, transient FS faults (ENOSPC, EPERM,
    // EMFILE on saturated inotify watches) would surface as unhandled
    // exceptions and could crash the daemon — taking down all routes.
    const { _internalWatcherForTests } = await import('../src/project-watchers.js');
    const { root, projectId } = await makeProjectsRoot();
    const events: ProjectWatchEvent[] = [];
    const sub = subscribe(root, projectId, recordEvent(events), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      const watcher = _internalWatcherForTests(root, projectId);
      expect(watcher).toBeDefined();
      assertWatcher(watcher);
      // The listener must be registered — listenerCount > 0 proves it.
      expect(watcher.listenerCount('error')).toBeGreaterThan(0);

      // Behavioural: emitting an error must not throw or crash the process,
      // and subsequent file events must still arrive on the same watcher.
      expect(() => watcher.emit('error', new Error('synthetic ENOSPC'))).not.toThrow();
      const filePath = path.join(root, projectId, 'after-error.txt');
      await writeFile(filePath, 'still alive');
      await waitFor(() => events.some((e) => e.path === 'after-error.txt'), {
        timeout: REAL_WATCHER_WAIT_TIMEOUT_MS,
        debug: () => debugEvents(events),
      });
    } finally {
      await sub.unsubscribe();
      await rm(root, { recursive: true, force: true });
    }
  }, REAL_WATCHER_TEST_TIMEOUT_MS);
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

    const events: ProjectWatchEvent[] = [];
    const sub = subscribe(dataRoot, projectId, recordEvent(events), FAST_WATCH_OPTIONS);
    await sub.ready;

    try {
      // Write to a file via the external path. With followSymlinks: false,
      // chokidar isn't traversing the symlink, so no event with a "linked/"
      // prefix should arrive.
      await writeFile(path.join(externalDir, 'leaked.txt'), 'leak');
      // Settle: write a real in-project file to give chokidar something to do.
      await writeFile(path.join(projectRoot, 'real.txt'), 'real');
      await waitFor(() => events.some((e) => e.path === 'real.txt'), {
        timeout: REAL_WATCHER_WAIT_TIMEOUT_MS,
        debug: () => debugEvents(events),
      });

      const linkedEvents = events.filter((e) => e.path.startsWith('linked/'));
      expect(linkedEvents).toEqual([]);
    } finally {
      await sub.unsubscribe();
      await rm(dataRoot, { recursive: true, force: true });
    }
  }, REAL_WATCHER_TEST_TIMEOUT_MS);
});
