import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';

import { projectDir, resolveProjectDir } from './projects.js';

/**
 * Refcounted per-project file watcher registry.
 *
 * Subscribers receive `{type, path, kind}` events when files inside the project
 * change on disk. The first subscribe lazy-creates a chokidar watcher; the last
 * unsubscribe closes it, so we never hold descriptors for projects no UI is
 * looking at.
 */

// Names we never want to surface as project file changes. Tested per-segment
// against the path *relative to the watch root* so that ancestor directories
// (e.g. the daemon's own `.od/` runtime dir, which contains every project) do
// not accidentally match and silence every event in the tree.
const IGNORE_NAMES = new Set([
  '.git',
  'node_modules',
  '.od',
  'debug',
  '.DS_Store',
  // Python virtual environments and caches — can contain tens of thousands of
  // files, exhausting the process fd table and breaking child-process spawning.
  // These names are safe to match at any path depth: a directory named `.venv`
  // or `__pycache__` is never legitimate authored source in a project tree.
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  '.ruff_cache',
]);
export type ProjectWatchKind = 'add' | 'change' | 'unlink';
export interface ProjectWatchEvent { type: 'file-changed'; path: string; kind: ProjectWatchKind }
export type ProjectWatchCallback = (evt: ProjectWatchEvent) => void;
export interface ProjectWatcherOptions {
  ignored?: (absPath: string) => boolean;
  awaitWriteFinish?: false | { stabilityThreshold: number; pollInterval: number };
  metadata?: unknown;
  _watcherFactory?: WatcherFactory;
}
interface WatcherEntry {
  dir: string;
  watcher: FSWatcher;
  ready: Promise<void>;
  subscribers: Set<ProjectWatchCallback>;
  closing: Promise<void> | null;
}
type WatcherFactory = (dir: string, opts: Required<Pick<ProjectWatcherOptions, 'ignored' | 'awaitWriteFinish'>>) => WatcherEntry;

export function makeIgnored(rootDir: string): (absPath: string) => boolean {
  return (absPath: string): boolean => {
    const rel = path.relative(rootDir, absPath);
    if (!rel || rel === '' || rel.startsWith('..')) return false; // never ignore root itself
    return rel.split(/[\\/]/).some((seg) => IGNORE_NAMES.has(seg));
  };
}

export const DEFAULT_AWAIT_WRITE_FINISH = {
  stabilityThreshold: 200,
  pollInterval: 50,
};

const registry = new Map<string, WatcherEntry>();

function makeEntry(dir: string, opts: Required<Pick<ProjectWatcherOptions, 'ignored' | 'awaitWriteFinish'>>): WatcherEntry {
  const watcher = chokidar.watch(dir, {
    ignored: opts.ignored,
    ignoreInitial: true,
    awaitWriteFinish: opts.awaitWriteFinish,
    persistent: true,
    // Don't follow symlinks out of the project root. Even though the relative-
    // path ignore predicate keeps emitted events project-scoped, an unhandled
    // symlink would still cost descriptors and surface external FS activity.
    followSymlinks: false,
  });

  // chokidar's FSWatcher is an EventEmitter. Without an `error` listener,
  // transient FS faults (ENOSPC, EPERM, EMFILE on saturated inotify watches)
  // would surface as unhandled exceptions and could crash the daemon — taking
  // every other route down with it. Log and keep the watcher alive; refcount
  // cleanup is unaffected.
  watcher.on('error', (err) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[project-watchers] chokidar error in', dir, err);
    }
  });

  let resolveReady: () => void;
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  watcher.once('ready', () => resolveReady());

  const entry: WatcherEntry = {
    dir,
    watcher,
    ready,
    subscribers: new Set(),
    closing: null,
  };

  const broadcast = (kind: ProjectWatchKind) => (absPath: string) => {
    const rel = path.relative(dir, absPath);
    if (!rel || rel.startsWith('..')) return;
    const evt: ProjectWatchEvent = { type: 'file-changed', path: rel.split(path.sep).join('/'), kind };
    for (const cb of entry.subscribers) {
      try {
        cb(evt);
      } catch (err) {
        // A buggy subscriber must not poison siblings. Log in dev so the bug
        // doesn't go silent during local testing.
        if (process.env.NODE_ENV === 'development') {
          console.warn('[project-watchers] subscriber threw on', evt.path, err);
        }
      }
    }
  };

  watcher.on('add', broadcast('add'));
  watcher.on('change', broadcast('change'));
  watcher.on('unlink', broadcast('unlink'));

  return entry;
}

/**
 * Subscribe to file-change events for a project.
 *
 * @param {string} projectsRoot Absolute path to the projects parent directory.
 * @param {string} projectId Project id (validated by projectDir()).
 * @param {(evt: {type: 'file-changed', path: string, kind: 'add'|'change'|'unlink'}) => void} onEvent
 * @param {{ ignored?: string[], awaitWriteFinish?: object, _watcherFactory?: typeof makeEntry }} [opts]
 * @returns {{ unsubscribe: () => Promise<void>, ready: Promise<void> }}
 *   `unsubscribe` releases the subscriber and closes the watcher if it was the
 *   last; `ready` resolves once chokidar has finished its initial scan.
 */
export function subscribe(projectsRoot: string, projectId: string, onEvent: ProjectWatchCallback, opts: ProjectWatcherOptions = {}) {
  // Resolve to the project's actual root: for folder-imported projects
  // (metadata.baseDir set) we watch the user's folder so the live-reload
  // SSE stream actually fires when their files change. The registry is
  // keyed by the resolved directory, not the project id, so two
  // projects pointing at the same folder share one watcher.
  const dir = opts.metadata
    ? resolveProjectDir(projectsRoot, projectId, opts.metadata)
    : projectDir(projectsRoot, projectId);
  const key = dir;

  let entry = registry.get(key);
  if (!entry) {
    const factory = opts._watcherFactory || makeEntry;
    entry = factory(dir, {
      ignored: opts.ignored || makeIgnored(dir),
      awaitWriteFinish: opts.awaitWriteFinish || DEFAULT_AWAIT_WRITE_FINISH,
    });
    registry.set(key, entry);
  }
  entry.subscribers.add(onEvent);

  let unsubscribed = false;
  const unsubscribe = async () => {
    if (unsubscribed) return;
    unsubscribed = true;
    entry.subscribers.delete(onEvent);
    if (entry.subscribers.size === 0) {
      registry.delete(key);
      if (!entry.closing) entry.closing = entry.watcher.close();
      await entry.closing;
    }
  };

  return { unsubscribe, ready: entry.ready || Promise.resolve() };
}

/** Test-only: drop all watchers. */
export async function _resetForTests(): Promise<void> {
  const entries = Array.from(registry.values());
  registry.clear();
  await Promise.allSettled(entries.map((e) => e.watcher.close()));
}

/** Test-only: number of active watchers. */
export function _activeWatcherCount(): number {
  return registry.size;
}

/** Test-only: return the chokidar FSWatcher for a given project's directory. */
export function _internalWatcherForTests(projectsRoot: string, projectId: string): FSWatcher | undefined {
  const dir = projectDir(projectsRoot, projectId);
  return registry.get(dir)?.watcher;
}
