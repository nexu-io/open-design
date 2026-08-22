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
/**
 * Attempts for a SETUP clear, which is a different bet from teardown's.
 *
 * The handle is not the compiler's. Windows Defender scans freshly written
 * binaries — a directory of GLB, PNG and USD files is exactly its diet — and
 * holds them open for seconds after the process that wrote them has exited;
 * realtime monitoring is on for most developer machines and all of CI's
 * Windows images. Teardown's ~4s budget was sized for a child process letting
 * go of its own cwd, and against a scanner it simply expired: two suites in
 * one run failed setup on directories that were unlocked and deleted by the
 * time anybody looked.
 *
 * Sized to outlast a scan (~30s worst case) rather than to a guess about
 * process exit. The cost is paid ONLY when a directory is genuinely locked,
 * which on a healthy machine is never — a clear that succeeds first try still
 * costs one syscall.
 */
const SETUP_CLEAR_ATTEMPTS = 15;

export function rmForSetup(dir: string, attempts = SETUP_CLEAR_ATTEMPTS): void {
  if (rmAttempt(dir, attempts)) return;
  // The invariant is EMPTY, not deleted. A directory the OS will not unlink —
  // Windows keeps a handle alive after the process holding it has already
  // exited, and an antivirus scan does the same — but which contains nothing
  // is in exactly the state this function exists to produce: the next copy
  // writes fixtures onto nothing. Failing here tested deletability, which is
  // a proxy, and it turned a machine-level lock into a permanently red test
  // that no amount of correct code could fix.
  // One pinned node must not cost the whole tree. `fs.rmSync` is atomic in
  // spirit and gives up at the first EPERM, so a single held directory left 8
  // entries behind and the emptiness check below never had a chance — even
  // though every FILE was removable. Clear what can be cleared, depth first,
  // then judge what remains.
  clearWhatWeCan(dir);
  if (isEmptyDir(dir)) return;
  throw new Error(
    "could not clear the working directory " + dir + " — a previous run's " +
      "output is still locked, and copying fixtures over it would run this " +
      "test against stale state. Close anything holding it and re-run.",
  );
}

/**
 * Remove everything under `dir` that the OS will let go of, deepest first.
 *
 * Best effort by design: the caller decides what a residue means. A file that
 * cannot be unlinked stays and the emptiness check then reports honestly,
 * rather than this throwing and hiding the fact that 47 of 48 entries went.
 */
function clearWhatWeCan(dir: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      clearWhatWeCan(child);
      try {
        fs.rmdirSync(child);
      } catch {
        /* Pinned; its emptied contents are still progress. */
      }
    } else {
      try {
        fs.unlinkSync(child);
      } catch {
        /* Same. */
      }
    }
  }
}

/** True when the path holds no entries. A path that cannot be READ is not
 *  empty as far as anyone knows, so it reports false and the caller throws. */
function isEmptyDir(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}
