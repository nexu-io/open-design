import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCHER_SCHEMA_VERSION, resolveLauncherPaths, resolveLauncherVersionPaths } from '@open-design/launcher-proto';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cliSource = join(repoRoot, 'apps/daemon/src/cli.ts');
const tsxEntry = join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'od-cli-launcher-'));
  directories.push(root);
  const channel = 'beta';
  const namespace = 'launcher-cli';
  const version = '99.0.0-beta.2';
  const paths = resolveLauncherPaths({ channel, namespace, root });
  const payload = resolveLauncherVersionPaths({ channel, namespace, root, version });
  const relativeExecutable = process.platform === 'darwin'
    ? 'payload/Open Design Beta.app/Contents/MacOS/Open Design Beta'
    : 'payload/Open Design Beta.exe';
  const executablePath = join(payload.versionRoot, relativeExecutable);
  await mkdir(dirname(executablePath), { recursive: true });
  await mkdir(paths.stateRoot, { recursive: true });
  await writeFile(executablePath, 'launcher test fixture');
  await writeFile(payload.manifestPath, JSON.stringify({
    channel,
    entry: { cwd: 'payload', executable: relativeExecutable },
    namespace,
    payloadRoot: 'payload',
    platform: process.platform,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    version,
  }));
  await writeFile(paths.runtimePath, JSON.stringify({
    active: { generation: 2, version },
    channel,
    lastSuccessful: { generation: 2, version },
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  }));
  await symlink(payload.versionRoot, join(paths.namespaceRoot, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
  return { channel, executablePath: join(paths.namespaceRoot, 'current', relativeExecutable), namespace, paths, root, version };
}

async function runCli(args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:1' };
  delete env.NODE_OPTIONS;
  delete env.OD_INSTALLATION_DIR;
  delete env.OD_PACKAGED_CONFIG_PATH;
  delete env.OD_PACKAGED_NAMESPACE;
  delete env.OD_PACKAGED_NAMESPACE_BASE_ROOT;
  return await new Promise<{ code: number; stdout: string; stderr: string }>((done) => {
    execFile(process.execPath, [tsxEntry, cliSource, ...args], { cwd: repoRoot, env, timeout: 20_000 }, (error, stdout, stderr) => {
      done({ code: error == null ? 0 : typeof error.code === 'number' ? error.code : 1, stdout, stderr });
    });
  });
}

describe.skipIf(process.platform !== 'darwin' && process.platform !== 'win32')('packaged launcher CLI without a running daemon', () => {
  it('prints the active payload path through od path', async () => {
    const installed = await fixture();
    const result = await runCli(['path', '--root', installed.root, '--channel', installed.channel, '--namespace', installed.namespace, '--json']);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      channel: installed.channel,
      executablePath: installed.executablePath,
      namespace: installed.namespace,
      version: installed.version,
    });
  });

  it('od --version reports the selected app version and path, not the CLI package version', async () => {
    const installed = await fixture();
    const result = await runCli(['--version', '--root', installed.root, '--channel', installed.channel, '--namespace', installed.namespace, '--json']);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ executablePath: installed.executablePath, version: installed.version });
  });

  it.skipIf(process.platform !== 'win32')('resolves the Windows installed outer after an update without a current junction', async () => {
    const installed = await fixture();
    await rm(join(installed.paths.namespaceRoot, 'current'));
    const executablePath = join(installed.root, 'Installed', 'Open Design.exe');
    await mkdir(join(dirname(executablePath), 'resources'), { recursive: true });
    await writeFile(executablePath, 'installed launcher fixture');
    await writeFile(join(dirname(executablePath), 'resources', 'open-design-config.json'), JSON.stringify({ appVersion: '0.20.0-beta.1' }));
    await writeFile(installed.paths.installPath, JSON.stringify({ channel: installed.channel, namespace: installed.namespace, schemaVersion: LAUNCHER_SCHEMA_VERSION, launchPath: executablePath }));
    for (const command of ['path', '--version']) {
      const result = await runCli([command, '--root', installed.root, '--channel', installed.channel, '--namespace', installed.namespace, '--json']);
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ executablePath, version: installed.version, source: 'installed' });
    }
  });
});
