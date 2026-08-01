// @vitest-environment node

import { afterEach, describe, expect, test } from 'vitest';

import { toolsDevInvocation } from '@/tools-dev/cli';

// The harness composes an invocation whose Windows correctness lives in
// `@open-design/platform`. These tests stub `process.platform` both ways so the
// Windows shim path is exercised on every CI runner, not only on Windows —
// mirroring `packages/platform/tests/index.test.ts`.
const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value });
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
});

const WINDOWS_SHIM_ENV = {
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  npm_execpath: 'C:\\Users\\dev\\AppData\\Roaming\\npm\\pnpm.cmd',
} as NodeJS.ProcessEnv;

/** The single `"…"`-wrapped command line cmd.exe receives after `/d /s /c`. */
function innerCommandLine(args: string[]): string {
  expect(args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
  return args[3] ?? '';
}

describe('toolsDevInvocation', () => {
  test('puts the tools-dev subcommand ahead of the caller args', () => {
    setPlatform('linux');
    const invocation = toolsDevInvocation(['status', '--json'], {} as NodeJS.ProcessEnv);
    expect(invocation.args.slice(-3)).toEqual(['tools-dev', 'status', '--json']);
  });

  test('keeps a workspace path containing a space as one argument (#6191)', () => {
    // The original bug: `shell: true` concatenated argv without quoting, so
    // `C:\Dev\open design\.tmp\...` was re-split and tools-dev received
    // `design\.tmp\...` as a separate arg — `unsupported tools-dev app`.
    setPlatform('win32');
    const spacedPath = 'C:\\Dev\\open design\\.tmp\\tools-dev';
    const invocation = toolsDevInvocation(['logs', '--path', spacedPath], WINDOWS_SHIM_ENV);

    expect(invocation.command).toBe('C:\\Windows\\System32\\cmd.exe');
    // Node must not re-escape the line cmd.exe is handed.
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(innerCommandLine(invocation.args)).toContain(`"${spacedPath}"`);
  });

  test('breaks %var% pairs so cmd.exe cannot expand them into the command line', () => {
    // cmd.exe expands `%NAME%` even inside a double-quoted segment, so a
    // checkout under `C:\work\%USERNAME%\…` would otherwise reach tools-dev
    // with a live environment value substituted in.
    setPlatform('win32');
    const percentPath = 'C:\\work\\%USERNAME%\\open design';
    const invocation = toolsDevInvocation(['logs', '--path', percentPath], WINDOWS_SHIM_ENV);
    const inner = innerCommandLine(invocation.args);

    expect(inner).not.toContain('%USERNAME%');
    expect(inner).toContain('"^%"');
    // The name itself must survive — only the surrounding `%` are escaped.
    expect(inner).toContain('USERNAME');
  });

  test('runs a Node-loadable pnpm through process.execPath with no shim at all', () => {
    setPlatform('win32');
    const execPath = 'C:\\Dev\\open design\\node_modules\\pnpm\\bin\\pnpm.cjs';
    const invocation = toolsDevInvocation(['status'], { npm_execpath: execPath } as NodeJS.ProcessEnv);

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toEqual([execPath, 'tools-dev', 'status']);
    expect(invocation.windowsVerbatimArguments).toBeUndefined();
  });

  test('honors the OD_E2E_PNPM_COMMAND override ahead of npm_execpath', () => {
    setPlatform('linux');
    const invocation = toolsDevInvocation(['status'], {
      OD_E2E_PNPM_COMMAND: '/opt/pnpm/bin/pnpm',
      npm_execpath: '/ignored/pnpm.cjs',
    } as NodeJS.ProcessEnv);

    expect(invocation).toEqual({
      args: ['tools-dev', 'status'],
      command: '/opt/pnpm/bin/pnpm',
    });
  });
});
