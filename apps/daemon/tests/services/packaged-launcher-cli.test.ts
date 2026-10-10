import { EventEmitter } from 'node:events';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LauncherLaunchError, type LauncherLaunchTarget } from '@open-design/launcher-proto';
import { openLauncherTarget, runPackagedLauncherCli } from '../../src/services/packaged-launcher-cli.js';

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => native);
afterEach(() => { vi.clearAllMocks(); });

const target: LauncherLaunchTarget = {
  channel: 'stable', executablePath: '/Applications/Open Design.app/Contents/MacOS/Open Design',
  generation: 2, launchPath: '/Applications/Open Design.app', namespace: 'release-stable',
  payloadExecutablePath: '/fixture/payload/Open Design.app/Contents/MacOS/Open Design',
  reason: 'active', root: '/fixture', source: 'canonical', version: '99.0.0',
};

function dependencies() {
  return {
    env: {}, platform: 'darwin' as const,
    resolveContext: vi.fn(async () => ({ channel: target.channel, namespace: target.namespace, root: target.root })),
    readTarget: vi.fn(async () => target),
    openTarget: vi.fn(async () => {}),
    stdout: vi.fn(), stderr: vi.fn(),
  };
}

describe('packaged launcher command formatting and opening', () => {
  it('opens the resolved stable entry without daemon discovery and emits structured identity', async () => {
    const deps = dependencies();
    expect(await runPackagedLauncherCli('open', ['--channel', 'beta', '--namespace=fixture', '--root', '/custom', '--config', '/packaged.json', '--json'], deps)).toBe(0);
    expect(deps.resolveContext).toHaveBeenCalledWith(expect.objectContaining({ channel: 'beta', namespace: 'fixture', root: '/custom', configPath: '/packaged.json' }));
    expect(deps.openTarget).toHaveBeenCalledWith(target, { env: {}, platform: 'darwin' });
    expect(JSON.parse(deps.stdout.mock.calls[0]![0])).toEqual({ ...target, opened: true });
    expect(deps.stderr).not.toHaveBeenCalled();
  });

  it('prints the path as one line so scripts can consume it directly', async () => {
    const deps = dependencies();
    expect(await runPackagedLauncherCli('path', [], deps)).toBe(0);
    expect(deps.stdout).toHaveBeenCalledWith(`${target.launchPath}\n`);
    expect(deps.openTarget).not.toHaveBeenCalled();
  });

  it('prints the selected packaged version together with its stable launch path', async () => {
    const deps = dependencies();
    expect(await runPackagedLauncherCli('--version', [], deps)).toBe(0);
    expect(deps.stdout).toHaveBeenCalledWith(`${target.version}\n${target.launchPath}\n`);
  });

  it.each([['--namespace', '--json'], ['--root'], ['--channel='], ['--json=true'], ['extra'], ['--root', '/one', '--root', '/two']])('rejects invalid flags before reading installation metadata: %j', async (...args) => {
    const deps = dependencies();
    expect(await runPackagedLauncherCli('path', args, deps)).toBe(2);
    expect(deps.resolveContext).not.toHaveBeenCalled();
    expect(deps.stderr).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable stable entries as structured errors and never starts another app', async () => {
    const deps = dependencies();
    deps.readTarget.mockRejectedValue(new LauncherLaunchError('launcher-stale-entry', 'No matching stable entry.'));
    expect(await runPackagedLauncherCli('open', ['--json'], deps)).toBe(1);
    expect(JSON.parse(deps.stderr.mock.calls[0]![0])).toEqual({ ok: false, error: { code: 'launcher-stale-entry', message: 'No matching stable entry.' } });
    expect(deps.openTarget).not.toHaveBeenCalled();
  });

  it('offers help without touching installation metadata', async () => {
    const deps = dependencies();
    expect(await runPackagedLauncherCli('path', ['--help'], deps)).toBe(0);
    expect(deps.resolveContext).not.toHaveBeenCalled();
    expect(deps.stdout).toHaveBeenCalledWith(expect.stringContaining('These commands work while the app and daemon are stopped.'));
  });
});

describe('native packaged launch requests', () => {
  it.each(['darwin', 'win32'] as const)('starts the exact stable executable on %s and removes inherited Node/sidecar identity', async (platform) => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    native.spawn.mockImplementation(() => { queueMicrotask(() => child.emit('spawn')); return child; });
    await openLauncherTarget(target, { platform, env: { ELECTRON_RUN_AS_NODE: '1', OD_PACKAGED_CONFIG_PATH: '/other-channel-config.json', OD_SIDECAR_APP: 'daemon', OD_SIDECAR_CHANNEL: 'beta', OD_SIDECAR_SUPERVISED_CONTEXT: '{}', OD_TOOLS_DEV_PARENT_PID: '123', PATH: '/bin' } });
    expect(native.spawn).toHaveBeenCalledWith(target.executablePath, [], {
      cwd: dirname(target.executablePath), detached: true, stdio: 'ignore', windowsHide: true,
      env: { OD_PACKAGED_NAMESPACE: target.namespace, OD_PACKAGED_NAMESPACE_BASE_ROOT: join(target.root, 'namespaces'), PATH: '/bin' },
    });
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('propagates an OS launch rejection', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    native.spawn.mockImplementation(() => { queueMicrotask(() => child.emit('error', new Error('open rejected'))); return child; });
    await expect(openLauncherTarget(target, { platform: 'darwin', env: {} })).rejects.toThrow('open rejected');
  });
});
