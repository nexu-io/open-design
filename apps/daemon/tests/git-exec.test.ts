import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runGit } from '../src/git/exec.js';

// Integration test against a real git binary in a temp directory. `runGit`
// is the wrapper around `git`, so the value of the test is in confirming
// the actual binary's behavior (exit codes, stdout shape, error
// propagation) — not in mocking child_process.

function tmpRepoRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-git-exec-'));
}

function initEmptyDir(): string {
  return tmpRepoRoot();
}

function initRepoWithOneCommit(): string {
  const dir = tmpRepoRoot();
  // Use init.defaultBranch=main + per-repo user.email/name so the test
  // doesn't rely on the developer's global git config.
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('runGit', () => {
  const cleanup: string[] = [];

  beforeEach(() => {
    cleanup.length = 0;
  });

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns stdout for a successful command in a real repo', async () => {
    const dir = initRepoWithOneCommit();
    cleanup.push(dir);

    const out = await runGit(dir, ['rev-parse', '--is-inside-work-tree'], undefined);
    expect(out.trim()).toBe('true');
  });

  it('returns the current branch via "branch --show-current"', async () => {
    const dir = initRepoWithOneCommit();
    cleanup.push(dir);

    const out = await runGit(dir, ['branch', '--show-current'], undefined);
    expect(out.trim()).toBe('main');
  });

  it('returns empty string when run in a non-repo directory (exit 128)', async () => {
    const dir = initEmptyDir();
    cleanup.push(dir);

    const out = await runGit(dir, ['rev-parse', '--is-inside-work-tree'], undefined);
    expect(out).toBe('');
  });

  it('throws with stderr text for non-128 errors (e.g., unknown subcommand)', async () => {
    const dir = initRepoWithOneCommit();
    cleanup.push(dir);

    // `git -c <bad>` triggers a non-128 usage error.
    await expect(runGit(dir, ['--not-a-real-flag'], undefined)).rejects.toThrow();
  });

  it('honors an abort signal', async () => {
    const dir = initRepoWithOneCommit();
    cleanup.push(dir);
    const controller = new AbortController();
    controller.abort();

    await expect(runGit(dir, ['status'], controller.signal)).rejects.toThrow();
  });
});
