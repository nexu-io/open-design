// `od tools directions` is called directly by agents following the slim
// prompt contract, so malformed invocations must fail fast (reviewer finding
// on #5603): a missing `--id` value used to fall through to the full-list
// output, and `--id --json` swallowed `--json` as the id — both exiting 0
// with unrelated output the agent would then act on.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

async function runDirections(args: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, 'tools', 'directions', ...args],
      { timeout: 30_000 },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('od tools directions flag validation', () => {
  it('resolves a valid --id (happy path stays intact)', async () => {
    const result = await runDirections(['--id', 'editorial-monocle']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('editorial-monocle');
  });

  it('fails fast when --id has no value instead of printing the full list', async () => {
    const result = await runDirections(['--id']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing value for --id');
    expect(result.stdout).toBe('');
  });

  it('rejects a flag posing as the --id value', async () => {
    const result = await runDirections(['--id', '--json']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing value for --id');
  });

  it('rejects duplicate --id flags', async () => {
    const result = await runDirections(['--id', 'a', '--id', 'b']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('duplicate --id');
  });

  it('rejects passing both --id and --label', async () => {
    const result = await runDirections(['--id', 'a', '--label', 'b']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('either --id or --label');
  });
});
