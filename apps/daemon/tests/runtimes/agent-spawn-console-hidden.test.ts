// Daemon-spawned agent CLIs must never open a console window.
//
// A resolved agent CLI is a `.cmd` shim on Windows, so Node reaches the OS
// through cmd.exe — a console application. The daemon runs without a console of
// its own (it is started by the Electron shell), so a spawn that omits
// `windowsHide` creates one: the user sees a command-line window appear on
// every message, and a shorter flash for every probe a detection pass runs.
//
// Both spawn paths are pinned here, because both go through the same wrapper
// (`createCommandInvocation` maps a `.cmd` command onto `cmd.exe /d /s /c …`) —
// which is exactly why `windowsVerbatimArguments` is asserted alongside it: the
// same call carries both Windows behaviours and dropping either one is a
// regression the other cannot detect.
import os from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

type SpawnCall = { command: string; args: readonly string[]; options: Record<string, unknown> };

const spawnCalls: SpawnCall[] = [];
const execFileCalls: SpawnCall[] = [];

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (command: string, args: readonly string[], options: Record<string, unknown>) => {
      spawnCalls.push({ command, args, options });
      // A stand-in child. `spawnAgentProcess` records only real `ChildProcess`
      // instances for the startup reaper, so this one is never written down.
      return { pid: 4242, once() {}, on() {}, kill: () => true } as never;
    },
    execFile: (
      command: string,
      args: readonly string[],
      options: Record<string, unknown>,
      callback?: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      execFileCalls.push({ command, args, options });
      callback?.(null, '', '');
      return { pid: 4243 } as never;
    },
  };
});

const { spawnAgentProcess } = await import('../../src/runtimes/agent-process.js');
const { execAgentFile } = await import('../../src/runtimes/invocation.js');
const { withPlatform } = await import('./helpers/test-helpers.js');

const tempDirs: string[] = [];

afterEach(() => {
  spawnCalls.length = 0;
  execFileCalls.length = 0;
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'od-agent-console-'));
  tempDirs.push(dir);
  return dir;
}

describe('agent CLI spawns keep the console hidden', () => {
  it('hides the console of a chat-run agent process', () => {
    spawnAgentProcess({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', '"C:\\shims\\command-code.CMD" -p'],
      env: {},
      cwd: tempDir(),
      stdin: 'ignore',
      runDir: tempDir(),
      runId: 'run-console-hide',
      windowsVerbatimArguments: true,
    });

    expect(spawnCalls).toHaveLength(1);
    const options = spawnCalls[0]!.options;
    expect(options.windowsHide).toBe(true);
    expect(options.shell).toBe(false);
    expect(options.windowsVerbatimArguments).toBe(true);
  });

  it('hides the console of a CLI probe', async () => {
    // The probe path is the one that wraps a `.cmd` shim into cmd.exe itself,
    // so the assertion below runs under the platform that does the wrapping.
    await withPlatform('win32', () =>
      execAgentFile('C:\\shims\\command-code.CMD', ['--version']),
    );

    expect(execFileCalls).toHaveLength(1);
    const call = execFileCalls[0]!;
    expect(call.command.toLowerCase()).toContain('cmd.exe');
    expect(call.options.windowsHide).toBe(true);
    expect(call.options.windowsVerbatimArguments).toBe(true);
    // The SIGKILL decision probes depend on must survive the same options list.
    expect(call.options.killSignal).toBe('SIGKILL');
  });

  it('lets a probe caller override cwd without losing the hidden console', async () => {
    const cwd = tempDir();
    await execAgentFile('cmd.exe', ['--version'], { cwd });

    expect(execFileCalls[0]!.options.cwd).toBe(cwd);
    expect(execFileCalls[0]!.options.windowsHide).toBe(true);
  });
});
