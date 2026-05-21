// Shared helper for shelling out to `git`. Originally defined inline in
// apps/daemon/src/live-artifacts/refresh.ts where it backed the read-only
// `git.summary` agent tool; promoted to a shared module so the upcoming
// history feature (#1241) can reuse it without duplication.
//
// Kept deliberately small — one function, one contract. Callers with
// substantially different needs (long-running clones, large logs) should
// construct their own execFile call rather than threading options
// through this helper; keeping the surface tight makes its semantics
// easy to reason about.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Spawn `git` with the given args in `projectPath` and return stdout.
 *
 * **Soft failure on exit code 128.** Git uses exit code 128 for a family
 * of "fatal" conditions including `not a git repository`, `unknown revision`,
 * and friends. The caller often wants to detect those by inspecting empty
 * output rather than catching exceptions (the original `git.summary` tool's
 * "is this a repo?" probe relies on this), so 128 is mapped to `''`.
 * All other non-zero exits throw with the git stderr (or message) as text.
 *
 * **Defaults**: 10s timeout, 128KB stdout buffer. These match the limits
 * the original `git.summary` tool used. They're tight enough that no one
 * tool can monopolize daemon resources, and the buffer is large enough for
 * typical `log --max-count=50` / `status --short` / `diff --stat` output.
 */
export async function runGit(
  projectPath: string,
  args: string[],
  signal: AbortSignal | undefined,
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
    if (maybeError.code === 128) return '';
    throw new Error(
      maybeError.stderr?.toString().trim() || maybeError.message || 'git command failed',
    );
  }
}
