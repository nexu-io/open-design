import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowsDirtyImportedFolderWorkspace,
  gitCommandBlockedReason,
  gitCommandGuardBlockedMessagesFromText,
  inspectGitWorkspace,
  installGitCommandGuard,
  isImportedFolderWorkspaceSafetyEnabled,
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

  it('defaults imported-folder workspace safety on with explicit env opt-outs', () => {
    expect(isImportedFolderWorkspaceSafetyEnabled({})).toBe(true);
    expect(isImportedFolderWorkspaceSafetyEnabled({ OD_IMPORTED_FOLDER_WORKSPACE_SAFETY: '0' })).toBe(false);
    expect(isImportedFolderWorkspaceSafetyEnabled({ OD_IMPORTED_FOLDER_WORKSPACE_SAFETY: 'off' })).toBe(false);
    expect(allowsDirtyImportedFolderWorkspace({})).toBe(false);
    expect(allowsDirtyImportedFolderWorkspace({ OD_IMPORTED_FOLDER_ALLOW_DIRTY: '1' })).toBe(true);
  });

  it('parses blocked git guard stderr lines for run-event visibility', () => {
    expect(gitCommandGuardBlockedMessagesFromText('ordinary stderr')).toEqual([]);
    expect(gitCommandGuardBlockedMessagesFromText(
      'Open Design git command guard blocked: git checkout can discard workspace changes; command: git checkout\n',
    )).toEqual(['git checkout can discard workspace changes; command: git checkout']);
  });

  it('detects dirty Git workspaces before imported-folder launch', () => {
    if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) return;
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-dirty-'));
    tempDirs.push(repoDir);
    spawnSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(repoDir, 'index.html'), '<!doctype html>');

    const status = inspectGitWorkspace(repoDir);

    expect(status.state).toBe('dirty');
    if (status.state === 'dirty') {
      expect(status.totalEntries).toBeGreaterThan(0);
      expect(status.entries.join('\n')).toContain('index.html');
    }
  });

  it('classifies destructive git invocations', () => {
    const checkoutDisambiguation = {
      checkoutPathExists: (arg: string) => arg === 'src/file.ts',
      checkoutRefExists: (arg: string) => arg === 'feature/foo' || arg === 'main',
    };
    expect(gitCommandBlockedReason(['status'])).toBeNull();
    expect(gitCommandBlockedReason(['-C', '/repo', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['--config-env', 'core.filemode=F00', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['--config-env=core.filemode=F00', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['--config-env', 'core.filemode=F00', 'reset', '--hard'])).toContain(
      'reset --hard',
    );
    expect(gitCommandBlockedReason(['--config-env=core.filemode=F00', 'reset', '--hard'])).toContain(
      'reset --hard',
    );
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
    expect(gitCommandBlockedReason(['clean', '-i'])).toContain('clean');
    expect(gitCommandBlockedReason(['clean', '--interactive'])).toContain('clean');
    expect(gitCommandBlockedReason(['clean', '-nd'])).toBeNull();
    expect(gitCommandBlockedReason(['clean', '-n', '-d'])).toBeNull();
    expect(gitCommandBlockedReason(['clean', '-ni'])).toBeNull();
    expect(gitCommandBlockedReason(['clean', '--dry-run', '-fdx'])).toBeNull();
    expect(gitCommandBlockedReason(['clean', '--dry-run', '--interactive'])).toBeNull();
    expect(gitCommandBlockedReason(['stash', 'drop'])).toContain('stash');
    expect(gitCommandBlockedReason(['push', 'origin', 'HEAD:main'])).toBeNull();
    expect(gitCommandBlockedReason(['push', '-u', 'origin', 'HEAD:main'])).toBeNull();
    expect(gitCommandBlockedReason(['push', '-fu', 'origin', 'HEAD:main'])).toContain('push');
    expect(gitCommandBlockedReason(['push', 'origin', '+HEAD:main'])).toContain('push');
    expect(gitCommandBlockedReason(['push', '--force-with-lease=origin/main'])).toContain('push');
    expect(gitCommandBlockedReason(['checkout', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', 'feature/foo'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', 'feature/foo'], checkoutDisambiguation)).toBeNull();
    expect(gitCommandBlockedReason(['checkout', 'src/file.ts'], checkoutDisambiguation)).toContain(
      'checkout',
    );
    expect(gitCommandBlockedReason(['checkout', '-b', 'feature', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', '-B', 'feature'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '-B', 'feature', 'HEAD'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '-q', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['checkout', '--force', 'main'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '-qB', 'feature', 'HEAD'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '-fq', 'other'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '-p'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '--patch'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '--pathspec-from-file', 'paths.txt'])).toContain(
      'checkout',
    );
    expect(gitCommandBlockedReason(['checkout', '--pathspec-from-file=paths.txt'])).toContain(
      'checkout',
    );
    expect(gitCommandBlockedReason(['checkout', '.'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', './src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', 'HEAD', 'src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', '--', 'src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['checkout', 'HEAD', '--', 'src/file.ts'])).toContain('checkout');
    expect(gitCommandBlockedReason(['switch', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['switch', '-c', 'temp', 'main'])).toBeNull();
    expect(gitCommandBlockedReason(['switch', '-C', 'temp', 'HEAD'])).toContain('switch');
    expect(gitCommandBlockedReason(['switch', '-f', 'other'])).toContain('switch');
    expect(gitCommandBlockedReason(['switch', '-fC', 'temp', 'other'])).toContain('switch');
    expect(gitCommandBlockedReason(['switch', '-qC', 'temp', 'HEAD'])).toContain('switch');
    expect(gitCommandBlockedReason(['switch', '--force', 'other'])).toContain('switch');
    expect(gitCommandBlockedReason(['switch', '--discard-changes', 'other'])).toContain('switch');
    expect(gitCommandBlockedReason(['restore', '.'])).toContain('restore');
  });

  it('uses Git context options when disambiguating checkout operands', () => {
    if (process.platform === 'win32') return;
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-real-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-repo-'));
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-other-'));
    const trackedRoot = fs.realpathSync(repoDir);
    tempDirs.push(binDir, repoDir, otherDir);
    const realGit = path.join(binDir, 'git');
    fs.writeFileSync(realGit, fakeGitScript(), { mode: 0o755 });

    expect(
      gitCommandBlockedReason(['-C', repoDir, 'checkout', 'src/file.ts'], {
        cwd: otherDir,
        env: {
          OD_FAKE_TRACKED_ROOT: trackedRoot,
        },
        realGit,
      }),
    ).toContain('checkout');
  });

  it('installs a PATH shim that delegates safe commands and blocks destructive commands', () => {
    if (process.platform === 'win32') return;
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-real-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-repo-'));
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-other-'));
    const trackedRoot = fs.realpathSync(repoDir);
    tempDirs.push(binDir);
    tempDirs.push(repoDir, otherDir);
    const realGit = path.join(binDir, 'git');
    fs.writeFileSync(realGit, fakeGitScript(), { mode: 0o755 });

    const install = installGitCommandGuard({
      OD_GIT_COMMAND_GUARD: '1',
      PATH: binDir,
    });
    tempDirs.push(install.guardDir!);
    const guardEnv = {
      ...(install.env as NodeJS.ProcessEnv),
      OD_FAKE_TRACKED_ROOT: trackedRoot,
    };

    const safe = spawnSync('git', ['status'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safe.status).toBe(0);
    expect(safe.stdout).toContain('real git: status');

    const safeCheckout = spawnSync('git', ['checkout', 'main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCheckout.status).toBe(0);
    expect(safeCheckout.stdout).toContain('real git: checkout main');

    const safeCheckoutSlashBranch = spawnSync('git', ['checkout', 'feature/foo'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCheckoutSlashBranch.status).toBe(0);
    expect(safeCheckoutSlashBranch.stdout).toContain('real git: checkout feature/foo');

    const safeCheckoutBranch = spawnSync('git', ['checkout', '-b', 'feature', 'main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCheckoutBranch.status).toBe(0);
    expect(safeCheckoutBranch.stdout).toContain('real git: checkout -b feature main');

    const safeCheckoutQuiet = spawnSync('git', ['checkout', '-q', 'main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCheckoutQuiet.status).toBe(0);
    expect(safeCheckoutQuiet.stdout).toContain('real git: checkout -q main');

    const safeSwitch = spawnSync('git', ['switch', 'main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeSwitch.status).toBe(0);
    expect(safeSwitch.stdout).toContain('real git: switch main');

    const safeSwitchCreate = spawnSync('git', ['switch', '-c', 'temp', 'main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeSwitchCreate.status).toBe(0);
    expect(safeSwitchCreate.stdout).toContain('real git: switch -c temp main');

    const safeCleanDryRun = spawnSync('git', ['clean', '-nd'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCleanDryRun.status).toBe(0);
    expect(safeCleanDryRun.stdout).toContain('real git: clean -nd');

    const safeCleanLongDryRun = spawnSync('git', ['clean', '--dry-run', '-fdx'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCleanLongDryRun.status).toBe(0);
    expect(safeCleanLongDryRun.stdout).toContain('real git: clean --dry-run -fdx');

    const safeCleanInteractiveDryRun = spawnSync('git', ['clean', '-ni'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCleanInteractiveDryRun.status).toBe(0);
    expect(safeCleanInteractiveDryRun.stdout).toContain('real git: clean -ni');

    const safeCleanLongInteractiveDryRun = spawnSync('git', ['clean', '--dry-run', '--interactive'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safeCleanLongInteractiveDryRun.status).toBe(0);
    expect(safeCleanLongInteractiveDryRun.stdout).toContain('real git: clean --dry-run --interactive');

    const destructive = spawnSync('git', ['reset', '--hard'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructive.status).toBe(126);
    expect(destructive.stderr).toContain('git command guard blocked');
    expect(destructive.stderr).toContain('command: git reset');

    const destructiveWithGlobalOption = spawnSync('git', ['--git-dir', '/tmp/repo/.git', 'reset', '--hard'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveWithGlobalOption.status).toBe(126);
    expect(destructiveWithGlobalOption.stderr).toContain('git command guard blocked');

    const destructiveWithExecPath = spawnSync('git', ['--exec-path', '/tmp/git-core', 'reset', '--hard'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveWithExecPath.status).toBe(126);
    expect(destructiveWithExecPath.stderr).toContain('git command guard blocked');

    const destructiveWithConfigEnv = spawnSync('git', ['--config-env', 'core.filemode=F00', 'reset', '--hard'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveWithConfigEnv.status).toBe(126);
    expect(destructiveWithConfigEnv.stderr).toContain('git command guard blocked');

    const destructiveWithInlineConfigEnv = spawnSync('git', ['--config-env=core.filemode=F00', 'reset', '--hard'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveWithInlineConfigEnv.status).toBe(126);
    expect(destructiveWithInlineConfigEnv.stderr).toContain('git command guard blocked');

    const destructiveCleanGroup = spawnSync('git', ['clean', '-fdx'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCleanGroup.status).toBe(126);
    expect(destructiveCleanGroup.stderr).toContain('git command guard blocked');

    const destructiveCleanDirectory = spawnSync('git', ['-c', 'clean.requireForce=false', 'clean', '-d'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCleanDirectory.status).toBe(126);
    expect(destructiveCleanDirectory.stderr).toContain('git command guard blocked');

    const destructiveCleanInteractive = spawnSync('git', ['clean', '-i'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCleanInteractive.status).toBe(126);
    expect(destructiveCleanInteractive.stderr).toContain('git command guard blocked');

    const destructiveCleanLongInteractive = spawnSync('git', ['clean', '--interactive'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCleanLongInteractive.status).toBe(126);
    expect(destructiveCleanLongInteractive.stderr).toContain('git command guard blocked');

    const safePushUpstream = spawnSync('git', ['push', '-u', 'origin', 'HEAD:main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(safePushUpstream.status).toBe(0);
    expect(safePushUpstream.stdout).toContain('real git: push -u origin HEAD:main');

    const destructivePushBundledForce = spawnSync('git', ['push', '-fu', 'origin', 'HEAD:main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructivePushBundledForce.status).toBe(126);
    expect(destructivePushBundledForce.stderr).toContain('git command guard blocked');

    const destructivePushRefspec = spawnSync('git', ['push', 'origin', '+HEAD:main'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructivePushRefspec.status).toBe(126);
    expect(destructivePushRefspec.stderr).toContain('git command guard blocked');

    const destructiveCheckoutPath = spawnSync('git', ['checkout', '--', 'src/file.ts'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutPath.status).toBe(126);
    expect(destructiveCheckoutPath.stderr).toContain('git command guard blocked');

    const destructiveCheckoutDot = spawnSync('git', ['checkout', '.'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutDot.status).toBe(126);
    expect(destructiveCheckoutDot.stderr).toContain('git command guard blocked');

    const destructiveCheckoutRelativePath = spawnSync('git', ['checkout', './src/file.ts'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutRelativePath.status).toBe(126);
    expect(destructiveCheckoutRelativePath.stderr).toContain('git command guard blocked');

    const destructiveCheckoutTrackedPath = spawnSync('git', ['checkout', 'src/file.ts'], {
      cwd: repoDir,
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutTrackedPath.status).toBe(126);
    expect(destructiveCheckoutTrackedPath.stderr).toContain('git command guard blocked');

    const destructiveCheckoutWithContext = spawnSync('git', ['-C', repoDir, 'checkout', 'src/file.ts'], {
      cwd: otherDir,
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutWithContext.status).toBe(126);
    expect(destructiveCheckoutWithContext.stderr).toContain('git command guard blocked');

    const destructiveCheckoutPathspecFile = spawnSync('git', ['checkout', '--pathspec-from-file', 'paths.txt'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutPathspecFile.status).toBe(126);
    expect(destructiveCheckoutPathspecFile.stderr).toContain('git command guard blocked');

    const destructiveCheckoutInlinePathspecFile = spawnSync(
      'git',
      ['checkout', '--pathspec-from-file=paths.txt'],
      {
        env: guardEnv,
        encoding: 'utf8',
      },
    );
    expect(destructiveCheckoutInlinePathspecFile.status).toBe(126);
    expect(destructiveCheckoutInlinePathspecFile.stderr).toContain('git command guard blocked');

    const destructiveCheckoutPatch = spawnSync('git', ['checkout', '-p'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutPatch.status).toBe(126);
    expect(destructiveCheckoutPatch.stderr).toContain('git command guard blocked');

    const destructiveCheckoutLongPatch = spawnSync('git', ['checkout', '--patch'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutLongPatch.status).toBe(126);
    expect(destructiveCheckoutLongPatch.stderr).toContain('git command guard blocked');

    const destructiveCheckoutBundledForce = spawnSync('git', ['checkout', '-fq', 'other'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutBundledForce.status).toBe(126);
    expect(destructiveCheckoutBundledForce.stderr).toContain('git command guard blocked');

    const destructiveCheckoutResetBranch = spawnSync('git', ['checkout', '-B', 'feature', 'HEAD'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutResetBranch.status).toBe(126);
    expect(destructiveCheckoutResetBranch.stderr).toContain('git command guard blocked');

    const destructiveCheckoutBundledResetBranch = spawnSync(
      'git',
      ['checkout', '-qB', 'feature', 'HEAD'],
      {
        env: guardEnv,
        encoding: 'utf8',
      },
    );
    expect(destructiveCheckoutBundledResetBranch.status).toBe(126);
    expect(destructiveCheckoutBundledResetBranch.stderr).toContain('git command guard blocked');

    const destructiveCheckoutResetBranchFromHead = spawnSync('git', ['checkout', '-B', 'feature'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutResetBranchFromHead.status).toBe(126);
    expect(destructiveCheckoutResetBranchFromHead.stderr).toContain('git command guard blocked');

    const destructiveCheckoutHeadPath = spawnSync('git', ['checkout', 'HEAD', 'src/file.ts'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveCheckoutHeadPath.status).toBe(126);
    expect(destructiveCheckoutHeadPath.stderr).toContain('git command guard blocked');

    const destructiveSwitchForce = spawnSync('git', ['switch', '-f', 'other'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveSwitchForce.status).toBe(126);
    expect(destructiveSwitchForce.stderr).toContain('git command guard blocked');

    const destructiveSwitchBundledForce = spawnSync('git', ['switch', '-fC', 'temp', 'other'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveSwitchBundledForce.status).toBe(126);
    expect(destructiveSwitchBundledForce.stderr).toContain('git command guard blocked');

    const destructiveSwitchResetBranch = spawnSync('git', ['switch', '-C', 'temp', 'HEAD'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveSwitchResetBranch.status).toBe(126);
    expect(destructiveSwitchResetBranch.stderr).toContain('git command guard blocked');

    const destructiveSwitchBundledResetBranch = spawnSync('git', ['switch', '-qC', 'temp', 'HEAD'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveSwitchBundledResetBranch.status).toBe(126);
    expect(destructiveSwitchBundledResetBranch.stderr).toContain('git command guard blocked');

    const destructiveSwitchLongForce = spawnSync('git', ['switch', '--force', 'other'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveSwitchLongForce.status).toBe(126);
    expect(destructiveSwitchLongForce.stderr).toContain('git command guard blocked');

    const destructiveSwitchDiscardChanges = spawnSync('git', ['switch', '--discard-changes', 'other'], {
      env: guardEnv,
      encoding: 'utf8',
    });
    expect(destructiveSwitchDiscardChanges.status).toBe(126);
    expect(destructiveSwitchDiscardChanges.stderr).toContain('git command guard blocked');
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

function fakeGitScript(): string {
  return `#!/bin/sh
if [ "$1" = "-C" ]; then
  cd "$2" 2>/dev/null || exit 1
  shift 2
fi
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
    src/file.ts)
      [ "$(pwd -P)" = "$OD_FAKE_TRACKED_ROOT" ] && exit 0
      exit 1
      ;;
    *) exit 1 ;;
  esac
fi
printf "real git: %s\\n" "$*"
`;
}
