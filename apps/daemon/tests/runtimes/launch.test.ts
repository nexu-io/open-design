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
  resolveAgentLaunch,
  rmSync,
  tmpdir,
  withEnvSnapshot,
  writeFileSync,
} from './helpers/test-helpers.js';

const fsTest = process.platform === 'win32' ? test.skip : test;

test('applyAgentLaunchEnv prepends the selected executable dirname and dedupes PATH', () => {
  const launch = {
    childPathPrepend: ['/opt/tools/bin', '/opt/tools/bin'],
  };

  const env = applyAgentLaunchEnv(
    { PATH: ['/usr/bin', '/opt/tools/bin', '/bin', '/usr/bin'].join(delimiter) },
    launch,
  );

  assert.equal(env.PATH, ['/opt/tools/bin', '/usr/bin', '/bin'].join(delimiter));
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
