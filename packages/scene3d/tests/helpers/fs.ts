import * as fs from "node:fs";

/**
 * Remove a directory, retrying, and never throwing.
 *
 * These suites spawn real Blender/python children. On Windows a child that
 * has just been killed can still hold a handle on its working directory for
 * a short while, so an immediate recursive remove fails with EPERM even
 * though nothing is wrong.
 *
 * Two rules follow, and both matter:
 *
 *   Retry with backoff, because the handle does get released.
 *   Never throw, because a temp directory that outlived its test is not a
 *   test failure. Letting teardown throw turns a suite where every
 *   assertion passed into a red build — which is exactly what happened
 *   here, and it read as a flaky test rather than as the cleanup bug it
 *   was.
 *
 * Atomics.wait rather than a timer: this has to block synchronously inside
 * a non-async teardown.
 */
function rmAttempt(dir: string, attempts: number): boolean {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * (i + 1));
    }
  }
  return false;
}

export function rmRetry(dir: string, attempts = 5): void {
  // Out of attempts is not a failure here. The OS reclaims the temp
  // directory; the test's verdict belongs to its assertions, not to its
  // housekeeping.
  rmAttempt(dir, attempts);
}

/**
 * Clear a directory a test is about to WRITE into, and fail loudly if it
 * cannot be cleared.
 *
 * The never-throwing behaviour above is right for teardown and actively
 * wrong here. A setup that shrugs off a failed remove goes on to copy
 * fixtures ON TOP of the previous run's output — a stale out/ directory and
 * a populated stage cache — so the compile under test is handed state no
 * fixture describes. It does not fail cleanly either: it surfaces later as
 * a null census in whichever assertion happens to touch it first, which
 * reads as a flaky test rather than as the dirty working directory it is.
 *
 * Same retry, opposite ending: if the directory genuinely cannot be
 * emptied, say so instead of running the test against a lie.
 */
export function rmForSetup(dir: string, attempts = 5): void {
  if (rmAttempt(dir, attempts)) return;
  throw new Error(
    "could not clear the working directory " + dir + " — a previous run's " +
      "output is still locked, and copying fixtures over it would run this " +
      "test against stale state. Close anything holding it and re-run.",
  );
}
