import type { PreviewComment } from '../types';

/**
 * Single-flight runner with one trailing rerun, per scope key.
 *
 * `run(key, task)` starts `task` when nothing is running for that key. A call that lands while a run for the same key is in flight cannot
 * join it — that run may already have read the state the call is about — so
 * it marks exactly one trailing rerun instead. Any number of calls during one
 * run buy one rerun, and every caller settles once the loop (including that
 * rerun) has finished.
 *
 * A call for a different key (the view moved to another conversation) does
 * not wait behind the old scope's read: it starts its own loop at once, and
 * the old loop stops after its current read instead of rerunning.
 *
 * The trailing rerun runs the task passed by the latest joining call, so it
 * uses the newest closure (for example a refreshed workspace context).
 */
export function createSingleflightRunner() {
  type Entry = { key: string; task: () => Promise<void>; promise: Promise<void>; rerun: boolean };
  let current: Entry | null = null;
  return function run(key: string, task: () => Promise<void>): Promise<void> {
    if (current && current.key === key) {
      current.rerun = true;
      current.task = task;
      return current.promise;
    }
    const entry: Entry = { key, task, promise: Promise.resolve(), rerun: false };
    entry.promise = (async () => {
      try {
        do {
          entry.rerun = false;
          try {
            await entry.task();
          } catch {
            // A failed read (sync throw or rejection) never ends the loop early.
          }
        } while (entry.rerun && current === entry);
      } finally {
        // Same synchronous step as the last rerun check: a call after this
        // starts a fresh run rather than marking a loop that already ended.
        if (current === entry) current = null;
      }
    })();
    current = entry;
    return entry.promise;
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, index) => sameJson(item, other[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  const otherKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  return keys.length === otherKeys.length && keys.every((key) => sameJson(left[key], right[key]));
}

/**
 * Fold a freshly read comment list into the current one without churning
 * identity: a comment whose content did not change keeps its current object,
 * and when nothing changed at all the current array itself is returned, so a
 * `setState` with the result is a React no-op.
 */
export function reconcilePreviewComments(
  current: PreviewComment[],
  next: PreviewComment[],
): PreviewComment[] {
  if (current === next) return current;
  const byId = new Map(current.map((comment) => [comment.id, comment]));
  let changed = current.length !== next.length;
  const merged = next.map((comment, index) => {
    const existing = byId.get(comment.id);
    const kept = existing && sameJson(existing, comment) ? existing : comment;
    if (kept !== current[index]) changed = true;
    return kept;
  });
  return changed ? merged : current;
}

/**
 * Re-point attached comments at a freshly read list, dropping ones that are
 * gone. An attached comment whose content did not change keeps its object;
 * when every entry is unchanged `attached` itself is returned.
 */
export function reconcileAttachedComments(
  attached: PreviewComment[],
  next: PreviewComment[],
): PreviewComment[] {
  if (attached.length === 0) return attached;
  const byId = new Map(next.map((comment) => [comment.id, comment]));
  let changed = false;
  const kept: PreviewComment[] = [];
  for (const comment of attached) {
    const fresh = byId.get(comment.id);
    if (!fresh) {
      changed = true;
      continue;
    }
    if (sameJson(comment, fresh)) kept.push(comment);
    else {
      changed = true;
      kept.push(fresh);
    }
  }
  return changed ? kept : attached;
}
