import { execFile, spawn } from 'node:child_process';

export interface BufferedCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  timeout?: number;
}

export interface BufferedCommandResult {
  ok: boolean;
  code?: string | number | null;
  stdout: string;
  stderr: string;
  error?: Error & { code?: string | number | null };
}

export interface PassthroughCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'ignore' | 'pipe' | Array<'inherit' | 'ignore' | 'pipe'>;
}

export interface PassthroughCommandResult {
  code: number | null;
  error?: Error;
}

export function execFileBuffered(
  command: string,
  args: readonly string[],
  options: BufferedCommandOptions = {},
): Promise<BufferedCommandResult> {
  return new Promise((resolve) => {
    execFile(command, [...args], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      ...options,
    }, (error, stdout, stderr) => {
      const result: BufferedCommandResult = {
        ok: !error,
        stdout: String(stdout ?? '').trim(),
        stderr: String(stderr ?? '').trim(),
      };
      if (error) {
        if (error.code !== undefined) result.code = error.code;
        result.error = error;
      }
      resolve(result);
    });
  });
}

export function spawnPassthrough(
  command: string,
  args: readonly string[],
  options: PassthroughCommandOptions = {},
): Promise<PassthroughCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: 'inherit', ...options });
    child.on('error', (error) => resolve({ code: 1, error }));
    child.on('close', (code) => resolve({ code }));
  });
}
