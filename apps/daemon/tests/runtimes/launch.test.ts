import { delimiter, join } from 'node:path';
import { realpathSync, symlinkSync } from 'node:fs';
import { test } from 'vitest';
import {
  applyAgentLaunchEnv,
  assert,
  chmodSync,
  codex,
  mkdirSync,
  mkdtempSync,
  minimalAgentDef,
  resolveAgentLaunch,
  rmSync,
  tmpdir,
  withEnvSnapshot,
  writeFileSync,
} from './helpers/test-helpers.js';

const fsTest = process.platform === 'win32' ? test.skip : test;
const winTest = process.platform === 'win32' ? test : test.skip;

test('applyAgentLaunchEnv prepends nodeBinDir and wrapper dir, deduping PATH', () => {
  const launch = {
    childPathPrepend: ['/opt/tools/bin', '/opt/tools/bin'],
  };

  const env = applyAgentLaunchEnv(
    { PATH: ['/usr/bin', '/opt/tools/bin', '/bin', '/usr/bin'].join(delimiter) },
    launch,
    '/node/bin',
  );

  assert.equal(
    env.PATH,
    ['/node/bin', '/opt/tools/bin', '/usr/bin', '/bin'].join(delimiter),
  );
});

test('applyAgentLaunchEnv updates the Path key in-place without creating a competing PATH key', () => {
  // On Windows, process.env spreads the search path under 'Path' (not 'PATH').
  // This test uses POSIX-compatible paths so it runs cross-platform and
  // exercises the key-casing fix across the full CI matrix.
  const base: NodeJS.ProcessEnv = {
    Path: ['/usr/local/bin', '/usr/bin'].join(delimiter),
  };
  const launch = { childPathPrepend: ['/opt/agent/bin'] };

  const env = applyAgentLaunchEnv(base, launch, '/opt/node/bin');

  // Original 'Path' key must be updated in-place.
  assert.ok('Path' in env, 'original Path key must be preserved');
  // No competing uppercase 'PATH' key may be created alongside it.
  assert.equal(env.PATH, undefined, 'no spurious uppercase PATH key must be created');

  const parts = (env.Path as string).split(delimiter);
  assert.equal(parts[0], '/opt/node/bin', 'Node dir must be first in Path');
  assert.equal(parts[1], '/opt/agent/bin', 'wrapper dir must follow Node dir');
  assert.ok(parts.includes('/usr/local/bin'), '/usr/local/bin must be retained');
  assert.ok(parts.includes('/usr/bin'), '/usr/bin must be retained');
});

winTest('applyAgentLaunchEnv injects Node binary dir and wrapper dir into a Windows env that has only Path and no nodejs entry', () => {
  // On Windows, GUI-launched daemons inherit process.env with 'Path' (not
  // 'PATH') and the nodejs install directory is often absent from the
  // search path (desktop shortcut / Electron launcher bypasses shell PATH).
  const windowsBase: NodeJS.ProcessEnv = {
    Path: 'C:\\Windows\\System32;C:\\Windows',
    TEMP: 'C:\\Users\\User\\AppData\\Local\\Temp',
  };
  const launch = { childPathPrepend: ['C:\\Users\\User\\AppData\\Roaming\\npm'] };

  const env = applyAgentLaunchEnv(windowsBase, launch, 'C:\\Program Files\\nodejs');

  // Original 'Path' key must be updated in-place — no competing 'PATH' key.
  assert.ok('Path' in env, 'original Path key must be preserved');
  assert.equal(env.PATH, undefined, 'no spurious uppercase PATH key must be created');

  // Windows PATH delimiter is ';'.
  const parts = (env.Path as string).split(';');

  // Node binary directory must come first.
  assert.equal(parts[0], 'C:\\Program Files\\nodejs', 'Node dir must be first in Path');
  // Agent wrapper directory must follow immediately after.
  assert.equal(parts[1], 'C:\\Users\\User\\AppData\\Roaming\\npm', 'wrapper dir must follow Node dir');
  // Original system entries must be fully preserved.
  assert.ok(parts.includes('C:\\Windows\\System32'), 'System32 must be retained');
  assert.ok(parts.includes('C:\\Windows'), 'Windows dir must be retained');
  // No empty entries from splitting.
  assert.ok(parts.every((p: string) => p.length > 0), 'no empty path entries allowed');
});

fsTest('resolveAgentLaunch selects nvm-installed codex under a minimal PATH and prepends its dirname', () => {
  const home = mkdtempSync(join(tmpdir(), 'od-launch-nvm-'));
  try {
    return withEnvSnapshot(['HOME', 'PATH', 'OD_AGENT_HOME'], () => {
      const binDir = join(home, '.nvm', 'versions', 'node', '24.11.0', 'bin');
      const codexBin = join(binDir, 'codex');
      mkdirSync(binDir, { recursive: true });
      writeFileSync(codexBin, '#!/bin/sh\nexit 0\n');
      chmodSync(codexBin, 0o755);
      process.env.HOME = home;
      process.env.PATH = '/usr/bin:/bin';
      process.env.OD_AGENT_HOME = home;

      const launch = resolveAgentLaunch(codex);

      assert.equal(launch.selectedPath, codexBin);
      assert.equal(launch.launchPath, codexBin);
      assert.deepEqual(launch.childPathPrepend, [binDir]);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

fsTest('resolveAgentLaunch uses packaged built-in Vela for AMR and prepends its dirname', () => {
  const root = mkdtempSync(join(tmpdir(), 'od-launch-amr-built-in-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT', 'VELA_OPENCODE_BIN'], () => {
      const resourceRoot = join(root, 'resources', 'open-design');
      const builtInDir = join(resourceRoot, 'bin');
      const builtInVela = join(builtInDir, 'vela');
      const companionTree = join(builtInDir, 'libexec', 'opencode');
      const companionExe = join(
        companionTree,
        process.platform === 'win32' ? 'opencode.exe' : 'opencode',
      );
      mkdirSync(builtInDir, { recursive: true });
      mkdirSync(companionTree, { recursive: true });
      writeFileSync(builtInVela, '#!/bin/sh\nexit 0\n');
      chmodSync(builtInVela, 0o755);
      // packagedVelaOpenCodeCompanionTree now verifies the inner opencode
      // executable, not just the directory — see #3148. Fixture must match.
      writeFileSync(companionExe, '#!/bin/sh\nexit 0\n');
      chmodSync(companionExe, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = join(root, 'empty-home');
      process.env.OD_RESOURCE_ROOT = resourceRoot;
      delete process.env.VELA_OPENCODE_BIN;

      const launch = resolveAgentLaunch(minimalAgentDef({ id: 'amr', bin: 'vela' }));

      assert.equal(launch.selectedPath, builtInVela);
      assert.equal(launch.launchPath, builtInVela);
      assert.equal(launch.launchKind, 'selected');
      assert.deepEqual(launch.childPathPrepend, [builtInDir]);
      assert.equal(launch.diagnostic, null);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

fsTest('resolveAgentLaunch resolves a Codex npm wrapper to the native packaged binary', () => {
  const root = mkdtempSync(join(tmpdir(), 'od-launch-codex-wrapper-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const wrapperPkgDir = join(root, 'node_modules', '@openai', 'codex');
      const wrapperRealPath = join(wrapperPkgDir, 'bin', 'codex.js');
      const wrapperLinkDir = join(root, 'node_modules', '.bin');
      const wrapperLinkPath = join(wrapperLinkDir, 'codex');
      const nativePkgDir = join(wrapperPkgDir, 'node_modules', '@openai', `codex-${process.platform}-${process.arch}`);
      const nativePathDir = join(nativePkgDir, 'vendor', codexNativeTargetTriple(), 'path');
      const nativeBin = join(nativePkgDir, 'vendor', codexNativeTargetTriple(), 'codex', 'codex');
      mkdirSync(join(wrapperPkgDir, 'bin'), { recursive: true });
      mkdirSync(wrapperLinkDir, { recursive: true });
      mkdirSync(join(nativePkgDir, 'vendor', codexNativeTargetTriple(), 'codex'), { recursive: true });
      mkdirSync(nativePathDir, { recursive: true });
      writeFileSync(wrapperRealPath, '#!/usr/bin/env node\nrequire("@openai/codex");\n');
      writeFileSync(nativeBin, '#!/bin/sh\nexit 0\n');
      chmodSync(wrapperRealPath, 0o755);
      chmodSync(nativeBin, 0o755);
      symlinkSync(wrapperRealPath, wrapperLinkPath);
      process.env.PATH = wrapperLinkDir;
      process.env.OD_AGENT_HOME = root;

      const launch = resolveAgentLaunch(codex);

      assert.equal(launch.selectedPath, wrapperLinkPath);
      assert.equal(launch.launchPath, realpathSync(nativeBin));
      assert.equal(launch.launchKind, 'codex-native');
      assert.deepEqual(launch.childPathPrepend, [wrapperLinkDir, realpathSync(nativePathDir)]);
      assert.equal(launch.diagnostic, null);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function codexNativeTargetTriple(): string {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'aarch64-unknown-linux-musl';
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-musl';
  if (process.platform === 'win32' && process.arch === 'arm64') return 'aarch64-pc-windows-msvc';
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  return `${process.platform}-${process.arch}`;
}

fsTest('resolveAgentLaunch preserves a direct native CODEX_BIN override as the selected launch path', () => {
  const root = mkdtempSync(join(tmpdir(), 'od-launch-codex-direct-native-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const nativeBin = join(root, 'codex-native');
      const pathCodex = join(root, 'codex');
      writeFileSync(nativeBin, '#!/bin/sh\nexit 0\n');
      writeFileSync(pathCodex, '#!/bin/sh\nexit 0\n');
      chmodSync(nativeBin, 0o755);
      chmodSync(pathCodex, 0o755);
      process.env.PATH = root;
      process.env.OD_AGENT_HOME = root;

      const launch = resolveAgentLaunch(codex, { CODEX_BIN: nativeBin });

      assert.equal(launch.configuredOverridePath, nativeBin);
      assert.equal(launch.pathResolvedPath, pathCodex);
      assert.equal(launch.selectedPath, nativeBin);
      assert.equal(launch.launchPath, nativeBin);
      assert.equal(launch.launchKind, 'selected');
      assert.deepEqual(launch.childPathPrepend, [root]);
      assert.equal(launch.diagnostic, null);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

fsTest('resolveAgentLaunch falls back to the Codex wrapper when the native package is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'od-launch-codex-fallback-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const wrapperPkgDir = join(root, 'node_modules', '@openai', 'codex');
      const wrapperRealPath = join(wrapperPkgDir, 'bin', 'codex.js');
      const wrapperLinkDir = join(root, 'node_modules', '.bin');
      const wrapperLinkPath = join(wrapperLinkDir, 'codex');
      mkdirSync(join(wrapperPkgDir, 'bin'), { recursive: true });
      mkdirSync(wrapperLinkDir, { recursive: true });
      writeFileSync(wrapperRealPath, '#!/usr/bin/env node\nrequire("@openai/codex");\n');
      chmodSync(wrapperRealPath, 0o755);
      symlinkSync(wrapperRealPath, wrapperLinkPath);
      process.env.PATH = wrapperLinkDir;
      process.env.OD_AGENT_HOME = root;

      const launch = resolveAgentLaunch(codex);

      assert.equal(launch.selectedPath, wrapperLinkPath);
      assert.equal(launch.launchPath, wrapperLinkPath);
      assert.equal(launch.launchKind, 'selected');
      assert.deepEqual(launch.childPathPrepend, [wrapperLinkDir]);
      assert.match(launch.diagnostic ?? '', /native binary/i);
      assert.match(launch.diagnostic ?? '', /CODEX_BIN/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
