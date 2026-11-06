import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Capture spawn options without launching anything. The child emits `spawn` on
// the next tick so launchHostTool resolves { ok: true }.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = () => {};
      setImmediate(() => child.emit('spawn'));
      return child;
    }),
  };
});

import { spawn } from 'node:child_process';
import { launchHostTool } from '../src/routes/host-tools.js';

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

// Regression: launchHostTool used `spawn(command, args, { shell: process.platform === 'win32' })`.
// On Windows that runs the launch through cmd.exe, which shell-interprets the
// args — one of which is the (project-derived) directory path — so a path with
// cmd metacharacters (`&`, `|`, `^`, `>`) could inject commands. The fix routes
// through `createCommandInvocation` (no shell; .cmd/.bat via cmd.exe with
// verbatim, CommandLineToArgvW-safe args).
describe('launchHostTool does not launch through a shell', () => {
  const origPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    vi.clearAllMocks();
  });

  it('never passes shell:true for a Windows .cmd editor (no command injection via the dir arg)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = await launchHostTool('C:\\tools\\code.cmd', ['C:\\Users\\me\\proj & calc.exe']);
    expect(result).toEqual({ ok: true });

    const opts = spawnMock.mock.calls[0]?.[2] ?? {};
    // The vulnerable version set `shell: true` here.
    expect(opts.shell).not.toBe(true);
    // Routed through createCommandInvocation: a .cmd runs via cmd.exe with
    // verbatim args (Node must not re-quote them), never a raw shell line.
    expect(opts.windowsVerbatimArguments).toBe(true);
  });

  it('spawns a non-Windows launch without a shell and passes the dir as a literal arg', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const dir = '/home/me/proj & rm -rf ~';
    const result = await launchHostTool('/usr/bin/code', [dir]);
    expect(result).toEqual({ ok: true });

    const [, args, opts] = spawnMock.mock.calls[0]!;
    expect(opts.shell).toBeFalsy();
    // No shell → the metacharacter-laden path is one argv element, inert.
    expect(args).toContain(dir);
  });
});
