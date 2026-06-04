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
    expect(gitCommandBlockedReason(['status'])).toBeNull();
    expect(gitCommandBlockedReason(['-C', '/repo', 'status'])).toBeNull();
    expect(gitCommandBlockedReason(['reset', '--hard'])).toContain('reset --hard');
    expect(gitCommandBlockedReason(['clean', '-fdx'])).toContain('clean');
    expect(gitCommandBlockedReason(['stash', 'drop'])).toContain('stash');
    expect(gitCommandBlockedReason(['push', '--force-with-lease=origin/main'])).toContain('push');
    expect(gitCommandBlockedReason(['checkout', '--force', 'main'])).toContain('checkout');
    expect(gitCommandBlockedReason(['restore', '.'])).toContain('restore');
  });

  it('installs a PATH shim that delegates safe commands and blocks destructive commands', () => {
    if (process.platform === 'win32') return;
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-real-'));
    tempDirs.push(binDir);
    const realGit = path.join(binDir, 'git');
    fs.writeFileSync(realGit, '#!/bin/sh\nprintf "real git: %s\\n" "$*"\n', { mode: 0o755 });

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

    const destructive = spawnSync('git', ['reset', '--hard'], {
      env: install.env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    expect(destructive.status).toBe(126);
    expect(destructive.stderr).toContain('git command guard blocked');
  });
});
