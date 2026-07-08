/**
 * @module registry
 *
 * In-process coordination registry that keeps concurrent operations against the
 * same target coherent. Holds the singleton maps of in-flight downloads and their
 * active target identities, the key derivations that index them, and the
 * `waitForTask` adapter that attaches a caller's progress listener and abort
 * signal to a shared download task. These maps are module singletons: every
 * concern imports them from here so there is exactly one instance per process.
 * Depends on errors, the target shape, and public option/progress/result types.
 */

import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import type { NormalizedTarget } from "./target.js";
import type { ManagedDownloadOptions, ManagedDownloadProgress, ManagedDownloadResult } from "./types.js";

/**
 * A download in flight, shared by every caller that requested the same identity:
 * its progress listeners, the settling promise, and the target key it holds.
 */
export type ActiveTask = {
  listeners: Set<(progress: ManagedDownloadProgress) => void>;
  promise: Promise<ManagedDownloadResult>;
  targetKey: string;
};

/** Singleton map of active download identity key → in-flight task. */
export const activeTasks = new Map<string, ActiveTask>();
/** Singleton map of active target key → the identity key currently holding it. */
export const activeTargets = new Map<string, string>();

/**
 * Derive the identity key (base + target + payload identity) for a download; two
 * calls collide here only when they request the exact same bytes.
 * @returns The identity key.
 */
export function activeKey(target: NormalizedTarget): string {
  return `${target.basePath}\0${target.targetKey}\0${target.identityDigest}`;
}

/**
 * Derive the target key (base + target, ignoring payload identity); used to
 * detect conflicting identities for the same on-disk target.
 * @returns The target key.
 */
export function targetActiveKey(target: NormalizedTarget): string {
  return `${target.basePath}\0${target.targetKey}`;
}

/**
 * Attach a caller's progress listener and abort signal to a shared task and
 * resolve/reject with its outcome, cleaning up listeners on settle or abort.
 * @returns A promise that settles with the shared task's result, or rejects with
 * `ABORTED` if the caller's signal fires first.
 */
export function waitForTask(
  task: ActiveTask,
  options: Pick<ManagedDownloadOptions, "onProgress" | "signal">,
): Promise<ManagedDownloadResult> {
  return new Promise<ManagedDownloadResult>((resolveWait, rejectWait) => {
    if (options.signal?.aborted) {
      rejectWait(new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.ABORTED, "download wait was aborted"));
      return;
    }
    const listener = options.onProgress;
    if (listener != null) task.listeners.add(listener);
    const cleanup = () => {
      if (listener != null) task.listeners.delete(listener);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      rejectWait(new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.ABORTED, "download wait was aborted"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    task.promise.then(
      (result) => {
        cleanup();
        resolveWait(result);
      },
      (error: unknown) => {
        cleanup();
        rejectWait(error);
      },
    );
  });
}
