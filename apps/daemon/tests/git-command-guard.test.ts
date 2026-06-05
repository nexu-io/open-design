import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gitCommandBlockedReason,
  installGitCommandGuard,
  isGitCommandGuardEnabled,
} from '../src/git-command-guard.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('git command guard', () => {
  it('is opt-in through OD_GIT_COMMAND_GUARD', () => {
    expect(isGitCommandGuardEnabled({ OD_GIT_COMMAND_GUARD: undefined })).toBe(false);
    expect(isGitCommandGuardEnabled({ OD_GIT_COMMAND_GUARD: '0' })).toBe(false);
    expect(isGitCommandGuardEnabled({ OD_GIT_COMMAND_GUARD: '1' })).toBe(true);
  });

  it('classifies destructive git invocations', () => {
    const checkoutDisambiguation = {
      checkoutPathExists: (arg: string) => arg === 'src/file.ts',
      checkoutRefExists: (arg: string) => arg === 'feature/foo' || arg === 'main',
    };
    expect(gitCommandBlockedReason(['status'])).toBeNull();
    expect(gitCommandBlockedReason(['-C', '/repo', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['--exec-path', '/tmp/git-core', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['--exec-path', '/tmp/git-core', 'reset', '--hard'])).toContain(
      'reset --hard',
    );
    expect(gitCommandBlockedReason(['--git-dir', '/tmp/repo/.git', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['--git-dir', '/tmp/repo/.git', 'reset', '--hard'])).toContain(
      'reset --hard',
    );
    expect(gitCommandBlockedReason(['reset', '--hard'])).toContain('reset --hard');
    expect(gitCommandBlockedReason(['clean', '-fdx'])).toContain('clean');
    expect(gitCommandBlockedReason(['clean', '-df'])).toContain('clean');
    expect(gitCommandBlockedReason(['-c', 'clean.requireForce=false', 'clean', '-d'])).toContain('clean');
    expect(gitCommandBlockedReason(['clean', '-nd'])).toBeNull();
    expect(gitCommandBlockedReason(['clean', '-n', '-d'])).toBeNull();
    expect(gitCommandBlockedReason(['clean', '--dry-run', '-fdx'])).toBeNull();
    expect(gitCommandBlockedReason(['stash', 'drop'])).toContain('stash');
    expect(gitCommandBlockedReason(['push', 'origin', 'HEAD:main'])).toBeNull();
    expect(gitCommandBlockedReason(['push', 'origin', '+HEAD:main'])).toContain('push');
    expect(gitCommandBlockedReason(['push', '--force-with-lease=origin/main'])).toContain('push');
    expect(gitCommandBlockedReason(['checkout', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', 'feature/foo'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', 'feature/foo'], checkoutDisambiguation)).toBeNull();
    expect(gitCommandBlockedReason(['checkout', 'src/file.ts'], checkoutDisambiguation)).toContain(
      'checkout',
    );
    expect(gitCommandBlockedReason(['checkout', '-b', 'feature', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', '--force', 'main'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '.'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', './src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', 'HEAD', 'src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '--', 'src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', 'HEAD', '--', 'src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['restore', '.'])).toContain('restore');
  });

  it('installs a PATH shim that delegates safe commands and blocks destructive commands', () => {
    if (process.platform === 'win32') return;
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-real-'));
    tempDirs.push(binDir);
    const realGit = path.join(binDir, 'git');
    fs.writeFileSync(
      realGit,
      `#!/bin/sh
if [ "$1" = "rev-parse" ]; then
  ref=""
  for arg in "$@"; do ref="$arg"; done
  case "$ref" in
    main^{commit}|feature/foo^{commit}|HEAD^{commit}) exit 0 ;;
    *) exit 1 ;;
  esac
fi
if [ "$1" = "ls-files" ]; then
  target=""
  for arg in "$@"; do target="$arg"; done
  case "$target" in
    src/file.ts) exit 0 ;;
    *) exit 1 ;;
  esac
fi
printf "real git: %s\\n" "$*"
`,
      { mode: 0o755 },
    );

    const install = installGitCommandGuard({
      OD_GIT_COMMAND_GUARD: '1',
      PATH: binDir,
    });
    tempDirs.push(install.guardDir!);

    const safe = spawnSync('git', ['status'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(safe.status).toBe(0);
    expect(safe.stdout).toContain('real git: status');

    const safeCheckout = spawnSync('git', ['checkout', 'main'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(safeCheckout.status).toBe(0);
    expect(safeCheckout.stdout).toContain('real git: checkout main');

    const safeCheckoutSlashBranch = spawnSync('git', ['checkout', 'feature/foo'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(safeCheckoutSlashBranch.status).toBe(0);
    expect(safeCheckoutSlashBranch.stdout).toContain('real git: checkout feature/foo');

    const safeCheckoutBranch = spawnSync('git', ['checkout', '-b', 'feature', 'main'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(safeCheckoutBranch.status).toBe(0);
    expect(safeCheckoutBranch.stdout).toContain('real git: checkout -b feature main');

    const safeCleanDryRun = spawnSync('git', ['clean', '-nd'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(safeCleanDryRun.status).toBe(0);
    expect(safeCleanDryRun.stdout).toContain('real git: clean -nd');

    const safeCleanLongDryRun = spawnSync('git', ['clean', '--dry-run', '-fdx'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(safeCleanLongDryRun.status).toBe(0);
    expect(safeCleanLongDryRun.stdout).toContain('real git: clean --dry-run -fdx');

    const destructive = spawnSync('git', ['reset', '--hard'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructive.status).toBe(126);
    expect(destructive.stderr).toContain('git command guard blocked');

    const destructiveWithGlobalOption = spawnSync('git', ['--git-dir', '/tmp/repo/.git', 'reset', '--hard'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveWithGlobalOption.status).toBe(126);
    expect(destructiveWithGlobalOption.stderr).toContain('git command guard blocked');

    const destructiveWithExecPath = spawnSync('git', ['--exec-path', '/tmp/git-core', 'reset', '--hard'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveWithExecPath.status).toBe(126);
    expect(destructiveWithExecPath.stderr).toContain('git command guard blocked');

    const destructiveCleanGroup = spawnSync('git', ['clean', '-fdx'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCleanGroup.status).toBe(126);
    expect(destructiveCleanGroup.stderr).toContain('git command guard blocked');

    const destructiveCleanDirectory = spawnSync('git', ['-c', 'clean.requireForce=false', 'clean', '-d'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCleanDirectory.status).toBe(126);
    expect(destructiveCleanDirectory.stderr).toContain('git command guard blocked');

    const destructivePushRefspec = spawnSync('git', ['push', 'origin', '+HEAD:main'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructivePushRefspec.status).toBe(126);
    expect(destructivePushRefspec.stderr).toContain('git command guard blocked');

    const destructiveCheckoutPath = spawnSync('git', ['checkout', '--', 'src/file.ts'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutPath.status).toBe(126);
    expect(destructiveCheckoutPath.stderr).toContain('git command guard blocked');

    const destructiveCheckoutDot = spawnSync('git', ['checkout', '.'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutDot.status).toBe(126);
    expect(destructiveCheckoutDot.stderr).toContain('git command guard blocked');

    const destructiveCheckoutRelativePath = spawnSync('git', ['checkout', './src/file.ts'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutRelativePath.status).toBe(126);
    expect(destructiveCheckoutRelativePath.stderr).toContain('git command guard blocked');

    const destructiveCheckoutTrackedPath = spawnSync('git', ['checkout', 'src/file.ts'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutTrackedPath.status).toBe(126);
    expect(destructiveCheckoutTrackedPath.stderr).toContain('git command guard blocked');

    const destructiveCheckoutHeadPath = spawnSync('git', ['checkout', 'HEAD', 'src/file.ts'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutHeadPath.status).toBe(126);
    expect(destructiveCheckoutHeadPath.stderr).toContain('git command guard blocked');
  });

  it('preserves a Path-only environment when installing the shim', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-real-'));
    tempDirs.push(binDir);
    const realGit = path.join(binDir, process.platform === 'win32' ? 'git.cmd' : 'git');
    fs.writeFileSync(realGit, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n', { mode: 0o755 });

    const install = installGitCommandGuard({
      OD_GIT_COMMAND_GUARD: '1',
      Path: binDir,
    });
    tempDirs.push(install.guardDir!);

    expect(install.realGit).toBe(realGit);
    expect(install.env.Path).toBe(`${install.guardDir}${path.delimiter}${binDir}`);
    expect(install.env.PATH).toBeUndefined();
  });
});
