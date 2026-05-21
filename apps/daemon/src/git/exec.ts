// Shared helper for shelling out to `git`. Originally defined inline in
// apps/daemon/src/live-artifacts/refresh.ts where it backed the read-only
// `git.summary` agent tool; promoted to a shared module so the upcoming
// history feature (#1241) can reuse it without duplication.
//
// Kept deliberately small — one function with one option, one contract.
// Callers with substantially different needs (long-running clones, large
// logs) should construct their own execFile call rather than threading
// options through this helper; keeping the surface tight makes its
// semantics easy to reason about.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunGitOptions {
  /**
   * When true, exit code 128 is mapped to `''` (soft failure). Used
   * by read-only probes ("is this a repo?", "does this rev exist?")
   * where exit 128 carries a meaningful "no" answer — the original
   * `git.summary` agent tool relies on this for its
   * `rev-parse --is-inside-work-tree` probe.
   *
   * Off by default. Mutating callers (history feature commits, init,
   * config writes) MUST NOT pass this — silently swallowing exit 128
   * on a `git status` invocation against a corrupted gitdir would
   * make the caller read the empty stdout as "clean tree" and skip
   * a needed commit (silent data loss). Strict callers see exit 128
   * surface as a thrown Error with the stderr message.
   */
  softFail128?: boolean;
}

/**
 * Spawn `git` with the given args in `projectPath` and return stdout.
 *
 * Non-zero exits throw with the git stderr (or message) as text, with
 * one opt-in exception: callers that pass `{ softFail128: true }`
 * receive `''` on exit 128 instead of an exception. See `RunGitOptions`
 * for the rationale.
 *
 * **Defaults**: 10s timeout, 128KB stdout buffer. These match the
 * limits the original `git.summary` tool used. They're tight enough
 * that no one tool can monopolize daemon resources, and the buffer is
 * large enough for typical `log --max-count=50` / `status --short` /
 * `diff --stat` output.
 */
export async function runGit(
  projectPath: string,
  args: string[],
  signal: AbortSignal | undefined,
  options: RunGitOptions = {},
): Promise<string> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: projectPath,
      signal,
      timeout: 10_000,
      maxBuffer: 128 * 1024,
    });
    return result.stdout.toString();
  } catch (error) {
    const maybeError = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
      code?: unknown;
    };
    if (maybeError.code === 128 && options.softFail128) return '';
    throw new Error(
      maybeError.stderr?.toString().trim() || maybeError.message || 'git command failed',
    );
  }
}
