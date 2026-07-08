import { execFile, type ExecFileOptions } from 'node:child_process';

export interface BufferedCommandResult {
  ok: boolean;
  code: string | number | null | undefined;
  stdout: string;
  stderr: string;
  error: Error | null;
}

export function execFileBuffered(
  command: string,
  args: readonly string[],
  opts: ExecFileOptions = {},
): Promise<BufferedCommandResult> {
  return new Promise((resolve) => {
    execFile(command, [...args], { timeout: 120_000, maxBuffer: 1024 * 1024, ...opts }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && 'code' in error ? error.code : undefined,
        stdout: String(stdout ?? '').trim(),
        stderr: String(stderr ?? '').trim(),
        error,
      });
    });
  });
}

function quotePosixShellArg(value: string | null | undefined): string {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function buildGhShellCommand(args: readonly string[]): string {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

function buildCommandShellCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(quotePosixShellArg).join(' ');
}

function buildLoginShellCommand(innerCommand: string): string {
  // Use a non-login shell and re-export PATH so test fakes and agent wrappers
  // remain visible; login shells often reset PATH from profile scripts.
  return `export PATH=${quotePosixShellArg(process.env.PATH)}; ${innerCommand}`;
}

export function execGhBuffered(
  args: readonly string[],
  opts: ExecFileOptions = {},
): Promise<BufferedCommandResult> {
  if (process.platform === 'win32') return execFileBuffered('gh', args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
    ...opts,
  });
}

export function execCommandViaLoginShell(
  command: string,
  args: readonly string[],
  opts: ExecFileOptions = {},
): Promise<BufferedCommandResult> {
  if (process.platform === 'win32') return execFileBuffered(command, args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildCommandShellCommand(command, args))], {
    env: process.env,
    ...opts,
  });
}
