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

// Regression: launchHostTool passed `windowsHide: true` for every host tool on
// Windows. Node maps windowsHide to STARTUPINFO/SW_HIDE, so launching the GUI
// explorer.exe created a hidden Explorer window instead of opening it. Only
// console shims (.cmd/.bat, which createCommandInvocation runs through cmd.exe)
// may be hidden; a directly spawned .exe is a GUI launcher and must stay visible.
describe('launchHostTool Windows window visibility', () => {
  const origPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    vi.clearAllMocks();
  });

  it('does not hide the window for a Windows GUI launcher (.exe)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = await launchHostTool('C:\\Windows\\explorer.exe', ['C:\\projects\\demo']);

    expect(result).toEqual({ ok: true });
    const opts = spawnMock.mock.calls[0]?.[2] ?? {};
    expect(opts.windowsHide).not.toBe(true);
  });

  it('still hides the console window for a Windows .cmd shim', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = await launchHostTool('C:\\tools\\code.cmd', ['C:\\projects\\demo']);

    expect(result).toEqual({ ok: true });
    const [command, , opts] = spawnMock.mock.calls[0]!;
    // createCommandInvocation rewrites .cmd/.bat to cmd.exe; hide that console.
    expect(command.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(opts.windowsHide).toBe(true);
  });

  it('does not pass windowsHide on non-Windows platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const result = await launchHostTool('/usr/bin/code', ['/home/me/project']);

    expect(result).toEqual({ ok: true });
    const opts = spawnMock.mock.calls[0]?.[2] ?? {};
    expect(opts.windowsHide).not.toBe(true);
  });
});
