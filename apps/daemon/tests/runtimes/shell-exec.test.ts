import { describe, expect, it } from 'vitest';
import { createShellCommandRunner } from '../../src/runtimes/shell-exec.js';

describe('createShellCommandRunner', () => {
  it('uses the configured login shell for GitHub commands on POSIX', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const runner = createShellCommandRunner({
      platform: 'linux',
      env: { SHELL: '/bin/bash', PATH: '/bin' },
      execFileBuffered: async (command, args) => {
        calls.push({ command, args });
        return { ok: true, stdout: '', stderr: '' };
      },
    });

    await runner.execGhBuffered(['auth', 'status']);

    expect(calls[0]?.command).toBe('/bin/bash');
    expect(calls[0]?.args[0]).toBe('-c');
    expect(calls[0]?.args[1]).toContain('gh');
  });

  it('bypasses shell construction on Windows', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const runner = createShellCommandRunner({
      platform: 'win32',
      execFileBuffered: async (command, args) => {
        calls.push({ command, args });
        return { ok: true, stdout: '', stderr: '' };
      },
    });

    await runner.execCommandViaLoginShell('node', ['script.js']);

    expect(calls).toEqual([{ command: 'node', args: ['script.js'] }]);
  });
});
