import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';

import { spawnEnvForAgent } from '../../src/runtimes/env.js';
import { buildAmrMacKeychainLauncher, prepareAmrMacKeychainLauncher } from '../../src/runtimes/amr-macos-keychain.js';

// Keep named filesystem imports mockable for preparation-failure coverage.
vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
}));

const macTest = process.platform === 'darwin' ? test : test.skip;

macTest('AMR preserves native keychain lookup after Vela isolates the OpenCode home', (context) => {
  const host = spawnSync('/usr/bin/security', ['default-keychain', '-d', 'user'], {
    encoding: 'utf8',
  });
  if (host.status !== 0) {
    context.skip('Requires a macOS user with an existing default keychain');
    return;
  }
  const root = mkdtempSync(path.join(tmpdir(), 'od-amr-native-keychain-'));
  try {
    const resourceRoot = path.join(root, 'resources');
    const companion = path.join(resourceRoot, 'bin', 'libexec', 'opencode', 'opencode');
    mkdirSync(path.dirname(companion), { recursive: true });
    writeFileSync(companion, '#!/bin/sh\nexec /usr/bin/security "$@"\n', { mode: 0o700 });
    const amrHome = path.join(root, 'amr');
    const sessionHome = path.join(amrHome, 'opencode-sessions', 'conversation');
    mkdirSync(sessionHome, { recursive: true });
    const env = spawnEnvForAgent('amr', {
      HOME: homedir(), PATH: '/usr/bin:/bin',
      OD_DATA_DIR: path.join(root, 'data'), OD_RESOURCE_ROOT: resourceRoot,
      AMR_HOME: amrHome,
    }, {}, {});
    // Vela changes HOME after the daemon's environment has been constructed.
    const isolatedEnv = { ...env, HOME: sessionHome };
    const before = spawnSync('/usr/bin/security', ['default-keychain', '-d', 'user'], {
      env: isolatedEnv, encoding: 'utf8',
    });
    expect(before.status).not.toBe(0);
    const after = spawnSync(env.VELA_OPENCODE_BIN!, ['default-keychain', '-d', 'user'], {
      env: isolatedEnv, encoding: 'utf8',
    });
    expect(after.stderr).toBe('');
    expect(after.status).toBe(0);
    expect(after.stdout.trim()).toBe(host.stdout.trim());
    expect(isolatedEnv.HOME).toBe(sessionHome);
    const sandbox = spawnEnvForAgent('amr', {
      HOME: homedir(), PATH: '/usr/bin:/bin', OD_SANDBOX_MODE: '1',
      OD_DATA_DIR: path.join(root, 'sandbox-data'), OD_RESOURCE_ROOT: resourceRoot,
    }, {}, {});
    expect(sandbox.VELA_OPENCODE_BIN).toBe(companion);
    expect(existsSync(path.join(root, 'sandbox-data', 'amr', 'launchers'))).toBe(false);
    const configured = spawnEnvForAgent('amr', {
      HOME: homedir(), OD_DATA_DIR: path.join(root, 'data'),
    }, { VELA_OPENCODE_BIN: companion }, {});
    expect(configured.VELA_OPENCODE_BIN).toBe(companion);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const shellTest = process.platform === 'win32' ? test.skip : test;

function withLauncherFixture(run: (fixture: {
  root: string; launcher: string; sessionHome: string; calls: string;
  env: NodeJS.ProcessEnv; preferences: string;
}) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), 'od-amr-keychain-shell-'));
  try {
    const tools = path.join(root, "Mac's tools");
    mkdirSync(tools);
    const securityBin = path.join(tools, 'security');
    writeFileSync(securityBin, `#!/bin/sh
printf '%s\\n' "$*" >> "$KEYCHAIN_TEST_CALLS"
if [ "$1" = default-keychain ] && [ "$4" != -s ]; then
  [ "\${KEYCHAIN_TEST_HAS_DEFAULT:-}" = 1 ] || [ -f "$HOME/Library/Preferences/com.apple.security.plist" ]
elif [ "$1" = default-keychain ]; then
  [ "\${KEYCHAIN_TEST_FAIL:-}" != 1 ] || exit 1
  printf '%s\\n' "$5" > "$HOME/Library/Preferences/com.apple.security.plist"
fi
`, { mode: 0o700 });
    const companion = path.join(tools, 'opencode');
    writeFileSync(companion, '#!/bin/sh\nprintf "%s\\n" "$HOME" "$XDG_CONFIG_HOME" "$@"\nexit 7\n', { mode: 0o700 });
    const sessionRoot = path.join(root, 'amr', 'opencode-sessions');
    const sessionHome = path.join(sessionRoot, "conversation's home");
    mkdirSync(sessionHome, { recursive: true });
    const launcher = path.join(root, 'launcher');
    writeFileSync(launcher, buildAmrMacKeychainLauncher({
      opencodeBin: companion, keychainPath: "/Users/Example's Mac/Library/Keychains/login.keychain-db",
      sessionRoot, securityBin,
    }), { mode: 0o700 });
    const calls = path.join(root, 'calls');
    run({ root, launcher, sessionHome, calls,
      preferences: path.join(sessionHome, 'Library', 'Preferences', 'com.apple.security.plist'),
      env: { ...process.env, HOME: sessionHome, XDG_CONFIG_HOME: path.join(sessionHome, 'config'), KEYCHAIN_TEST_CALLS: calls },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

shellTest('launcher initializes a fresh home once and preserves argv, XDG roots and exit status', () => {
  withLauncherFixture((fixture) => {
    const args = ['--model', "it's quoted", '$(printf not-executed)'];
    const result = spawnSync(fixture.launcher, args, { env: fixture.env, encoding: 'utf8' });
    expect(result.status).toBe(7);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toEqual([
      fixture.sessionHome, fixture.env.XDG_CONFIG_HOME, ...args,
    ]);
    expect(readFileSync(fixture.preferences, 'utf8').trim()).toBe("/Users/Example's Mac/Library/Keychains/login.keychain-db");
    expect(statSync(path.dirname(fixture.preferences)).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(fixture.sessionHome, 'Library', 'Keychains')).mode & 0o777).toBe(0o700);
    const calls = readFileSync(fixture.calls, 'utf8');
    expect(calls.trim().split('\n')).toHaveLength(3);
    spawnSync(fixture.launcher, args, { env: fixture.env });
    expect(readFileSync(fixture.calls, 'utf8')).toBe(calls);
  });
});

shellTest('launcher preserves existing keychain preferences and an implicit valid default', () => {
  withLauncherFixture((fixture) => {
    mkdirSync(path.dirname(fixture.preferences), { recursive: true });
    writeFileSync(fixture.preferences, 'custom-keychain');
    spawnSync(fixture.launcher, [], { env: fixture.env });
    expect(readFileSync(fixture.preferences, 'utf8')).toBe('custom-keychain');
    expect(existsSync(fixture.calls)).toBe(false);
  });
  withLauncherFixture((fixture) => {
    spawnSync(fixture.launcher, [], { env: { ...fixture.env, KEYCHAIN_TEST_HAS_DEFAULT: '1' } });
    expect(existsSync(fixture.preferences)).toBe(false);
    expect(readFileSync(fixture.calls, 'utf8').trim()).toBe('default-keychain -d user');
  });
});

shellTest('launcher does not configure a HOME outside Vela session roots', () => {
  withLauncherFixture((fixture) => {
    const outside = path.join(fixture.root, 'amr', 'opencode-sessions-other', 'home');
    mkdirSync(outside, { recursive: true });
    const result = spawnSync(fixture.launcher, [], { env: { ...fixture.env, HOME: outside } });
    expect(result.status).toBe(7);
    expect(existsSync(fixture.calls)).toBe(false);
    expect(existsSync(path.join(outside, 'Library'))).toBe(false);
  });
});

shellTest('a keychain setup failure still executes the selected companion', () => {
  withLauncherFixture((fixture) => {
    const result = spawnSync(fixture.launcher, [], {
      env: { ...fixture.env, KEYCHAIN_TEST_FAIL: '1' }, encoding: 'utf8',
    });
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('could not initialize the AMR macOS keychain reference');
    expect(existsSync(fixture.preferences)).toBe(false);
  });
});

test('launcher preparation is scoped to macOS, a resolved data root and an existing host keychain', () => {
  const findDefaultKeychain = vi.fn(() => '/host/login.keychain-db');
  const env = { HOME: '/host', OD_DATA_DIR: '/data' };
  expect(prepareAmrMacKeychainLauncher(env, '/bin/opencode', {
    platform: 'linux', findDefaultKeychain,
  })).toBe('/bin/opencode');
  expect(prepareAmrMacKeychainLauncher({ HOME: '/host' }, '/bin/opencode', {
    platform: 'darwin', findDefaultKeychain,
  })).toBe('/bin/opencode');
  expect(findDefaultKeychain).not.toHaveBeenCalled();
  expect(prepareAmrMacKeychainLauncher(env, '/bin/opencode', {
    platform: 'darwin', findDefaultKeychain: () => null,
  })).toBe('/bin/opencode');
});

test('launcher preparation writes an executable under the supplied data root without mutating env', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'od-amr-keychain-prepare-'));
  try {
    const env = { HOME: '/host', OD_DATA_DIR: root, AMR_HOME: '~/custom-amr' };
    const options = { platform: 'darwin' as const, findDefaultKeychain: () => '/host/login.keychain-db' };
    const launcher = prepareAmrMacKeychainLauncher(env, '/bin/opencode', options);
    expect(launcher.startsWith(path.join(root, 'amr', 'launchers') + path.sep)).toBe(true);
    expect(statSync(launcher).mode & 0o777).toBe(0o700);
    expect(readFileSync(launcher, 'utf8')).toContain('/host/custom-amr/opencode-sessions/');
    expect(prepareAmrMacKeychainLauncher(env, '/bin/opencode', options)).toBe(launcher);
    expect(env).toEqual({ HOME: '/host', OD_DATA_DIR: root, AMR_HOME: '~/custom-amr' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.each([
  ['mkdirSync', 'EACCES'],
  ['writeFileSync', 'ENOSPC'],
  ['chmodSync', 'EPERM'],
] as const)('launcher preparation falls back to the selected companion when %s fails', (operation, code) => {
  const root = mkdtempSync(path.join(tmpdir(), 'od-amr-keychain-prepare-failure-'));
  const env = { HOME: '/host', OD_DATA_DIR: root, AMR_HOME: '~/custom-amr' };
  const failure = Object.assign(new Error(`${code}: launcher storage unavailable`), { code });
  const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fault = vi.spyOn(fs, operation).mockImplementationOnce(() => { throw failure; });
  try {
    expect(prepareAmrMacKeychainLauncher(env, '/selected/opencode', {
      platform: 'darwin', findDefaultKeychain: () => '/host/login.keychain-db',
    })).toBe('/selected/opencode');
    expect(fault).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      'OpenDesign: could not prepare the AMR macOS keychain launcher; using the selected companion:',
      failure.message,
    );
    expect(env).toEqual({ HOME: '/host', OD_DATA_DIR: root, AMR_HOME: '~/custom-amr' });
  } finally {
    fault.mockRestore();
    diagnostic.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
