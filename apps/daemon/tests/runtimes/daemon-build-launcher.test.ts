import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function buildFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'od-daemon-build-'));
  fixtures.push(root);
  for (const directory of [
    'apps/daemon/scripts',
    'apps/daemon/src/runtimes',
    'packages/platform/src',
    'node_modules/typescript/bin',
  ]) mkdirSync(path.join(root, directory), { recursive: true });
  for (const source of ['apps/daemon/scripts/build.ts', 'packages/platform/src/command.ts']) {
    copyFileSync(path.join(repoRoot, source), path.join(root, source));
  }
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  // Avoid compiling the workspace: the regression is the real build entrypoint's
  // child-process launch, before TypeScript or source-receipt generation begins.
  writeFileSync(path.join(root, 'node_modules/typescript/bin/tsc'), 'console.log("compiler-reached");');
  writeFileSync(path.join(root, 'apps/daemon/src/runtimes/execution-source-receipt.ts'), [
    'export function cleanSourceIdentity() { return null; }',
    'export function writeSourceBuildReceipt() { console.log("receipt-reached"); }',
  ].join('\n'));
  return root;
}

function runBuild(root: string, npmExecPath: string) {
  return spawnSync(process.execPath, ['--experimental-strip-types', 'apps/daemon/scripts/build.ts'], {
    cwd: root,
    env: { ...process.env, npm_execpath: npmExecPath },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('daemon build package-manager launcher', () => {
  it('re-enters a JavaScript package manager using the active Node runtime', () => {
    const root = buildFixture();
    const manager = path.join(root, 'pnpm.cjs');
    writeFileSync(manager, 'console.log(process.argv.slice(2).join(" "));');
    const result = runBuild(root, manager);
    expect(result.status, result.stderr.slice(-2_000)).toBe(0);
    expect(result.stdout).toContain('--filter @open-design/daemon^... --workspace-concurrency=4 --if-present run build');
    expect(result.stdout).toContain('compiler-reached');
    expect(result.stdout).toContain('receipt-reached');
  });

  it.skipIf(process.platform === 'win32')('executes a native package manager directly, as pnpm/action-setup requires', () => {
    const root = buildFixture();
    // echo is a native Mach-O/ELF executable, so passing it to Node reproduces
    // the CI failure without downloading pnpm or modifying developer installs.
    const result = runBuild(root, '/bin/echo');
    expect(result.status, result.stderr.slice(-2_000)).toBe(0);
    expect(result.stdout).toContain('--filter @open-design/daemon^... --workspace-concurrency=4 --if-present run build');
    expect(result.stdout).toContain('compiler-reached');
    expect(result.stdout).toContain('receipt-reached');
  });
});
