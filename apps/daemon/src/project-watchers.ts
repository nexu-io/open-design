// @ts-nocheck
import { watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { projectDir } from './projects.js';

const IGNORE_NAMES = new Set(['.git', 'node_modules', '.od', 'debug', '.DS_Store']);
const registry = new Map();

export const DEFAULT_AWAIT_WRITE_FINISH = {
  stabilityThreshold: 200,
  pollInterval: 50,
};

export function makeIgnored(rootDir) {
  return (absPath) => {
    const rel = path.relative(rootDir, absPath);
    if (!rel || rel === '' || rel.startsWith('..')) return false;
    return rel.split(/[\\/]/).some((seg) => IGNORE_NAMES.has(seg));
  };
}

function makeEntry(dir, opts) {
  let entry;

  const emit = (eventType, filename) => {
    if (!filename) return;
    const rel = String(filename).split(path.sep).join('/');
    const abs = path.resolve(dir, rel);
    if (opts.ignored?.(abs)) return;
    if (!abs.startsWith(dir + path.sep) && abs !== dir) return;
    void resolveKind(abs, eventType).then((kind) => {
      if (!kind || !entry) return;
      const evt = { type: 'file-changed', path: rel, kind };
      for (const cb of entry.subscribers) {
        try {
          cb(evt);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[project-watchers] subscriber threw on', evt.path, err);
          }
        }
      }
    });
  };

  let watcher;
  try {
    watcher = watch(dir, { recursive: true, persistent: true }, emit);
  } catch {
    watcher = watch(dir, { persistent: true }, emit);
  }

  watcher.on('error', (err) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[project-watchers] fs.watch error in', dir, err);
    }
  });

  entry = {
    dir,
    watcher,
    ready: Promise.resolve(),
    subscribers: new Set(),
    closing: null,
  };

  return entry;
}

async function resolveKind(abs, eventType) {
  if (eventType === 'change') return 'change';
  try {
    const current = await stat(abs);
    return current.isFile() || current.isDirectory() ? 'add' : 'change';
  } catch {
    return 'unlink';
  }
}

export function subscribe(projectsRoot, projectId, onEvent, opts = {}) {
  const dir = projectDir(projectsRoot, projectId);
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
      if (!entry.closing) {
        entry.closing = Promise.resolve().then(() => entry.watcher.close());
      }
      await entry.closing;
    }
  };

  return { unsubscribe, ready: entry.ready || Promise.resolve() };
}

export async function _resetForTests() {
  const entries = Array.from(registry.values());
  registry.clear();
  await Promise.allSettled(entries.map((entry) => Promise.resolve().then(() => entry.watcher.close())));
}

export function _activeWatcherCount() {
  return registry.size;
}

export function _internalWatcherForTests(projectsRoot, projectId) {
  const dir = projectDir(projectsRoot, projectId);
  return registry.get(dir)?.watcher;
}
