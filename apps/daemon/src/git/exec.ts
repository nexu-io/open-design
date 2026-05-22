// Shared helper for shelling out to `git`. Promoted from the
// `git.summary` agent tool's inline impl so the history feature
// (#1241) can reuse it. Kept deliberately small — one function,
// one option, one contract.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunGitOptions {
  /**
   * When true, exit code 128 is mapped to `''` (soft failure). Used
   * by read-only probes ("is this a repo?", "does this rev exist?")
   * where exit 128 carries a meaningful "no" answer.
   *
   * Off by default. Mutating callers MUST NOT pass this — silently
   * swallowing exit 128 on `git status` against a corrupted gitdir
   * would make the caller read empty stdout as "clean tree" and skip
   * a needed commit (silent data loss).
   */
  softFail128?: boolean;
}

/**
 * Spawn `git` with the given args in `projectPath` and return stdout.
 * Non-zero exits throw with the git stderr as text, except when
 * `softFail128: true` is passed and exit code is 128.
 *
 * 10s timeout, 128KB stdout buffer — matches the original
 * `git.summary` limits.
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
