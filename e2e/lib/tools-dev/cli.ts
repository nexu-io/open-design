import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createCommandInvocation, createPackageManagerInvocation } from '@open-design/platform';
import type { CommandInvocation } from '@open-design/platform';

import type { ToolsDevSuiteSpec } from './types.ts';

const execFileAsync = promisify(execFile);

export type RunToolsDevJsonOptions = {
  timeoutMs?: number;
};

/**
 * Build the invocation that runs `pnpm tools-dev <args>` for a suite.
 *
 * Windows resolves `pnpm` to a `.cmd` shim, which cannot be spawned directly.
 * The tempting fix is `shell: true`, but `execFile` then concatenates argv into
 * one command line without quoting anything, so a workspace checked out to a
 * path containing a space (`C:\Dev\open design\...`) is re-split and reaches
 * tools-dev as two arguments — failing with `unsupported tools-dev app:
 * design\.tmp\...` and taking the whole e2e suite down.
 *
 * Quoting that by hand here is a trap: cmd.exe wants doubled quotes rather than
 * `\"`, it needs `windowsVerbatimArguments` so Node does not re-escape the line,
 * and it expands `%NAME%` *inside* double quotes — so a path like
 * `C:\work\%USERNAME%\open design` would have an environment value substituted
 * in before tools-dev ever saw it. `@open-design/platform` already owns all
 * three rules, and is what every `runPnpm` helper in `tools/pack` goes through.
 * Use it here too instead of keeping a second, weaker copy.
 *
 * `OD_E2E_PNPM_COMMAND` overrides the package-manager discovery. On Windows it
 * must name something spawnable — a `.cmd`/`.bat` shim (wrapped for you) or an
 * absolute path — because no shell is involved any more.
 *
 * Exported so the composition can be pinned without spawning a process.
 */
export function toolsDevInvocation(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CommandInvocation {
  const commandArgs = ['tools-dev', ...args];
  const override = env.OD_E2E_PNPM_COMMAND;
  return override == null
    ? createPackageManagerInvocation(commandArgs, env)
    : createCommandInvocation({ args: commandArgs, command: override, env });
}

export async function runToolsDevJson<T>(
  workspaceRoot: string,
  suite: ToolsDevSuiteSpec,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
  options: RunToolsDevJsonOptions = {},
): Promise<T> {
  const invocation = toolsDevInvocation(args);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...extraEnv,
      CODEX_HOME: suite.codexHomeDir,
      OD_DATA_DIR: suite.dataDir,
      OD_MEDIA_CONFIG_DIR: suite.dataDir,
    },
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeoutMs,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  return parseJsonOutput<T>(stdout);
}

export function isToolsDevPortConflict(error: unknown): boolean {
  const text = error instanceof Error
    ? `${error.message}\n${error.stack ?? ''}`
    : String(error);
  return text.includes('EADDRINUSE') ||
    (text.includes('is already running in namespace') && text.includes('stop it or choose another namespace'));
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T;
  }
  const objectStart = stdout.lastIndexOf('\n{');
  const arrayStart = stdout.lastIndexOf('\n[');
  const jsonStart = Math.max(objectStart, arrayStart);
  if (jsonStart < 0) {
    throw new Error(`Expected JSON output from tools-dev, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart + 1)) as T;
}
