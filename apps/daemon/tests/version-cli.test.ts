import { describe, expect, it } from 'vitest';
import { runVersion, type VersionCliDeps } from '../src/version/cli.js';

describe('version CLI', () => {
  it('normalizes the daemon URL and preserves JSON output', async () => {
    const output: string[] = [];
    let requestedUrl = '';
    const deps: VersionCliDeps = {
      resolveDaemonUrl: async () => 'http://127.0.0.1:7456/',
      fetch: async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ version: '0.11.1' }), { status: 200 });
      },
      exitWithStructuredError: (failure) => { throw new Error(failure.message); },
      structuredHttpFailure: async () => { throw new Error('unexpected HTTP failure'); },
      writeStdout: (text) => output.push(text),
      log: () => undefined,
    };

    await runVersion(['--json'], deps);

    expect(requestedUrl).toBe('http://127.0.0.1:7456/api/version');
    expect(output).toEqual(['{\n  "version": "0.11.1"\n}\n']);
  });

  it('supports the nested version response used by older daemons', async () => {
    const logs: string[] = [];
    const deps: VersionCliDeps = {
      resolveDaemonUrl: async () => 'http://127.0.0.1:7456',
      fetch: async () => new Response(JSON.stringify({ version: { version: 'legacy' } }), { status: 200 }),
      exitWithStructuredError: (failure) => { throw new Error(failure.message); },
      structuredHttpFailure: async () => { throw new Error('unexpected HTTP failure'); },
      writeStdout: () => undefined,
      log: (text) => logs.push(text),
    };

    await runVersion([], deps);

    expect(logs).toEqual(['legacy']);
  });
});
