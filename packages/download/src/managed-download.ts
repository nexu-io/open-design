/**
 * @module managed-download
 *
 * Public entry point for a single managed download. Deduplicates concurrent
 * callers requesting the same identity onto one shared task, rejects a second
 * caller that targets the same on-disk file with a different identity, fans
 * progress out to every waiter, and drives the run kernel. Depends on constants,
 * the target resolver, the coordination registry, the run kernel, errors, and
 * public option/progress/result types.
 */

import { DEFAULT_MAX_ATTEMPTS } from "./constants.js";
import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { type ActiveTask, activeKey, activeTargets, activeTasks, targetActiveKey, waitForTask } from "./registry.js";
import { runManagedDownload } from "./run.js";
import { targetFromOptions } from "./target.js";
import type { ManagedDownloadOptions, ManagedDownloadProgress, ManagedDownloadResult } from "./types.js";

/**
 * Download a file into a managed base, verifying its checksum and reusing or
 * resuming prior state when possible. Concurrent calls for the same identity
 * share one task; a conflicting identity for the same target throws
 * `TARGET_CONFLICT`.
 * @returns The completed download result.
 */
export async function managedDownload(options: ManagedDownloadOptions): Promise<ManagedDownloadResult> {
  const target = targetFromOptions(options);
  const key = activeKey(target);
  const targetKey = targetActiveKey(target);
  const existingForTarget = activeTargets.get(targetKey);
  if (existingForTarget != null && existingForTarget !== key) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_CONFLICT, `download target is already active with a different identity: ${target.bucket}/${target.fileName}`);
  }
  const existing = activeTasks.get(key);
  if (existing != null) return await waitForTask(existing, options);

  const listeners = new Set<(progress: ManagedDownloadProgress) => void>();
  const emit = (progress: ManagedDownloadProgress) => {
    for (const listener of listeners) listener(progress);
  };
  const task: ActiveTask = {
    listeners,
    targetKey,
    promise: runManagedDownload(target, {
      emit,
      fetchImpl: options.fetch ?? globalThis.fetch,
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      requestHeaders: options.payload.headers,
    }),
  };
  activeTasks.set(key, task);
  activeTargets.set(targetKey, key);
  task.promise.finally(() => {
    activeTasks.delete(key);
    if (activeTargets.get(targetKey) === key) activeTargets.delete(targetKey);
  }).catch(() => undefined);
  return await waitForTask(task, options);
}
