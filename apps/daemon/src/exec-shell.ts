// Buffered child-process exec + POSIX login-shell command helpers. Extracted
// from server.ts as another slice of the breakup (R6/W5): these have no
// daemon-closure dependencies (no db/app/req), only `execFile` and `process`.

import { execFile, type ExecFileOptions } from 'node:child_process';

export interface ExecBufferedResult {
  ok: boolean;
  code: string | number | undefined;
  stdout: string;
  stderr: string;
  error: (Error & { code?: string | number }) | null;
}

type ExecOpts = Partial<ExecFileOptions>;

export function execFileBuffered(
  command: string,
  args: readonly string[],
  opts: ExecOpts = {},
): Promise<ExecBufferedResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 120_000, maxBuffer: 1024 * 1024, ...opts },
      (error, stdout, stderr) => {
        const err = error as (Error & { code?: string | number }) | null;
        resolve({
          ok: !error,
          code: err?.code,
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
          error: err,
        });
      },
    );
  });
}

export function quotePosixShellArg(value: unknown): string {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function buildGhShellCommand(args: readonly string[]): string {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

export function buildCommandShellCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(quotePosixShellArg).join(' ');
}

export function buildLoginShellCommand(innerCommand: string): string {
  // Use a non-login shell and re-export PATH so test fakes and agent wrappers
  // remain visible; login shells often reset PATH from profile scripts.
  return `export PATH=${quotePosixShellArg(process.env.PATH ?? '')}; ${innerCommand}`;
}

export function execGhBuffered(args: readonly string[], opts: ExecOpts = {}): Promise<ExecBufferedResult> {
  if (process.platform === 'win32') return execFileBuffered('gh', args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
    ...opts,
  });
}

export function execCommandViaLoginShell(command: string, args: readonly string[], opts: ExecOpts = {}): Promise<ExecBufferedResult> {
  if (process.platform === 'win32') return execFileBuffered(command, args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildCommandShellCommand(command, args))], {
    env: process.env,
    ...opts,
  });
}
