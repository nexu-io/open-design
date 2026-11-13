import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: childProcessMocks.execFile,
    spawn: childProcessMocks.spawn,
  };
});

import { spawnAgentProcess } from '../../src/runtimes/agent-process.js';
import { execAgentFile } from '../../src/runtimes/invocation.js';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

function execOptions(): Record<string, unknown> {
  return childProcessMocks.execFile.mock.calls.at(-1)?.[2] ?? {};
}

function spawnOptions(): Record<string, unknown> {
  return childProcessMocks.spawn.mock.calls.at(-1)?.[2] ?? {};
}

describe('agent subprocess window policy', () => {
  beforeEach(() => {
    childProcessMocks.execFile.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, '', '');
      },
    );
    childProcessMocks.spawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { pid: number; unref: () => void };
      child.pid = 12345;
      child.unref = () => {};
      return child;
    });
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.clearAllMocks();
  });

  it('hides probe and chat subprocess windows on Windows', async () => {
    setPlatform('win32');

    await execAgentFile('agent.exe', ['--version'], {
      cwd: 'C:\\work',
      env: { PATH: 'C:\\tools' },
    });
    spawnAgentProcess({
      command: 'agent.exe',
      args: ['run'],
      cwd: 'C:\\work',
      env: { PATH: 'C:\\tools' },
      stdin: 'pipe',
      runDir: 'C:\\work\\runs\\run-1',
      runId: 'run-1',
    });

    expect(execOptions()).toMatchObject({
      cwd: 'C:\\work',
      env: { PATH: 'C:\\tools' },
      windowsHide: true,
    });
    expect(spawnOptions()).toMatchObject({
      cwd: 'C:\\work',
      env: { PATH: 'C:\\tools' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  });

  it.each(['linux', 'darwin'] as const)(
    'does not request hidden subprocess windows by default on %s',
    async (platform) => {
      setPlatform(platform);

      await execAgentFile('/usr/bin/agent', ['--version']);
      spawnAgentProcess({
        command: '/usr/bin/agent',
        args: ['run'],
        cwd: '/work',
        env: { PATH: '/tools' },
        stdin: 'pipe',
        runDir: '/work/runs/run-1',
        runId: 'run-1',
      });

      expect(execOptions().windowsHide).toBe(false);
      expect(spawnOptions().windowsHide).toBe(false);
    },
  );

  it('honors an explicit windowsHide override when provided', async () => {
    setPlatform('win32');

    await execAgentFile('agent.exe', ['--version'], { windowsHide: false });
    spawnAgentProcess({
      command: 'agent.exe',
      args: ['run'],
      cwd: 'C:\\work',
      env: { PATH: 'C:\\tools' },
      stdin: 'pipe',
      runDir: 'C:\\work\\runs\\run-1',
      runId: 'run-1',
      windowsHide: false,
    });

    expect(execOptions().windowsHide).toBe(false);
    expect(spawnOptions().windowsHide).toBe(false);
  });

  it('preserves Windows cmd shim quoting alongside the hidden-window policy', async () => {
    setPlatform('win32');

    await execAgentFile('C:\\Program Files\\agent.cmd', ['--version']);
    spawnAgentProcess({
      command: 'C:\\Program Files\\agent.cmd',
      args: ['run'],
      cwd: 'C:\\work',
      env: { PATH: 'C:\\tools' },
      stdin: 'pipe',
      runDir: 'C:\\work\\runs\\run-1',
      runId: 'run-1',
      windowsVerbatimArguments: true,
    });

    expect(execOptions()).toMatchObject({
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    expect(spawnOptions()).toMatchObject({
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
  });
});
