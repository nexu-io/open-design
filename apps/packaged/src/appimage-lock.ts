import { fstatSync } from "node:fs";

/** AppRun sets this when another generation owns the launch lock. */
export const APPIMAGE_LOCK_HELD_ENV = "OD_APPIMAGE_LOCK_HELD";

/**
 * The AppRun launch-lock descriptor, when this process inherited one from a
 * FUSE/cache launch.
 *
 * AppRun exports the descriptor number after `flock` succeeds. The initial
 * packaged launcher passes it to the detached sidecar supervisor so the lock
 * outlives the launcher; the supervisor is the desktop generation root and
 * holds it until the desktop exits (including payload handoffs). A malformed
 * value, a stdio descriptor, or a descriptor this process did not actually
 * inherit is ignored rather than allowed to break the bootstrap spawn.
 */
export function inheritedAppImageLockFds(
  env: NodeJS.ProcessEnv = process.env,
): number[] {
  const raw = env.OD_APPIMAGE_LOCK_FD;
  if (raw == null || raw.length === 0) return [];
  const fd = Number(raw);
  if (!Number.isSafeInteger(fd) || fd < 3) return [];
  try {
    fstatSync(fd);
    return [fd];
  } catch {
    return [];
  }
}
