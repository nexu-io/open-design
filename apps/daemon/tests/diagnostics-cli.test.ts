import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runDiagnostics, type DiagnosticsCliDeps } from '../src/diagnostics/cli.js';

class CliExit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

describe('diagnostics CLI', () => {
  it('writes the daemon bundle and reports its size in JSON mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-diagnostics-cli-'));
    const target = join(root, 'nested', 'support.zip');
    const output: string[] = [];
    const deps: DiagnosticsCliDeps = {
      resolveDaemonUrl: async () => 'http://127.0.0.1:7456/',
      fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      exitWithStructuredError: (failure) => { throw new Error(failure.message); },
      structuredHttpFailure: async () => { throw new Error('unexpected HTTP failure'); },
      writeStdout: (text) => output.push(text),
      writeStderr: () => undefined,
      log: () => undefined,
      exit: ((code: number): never => { throw new CliExit(code); }),
    };

    try {
      await runDiagnostics(['export', '--output', target, '--json'], deps);
      expect(await readFile(target)).toEqual(Buffer.from([1, 2, 3]));
      expect(output).toEqual([JSON.stringify({ path: target, sizeBytes: 3 }) + '\n']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('delegates daemon HTTP failures to the structured error boundary', async () => {
    let called = false;
    const deps: DiagnosticsCliDeps = {
      resolveDaemonUrl: async () => 'http://127.0.0.1:7456',
      fetch: async () => new Response('denied', { status: 403 }),
      exitWithStructuredError: (failure) => { throw new Error(failure.message); },
      structuredHttpFailure: async () => { called = true; throw new CliExit(4); },
      writeStdout: () => undefined,
      writeStderr: () => undefined,
      log: () => undefined,
      exit: ((code: number): never => { throw new CliExit(code); }),
    };

    await expect(runDiagnostics(['export'], deps)).rejects.toMatchObject({ code: 4 });
    expect(called).toBe(true);
  });
});
